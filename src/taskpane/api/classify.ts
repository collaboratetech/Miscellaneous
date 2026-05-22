import { CLASSIFIER_API_URL, CLASSIFIER_AUTH_TOKEN } from "../config";
import { ClassificationResult } from "../types";

export interface ClassifyOptions {
  documentText: string;
  host?: "Word" | "Excel" | "PowerPoint";
  metadata?: Record<string, string>;
}

export async function classifyDocument(
  opts: ClassifyOptions
): Promise<ClassificationResult> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (CLASSIFIER_AUTH_TOKEN) {
    headers["Authorization"] = `Bearer ${CLASSIFIER_AUTH_TOKEN}`;
  }

  const response = await fetch(`${CLASSIFIER_API_URL}/classify`, {
    method: "POST",
    headers,
    body: JSON.stringify(opts),
  });

  const body: unknown = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      typeof body === "object" && body && "message" in body
        ? String((body as Record<string, unknown>).message)
        : typeof body === "object" && body && "error" in body
        ? String((body as Record<string, unknown>).error)
        : `Backend returned ${response.status}.`;
    throw new ClassifierApiError(message, response.status);
  }

  return body as ClassificationResult;
}

export class ClassifierApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "ClassifierApiError";
  }
}
