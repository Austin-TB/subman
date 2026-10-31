import { describe, expect, it } from "vitest";
import { parseDate } from "@/lib/dates";
import {
  checkTransition,
  defaultExpiry,
  isExpired,
  offeredActions,
  renewedExpiry,
  termBetween,
  type PlanFacts,
  type SubAction,
  type SubscriptionFacts,
} from "@/lib/subscriptions/transitions";

const d = parseDate;
const today = d("2026-10-31");

const plan = (over: Partial<PlanFacts> = {}): PlanFacts => ({
  name: "Business Monthly",
  minQuantity: 5,
  active: true,
  availableFrom: d("2026-01-01"),
  availableUntil: null,
  autoClose: false,
  closable: true,
  pausable: false,
  renewable: false,
  ...over,
});

const sub = (over: Partial<SubscriptionFacts> = {}): SubscriptionFacts => ({
  status: "DRAFT",
  startDate: d("2026-11-01"),
  expiryDate: d("2027-11-01"),
  validUntil: null,
  lineCount: 2,
  planLineQuantity: 5,
  ...over,
});

const names = (s: SubscriptionFacts, p: PlanFacts, actor: "staff" | "customer" | "system" = "staff") =>
  offeredActions(s, p, actor, today).map((a) => a.action);

const verdict = (action: SubAction, s: SubscriptionFacts, p = plan(), actor: "staff" | "customer" | "system" = "staff") =>
  checkTransition(action, s, p, actor, today);

describe("which actions each status offers", () => {
  it("a draft can be sent, confirmed or cancelled", () => {
    expect(names(sub(), plan())).toEqual(["SEND_QUOTATION", "CONFIRM", "CANCEL"]);
  });

  it("a quotation can be confirmed, edited or cancelled, but not sent again", () => {
    expect(names(sub({ status: "QUOTATION" }), plan())).toEqual(["CONFIRM", "EDIT", "CANCEL"]);
  });

  it("a confirmed subscription has nothing to do until it starts", () => {
    expect(names(sub({ status: "CONFIRMED" }), plan({ pausable: true, renewable: true }))).toEqual([]);
  });

  it("a closed subscription offers nothing", () => {
    expect(names(sub({ status: "CLOSED" }), plan({ pausable: true, renewable: true }))).toEqual([]);
  });

  it("an active subscription offers only what its plan allows", () => {
    expect(names(sub({ status: "ACTIVE" }), plan())).toEqual(["CLOSE"]);
    expect(names(sub({ status: "ACTIVE" }), plan({ pausable: true, renewable: true }))).toEqual(["PAUSE", "RENEW", "CLOSE"]);
    expect(names(sub({ status: "ACTIVE" }), plan({ closable: false }))).toEqual([]);
  });

  it("a paused subscription can be resumed or closed", () => {
    expect(names(sub({ status: "PAUSED" }), plan({ pausable: true }))).toEqual(["RESUME", "CLOSE"]);
  });

  it("resuming does not depend on the plan still being pausable, so nothing gets stuck", () => {
    expect(names(sub({ status: "PAUSED" }), plan({ pausable: false }))).toContain("RESUME");
  });
});

describe("plan flags apply to staff and customers alike", () => {
  const active = sub({ status: "ACTIVE" });

  it.each(["staff", "customer"] as const)("%s cannot pause a plan that isn't pausable", (actor) => {
    expect(verdict("PAUSE", active, plan({ pausable: false }), actor)).toMatchObject({ ok: false, hidden: true });
    expect(verdict("PAUSE", active, plan({ pausable: true }), actor)).toMatchObject({ ok: true, to: "PAUSED" });
  });

  it.each(["staff", "customer"] as const)("%s cannot close a plan that isn't closable", (actor) => {
    expect(verdict("CLOSE", active, plan({ closable: false }), actor)).toMatchObject({ ok: false, hidden: true });
    expect(verdict("CLOSE", active, plan({ closable: true }), actor)).toMatchObject({ ok: true, to: "CLOSED" });
  });

  it("a plan that can't be closed early can still be closed once it has expired", () => {
    const expired = sub({ status: "ACTIVE", expiryDate: d("2026-10-30") });
    expect(verdict("CLOSE", expired, plan({ closable: false }))).toMatchObject({ ok: true });
  });

  it("renewing needs a renewable plan and an expiry date to extend", () => {
    expect(verdict("RENEW", active, plan({ renewable: false }))).toMatchObject({ ok: false, hidden: true });
    expect(verdict("RENEW", sub({ status: "ACTIVE", expiryDate: null }), plan({ renewable: true }))).toMatchObject({
      ok: false,
      hidden: true,
    });
    expect(verdict("RENEW", active, plan({ renewable: true }))).toMatchObject({ ok: true, to: "ACTIVE" });
  });
});

