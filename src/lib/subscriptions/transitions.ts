// The subscription lifecycle (PLAN.md §4.1): one table of what can happen, and pure functions that say
// whether it can happen right now. The staff screens, the portal and the billing run all ask this module,
// and the server asks it again before every write (service.ts), so a hidden button is never the only check.
import { addDays, addMonthsClamped, daysBetween, formatDate, toISODate } from "@/lib/dates";
import { planAvailability } from "@/lib/plans";

export type SubscriptionStatus = "DRAFT" | "QUOTATION" | "CONFIRMED" | "ACTIVE" | "PAUSED" | "CLOSED";

export type SubAction =
  | "SEND_QUOTATION"
  | "EDIT"
  | "CONFIRM"
  | "ACTIVATE"
  | "PAUSE"
  | "RESUME"
  | "RENEW"
  | "CLOSE"
  | "AUTO_CLOSE"
  | "CANCEL";

/** "system" is the billing run (and Confirm, which activates a subscription that has already started). */
export type ActorKind = "staff" | "customer" | "system";

type Rule = { label: string; from: SubscriptionStatus[]; to: SubscriptionStatus; actors: ActorKind[] };

export const TRANSITIONS: Record<SubAction, Rule> = {
  SEND_QUOTATION: { label: "Send quotation", from: ["DRAFT"], to: "QUOTATION", actors: ["staff"] },
  EDIT: { label: "Edit", from: ["QUOTATION"], to: "DRAFT", actors: ["staff"] },
  CONFIRM: { label: "Confirm", from: ["DRAFT", "QUOTATION"], to: "CONFIRMED", actors: ["staff"] },
  ACTIVATE: { label: "Activate", from: ["CONFIRMED"], to: "ACTIVE", actors: ["system"] },
  PAUSE: { label: "Pause", from: ["ACTIVE"], to: "PAUSED", actors: ["staff", "customer"] },
  RESUME: { label: "Resume", from: ["PAUSED"], to: "ACTIVE", actors: ["staff", "customer"] },
  RENEW: { label: "Renew", from: ["ACTIVE"], to: "ACTIVE", actors: ["staff", "customer"] },
  CLOSE: { label: "Close", from: ["ACTIVE", "PAUSED"], to: "CLOSED", actors: ["staff", "customer"] },
  AUTO_CLOSE: { label: "Close at expiry", from: ["ACTIVE", "PAUSED"], to: "CLOSED", actors: ["system"] },
  CANCEL: { label: "Cancel", from: ["DRAFT", "QUOTATION"], to: "CLOSED", actors: ["staff"] },
};

/** The actions a person can take, in the order their buttons appear. ACTIVATE and AUTO_CLOSE belong to the system. */
export const USER_ACTIONS: SubAction[] = [
  "SEND_QUOTATION",
  "CONFIRM",
  "EDIT",
  "PAUSE",
  "RESUME",
  "RENEW",
  "CLOSE",
  "CANCEL",
];

/** Actions that need a reason typed in: Cancel must have one, Close may. */
export const REASON: Partial<Record<SubAction, "required" | "optional">> = { CANCEL: "required", CLOSE: "optional" };

export type SubscriptionFacts = {
  status: SubscriptionStatus;
  startDate: Date;
  expiryDate: Date | null;
  validUntil: Date | null;
  lineCount: number;
  /** Quantity on the plan's own line, or null when there isn't one. */
  planLineQuantity: number | null;
};

/** The facts the rules need, taken from a subscription loaded with its lines. */
export function factsOf(sub: {
  status: SubscriptionStatus;
  startDate: Date;
  expiryDate: Date | null;
  validUntil: Date | null;
  lines: { isPlanLine: boolean; quantity: number }[];
}): SubscriptionFacts {
  return {
    status: sub.status,
    startDate: sub.startDate,
    expiryDate: sub.expiryDate,
    validUntil: sub.validUntil,
    lineCount: sub.lines.length,
    planLineQuantity: sub.lines.find((l) => l.isPlanLine)?.quantity ?? null,
  };
}

export type PlanFacts = {
  name: string;
  minQuantity: number;
  active: boolean;
  availableFrom: Date;
  availableUntil: Date | null;
  autoClose: boolean;
  closable: boolean;
  pausable: boolean;
  renewable: boolean;
};

/**
 * `hidden`: the action doesn't apply here at all (wrong status, wrong person, or the plan doesn't allow it),
 * so no button is shown. Otherwise it is on offer but something in the data stops it, and `reason` says what.
 */
export type Verdict = { ok: true; to: SubscriptionStatus } | { ok: false; reason: string; hidden: boolean };

const no = (reason: string, hidden = false): Verdict => ({ ok: false, reason, hidden });

/** Past its expiry date. The expiry day itself still counts as running. */
export const isExpired = (sub: Pick<SubscriptionFacts, "expiryDate">, today: Date) =>
  sub.expiryDate != null && sub.expiryDate < today;

const STATUS_LABEL: Record<SubscriptionStatus, string> = {
  DRAFT: "a draft",
  QUOTATION: "a quotation",
  CONFIRMED: "confirmed",
  ACTIVE: "active",
  PAUSED: "paused",
  CLOSED: "closed",
};

