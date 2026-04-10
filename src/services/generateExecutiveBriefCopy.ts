import {
  parseAccountPreReadFromSource,
  PLACEHOLDER_MISSING,
  PLACEHOLDER_NEEDS_INPUT,
} from "./generateAccountPreRead";
import type {
  AeBriefMetadata,
  ExecutiveBriefTemplateCopy,
  PageSourceCoverage,
  SourceAvailability,
  SourceKind,
  TemplateCopyBlock,
} from "../types/executiveBriefCopy";
import {
  META_OPTIONAL_EMPTY,
  STATUS_CONFIRM_AE,
  STATUS_MISSING,
  STATUS_NOT_IN_GONG,
  STATUS_PULL_PRICING,
} from "../types/executiveBriefCopy";

export type BriefGenerationInput = {
  sourceText: string;
  metadata: AeBriefMetadata;
  sourceAvailability: SourceAvailability;
};

function isMissingToken(s: string): boolean {
  const t = s.trim();
  return (
    !t ||
    t === PLACEHOLDER_NEEDS_INPUT ||
    t === PLACEHOLDER_MISSING ||
    t === STATUS_MISSING ||
    t === STATUS_CONFIRM_AE ||
    t === STATUS_PULL_PRICING ||
    t === STATUS_NOT_IN_GONG
  );
}

function coalesce(form: string, parsed: string): string {
  const f = form.trim();
  if (f) return f;
  return parsed.trim();
}

function optionalMetaLine(form: string): string {
  const t = form.trim();
  return t || META_OPTIONAL_EMPTY;
}

function maxWords(text: string, n: number): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= n) return text.trim();
  return words.slice(0, n).join(" ");
}

function maxSentences(text: string, max: number): string {
  const t = text.trim();
  if (!t) return t;
  const parts = t.split(/(?<=[.!?])\s+/).filter(Boolean);
  return parts.slice(0, max).join(" ").trim();
}

function oneLine(s: string, maxLen = 140): string {
  const t = polishReadable(s.replace(/\s+/g, " ").trim());
  if (t.length <= maxLen) return t;
  return `${t.slice(0, maxLen - 1).trim()}…`;
}

/** Strip list junk and mid-sentence fragments so pasted Gong/CRM text reads cleanly. */
function polishReadable(s: string): string {
  let t = s.trim();
  if (!t) return t;
  t = t.replace(/^[,;:\s·•\-–—]+|[,;:\s·•\-–—]+$/g, "").trim();
  t = t.replace(/^[,]\s*/, "");
  if (/^(but|and|or|nor|however)\s+/i.test(t)) {
    t = t.charAt(0).toUpperCase() + t.slice(1);
  }
  return t.trim();
}

function normBulletKey(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").replace(/[.…]+$/g, "").trim().slice(0, 240);
}

function dedupeReadableStrings(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    const p = polishReadable(raw);
    if (!p || isMissingToken(p)) continue;
    const k = normBulletKey(p);
    if (k.length < 8 || seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }
  return out;
}

function isUsableKpiPart(s: string): boolean {
  const t = polishReadable(s);
  if (!t || isMissingToken(t)) return false;
  if (t.length < 2) return false;
  if (!/[0-9%]/.test(t) && t.length < 4) return false;
  if (/^[,·•\s\-–—]+$/.test(t)) return false;
  return true;
}

function formatShoppersApprovalLine(users: string, approval: string, fallback: string): string {
  const uOk = isUsableKpiPart(users);
  const aOk = isUsableKpiPart(approval);
  if (!uOk && !aOk) return `Shoppers / approval: ${fallback}`;
  if (uOk && aOk) {
    return oneLine(`Shoppers / approval: ${users.trim()} · ${approval.trim()}`, 120);
  }
  if (uOk) return oneLine(`Unique / active users: ${users.trim()}`, 100);
  return oneLine(`Approval rate: ${approval.trim()}`, 100);
}

/** Use the first full sentence for dense CRM blobs so the headline isn’t a term sheet mashup. */
function firstSentenceOrTrim(s: string, maxLen: number): string {
  const p = polishReadable(s);
  const m = p.match(/^([\s\S]{20,800}?[.!?])(?:\s+|$)/);
  if (m?.[1]) return oneLine(m[1].trim(), maxLen);
  return oneLine(p, maxLen);
}

function extractAeContext(raw: string): string {
  const m = raw.match(
    /---\s*AE Notes \/ Leadership Context\s*---\s*([\s\S]*?)(?=\n---\s*File:|\n---\s*$|$)/i,
  );
  return m?.[1]?.trim() ?? "";
}