describe("who can do what", () => {
  it("customers can pause, resume, renew and close, but nothing on the sales side", () => {
    const p = plan({ pausable: true, renewable: true });
    expect(names(sub({ status: "ACTIVE" }), p, "customer")).toEqual(["PAUSE", "RENEW", "CLOSE"]);
    expect(names(sub({ status: "PAUSED" }), p, "customer")).toEqual(["RESUME", "CLOSE"]);
    expect(names(sub({ status: "DRAFT" }), p, "customer")).toEqual([]);
    expect(names(sub({ status: "QUOTATION" }), p, "customer")).toEqual([]);
  });

  it("only the system activates and auto-closes", () => {
    const confirmed = sub({ status: "CONFIRMED", startDate: d("2026-10-01") });
    expect(verdict("ACTIVATE", confirmed, plan(), "staff")).toMatchObject({ ok: false, hidden: true });
    expect(verdict("ACTIVATE", confirmed, plan(), "customer")).toMatchObject({ ok: false, hidden: true });
    expect(verdict("ACTIVATE", confirmed, plan(), "system")).toMatchObject({ ok: true, to: "ACTIVE" });

    const expired = sub({ status: "ACTIVE", expiryDate: d("2026-10-01") });
    expect(verdict("AUTO_CLOSE", expired, plan({ autoClose: true }), "staff")).toMatchObject({ ok: false, hidden: true });
    expect(verdict("AUTO_CLOSE", expired, plan({ autoClose: true }), "system")).toMatchObject({ ok: true, to: "CLOSED" });
  });

  it("activation waits for the start date", () => {
    expect(verdict("ACTIVATE", sub({ status: "CONFIRMED", startDate: d("2026-11-01") }), plan(), "system")).toMatchObject({
      ok: false,
    });
    expect(verdict("ACTIVATE", sub({ status: "CONFIRMED", startDate: today }), plan(), "system")).toMatchObject({ ok: true });
  });

  it("auto-close needs the plan flag and an expiry in the past", () => {
    const expired = sub({ status: "ACTIVE", expiryDate: d("2026-10-30") });
    expect(verdict("AUTO_CLOSE", expired, plan({ autoClose: false }), "system")).toMatchObject({ ok: false });
    expect(verdict("AUTO_CLOSE", sub({ status: "ACTIVE", expiryDate: today }), plan({ autoClose: true }), "system")).toMatchObject({
      ok: false,
    });
    expect(verdict("AUTO_CLOSE", sub({ status: "PAUSED", expiryDate: d("2026-10-30") }), plan({ autoClose: true }), "system")).toMatchObject({
      ok: true,
    });
  });
});

