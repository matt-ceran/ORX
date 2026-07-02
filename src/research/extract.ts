import { createHash } from "node:crypto";
import type { ExtractedContent } from "./types.js";

export interface ExtractContentOptions {
  body: string;
  contentType?: string;
  maxTextChars?: number;
}

const DEFAULT_MAX_TEXT_CHARS = 12_000;
const SECRET_LIKE_VALUE =
  /\b(?:sk-or-v1-[A-Za-z0-9_-]+|github_pat_[A-Za-z0-9_]+|ghp_[A-Za-z0-9_]+|glpat-[A-Za-z0-9_-]+|xox[baprs]-[A-Za-z0-9-]+)\b/g;
const SECRET_ASSIGNMENT =
  /((?:api[_-]?key|access[_-]?token|auth[_-]?token|token|secret|password|passwd|key)=)[^&\s]+/gi;

export function extractContent({
  body,
  contentType,
  maxTextChars = DEFAULT_MAX_TEXT_CHARS,
}: ExtractContentOptions): ExtractedContent {
  const isHtml = /\bhtml\b/i.test(contentType ?? "") || /<html[\s>]|<!doctype html/i.test(body);
  const extracted = isHtml ? extractHtml(body) : { text: body };
  const cleanedText = collapseWhitespace(decodeHtmlEntities(extracted.text));
  const boundedText = cleanedText.slice(0, Math.max(0, maxTextChars));

  return {
    title: extracted.title ? collapseWhitespace(decodeHtmlEntities(extracted.title)).slice(0, 240) : undefined,
    text: boundedText,
    textHash: sha256(boundedText),
    truncated: cleanedText.length > boundedText.length,
  };
}

export function sha256(value: string | Uint8Array): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

export function stripTerminalControlChars(value: string): string {
  return value.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/g, "");
}

export function redactSecretLikeValues(value: string): string {
  SECRET_LIKE_VALUE.lastIndex = 0;
  SECRET_ASSIGNMENT.lastIndex = 0;
  return value.replace(SECRET_LIKE_VALUE, "REDACTED").replace(SECRET_ASSIGNMENT, "$1REDACTED");
}

function extractHtml(html: string): { title?: string; text: string } {
  const title = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  let text = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, " ")
    .replace(/<head\b[\s\S]*?<\/head>/gi, " ")
    .replace(/<\/?(?:article|aside|blockquote|br|dd|div|dl|dt|figcaption|figure|footer|h[1-6]|header|hr|li|main|nav|ol|p|pre|section|table|td|th|tr|ul)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");

  return { title, text };
}

function collapseWhitespace(value: string): string {
  return stripTerminalControlChars(value)
    .replace(/[ \t\f\v\r]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_match, code: string) => {
      const value = Number(code);
      return Number.isFinite(value) ? String.fromCodePoint(value) : " ";
    })
    .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) => {
      const value = Number.parseInt(code, 16);
      return Number.isFinite(value) ? String.fromCodePoint(value) : " ";
    })
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'");
}
