"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useRole } from "@/contexts/RoleContext";
import {
  fetchRFP,
  fetchBids,
  uploadBid,
  extractVendor,
  fetchBidById,
  lockRfpBids,
  fetchComparativeAnalysis,
  updateRFP,
  fetchRFPQA,
  createRFPQA,
  answerQA,
  type RFPRecord,
  type BidRecord,
  type BidDetailRecord,
  type ComparativeBidRow,
  type VendorQARecord,
  type RFPCreatePayload,
} from "@/lib/api";
import { Calendar, ChevronRight, MessageCircle, Send } from "lucide-react";

const MOCK_REVIEWERS = ["Alice (Reviewer)", "Bob (Reviewer)", "Carol (Reviewer)"];
const MOCK_APPROVERS = ["Dave (Approver)", "Eve (Approver)"];

function rfpToEditForm(r: RFPRecord): RFPCreatePayload {
  const toDateStr = (v: string | null | undefined) =>
    v ? (v.slice ? String(v).slice(0, 10) : "") : "";
  return {
    title: r.title,
    description: r.description ?? "",
    requirements: r.requirements ?? "",
    budget: r.budget ?? null,
    process_type: r.process_type ?? "Direct RFP",
    weight_technical: r.weight_technical ?? 40,
    weight_financial: r.weight_financial ?? 30,
    weight_compliance: r.weight_compliance ?? 30,
    publish_date: toDateStr(r.publish_date) || null,
    qa_deadline: toDateStr(r.qa_deadline) || null,
    submission_deadline: toDateStr(r.submission_deadline) || null,
    review_date: toDateStr(r.review_date) || null,
    decision_date: toDateStr(r.decision_date) || null,
    assigned_reviewers: r.assigned_reviewers ?? [],
    assigned_approvers: r.assigned_approvers ?? [],
  };
}

type Tab = "bids" | "comparative" | "qa";

