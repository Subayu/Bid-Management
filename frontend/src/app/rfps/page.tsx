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

export default function RFPsPage() {
  const { currentPersona } = useRole();
  const [rfps, setRfps] = useState<RFPRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<RFPCreatePayload>({
    title: "",
    description: "",
    requirements: "",
    budget: null,
  });

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

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await createRFP({
        ...form,
        budget: form.budget ?? undefined,
      });
      setShowCreateModal(false);
      setForm({ title: "", description: "", requirements: "", budget: null });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create RFP");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">RFPs</h1>
        {isBidManager && (
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
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
            <div className="mt-4">
              <label htmlFor="template" className="block text-sm font-medium text-slate-700">
                Load template
              </label>
              <select
                id="template"
                value=""
                onChange={(e) => {
                  const t = RFP_TEMPLATES.find((x) => x.id === e.target.value);
                  if (t) setForm(t.payload);
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
            <form onSubmit={handleCreate} className="mt-4 space-y-4">
              <div>
                <label htmlFor="title" className="block text-sm font-medium text-slate-700">
                  Title
                </label>
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
                <label
                  htmlFor="description"
                  className="block text-sm font-medium text-slate-700"
                >
                  Description
                </label>
                <textarea
                  id="description"
                  rows={3}
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label
                  htmlFor="requirements"
                  className="block text-sm font-medium text-slate-700"
                >
                  Requirements
                </label>
                <textarea
                  id="requirements"
                  rows={3}
                  value={form.requirements}
                  onChange={(e) => setForm((f) => ({ ...f, requirements: e.target.value }))}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label htmlFor="budget" className="block text-sm font-medium text-slate-700">
                  Budget (optional)
                </label>
                <input
                  id="budget"
                  type="number"
                  step="any"
                  min="0"
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
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {submitting ? "Creating…" : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
