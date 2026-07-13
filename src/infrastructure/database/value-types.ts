export interface SourceLocatorValue {
  kind: "manual" | "document";
  label: string;
  page?: number;
  section?: string;
  sourceDocumentId?: string;
  startOffset?: number;
  endOffset?: number;
}

export type EvidenceValue =
  | { kind: "text"; text: string }
  | { kind: "metric"; value: number; unit: string; context: string }
  | { kind: "date"; value: string; precision: "day" | "month" | "year" }
  | { kind: "skill"; name: string };

export interface JobRevisionMetadata {
  schemaVersion: 1;
  warnings: string[];
  sourceName?: string;
  sourceMediaType?: string;
  retrieval?: {
    requestedUrl: string;
    finalOrigin: string;
    retrievedAt: string;
  };
}

export interface JobRequirementAnalysisMetadata {
  schemaVersion: 1;
  taskVersion: string;
  warnings: string[];
  providerConfigurationId?: string;
  model?: string;
  attempts?: number;
  inputHash: string;
  outputHash?: string;
}

export interface ExtractionAnalysisMetadata {
  schemaVersion: 1;
  taskVersion: "deterministic-lines@1" | "ai-01.v1";
  warnings: string[];
  inputHash: string;
  outputHash?: string;
  providerConfigurationId?: string;
  model?: string;
  attempts?: number;
}

export interface ModelProviderCapabilities {
  schemaVersion: 1;
  structuredOutput: boolean;
  usage: boolean;
  refusal: boolean;
  testedAt?: string;
  warnings: string[];
}

export type ModelTaskAssignments = Partial<Record<`AI-${string}`, string>>;

export interface TailoringRunManifest {
  schemaVersion: 1;
  inputHash: string;
  baseContentHash: string;
  jobContentHash: string;
  taskVersions: string[];
  promptPolicyVersion: string;
  selectedTone: "direct" | "formal" | "warm";
  targetLength: "concise" | "standard";
  lockedBlockIds: string[];
  lockedHashes: Array<{
    targetType: "block" | "claim" | "fact" | "section";
    targetId: string;
    hash: string;
  }>;
}

export interface ExportManifestValue {
  schemaVersion: 1;
  templateId: "ats-safe-single-column@2";
  rendererVersion: string;
  sourceDocumentHash: string;
  groundingPolicyVersion: "exact-approved-assertion@1";
  groundingStateHash: string;
  unsupportedClaimIds: string[];
  warnings: string[];
}
