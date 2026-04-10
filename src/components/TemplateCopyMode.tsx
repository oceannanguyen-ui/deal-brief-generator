import { useCallback, useMemo, useState } from "react";
import { coverageLabel } from "../services/generateExecutiveBriefCopy";
import type { ExecutiveBriefTemplateCopy, TemplateCopyBlock } from "../types/executiveBriefCopy";
import {
  META_OPTIONAL_EMPTY,
  STATUS_CONFIRM_AE,
  STATUS_MISSING,
  STATUS_NOT_IN_GONG,
  STATUS_PULL_PRICING,
} from "../types/executiveBriefCopy";

type Props = {
  copy: ExecutiveBriefTemplateCopy;
  blocks: TemplateCopyBlock[];
};

const PLACEHOLDER_PHRASES = new Set([
  "Needs input",
  "Missing",
  STATUS_MISSING,
  STATUS_CONFIRM_AE,
  STATUS_PULL_PRICING,
  STATUS_NOT_IN_GONG,
]);

function isPh(s: string): boolean {
  return PLACEHOLDER_PHRASES.has(s.trim());
}

function isOptionalMetaEmpty(s: string): boolean {
  return s.trim() === META_OPTIONAL_EMPTY;
}

function splitKpiLine(line: string): { label: string; value: string } {
  const i = line.indexOf(":");
  if (i === -1) return { label: "Metric", value: line.trim() };
  return { label: line.slice(0, i).trim(), value: line.slice(i + 1).trim() };
}

