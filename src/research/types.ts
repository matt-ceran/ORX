export type EvidenceSourceKind = "web" | "paper" | "pdf" | "repo" | "api" | "browser";

export type EvidenceTrustTier = "primary" | "official" | "secondary" | "community" | "unknown";

export interface EvidenceSpan {
  page?: number;
  start?: number;
  end?: number;
  textHash: string;
}

export interface EvidenceSource {
  id: string;
  kind: EvidenceSourceKind;
  canonicalUrl?: string;
  doi?: string;
  pmid?: string;
  arxivId?: string;
  title?: string;
  publisher?: string;
  publishedAt?: string;
  fetchedAt: string;
  provider: string;
  query?: string;
  contentHash: string;
  trustTier: EvidenceTrustTier;
  spans: EvidenceSpan[];
}

export interface ExtractedContent {
  title?: string;
  text: string;
  textHash: string;
  truncated: boolean;
}

export interface ResearchFetchResult {
  source: EvidenceSource;
  extracted: ExtractedContent;
  status: number;
  contentType?: string;
  returnedBytes: number;
  truncatedBytes: boolean;
}
