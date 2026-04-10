import type { AccountPreRead } from "../types/accountPreRead";

/** Shown when the source does not contain a usable value for a field. */
export const PLACEHOLDER_MISSING = "Missing";
export const PLACEHOLDER_NEEDS_INPUT = "Needs input";

function pick(s: string | null | undefined, fallback = PLACEHOLDER_MISSING): string {
  const t = s?.trim();
  return t ? t : fallback;
}

function lines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

/** Match "Label: value" or "Label — value" (case-insensitive). */
/** Trim junk often captured from lists (leading commas, bullets). */
function scrubCapture(s: string): string {
  return s
    .replace(/\r/g, "")
    .replace(/^[,;:\s·•\-–—]+|[,;:\s·•\-–—]+$/g, "")
    .trim();
}

function labeledValue(text: string, labels: string[]): string | null {
  const body = text.replace(/\r/g, "");
  for (const label of labels) {
    const re = new RegExp(
      `(?:^|\\n)\\s*${label}\\s*[:\\-—]\\s*(.+)`,
      "i"
    );
    const m = body.match(re);
    if (m?.[1]) {
      const line = scrubCapture(m[1].split(/\n/)[0] ?? "");
      if (line.length > 1) return line;
    }
  }
  return null;
}

function bulletsUnderHeading(text: string, headingHints: RegExp): string[] {
  const parts = text.split(headingHints);
  if (parts.length < 2) return [];
  const chunk = parts[1]!.split(/\n\n/)[0] ?? "";
  const out: string[] = [];
  for (const line of lines(chunk)) {
    const bullet = line.replace(/^[-*•\d.)]+\s*/, "").trim();
    if (bullet.length > 2) out.push(bullet);
    if (out.length >= 8) break;
  }
  return out;
}

function inferVenue(text: string): string | null {
  const t = text.toLowerCase();
  if (/\bzoom\b/.test(t)) return "Zoom";
  if (/\bteams\b|\bmicrosoft teams\b/.test(t)) return "Microsoft Teams";
  if (/\bin[- ]person\b|\bon[- ]site\b|\boffice\b/.test(t)) return "In person";
  if (/\bphone\b|\bcall\b/.test(t)) return "Phone";
  return labeledValue(text, ["venue", "location", "where"]);
}

function inferDuration(text: string): string | null {
  const m = text.match(/\b(\d+)\s*(min|minutes?|hr|hours?|h)\b/i);
  if (m) return `${m[1]} ${m[2]!.toLowerCase().startsWith("h") ? "hour(s)" : "minutes"}`;
  return labeledValue(text, ["duration", "length", "time"]);
}

function inferAccountName(text: string): string | null {
  return (
    labeledValue(text, [
      "account\\s*name",
      "customer",
      "merchant",
      "company",
      "retailer",
      "account",
    ]) || null
  );
}

function inferMeetingName(text: string): string | null {
  return (
    labeledValue(text, [
      "presentation",
      "meeting\\s*name",
      "meeting",
      "session",
      "qbr",
      "briefing",
    ]) || null
  );
}

function inferDate(text: string): string | null {
  const fromLabel = labeledValue(text, ["last updated", "updated", "date", "as of"]);
  if (fromLabel && fromLabel.length < 80) return fromLabel;
  const m = text.match(
    /\b(\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4})\b/i
  );
  return m?.[1] ?? null;
}

function inferKpi(text: string, patterns: RegExp[], labelFallback: string[]): string | null {
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1]) {
      const v = scrubCapture(m[1]!);
      if (v.length > 0) return v;
    }
  }
  const lv = labeledValue(text, labelFallback);
  return lv;
}

function validGmvToken(s: string | null): string | null {
  if (!s) return null;
  const t = scrubCapture(s);
  if (t.length < 1 || !/\d/.test(t)) return null;
  return t;
}

function validYoyToken(s: string | null): string | null {
  if (!s) return null;
  const t = scrubCapture(s);
  if (!/%/.test(t) || t.length < 2) return null;
  return t;
}

function validUsersToken(s: string | null): string | null {
  if (!s) return null;
  const t = scrubCapture(s);
  if (t.length < 2 || !/\d/.test(t)) return null;
  if (/^[,·•\s]+$/.test(t)) return null;
  return t;
}

function validApprovalToken(s: string | null): string | null {
  if (!s) return null;
  const t = scrubCapture(s);
  if (!/^\d/.test(t) && !/%/.test(t)) return null;
  if (!/%/.test(t) && t.length < 2) return null;
  return t;
}