function fillOrStatus(value: string, statusIfEmpty: string): string {
  return isMissingToken(value) ? statusIfEmpty : value.trim();
}

function toProposalPair(commercial: string, hasPlanning: boolean): [string, string] {
  if (isMissingToken(commercial)) {
    return [
      hasPlanning ? STATUS_PULL_PRICING : STATUS_MISSING,
      STATUS_CONFIRM_AE,
    ];
  }
  const cleaned = polishReadable(commercial);
  const chunks = cleaned
    .split(/(?<=[.!?])\s+|;|\n+/)
    .map((s) => polishReadable(s))
    .filter((s) => s.length >= 14 && !/^[,·•\s]+$/.test(s));
  const a = chunks[0] ?? oneLine(cleaned, 200);
  const b = chunks[1] ?? STATUS_CONFIRM_AE;
  return [oneLine(a, 200), oneLine(b, 200)];
}

function toScopeBullets(
  primary: string,
  secondary: string,
  pool: string[],
  minN: number,
  maxN: number,
  emptyStatus: string,
): string[] {
  const out: string[] = [];
  const add = (s: string) => {
    const t = oneLine(s, 120);
    if (t && !isMissingToken(t) && !out.includes(t)) out.push(t);
  };
  add(primary);
  add(secondary);
  for (const p of pool) add(p);
  while (out.length < minN) out.push(emptyStatus);
  return out.slice(0, maxN);
}

function pickOrdered(order: SourceKind[], avail: SourceAvailability): SourceKind[] {
  return order.filter((k) => {
    if (k === "gong") return avail.hasGong;
    if (k === "planning") return avail.hasPlanning;
    if (k === "ae") return avail.hasAe;
    return avail.hasFiles;
  });
}

function computeCoverage(avail: SourceAvailability): PageSourceCoverage {
  return {
    affirm101: pickOrdered(["planning", "gong", "ae", "files"], avail),
    executive: pickOrdered(["gong", "ae", "planning", "files"], avail),
    deal: pickOrdered(["planning", "gong", "files", "ae"], avail),
  };
}

function coverageLabel(kinds: SourceKind[]): string {
  if (kinds.length === 0) return "No structured sources pasted yet";
  const map: Record<SourceKind, string> = {
    gong: "Gong summary",
    planning: "Planning / CRM notes",
    ae: "AE notes",
    files: "Uploaded files",
  };
  return kinds.map((k) => map[k]).join(" · ");
}

export { coverageLabel };

