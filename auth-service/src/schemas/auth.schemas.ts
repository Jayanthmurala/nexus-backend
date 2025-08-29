import { z } from "zod";

export const rolesEnum = z.enum([
  "STUDENT",
  "FACULTY",
  "DEPT_ADMIN",
  "PLACEMENTS_ADMIN",
  "HEAD_ADMIN",
]);

export const superAdminRoleEnum = z.enum([
  "STUDENT",
  "FACULTY",
  "DEPT_ADMIN",
  "PLACEMENTS_ADMIN",
  "HEAD_ADMIN",
  "SUPER_ADMIN",
]);

export const registerBodySchema = z.object({
  displayName: z.string().min(2, "Display name must be at least 2 characters long"),
  email: z.string().email("Please provide a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters long"),
  role: rolesEnum.optional().default("STUDENT"),
  collegeId: z.string().min(1, "College selection is required"),
  department: z.string().min(1, "Department selection is required"),
  collegeMemberId: z.string().optional(),
  year: z.number().int().min(1, "Year must be between 1 and 6").max(6, "Year must be between 1 and 6").optional(),
});

export const loginBodySchema = z.object({
  email: z.string().email("Please provide a valid email address"),
  password: z.string().min(1, "Password is required"),
});

export const authUserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  displayName: z.string(),
  roles: z.array(superAdminRoleEnum),
  avatarUrl: z.string().url().nullable().optional(),
});

export const authSuccessResponseSchema = z.object({
  accessToken: z.string(),
  user: authUserSchema,
});

// Generic error payload used by 4xx responses
export const errorResponseSchema = z.object({
  message: z.string(),
});

// Generic message payload used by 2xx responses
export const messageResponseSchema = z.object({
  message: z.string(),
  debugUrl: z.string().url().optional(),
  debugPreviewUrl: z.string().url().optional(),
});

export type ErrorResponse = z.infer<typeof errorResponseSchema>;

export type RegisterBody = z.infer<typeof registerBodySchema>;
export type LoginBody = z.infer<typeof loginBodySchema>;
export type AuthSuccessResponse = z.infer<typeof authSuccessResponseSchema>;

// OAuth exchange
export const oauthExchangeBodySchema = z.object({
  provider: z.enum(["google", "github"]),
  accessToken: z.string(),
  idToken: z.string().optional(),
});

// Forgot/Reset/Verify
export const forgotPasswordBodySchema = z.object({
  email: z.string().email(),
});

export const resetPasswordBodySchema = z.object({
  token: z.string().min(10),
  password: z.string().min(8),
});

export const verifyEmailBodySchema = z.object({
  token: z.string().min(10),
});

export const resendVerificationBodySchema = z.object({
  email: z.string().email(),
});

export const superAdminRegisterBodySchema = z.object({
  displayName: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  role: superAdminRoleEnum.optional().default("SUPER_ADMIN"),
  collegeId: z.string().optional(),
  department: z.string().optional(),
  collegeMemberId: z.string().optional(),
  year: z.number().int().min(1).max(6).optional(),
});
