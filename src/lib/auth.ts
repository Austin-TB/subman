import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/lib/db";

// Phase 0: base config so sessions and role guards work.
// Phase 1 adds the password policy hook, reset emails and sign-up → Customer.
export const auth = betterAuth({
  database: prismaAdapter(db, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 9,
    resetPasswordTokenExpiresIn: 60 * 60,
    revokeSessionsOnPasswordReset: true,
  },
  user: {
    additionalFields: {
      role: { type: "string", input: false, defaultValue: "CUSTOMER" },
      active: { type: "boolean", input: false, defaultValue: true },
      customerId: { type: "string", input: false, required: false },
    },
  },
  rateLimit: { enabled: true, window: 60, max: 100 },
  plugins: [nextCookies()],
});
