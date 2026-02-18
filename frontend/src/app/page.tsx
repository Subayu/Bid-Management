"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { FileText, Upload, Activity } from "lucide-react";
import { useRole } from "@/contexts/RoleContext";
import { fetchRFPs } from "@/lib/api";
import {
  bidsByRisk,
  averageVendorScores,
  recentActivity,
  kpiMock,
} from "@/lib/mockData";

export default function HomePage() {
  const { currentPersona } = useRole();
  const [activeRfps, setActiveRfps] = useState<number | null>(null);

  useEffect(() => {
    fetchRFPs()
      .then((list) => setActiveRfps(list.length))
      .catch(() => setActiveRfps(0));
  }, []);

  const welcomeByRole: Record<string, string> = {
    Admin: "Welcome, Admin",
    "Bid Manager": "Welcome, Bid Manager",
    Reviewer: "Welcome, Reviewer",
    Approver: "Welcome, Approver",
    Auditor: "Welcome, Auditor",
  };
  const welcome = welcomeByRole[currentPersona] || "Welcome to ShieldProcure";

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
            RFP INTAKE
          </p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">
            Active RFPs
          </h1>
          <p className="mt-1 text-sm text-slate-500">{welcome}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Link
            href="/rfps"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            <Upload className="h-4 w-4" />
            Import RFP
          </Link>
          <Link
            href="/rfps"
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:opacity-90"
            style={{ backgroundColor: "#AA4A44" }}
          >
            <FileText className="h-4 w-4" />
            Create RFP
          </Link>
        </div>
      </div>

      {/* KPI / Status cards */}
      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <div
          className="rounded-2xl p-6 shadow-sm"
          style={{ backgroundColor: "#F5EFE7" }}
        >
          <p className="text-lg font-bold text-slate-900">Active RFPs</p>
          <p className="mt-1 text-sm text-slate-500">
            {activeRfps !== null ? activeRfps : "—"} RFP
            {activeRfps === 1 ? "" : "s"}
          </p>
        </div>
        <div
          className="rounded-2xl p-6 shadow-sm"
          style={{ backgroundColor: "#F5EFE7" }}
        >
          <p className="text-lg font-bold text-slate-900">Pending Reviews</p>
          <p className="mt-1 text-sm text-slate-500">
            {kpiMock.pendingReviews} RFP{kpiMock.pendingReviews === 1 ? "" : "s"}
          </p>
        </div>
        <div
          className="rounded-2xl p-6 shadow-sm"
          style={{ backgroundColor: "#F5EFE7" }}
        >
          <p className="text-lg font-bold text-slate-900">Avg Savings</p>
          <p className="mt-1 text-sm text-slate-500">
            {kpiMock.avgSavingsPercent}%
          </p>
        </div>
      </div>

      {/* Charts card */}
      <div
        className="mb-8 rounded-2xl p-6 shadow-sm"
        style={{ backgroundColor: "#F5EFE7" }}
      >
        <h2 className="mb-6 text-lg font-bold text-slate-900">Analytics</h2>
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Bids by Risk
            </h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={bidsByRisk}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={2}
                    dataKey="value"
                    nameKey="name"
                    label={({ name, value }) => `${name}: ${value}`}
                  >
                    {bidsByRisk.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Average Vendor Scores
            </h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={averageVendorScores}
                  margin={{ top: 8, right: 8, left: 8, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#d4c4b0" />
                  <XAxis dataKey="vendor" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar
                    dataKey="score"
                    fill="#AA4A44"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Activity card */}
      <div
        className="rounded-2xl shadow-sm"
        style={{ backgroundColor: "#F5EFE7" }}
      >
        <div className="flex items-center gap-2 border-b border-slate-200/80 px-6 py-4">
          <Activity className="h-5 w-5 text-slate-500" />
          <h2 className="text-lg font-bold text-slate-900">Recent Activity</h2>
        </div>
        <ul className="divide-y divide-slate-200/80">
          {recentActivity.map((item) => (
            <li
              key={item.id}
              className="flex items-center justify-between px-6 py-4 text-sm"
            >
              <span className="font-medium text-slate-800">{item.action}</span>
              <span className="text-slate-600">{item.entity}</span>
              <span className="text-slate-400">{item.time}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