export function TemplateCopyMode({ copy, blocks }: Props) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const byId = useMemo(() => Object.fromEntries(blocks.map((b) => [b.id, b])), [blocks]);

  const flash = useCallback((key: string) => {
    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey((c) => (c === key ? null : c)), 2000);
  }, []);

  const copyText = useCallback(
    async (key: string, text: string) => {
      try {
        await navigator.clipboard.writeText(text);
        flash(key);
      } catch {
        setCopiedKey(null);
      }
    },
    [flash],
  );

  const {
    briefMeta,
    sourceCoverage,
    affirm101,
    executiveSummary,
    expectedImpact,
    integration,
    dealSummary,
  } = copy;

  const b1 = byId["page-affirm101"];
  const b2 = byId["page-executive"];
  const b3 = byId["page-deal"];

  return (
    <div className="eb-preview">
      <header className="eb-preview-intro no-print">
        <h2 className="eb-preview-intro-title">Executive Brief · draft preview</h2>
        <p className="eb-preview-intro-sub">
          Open your <strong>Executive Brief template</strong> (slide deck or doc) and paste this draft into
          the matching sections—<strong>Affirm 101</strong>, <strong>Executive Summary</strong>,{" "}
          <strong>Expected impact / Business case</strong>, <strong>Integration</strong>, and{" "}
          <strong>Deal Summary</strong> (commercial, support, scope). Add or edit anything that should be
          tailored for this account. Use <strong>Copy page text</strong> for a full block,{" "}
          <strong>Copy bullets only</strong> for lists, and <strong>Copy row</strong> on deal tables where
          you only need one line.
        </p>
      </header>

      {/* Page 1 */}
      <article className="eb-sheet">
        <div className="eb-sheet-toolbar eb-sheet-toolbar-split no-print">
          <div className="eb-toolbar-left">
            {b1 && <span className="eb-paste-hint">{b1.pasteHint}</span>}
            <p className="eb-source-coverage">
              <span className="eb-source-coverage-label">Source coverage</span>
              {coverageLabel(sourceCoverage.affirm101)}
            </p>
          </div>
          <div className="eb-toolbar-actions">
            <button
              type="button"
              className="eb-btn-copy eb-btn-copy-ghost"
              disabled={!b1}
              onClick={() => b1 && copyText("p1-bullets", b1.bulletsPlainText)}
            >
              {copiedKey === "p1-bullets" ? "Copied" : "Copy bullets only"}
            </button>
            <button
              type="button"
              className="eb-btn-copy"
              disabled={!b1}
              onClick={() => b1 && copyText("p1-full", b1.plainText)}
            >
              {copiedKey === "p1-full" ? "Copied" : "Copy page text"}
            </button>
          </div>
        </div>

        <div className="eb-hero">
          <p className="eb-hero-eyebrow">Partnership foundation</p>
          <h3 className="eb-hero-display">Affirm 101</h3>
          <p className={`eb-hero-lede${isPh(affirm101.headline) ? " eb-ph" : ""}`}>{affirm101.headline}</p>
        </div>

        <div className="eb-sheet-body">
          <div className="eb-meta-grid">
            <div className="eb-meta-item">
              <span className="eb-meta-label">Merchant</span>
              <span className={isPh(briefMeta.merchantName) ? "eb-ph" : undefined}>{briefMeta.merchantName}</span>
            </div>
            <div className="eb-meta-item">
              <span className="eb-meta-label">Brief date</span>
              <span className={isPh(briefMeta.briefDate) ? "eb-ph" : undefined}>{briefMeta.briefDate}</span>
            </div>
            <div className="eb-meta-item">
              <span className="eb-meta-label">AE lead</span>
              <span className={isPh(briefMeta.aeLead) ? "eb-ph" : undefined}>{briefMeta.aeLead}</span>
            </div>
            <div className="eb-meta-item">
              <span className="eb-meta-label">Vertical / category</span>
              <span
                className={
                  isOptionalMetaEmpty(briefMeta.merchantVertical) ? "eb-meta-optional-empty" : undefined
                }
              >
                {briefMeta.merchantVertical}
              </span>
            </div>
            <div className="eb-meta-item">
              <span className="eb-meta-label">Deal stage</span>
              <span className={isOptionalMetaEmpty(briefMeta.dealStage) ? "eb-meta-optional-empty" : undefined}>
                {briefMeta.dealStage}
              </span>
            </div>
            <div className="eb-meta-item eb-meta-item-span">
              <span className="eb-meta-label">Optional internal context</span>
              <span
                className={
                  isOptionalMetaEmpty(briefMeta.optionalInternalContext) ? "eb-meta-optional-empty" : undefined
                }
              >
                {briefMeta.optionalInternalContext}
              </span>
            </div>
          </div>

          <div className="eb-rule" />

          <h4 className="eb-block-title">Value proposition</h4>
          <ul className="eb-clean-list">
            {affirm101.valueProps.map((line, i) => (
              <li key={i} className={isPh(line) ? "eb-ph" : undefined}>
                {line}
              </li>
            ))}
          </ul>

          <h4 className="eb-block-title">Key metrics</h4>
          <div className="eb-kpi-grid">
            {affirm101.kpiCallouts.map((line, i) => {
              const { label, value } = splitKpiLine(line);
              const ph = isPh(line) || isPh(value);
              return (
                <div key={i} className={`eb-kpi-tile${ph ? " eb-kpi-tile-ph" : ""}`}>
                  <span className="eb-kpi-tile-label">{label}</span>
                  <span className="eb-kpi-tile-value">{value}</span>
                </div>
              );
            })}
          </div>
        </div>
      </article>

      {/* Page 2 */}
      <article className="eb-sheet">
        <div className="eb-sheet-toolbar eb-sheet-toolbar-split no-print">
          <div className="eb-toolbar-left">
            {b2 && <span className="eb-paste-hint">{b2.pasteHint}</span>}
            <p className="eb-source-coverage">
              <span className="eb-source-coverage-label">Source coverage</span>
              {coverageLabel(sourceCoverage.executive)}
            </p>
          </div>
          <div className="eb-toolbar-actions">
            <button
              type="button"
              className="eb-btn-copy eb-btn-copy-ghost"
              disabled={!b2}
              onClick={() => b2 && copyText("p2-bullets", b2.bulletsPlainText)}
            >
              {copiedKey === "p2-bullets" ? "Copied" : "Copy bullets only"}
            </button>
            <button
              type="button"
              className="eb-btn-copy"
              disabled={!b2}
              onClick={() => b2 && copyText("p2-full", b2.plainText)}
            >
              {copiedKey === "p2-full" ? "Copied" : "Copy page text"}
            </button>
          </div>
        </div>

        <header className="eb-page-head">
          <h3 className="eb-page-head-title">Executive Summary</h3>
          <p className="eb-page-head-sub">Mission, goals, supporting context &amp; proposal</p>
          <p className="eb-page-head-line" aria-hidden />
        </header>

        <div className="eb-sheet-body">
          <h4 className="eb-block-title">Shared mission &amp; goals</h4>
          <p className={`eb-prose eb-intro${isPh(executiveSummary.missionIntro) ? " eb-ph" : ""}`}>
            {executiveSummary.missionIntro}
          </p>

          <div className="eb-goal-row">
            {[
              executiveSummary.goal1,
              executiveSummary.goal2,
              executiveSummary.goal3,
            ].map((g, i) => (
              <div key={i} className={`eb-goal-card${isPh(g) ? " eb-goal-card-ph" : ""}`}>
                <span className="eb-goal-index">Goal {i + 1}</span>
                <p className="eb-goal-text">{g}</p>
              </div>
            ))}
          </div>

          <div className="eb-exec-split">
            <div className="eb-exec-main">
              <h4 className="eb-block-title">Supporting context</h4>
              <ul className="eb-clean-list eb-support-list">
                {executiveSummary.supportingBullets.map((line, i) => (
                  <li key={i} className={isPh(line) ? "eb-ph" : undefined}>
                    {line}
                  </li>
                ))}
              </ul>

              <h4 className="eb-block-title">Expected impact / Business case</h4>
              <p className={`eb-prose eb-impact-head${isPh(expectedImpact.headline) ? " eb-ph" : ""}`}>
                {expectedImpact.headline}
              </p>
              <ul className="eb-clean-list">
                {expectedImpact.bullets.map((line, i) => (
                  <li key={i} className={isPh(line) ? "eb-ph" : undefined}>
                    {line}
                  </li>
                ))}
              </ul>
            </div>

            <aside
              className={`eb-proposal-box${executiveSummary.proposalBullets.every(isPh) ? " eb-proposal-box-ph" : ""}`}
            >
              <h4 className="eb-proposal-box-title">Proposal</h4>
              <ul className="eb-proposal-bullets">
                {executiveSummary.proposalBullets.map((line, i) => (
                  <li key={i} className={isPh(line) ? "eb-ph" : undefined}>
                    {line}
                  </li>
                ))}
              </ul>
            </aside>
          </div>
        </div>
      </article>

      {/* Page 3 */}
      <article className="eb-sheet">
        <div className="eb-sheet-toolbar eb-sheet-toolbar-split no-print">
          <div className="eb-toolbar-left">
            {b3 && <span className="eb-paste-hint">{b3.pasteHint}</span>}
            <p className="eb-source-coverage">
              <span className="eb-source-coverage-label">Source coverage</span>
              {coverageLabel(sourceCoverage.deal)}
            </p>
          </div>
          <div className="eb-toolbar-actions">
            <button
              type="button"
              className="eb-btn-copy eb-btn-copy-ghost"
              disabled={!b3}
              onClick={() => b3 && copyText("p3-bullets", b3.bulletsPlainText)}
            >
              {copiedKey === "p3-bullets" ? "Copied" : "Copy bullets only"}
            </button>
            <button
              type="button"
              className="eb-btn-copy"
              disabled={!b3}
              onClick={() => b3 && copyText("p3-full", b3.plainText)}
            >
              {copiedKey === "p3-full" ? "Copied" : "Copy page text"}
            </button>
          </div>
        </div>

        <header className="eb-page-head">
          <h3 className="eb-page-head-title">Deal Summary</h3>
          <p className="eb-page-head-sub">Commercial, integration, contacts &amp; scope</p>
          <p className="eb-page-head-line" aria-hidden />
        </header>

        <div className="eb-sheet-body">
          <section className="eb-table-block">
            <h4 className="eb-table-block-title">Commercial</h4>
            <div className="eb-table">
              <DealRow
                label="Merchant pricing"
                value={dealSummary.merchantPricing}
                copyKey="d-price"
                copiedKey={copiedKey}
                onCopy={copyText}
              />
              <DealRow
                label="Funding / settlement"
                value={dealSummary.fundingSettlement}
                copyKey="d-fund"
                copiedKey={copiedKey}
                onCopy={copyText}
              />
              <DealRow
                label="Promo / special programs"
                value={dealSummary.promoPrograms}
                copyKey="d-promo"
                copiedKey={copiedKey}
                onCopy={copyText}
              />
              <DealRow
                label="Term / renewal"
                value={dealSummary.termRenewal}
                copyKey="d-term"
                copiedKey={copiedKey}
                onCopy={copyText}
              />
            </div>
          </section>

          <section className="eb-table-block">
            <h4 className="eb-table-block-title">Integration</h4>
            <div className="eb-table">
              <DealRow
                label="Recommended path"
                value={integration.recommendedPath}
                copyKey="d-path"
                copiedKey={copiedKey}
                onCopy={copyText}
              />
              <DealRow
                label="Timeline"
                value={integration.timeline}
                copyKey="d-time"
                copiedKey={copiedKey}
                onCopy={copyText}
              />
              <DealRow
                label="Merchant dependencies"
                value={integration.merchantDependencies}
                copyKey="d-dep"
                copiedKey={copiedKey}
                onCopy={copyText}
              />
              <DealRow
                label="Open questions / risks"
                value={integration.openQuestionsRisks}
                copyKey="d-risk"
                copiedKey={copiedKey}
                onCopy={copyText}
              />
            </div>
          </section>

          <section className="eb-table-block">
            <h4 className="eb-table-block-title">Deal support</h4>
            <div className="eb-table">
              <DealRow
                label="Account manager"
                value={dealSummary.accountManager}
                copyKey="d-am"
                copiedKey={copiedKey}
                onCopy={copyText}
              />
              <DealRow
                label="Technical account manager"
                value={dealSummary.technicalAccountManager}
                copyKey="d-tam"
                copiedKey={copiedKey}
                onCopy={copyText}
              />
              <DealRow
                label="Sales engineer"
                value={dealSummary.salesEngineer}
                copyKey="d-se"
                copiedKey={copiedKey}
                onCopy={copyText}
              />
            </div>
          </section>

          <div className="eb-dual-cards">
            <div className={`eb-large-card${dealSummary.whatsIncluded.every(isPh) ? " eb-large-card-ph" : ""}`}>
              <h4 className="eb-large-card-title">What&apos;s included</h4>
              <ul className="eb-large-card-list">
                {dealSummary.whatsIncluded.map((line, i) => (
                  <li key={i} className={isPh(line) ? "eb-ph" : undefined}>
                    {line}
                  </li>
                ))}
              </ul>
            </div>
            <div
              className={`eb-large-card${dealSummary.whatsNotIncluded.every(isPh) ? " eb-large-card-ph" : ""}`}
            >
              <h4 className="eb-large-card-title">What&apos;s not included</h4>
              <ul className="eb-large-card-list">
                {dealSummary.whatsNotIncluded.map((line, i) => (
                  <li key={i} className={isPh(line) ? "eb-ph" : undefined}>
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </article>
    </div>
  );
}

function DealRow({
  label,
  value,
  copyKey,
  copiedKey,
  onCopy,
}: {
  label: string;
  value: string;
  copyKey: string;
  copiedKey: string | null;
  onCopy: (key: string, text: string) => void;
}) {
  const ph = isPh(value);
  return (
    <div className={`eb-table-row${ph ? " eb-table-row-ph" : ""}`}>
      <span className="eb-table-label">{label}</span>
      <div className="eb-table-value-cell">
        <span className="eb-table-value">{value}</span>
        <button
          type="button"
          className="eb-row-copy no-print"
          onClick={() => onCopy(copyKey, `${label}: ${value}`)}
        >
          {copiedKey === copyKey ? "Copied" : "Copy row"}
        </button>
      </div>
    </div>
  );
}
