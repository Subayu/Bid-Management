"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useRole } from "@/contexts/RoleContext";
import {
  fetchBidById,
  evaluateBid,
  updateBidHuman,
  updateBidStatus,
  getBidPdfUrl,
  getApiConfig,
  type BidDetailRecord,
  type AIProvider,
  type RequirementBreakdownItem,
} from "@/lib/api";

export default function BidDetailPage() {
  const params = useParams();
  const id = Number(params.id);
  const { currentPersona } = useRole();
  const [bid, setBid] = useState<BidDetailRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [evaluating, setEvaluating] = useState(false);
  const [humanScore, setHumanScore] = useState<string>("");
  const [humanNotes, setHumanNotes] = useState("");
  const [savingHuman, setSavingHuman] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [aiProvider, setAiProvider] = useState<AIProvider | null>(null);
  const [rationaleExpanded, setRationaleExpanded] = useState(false);

  const canEditHuman =
    currentPersona === "Reviewer" || currentPersona === "Bid Manager";
  const isApprover = currentPersona === "Approver";
  const canRunAi = !isApprover;

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
      setBid(data);
      setHumanScore(
        data.human_score != null ? String(data.human_score) : ""
      );
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
    getApiConfig()
      .then((c) => setAiProvider(c.ai_provider))
      .catch(() => setAiProvider("mock"));
  }, []);

  const handleRunEvaluation = async () => {
    setEvaluating(true);
    setError(null);
    try {
      const updated = await evaluateBid(id, currentPersona);
      setBid((prev) => (prev ? { ...prev, ...updated } : null));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to run evaluation");
    } finally {
      setEvaluating(false);
    }
  };

  const handleSaveHuman = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEditHuman) return;
    setSavingHuman(true);
    setError(null);
    try {
      const payload = {
        human_score:
          humanScore === "" ? null : parseFloat(humanScore),
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

  const handleApprove = async () => {
    setUpdatingStatus(true);
    setError(null);
    try {
      const updated = await updateBidStatus(id, "Approved", currentPersona);
      setBid((prev) => (prev ? { ...prev, ...updated } : null));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to approve");
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleReject = async () => {
    setUpdatingStatus(true);
    setError(null);
    try {
      const updated = await updateBidStatus(id, "Rejected", currentPersona);
      setBid((prev) => (prev ? { ...prev, ...updated } : null));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to reject");
    } finally {
      setUpdatingStatus(false);
    }
  };

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
        <Link
          href="/bids"
          className="mt-2 inline-block text-indigo-600 hover:underline"
        >
          ← Back to Bids
        </Link>
      </div>
    );
  }
  if (!bid) return null;

  const pdfUrl = getBidPdfUrl(bid.file_path);
  const hasAiScore = bid.ai_score != null;
  const evaluationSource = bid.ai_evaluation_source || "mock";
  let requirementsBreakdown: RequirementBreakdownItem[] = [];
  try {
    if (bid.ai_requirements_breakdown) {
      requirementsBreakdown = JSON.parse(bid.ai_requirements_breakdown) as RequirementBreakdownItem[];
    }
  } catch {
    requirementsBreakdown = [];
  }

  return (
    <div className="flex h-[calc(100vh-6rem)] flex-col p-8">
      <div className="mb-2 flex items-center justify-between">
        <Link
          href="/bids"
          className="text-sm font-medium text-indigo-600 hover:text-indigo-800"
        >
          ← Back to Bids
        </Link>
      </div>

      <div className="flex min-h-0 flex-1 gap-4 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        {/* Left: PDF viewer */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="border-b border-slate-200 px-4 py-2 text-sm font-medium text-slate-700">
            Document: {bid.filename}
          </div>
          <div className="min-h-0 flex-1 overflow-hidden bg-slate-100">
            <object
              data={pdfUrl}
              type="application/pdf"
              className="h-full w-full"
              title="Bid PDF"
            >
              <div className="flex h-full items-center justify-center p-4 text-center text-slate-600">
                <p>
                  PDF cannot be displayed. You can{" "}
                  <a
                    href={pdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-indigo-600 hover:underline"
                  >
                    open it in a new tab
                  </a>
                  .
                </p>
              </div>
            </object>
          </div>
        </div>

        {/* Right: Intelligence console */}
        <div className="flex w-[420px] shrink-0 flex-col border-l border-slate-200 bg-slate-50/50">
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
                      : "bg-slate-200 text-slate-700"
              }`}
            >
              {bid.status}
            </span>
            <p className="mt-1 text-xs text-slate-500">
              RFP: {bid.rfp.title}
            </p>
          </div>

          {error && (
            <div className="mx-4 mt-3 rounded-md bg-red-50 p-2 text-sm text-red-800">
              {error}
            </div>
          )}

          {/* AI section */}
          <div className="flex-1 overflow-y-auto px-4 py-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                AI evaluation
              </h3>
              {aiProvider && (
                <span
                  className={`rounded px-2 py-0.5 text-xs font-medium ${
                    aiProvider === "ollama"
                      ? "bg-emerald-100 text-emerald-800"
                      : aiProvider === "openai"
                        ? "bg-sky-100 text-sky-800"
                        : "bg-amber-100 text-amber-800"
                  }`}
                  title="Backend AI provider for evaluation"
                >
                  {aiProvider === "ollama"
                    ? "Ollama (llama3)"
                    : aiProvider === "openai"
                      ? "OpenAI"
                      : "Mock"}
                </span>
              )}
            </div>
            {evaluating ? (
              <div className="mt-3 flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-4">
                <svg
                  className="h-5 w-5 animate-spin text-indigo-600"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                <span className="text-sm text-slate-600">
                  AI is analyzing compliance…
                </span>
              </div>
            ) : hasAiScore ? (
              <div className="mt-3 space-y-3 rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold text-indigo-600">
                    {Number(bid.ai_score).toFixed(1)}
                  </span>
                  <span className="text-slate-500">/ 100</span>
                </div>
                <p className="text-xs text-slate-500">
                  Evaluation: {evaluationSource === "ollama" ? (
                    <span className="font-medium text-emerald-700">Ollama (live)</span>
                  ) : (
                    <span className="font-medium text-amber-700" title="Ollama may be unreachable; check backend logs and ensure Ollama is running on host.">
                      Mock (fallback)
                    </span>
                  )}
                </p>
                {bid.ai_reasoning && (
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                    {bid.ai_reasoning}
                  </p>
                )}
              </div>
            ) : canRunAi ? (
              <div className="mt-3">
                <button
                  type="button"
                  onClick={handleRunEvaluation}
                  className="w-full rounded-lg border-2 border-dashed border-indigo-300 bg-indigo-50/50 py-8 text-center text-sm font-medium text-indigo-700 transition hover:border-indigo-400 hover:bg-indigo-50"
                >
                  Run AI evaluation
                </button>
              </div>
            ) : null}

            {/* Scorer dashboard: rationale mapped to requirements (collapsed by default) */}
            {hasAiScore && requirementsBreakdown.length > 0 && (
              <div className="mt-6 rounded-lg border border-slate-200 bg-white">
                <button
                  type="button"
                  onClick={() => setRationaleExpanded((v) => !v)}
                  className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold uppercase tracking-wide text-slate-500 hover:bg-slate-50"
                >
                  <span>Evaluation rationale (auditor)</span>
                  <span className="text-slate-400">
                    {rationaleExpanded ? "▼" : "▶"}
                  </span>
                </button>
                {rationaleExpanded && (
                  <div className="border-t border-slate-200 px-4 pb-3 pt-2">
                    <p className="mb-2 text-xs text-slate-500">
                      Requirement-level compliance for audit trail.
                    </p>
                    <div className="overflow-hidden rounded border border-slate-200">
                      <table className="min-w-full text-sm">
                        <thead className="bg-slate-50">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">
                              Requirement
                            </th>
                            <th className="w-24 px-3 py-2 text-left text-xs font-medium text-slate-500">
                              Compliant
                            </th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">
                              Note
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {requirementsBreakdown.map((row, i) => (
                            <tr key={i}>
                              <td className="px-3 py-2 text-slate-800">{row.requirement}</td>
                              <td className="px-3 py-2">
                                <span
                                  className={
                                    row.compliant
                                      ? "text-green-600"
                                      : "text-red-600"
                                  }
                                >
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

            {/* Approver: Final Decision */}
            {isApprover && (
              <div className="mt-6">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                  Final decision
                </h3>
                <div className="mt-3 flex gap-3">
                  <button
                    type="button"
                    onClick={handleApprove}
                    disabled={updatingStatus || bid.status === "Approved"}
                    className="flex-1 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                  >
                    {updatingStatus ? "…" : "Approve bid"}
                  </button>
                  <button
                    type="button"
                    onClick={handleReject}
                    disabled={updatingStatus || bid.status === "Rejected"}
                    className="flex-1 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {updatingStatus ? "…" : "Reject bid"}
                  </button>
                </div>
                {bid.status === "Approved" && (
                  <p className="mt-2 text-xs text-green-700">Bid approved.</p>
                )}
                {bid.status === "Rejected" && (
                  <p className="mt-2 text-xs text-red-700">Bid rejected.</p>
                )}
              </div>
            )}

            {/* Human review section */}
            <h3 className="mt-6 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Human review
            </h3>
            <form onSubmit={handleSaveHuman} className="mt-3 space-y-3">
              <div>
                <label
                  htmlFor="human_score"
                  className="block text-xs font-medium text-slate-600"
                >
                  Reviewer score
                </label>
                <input
                  id="human_score"
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  value={humanScore}
                  onChange={(e) => setHumanScore(e.target.value)}
                  disabled={!canEditHuman}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 shadow-sm disabled:bg-slate-100 disabled:text-slate-500"
                />
              </div>
              <div>
                <label
                  htmlFor="human_notes"
                  className="block text-xs font-medium text-slate-600"
                >
                  Notes
                </label>
                <textarea
                  id="human_notes"
                  rows={4}
                  value={humanNotes}
                  onChange={(e) => setHumanNotes(e.target.value)}
                  disabled={!canEditHuman}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm disabled:bg-slate-100 disabled:text-slate-500"
                />
              </div>
              {canEditHuman && (
                <button
                  type="submit"
                  disabled={savingHuman}
                  className="rounded-md bg-slate-700 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  {savingHuman ? "Saving…" : "Save review"}
                </button>
              )}
              {!canEditHuman && (
                <p className="text-xs text-slate-500">
                  Switch to Reviewer or Bid Manager to edit.
                </p>
              )}
            </form>

            {/* Audit trail (for Auditors and all roles) */}
            <div className="mt-8 border-t border-slate-200 pt-6">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                Audit trail
              </h3>
              <p className="mt-1 text-xs text-slate-500">
                Who acted on this bid and when. Visible to Auditors and all roles.
              </p>
              {(!bid.audit_events || bid.audit_events.length === 0) ? (
                <p className="mt-3 text-sm text-slate-500">No events recorded yet.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {bid.audit_events.map((event) => (
                    <li
                      key={event.id}
                      className="flex items-start justify-between gap-2 rounded border border-slate-100 bg-white px-3 py-2 text-sm"
                    >
                      <span className="font-medium text-slate-800">
                        {event.action === "created"
                          ? "Created"
                          : event.action === "evaluated"
                            ? "Reviewed (AI scored)"
                            : event.action === "human_review"
                              ? "Human review saved"
                              : event.action === "approved"
                                ? "Approved"
                                : event.action === "rejected"
                                  ? "Rejected"
                                  : event.action}
                      </span>
                      <span className="shrink-0 text-slate-500">
                        {event.actor || "—"} ·{" "}
                        {event.created_at
                          ? new Date(event.created_at).toLocaleString()
                          : "—"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
