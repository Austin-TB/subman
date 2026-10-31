import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/lib/db";
import { resetPasswordEmail, setPasswordEmail } from "@/lib/email-templates";
import { sendEmail } from "@/lib/mailer";
import { passwordSchema, PASSWORD_MIN_LENGTH } from "@/lib/schemas/auth";

// Reset and set-password links work once and expire after this long.
const RESET_LINK_TTL_SECONDS = 60 * 60;
const RESET_LINK_TTL_TEXT = "1 hour";

// Endpoints that take a new password, and the body field that holds it.
// Each is checked against the password policy again here, so the API can't be called around the forms.
const PASSWORD_FIELD: Record<string, string> = {
  "/sign-up/email": "password",
  "/reset-password": "newPassword",
  "/change-password": "newPassword",
  "/set-password": "newPassword",
};

export const auth = betterAuth({
  database: prismaAdapter(db, { provider: "postgresql", transaction: true }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: PASSWORD_MIN_LENGTH,
    resetPasswordTokenExpiresIn: RESET_LINK_TTL_SECONDS,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      // Staff added by an admin have no password yet; for them the same link sets the first one.
      const hasPassword = !!(await db.account.findFirst({
        where: { userId: user.id, providerId: "credential" },
        select: { id: true },
      }));
      const template = hasPassword ? resetPasswordEmail : setPasswordEmail;
      await sendEmail({ to: user.email, ...template({ name: user.name, url, expiresIn: RESET_LINK_TTL_TEXT }) });
    },
  },
  user: {
    // None of these can be set by the client: a sign-up always creates an active CUSTOMER.
    additionalFields: {
      role: { type: "string", input: false, defaultValue: "CUSTOMER" },
      active: { type: "boolean", input: false, defaultValue: true },
      customerId: { type: "string", input: false, required: false },
    },
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      const field = PASSWORD_FIELD[ctx.path];
      if (!field) return;
      const result = passwordSchema.safeParse((ctx.body as Record<string, unknown> | undefined)?.[field]);
      if (!result.success) {
        throw APIError.from("BAD_REQUEST", {
          code: "PASSWORD_POLICY",
          message: result.error.issues.map((i) => i.message).join(". "),
        });
      }
    }),
  },
  databaseHooks: {
    user: {
      create: {
        // Every sign-up is a customer, so give it the Customer record that subscriptions hang off.
        before: async (user) => {
          const role = (user as { role?: string }).role;
          if (role && role !== "CUSTOMER") return;
          const customer = await db.customer.create({ data: { name: user.name, email: user.email } });
          return { data: { customerId: customer.id } };
        },
      },
    },
    session: {
      create: {
        // Runs after the password has been checked, so the message doesn't reveal whether an account exists.
        before: async (session) => {
          const user = await db.user.findUnique({ where: { id: session.userId }, select: { active: true } });
          if (user && !user.active) {
            throw APIError.from("FORBIDDEN", {
              code: "ACCOUNT_DEACTIVATED",
              message: "This account has been deactivated. Contact an administrator.",
            });
          }
        },
      },
    },
  },
  rateLimit: { enabled: true, window: 60, max: 100 },
  plugins: [nextCookies()],
});
