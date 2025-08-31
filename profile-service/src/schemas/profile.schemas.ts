import { z } from "zod";

// Generic error payload used by 4xx responses
export const errorResponseSchema = z.object({
  message: z.string(),
});

// Generic message payload used by 2xx responses
export const messageResponseSchema = z.object({
  message: z.string(),
});

export type ErrorResponse = z.infer<typeof errorResponseSchema>;
export type MessageResponse = z.infer<typeof messageResponseSchema>;
