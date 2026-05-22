import { z } from "zod";

export const ClassificationIdSchema = z.enum([
  "Public",
  "Internal",
  "Confidential",
  "HighlyConfidential",
]);

export type ClassificationId = z.infer<typeof ClassificationIdSchema>;

export const ClassificationResultSchema = z.object({
  classification: ClassificationIdSchema.describe(
    "The recommended sensitivity classification level for the document, based strictly on the supplied policy."
  ),
  confidence: z
    .enum(["low", "medium", "high"])
    .describe(
      "How confident you are in this classification. 'low' if the policy is ambiguous for this content, 'high' if the policy clearly mandates it."
    ),
  rationale: z
    .string()
    .describe(
      "One short paragraph (2-4 sentences) explaining why this classification was chosen, in language a non-expert user can act on. Reference the policy where relevant."
    ),
  evidence: z
    .array(
      z.object({
        snippet: z
          .string()
          .describe(
            "An exact quoted excerpt from the document (around 30-200 characters) that drove this classification. Do not paraphrase."
          ),
        reason: z
          .string()
          .describe(
            "Why this snippet matters, tying it to the policy. Keep to one sentence."
          ),
      })
    )
    .describe(
      "Concrete textual evidence from the document. Empty array is allowed only when classification is 'Public' or 'Internal' with no notable triggers."
    ),
  policyReferences: z
    .array(z.string())
    .describe(
      "Section numbers, clause names, or short policy phrases that justify this classification (e.g. '§3.2 Personal Data', 'Confidential by default rule'). Empty array allowed if classification falls under a general default."
    ),
});

export type ClassificationResult = z.infer<typeof ClassificationResultSchema>;

export const ClassifyRequestSchema = z.object({
  documentText: z.string().min(1).max(300_000),
  host: z.enum(["Word", "Excel", "PowerPoint"]).optional(),
  metadata: z.record(z.string()).optional(),
});

export type ClassifyRequest = z.infer<typeof ClassifyRequestSchema>;
