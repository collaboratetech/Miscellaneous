import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { Request, Response, Router } from "express";
import {
  ClassificationResultSchema,
  ClassifyRequestSchema,
} from "./schema";
import { getPolicyText, getPolicySource } from "./policy";

const INSTRUCTIONS = `You are a document sensitivity classifier for a corporate compliance team.

Your job: read the user-supplied document content and classify it into exactly one of:
  - Public
  - Internal
  - Confidential
  - HighlyConfidential

You MUST base every decision on the <classification_policy> block in this system prompt. Do not invent rules that are not in that policy. If the policy is silent on a case, fall back to the default classification described in the policy.

Rules:
- Choose the HIGHEST classification any portion of the content requires.
- Cite specific evidence: short, exact quotes from the document (do not paraphrase the snippet).
- Tie each piece of evidence to the policy section that justifies it where possible.
- If the document is empty or trivial (whitespace, boilerplate headers), choose the policy's default classification with confidence "low" and an empty evidence list.
- Do not refuse to classify. Even ambiguous content gets a best-effort classification with confidence "low".
- Return strict JSON matching the requested schema. No prose outside the JSON.`;

export function createClassifyRouter(
  client: Anthropic,
  options: { sharedAuthToken?: string }
): Router {
  const router = Router();

  router.get("/health", (_req: Request, res: Response) => {
    res.json({
      status: "ok",
      policySource: getPolicySource(),
      policyChars: getPolicyText().length,
      model: "claude-haiku-4-5",
    });
  });

  router.post("/classify", async (req: Request, res: Response) => {
    if (options.sharedAuthToken) {
      const header = req.header("authorization") ?? "";
      const presented = header.startsWith("Bearer ") ? header.slice(7) : "";
      if (presented !== options.sharedAuthToken) {
        return res.status(401).json({ error: "unauthorized" });
      }
    }

    const parsed = ClassifyRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "invalid_request",
        details: parsed.error.flatten(),
      });
    }
    const { documentText, host, metadata } = parsed.data;

    const policyText = getPolicyText();

    const userContent = [
      host ? `<host>${host}</host>` : null,
      metadata
        ? `<metadata>${JSON.stringify(metadata)}</metadata>`
        : null,
      `<document>\n${documentText}\n</document>`,
      "Classify the document above per the policy. Return the JSON object only.",
    ]
      .filter(Boolean)
      .join("\n\n");

    try {
      const response = await client.messages.parse({
        model: "claude-haiku-4-5",
        max_tokens: 2048,
        system: [
          { type: "text", text: INSTRUCTIONS },
          {
            type: "text",
            text: `<classification_policy>\n${policyText}\n</classification_policy>`,
            cache_control: { type: "ephemeral", ttl: "1h" },
          },
        ],
        messages: [{ role: "user", content: userContent }],
        output_config: {
          format: zodOutputFormat(ClassificationResultSchema),
        },
      });

      if (!response.parsed_output) {
        return res.status(502).json({
          error: "parse_failed",
          message: "Model did not return a parseable classification.",
          stopReason: response.stop_reason,
        });
      }

      const cacheRead = response.usage.cache_read_input_tokens ?? 0;
      const cacheWrite = response.usage.cache_creation_input_tokens ?? 0;

      return res.json({
        ...response.parsed_output,
        model: response.model,
        usage: response.usage,
        cache: {
          read: cacheRead,
          write: cacheWrite,
          hit: cacheRead > 0,
        },
      });
    } catch (e) {
      if (e instanceof Anthropic.RateLimitError) {
        const retryAfter = e.headers?.get?.("retry-after");
        if (retryAfter) res.setHeader("retry-after", retryAfter);
        return res
          .status(429)
          .json({ error: "rate_limited", message: e.message });
      }
      if (e instanceof Anthropic.AuthenticationError) {
        console.error("[classify] Anthropic auth error:", e.message);
        return res
          .status(500)
          .json({ error: "upstream_auth", message: "Server API key invalid." });
      }
      if (e instanceof Anthropic.BadRequestError) {
        console.error("[classify] Anthropic 400:", e.message);
        return res
          .status(400)
          .json({ error: "upstream_bad_request", message: e.message });
      }
      if (e instanceof Anthropic.APIError) {
        console.error(`[classify] Anthropic ${e.status}:`, e.message);
        return res
          .status(502)
          .json({ error: "upstream_error", status: e.status, message: e.message });
      }
      console.error("[classify] Unexpected error:", e);
      return res
        .status(500)
        .json({ error: "internal_error", message: "Unexpected server error." });
    }
  });

  return router;
}
