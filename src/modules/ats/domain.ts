import type { CanonicalDocument } from "@/modules/documents/document-schema";
import { isMaterialCharacter } from "@/modules/documents/grounding";

export const ATS_RULESET_VERSION = "ats-rules@1.1.0";

export const atsCategories = [
  ["parsing", "Parsing compatibility", 12],
  ["headings", "Section-heading compatibility", 6],
  ["contact", "Contact-information readability", 5],
  ["dates", "Date consistency", 5],
  ["formatting", "Formatting risk", 7],
  ["required", "Required qualification coverage", 15],
  ["preferred", "Preferred qualification coverage", 5],
  ["responsibility", "Responsibility alignment", 10],
  ["evidence", "Evidence strength", 10],
  ["keywords", "Keyword coverage", 5],
  ["stuffing", "Keyword stuffing", 3],
  ["impact", "Quantified impact", 5],
  ["clarity", "Bullet clarity", 5],
  ["redundancy", "Redundancy", 3],
  ["unsupported", "Unsupported claims", 4],
] as const;

export type AtsCategory = (typeof atsCategories)[number][0];

export interface AtsRequirementInput {
  id: string;
  text: string;
  category: string;
  priority: string;
}

export interface AtsClaimInput {
  id: string;
  blockId: string;
  start: number;
  end: number;
  status: "supported" | "unverified" | "nonfactual";
  evidence: Array<{ id: string; status: string }>;
}

export interface AtsSupportInput {
  requirementId: string;
  evidenceFactId: string;
  strength: "direct" | "combined" | "weak";
}

export interface AtsFinding {
  ruleId: string;
  category: AtsCategory;
  severity: "info" | "low" | "medium" | "high";
  location: Record<string, unknown>;
  measured: Record<string, unknown>;
  threshold: Record<string, unknown>;
  message: string;
  remediation: string;
  pointLossBasisPoints: number;
  blocker: boolean;
}

export interface AtsCategoryScore {
  category: AtsCategory;
  label: string;
  weight: number;
  earnedPoints: number;
  applicablePoints: number;
  scoreBasisPoints: number | null;
}

export interface AtsAnalysis {
  rulesetVersion: string;
  categories: AtsCategoryScore[];
  findings: AtsFinding[];
  evaluatedWeight: number;
  overallScoreBasisPoints: number | null;
  blockerCount: number;
}

type ScoreAccumulator = { earned: number; applicable: number };

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
]);

function tokens(value: string): string[] {
  return value
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}+#.-]+/gu, " ")
    .trim()
    .split(/\s+/u)
    .map((token) => token.replace(/^[.-]+|[.-]+$/gu, ""))
    .filter((token) => token.length >= 2 && !stopWords.has(token));
}

function uniqueTokens(value: string): string[] {
  return [...new Set(tokens(value))];
}

function add(
  scores: Map<AtsCategory, ScoreAccumulator>,
  category: AtsCategory,
  earned: number,
  applicable = 100,
): void {
  const current = scores.get(category) ?? { earned: 0, applicable: 0 };
  current.earned += Math.max(0, Math.min(earned, applicable));
  current.applicable += applicable;
  scores.set(category, current);
}

function finding(
  findings: AtsFinding[],
  value: Omit<AtsFinding, "pointLossBasisPoints"> & {
    pointLossBasisPoints?: number;
  },
): void {
  findings.push({ pointLossBasisPoints: 10_000, ...value });
}

function jaccard(left: string, right: string): number {
  const a = new Set(uniqueTokens(left));
  const b = new Set(uniqueTokens(right));
  const union = new Set([...a, ...b]);
  if (!union.size) return 0;
  return [...a].filter((token) => b.has(token)).length / union.size;
}