function inferTeamRole(text: string, labels: string[]): string | null {
  return labeledValue(text, labels);
}

function firstParagraph(text: string, maxLen: number): string {
  const t = text.replace(/\r/g, "").trim();
  if (!t) return "";
  const para = t.split(/\n\s*\n/)[0]?.replace(/\n/g, " ").trim() ?? t;
  const scrubbed = scrubCapture(para);
  if (scrubbed.length <= maxLen) return endAtSentenceBoundary(scrubbed, maxLen);
  const cut = scrubbed.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(" ");
  const base = (lastSpace > 40 ? cut.slice(0, lastSpace) : cut).trim();
  return endAtSentenceBoundary(base, maxLen) + "…";
}

/** Prefer stopping on a full sentence so we don't end on "and he will…". */
function endAtSentenceBoundary(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s;
  const chunk = s.slice(0, maxLen);
  const m = chunk.match(/^([\s\S]*[.!?])(?=\s|$)/);
  if (m?.[1] && m[1].length > 60) return m[1].trim();
  return chunk.trim();
}

function sectionAfterHeading(text: string, re: RegExp, maxLen: number): string {
  const m = text.split(re);
  if (m.length < 2) return "";
  const rest = m.slice(1).join(" ").trim();
  return firstParagraph(rest, maxLen);
}

function ensureList(items: string[], minItems = 1): string[] {
  const cleaned = items.map((s) => s.trim()).filter(Boolean);
  if (cleaned.length >= minItems) return cleaned;
  return [PLACEHOLDER_NEEDS_INPUT];
}

/**
 * Heuristic pass over pasted Gong notes, planning docs, etc.
 * Replace with model / Gong pipeline later; keep this function name for a clean swap.
 */