function planReason(plan: PlanFacts, start: Date): string | null {
  switch (planAvailability(plan, start)) {
    case "AVAILABLE":
      return null;
    case "INACTIVE":
      return `${plan.name} has been switched off. Choose another plan.`;
    case "SCHEDULED":
      return `${plan.name} isn't available until ${formatDate(plan.availableFrom)}. Choose another plan or a later start date.`;
    case "ENDED":
      return `${plan.name} was only available until ${formatDate(plan.availableUntil)}. Choose another plan or an earlier start date.`;
  }
}

/** The guards both Send quotation and Confirm share: there is something to bill, and the plan's minimum is met. */
function linesReason(sub: SubscriptionFacts, plan: PlanFacts): string | null {
  if (sub.lineCount === 0 || sub.planLineQuantity == null) return "Add at least one line first.";
  if (sub.planLineQuantity < plan.minQuantity) return `${plan.name} needs a quantity of at least ${plan.minQuantity}.`;
  return null;
}

/** Whether `actor` can do `action` to this subscription on business date `today`, and where it leads. */
export function checkTransition(
  action: SubAction,
  sub: SubscriptionFacts,
  plan: PlanFacts,
  actor: ActorKind,
  today: Date,
): Verdict {
  const rule = TRANSITIONS[action];
  if (!rule.actors.includes(actor)) return no("You can't do this.", true);
  if (!rule.from.includes(sub.status)) return no(`This subscription is ${STATUS_LABEL[sub.status]}, so it can't be done now.`, true);

  // What the plan allows applies to everyone, staff included.
  switch (action) {
    case "PAUSE":
      if (!plan.pausable) return no(`${plan.name} can't be paused.`, true);
      break;
    case "RENEW":
      if (!plan.renewable) return no(`${plan.name} can't be renewed.`, true);
      if (!sub.expiryDate) return no("There is no expiry date to extend.", true);
      break;
    case "CLOSE":
      // A subscription past its expiry can always be closed: "Expired: renew or close" must have a way out.
      if (!plan.closable && !isExpired(sub, today)) return no(`${plan.name} can't be closed early.`, true);
      break;
    case "AUTO_CLOSE":
      if (!plan.autoClose || !isExpired(sub, today)) return no("It isn't due to close yet.", true);
      break;
  }

  // Guards on the data. These actions are on offer, and something has to be fixed first.
  switch (action) {
    case "SEND_QUOTATION": {
      const reason = linesReason(sub, plan);
      if (reason) return no(reason);
      break;
    }
    case "CONFIRM": {
      if (sub.validUntil && sub.validUntil < today) {
        return no(
          `This quotation expired on ${formatDate(sub.validUntil)}. Send it again to give it a new validity before confirming.`,
        );
      }
      const reason = linesReason(sub, plan) ?? planReason(plan, sub.startDate);
      if (reason) return no(reason);
      break;
    }
    case "ACTIVATE":
      if (sub.startDate > today) return no(`It starts on ${formatDate(sub.startDate)}.`, true);
      break;
  }

  return { ok: true, to: rule.to };
}

export type OfferedAction = { action: SubAction; label: string; blocked: string | null };

/** The buttons to show: every action that applies, with the reason it can't run yet if something is in the way. */
export function offeredActions(
  sub: SubscriptionFacts,
  plan: PlanFacts,
  actor: ActorKind,
  today: Date,
): OfferedAction[] {
  const out: OfferedAction[] = [];
  for (const action of USER_ACTIONS) {
    const v = checkTransition(action, sub, plan, actor, today);
    if (v.ok) out.push({ action, label: TRANSITIONS[action].label, blocked: null });
    else if (!v.hidden) out.push({ action, label: TRANSITIONS[action].label, blocked: v.reason });
  }
  return out;
}

// ───────────── Renewal ─────────────

type Term = { months: number } | { days: number };

/** The length of the original term: whole months when it is exactly that (1 Jan → 1 Jan next year), else days. */
export function termBetween(start: Date, expiry: Date): Term {
  const months =
    (expiry.getUTCFullYear() - start.getUTCFullYear()) * 12 + (expiry.getUTCMonth() - start.getUTCMonth());
  if (months > 0 && toISODate(addMonthsClamped(start, months)) === toISODate(expiry)) return { months };
  return { days: Math.max(daysBetween(start, expiry), 1) };
}

const shift = (start: Date, term: Term, times: number) =>
  "months" in term ? addMonthsClamped(start, term.months * times) : addDays(start, term.days * times);

/**
 * The expiry after a renewal: the next end of a whole term, counted from the start date, that is later than the
 * current expiry and not already in the past. Counting from the start keeps month-ends from drifting
 * (31 Jan, 28 Feb, 31 Mar), and renewing twice adds the original term twice, not double.
 */
export function renewedExpiry(args: { start: Date; initialExpiry: Date; expiry: Date; today: Date }): Date {
  const term = termBetween(args.start, args.initialExpiry);
  for (let times = 1; times < 100_000; times++) {
    const next = shift(args.start, term, times);
    if (next > args.expiry && next >= args.today) return next;
  }
  throw new Error("Could not work out a renewal date");
}

/** The default expiry for a new subscription: one year after the start. */
export const defaultExpiry = (start: Date) => addMonthsClamped(start, 12);
