const API_BASE =
  typeof window !== "undefined"
    ? (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001")
    : process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001";

export type AIProvider = "ollama" | "openai" | "mock";

export interface HealthResponse {
  status: string;
  service: string;
  ai_provider?: AIProvider;
}

export async function healthCheck(): Promise<HealthResponse> {
  const res = await fetch(`${API_BASE}/health`);
  if (!res.ok) throw new Error("Health check failed");
  return res.json();
}

/** Fetch backend config (e.g. which AI model is used for evaluation). */
export async function getApiConfig(): Promise<{ ai_provider: AIProvider }> {
  const res = await fetch(`${API_BASE}/health`);
  if (!res.ok) throw new Error("Failed to fetch config");
  const data = await res.json();
  return { ai_provider: data.ai_provider || "mock" };
}

// --- RFP types and API ---
export interface RFPRecord {
  id: number;
  title: string;
  description: string;
  requirements: string;
  budget: number | null;
  status: string;
  bids_locked?: boolean;
  created_at: string | null;
  updated_at: string | null;
  closing_date: string | null;
  process_type?: string;
  current_stage?: string;
  weight_technical?: number;
  weight_financial?: number;
  weight_compliance?: number;
  publish_date?: string | null;
  qa_deadline?: string | null;
  submission_deadline?: string | null;
  review_date?: string | null;
  decision_date?: string | null;
  assigned_reviewers?: string[] | null;
  assigned_approvers?: string[] | null;
}

export interface RFPCreatePayload {
  title: string;
  description: string;
  requirements: string;
  budget?: number | null;
  process_type?: string;
  weight_technical?: number;
  weight_financial?: number;
  weight_compliance?: number;
  publish_date?: string | null;
  qa_deadline?: string | null;
  submission_deadline?: string | null;
  review_date?: string | null;
  decision_date?: string | null;
  assigned_reviewers?: string[] | null;
  assigned_approvers?: string[] | null;
}

export async function fetchRFPs(): Promise<RFPRecord[]> {
  const res = await fetch(`${API_BASE}/rfps`);
  if (!res.ok) throw new Error("Failed to fetch RFPs");
  return res.json();
}

export async function createRFP(payload: RFPCreatePayload): Promise<RFPRecord> {
  const res = await fetch(`${API_BASE}/rfps`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to create RFP");
  }
  return res.json();
}

export async function fetchRFP(id: number): Promise<RFPRecord> {
  const res = await fetch(`${API_BASE}/rfps/${id}`);
  if (!res.ok) throw new Error("Failed to fetch RFP");
  return res.json();
}

export async function updateRFP(
  id: number,
  payload: { current_stage?: string; [key: string]: unknown }
): Promise<RFPRecord> {
  const res = await fetch(`${API_BASE}/rfps/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to update RFP");
  }
  return res.json();
}

export async function lockRfpBids(rfpId: number): Promise<RFPRecord> {
  const res = await fetch(`${API_BASE}/rfps/${rfpId}/lock`, { method: "PATCH" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to lock bids");
  }
  return res.json();
}

export async function fetchComparativeAnalysis(rfpId: number): Promise<ComparativeBidRow[]> {
  const res = await fetch(`${API_BASE}/rfps/${rfpId}/comparative`);
  if (!res.ok) throw new Error("Failed to fetch comparative analysis");
  return res.json();
}

// --- Vendor Q&A (RFP) ---
export interface VendorQARecord {
  id: number;
  rfp_id: number;
  vendor_name: string;
  question: string;
  answer: string | null;
  status: string;
  created_at: string | null;
}

export async function fetchRFPQA(rfpId: number): Promise<VendorQARecord[]> {
  const res = await fetch(`${API_BASE}/rfps/${rfpId}/qa`);
  if (!res.ok) throw new Error("Failed to fetch Q&A");
  return res.json();
}

export async function createRFPQA(rfpId: number, payload: { vendor_name: string; question: string }): Promise<VendorQARecord> {
  const res = await fetch(`${API_BASE}/rfps/${rfpId}/qa`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to submit question");
  }
  return res.json();
}

export async function answerQA(qaId: number, answer: string): Promise<VendorQARecord> {
  const res = await fetch(`${API_BASE}/qa/${qaId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ answer }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to answer");
  }
  return res.json();
}

// --- Bid types and API ---
/** One requirement from the AI evaluation breakdown */
export interface RequirementBreakdownItem {
  requirement: string;
  compliant: boolean;
  note: string;
}

export interface BidRecord {
  id: number;
  rfp_id: number;
  filename: string;
  file_path: string;
  extracted_text: string | null;
  vendor_name: string;
  status: string;
  ai_score: number | null;
  ai_reasoning: string | null;
  ai_evaluation_source: string | null;
  last_eval_duration_seconds: number | null;
  bid_extraction_details: string | null; // JSON: quoted_price, currency, rate, rate_unit, validity_period, notes
  ai_requirements_breakdown: string | null;
  ai_annotations: string | null;
  human_score: number | null;
  human_notes: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface RFPRef {
  id: number;
  title: string;
  requirements: string | null;
  bids_locked?: boolean;
}

export interface BidAuditEventRecord {
  id: number;
  bid_id: number;
  action: string;
  actor: string | null;
  created_at: string | null;
}

export interface VendorRepRecord {
  id: number;
  name: string | null;
  email: string | null;
  phone: string | null;
  designation: string | null;
  phone_verified: boolean | null;
  email_verified: boolean | null;
}

export interface VendorRecord {
  id: number;
  name: string;
  address: string | null;
  website: string | null;
  domain: string | null;
  website_verified: boolean | null;
  representatives: VendorRepRecord[];
}

export interface BidEvaluationHistoryRecord {
  id: number;
  bid_id: number;
  ai_score: number | null;
  ai_reasoning: string | null;
  human_score: number | null;
  human_notes: string | null;
  created_at: string | null;
}

export interface BidDetailRecord extends BidRecord {
  rfp: RFPRef;
  vendor?: VendorRecord | null;
  audit_events: BidAuditEventRecord[];
  evaluation_history?: BidEvaluationHistoryRecord[];
}

export interface ComparativeBidRow {
  bid_id: number;
  vendor_name: string;
  filename: string;
  ai_score: number | null;
  human_score: number | null;
  status: string;
  requirements_breakdown: RequirementBreakdownItem[] | null;
}

export async function fetchBids(rfpId: number): Promise<BidRecord[]> {
  const res = await fetch(`${API_BASE}/rfps/${rfpId}/bids`);
  if (!res.ok) throw new Error("Failed to fetch bids");
  return res.json();
}

export async function fetchAllBids(): Promise<BidRecord[]> {
  const res = await fetch(`${API_BASE}/bids`);
  if (!res.ok) throw new Error("Failed to fetch bids");
  return res.json();
}

export async function fetchBidById(id: number): Promise<BidDetailRecord> {
  const res = await fetch(`${API_BASE}/bids/${id}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch bid");
  return res.json();
}

export async function evaluateBid(id: number, persona?: string): Promise<BidRecord> {
  const headers: Record<string, string> = {};
  if (persona) headers["X-Persona"] = persona;
  const res = await fetch(`${API_BASE}/bids/${id}/evaluate`, {
    method: "POST",
    headers,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to evaluate bid");
  }
  return res.json();
}

export async function reEvaluateBid(
  id: number,
  body?: { human_notes_context?: string | null },
  persona?: string
): Promise<BidRecord> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (persona) headers["X-Persona"] = persona;
  const res = await fetch(`${API_BASE}/bids/${id}/re-evaluate`, {
    method: "POST",
    headers,
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to re-evaluate bid");
  }
  return res.json();
}

export async function updateBidHuman(
  id: number,
  payload: {
    human_score?: number | null;
    human_notes?: string | null;
    ai_annotations?: string | null;
  },
  persona?: string
): Promise<BidRecord> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (persona) headers["X-Persona"] = persona;
  const res = await fetch(`${API_BASE}/bids/${id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to update bid");
  }
  return res.json();
}

/** Run digital agent for an annotation: verify_online or email_vendor. Updates that annotation on the bid. */
export async function verifyAnnotation(
  bidId: number,
  index: number,
  action: "verify_online" | "email_vendor",
  persona?: string
): Promise<BidRecord> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (persona) headers["X-Persona"] = persona;
  const res = await fetch(`${API_BASE}/bids/${bidId}/annotations/verify`, {
    method: "POST",
    headers,
    body: JSON.stringify({ index, action }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to verify annotation");
  }
  return res.json();
}

export type BidStatusDecision = "Approved" | "Rejected";

export async function updateBidStatus(
  id: number,
  status: BidStatusDecision,
  persona?: string
): Promise<BidRecord> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (persona) headers["X-Persona"] = persona;
  const res = await fetch(`${API_BASE}/bids/${id}/status`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ status }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to update status");
  }
  return res.json();
}

/** Build URL for PDF in static mount: /static/<basename of file_path> */
export function getBidPdfUrl(filePath: string): string {
  const name = filePath.split("/").pop() || "";
  return `${API_BASE}/static/${name}`;
}

/** Phase 1: Upload bid PDF (save + OCR only). Then call extractVendor for AI processing. */
export async function uploadBid(
  rfpId: number,
  file: File,
  actor?: string
): Promise<BidRecord> {
  const form = new FormData();
  form.append("file", file);
  if (actor) form.append("actor", actor);
  const res = await fetch(`${API_BASE}/rfps/${rfpId}/bids`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to upload bid");
  }
  return res.json();
}

/** Placeholder shown on new bids until vendor extraction completes. */
export const VENDOR_EXTRACT_PLACEHOLDER = "Processing…";

/**
 * Run vendor extraction on the bid (sync on server). Returns when done.
 * Backend returns vendor payload so the client can show details without refetch.
 */
export async function extractVendor(
  bidId: number,
  actor?: string
): Promise<{ status: string; bid_id: number; vendor_name: string; vendor?: VendorRecord | null; bid_extraction_details?: string | null }> {
  const form = new FormData();
  if (actor) form.append("actor", actor);
  const res = await fetch(`${API_BASE}/bids/${bidId}/extract-vendor`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to extract vendor");
  }
  return res.json();
}

export { API_BASE };