export function parseAccountPreReadFromSource(raw: string): AccountPreRead {
  const text = raw.trim();
  const lower = text.toLowerCase();

  const accountName = pick(inferAccountName(text));
  const presentationMeetingName = pick(inferMeetingName(text));
  const lastUpdated = pick(inferDate(text));
  const venue = pick(inferVenue(text));
  const duration = pick(inferDuration(text));

  const gmvRaw =
    inferKpi(
      text,
      [
        /(?:ttm|trailing)\s*(?:12|twelve)[^\n$]*?\$?\s*([\d,.]+(?:\s*(?:mm?|m|bn?|b|k))?)/i,
        /\$?\s*([\d,.]+(?:\s*(?:mm?|m|bn?|b|k))?)\s*(?:gmv|gross\s*merchandise)/i,
        /gmv\s*[:#]?\s*\$?\s*([\d,.]+(?:\s*(?:mm?|m|bn?|b|k))?)/i,
      ],
      ["gmv", "ttm gmv", "12m gmv", "volume"]
    ) ?? null;
  const gmv = validGmvToken(gmvRaw);

  const yoyRaw =
    inferKpi(
      text,
 [
        /([+\-]?\d+(?:\.\d+)?%)\s*(?:yoy|y\/o\/y|year[-\s]*over[-\s]*year)/i,
        /(?:yoy|growth)\s*[:#]?\s*([+\-]?\d+(?:\.\d+)?%)/i,
      ],
      ["yoy", "y\/y growth", "growth"]
    ) ?? null;
  const yoy = validYoyToken(yoyRaw);

  const usersRaw =
    inferKpi(
      text,
      [
        /([\d,.]+[kmb]?)\s*(?:unique\s*users?|monthly\s*active|mau)/i,
        /(?:unique\s*users?|mau)\s*[:#]?\s*([\d,.]+[kmb]?)/i,
      ],
      ["unique users", "mau"]
    ) ?? null;
  const users = validUsersToken(usersRaw);

  const approvalRaw =
    inferKpi(
      text,
      [
        /([\d.]+%)\s*(?:approval|auth\s*rate|auth\s*approval)/i,
        /approval\s*(?:rate)?\s*[:#]?\s*([\d.]+%)/i,
      ],
      ["approval rate", "auth rate", "approval"]
    ) ?? null;
  const approval = validApprovalToken(approvalRaw);

  const aeLead = pick(
    inferTeamRole(text, ["ae\\s*lead", "account executive", "\\bae\\b", "rep"])
  );
  const salesLeader = pick(
    inferTeamRole(text, ["sales\\s*leader", "rvp", "vp\\s*sales", "director\\s*sales"])
  );
  const se = pick(inferTeamRole(text, ["\\bse\\b", "sales engineer", "solutions engineer", "sa\\b"]));
  const accountManagementOther = pick(
    inferTeamRole(text, ["account\\s*management", "\\bam\\b", "csm", "team"])
  );

  let executiveSummary =
    sectionAfterHeading(text, /executive\s*summary\s*[:#]?\s*/i, 520) ||
    sectionAfterHeading(text, /summary\s*[:#]?\s*/i, 400);
  if (!executiveSummary && text.length > 40) {
    executiveSummary = firstParagraph(text, 480);
  }
  executiveSummary = pick(scrubCapture(executiveSummary || ""), PLACEHOLDER_NEEDS_INPUT);

  let mp = bulletsUnderHeading(text, /\bmerchant\s*priorities?\b/i);
  if (mp.length === 0) {
    mp = bulletsUnderHeading(text, /\bgoals?\b/i);
  }
  if (mp.length === 0 && /priority|priorities|focus areas?/i.test(lower)) {
    mp = bulletsUnderHeading(text, /\bpriorities?\b|\bfocus\b/i);
  }
  mp = ensureList(mp.map((b) => scrubCapture(b)).filter((b) => b.length >= 2));

  let kg = bulletsUnderHeading(text, /\basks?\b|\bgive[s]?[-\s]*get/i);
  if (kg.length === 0) {
    kg = bulletsUnderHeading(text, /\bcommercial\s*terms?\b|\bdeal\s*structure\b/i);
  }
  kg = ensureList(kg.map((b) => scrubCapture(b)).filter((b) => b.length >= 2));

  let commercial = sectionAfterHeading(text, /\bcommercial\s*summary\b/i, 450);
  if (!commercial) commercial = sectionAfterHeading(text, /\bpricing\b|\bmsa\b|\bcontract\b/i, 320);
  commercial = pick(scrubCapture(commercial || ""), PLACEHOLDER_NEEDS_INPUT);

  let impl = sectionAfterHeading(text, /\bimplementation\s*summary\b/i, 450);
  if (!impl) impl = sectionAfterHeading(text, /\bintegration\b|\brollout\b|\btimeline\b/i, 320);
  impl = pick(scrubCapture(impl || ""), PLACEHOLDER_NEEDS_INPUT);

  let mkt = sectionAfterHeading(text, /\bmarketing\s*summary\b/i, 450);
  if (!mkt) mkt = sectionAfterHeading(text, /\bco-?marketing\b|\bcampaign\b/i, 280);
  mkt = pick(scrubCapture(mkt || ""), PLACEHOLDER_NEEDS_INPUT);

  let qa = bulletsUnderHeading(text, /\banticipated\s*q\s*&\s*a\b|\bq\s*&\s*a\b|\banticipated\s*questions?\b/i);
  if (qa.length === 0) qa = bulletsUnderHeading(text, /\bobjections?\b|\bconcerns?\b/i);
  qa = ensureList(qa.map((b) => scrubCapture(b)).filter((b) => b.length >= 2));

  let next = bulletsUnderHeading(text, /\bopen\s*items?\b|\bnext\s*steps?\b|\baction\s*items?\b/i);
  if (next.length === 0) next = bulletsUnderHeading(text, /\bfollow[-\s]*up\b/i);
  next = ensureList(next.map((b) => scrubCapture(b)).filter((b) => b.length >= 2));

  return {
    header: {
      accountName,
      presentationMeetingName,
      lastUpdated,
      venue,
      duration,
    },
    kpis: {
      trailing12MonthGmv: pick(gmv),
      yoyGrowth: pick(yoy),
      uniqueUsers: pick(users),
      approvalRate: pick(approval),
    },
    team: {
      aeLead,
      salesLeader,
      se,
      accountManagementOther,
    },
    executiveSummary,
    merchantPriorities: mp,
    keyAsksGivesGets: kg,
    commercialSummary: commercial,
    implementationSummary: impl,
    marketingSummary: mkt,
    anticipatedQa: qa,
    openItemsNextSteps: next,
  };
}

export async function generateAccountPreRead(sourceText: string): Promise<AccountPreRead> {
  await new Promise((r) => setTimeout(r, 550));
  return parseAccountPreReadFromSource(sourceText);
}
