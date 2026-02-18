"use client";

import React from "react";
import { useRole, PERSONAS, type Persona } from "@/contexts/RoleContext";

export function RoleSwitcher() {
  const { currentPersona, setCurrentPersona } = useRole();

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="role-select" className="text-sm font-medium text-slate-600">
        Persona:
      </label>
      <select
        id="role-select"
        value={currentPersona}
        onChange={(e) => setCurrentPersona(e.target.value as Persona)}
        className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      >
        {PERSONAS.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
    </div>
  );
}
