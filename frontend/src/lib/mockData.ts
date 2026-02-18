/**
 * Mock data for the Command Center dashboard (POC demo).
 */

export const bidsByRisk = [
  { name: "Low", value: 12, fill: "#10b981" },
  { name: "Medium", value: 7, fill: "#f59e0b" },
  { name: "High", value: 3, fill: "#ef4444" },
];

export const averageVendorScores = [
  { vendor: "Acme Corp", score: 87 },
  { vendor: "BuildRight Ltd", score: 72 },
  { vendor: "TechServe Inc", score: 91 },
  { vendor: "Global Supplies", score: 68 },
  { vendor: "Prime Contractors", score: 79 },
];

export const recentActivity = [
  { id: "1", action: "Bid approved", entity: "RFP-2024-001 — Acme Corp", time: "2 hours ago" },
  { id: "2", action: "AI evaluation completed", entity: "Bid #12 — BuildRight Ltd", time: "4 hours ago" },
  { id: "3", action: "New bid uploaded", entity: "RFP-2024-002 — TechServe Inc", time: "5 hours ago" },
  { id: "4", action: "RFP published", entity: "Highway Resurfacing — North Sector", time: "1 day ago" },
  { id: "5", action: "Bid rejected", entity: "RFP-2024-001 — Global Supplies", time: "1 day ago" },
];

export const kpiMock = {
  pendingReviews: 5,
  avgSavingsPercent: 12.4,
};