describe("guards on confirming", () => {
  it("an expired quotation can't be confirmed, and says how to fix it", () => {
    const v = verdict("CONFIRM", sub({ status: "QUOTATION", validUntil: d("2026-10-30") }));
    expect(v).toMatchObject({ ok: false, hidden: false });
    expect(v.ok === false && v.reason).toMatch(/expired on 30 Oct 2026/);
  });

  it("a quotation is still good on its last day", () => {
    expect(verdict("CONFIRM", sub({ status: "QUOTATION", validUntil: today }))).toMatchObject({ ok: true, to: "CONFIRMED" });
  });

  it("a draft with no validity date can be confirmed", () => {
    expect(verdict("CONFIRM", sub({ validUntil: null }))).toMatchObject({ ok: true });
  });

  it("a plan line can't be below the plan's minimum", () => {
    for (const action of ["SEND_QUOTATION", "CONFIRM"] as const) {
      const v = verdict(action, sub({ planLineQuantity: 4 }));
      expect(v).toMatchObject({ ok: false, hidden: false });
      expect(v.ok === false && v.reason).toMatch(/at least 5/);
    }
    expect(verdict("CONFIRM", sub({ planLineQuantity: 5 }))).toMatchObject({ ok: true });
  });

  it("needs at least one line", () => {
    expect(verdict("SEND_QUOTATION", sub({ lineCount: 0, planLineQuantity: null }))).toMatchObject({ ok: false, hidden: false });
    expect(verdict("CONFIRM", sub({ lineCount: 0, planLineQuantity: null }))).toMatchObject({ ok: false, hidden: false });
  });

  it("a plan must be available on the start date", () => {
    const scheduled = plan({ availableFrom: d("2026-12-01") });
    const ended = plan({ availableUntil: d("2026-10-31") });
    const off = plan({ active: false });
    expect(verdict("CONFIRM", sub({ startDate: d("2026-11-01") }), scheduled)).toMatchObject({ ok: false });
    expect(verdict("CONFIRM", sub({ startDate: d("2026-11-01") }), ended)).toMatchObject({ ok: false });
    expect(verdict("CONFIRM", sub({ startDate: d("2026-11-01") }), off)).toMatchObject({ ok: false });
    // The same plans are fine when the subscription starts inside their dates.
    expect(verdict("CONFIRM", sub({ startDate: d("2026-12-01") }), scheduled)).toMatchObject({ ok: true });
    expect(verdict("CONFIRM", sub({ startDate: d("2026-10-31") }), ended)).toMatchObject({ ok: true });
  });

  it("a blocked action is still shown, with its reason", () => {
    const offered = offeredActions(sub({ status: "QUOTATION", validUntil: d("2026-10-30") }), plan(), "staff", today);
    const confirm = offered.find((a) => a.action === "CONFIRM");
    expect(confirm?.blocked).toMatch(/expired/);
    expect(offered.find((a) => a.action === "EDIT")?.blocked).toBeNull();
  });
});

describe("expiry", () => {
  it("is past the expiry date, not on it", () => {
    expect(isExpired({ expiryDate: d("2026-10-30") }, today)).toBe(true);
    expect(isExpired({ expiryDate: today }, today)).toBe(false);
    expect(isExpired({ expiryDate: null }, today)).toBe(false);
  });

  it("defaults to one year after the start", () => {
    expect(defaultExpiry(d("2026-11-01"))).toEqual(d("2027-11-01"));
    expect(defaultExpiry(d("2028-02-29"))).toEqual(d("2029-02-28"));
  });
});

describe("renewal", () => {
  it("reads a whole number of months as a term in months, anything else as days", () => {
    expect(termBetween(d("2026-01-01"), d("2027-01-01"))).toEqual({ months: 12 });
    expect(termBetween(d("2026-01-31"), d("2026-02-28"))).toEqual({ months: 1 });
    expect(termBetween(d("2026-01-01"), d("2026-02-15"))).toEqual({ days: 45 });
  });

  it("extends by the original term", () => {
    const next = renewedExpiry({ start: d("2026-01-01"), initialExpiry: d("2027-01-01"), expiry: d("2027-01-01"), today });
    expect(next).toEqual(d("2028-01-01"));
  });

  it("renewing twice adds the original term twice, not double", () => {
    const args = { start: d("2026-01-01"), initialExpiry: d("2027-01-01"), today: d("2026-06-01") };
    const first = renewedExpiry({ ...args, expiry: d("2027-01-01") });
    const second = renewedExpiry({ ...args, expiry: first });
    expect(first).toEqual(d("2028-01-01"));
    expect(second).toEqual(d("2029-01-01"));
  });

  it("keeps the day of the month after a short month", () => {
    const args = { start: d("2026-01-31"), initialExpiry: d("2026-02-28"), today: d("2026-01-01") };
    const first = renewedExpiry({ ...args, expiry: d("2026-02-28") });
    expect(first).toEqual(d("2026-03-31"));
    expect(renewedExpiry({ ...args, expiry: first })).toEqual(d("2026-04-30"));
  });

  it("renews a long-expired subscription into the future, not into the past", () => {
    const next = renewedExpiry({
      start: d("2023-01-01"),
      initialExpiry: d("2024-01-01"),
      expiry: d("2024-01-01"),
      today: d("2026-10-31"),
    });
    expect(next).toEqual(d("2027-01-01"));
  });

  it("works for terms that aren't whole months", () => {
    const next = renewedExpiry({ start: d("2026-01-01"), initialExpiry: d("2026-01-11"), expiry: d("2026-01-11"), today });
    expect(next).toEqual(d("2026-11-07")); // 10-day terms from 1 Jan: the first one ending on or after 31 Oct is day 310
  });
});
