import { z } from "zod";

// One password policy for sign-up, reset and change-password. The Better Auth hook in
// src/lib/auth.ts checks it again on the server, so calling the API directly can't skip it.
// The spec says "more than eight characters", hence 9.
export const PASSWORD_MIN_LENGTH = 9;
export const PASSWORD_MAX_LENGTH = 128; // Better Auth's own limit

/** Each rule has a short label for the checklist and a full sentence for error messages. */
export const PASSWORD_RULES = [
  {
    id: "length",
    label: `At least ${PASSWORD_MIN_LENGTH} characters`,
    message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters`,
    test: (p: string) => p.length >= PASSWORD_MIN_LENGTH,
  },
  {
    id: "upper",
    label: "An uppercase letter",
    message: "Password needs an uppercase letter",
    test: (p: string) => /\p{Lu}/u.test(p),
  },
  {
    id: "lower",
    label: "A lowercase letter",
    message: "Password needs a lowercase letter",
    test: (p: string) => /\p{Ll}/u.test(p),
  },
  {
    id: "special",
    label: "A special character, like ! @ # $ %",
    message: "Password needs a special character (for example ! @ # $ %)",
    // Anything that isn't a letter, digit or whitespace.
    test: (p: string) => /[^\p{L}\p{N}\s]/u.test(p),
  },
];

// Zod keeps running the remaining checks after one fails, so a weak password reports every missing rule.
export const passwordSchema = PASSWORD_RULES.reduce(
  (schema, rule) => schema.refine(rule.test, { error: rule.message }),
  z
    .string({ error: "Enter a password" })
    .max(PASSWORD_MAX_LENGTH, `Password can be at most ${PASSWORD_MAX_LENGTH} characters`),
);

// Emails are trimmed and lowercased, matching the unique index on User.email.
export const emailSchema = z
  .string()
  .trim()
  .min(1, "Enter your email address")
  .toLowerCase()
  .pipe(z.email("Enter a valid email address"));

export const nameSchema = z.string().trim().min(2, "Enter your full name").max(100, "Name is too long");

export const signUpSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
});

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z
  .object({ password: passwordSchema, confirmPassword: z.string() })
  .refine((d) => d.password === d.confirmPassword, { path: ["confirmPassword"], error: "Passwords don't match" });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password"),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, { path: ["confirmPassword"], error: "Passwords don't match" });

// Admin › Users › Add staff. The new person sets their own password from an emailed link.
export const addStaffSchema = z.object({ name: nameSchema, email: emailSchema });

export type SignUpValues = z.infer<typeof signUpSchema>;
export type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordValues = z.infer<typeof resetPasswordSchema>;
export type ChangePasswordValues = z.infer<typeof changePasswordSchema>;
export type AddStaffValues = z.infer<typeof addStaffSchema>;
