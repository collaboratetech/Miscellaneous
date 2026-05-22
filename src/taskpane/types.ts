export type ClassificationId =
  | "Public"
  | "Internal"
  | "Confidential"
  | "HighlyConfidential";

export interface ClassificationEvidence {
  snippet: string;
  reason: string;
}

export interface ClassificationResult {
  classification: ClassificationId;
  confidence: "low" | "medium" | "high";
  rationale: string;
  evidence: ClassificationEvidence[];
  policyReferences: string[];
  model: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
  cache?: {
    read: number;
    write: number;
    hit: boolean;
  };
}

export interface ClassificationLevel {
  id: ClassificationId;
  rank: number;
  label: string;
  description: string;
}