export function analyzeAts(input: {
  document: CanonicalDocument;
  requirements: AtsRequirementInput[];
  claims: AtsClaimInput[];
  support: AtsSupportInput[];
}): AtsAnalysis {
  const scores = new Map<AtsCategory, ScoreAccumulator>();
  const findings: AtsFinding[] = [];
  const blocks = input.document.sections.flatMap((section) =>
    section.blocks.map((block) => ({ ...block, sectionId: section.id })),
  );
  const text = blocks.map((block) => block.text).join("\n");
  const documentTokens = new Set(uniqueTokens(text));
  const claims = [...input.claims];
  const knownClaimIds = new Set(claims.map((claim) => claim.id));
  for (const block of blocks) {
    const coverage = Array.from({ length: block.text.length }, () => false);
    const blockClaims = claims
      .filter((claim) => claim.blockId === block.id)
      .sort((left, right) => left.start - right.start);
    let previousEnd = 0;
    for (const claim of blockClaims) {
      if (
        !Number.isInteger(claim.start) ||
        !Number.isInteger(claim.end) ||
        claim.start < previousEnd ||
        claim.start < 0 ||
        claim.end <= claim.start ||
        claim.end > block.text.length
      )
        continue;
      previousEnd = claim.end;
      for (let index = claim.start; index < claim.end; index += 1)
        coverage[index] = true;
    }
    const issueId = `untracked-block:${block.id}`;
    let hasUntrackedText = false;
    for (let index = 0; index < block.text.length; index += 1)
      if (isMaterialCharacter(block.text[index]!) && !coverage[index]) {
        hasUntrackedText = true;
        break;
      }
    if (!knownClaimIds.has(issueId) && hasUntrackedText) {
      claims.push({
        id: issueId,
        blockId: block.id,
        start: 0,
        end: block.text.length,
        status: "unverified",
        evidence: [],
      });
      knownClaimIds.add(issueId);
    }
  }

  add(scores, "parsing", text.trim() ? 100 : 0);
  add(scores, "parsing", text.length <= 200_000 ? 100 : 0);
  if (!text.trim())
    finding(findings, {
      ruleId: "ATS-PARSE-001",
      category: "parsing",
      severity: "high",
      location: { document: true },
      measured: { nonWhitespaceCharacters: 0 },
      threshold: { minimum: 1 },
      message: "The canonical document contains no readable text.",
      remediation: "Add selectable text before exporting.",
      blocker: false,
    });

  const recognized = new Set([
    "contact",
    "summary",
    "experience",
    "education",
    "skills",
    "project",
    "projects",
    "header",
    "salutation",
    "body",
    "closing",
  ]);
  for (const section of input.document.sections) {
    const heading = (section.heading ?? section.type).toLocaleLowerCase(
      "en-US",
    );
    const okay = section.type !== "custom" || recognized.has(heading);
    add(scores, "headings", okay ? 100 : 0);
    if (!okay)
      finding(findings, {
        ruleId: "ATS-HEAD-001",
        category: "headings",
        severity: "medium",
        location: { sectionId: section.id },
        measured: { heading: section.heading ?? "" },
        threshold: { recognized: true },
        message: "A custom section heading may not be recognized consistently.",
        remediation: "Use a conventional heading or a documented synonym.",
        blocker: false,
      });
  }

  const contactText = input.document.sections
    .filter(
      (section) => section.type === "contact" || section.type === "header",
    )
    .flatMap((section) => section.blocks)
    .map((block) => block.text)
    .join(" ");
  const readableContact =
    /\b[^\s@]+@[^\s@]+\.[^\s@]+\b/u.test(contactText) ||
    /(?:\+?\d[\d ().-]{6,}\d)/u.test(contactText) ||
    /https?:\/\//u.test(contactText);
  add(scores, "contact", readableContact ? 100 : 0);
  if (!readableContact)
    finding(findings, {
      ruleId: "ATS-CONTACT-001",
      category: "contact",
      severity: "high",
      location: {
        sectionType: input.document.kind === "resume" ? "contact" : "header",
      },
      measured: { readableMethod: false },
      threshold: { minimumReadableMethods: 1 },
      message:
        "No readable email, phone number, or web address was detected in the contact area.",
      remediation:
        "Add at least one user-selected contact method as plain text.",
      blocker: false,
    });

  const numericDates =
    text.match(/\b(?:0?[1-9]|1[0-2])[/-](?:19|20)\d{2}\b/gu) ?? [];
  const namedDates =
    text.match(
      /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(?:19|20)\d{2}\b/giu,
    ) ?? [];
  const years = text.match(/\b(?:19|20)\d{2}\b/gu) ?? [];
  if (years.length) {
    const consistent = !(numericDates.length && namedDates.length);
    add(scores, "dates", consistent ? 100 : 50);
    if (!consistent)
      finding(findings, {
        ruleId: "ATS-DATE-001",
        category: "dates",
        severity: "low",
        location: { document: true },
        measured: {
          numericDates: numericDates.length,
          namedDates: namedDates.length,
        },
        threshold: { formats: 1 },
        message: "Multiple date styles were detected.",
        remediation: "Use one date style consistently.",
        pointLossBasisPoints: 5_000,
        blocker: false,
      });
  }

  const longBlocks = blocks.filter((block) => block.text.length > 240);
  add(scores, "formatting", longBlocks.length ? 50 : 100);
  add(scores, "formatting", 100);
  if (longBlocks.length)
    finding(findings, {
      ruleId: "ATS-FMT-001",
      category: "formatting",
      severity: "low",
      location: { blockIds: longBlocks.map((block) => block.id) },
      measured: { longBlockCount: longBlocks.length },
      threshold: { maximumCharactersPerBlock: 240 },
      message: "Some blocks are unusually dense for reliable scanning.",
      remediation: "Split dense blocks while preserving meaning.",
      pointLossBasisPoints: 5_000,
      blocker: false,
    });

  const activeClaimEvidence = new Set(
    claims
      .filter(
        (claim) =>
          claim.status === "supported" &&
          claim.evidence.length > 0 &&
          claim.evidence.every((evidence) => evidence.status === "approved"),
      )
      .flatMap((claim) =>
        claim.evidence
          .filter((evidence) => evidence.status === "approved")
          .map((evidence) => evidence.id),
      ),
  );
  const requirementScore = (requirement: AtsRequirementInput): number => {
    const strengths = input.support
      .filter(
        (item) =>
          item.requirementId === requirement.id &&
          activeClaimEvidence.has(item.evidenceFactId),
      )
      .map((item) => item.strength);
    return strengths.includes("direct")
      ? 100
      : strengths.includes("combined")
        ? 75
        : 0;
  };
  const alignmentGroups: Array<{
    category: AtsCategory;
    rule: string;
    requirements: AtsRequirementInput[];
  }> = [
    {
      category: "required",
      rule: "ATS-REQ-001",
      requirements: input.requirements.filter(
        (item) =>
          item.category === "required_qualification" ||
          (item.priority === "required" &&
            item.category !== "responsibility" &&
            item.category !== "preferred_qualification"),
      ),
    },
    {
      category: "preferred",
      rule: "ATS-PREF-001",
      requirements: input.requirements.filter(
        (item) =>
          item.category === "preferred_qualification" ||
          (item.priority === "preferred" &&
            item.category !== "required_qualification" &&
            item.category !== "responsibility"),
      ),
    },
    {
      category: "responsibility",
      rule: "ATS-RESP-001",
      requirements: input.requirements.filter(
        (item) => item.category === "responsibility",
      ),
    },
  ];
  for (const group of alignmentGroups)
    for (const requirement of group.requirements) {
      const earned = requirementScore(requirement);
      add(scores, group.category, earned);
      if (earned < 100)
        finding(findings, {
          ruleId: group.rule,
          category: group.category,
          severity: earned ? "medium" : "high",
          location: { requirementId: requirement.id },
          measured: { support: earned === 75 ? "combined" : "none" },
          threshold: { support: "direct" },
          message: `Reviewed requirement is ${earned ? "only jointly supported" : "not supported by a current document claim"}: ${requirement.text}`,
          remediation:
            "Use supported evidence if relevant, or keep this as an explicit gap.",
          pointLossBasisPoints: 10_000 - earned * 100,
          blocker: false,
        });
    }

  const factualClaims = claims.filter((claim) => claim.status !== "nonfactual");
  for (const claim of factualClaims) {
    const eligible =
      claim.status === "supported" &&
      claim.evidence.length > 0 &&
      claim.evidence.every((evidence) => evidence.status === "approved");
    add(scores, "evidence", eligible ? 100 : 0);
    add(scores, "unsupported", eligible ? 100 : 0);
    if (!eligible) {
      finding(findings, {
        ruleId: "ATS-EVID-001",
        category: "evidence",
        severity: "high",
        location: { claimId: claim.id, blockId: claim.blockId },
        measured: {
          claimStatus: claim.status,
          evidenceStatuses: claim.evidence.map((evidence) => evidence.status),
        },
        threshold: { claimStatus: "supported", evidenceStatus: "approved" },
        message:
          "A factual claim does not have current, active approved evidence.",
        remediation:
          "Review the claim support and replace withdrawn, superseded, or unavailable evidence.",
        blocker: false,
      });
      finding(findings, {
        ruleId: "ATS-UNSUP-001",
        category: "unsupported",
        severity: "high",
        location: { claimId: claim.id, blockId: claim.blockId },
        measured: { status: claim.status },
        threshold: { status: "supported", activeEvidence: true },
        message:
          "A factual claim is not supported by current approved evidence.",
        remediation:
          "Link approved evidence, approve the exact fact, edit, or remove the claim.",
        blocker: true,
      });
    }
  }

  for (const requirement of input.requirements) {
    const requirementTokens = uniqueTokens(requirement.text);
    if (!requirementTokens.length) continue;
    const matched = requirementTokens.filter((token) =>
      documentTokens.has(token),
    );
    const earned = Math.round(
      (matched.length / requirementTokens.length) * 100,
    );
    add(scores, "keywords", earned);
    if (earned < 50)
      finding(findings, {
        ruleId: "ATS-KEY-001",
        category: "keywords",
        severity: "low",
        location: { requirementId: requirement.id },
        measured: { matched: matched.length, total: requirementTokens.length },
        threshold: { minimumFraction: 0.5 },
        message: "Few reviewed requirement terms appear in the document.",
        remediation:
          "Use accurate terminology only where approved evidence supports it.",
        pointLossBasisPoints: 10_000 - earned * 100,
        blocker: false,
      });
  }

  const wordTokens = tokens(text);
  const frequency = new Map<string, number>();
  wordTokens.forEach((token) =>
    frequency.set(token, (frequency.get(token) ?? 0) + 1),
  );
  const highest = Math.max(0, ...frequency.values());
  const stuffingThreshold = Math.max(5, Math.ceil(wordTokens.length * 0.08));
  add(scores, "stuffing", highest <= stuffingThreshold ? 100 : 0);
  if (highest > stuffingThreshold)
    finding(findings, {
      ruleId: "ATS-STUFF-001",
      category: "stuffing",
      severity: "medium",
      location: { document: true },
      measured: { highestTermFrequency: highest, wordCount: wordTokens.length },
      threshold: { maximumFrequency: stuffingThreshold },
      message:
        "A normalized term appears unusually often for this document length.",
      remediation:
        "Remove repetitive terms; keyword repetition does not prove qualification.",
      blocker: false,
    });

  const bulletBlocks = blocks.filter((block) => block.type === "bullet");
  for (const block of bulletBlocks) {
    const words = tokens(block.text).length;
    const clearLength = words >= 4 && words <= 35;
    const avoidsFirstPerson =
      input.document.kind !== "resume" ||
      !/\b(?:I|me|my|we|our)\b/iu.test(block.text);
    add(
      scores,
      "clarity",
      (clearLength ? 50 : 0) + (avoidsFirstPerson ? 50 : 0),
    );
    if (!clearLength || !avoidsFirstPerson)
      finding(findings, {
        ruleId: "ATS-BULLET-001",
        category: "clarity",
        severity: "low",
        location: { blockId: block.id },
        measured: { wordCount: words, firstPerson: !avoidsFirstPerson },
        threshold: {
          minimumWords: 4,
          maximumWords: 35,
          firstPersonInResume: false,
        },
        message: "A bullet falls outside the documented clarity heuristic.",
        remediation:
          "Review length and first-person wording without changing supported facts.",
        pointLossBasisPoints: 5_000,
        blocker: false,
      });
    if (/\b\d+(?:[.,]\d+)?%?\b/u.test(block.text)) {
      const supportedMetric = claims.some(
        (claim) =>
          claim.blockId === block.id &&
          claim.status === "supported" &&
          claim.evidence.some((evidence) => evidence.status === "approved"),
      );
      add(scores, "impact", supportedMetric ? 100 : 0);
      if (!supportedMetric)
        finding(findings, {
          ruleId: "ATS-IMPACT-001",
          category: "impact",
          severity: "high",
          location: { blockId: block.id },
          measured: { numericImpact: true, supported: false },
          threshold: { supported: true },
          message:
            "A quantified bullet is not linked to current approved evidence.",
          remediation: "Verify the exact metric or remove it.",
          blocker: true,
        });
    }
  }
  for (let left = 0; left < bulletBlocks.length; left += 1)
    for (let right = left + 1; right < bulletBlocks.length; right += 1) {
      const overlap = jaccard(
        bulletBlocks[left]!.text,
        bulletBlocks[right]!.text,
      );
      add(scores, "redundancy", overlap < 0.8 ? 100 : 0);
      if (overlap >= 0.8)
        finding(findings, {
          ruleId: "ATS-REDUND-001",
          category: "redundancy",
          severity: "low",
          location: {
            blockIds: [bulletBlocks[left]!.id, bulletBlocks[right]!.id],
          },
          measured: { tokenJaccardBasisPoints: Math.round(overlap * 10_000) },
          threshold: { maximumBasisPoints: 7_999 },
          message: "Two bullets contain highly overlapping terms.",
          remediation:
            "Remove redundant wording while preserving distinct supported facts.",
          blocker: false,
        });
    }

  const categories = atsCategories.map(([category, label, weight]) => {
    const score = scores.get(category) ?? { earned: 0, applicable: 0 };
    return {
      category,
      label,
      weight,
      earnedPoints: score.earned,
      applicablePoints: score.applicable,
      scoreBasisPoints: score.applicable
        ? Math.round((score.earned / score.applicable) * 10_000)
        : null,
    };
  });
  const evaluated = categories.filter(
    (category) => category.scoreBasisPoints !== null,
  );
  const evaluatedWeight = evaluated.reduce(
    (sum, category) => sum + category.weight,
    0,
  );
  const overall = evaluatedWeight
    ? Math.round(
        evaluated.reduce(
          (sum, category) =>
            sum + (category.scoreBasisPoints ?? 0) * category.weight,
          0,
        ) / evaluatedWeight,
      )
    : null;
  findings.sort(
    (left, right) =>
      atsCategories.findIndex(([id]) => id === left.category) -
        atsCategories.findIndex(([id]) => id === right.category) ||
      left.ruleId.localeCompare(right.ruleId) ||
      JSON.stringify(left.location).localeCompare(
        JSON.stringify(right.location),
      ),
  );
  return {
    rulesetVersion: ATS_RULESET_VERSION,
    categories,
    findings,
    evaluatedWeight,
    overallScoreBasisPoints: evaluatedWeight >= 80 ? overall : null,
    blockerCount: findings.filter((item) => item.blocker).length,
  };
}
