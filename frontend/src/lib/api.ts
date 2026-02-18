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
  created_at: string | null;
  updated_at: string | null;
  closing_date: string | null;
}

export interface RFPCreatePayload {
  title: string;
  description: string;
  requirements: string;
  budget?: number | null;
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
  ai_requirements_breakdown: string | null;
  human_score: number | null;
  human_notes: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface RFPRef {
  id: number;
  title: string;
  requirements: string | null;
}

export interface BidAuditEventRecord {
  id: number;
  bid_id: number;
  action: string;
  actor: string | null;
  created_at: string | null;
}

export interface BidDetailRecord extends BidRecord {
  rfp: RFPRef;
  audit_events: BidAuditEventRecord[];
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
  const res = await fetch(`${API_BASE}/bids/${id}`);
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

export async function updateBidHuman(
  id: number,
  payload: { human_score?: number | null; human_notes?: string | null },
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

export async function uploadBid(
  rfpId: number,
  vendorName: string,
  file: File,
  actor?: string
): Promise<BidRecord> {
  const form = new FormData();
  form.append("vendor_name", vendorName);
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

export { API_BASE };
