"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FileText,
  Gavel,
  BarChart3,
  FileSearch,
  ShieldAlert,
  Settings,
} from "lucide-react";
import { RoleSwitcher } from "./RoleSwitcher";
import { getApiConfig, type AIProvider } from "@/lib/api";
import { useEffect, useState } from "react";

function aiProviderLabel(p: AIProvider): string {
  return p === "ollama" ? "Ollama (llama3)" : p === "openai" ? "OpenAI" : "Mock";
}

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/rfps", label: "RFPs", icon: FileText },
  { href: "/bids", label: "Bids", icon: Gavel },
  { href: "#", label: "Evaluations", icon: BarChart3 },
  { href: "#", label: "Reports", icon: FileSearch },
  { href: "#", label: "Investigation", icon: ShieldAlert },
  { href: "#", label: "Admin", icon: Settings },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [aiProvider, setAiProvider] = useState<AIProvider | null>(null);

  useEffect(() => {
    getApiConfig()
      .then((c) => setAiProvider(c.ai_provider))
      .catch(() => setAiProvider("mock"));
  }, []);

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside
        className="flex w-56 shrink-0 flex-col bg-sidebar text-white"
        style={{ backgroundColor: "#212B36" }}
      >
        <div className="p-6">
          <Link href="/" className="text-xl font-bold text-white">
            ShieldProcure AI
          </Link>
        </div>
        <nav className="flex-1 space-y-0.5 px-3 pb-4">
          {navItems.map(({ href, label, icon: Icon }) => {
            const isActive =
              href === "/"
                ? pathname === "/"
                : href !== "#" && pathname.startsWith(href);
            return (
              <Link
                key={label}
                href={href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                  isActive
                    ? "bg-sidebar-active text-white"
                    : "text-slate-300 hover:bg-white/10 hover:text-white"
                }`}
                style={isActive ? { backgroundColor: "#343D48" } : undefined}
              >
                <Icon className="h-5 w-5 shrink-0" />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-white/10 p-4 [&_label]:text-slate-400 [&_select]:border-white/20 [&_select]:bg-white/10 [&_select]:text-white">
          {aiProvider && (
            <div className="mb-2 rounded px-2 py-1 text-xs font-medium text-slate-400">
              AI: {aiProviderLabel(aiProvider)}
            </div>
          )}
          <RoleSwitcher />
          <p className="mt-4 text-xs text-slate-500">
            Tenant: Ministry of Transport
          </p>
        </div>
      </aside>

      {/* Main content */}
      <main
        className="min-h-screen flex-1 overflow-auto"
        style={{ backgroundColor: "#F9F8F4" }}
      >
        {children}
      </main>
    </div>
  );
}
