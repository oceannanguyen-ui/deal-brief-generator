import { useCallback, useMemo, useRef, useState } from "react";
import { TemplateCopyMode } from "./components/TemplateCopyMode";
import {
  buildPreReadSource,
  extractTextFromFile,
  isSupportedFile,
  SUPPORTED_EXTENSIONS,
} from "./services/fileTextExtraction";
import {
  generateExecutiveBriefTemplateCopy,
  templateCopyToBlocks,
} from "./services/generateExecutiveBriefCopy";
import type { AeBriefMetadata, ExecutiveBriefTemplateCopy } from "./types/executiveBriefCopy";
import "./App.css";

const HEADING_GONG = "Gong Summary / Call Notes";
const HEADING_PLANNING = "Planning Doc / CRM Notes";
const HEADING_AE = "AE Notes / Leadership Context";

const PLACEHOLDER_GONG = `Example (replace with your notes):

Stakeholders: VP Payments (Sarah Chen), Dir Store Ops (Marcus Lee)

Goals: Lift auth rates in Canada; reduce manual reconciliation hours.

Objections / concerns: "We need finalized SOC 2 answers before procurement will engage."

Next steps: Send security packet by Fri; schedule SE deep-dive on webhooks week of 4/14.

Quote: "If we can't get a pilot on the calendar in Q3, we lose the renewal window with the board."`;

const PLACEHOLDER_PLANNING = `Example (replace with your context):

Account: Northwind Retail Co.
Last updated: April 9, 2026
Category: Specialty retail / DTC

GMV (TTM): $42M · YoY growth: +18%
Unique users: 1.2M · Approval rate: 91%

Team — AE lead: Jordan Lee · SE: Priya Nair · AM: Alex Kim

Commercial: MSA renews Aug 1; discussing tiered take rate vs. flat bps.

Implementation: Sandbox is live; targeting pilot region then chain-wide rollout.

Open items: Legal redlines on SLA; confirm CA data residency for stores.`;

const PLACEHOLDER_AE = `Example (replace with your nuance):

Emphasize total cost of ownership vs. Vendor X — they are anchoring on headline price only.

Sensitive: do not reference last year's competitor outage on this account.

Leadership wants a recognizable retail logo for the earnings narrative — flag if we can announce a pilot.`;

const SAMPLE_MERCHANT_META: AeBriefMetadata = {
  merchantName: "Northwind Retail Co.",
  briefDate: "April 9, 2026",
  merchantVertical: "Specialty retail / omnichannel",
  dealStage: "Evaluation — commercial & integration alignment",
  aeLead: "Jordan Lee",
  optionalInternalContext:
    "Leadership cares about repeat purchase rate and clean settlement reporting; avoid anchoring on headline discount alone.",
};

const SAMPLE_MERCHANT_GONG = `Goals: Grow basket size in key categories; lift digital conversion on pickup and same-day channels.

Objections: Need clear settlement timing and policy alignment on regulated SKUs.

Stakeholders: VP Digital Payments, Director Store Operations.

Next steps: Align on pilot scope in two regions before the next fiscal checkpoint.

Quote: "If we can lift AOV without adding friction at pickup, leadership will sponsor a broader rollout."`;

const SAMPLE_MERCHANT_PLANNING = `Account: Northwind Retail Co.
Last updated: April 9, 2026
Category: Specialty retail / omnichannel

GMV (TTM): $48M digital eligible · YoY growth: +12%
Unique users: 2.1M · Approval rate: 89%

Team — AE lead: Jordan Lee · SE: Priya Nair · AM: Alex Kim

Commercial: MSA amendment in discussion; tiered merchant discount vs. promo fund under review.

Implementation: Commerce platform path; sandbox in progress; certain SKU classes excluded in phase 1.

Open items: Legal review of disclosures; confirm card-present eligibility for in-store lanes only.`;

