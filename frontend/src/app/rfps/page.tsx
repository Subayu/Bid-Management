"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRole } from "@/contexts/RoleContext";
import {
  fetchRFPs,
  createRFP,
  type RFPRecord,
  type RFPCreatePayload,
} from "@/lib/api";
import { RFP_TEMPLATES } from "@/lib/rfpTemplates";

const DEFAULT_FORM: RFPCreatePayload = {
  title: "",
  description: "",
  requirements: "",
  budget: null,
  process_type: "Direct RFP",
  weight_technical: 40,
  weight_financial: 30,
  weight_compliance: 30,
  publish_date: null,
  qa_deadline: null,
  submission_deadline: null,
  review_date: null,
  decision_date: null,
  assigned_reviewers: [],
  assigned_approvers: [],
};

const MOCK_REVIEWERS = ["Alice (Reviewer)", "Bob (Reviewer)", "Carol (Reviewer)"];
const MOCK_APPROVERS = ["Dave (Approver)", "Eve (Approver)"];

export default function RFPsPage() {
  const { currentPersona } = useRole();
  const [rfps, setRfps] = useState<RFPRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3 | 4>(1);
  const [submitting, setSubmitting] = useState(false);
  const [weightError, setWeightError] = useState<string | null>(null);
  const [form, setForm] = useState<RFPCreatePayload>({ ...DEFAULT_FORM });

  const isBidManager = currentPersona === "Bid Manager";

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchRFPs();
      setRfps(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load RFPs");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openModal = () => {
    setForm({ ...DEFAULT_FORM });
    setWizardStep(1);
    setWeightError(null);
    setShowCreateModal(true);
  };

  const closeModal = () => {
    setShowCreateModal(false);
    setForm({ ...DEFAULT_FORM });
    setWizardStep(1);
    setWeightError(null);
  };

  const totalWeight =
    (form.weight_technical ?? 0) + (form.weight_financial ?? 0) + (form.weight_compliance ?? 0);
  const weightsValid = totalWeight === 100;

  const handleNext = () => {
    if (wizardStep === 2 && !weightsValid) {
      setWeightError("Weights must total exactly 100%");
      return;
    }
    setWeightError(null);
    if (wizardStep < 4) setWizardStep((s) => (s + 1) as 1 | 2 | 3 | 4);
  };

  const handleBack = () => {
    setWeightError(null);
    if (wizardStep > 1) setWizardStep((s) => (s - 1) as 1 | 2 | 3 | 4);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (wizardStep !== 4) return;
    if (!weightsValid) {
      setWeightError("Weights must total exactly 100%");
      return;
    }
    setSubmitting(true);
    setError(null);
    setWeightError(null);
    try {
      await createRFP({
        title: form.title,
        description: form.description ?? "",
        requirements: form.requirements ?? "",
        budget: form.budget ?? undefined,
        process_type: form.process_type ?? "Direct RFP",
        weight_technical: form.weight_technical ?? 40,
        weight_financial: form.weight_financial ?? 30,
        weight_compliance: form.weight_compliance ?? 30,
        publish_date: form.publish_date ?? undefined,
        qa_deadline: form.qa_deadline ?? undefined,
        submission_deadline: form.submission_deadline ?? undefined,
        review_date: form.review_date ?? undefined,
        decision_date: form.decision_date ?? undefined,
        assigned_reviewers: form.assigned_reviewers?.length ? form.assigned_reviewers : undefined,
        assigned_approvers: form.assigned_approvers?.length ? form.assigned_approvers : undefined,
      });
      closeModal();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create RFP");
    } finally {
      setSubmitting(false);
    }
  };

  const toggleReviewer = (name: string) => {
    setForm((f) => ({
      ...f,
      assigned_reviewers: f.assigned_reviewers?.includes(name)
        ? (f.assigned_reviewers.filter((x) => x !== name))
        : [...(f.assigned_reviewers ?? []), name],
    }));
  };

  const toggleApprover = (name: string) => {
    setForm((f) => ({
      ...f,
      assigned_approvers: f.assigned_approvers?.includes(name)
        ? (f.assigned_approvers.filter((x) => x !== name))
        : [...(f.assigned_approvers ?? []), name],
    }));
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">RFPs</h1>
        {isBidManager && (
          <button
            type="button"
            onClick={openModal}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Create RFP
          </button>
        )}
      </div>

      {error && (
        <div className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {loading ? (
        <p className="mt-4 text-slate-600">Loading RFPs…</p>
      ) : rfps.length === 0 ? (
        <p className="mt-4 text-slate-600">No RFPs yet. Create one to get started.</p>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rfps.map((rfp) => (
            <Link
              key={rfp.id}
              href={`/rfps/${rfp.id}`}
              className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-indigo-300 hover:shadow"
            >
              <h2 className="font-semibold text-slate-900">{rfp.title}</h2>
              <p className="mt-1 line-clamp-2 text-sm text-slate-600">
                {rfp.description || "—"}
              </p>
              <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                <span className="rounded bg-slate-100 px-2 py-0.5">{rfp.status}</span>
                {rfp.budget != null && (
                  <span>Budget: ${Number(rfp.budget).toLocaleString()}</span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}

      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-slate-900">Create RFP</h2>
            <div className="mt-2 flex gap-2 text-xs text-slate-500">
              <span className={wizardStep >= 1 ? "font-medium text-indigo-600" : ""}>1. Basics</span>
              <span>/</span>
              <span className={wizardStep >= 2 ? "font-medium text-indigo-600" : ""}>2. Criteria</span>
              <span>/</span>
              <span className={wizardStep >= 3 ? "font-medium text-indigo-600" : ""}>3. Timeline</span>
              <span>/</span>
              <span className={wizardStep >= 4 ? "font-medium text-indigo-600" : ""}>4. Team</span>
            </div>

            <form onSubmit={handleCreate} className="mt-4 space-y-4">
              {wizardStep === 1 && (
                <>
                  <div>
                    <label htmlFor="template" className="block text-sm font-medium text-slate-700">
                      Load template
                    </label>
                    <select
                      id="template"
                      value=""
                      onChange={(e) => {
                        const t = RFP_TEMPLATES.find((x) => x.id === e.target.value);
                        if (t) setForm((prev) => ({ ...prev, ...t.payload }));
                      }}
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    >
                      <option value="">— Select a template —</option>
                      {RFP_TEMPLATES.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Workflow stages</label>
                    <div className="mt-2 flex gap-4">
                      <label className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="process_type"
                          checked={form.process_type === "Direct RFP"}
                          onChange={() => setForm((f) => ({ ...f, process_type: "Direct RFP" }))}
                          className="text-indigo-600"
                        />
                        <span className="text-sm">Direct RFP</span>
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="process_type"
                          checked={form.process_type === "RFI -> RFP"}
                          onChange={() => setForm((f) => ({ ...f, process_type: "RFI -> RFP" }))}
                          className="text-indigo-600"
                        />
                        <span className="text-sm">RFI → RFP</span>
                      </label>
                    </div>
                  </div>
                  <div>
                    <label htmlFor="title" className="block text-sm font-medium text-slate-700">Title</label>
                    <input
                      id="title"
                      type="text"
                      required
                      value={form.title}
                      onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label htmlFor="description" className="block text-sm font-medium text-slate-700">Description</label>
                    <textarea
                      id="description"
                      rows={3}
                      value={form.description ?? ""}
                      onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label htmlFor="requirements" className="block text-sm font-medium text-slate-700">Requirements</label>
                    <textarea
                      id="requirements"
                      rows={3}
                      value={form.requirements ?? ""}
                      onChange={(e) => setForm((f) => ({ ...f, requirements: e.target.value }))}
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label htmlFor="budget" className="block text-sm font-medium text-slate-700">Budget (optional)</label>
                    <input
                      id="budget"
                      type="number"
                      step="any"
                      min={0}
                      value={form.budget ?? ""}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          budget: e.target.value === "" ? null : Number(e.target.value),
                        }))
                      }
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                </>
              )}

              {wizardStep === 2 && (
                <>
                  <p className="text-sm text-slate-600">Criteria weights must total 100%.</p>
                  {weightError && (
                    <p className="text-sm text-red-600">{weightError}</p>
                  )}
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label htmlFor="weight_technical" className="block text-sm font-medium text-slate-700">Technical %</label>
                      <input
                        id="weight_technical"
                        type="number"
                        min={0}
                        max={100}
                        value={form.weight_technical ?? 40}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, weight_technical: Number(e.target.value) || 0 }))
                        }
                        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>
                    <div>
                      <label htmlFor="weight_financial" className="block text-sm font-medium text-slate-700">Financial %</label>
                      <input
                        id="weight_financial"
                        type="number"
                        min={0}
                        max={100}
                        value={form.weight_financial ?? 30}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, weight_financial: Number(e.target.value) || 0 }))
                        }
                        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>
                    <div>
                      <label htmlFor="weight_compliance" className="block text-sm font-medium text-slate-700">Non-functional %</label>
                      <input
                        id="weight_compliance"
                        type="number"
                        min={0}
                        max={100}
                        value={form.weight_compliance ?? 30}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, weight_compliance: Number(e.target.value) || 0 }))
                        }
                        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>
                  </div>
                  <p className="text-sm text-slate-500">Total: {totalWeight}%</p>
                </>
              )}

              {wizardStep === 3 && (
                <div className="space-y-3">
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
                        value={form[key] ?? ""}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, [key]: e.target.value || null }))
                        }
                        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>
                  ))}
                </div>
              )}

              {wizardStep === 4 && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Reviewers</label>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {MOCK_REVIEWERS.map((name) => (
                        <button
                          key={name}
                          type="button"
                          onClick={() => toggleReviewer(name)}
                          className={`rounded-full px-3 py-1 text-sm ${
                            form.assigned_reviewers?.includes(name)
                              ? "bg-indigo-600 text-white"
                              : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                          }`}
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
                          onClick={() => toggleApprover(name)}
                          className={`rounded-full px-3 py-1 text-sm ${
                            form.assigned_approvers?.includes(name)
                              ? "bg-indigo-600 text-white"
                              : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                          }`}
                        >
                          {name}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div className="flex justify-between gap-2 border-t border-slate-200 pt-4">
                <div>
                  {wizardStep > 1 ? (
                    <button
                      type="button"
                      onClick={handleBack}
                      className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Back
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={closeModal}
                      className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                  )}
                </div>
                <div>
                  {wizardStep < 4 ? (
                    <button
                      type="button"
                      onClick={handleNext}
                      className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                    >
                      Next
                    </button>
                  ) : (
                    <button
                      type="submit"
                      disabled={submitting}
                      className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                    >
                      {submitting ? "Creating…" : "Create"}
                    </button>
                  )}
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
