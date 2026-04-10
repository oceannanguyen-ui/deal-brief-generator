import * as pdfjs from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import mammoth from "mammoth";

let pdfWorkerReady = false;

function ensurePdfWorker(): void {
  if (pdfWorkerReady) return;
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  pdfWorkerReady = true;
}

function extensionOf(fileName: string): string {
  const i = fileName.lastIndexOf(".");
  return i >= 0 ? fileName.slice(i + 1).toLowerCase() : "";
}

export const SUPPORTED_EXTENSIONS = ["txt", "md", "pdf", "docx"] as const;

export type SupportedExtension = (typeof SUPPORTED_EXTENSIONS)[number];

export function isSupportedFile(file: File): boolean {
  return SUPPORTED_EXTENSIONS.includes(extensionOf(file.name) as SupportedExtension);
}

async function extractTxtOrMd(file: File): Promise<string> {
  return file.text();
}

async function extractPdf(file: File): Promise<string> {
  ensurePdfWorker();
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data }).promise;
  const parts: string[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const line: string[] = [];
    for (const item of content.items) {
      if (item && typeof item === "object" && "str" in item && typeof item.str === "string") {
        line.push(item.str);
      }
    }
    if (line.length) parts.push(line.join(" "));
  }
  return parts.join("\n").trim();
}

async function extractDocx(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value.trim();
}

/**
 * Best-effort text extraction in the browser. PDFs must be text-based (not scanned images without OCR).
 */
export async function extractTextFromFile(file: File): Promise<string> {
  const ext = extensionOf(file.name);
  switch (ext) {
    case "txt":
    case "md":
      return extractTxtOrMd(file);
    case "pdf":
      return extractPdf(file);
    case "docx":
      return extractDocx(file);
    default:
      throw new Error(`Unsupported type (.${ext}). Use ${SUPPORTED_EXTENSIONS.join(", ")}.`);
  }
}

export type PreReadSourceSection = { heading: string; text: string };

/** Merges labeled AE sections and optional file extracts for `generateAccountPreRead`. */
export function buildPreReadSource(
  sections: PreReadSourceSection[],
  fileFragments: { fileName: string; text: string }[],
): string {
  const chunks: string[] = [];
  for (const { heading, text } of sections) {
    const t = text.trim();
    if (t) chunks.push(`--- ${heading} ---\n${t}`);
  }
  for (const { fileName, text } of fileFragments) {
    const t = text.trim();
    if (t) {
      chunks.push(`--- File: ${fileName} ---\n${t}`);
    }
  }
  return chunks.join("\n\n");
}