export function buildExecutiveBriefTemplateCopy(input: BriefGenerationInput): ExecutiveBriefTemplateCopy {
  const { sourceText, metadata, sourceAvailability: sa } = input;
  const p = parseAccountPreReadFromSource(sourceText);
  const internalCtx = metadata.optionalInternalContext.trim();
  const aeFromSource = extractAeContext(sourceText);
  const aeContext = internalCtx
    ? [internalCtx, aeFromSource].filter((x) => x.trim().length > 0).join("\n\n")
    : aeFromSource;

  const merchant = coalesce(metadata.merchantName, p.header.accountName);
  const briefDate = coalesce(metadata.briefDate, p.header.lastUpdated);
  const aeLead = coalesce(metadata.aeLead, p.team.aeLead);
  const merchantVertical = optionalMetaLine(metadata.merchantVertical);
  const dealStage = optionalMetaLine(metadata.dealStage);
  const optionalInternalContextDisplay = optionalMetaLine(metadata.optionalInternalContext);
  const salesEngineerFromNotes = p.team.se.trim();

  const mp = p.merchantPriorities.filter((x) => !isMissingToken(x));
  const hasGongContent = sa.hasGong;

  const headlineBase = isMissingToken(merchant)
    ? hasGongContent
      ? STATUS_NOT_IN_GONG
      : STATUS_MISSING
    : `Why Affirm with ${merchant.trim()}: pay-over-time shoppers trust, at scale`;
  const headline = maxWords(headlineBase, 12);

  const valuePropsRaw = tripleToValueProps(mp, p.merchantPriorities, hasGongContent);
  const valueProps: [string, string, string] = [
    oneLine(valuePropsRaw[0], 120),
    oneLine(valuePropsRaw[1], 120),
    oneLine(valuePropsRaw[2], 120),
  ];

  const k = p.kpis;
  const kpiCallouts: [string, string, string] = [
    isMissingToken(k.trailing12MonthGmv)
      ? `TTM GMV: ${sa.hasPlanning ? STATUS_MISSING : STATUS_PULL_PRICING}`
      : oneLine(`TTM GMV: ${k.trailing12MonthGmv.trim()}`, 100),
    isMissingToken(k.yoyGrowth)
      ? `YoY growth: ${sa.hasPlanning ? STATUS_MISSING : STATUS_PULL_PRICING}`
      : oneLine(`YoY growth: ${k.yoyGrowth.trim()}`, 100),
    formatShoppersApprovalLine(
      k.uniqueUsers,
      k.approvalRate,
      sa.hasPlanning ? STATUS_MISSING : STATUS_PULL_PRICING,
    ),
  ];

  let missionIntro = "";
  if (isMissingToken(p.executiveSummary)) {
    missionIntro = hasGongContent ? STATUS_NOT_IN_GONG : STATUS_MISSING;
  } else {
    const core = isMissingToken(merchant)
      ? p.executiveSummary.trim()
      : `Shared focus with ${merchant.trim()}: ${p.executiveSummary.trim()}`;
    missionIntro = maxSentences(oneLine(core, 500), 2);
  }
  if (aeContext.length > 25) {
    const aeLine = maxSentences(oneLine(aeContext, 280), 1);
    if (missionIntro === STATUS_MISSING || missionIntro === STATUS_NOT_IN_GONG) {
      missionIntro = `Leadership context: ${aeLine}`;
    } else {
      missionIntro = `${missionIntro} ${aeLine}`;
      missionIntro = maxSentences(missionIntro, 2);
    }
  }

  const g1 = goalFrom(mp[0], hasGongContent);
  const g2 = goalFrom(mp[1], hasGongContent);
  const g3 = goalFrom(mp[2], hasGongContent);

  const supportingPool = dedupeReadableStrings([
    ...p.keyAsksGivesGets,
    ...p.openItemsNextSteps,
    ...p.anticipatedQa,
  ]).filter((x) => !isMissingToken(x));
  const supportingBullets: string[] = [];
  for (const s of supportingPool) {
    if (supportingBullets.length >= 4) break;
    supportingBullets.push(oneLine(s, 160));
  }
  while (supportingBullets.length < 2) {
    supportingBullets.push(hasGongContent ? STATUS_NOT_IN_GONG : STATUS_MISSING);
    if (supportingBullets.length >= 4) break;
  }
  if (supportingBullets.length === 2 && supportingBullets.every((x) => x === STATUS_NOT_IN_GONG)) {
    (supportingBullets as string[]).push(STATUS_CONFIRM_AE);
  }

  const proposalBullets = toProposalPair(p.commercialSummary, sa.hasPlanning);

  const impactHeadline = isMissingToken(p.marketingSummary)
    ? STATUS_MISSING
    : firstSentenceOrTrim(p.marketingSummary, 180);
  const impactBullets = clampList(
    [...mp.slice(0, 2).map((x) => oneLine(x, 140)), oneLine(p.implementationSummary, 140)].filter(
      (x) => !isMissingToken(x),
    ),
    2,
    4,
    STATUS_MISSING,
  );

  const nextPolished = dedupeReadableStrings(
    p.openItemsNextSteps.filter((x) => !isMissingToken(x)),
  );
  const qaPolished = dedupeReadableStrings(
    p.anticipatedQa.filter((x) => !isMissingToken(x)),
  );
  const depHintsArr = nextPolished.slice(0, 2);
  const depKeys = new Set(depHintsArr.map(normBulletKey));
  const riskPool = dedupeReadableStrings([
    ...qaPolished,
    ...nextPolished.filter((s) => !depKeys.has(normBulletKey(s))),
  ]);
  const openQuestionsRisks = riskPool.length
    ? riskPool
        .slice(0, 8)
        .map((x) => oneLine(x, 200))
        .join("\n\n")
    : hasGongContent
      ? STATUS_NOT_IN_GONG
      : STATUS_MISSING;

  const impl = isMissingToken(p.implementationSummary)
    ? STATUS_PULL_PRICING
    : oneLine(p.implementationSummary, 200);
  const timelineGuess =
    /\b(q[1-4]|h[12]|fy\d{2,4}|\d{1,2}\s*(week|month|day)s?)\b/i.test(p.implementationSummary) &&
    !isMissingToken(p.implementationSummary)
      ? oneLine(p.implementationSummary, 160)
      : STATUS_PULL_PRICING;
  const merchantDependencies = depHintsArr.length
    ? oneLine(depHintsArr.join(" · "), 200)
    : STATUS_CONFIRM_AE;

  const commercialOne = isMissingToken(p.commercialSummary)
    ? STATUS_PULL_PRICING
    : oneLine(p.commercialSummary, 200);

  const dealSummary = {
    merchantPricing: commercialOne,
    fundingSettlement: STATUS_PULL_PRICING,
    promoPrograms: isMissingToken(p.marketingSummary)
      ? STATUS_PULL_PRICING
      : firstSentenceOrTrim(p.marketingSummary, 160),
    termRenewal: /\brenew|msa|term|contract\b/i.test(p.commercialSummary) && !isMissingToken(p.commercialSummary)
      ? oneLine(p.commercialSummary, 180)
      : STATUS_PULL_PRICING,
    accountManager: fillOrStatus(
      isMissingToken(p.team.accountManagementOther) ? "" : p.team.accountManagementOther,
      STATUS_CONFIRM_AE,
    ),
    technicalAccountManager: STATUS_CONFIRM_AE,
    salesEngineer: fillOrStatus(
      isMissingToken(salesEngineerFromNotes) ? "" : salesEngineerFromNotes,
      STATUS_CONFIRM_AE,
    ),
    whatsIncluded: toScopeBullets(
      p.keyAsksGivesGets[0] ?? "",
      p.keyAsksGivesGets[2] ?? "",
      p.keyAsksGivesGets.slice(3),
      2,
      4,
      STATUS_MISSING,
    ),
    whatsNotIncluded: toScopeBullets(
      p.keyAsksGivesGets[1] ?? "",
      "",
      ["Custom dev / one-off integrations", "Non-standard SLA terms"],
      2,
      4,
      STATUS_CONFIRM_AE,
    ),
  };

  if (dealSummary.whatsNotIncluded.every((x) => x === STATUS_CONFIRM_AE)) {
    dealSummary.whatsNotIncluded = [STATUS_CONFIRM_AE, STATUS_PULL_PRICING];
  }

  return {
    briefMeta: {
      merchantName: isMissingToken(merchant) ? STATUS_MISSING : merchant.trim(),
      briefDate: isMissingToken(briefDate) ? STATUS_MISSING : briefDate.trim(),
      merchantVertical,
      dealStage,
      aeLead: isMissingToken(aeLead) ? STATUS_CONFIRM_AE : aeLead.trim(),
      optionalInternalContext: optionalInternalContextDisplay,
    },
    sourceCoverage: computeCoverage(sa),
    affirm101: {
      headline,
      valueProps,
      kpiCallouts,
    },
    executiveSummary: {
      missionIntro,
      goal1: g1,
      goal2: g2,
      goal3: g3,
      supportingBullets,
      proposalBullets,
    },
    expectedImpact: {
      headline: impactHeadline,
      bullets: impactBullets,
    },
    integration: {
      recommendedPath: impl,
      timeline: timelineGuess,
      merchantDependencies,
      openQuestionsRisks,
    },
    dealSummary,
  };
}

