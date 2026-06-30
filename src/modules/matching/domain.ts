import { createHash } from "node:crypto";

const stopWords = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "in",
  "is",
  "of",
  "on",
  "or",
  "the",
  "to",
  "with",
  "will",
  "you",
  "your",
]);

export interface MatchRequirementInput {
  id: string;
  text: string;
}

export interface MatchFactInput {
  id: string;
  type: string;
  displayText: string;
  value: unknown;
}

export interface DeterministicEvidenceMatch {
  requirementId: string;
  evidenceFactId: string;
  strength: "direct" | "combined" | "weak";
  scoreBasisPoints: number;
  matchedTokens: string[];
  requirementTokenCount: number;
  exactSkill: boolean;
  phraseMatch: boolean;
  reason: string;
}

export const MATCH_ALGORITHM_VERSION = "lexical-evidence@1";

function normalized(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}+#.-]+/gu, " ")
    .trim();
}

export function lexicalTokens(value: string): string[] {
  return [
    ...new Set(
      normalized(value)
        .split(/\s+/u)
        .map((token) => token.replace(/^[.-]+|[.-]+$/gu, ""))
        .filter(
          (token) =>
            token.length >= 2 && !stopWords.has(token) && !/^\d+$/u.test(token),
        ),
    ),
  ];
}

function factText(fact: MatchFactInput): string {
  if (fact.value && typeof fact.value === "object" && "kind" in fact.value) {
    const value = fact.value as Record<string, unknown>;
    return [
      fact.displayText,
      value.name,
      value.text,
      value.context,
      value.unit,
      value.value,
    ]
      .filter((item) => ["number", "string"].includes(typeof item))
      .join(" ");
  }
  return fact.displayText;
}

export function matchEvidenceDeterministically(
  requirements: MatchRequirementInput[],
  facts: MatchFactInput[],
): DeterministicEvidenceMatch[] {
  const results: DeterministicEvidenceMatch[] = [];
  for (const requirement of requirements) {
    const requirementNormalized = normalized(requirement.text);
    const requirementTokens = lexicalTokens(requirement.text);
    if (!requirementTokens.length) continue;
    const candidates = facts
      .map((fact) => {
        const text = factText(fact);
        const factNormalized = normalized(text);
        const factTokenSet = new Set(lexicalTokens(text));
        const matchedTokens = requirementTokens.filter((token) =>
          factTokenSet.has(token),
        );
        const skillName =
          fact.value &&
          typeof fact.value === "object" &&
          "kind" in fact.value &&
          (fact.value as Record<string, unknown>).kind === "skill"
            ? String((fact.value as Record<string, unknown>).name ?? "")
            : fact.type === "skill"
              ? fact.displayText
              : "";
        const exactSkill = Boolean(
          skillName &&
          requirementNormalized.includes(normalized(skillName)) &&
          normalized(skillName).length >= 2,
        );
        const phraseMatch =
          factNormalized.length >= 5 &&
          (requirementNormalized.includes(factNormalized) ||
            factNormalized.includes(requirementNormalized));
        const rawScore = Math.min(
          1,
          matchedTokens.length / requirementTokens.length +
            (exactSkill ? 0.5 : 0) +
            (phraseMatch ? 0.25 : 0),
        );
        return {
          fact,
          matchedTokens,
          exactSkill,
          phraseMatch,
          scoreBasisPoints: Math.round(rawScore * 10_000),
        };
      })
      .filter(
        (candidate) =>
          candidate.scoreBasisPoints >= 1800 || candidate.exactSkill,
      )
      .sort(
        (left, right) =>
          right.scoreBasisPoints - left.scoreBasisPoints ||
          left.fact.id.localeCompare(right.fact.id),
      )
      .slice(0, 10);

    const hasDirect = candidates.some(
      (candidate) => candidate.scoreBasisPoints >= 5500 || candidate.exactSkill,
    );
    const combinedIds = new Set<string>();
    if (!hasDirect && candidates.length >= 2) {
      const union = new Set(candidates.flatMap((item) => item.matchedTokens));
      if (union.size / requirementTokens.length >= 0.55)
        candidates.forEach((candidate) => combinedIds.add(candidate.fact.id));
    }
    for (const candidate of candidates) {
      const strength =
        candidate.scoreBasisPoints >= 5500 || candidate.exactSkill
          ? "direct"
          : combinedIds.has(candidate.fact.id)
            ? "combined"
            : "weak";
      results.push({
        requirementId: requirement.id,
        evidenceFactId: candidate.fact.id,
        strength,
        scoreBasisPoints: candidate.scoreBasisPoints,
        matchedTokens: candidate.matchedTokens,
        requirementTokenCount: requirementTokens.length,
        exactSkill: candidate.exactSkill,
        phraseMatch: candidate.phraseMatch,
        reason: candidate.exactSkill
          ? "Exact approved skill appears in the requirement."
          : `${candidate.matchedTokens.length} of ${requirementTokens.length} meaningful requirement terms match approved evidence.`,
      });
    }
  }
  return results;
}

export function hashMatchInputs(value: unknown): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}
