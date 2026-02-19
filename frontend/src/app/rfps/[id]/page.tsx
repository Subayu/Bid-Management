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
  type RFPRecord,
  type BidRecord,
  type BidDetailRecord,
  type ComparativeBidRow,
} from "@/lib/api";

type Tab = "bids" | "comparative";

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

  return (
    <div className="p-8">
      <Link
        href="/rfps"
        className="text-sm font-medium text-indigo-600 hover:text-indigo-800"
      >
        ← Back to RFPs
      </Link>

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
          {rfp.budget != null && (
            <span>Budget: ${Number(rfp.budget).toLocaleString()}</span>
          )}
          {rfp.bids_locked && (
            <span className="rounded bg-amber-100 px-2 py-1 text-amber-800">Bids locked</span>
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
                            row.status === "Approved" ? "bg-green-100 text-green-800" : row.status === "Rejected" ? "bg-red-100 text-red-800" : "bg-indigo-100 text-indigo-800"
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
      </div>
    </div>
  );
}
