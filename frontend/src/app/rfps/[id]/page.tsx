"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useRole } from "@/contexts/RoleContext";
import {
  fetchRFP,
  fetchBids,
  uploadBid,
  type RFPRecord,
  type BidRecord,
} from "@/lib/api";

export default function RFPDetailPage() {
  const params = useParams();
  const id = Number(params.id);
  const { currentPersona } = useRole();
  const [rfp, setRfp] = useState<RFPRecord | null>(null);
  const [bids, setBids] = useState<BidRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [vendorName, setVendorName] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const isBidManager = currentPersona === "Bid Manager";

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
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [id]);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile || !vendorName.trim()) {
      setError("Vendor name and a PDF file are required.");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      await uploadBid(id, vendorName.trim(), selectedFile, currentPersona);
      setVendorName("");
      setSelectedFile(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to upload bid");
    } finally {
      setUploading(false);
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
        <div className="mt-4 flex gap-4 text-sm text-slate-500">
          <span className="rounded bg-slate-100 px-2 py-1">{rfp.status}</span>
          {rfp.budget != null && (
            <span>Budget: ${Number(rfp.budget).toLocaleString()}</span>
          )}
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {isBidManager && (
        <div className="mt-8 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Upload Bid (Vendor)</h2>
          <form onSubmit={handleUpload} className="mt-4 space-y-4">
            <div>
              <label
                htmlFor="vendor_name"
                className="block text-sm font-medium text-slate-700"
              >
                Vendor Name
              </label>
              <input
                id="vendor_name"
                type="text"
                required
                value={vendorName}
                onChange={(e) => setVendorName(e.target.value)}
                className="mt-1 w-full max-w-md rounded-md border border-slate-300 px-3 py-2 text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
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
              {uploading ? "Uploading…" : "Upload Bid"}
            </button>
          </form>
        </div>
      )}

      <div className="mt-8 rounded-lg border border-slate-200 bg-white shadow-sm">
        <h2 className="border-b border-slate-200 px-6 py-3 text-lg font-semibold text-slate-900">
          Bids ({bids.length})
        </h2>
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
      </div>
    </div>
  );
}
