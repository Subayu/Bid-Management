"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useRole } from "@/contexts/RoleContext";
import {
  fetchBidById,
  evaluateBid,
  reEvaluateBid,
  updateBidHuman,
  updateBidStatus,
  verifyAnnotation,
  extractVendor,
  getBidPdfUrl,
  getApiConfig,
  VENDOR_EXTRACT_PLACEHOLDER,
  type BidDetailRecord,
  type AIProvider,
  type RequirementBreakdownItem,
} from "@/lib/api";
import { PdfViewerScrollable } from "@/components/PdfViewerScrollable";

const FINAL_STATUSES = ["Approved", "Rejected"];

export default function BidDetailPage() {
  const params = useParams();
  const id = Number(params.id);
  const { currentPersona } = useRole();
  const [bid, setBid] = useState<BidDetailRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [evaluating, setEvaluating] = useState(false);
  const [reEvaluating, setReEvaluating] = useState(false);
  const [humanScore, setHumanScore] = useState("");
  const [humanNotes, setHumanNotes] = useState("");
  const [savingHuman, setSavingHuman] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [aiProvider, setAiProvider] = useState<AIProvider | null>(null);
  const [rationaleExpanded, setRationaleExpanded] = useState(false);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [evalElapsedSeconds, setEvalElapsedSeconds] = useState(0);
  const [lastEvalDurationSeconds, setLastEvalDurationSeconds] = useState<number | null>(null);
  const evalStartRef = useRef<number | null>(null);
  const [draftReviewerNotes, setDraftReviewerNotes] = useState<Record<number, string>>({});
  const [savingAnnotations, setSavingAnnotations] = useState(false);
  const [verifyingAnnotation, setVerifyingAnnotation] = useState<{ index: number; action: string } | null>(null);
  const [pdfViewPage, setPdfViewPage] = useState<number | null>(null);
  const [extractingVendor, setExtractingVendor] = useState(false);

  const canEditHuman = currentPersona === "Reviewer" || currentPersona === "Bid Manager";
  const isApprover = currentPersona === "Approver";
  const canRunAi = !isApprover;
  const isFinal = bid != null && FINAL_STATUSES.includes(bid.status);
  const isLocked = Boolean(bid?.rfp?.bids_locked);
  const canEditOrReEval = canEditHuman && !isFinal && !isLocked;

  const load = async () => {
    if (!id || Number.isNaN(id)) {
      setError("Invalid bid id");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await fetchBidById(id);
      if (process.env.NODE_ENV === "development") {
        console.log("[BidDetail] GET bid response:", {
          bid_id: data.id,
          has_vendor: Boolean(data.vendor),
          vendor_name: data.vendor?.name,
          last_eval_duration_seconds: data.last_eval_duration_seconds,
        });
      }
      setBid(data);
      setHumanScore(data.human_score != null ? String(data.human_score) : "");
      setHumanNotes(data.human_notes ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load bid");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [id]);

  useEffect(() => {
    if (!bid?.ai_annotations) {
      setDraftReviewerNotes({});
      return;
    }
    try {
      const arr = JSON.parse(bid.ai_annotations) as { reviewer_notes?: string }[];
      if (!Array.isArray(arr)) return;
      const next: Record<number, string> = {};
      arr.forEach((a, i) => {
        next[i] = a.reviewer_notes ?? "";
      });
      setDraftReviewerNotes(next);
    } catch {
      setDraftReviewerNotes({});
    }
  }, [bid?.id, bid?.ai_annotations]);

  useEffect(() => {
    getApiConfig()
      .then((c) => setAiProvider(c.ai_provider))
      .catch(() => setAiProvider("mock"));
  }, []);

  const isEvalRunning = evaluating || reEvaluating;
  useEffect(() => {
    if (!isEvalRunning || evalStartRef.current == null) return;
    const interval = setInterval(() => {
      setEvalElapsedSeconds(Math.floor((Date.now() - evalStartRef.current!) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [isEvalRunning]);

  const handleRunEvaluation = async () => {
    setEvaluating(true);
    setError(null);
    setLastEvalDurationSeconds(null);
    evalStartRef.current = Date.now();
    setEvalElapsedSeconds(0);
    try {
      const updated = await evaluateBid(id, currentPersona);
      setBid((prev) => (prev ? { ...prev, ...updated } : null));
      setLastEvalDurationSeconds((Date.now() - evalStartRef.current!) / 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to run evaluation");
    } finally {
      setEvaluating(false);
      evalStartRef.current = null;
    }
  };

  const handleReEvaluate = async () => {
    setReEvaluating(true);
    setError(null);
    setLastEvalDurationSeconds(null);
    evalStartRef.current = Date.now();
    setEvalElapsedSeconds(0);
    try {
      const updated = await reEvaluateBid(
        id,
        { human_notes_context: humanNotes || undefined },
        currentPersona
      );
      setBid((prev) => (prev ? { ...prev, ...updated } : null));
      setLastEvalDurationSeconds((Date.now() - evalStartRef.current!) / 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to re-evaluate");
    } finally {
      setReEvaluating(false);
      evalStartRef.current = null;
    }
  };

  const handleSaveHuman = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEditOrReEval) return;
    setSavingHuman(true);
    setError(null);
    try {
      const payload = {
        human_score: humanScore === "" ? null : parseFloat(humanScore),
        human_notes: humanNotes || null,
      };
      const updated = await updateBidHuman(id, payload, currentPersona);
      setBid((prev) => (prev ? { ...prev, ...updated } : null));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save review");
    } finally {
      setSavingHuman(false);
    }
  };

  const handleSaveAnnotationNotes = async () => {
    if (!bid?.ai_annotations) return;
    setSavingAnnotations(true);
    setError(null);
    try {
      const arr = JSON.parse(bid.ai_annotations) as Record<string, unknown>[];
      if (!Array.isArray(arr)) throw new Error("Invalid annotations");
      const updated = arr.map((a, i) => ({
        ...a,
        reviewer_notes: draftReviewerNotes[i] ?? (a.reviewer_notes as string) ?? "",
      }));
      const payload = {
        human_score: humanScore === "" ? null : parseFloat(humanScore),
        human_notes: humanNotes || null,
        ai_annotations: JSON.stringify(updated),
      };
      const updatedBid = await updateBidHuman(id, payload, currentPersona);
      setBid((prev) => (prev ? { ...prev, ...updatedBid } : null));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save annotation notes");
    } finally {
      setSavingAnnotations(false);
    }
  };

  const handleVerifyAnnotation = async (index: number, action: "verify_online" | "email_vendor") => {
    setVerifyingAnnotation({ index, action });
    setError(null);
    try {
      const updated = await verifyAnnotation(id, index, action, currentPersona);
      setBid((prev) => (prev ? { ...prev, ...updated } : null));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to run verification");
    } finally {
      setVerifyingAnnotation(null);
    }
  };

  const handleExtractVendor = async () => {
    setExtractingVendor(true);
    setError(null);
    try {
      const data = await extractVendor(id, currentPersona);
      if (data.vendor || data.bid_extraction_details != null) {
        setBid((prev) =>
          prev
            ? {
                ...prev,
                ...(data.vendor && { vendor: data.vendor, vendor_name: data.vendor_name }),
                ...(data.bid_extraction_details != null && { bid_extraction_details: data.bid_extraction_details }),
              }
            : null
        );
      }
      if (!data.vendor) {
        const full = await fetchBidById(id);
        setBid(full);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to extract vendor");
    } finally {
      setExtractingVendor(false);
    }
  };

  const scrollLeftPaneToPage = (page: number) => setPdfViewPage(page >= 1 ? page : 1);

  if (loading) {
    return (
      <div className="flex h-[calc(100vh-8rem)] items-center justify-center p-8">
        <p className="text-slate-600">Loading bid…</p>
      </div>
    );
  }
  if (error && !bid) {
    return (
      <div className="p-8">
        <p className="text-red-600">{error}</p>
        <Link href="/bids" className="mt-2 inline-block text-indigo-600 hover:underline">
          ← Back to Bids
        </Link>
      </div>
    );
  }
  if (!bid) return null;

  const pdfUrl = getBidPdfUrl(bid.file_path);
  const hasAiScore = bid.ai_score != null;
  let requirementsBreakdown: RequirementBreakdownItem[] = [];
  try {
    if (bid.ai_requirements_breakdown) {
      requirementsBreakdown = JSON.parse(bid.ai_requirements_breakdown) as RequirementBreakdownItem[];
    }
  } catch {
    requirementsBreakdown = [];
  }
  type AnnotationItem = {
    quote?: string;
    reason?: string;
    reviewer_notes?: string;
    verification_status?: string;
    verification_note?: string;
    page?: number;
  };
  let annotations: AnnotationItem[] = [];
  try {
    if (bid.ai_annotations) {
      annotations = JSON.parse(bid.ai_annotations) as AnnotationItem[];
      if (!Array.isArray(annotations)) annotations = [];
    }
  } catch {
    annotations = [];
  }

  return (
    <div className="flex h-[calc(100vh-6rem)] flex-col p-8">
      <div className="mb-2 flex items-center justify-between">
        <Link href="/bids" className="text-sm font-medium text-indigo-600 hover:text-indigo-800">
          ← Back to Bids
        </Link>
      </div>

      <div className="flex min-h-0 flex-1 gap-4 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        {/* Left: PDF viewer - scrolls to page when "Show in document" is clicked */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="border-b border-slate-200 px-4 py-2 text-sm font-medium text-slate-700">
            Document: {bid.filename}
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">
            <PdfViewerScrollable
              pdfUrl={pdfUrl}
              scrollToPage={pdfViewPage}
              className="h-full w-full"
            />
          </div>
          <p className="border-t border-slate-200 px-2 py-1 text-xs text-slate-500">
            <a href={pdfUrl} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">
              Open in new tab
            </a>
          </p>
        </div>

        {/* Right: Intelligence console */}
        <div className="flex w-[420px] shrink-0 flex-col border-l border-slate-200 bg-slate-50/50 overflow-y-auto">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="font-semibold text-slate-900">{bid.vendor_name}</h2>
            <span
              className={`mt-1 inline-block rounded px-2 py-0.5 text-xs font-medium ${
                bid.status === "Approved"
                  ? "bg-green-100 text-green-800"
                  : bid.status === "Rejected"
                    ? "bg-red-100 text-red-800"
                    : bid.status === "Evaluated"
                      ? "bg-indigo-100 text-indigo-800"
                      : bid.status === "Draft" || bid.status === "Uploaded"
                        ? "bg-amber-50 text-amber-800"
                        : "bg-slate-200 text-slate-700"
              }`}
            >
              {bid.status}
            </span>
            <p className="mt-1 text-xs text-slate-500">RFP: {bid.rfp.title}</p>
          </div>

          {error && (
            <div className="mx-4 mt-3 rounded-md bg-red-50 p-2 text-sm text-red-800">{error}</div>
          )}

          {/* Vendor details: always show section; full block when bid.vendor is loaded */}
          <div className="border-b border-slate-200 px-4 py-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Vendor details</h3>
            {!bid.vendor && bid.vendor_name === VENDOR_EXTRACT_PLACEHOLDER && (
              <p className="mt-2 text-sm text-amber-700">Vendor extraction in progress…</p>
            )}
            {!bid.vendor && bid.vendor_name !== VENDOR_EXTRACT_PLACEHOLDER && (
              <div className="mt-2 space-y-2">
                <p className="text-sm text-slate-600">
                  <span className="font-medium text-slate-700">Name:</span> {bid.vendor_name}
                </p>
                <p className="text-xs text-slate-500">Full details (website, phone, address, email, representatives, verification) appear after vendor extraction.</p>
                {bid.extracted_text && (
                  <button
                    type="button"
                    onClick={handleExtractVendor}
                    disabled={extractingVendor}
                    className="rounded border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
                  >
                    {extractingVendor ? "Extracting…" : "Extract vendor details"}
                  </button>
                )}
              </div>
            )}
            {bid.vendor && (
              <dl className="mt-2 space-y-2 text-sm">
                <div><span className="font-medium text-slate-600">Name:</span> {bid.vendor.name}</div>
                {bid.vendor.address != null && bid.vendor.address !== "" && (
                  <div><span className="font-medium text-slate-600">Address:</span> {bid.vendor.address}</div>
                )}
                {bid.vendor.website != null && bid.vendor.website !== "" && (
                  <div className="flex items-center gap-1">
                    <span className="font-medium text-slate-600">Website:</span>
                    <a href={bid.vendor.website} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">{bid.vendor.website}</a>
                    {bid.vendor.website_verified === true && <span className="text-green-600" title="Verified">✓</span>}
                    {bid.vendor.website_verified === false && <span className="text-red-600" title="Unreachable">✗</span>}
                  </div>
                )}
                {bid.vendor.representatives && bid.vendor.representatives.length > 0 ? (
                  <div className="mt-2">
                    <span className="font-medium text-slate-600">Representatives:</span>
                    <ul className="mt-1 space-y-1.5">
                      {bid.vendor.representatives.map((r) => (
                        <li key={r.id} className="rounded border border-slate-100 bg-white px-2 py-1 text-xs">
                          {r.name != null && r.name !== "" && <><span className="font-medium text-slate-600">Name:</span> {r.name}<br /></>}
                          {r.designation != null && r.designation !== "" && <><span className="font-medium text-slate-600">Role:</span> {r.designation}<br /></>}
                          {r.email != null && r.email !== "" && (
                            <><span className="font-medium text-slate-600">Email:</span> {r.email}
                              {r.email_verified === true && <span className="text-green-600 ml-0.5" title="Valid format">✓</span>}
                              {r.email_verified === false && <span className="text-red-600 ml-0.5" title="Invalid format">✗</span>}
                              <br /></>
                          )}
                          {r.phone != null && r.phone !== "" && (
                            <><span className="font-medium text-slate-600">Phone:</span> {r.phone}
                              {r.phone_verified === true && <span className="text-green-600 ml-0.5" title="Valid format">✓</span>}
                              {r.phone_verified === false && <span className="text-red-600 ml-0.5" title="Invalid format">✗</span>}
                            </>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="mt-1 text-xs text-slate-500">No representatives extracted.</p>
                )}
              </dl>
            )}
          </div>

          {/* Bid extraction (proposed commercial terms) - from same extraction as vendor, do not change vendor section above */}
          {(() => {
            type CommercialTerms = {
              quoted_price?: number | null;
              currency?: string | null;
              rate?: number | null;
              rate_unit?: string | null;
              validity_period?: string | null;
              notes?: string | null;
            };
            let commercial: CommercialTerms | null = null;
            try {
              if (bid.bid_extraction_details) commercial = JSON.parse(bid.bid_extraction_details) as CommercialTerms;
            } catch {
              commercial = null;
            }
            const hasCommercial =
              commercial &&
              (commercial.quoted_price != null ||
                (commercial.currency != null && commercial.currency !== "") ||
                commercial.rate != null ||
                (commercial.rate_unit != null && commercial.rate_unit !== "") ||
                (commercial.validity_period != null && commercial.validity_period !== "") ||
                (commercial.notes != null && commercial.notes !== ""));
            if (!hasCommercial || !commercial) return null;
            const c = commercial;
            return (
              <div className="border-b border-slate-200 px-4 py-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Bid extraction (proposed terms)</h3>
                <dl className="mt-2 space-y-1.5 text-sm text-slate-700">
                  {c.quoted_price != null && (
                    <div><span className="font-medium text-slate-600">Quoted price:</span> {c.currency ? `${c.currency} ` : ""}{Number(c.quoted_price).toLocaleString()}</div>
                  )}
                  {c.rate != null && (
                    <div><span className="font-medium text-slate-600">Rate:</span> {c.currency ? `${c.currency} ` : ""}{Number(c.rate).toLocaleString()}{c.rate_unit ? ` ${c.rate_unit}` : ""}</div>
                  )}
                  {c.validity_period != null && c.validity_period !== "" && (
                    <div><span className="font-medium text-slate-600">Validity:</span> {c.validity_period}</div>
                  )}
                  {c.notes != null && c.notes !== "" && (
                    <div><span className="font-medium text-slate-600">Notes:</span> <span className="text-slate-600">{c.notes}</span></div>
                  )}
                </dl>
              </div>
            );
          })()}

          <div className="flex-1 px-4 py-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">AI evaluation</h3>
            </div>
            {isEvalRunning && (
              <div className="mt-3 flex flex-col gap-2 rounded-lg border border-indigo-200 bg-indigo-50/50 p-4">
                <div className="flex items-center gap-2">
                  <svg className="h-5 w-5 shrink-0 animate-spin text-indigo-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden>
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span className="text-sm text-slate-600">AI is analyzing compliance…</span>
                </div>
                <p className="text-sm font-medium text-slate-700">
                  <span className="font-medium text-slate-600">Elapsed:</span>{" "}
                  <span className="font-mono">{Math.floor(evalElapsedSeconds / 60)}:{(evalElapsedSeconds % 60).toString().padStart(2, "0")}</span>
                </p>
              </div>
            )}
            {!hasAiScore && canRunAi && !isLocked && !isFinal && !isEvalRunning && (
              <div className="mt-3">
                <button
                  type="button"
                  onClick={handleRunEvaluation}
                  disabled={evaluating}
                  className="w-full rounded-lg border-2 border-dashed border-indigo-300 bg-indigo-50/50 py-8 text-center text-sm font-medium text-indigo-700 hover:border-indigo-400 disabled:opacity-50"
                >
                  {evaluating ? "Evaluating…" : "Run AI evaluation"}
                </button>
              </div>
            )}
            {hasAiScore && !isEvalRunning && (
              <div className="mt-3 space-y-3 rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold text-indigo-600">{Number(bid.ai_score).toFixed(1)}</span>
                  <span className="text-slate-500">/ 100</span>
                </div>
                <div className="grid grid-cols-1 gap-1 text-sm text-slate-700">
                  <p>
                    <span className="font-medium text-slate-600">Model:</span>{" "}
                    {bid.ai_evaluation_source === "ollama" ? (
                      <span className="font-medium text-emerald-700">Ollama (live)</span>
                    ) : bid.ai_evaluation_source ? (
                      <span className="font-medium text-amber-700" title="Ollama may be unreachable; check backend logs and ensure Ollama is running on host.">
                        Mock (fallback)
                      </span>
                    ) : (
                      <span className="text-slate-500">—</span>
                    )}
                  </p>
                  <p>
                    <span className="font-medium text-slate-600">Elapsed:</span>{" "}
                    {(lastEvalDurationSeconds ?? bid.last_eval_duration_seconds) != null ? (
                      (() => {
                        const s = lastEvalDurationSeconds ?? bid.last_eval_duration_seconds ?? 0;
                        return s < 1 ? "<1s" : s < 60 ? `${Number(s).toFixed(1)}s` : `${Math.floor(s / 60)}m ${(s % 60).toFixed(0)}s`;
                      })()
                    ) : (
                      <span className="text-slate-500">—</span>
                    )}
                  </p>
                </div>
                {bid.ai_reasoning && (
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{bid.ai_reasoning}</p>
                )}
              </div>
            )}
            {hasAiScore && (bid.evaluation_history?.length ?? 0) > 0 && (
              <div className="mt-2">
                <button
                  type="button"
                  onClick={() => setHistoryModalOpen(true)}
                  className="text-xs font-medium text-indigo-600 hover:text-indigo-800"
                >
                  View history ({bid.evaluation_history!.length})
                </button>
              </div>
            )}
            {hasAiScore && canEditOrReEval && (
              <div className="mt-3">
                <button
                  type="button"
                  onClick={handleReEvaluate}
                  disabled={reEvaluating}
                  className="w-full rounded-lg border border-amber-300 bg-amber-50 py-2.5 text-sm font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                >
                  {reEvaluating ? "Re-evaluating…" : "Submit for Re-evaluation"}
                </button>
                <p className="mt-1 text-xs text-slate-500">Current human notes will be sent as context to the AI.</p>
              </div>
            )}

            {/* Areas for review: each annotation has "Show in document" → scrolls left pane */}
            {hasAiScore && (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50/80">
                <h3 className="border-b border-amber-200 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-amber-800">
                  Areas for review
                </h3>
                <p className="px-4 pt-2 text-xs text-amber-700">
                  {annotations.length > 0
                    ? "Click “Show in document” to scroll the left pane to that section. Add notes, Verify online, or Email vendor."
                    : "No areas flagged. Re-evaluate with notes to get annotations."}
                </p>
                {annotations.length > 0 && (
                  <ul className="list-none space-y-3 px-4 pb-2 pt-2">
                    {annotations.map((a, i) => (
                      <li key={i} className="rounded border border-amber-100 bg-white p-3 text-sm">
                        <div className="mb-2 flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => scrollLeftPaneToPage((a.page != null && a.page >= 1) ? a.page : 1)}
                            className="inline-flex items-center gap-1.5 rounded border border-indigo-300 bg-indigo-100 px-2.5 py-1.5 text-xs font-semibold text-indigo-900 hover:bg-indigo-200"
                          >
                            <span aria-hidden>📄</span>
                            {a.page != null && a.page >= 1
                              ? `Show in document (page ${a.page})`
                              : "Show in document"}
                          </button>
                          <span className="text-xs text-slate-500">← scrolls left pane</span>
                        </div>
                        {a.quote && <p className="font-medium text-slate-800">&ldquo;{a.quote}&rdquo;</p>}
                        {a.reason && <p className="mt-1 text-slate-600">{a.reason}</p>}
                        <div className="mt-2">
                          <label className="block text-xs font-medium text-slate-500">Note for this annotation</label>
                          {canEditOrReEval ? (
                            <textarea
                              value={draftReviewerNotes[i] ?? ""}
                              onChange={(e) =>
                                setDraftReviewerNotes((prev) => ({ ...prev, [i]: e.target.value }))
                              }
                              placeholder="Add notes for re-evaluation…"
                              rows={2}
                              className="mt-0.5 w-full rounded border border-slate-200 px-2 py-1.5 text-xs"
                            />
                          ) : (
                            <p className="mt-0.5 min-h-[2.5rem] rounded border border-slate-100 bg-slate-50 px-2 py-1.5 text-xs text-slate-600">
                              {a.reviewer_notes?.trim() || "—"}
                            </p>
                          )}
                        </div>
                        {(a.verification_status || a.verification_note) && (
                          <p className="mt-2 text-xs text-slate-500">
                            <span className="font-medium">Verification:</span> {a.verification_status}
                            {a.verification_note && ` — ${a.verification_note}`}
                          </p>
                        )}
                        {canEditOrReEval && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => handleVerifyAnnotation(i, "verify_online")}
                              disabled={verifyingAnnotation !== null}
                              className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                            >
                              {verifyingAnnotation?.index === i && verifyingAnnotation?.action === "verify_online"
                                ? "…"
                                : "Verify online"}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleVerifyAnnotation(i, "email_vendor")}
                              disabled={verifyingAnnotation !== null}
                              className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                            >
                              {verifyingAnnotation?.index === i && verifyingAnnotation?.action === "email_vendor"
                                ? "…"
                                : "Email vendor"}
                            </button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {canEditOrReEval && annotations.length > 0 && (
                  <div className="px-4 pb-4">
                    <button
                      type="button"
                      onClick={handleSaveAnnotationNotes}
                      disabled={savingAnnotations}
                      className="rounded-lg border border-amber-300 bg-amber-100 px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-200 disabled:opacity-50"
                    >
                      {savingAnnotations ? "Saving…" : "Save annotation notes"}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Evaluation rationale */}
            {hasAiScore && requirementsBreakdown.length > 0 && (
              <div className="mt-6 rounded-lg border border-slate-200 bg-white">
                <button
                  type="button"
                  onClick={() => setRationaleExpanded((v) => !v)}
                  className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold uppercase tracking-wide text-slate-500 hover:bg-slate-50"
                >
                  <span>Evaluation rationale</span>
                  <span className="text-slate-400">{rationaleExpanded ? "▼" : "▶"}</span>
                </button>
                {rationaleExpanded && (
                  <div className="border-t border-slate-200 px-4 pb-3 pt-2">
                    <div className="overflow-hidden rounded border border-slate-200">
                      <table className="min-w-full text-sm">
                        <thead className="bg-slate-50">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Requirement</th>
                            <th className="w-24 px-3 py-2 text-left text-xs font-medium text-slate-500">Compliant</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Note</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {requirementsBreakdown.map((row, i) => (
                            <tr key={i}>
                              <td className="px-3 py-2 text-slate-800">{row.requirement}</td>
                              <td className="px-3 py-2">
                                <span className={row.compliant ? "text-green-600" : "text-red-600"}>
                                  {row.compliant ? "Yes" : "No"}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-slate-600">{row.note}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Human review */}
            {canEditOrReEval && (
              <form onSubmit={handleSaveHuman} className="mt-6 space-y-3 rounded-lg border border-slate-200 bg-white p-4">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Your review</h3>
                <div>
                  <label className="block text-xs font-medium text-slate-600">Score</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    value={humanScore}
                    onChange={(e) => setHumanScore(e.target.value)}
                    className="mt-1 w-full rounded border border-slate-200 px-2 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600">Notes</label>
                  <textarea
                    value={humanNotes}
                    onChange={(e) => setHumanNotes(e.target.value)}
                    rows={3}
                    className="mt-1 w-full rounded border border-slate-200 px-2 py-1.5 text-sm"
                  />
                </div>
                <button
                  type="submit"
                  disabled={savingHuman}
                  className="w-full rounded-lg bg-indigo-600 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {savingHuman ? "Saving…" : "Save review"}
                </button>
              </form>
            )}

            {isApprover && (
              <div className="mt-6">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Final decision</h3>
                <div className="mt-3 flex gap-3">
                  <button
                    type="button"
                    onClick={async () => {
                      setUpdatingStatus(true);
                      try {
                        const updated = await updateBidStatus(id, "Approved", currentPersona);
                        setBid((prev) => (prev ? { ...prev, ...updated } : null));
                      } finally {
                        setUpdatingStatus(false);
                      }
                    }}
                    disabled={updatingStatus || bid.status === "Approved"}
                    className="flex-1 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                  >
                    Approve bid
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      setUpdatingStatus(true);
                      try {
                        const updated = await updateBidStatus(id, "Rejected", currentPersona);
                        setBid((prev) => (prev ? { ...prev, ...updated } : null));
                      } finally {
                        setUpdatingStatus(false);
                      }
                    }}
                    disabled={updatingStatus || bid.status === "Rejected"}
                    className="flex-1 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    Reject bid
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Evaluation history modal */}
      {historyModalOpen && bid?.evaluation_history && bid.evaluation_history.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
          <div className="max-h-[80vh] w-full max-w-lg overflow-hidden rounded-lg bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <h3 className="text-sm font-semibold text-slate-900">Evaluation history</h3>
              <button
                type="button"
                onClick={() => setHistoryModalOpen(false)}
                className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="overflow-y-auto p-4 space-y-4 max-h-[60vh]">
              {bid.evaluation_history.map((h, i) => (
                <div key={i} className="rounded border border-slate-200 p-3 text-sm">
                  <p className="text-xs text-slate-500">
                    {h.created_at ? new Date(h.created_at).toLocaleString() : "—"}
                  </p>
                  <p className="mt-1">AI score: {h.ai_score != null ? Number(h.ai_score).toFixed(1) : "—"}</p>
                  {h.ai_reasoning && <p className="mt-1 text-slate-600">{h.ai_reasoning}</p>}
                  {(h.human_score != null || (h.human_notes && h.human_notes.trim())) && (
                    <p className="mt-1 text-slate-500">Human: {h.human_score != null ? h.human_score : "—"} {h.human_notes?.trim() && `— ${h.human_notes.trim()}`}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