const SAMPLE_MERCHANT_AE = `Emphasize network reach and repeat usage with Affirm's shopper base.

Sensitive: avoid naming competitor pilot assumptions in external decks.

Leadership wants a measurable conversion lift narrative for the executive readout.`;

const emptyMetadata = (): AeBriefMetadata => ({
  merchantName: "",
  briefDate: "",
  merchantVertical: "",
  dealStage: "",
  aeLead: "",
  optionalInternalContext: "",
});

type UploadedFileState = {
  id: string;
  name: string;
  status: "extracting" | "ready" | "error";
  text: string;
  error?: string;
};

export default function App() {
  const [metadata, setMetadata] = useState<AeBriefMetadata>(() => emptyMetadata());
  const [gongNotes, setGongNotes] = useState("");
  const [planningNotes, setPlanningNotes] = useState("");
  const [aeNotes, setAeNotes] = useState("");
  const [files, setFiles] = useState<UploadedFileState[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [templateCopy, setTemplateCopy] = useState<ExecutiveBriefTemplateCopy | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const combinedSource = useMemo(() => {
    const ready = files
      .filter((f) => f.status === "ready")
      .map((f) => ({ fileName: f.name, text: f.text }));
    return buildPreReadSource(
      [
        { heading: HEADING_GONG, text: gongNotes },
        { heading: HEADING_PLANNING, text: planningNotes },
        { heading: HEADING_AE, text: aeNotes },
      ],
      ready,
    );
  }, [gongNotes, planningNotes, aeNotes, files]);

  const sourceStats = useMemo(() => {
    const sectionChars =
      gongNotes.trim().length + planningNotes.trim().length + aeNotes.trim().length;
    const fileChars = files
      .filter((f) => f.status === "ready")
      .reduce((sum, f) => sum + f.text.length, 0);
    return {
      sectionsPresent: sectionChars > 0,
      sectionChars,
      uploadCount: files.length,
      fileChars,
    };
  }, [gongNotes, planningNotes, aeNotes, files]);

  const hasExtracting = files.some((f) => f.status === "extracting");

  const sourceAvailability = useMemo(
    () => ({
      hasGong: gongNotes.trim().length > 0,
      hasPlanning: planningNotes.trim().length > 0,
      hasAe: aeNotes.trim().length > 0,
      hasFiles: files.some((f) => f.status === "ready" && f.text.trim().length > 0),
    }),
    [gongNotes, planningNotes, aeNotes, files],
  );

  const copyBlocks = useMemo(
    () => (templateCopy ? templateCopyToBlocks(templateCopy) : []),
    [templateCopy],
  );

  const enqueueFiles = useCallback((list: FileList | File[]) => {
    const picked = Array.from(list).filter(isSupportedFile);
    if (picked.length === 0) return;

    const newRows: UploadedFileState[] = picked.map((file) => ({
      id: crypto.randomUUID(),
      name: file.name,
      status: "extracting",
      text: "",
    }));

    setFiles((prev) => [...prev, ...newRows]);

    picked.forEach((file, i) => {
      const id = newRows[i]!.id;
      extractTextFromFile(file)
        .then((text) => {
          setFiles((prev) =>
            prev.map((row) => (row.id === id ? { ...row, status: "ready", text } : row)),
          );
        })
        .catch((err) => {
          const message = err instanceof Error ? err.message : "Could not read file.";
          setFiles((prev) =>
            prev.map((row) =>
              row.id === id ? { ...row, status: "error", text: "", error: message } : row,
            ),
          );
        });
    });
  }, []);

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const loadSampleMerchantInput = useCallback(() => {
    setMetadata(SAMPLE_MERCHANT_META);
    setGongNotes(SAMPLE_MERCHANT_GONG);
    setPlanningNotes(SAMPLE_MERCHANT_PLANNING);
    setAeNotes(SAMPLE_MERCHANT_AE);
    setTemplateCopy(null);
    setError(null);
  }, []);

  const onGenerate = useCallback(async () => {
    setError(null);
    setLoading(true);
    setTemplateCopy(null);
    try {
      const result = await generateExecutiveBriefTemplateCopy({
        sourceText: combinedSource,
        metadata,
        sourceAvailability,
      });
      setTemplateCopy(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }, [combinedSource, metadata, sourceAvailability]);

  const setMeta = useCallback(<K extends keyof AeBriefMetadata>(key: K, value: AeBriefMetadata[K]) => {
    setMetadata((m) => ({ ...m, [key]: value }));
  }, []);

  return (
    <div className="app">
      <header className="shell-header no-print">
        <div className="shell-header-inner">
          <div className="shell-brand">
            <span className="shell-brand-mark" aria-hidden />
            <div>
              <h1 className="shell-title">Executive Brief · draft builder</h1>
              <p className="shell-sub">
                Prototype · high-level executive brief copy from Gong, CRM, and AE context
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className="workspace">
        <aside className="source-panel no-print" aria-labelledby="source-heading">
          <div className="source-panel-head">
            <h2 id="source-heading" className="source-panel-title">
              Sources &amp; brief context
            </h2>
            <p className="source-panel-hint">
              <strong>Executive Brief draft tool</strong> — paste Gong, CRM or planning notes, and AE context
              (optional files too) to get structured copy for your template: Affirm 101 through deal summary.
              Brief metadata is optional (Affirm 101 header). Missing fields show next-step prompts, not generic TBDs.
            </p>
          </div>

          <div className="source-panel-scroll">
            <div className="metadata-form" aria-labelledby="metadata-form-title">
              <h3 id="metadata-form-title" className="metadata-form-title">
                Brief metadata
              </h3>
              <p className="metadata-form-hint">
                Optional. Shown on the Affirm 101 sheet; merchant name and AE lead also merge with parsed
                notes when you leave those fields blank.
              </p>
              <div className="metadata-form-grid">
                <label className="metadata-field">
                  <span>Merchant name</span>
                  <input
                    type="text"
                    value={metadata.merchantName}
                    onChange={(e) => setMeta("merchantName", e.target.value)}
                    placeholder="e.g. Northwind Retail Co."
                    autoComplete="organization"
                  />
                </label>
                <label className="metadata-field">
                  <span>Brief date</span>
                  <input
                    type="text"
                    value={metadata.briefDate}
                    onChange={(e) => setMeta("briefDate", e.target.value)}
                    placeholder="e.g. April 9, 2026"
                  />
                </label>
                <label className="metadata-field">
                  <span>Merchant vertical / category</span>
                  <input
                    type="text"
                    value={metadata.merchantVertical}
                    onChange={(e) => setMeta("merchantVertical", e.target.value)}
                    placeholder="e.g. Retail / health & beauty"
                  />
                </label>
                <label className="metadata-field">
                  <span>Deal stage</span>
                  <input
                    type="text"
                    value={metadata.dealStage}
                    onChange={(e) => setMeta("dealStage", e.target.value)}
                    placeholder="e.g. Discovery, proposal, negotiation"
                  />
                </label>
                <label className="metadata-field">
                  <span>AE lead</span>
                  <input
                    type="text"
                    value={metadata.aeLead}
                    onChange={(e) => setMeta("aeLead", e.target.value)}
                    placeholder="Name"
                    autoComplete="name"
                  />
                </label>
                <label className="metadata-field metadata-field-wide">
                  <span>Optional internal context</span>
                  <textarea
                    value={metadata.optionalInternalContext}
                    onChange={(e) => setMeta("optionalInternalContext", e.target.value)}
                    placeholder="Positioning, exec priorities, or sensitivities—merged lightly with AE notes for tone (not a substitute for pasted sources)."
                    rows={3}
                    spellCheck
                  />
                </label>
              </div>
              <button type="button" className="btn btn-sample no-print" onClick={loadSampleMerchantInput}>
                Load sample merchant input
              </button>
            </div>
            <div className="guidance-panel" role="region" aria-label="What to include">
              <h3 className="guidance-panel-title">What to include</h3>
              <ul className="guidance-panel-list">
                <li>latest Gong summary</li>
                <li>merchant priorities and goals</li>
                <li>objections / risks</li>
                <li>key metrics</li>
                <li>commercials / implementation notes</li>
                <li>next steps / open questions</li>
              </ul>
            </div>

            <div className="guidance-panel guidance-panel-muted" role="region" aria-label="How inputs are used">
              <h3 className="guidance-panel-title">How inputs are used</h3>
              <ul className="guidance-panel-list guidance-panel-list-flow">
                <li>
                  <strong>Gong Summary / Call Notes</strong> → Executive Summary narrative, goals,
                  supporting bullets, risks / open items
                </li>
                <li>
                  <strong>Planning Doc / CRM Notes</strong> → Affirm 101 KPI callouts, Deal Summary,
                  Integration, commercial / term hints
                </li>
                <li>
                  <strong>AE Notes</strong> → layered into headlines and proposal language where notes
                  reference positioning (still heuristic)
                </li>
              </ul>
            </div>

            <div className="source-inputs-card" aria-label="Source inputs summary">
              <h3 className="source-inputs-title">Source inputs</h3>
              <ul className="source-inputs-list">
                <li>
                  <span className="source-inputs-label">Pasted text</span>
                  <span className="source-inputs-value">
                    {sourceStats.sectionsPresent
                      ? `Yes · ${sourceStats.sectionChars.toLocaleString()} chars`
                      : "No"}
                  </span>
                </li>
                <li>
                  <span className="source-inputs-label">Uploaded files</span>
                  <span className="source-inputs-value">{sourceStats.uploadCount}</span>
                </li>
                <li>
                  <span className="source-inputs-label">Total extracted text length</span>
                  <span className="source-inputs-value">
                    {sourceStats.fileChars.toLocaleString()} chars
                  </span>
                </li>
              </ul>
            </div>

            <section className="input-section" aria-labelledby="input-gong-title">
              <div className="input-section-head">
                <h3 id="input-gong-title" className="input-section-title">
                  A. Gong Summary / Call Notes
                </h3>
                <p className="input-section-helper">
                  Paste the latest Gong summary or cleaned call notes. Include merchant goals,
                  objections, stakeholder concerns, next steps, and any notable quotes.
                </p>
              </div>
              <textarea
                className="input-section-textarea"
                value={gongNotes}
                onChange={(e) => setGongNotes(e.target.value)}
                placeholder={PLACEHOLDER_GONG}
                rows={8}
                spellCheck
              />
            </section>

            <section className="input-section" aria-labelledby="input-planning-title">
              <div className="input-section-head">
                <h3 id="input-planning-title" className="input-section-title">
                  B. Planning Doc / CRM Notes
                </h3>
                <p className="input-section-helper">
                  Paste internal deal context: key metrics, team roster, commercials, implementation
                  details, and open items—whatever your CRM or planning doc already captures.
                </p>
              </div>
              <textarea
                className="input-section-textarea"
                value={planningNotes}
                onChange={(e) => setPlanningNotes(e.target.value)}
                placeholder={PLACEHOLDER_PLANNING}
                rows={8}
                spellCheck
              />
            </section>

            <section className="input-section" aria-labelledby="input-ae-title">
              <div className="input-section-head">
                <h3 id="input-ae-title" className="input-section-title">
                  C. AE Notes / Leadership Context
                </h3>
                <p className="input-section-helper">
                  Add nuance for the brief: positioning, leadership context, sensitivities, or what to
                  stress in executive-facing language.
                </p>
              </div>
              <textarea
                className="input-section-textarea"
                value={aeNotes}
                onChange={(e) => setAeNotes(e.target.value)}
                placeholder={PLACEHOLDER_AE}
                rows={6}
                spellCheck
              />
            </section>

            <div className="upload-block">
            <input
              ref={fileInputRef}
              type="file"
              className="upload-file-input"
              accept={SUPPORTED_EXTENSIONS.map((e) => `.${e}`).join(",")}
              multiple
              onChange={(e) => {
                if (e.target.files?.length) enqueueFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <div
              className={`upload-zone${dragActive ? " upload-zone-active" : ""}`}
              onDragEnter={(ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                setDragActive(true);
              }}
              onDragOver={(ev) => {
                ev.preventDefault();
                ev.stopPropagation();
              }}
              onDragLeave={(ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                if (ev.currentTarget === ev.target) setDragActive(false);
              }}
              onDrop={(ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                setDragActive(false);
                if (ev.dataTransfer.files?.length) enqueueFiles(ev.dataTransfer.files);
              }}
            >
              <p className="upload-zone-title">Add files</p>
              <p className="upload-zone-text">
                Drop files here or{" "}
                <button
                  type="button"
                  className="upload-browse"
                  onClick={() => fileInputRef.current?.click()}
                >
                  browse
                </button>
              </p>
              <p className="upload-zone-formats">
                {SUPPORTED_EXTENSIONS.map((e) => `.${e}`).join(" · ")}
              </p>
              <p className="upload-zone-note">
                Text and Markdown are read as plain text. DOCX is converted locally. PDFs use in-browser
                text extraction (works best on text-based PDFs; scanned pages may yield little text).
              </p>
            </div>

            {files.length > 0 && (
              <ul className="upload-file-list" aria-label="Uploaded files">
                {files.map((f) => (
                  <li key={f.id} className="upload-file-row">
                    <div className="upload-file-row-top">
                      <div className="upload-file-main">
                        <span className="upload-file-name" title={f.name}>
                          {f.name}
                        </span>
                        {f.status === "extracting" && (
                          <span className="upload-file-status">Extracting…</span>
                        )}
                        {f.status === "ready" && (
                          <span className="upload-file-status upload-file-status-ok">
                            {f.text.length.toLocaleString()} chars
                          </span>
                        )}
                        {f.status === "error" && (
                          <span className="upload-file-status upload-file-status-err">Failed</span>
                        )}
                      </div>
                      <button
                        type="button"
                        className="upload-file-remove"
                        onClick={() => removeFile(f.id)}
                        aria-label={`Remove ${f.name}`}
                      >
                        ×
                      </button>
                    </div>
                    {f.status === "error" && f.error && (
                      <p className="upload-file-error">{f.error}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
          </div>

          <div className="source-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={onGenerate}
              disabled={loading || hasExtracting}
              title={hasExtracting ? "Wait for file extraction to finish" : undefined}
            >
              {loading ? "Generating copy…" : "Generate brief"}
            </button>
            {error && (
              <p className="error-text" role="alert">
                {error}
              </p>
            )}
          </div>
        </aside>

        <div className="canvas-wrap">
          {!loading && !templateCopy && (
            <div className="canvas-empty no-print">
              <p>
                No brief draft yet. Paste Gong, planning, or AE notes (and files if you want), optionally
                add brief metadata, then click <strong>Generate brief</strong>.
              </p>
              <p className="canvas-empty-note">
                Logic: <code>generateExecutiveBriefCopy.ts</code> · parse:{" "}
                <code>generateAccountPreRead.ts</code> · files: <code>fileTextExtraction.ts</code>
              </p>
            </div>
          )}

          {loading && (
            <div
              className="template-copy-skeleton no-print"
              aria-busy="true"
              aria-label="Generating template copy"
            >
              <div className="skel-line" />
              <div className="skel-line" />
              <div className="skel-line" />
            </div>
          )}

          {!loading && templateCopy && (
            <TemplateCopyMode copy={templateCopy} blocks={copyBlocks} />
          )}
        </div>
      </div>
    </div>
  );
}
