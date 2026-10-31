import { describe, expect, it } from "vitest";
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_RULES,
  addStaffSchema,
  changePasswordSchema,
  passwordSchema,
  resetPasswordSchema,
  signUpSchema,
} from "./auth";

const problems = (password: unknown) => {
  const r = passwordSchema.safeParse(password);
  return r.success ? [] : r.error.issues.map((i) => i.message);
};

describe("passwordSchema", () => {
  it("accepts a password that meets every rule", () => {
    expect(problems("Strong!Pass")).toEqual([]);
  });

  it("needs more than eight characters: 8 fails, 9 passes", () => {
    expect(problems("Abcd!efg")).toEqual(["Password must be at least 9 characters"]);
    expect(problems("Abcd!efgh")).toEqual([]);
  });

  it("needs an uppercase letter", () => {
    expect(problems("abcdefgh!")).toEqual(["Password needs an uppercase letter"]);
  });

  it("needs a lowercase letter", () => {
    expect(problems("ABCDEFGH!")).toEqual(["Password needs a lowercase letter"]);
  });

  it("needs a special character: digits and spaces don't count", () => {
    expect(problems("Abcdefghi")).toEqual(["Password needs a special character (for example ! @ # $ %)"]);
    expect(problems("Abcdefg12")).toHaveLength(1);
    expect(problems("Abcdefgh ")).toHaveLength(1);
    expect(problems("Abcdefg_h")).toEqual([]);
  });

  it("reports every missing rule at once", () => {
    expect(problems("abc")).toEqual([
      "Password must be at least 9 characters",
      "Password needs an uppercase letter",
      "Password needs a special character (for example ! @ # $ %)",
    ]);
  });

  it("handles non-English letters", () => {
    expect(problems("Émile!abc")).toEqual([]);
  });

  it("rejects passwords over the maximum length", () => {
    expect(problems("Aa!" + "x".repeat(PASSWORD_MAX_LENGTH))).toEqual([
      `Password can be at most ${PASSWORD_MAX_LENGTH} characters`,
    ]);
  });

  it("rejects a missing or non-string password", () => {
    expect(problems(undefined)).toEqual(["Enter a password"]);
    expect(problems(12345)).toEqual(["Enter a password"]);
  });

  it("has a rule test for every checklist item", () => {
    expect(PASSWORD_RULES.map((r) => r.id)).toEqual(["length", "upper", "lower", "special"]);
  });
});

describe("signUpSchema", () => {
  it("trims and lowercases the email", () => {
    const r = signUpSchema.parse({ name: "  Jane Doe ", email: "  Jane@Example.COM ", password: "Strong!Pass" });
    expect(r).toEqual({ name: "Jane Doe", email: "jane@example.com", password: "Strong!Pass" });
  });

  it("explains an invalid or empty email", () => {
    const bad = signUpSchema.safeParse({ name: "Jane", email: "not-an-email", password: "Strong!Pass" });
    expect(bad.success ? [] : bad.error.issues.map((i) => i.message)).toEqual(["Enter a valid email address"]);
    const empty = signUpSchema.safeParse({ name: "Jane", email: "  ", password: "Strong!Pass" });
    expect(empty.success ? [] : empty.error.issues.map((i) => i.message)).toEqual(["Enter your email address"]);
  });

  it("applies the password policy", () => {
    expect(signUpSchema.safeParse({ name: "Jane", email: "j@x.com", password: "weak" }).success).toBe(false);
  });
});

describe("password confirmation", () => {
  it("reset: the confirmation must match", () => {
    const r = resetPasswordSchema.safeParse({ password: "Strong!Pass", confirmPassword: "Strong!Pass2" });
    expect(r.success).toBe(false);
    expect(r.success ? [] : r.error.issues.map((i) => [i.path.join("."), i.message])).toEqual([
      ["confirmPassword", "Passwords don't match"],
    ]);
    expect(resetPasswordSchema.safeParse({ password: "Strong!Pass", confirmPassword: "Strong!Pass" }).success).toBe(true);
  });

  it("change: needs the current password and a matching, strong new one", () => {
    const base = { currentPassword: "old", newPassword: "Strong!Pass", confirmPassword: "Strong!Pass" };
    expect(changePasswordSchema.safeParse(base).success).toBe(true);
    expect(changePasswordSchema.safeParse({ ...base, currentPassword: "" }).success).toBe(false);
    expect(changePasswordSchema.safeParse({ ...base, newPassword: "weak", confirmPassword: "weak" }).success).toBe(false);
  });
});

describe("addStaffSchema", () => {
  it("takes a name and an email, with no password", () => {
    expect(addStaffSchema.parse({ name: "Sam Staff", email: "SAM@brightloop.test" })).toEqual({
      name: "Sam Staff",
      email: "sam@brightloop.test",
    });
  });
});
