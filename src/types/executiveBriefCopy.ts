/**
 * Paste-ready blocks aligned to the internal Executive Brief template structure.
 */

export type SourceKind = "gong" | "planning" | "ae" | "files";

/** Optional fields that refine the brief; primary signal remains pasted sources. */
export type AeBriefMetadata = {
  merchantName: string;
  briefDate: string;
  merchantVertical: string;
  dealStage: string;
  aeLead: string;
  optionalInternalContext: string;
};

/** Shown when an optional metadata field is left blank (not a “smart status”). */
export const META_OPTIONAL_EMPTY = "—";

export type SourceAvailability = {
  hasGong: boolean;
  hasPlanning: boolean;
  hasAe: boolean;
  hasFiles: boolean;
};

export type PageSourceCoverage = {
  affirm101: SourceKind[];
  executive: SourceKind[];
  deal: SourceKind[];
};

export type Affirm101Copy = {
  headline: string;
  valueProps: [string, string, string];
  kpiCallouts: [string, string, string];
};

export type ExecutiveSummaryCopy = {
  missionIntro: string;
  goal1: string;
  goal2: string;
  goal3: string;
  supportingBullets: string[];
  proposalBullets: [string, string];
};

export type ExpectedImpactCopy = {
  headline: string;
  bullets: string[];
};

export type IntegrationCopy = {
  recommendedPath: string;
  timeline: string;
  merchantDependencies: string;
  openQuestionsRisks: string;
};

export type DealSummaryCopy = {
  merchantPricing: string;
  fundingSettlement: string;
  promoPrograms: string;
  termRenewal: string;
  accountManager: string;
  technicalAccountManager: string;
  salesEngineer: string;
  whatsIncluded: string[];
  whatsNotIncluded: string[];
};

/** Display + form merge: shown on Affirm 101 page. */
export type BriefPreviewMeta = AeBriefMetadata;

export type ExecutiveBriefTemplateCopy = {
  briefMeta: BriefPreviewMeta;
  sourceCoverage: PageSourceCoverage;
  affirm101: Affirm101Copy;
  executiveSummary: ExecutiveSummaryCopy;
  expectedImpact: ExpectedImpactCopy;
  integration: IntegrationCopy;
  dealSummary: DealSummaryCopy;
};

export type TemplateCopyBlock = {
  id: string;
  title: string;
  pasteHint: string;
  plainText: string;
  /** Bullet-only excerpt for “Copy bullets only”. */
  bulletsPlainText: string;
};

/** Smart placeholder copy when a field cannot be filled. */
export const STATUS_MISSING = "Missing from source notes";
export const STATUS_CONFIRM_AE = "Confirm with AE";
export const STATUS_PULL_PRICING = "Pull from pricing / integrations";
export const STATUS_NOT_IN_GONG = "Not found in Gong summary";
