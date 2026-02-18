"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRole } from "@/contexts/RoleContext";
import {
  fetchRFPs,
  fetchAllBids,
  uploadBid,
  type RFPRecord,
  type BidRecord,
} from "@/lib/api";

export default function BidsPage() {
  const { currentPersona } = useRole();
  const [rfps, setRfps] = useState<RFPRecord[]>([]);
  const [bids, setBids] = useState<BidRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [selectedRfpId, setSelectedRfpId] = useState<number | "">("");
  const [vendorName, setVendorName] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const isBidManager = currentPersona === "Bid Manager";

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [rfpsData, bidsData] = await Promise.all([
        fetchRFPs(),
        fetchAllBids(),
      ]);
      setRfps(rfpsData);
      setBids(bidsData);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile || !vendorName.trim() || selectedRfpId === "") {
      setError("Please select an RFP, enter vendor name, and choose a PDF file.");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      await uploadBid(Number(selectedRfpId), vendorName.trim(), selectedFile, currentPersona);
      setSelectedRfpId("");
      setVendorName("");
      setSelectedFile(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to upload bid");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-slate-900">Bids</h1>

      {isBidManager && (
        <div className="mt-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Upload bid document</h2>
          <form onSubmit={handleUpload} className="mt-4 space-y-4">
            <div>
              <label
                htmlFor="bid_rfp"
                className="block text-sm font-medium text-slate-700"
              >
                RFP
              </label>
              <select
                id="bid_rfp"
                required
                value={selectedRfpId}
                onChange={(e) =>
                  setSelectedRfpId(e.target.value === "" ? "" : Number(e.target.value))
                }
                className="mt-1 w-full max-w-md rounded-md border border-slate-300 px-3 py-2 text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="">Select an RFP</option>
                {rfps.map((rfp) => (
                  <option key={rfp.id} value={rfp.id}>
                    {rfp.title} (ID: {rfp.id})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                htmlFor="bid_vendor"
                className="block text-sm font-medium text-slate-700"
              >
                Vendor name
              </label>
              <input
                id="bid_vendor"
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
                Bid document (PDF)
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
              {uploading ? "Uploading…" : "Upload bid"}
            </button>
          </form>
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="mt-8 rounded-lg border border-slate-200 bg-white shadow-sm">
        <h2 className="border-b border-slate-200 px-6 py-3 text-lg font-semibold text-slate-900">
          All bids ({bids.length})
        </h2>
        {loading ? (
          <p className="p-6 text-slate-600">Loading…</p>
        ) : bids.length === 0 ? (
          <p className="p-6 text-slate-600">No bids yet. Upload a bid above or from an RFP page.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-2 text-left text-xs font-medium uppercase text-slate-500">
                    RFP
                  </th>
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
                    <td className="whitespace-nowrap px-6 py-3 text-sm">
                      <Link
                        href={`/rfps/${bid.rfp_id}`}
                        className="font-medium text-indigo-600 hover:text-indigo-800"
                      >
                        RFP #{bid.rfp_id}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-6 py-3 text-sm text-slate-900">
                      <Link
                        href={`/bids/${bid.id}`}
                        className="font-medium text-indigo-600 hover:text-indigo-800"
                      >
                        {bid.vendor_name}
                      </Link>
                    </td>
                    <td className="px-6 py-3 text-sm text-slate-600">
                      <Link
                        href={`/bids/${bid.id}`}
                        className="text-indigo-600 hover:underline"
                      >
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
