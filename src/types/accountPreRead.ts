/**
 * One-page account pre-read / executive deal brief template.
 * Populated from pasted source (mock heuristics today; replace with OpenAI / Gong later).
 */
export type AccountPreReadHeader = {
  accountName: string;
  presentationMeetingName: string;
  lastUpdated: string;
  venue: string;
  duration: string;
};

export type AccountPreReadKpis = {
  trailing12MonthGmv: string;
  yoyGrowth: string;
  uniqueUsers: string;
  approvalRate: string;
};

export type AccountPreReadTeam = {
  aeLead: string;
  salesLeader: string;
  se: string;
  accountManagementOther: string;
};

export type AccountPreRead = {
  header: AccountPreReadHeader;
  kpis: AccountPreReadKpis;
  team: AccountPreReadTeam;
  executiveSummary: string;
  merchantPriorities: string[];
  keyAsksGivesGets: string[];
  commercialSummary: string;
  implementationSummary: string;
  marketingSummary: string;
  anticipatedQa: string[];
  openItemsNextSteps: string[];
};
