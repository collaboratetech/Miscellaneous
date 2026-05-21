import keywordsData from "./keywords.json";

export type ClassificationId = "Public" | "Internal" | "Confidential" | "HighlyConfidential";

export interface ClassificationLevel {
  id: ClassificationId;
  rank: number;
  label: string;
  description: string;
  keywords: string[];
}

export interface KeywordMatch {
  keyword: string;
  count: number;
  levelId: ClassificationId;
}

export interface ClassificationResult {
  recommendedLevel: ClassificationLevel;
  matches: KeywordMatch[];
  matchesByLevel: Record<ClassificationId, KeywordMatch[]>;
  scannedCharacters: number;
  usedDefault: boolean;
}

const dictionary = keywordsData as {
  version: number;
  description: string;
  defaultClassification: ClassificationId;
  levels: ClassificationLevel[];
};

export function getLevels(): ClassificationLevel[] {
  return [...dictionary.levels].sort((a, b) => a.rank - b.rank);
}

export function getLevelById(id: ClassificationId): ClassificationLevel | undefined {
  return dictionary.levels.find((l) => l.id === id);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  // Word-boundary match for alpha tokens; for multi-word phrases match as-is with case insensitivity.
  const pattern = /^[\w\s'-]+$/.test(needle)
    ? new RegExp(`\\b${escapeRegExp(needle)}\\b`, "gi")
    : new RegExp(escapeRegExp(needle), "gi");
  const matches = haystack.match(pattern);
  return matches ? matches.length : 0;
}

export function classifyText(text: string): ClassificationResult {
  const matchesByLevel = {
    Public: [] as KeywordMatch[],
    Internal: [] as KeywordMatch[],
    Confidential: [] as KeywordMatch[],
    HighlyConfidential: [] as KeywordMatch[]
  };
  const allMatches: KeywordMatch[] = [];

  for (const level of dictionary.levels) {
    for (const keyword of level.keywords) {
      const count = countOccurrences(text, keyword);
      if (count > 0) {
        const match: KeywordMatch = { keyword, count, levelId: level.id };
        matchesByLevel[level.id].push(match);
        allMatches.push(match);
      }
    }
  }

  const levelsSorted = getLevels();
  let recommended: ClassificationLevel | undefined;
  for (let i = levelsSorted.length - 1; i >= 0; i--) {
    const l = levelsSorted[i];
    if (matchesByLevel[l.id].length > 0) {
      recommended = l;
      break;
    }
  }
  const usedDefault = !recommended;
  if (!recommended) {
    recommended = getLevelById(dictionary.defaultClassification) ?? levelsSorted[1];
  }

  return {
    recommendedLevel: recommended!,
    matches: allMatches,
    matchesByLevel,
    scannedCharacters: text.length,
    usedDefault
  };
}
