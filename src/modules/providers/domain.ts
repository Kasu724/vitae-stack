import { z } from "zod";

import { aiTaskIdSchema } from "./contracts";

export const providerKindSchema = z.enum(["openai_compatible", "ollama"]);
export type ProviderKind = z.infer<typeof providerKindSchema>;

export const providerConfigurationInputSchema = z
  .object({
    label: z.string().trim().min(1).max(100),
    kind: providerKindSchema,
    baseUrl: z.string().trim().min(1).max(2048),
    authType: z.enum(["none", "encrypted", "environment"]),
    credential: z.string().max(4096).optional(),
    environmentVariableName: z
      .string()
      .regex(/^AI_PROVIDER_[A-Z0-9_]{1,100}$/u)
      .optional(),
  })
  .superRefine((value, context) => {
    if (value.authType === "encrypted" && !value.credential)
      context.addIssue({
        code: "custom",
        path: ["credential"],
        message: "A credential is required.",
      });
    if (value.authType === "environment" && !value.environmentVariableName)
      context.addIssue({
        code: "custom",
        path: ["environmentVariableName"],
        message: "An AI_PROVIDER_ environment variable is required.",
      });
  });

export const taskAssignmentInputSchema = z.object({
  taskId: aiTaskIdSchema,
  model: z.string().trim().min(1).max(200),
  expectedRevision: z.number().int().positive(),
});

export const taskAssignmentsInputSchema = z.object({
  taskIds: z
    .array(aiTaskIdSchema)
    .min(1)
    .refine((ids) => new Set(ids).size === ids.length, {
      message: "Each task can only be assigned once per request.",
    }),
  model: z.string().trim().min(1).max(200),
  expectedRevision: z.number().int().positive(),
});

export const taskAssignmentRemovalInputSchema = z.object({
  taskId: aiTaskIdSchema,
  expectedRevision: z.number().int().positive(),
});

export const providerDeletionInputSchema = z.object({
  configurationId: z.uuid(),
  expectedRevision: z.number().int().positive(),
});
