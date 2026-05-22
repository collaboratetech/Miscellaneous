import { ClassificationId, ClassificationLevel } from "./types";

export const LEVELS: ClassificationLevel[] = [
  {
    id: "Public",
    rank: 0,
    label: "Public",
    description: "Cleared for unrestricted external release.",
  },
  {
    id: "Internal",
    rank: 1,
    label: "Internal",
    description: "Ordinary business information shared inside the organization.",
  },
  {
    id: "Confidential",
    rank: 2,
    label: "Confidential",
    description: "Sensitive — restrict distribution.",
  },
  {
    id: "HighlyConfidential",
    rank: 3,
    label: "Highly Confidential",
    description: "Strict controls; regulated or board-level sensitivity.",
  },
];

export function getLevelById(id: ClassificationId): ClassificationLevel {
  const found = LEVELS.find((l) => l.id === id);
  if (!found) throw new Error(`Unknown classification id: ${id}`);
  return found;
}

export const LABEL_NAME_CANDIDATES: Record<ClassificationId, string[]> = {
  Public: ["Public", "General Public", "Non-Business"],
  Internal: ["Internal", "General", "Internal Use"],
  Confidential: [
    "Confidential",
    "Confidential - Internal",
    "Confidential All Employees",
  ],
  HighlyConfidential: [
    "Highly Confidential",
    "Highly Confidential - Internal",
    "Restricted",
    "Strictly Confidential",
  ],
};