function tripleToValueProps(
  mp: string[],
  fallback: string[],
  hasGong: boolean,
): [string, string, string] {
  const src = mp.length ? mp : fallback.filter((x) => !isMissingToken(x));
  const status = hasGong ? STATUS_NOT_IN_GONG : STATUS_MISSING;
  return [
    fillOrStatus(src[0] ?? "", status),
    fillOrStatus(src[1] ?? "", status),
    fillOrStatus(src[2] ?? "", status),
  ];
}

function goalFrom(line: string | undefined, hasGong: boolean): string {
  const status = hasGong ? STATUS_NOT_IN_GONG : STATUS_MISSING;
  if (!line || isMissingToken(line)) return maxWords(status, 10);
  return maxWords(oneLine(line, 120), 10);
}

function clampList(
  items: string[],
  min: number,
  max: number,
  pad: string,
): string[] {
  const out = items.filter(Boolean).slice(0, max);
  while (out.length < min) out.push(pad);
  return out.slice(0, max);
}

function pair(label: string, body: string): string {
  return `${label}\n${body}`;
}

function bulletSection(title: string, items: string[]): string {
  return [title, ...items.map((b) => `• ${b}`)].join("\n");
}

export function templateCopyToBlocks(copy: ExecutiveBriefTemplateCopy): TemplateCopyBlock[] {
  const { briefMeta, affirm101, executiveSummary, expectedImpact, integration, dealSummary } = copy;

  const a = affirm101;
  const affirmText = [
    pair("Merchant", briefMeta.merchantName),
    "",
    pair("Brief date", briefMeta.briefDate),
    "",
    pair("Merchant vertical / category", briefMeta.merchantVertical),
    "",
    pair("Deal stage", briefMeta.dealStage),
    "",
    pair("AE lead", briefMeta.aeLead),
    "",
    pair("Optional internal context", briefMeta.optionalInternalContext),
    "",
    pair("Headline (max 12 words)", a.headline),
    "",
    bulletSection("Value proposition", [...a.valueProps]),
    "",
    bulletSection("KPI / stat callouts", [...a.kpiCallouts]),
  ].join("\n");

  const affirmBulletsOnly = [
    bulletSection("Value proposition", [...a.valueProps]),
    "",
    bulletSection("KPI / stat callouts", [...a.kpiCallouts]),
  ].join("\n");

  const ex = executiveSummary;
  const execCore = [
    "Executive Summary",
    "",
    pair("Shared mission / goals intro (max 2 sentences)", ex.missionIntro),
    "",
    "Goals (max 10 words each)",
    `1. ${ex.goal1}`,
    `2. ${ex.goal2}`,
    `3. ${ex.goal3}`,
    "",
    bulletSection("Supporting points (max 4)", ex.supportingBullets),
    "",
    bulletSection("Proposal (max 2 bullets)", [...ex.proposalBullets]),
  ].join("\n");

  const impactText = [
    "Expected impact / Business case",
    "",
    pair("Headline", expectedImpact.headline),
    "",
    bulletSection("Supporting points", expectedImpact.bullets),
  ].join("\n");

  const execPagePlain = [execCore, "", "— Expected impact / Business case —", "", impactText].join("\n");

  const execBulletsOnly = [
    bulletSection("Executive Summary — supporting points", ex.supportingBullets),
    "",
    bulletSection("Proposal", [...ex.proposalBullets]),
    "",
    bulletSection("Expected impact / Business case", [expectedImpact.headline, ...expectedImpact.bullets]),
  ].join("\n");

  const commercialText = [
    pair("Merchant pricing", dealSummary.merchantPricing),
    "",
    pair("Funding / settlement", dealSummary.fundingSettlement),
    "",
    pair("Promo / special programs", dealSummary.promoPrograms),
    "",
    pair("Term / renewal", dealSummary.termRenewal),
  ].join("\n");

  const integText = [
    pair("Recommended integration path", integration.recommendedPath),
    "",
    pair("Timeline", integration.timeline),
    "",
    pair("Merchant dependencies", integration.merchantDependencies),
    "",
    pair("Open questions / risks", integration.openQuestionsRisks),
  ].join("\n");

  const supportText = [
    pair("Account manager", dealSummary.accountManager),
    "",
    pair("Technical account manager", dealSummary.technicalAccountManager),
    "",
    pair("Sales engineer", dealSummary.salesEngineer),
  ].join("\n");

  const scopeText = [
    bulletSection("What's included", dealSummary.whatsIncluded),
    "",
    bulletSection("What's not included", dealSummary.whatsNotIncluded),
  ].join("\n");

  const dealPagePlain = [
    "Deal Summary — Commercial",
    "",
    commercialText,
    "",
    "Integration",
    "",
    integText,
    "",
    "Deal Summary — Support & contacts",
    "",
    supportText,
    "",
    "Deal Summary — Scope",
    "",
    scopeText,
  ].join("\n");

  const dealBulletsOnly = [
    bulletSection("What's included", dealSummary.whatsIncluded),
    "",
    bulletSection("What's not included", dealSummary.whatsNotIncluded),
  ].join("\n");

  return [
    {
      id: "page-affirm101",
      title: "Affirm 101",
      pasteHint: "Affirm 101 · partnership foundation",
      plainText: affirmText.trim(),
      bulletsPlainText: affirmBulletsOnly.trim(),
    },
    {
      id: "page-executive",
      title: "Executive Summary & expected impact",
      pasteHint: "Executive Summary + Expected impact / Business case",
      plainText: execPagePlain.trim(),
      bulletsPlainText: execBulletsOnly.trim(),
    },
    {
      id: "page-deal",
      title: "Deal Summary & integration",
      pasteHint: "Commercial, Integration, support, scope",
      plainText: dealPagePlain.trim(),
      bulletsPlainText: dealBulletsOnly.trim(),
    },
  ];
}

export async function generateExecutiveBriefTemplateCopy(
  input: BriefGenerationInput,
): Promise<ExecutiveBriefTemplateCopy> {
  await new Promise((r) => setTimeout(r, 450));
  return buildExecutiveBriefTemplateCopy(input);
}