export default function RFPDetailPage() {
  const params = useParams();
  const id = Number(params.id);
  const { currentPersona } = useRole();
  const [rfp, setRfp] = useState<RFPRecord | null>(null);
  const [bids, setBids] = useState<BidRecord[]>([]);
  const [comparative, setComparative] = useState<ComparativeBidRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [lastUploadedBid, setLastUploadedBid] = useState<BidDetailRecord | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [tab, setTab] = useState<Tab>("bids");
  const [locking, setLocking] = useState(false);
  const [uploadPhase, setUploadPhase] = useState<"idle" | "uploading" | "ai_processing" | "done">("idle");
  const [aiElapsedSeconds, setAiElapsedSeconds] = useState(0);
  const [lastAiDurationSeconds, setLastAiDurationSeconds] = useState<number | null>(null);
  const aiProcessingStartRef = useRef<number | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [qaList, setQaList] = useState<VendorQARecord[]>([]);
  const [qaSubmitting, setQaSubmitting] = useState(false);
  const [qaAnsweringId, setQaAnsweringId] = useState<number | null>(null);
  const [answerText, setAnswerText] = useState("");
  const [newQuestionVendor, setNewQuestionVendor] = useState("");
  const [newQuestionText, setNewQuestionText] = useState("");
  const [showEditForm, setShowEditForm] = useState(false);
  const [editForm, setEditForm] = useState<RFPCreatePayload>({
    title: "", description: "", requirements: "", budget: null, process_type: "Direct RFP",
    weight_technical: 40, weight_financial: 30, weight_compliance: 30,
    publish_date: null, qa_deadline: null, submission_deadline: null, review_date: null, decision_date: null,
    assigned_reviewers: [], assigned_approvers: [],
  });
  const [editWeightError, setEditWeightError] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const isBidManager = currentPersona === "Bid Manager";

  // Live timer during AI processing
  useEffect(() => {
    if (uploadPhase !== "ai_processing" || aiProcessingStartRef.current == null) return;
    const interval = setInterval(() => {
      setAiElapsedSeconds(Math.floor((Date.now() - aiProcessingStartRef.current!) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [uploadPhase]);

  const load = async () => {
    if (!id || Number.isNaN(id)) {
      setError("Invalid RFP id");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [rfpData, bidsData] = await Promise.all([
        fetchRFP(id),
        fetchBids(id),
      ]);
      setRfp(rfpData);
      setBids(bidsData);
      if (tab === "comparative") {
        const comp = await fetchComparativeAnalysis(id);
        setComparative(comp);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [id]);

  useEffect(() => {
    if (tab === "comparative" && id && !Number.isNaN(id)) {
      fetchComparativeAnalysis(id).then(setComparative).catch(() => setComparative([]));
    }
  }, [tab, id]);

  useEffect(() => {
    if (tab === "qa" && id && !Number.isNaN(id)) {
      fetchRFPQA(id).then(setQaList).catch(() => setQaList([]));
    }
  }, [tab, id]);

  const handlePublish = async () => {
    if (!id) return;
    setPublishing(true);
    setError(null);
    try {
      const updated = await updateRFP(id, { current_stage: "Published" });
      setRfp(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to publish");
    } finally {
      setPublishing(false);
    }
  };

  const openEditForm = () => {
    if (rfp) {
      setEditForm(rfpToEditForm(rfp));
      setEditWeightError(null);
      setShowEditForm(true);
    }
  };

  const totalEditWeight =
    (editForm.weight_technical ?? 0) + (editForm.weight_financial ?? 0) + (editForm.weight_compliance ?? 0);
  const editWeightsValid = totalEditWeight === 100;

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    if (!editWeightsValid) {
      setEditWeightError("Weights must total exactly 100%");
      return;
    }
    setEditWeightError(null);
    setSavingEdit(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        title: editForm.title,
        description: editForm.description ?? "",
        requirements: editForm.requirements ?? "",
        budget: editForm.budget ?? undefined,
        process_type: editForm.process_type ?? "Direct RFP",
        weight_technical: editForm.weight_technical ?? 40,
        weight_financial: editForm.weight_financial ?? 30,
        weight_compliance: editForm.weight_compliance ?? 30,
        publish_date: editForm.publish_date || undefined,
        qa_deadline: editForm.qa_deadline || undefined,
        submission_deadline: editForm.submission_deadline || undefined,
        review_date: editForm.review_date || undefined,
        decision_date: editForm.decision_date || undefined,
        assigned_reviewers: editForm.assigned_reviewers?.length ? editForm.assigned_reviewers : undefined,
        assigned_approvers: editForm.assigned_approvers?.length ? editForm.assigned_approvers : undefined,
      };
      const updated = await updateRFP(id, payload);
      setRfp(updated);
      setShowEditForm(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update RFP");
    } finally {
      setSavingEdit(false);
    }
  };

  const toggleEditReviewer = (name: string) => {
    setEditForm((f) => ({
      ...f,
      assigned_reviewers: f.assigned_reviewers?.includes(name)
        ? (f.assigned_reviewers.filter((x) => x !== name))
        : [...(f.assigned_reviewers ?? []), name],
    }));
  };

  const toggleEditApprover = (name: string) => {
    setEditForm((f) => ({
      ...f,
      assigned_approvers: f.assigned_approvers?.includes(name)
        ? (f.assigned_approvers.filter((x) => x !== name))
        : [...(f.assigned_approvers ?? []), name],
    }));
  };

  const handleSubmitQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newQuestionText.trim() || !id) return;
    setQaSubmitting(true);
    setError(null);
    try {
      const created = await createRFPQA(id, {
        vendor_name: newQuestionVendor.trim() || "Vendor",
        question: newQuestionText.trim(),
      });
      setQaList((prev) => [created, ...prev]);
      setNewQuestionVendor("");
      setNewQuestionText("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to submit question");
    } finally {
      setQaSubmitting(false);
    }
  };

  const handleAnswerQA = async (qaId: number) => {
    if (!answerText.trim()) return;
    setQaAnsweringId(qaId);
    setError(null);
    try {
      const updated = await answerQA(qaId, answerText.trim());
      setQaList((prev) => prev.map((q) => (q.id === qaId ? updated : q)));
      setAnswerText("");
      setQaAnsweringId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to answer");
    } finally {
      setQaAnsweringId(null);
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setError("Please select a PDF file.");
      return;
    }
    setUploading(true);
    setError(null);
    setLastUploadedBid(null);
    setLastAiDurationSeconds(null);
    setUploadPhase("uploading");
    try {
      const created = await uploadBid(id, selectedFile, currentPersona);
      setSelectedFile(null);
      aiProcessingStartRef.current = Date.now();
      setAiElapsedSeconds(0);
      setUploadPhase("ai_processing");
      await extractVendor(created.id, currentPersona);
      setLastAiDurationSeconds((Date.now() - aiProcessingStartRef.current) / 1000);
      aiProcessingStartRef.current = null;
      setUploadPhase("done");
      setUploading(false);
      const full = await fetchBidById(created.id);
      setLastUploadedBid(full);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to upload bid");
      setUploadPhase("idle");
      aiProcessingStartRef.current = null;
    } finally {
      setUploading(false);
    }
  };

  const handleLockBids = async () => {
    if (!id) return;
    setLocking(true);
    setError(null);
    try {
      const updated = await lockRfpBids(id);
      setRfp(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to lock bids");
    } finally {
      setLocking(false);
    }
  };

  if (loading) return <div className="p-8"><p className="text-slate-600">Loading…</p></div>;
  if (error && !rfp)
    return (
      <div className="p-8">
        <p className="text-red-600">{error}</p>
        <Link href="/rfps" className="mt-2 inline-block text-indigo-600 hover:underline">
          Back to RFPs
        </Link>
      </div>
    );
  if (!rfp) return null;

  const timelineDates = [
    { key: "publish_date" as const, label: "Publish", date: rfp.publish_date },
    { key: "qa_deadline" as const, label: "Q&A", date: rfp.qa_deadline },
    { key: "submission_deadline" as const, label: "Submission", date: rfp.submission_deadline },
    { key: "review_date" as const, label: "Review", date: rfp.review_date },
    { key: "decision_date" as const, label: "Decision", date: rfp.decision_date },
  ];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let activeIndex = -1;
  timelineDates.forEach((d, i) => {
    if (d.date) {
      const dDate = new Date(d.date);
      dDate.setHours(0, 0, 0, 0);
      if (dDate <= today) activeIndex = i;
    }
  });

  return (
    <div className="p-8">
      <Link
        href="/rfps"
        className="text-sm font-medium text-indigo-600 hover:text-indigo-800"
      >
        ← Back to RFPs
      </Link>

      {/* Timeline */}
      <div className="mt-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <Calendar className="h-4 w-4 text-slate-500" />
          Timeline
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 sm:gap-0">
          {timelineDates.map((milestone, i) => {
            const isActive = i === activeIndex;
            const isPast = i < activeIndex;
            const hasDate = Boolean(milestone.date);
            return (
              <div key={milestone.key} className="flex flex-shrink-0 items-center">
                <div
                  className={`flex flex-col items-center rounded-lg px-3 py-2 text-xs sm:px-4 ${
                    isActive ? "bg-indigo-100 text-indigo-800 ring-1 ring-indigo-300" : hasDate ? "bg-slate-50 text-slate-600" : "bg-slate-50/50 text-slate-400"
                  }`}
                >
                  <span className="font-medium">{milestone.label}</span>
                  <span className="mt-0.5">
                    {milestone.date
                      ? new Date(milestone.date).toLocaleDateString()
                      : "—"}
                  </span>
                </div>
                {i < timelineDates.length - 1 && (
                  <ChevronRight className="mx-1 h-4 w-4 flex-shrink-0 text-slate-300 sm:mx-2" />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">{rfp.title}</h1>
        <p className="mt-2 text-slate-600">{rfp.description || "—"}</p>
        {rfp.requirements && (
          <div className="mt-4">
            <h3 className="text-sm font-semibold text-slate-700">Requirements</h3>
            <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">
              {rfp.requirements}
            </p>
          </div>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-slate-500">
          <span className="rounded bg-slate-100 px-2 py-1">{rfp.status}</span>
          {rfp.current_stage && (
            <span className="rounded bg-slate-100 px-2 py-1">{rfp.current_stage}</span>
          )}
          {rfp.budget != null && (
            <span>Budget: ${Number(rfp.budget).toLocaleString()}</span>
          )}
          {rfp.bids_locked && (
            <span className="rounded bg-amber-100 px-2 py-1 text-amber-800">Bids locked</span>
          )}
          {isBidManager && rfp.current_stage === "Draft" && (
            <>
              <button
                type="button"
                onClick={openEditForm}
                className="rounded-md bg-slate-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
              >
                Edit RFP
              </button>
              <button
                type="button"
                onClick={handlePublish}
                disabled={publishing}
                className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {publishing ? "Publishing…" : "Publish to Procurement Portal"}
              </button>
            </>
          )}
          {isBidManager && !rfp.bids_locked && (
            <button
              type="button"
              onClick={handleLockBids}
              disabled={locking}
              className="rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
            >
              {locking ? "Locking…" : "Lock Bids for Final Decision"}
            </button>
          )}
        </div>
      </div>

      {isBidManager && rfp.current_stage === "Draft" && showEditForm && (
        <div className="mt-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Edit RFP</h2>
          <form onSubmit={handleSaveEdit} className="mt-4 space-y-4">
            <div>
              <label htmlFor="edit_title" className="block text-sm font-medium text-slate-700">Title</label>
              <input
                id="edit_title"
                type="text"
                required
                value={editForm.title}
                onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label htmlFor="edit_description" className="block text-sm font-medium text-slate-700">Description</label>
              <textarea
                id="edit_description"
                rows={3}
                value={editForm.description ?? ""}
                onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label htmlFor="edit_requirements" className="block text-sm font-medium text-slate-700">Requirements</label>
              <textarea
                id="edit_requirements"
                rows={3}
                value={editForm.requirements ?? ""}
                onChange={(e) => setEditForm((f) => ({ ...f, requirements: e.target.value }))}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label htmlFor="edit_budget" className="block text-sm font-medium text-slate-700">Budget (optional)</label>
              <input
                id="edit_budget"
                type="number"
                step="any"
                min={0}
                value={editForm.budget ?? ""}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, budget: e.target.value === "" ? null : Number(e.target.value) }))
                }
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Process type</label>
              <div className="mt-2 flex gap-4">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="edit_process_type"
                    checked={editForm.process_type === "Direct RFP"}
                    onChange={() => setEditForm((f) => ({ ...f, process_type: "Direct RFP" }))}
                    className="text-indigo-600"
                  />
                  <span className="text-sm">Direct RFP</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="edit_process_type"
                    checked={editForm.process_type === "RFI -> RFP"}
                    onChange={() => setEditForm((f) => ({ ...f, process_type: "RFI -> RFP" }))}
                    className="text-indigo-600"
                  />
                  <span className="text-sm">RFI → RFP</span>
                </label>
              </div>
            </div>
            <div>
              <p className="text-sm text-slate-600">Criteria weights must total 100%.</p>
              {editWeightError && <p className="text-sm text-red-600">{editWeightError}</p>}
              <div className="mt-2 grid grid-cols-3 gap-4">
                <div>
                  <label htmlFor="edit_weight_technical" className="block text-sm font-medium text-slate-700">Technical %</label>
                  <input
                    id="edit_weight_technical"
                    type="number"
                    min={0}
                    max={100}
                    value={editForm.weight_technical ?? 40}
                    onChange={(e) => setEditForm((f) => ({ ...f, weight_technical: Number(e.target.value) || 0 }))}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label htmlFor="edit_weight_financial" className="block text-sm font-medium text-slate-700">Financial %</label>
                  <input
                    id="edit_weight_financial"
                    type="number"
                    min={0}
                    max={100}
                    value={editForm.weight_financial ?? 30}
                    onChange={(e) => setEditForm((f) => ({ ...f, weight_financial: Number(e.target.value) || 0 }))}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label htmlFor="edit_weight_compliance" className="block text-sm font-medium text-slate-700">Non-functional %</label>
                  <input
                    id="edit_weight_compliance"
                    type="number"
                    min={0}
                    max={100}
                    value={editForm.weight_compliance ?? 30}
                    onChange={(e) => setEditForm((f) => ({ ...f, weight_compliance: Number(e.target.value) || 0 }))}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>
              <p className="mt-1 text-sm text-slate-500">Total: {totalEditWeight}%</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { key: "publish_date" as const, label: "Publish date" },
                { key: "qa_deadline" as const, label: "Q&A deadline" },
                { key: "submission_deadline" as const, label: "Submission deadline" },
                { key: "review_date" as const, label: "Review date" },
                { key: "decision_date" as const, label: "Decision date" },
              ].map(({ key, label }) => (
                <div key={key}>
                  <label className="block text-sm font-medium text-slate-700">{label}</label>
                  <input
                    type="date"
                    value={editForm[key] ?? ""}
                    onChange={(e) => setEditForm((f) => ({ ...f, [key]: e.target.value || null }))}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              ))}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Reviewers</label>
              <div className="mt-2 flex flex-wrap gap-2">
                {MOCK_REVIEWERS.map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => toggleEditReviewer(name)}
                    className={`rounded-full px-3 py-1 text-sm ${editForm.assigned_reviewers?.includes(name) ? "bg-indigo-600 text-white" : "bg-slate-200 text-slate-700 hover:bg-slate-300"}`}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Approvers</label>
              <div className="mt-2 flex flex-wrap gap-2">
                {MOCK_APPROVERS.map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => toggleEditApprover(name)}
                    className={`rounded-full px-3 py-1 text-sm ${editForm.assigned_approvers?.includes(name) ? "bg-indigo-600 text-white" : "bg-slate-200 text-slate-700 hover:bg-slate-300"}`}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={savingEdit || !editWeightsValid}
                className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {savingEdit ? "Saving…" : "Save changes"}
              </button>
              <button
                type="button"
                onClick={() => setShowEditForm(false)}
                className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {isBidManager && !rfp.bids_locked && (
        <div className="mt-8 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Upload Bid</h2>
          <p className="mt-1 text-sm text-slate-500">Vendor details are extracted from the PDF by AI after upload.</p>
          <form onSubmit={handleUpload} className="mt-4 space-y-4">
            <div>
              <label
                htmlFor="bid_file"
                className="block text-sm font-medium text-slate-700"
              >
                PDF File
              </label>
              <input
                id="bid_file"
                type="file"
                accept=".pdf,application/pdf"
                required
                onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
                className="mt-1 block w-full max-w-md text-sm text-slate-600 file:mr-4 file:rounded-md file:border-0 file:bg-indigo-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-indigo-700 hover:file:bg-indigo-100"
              />
            </div>
            <button
              type="submit"
              disabled={uploading}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {uploading
                ? uploadPhase === "uploading"
                  ? "Uploading…"
                  : uploadPhase === "ai_processing"
                    ? "Document uploaded. Vendor extraction…"
                    : "Processing…"
                : "Upload Bid"}
            </button>
            {uploading && (
              <p className="text-sm text-slate-500">
                {uploadPhase === "uploading" && "Uploading…"}
                {uploadPhase === "ai_processing" && (
                  <>Vendor extraction in progress… <span className="font-mono font-medium text-slate-700">{Math.floor(aiElapsedSeconds / 60)}:{(aiElapsedSeconds % 60).toString().padStart(2, "0")}</span></>
                )}
              </p>
            )}
            {uploadPhase === "done" && lastUploadedBid && (
              <p className="text-sm font-medium text-green-700">
                Uploaded – vendor extracted.
                {lastAiDurationSeconds != null && lastAiDurationSeconds >= 1 && (
                  <span className="ml-1 text-slate-600 font-normal">(Ready in {lastAiDurationSeconds < 60 ? `${Math.round(lastAiDurationSeconds)}s` : `${Math.floor(lastAiDurationSeconds / 60)}m ${Math.round(lastAiDurationSeconds % 60)}s`})</span>
                )}
              </p>
            )}
          </form>
          {lastUploadedBid?.vendor && (
            <div className="mt-6 rounded-md border border-slate-200 bg-slate-50 p-4">
              <h3 className="text-sm font-semibold text-slate-700">Extracted vendor (for confirmation)</h3>
              <dl className="mt-2 space-y-2 text-sm">
                <div><span className="font-medium text-slate-600">Name:</span> {lastUploadedBid.vendor.name}</div>
                {lastUploadedBid.vendor.address != null && lastUploadedBid.vendor.address !== "" && (
                  <div><span className="font-medium text-slate-600">Address:</span> {lastUploadedBid.vendor.address}</div>
                )}
                {lastUploadedBid.vendor.website != null && lastUploadedBid.vendor.website !== "" && (
                  <div className="flex items-center gap-1">
                    <span className="font-medium text-slate-600">Website:</span>
                    <a href={lastUploadedBid.vendor.website} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">{lastUploadedBid.vendor.website}</a>
                    {lastUploadedBid.vendor.website_verified === true && <span className="text-green-600" title="Verified">✓</span>}
                    {lastUploadedBid.vendor.website_verified === false && <span className="text-red-600" title="Unreachable">✗</span>}
                  </div>
                )}
                {lastUploadedBid.vendor.representatives?.length ? (
                  <div className="mt-2">
                    <span className="font-medium text-slate-600">Representatives:</span>
                    <ul className="mt-1 list-inside list-disc space-y-1">
                      {lastUploadedBid.vendor.representatives.map((r) => (
                        <li key={r.id}>
                          <span className="font-medium text-slate-600">Name:</span> {r.name || "—"}
                          {r.designation != null && r.designation !== "" && <><span className="font-medium text-slate-600"> Designation:</span> {r.designation}</>}
                          {r.email != null && r.email !== "" && <><span className="font-medium text-slate-600"> Email:</span> {r.email}</>}
                          {r.phone != null && r.phone !== "" && (
                            <><span className="font-medium text-slate-600"> Phone:</span> {r.phone}
                              {r.phone_verified === true && <span className="text-green-600 ml-0.5" title="Verified">✓</span>}
                              {r.phone_verified === false && <span className="text-red-600 ml-0.5" title="Invalid">✗</span>}
                            </>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </dl>
            </div>
          )}
        </div>
      )}

      <div className="mt-8 rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex border-b border-slate-200">
          <button
            type="button"
            onClick={() => setTab("bids")}
            className={`px-6 py-3 text-sm font-medium ${tab === "bids" ? "border-b-2 border-indigo-600 text-indigo-600" : "text-slate-500 hover:text-slate-700"}`}
          >
            Bids ({bids.length})
          </button>
          <button
            type="button"
            onClick={() => setTab("comparative")}
            className={`px-6 py-3 text-sm font-medium ${tab === "comparative" ? "border-b-2 border-indigo-600 text-indigo-600" : "text-slate-500 hover:text-slate-700"}`}
          >
            Comparative Analysis
          </button>
          <button
            type="button"
            onClick={() => setTab("qa")}
            className={`flex items-center gap-1.5 px-6 py-3 text-sm font-medium ${tab === "qa" ? "border-b-2 border-indigo-600 text-indigo-600" : "text-slate-500 hover:text-slate-700"}`}
          >
            <MessageCircle className="h-4 w-4" />
            Vendor Q&A ({qaList.length})
          </button>
        </div>
        {tab === "bids" && (
          <>
            {bids.length === 0 ? (
              <p className="p-6 text-slate-600">No bids yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-2 text-left text-xs font-medium uppercase text-slate-500">
                    Vendor
                  </th>
                  <th className="px-6 py-2 text-left text-xs font-medium uppercase text-slate-500">
                    Filename
                  </th>
                  <th className="px-6 py-2 text-left text-xs font-medium uppercase text-slate-500">
                    AI score
                  </th>
                  <th className="px-6 py-2 text-left text-xs font-medium uppercase text-slate-500">
                    Human score
                  </th>
                  <th className="px-6 py-2 text-left text-xs font-medium uppercase text-slate-500">
                    Status
                  </th>
                  <th className="px-6 py-2 text-left text-xs font-medium uppercase text-slate-500">
                    Created
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {bids.map((bid) => (
                  <tr key={bid.id}>
                    <td className="whitespace-nowrap px-6 py-3 text-sm text-slate-900">
                      <Link
                        href={`/bids/${bid.id}`}
                        className="font-medium text-indigo-600 hover:text-indigo-800"
                      >
                        {bid.vendor_name}
                      </Link>
                    </td>
                    <td className="px-6 py-3 text-sm text-slate-600">
                      <Link href={`/bids/${bid.id}`} className="text-indigo-600 hover:underline">
                        {bid.filename}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-6 py-3 text-sm text-slate-700">
                      {bid.ai_score != null ? Number(bid.ai_score).toFixed(1) : "—"}
                    </td>
                    <td className="whitespace-nowrap px-6 py-3 text-sm text-slate-700">
                      {bid.human_score != null ? Number(bid.human_score).toFixed(1) : "—"}
                    </td>
                    <td className="px-6 py-3 text-sm">
                        <span
                          className={`rounded px-2 py-0.5 text-xs font-medium ${
                            bid.status === "Approved"
                              ? "bg-green-100 text-green-800"
                              : bid.status === "Rejected"
                                ? "bg-red-100 text-red-800"
                                : bid.status === "Evaluated"
                                  ? "bg-indigo-100 text-indigo-800"
                                  : bid.status === "Draft" || bid.status === "Uploaded"
                                    ? "bg-amber-50 text-amber-800"
                                    : "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {bid.status}
                        </span>
                    </td>
                    <td className="whitespace-nowrap px-6 py-3 text-sm text-slate-500">
                      {bid.created_at
                        ? new Date(bid.created_at).toLocaleDateString()
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
          </>
        )}
        {tab === "comparative" && (
          <>
            {comparative.length === 0 ? (
              <p className="p-6 text-slate-600">No evaluated bids yet. Run AI evaluation on bids to see comparative analysis.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-6 py-2 text-left text-xs font-medium uppercase text-slate-500">Vendor</th>
                      <th className="px-6 py-2 text-left text-xs font-medium uppercase text-slate-500">Filename</th>
                      <th className="px-6 py-2 text-left text-xs font-medium uppercase text-slate-500">AI Score</th>
                      <th className="px-6 py-2 text-left text-xs font-medium uppercase text-slate-500">Human Score</th>
                      <th className="px-6 py-2 text-left text-xs font-medium uppercase text-slate-500">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {comparative.map((row) => (
                      <tr key={row.bid_id}>
                        <td className="whitespace-nowrap px-6 py-3 text-sm text-slate-900">
                          <Link href={`/bids/${row.bid_id}`} className="font-medium text-indigo-600 hover:text-indigo-800">
                            {row.vendor_name}
                          </Link>
                        </td>
                        <td className="px-6 py-3 text-sm text-slate-600">{row.filename}</td>
                        <td className="whitespace-nowrap px-6 py-3 text-sm text-slate-700">{row.ai_score != null ? Number(row.ai_score).toFixed(1) : "—"}</td>
                        <td className="whitespace-nowrap px-6 py-3 text-sm text-slate-700">{row.human_score != null ? Number(row.human_score).toFixed(1) : "—"}</td>
                        <td className="px-6 py-3 text-sm">
                          <span className={`rounded px-2 py-0.5 text-xs font-medium ${
                            row.status === "Approved" ? "bg-green-100 text-green-800" : row.status === "Rejected" ? "bg-red-100 text-red-800" : row.status === "Evaluated" ? "bg-indigo-100 text-indigo-800" : "bg-amber-50 text-amber-800"
                          }`}>{row.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
        {tab === "qa" && (
          <div className="p-6">
            <div className="mb-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <Send className="h-4 w-4 text-slate-500" />
                Submit a question (vendor perspective)
              </h3>
              <form onSubmit={handleSubmitQuestion} className="mt-3 space-y-3">
                <input
                  type="text"
                  placeholder="Vendor / company name"
                  value={newQuestionVendor}
                  onChange={(e) => setNewQuestionVendor(e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
                <textarea
                  placeholder="Your question…"
                  rows={2}
                  value={newQuestionText}
                  onChange={(e) => setNewQuestionText(e.target.value)}
                  required
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
                <button
                  type="submit"
                  disabled={qaSubmitting}
                  className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {qaSubmitting ? "Submitting…" : "Submit question"}
                </button>
              </form>
            </div>
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
              <MessageCircle className="h-4 w-4 text-slate-500" />
              Questions & answers
            </h3>
            {qaList.length === 0 ? (
              <p className="text-sm text-slate-500">No questions yet. Submit one above (mock vendor view).</p>
            ) : (
              <div className="space-y-2">
                {qaList.map((q) => (
                  <div
                    key={q.id}
                    className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-slate-500">{q.vendor_name}</p>
                        <p className="mt-1 text-sm font-medium text-slate-800">{q.question}</p>
                        {q.answer && (
                          <div className="mt-2 rounded bg-slate-50 p-2 text-sm text-slate-700">
                            <span className="font-medium text-slate-600">Answer: </span>
                            {q.answer}
                          </div>
                        )}
                      </div>
                      <span className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium ${
                        q.status === "Answered" ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"
                      }`}>
                        {q.status}
                      </span>
                    </div>
                    {q.status === "Unanswered" && isBidManager && (
                      <div className="mt-3 flex gap-2">
                        <input
                          type="text"
                          placeholder="Type your answer…"
                          value={qaAnsweringId === q.id ? answerText : ""}
                          onChange={(e) => {
                            if (qaAnsweringId === q.id) setAnswerText(e.target.value);
                          }}
                          onFocus={() => setQaAnsweringId(q.id)}
                          className="flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                        />
                        <button
                          type="button"
                          onClick={() => handleAnswerQA(q.id)}
                          disabled={!(qaAnsweringId === q.id && answerText.trim())}
                          className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                        >
                          Answer
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
