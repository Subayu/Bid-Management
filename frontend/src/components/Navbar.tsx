"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { RoleSwitcher } from "./RoleSwitcher";
import { getApiConfig, type AIProvider } from "@/lib/api";

function aiProviderLabel(p: AIProvider): string {
  return p === "ollama" ? "Ollama (llama3)" : p === "openai" ? "OpenAI" : "Mock";
}

export function Navbar() {
  const [aiProvider, setAiProvider] = useState<AIProvider | null>(null);

  useEffect(() => {
    getApiConfig()
      .then((c) => setAiProvider(c.ai_provider))
      .catch(() => setAiProvider("mock"));
  }, []);

  return (
    <header className="border-b border-slate-200 bg-white shadow-sm">
      <nav className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-8">
          <Link
            href="/"
            className="text-lg font-semibold text-slate-900 hover:text-indigo-600"
          >
            ShieldProcure
          </Link>
          <Link
            href="/rfps"
            className="text-sm font-medium text-slate-600 hover:text-slate-900"
          >
            RFPs
          </Link>
          <Link
            href="/bids"
            className="text-sm font-medium text-slate-600 hover:text-slate-900"
          >
            Bids
          </Link>
        </div>
        <div className="flex items-center gap-4">
          {aiProvider && (
            <span
              className={`rounded px-2 py-1 text-xs font-medium ${
                aiProvider === "ollama"
                  ? "bg-emerald-100 text-emerald-800"
                  : aiProvider === "openai"
                    ? "bg-sky-100 text-sky-800"
                    : "bg-amber-100 text-amber-800"
              }`}
              title="AI model used for bid evaluation"
            >
              AI: {aiProviderLabel(aiProvider)}
            </span>
          )}
          <RoleSwitcher />
        </div>
      </nav>
    </header>
  );
}
