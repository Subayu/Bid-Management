"use client";

import React, { createContext, useContext, useState, useCallback } from "react";

export type Persona = "Admin" | "Bid Manager" | "Reviewer" | "Approver" | "Auditor";

interface RoleContextValue {
  currentPersona: Persona;
  setCurrentPersona: (persona: Persona) => void;
}

const RoleContext = createContext<RoleContextValue | null>(null);

const PERSONAS: Persona[] = ["Admin", "Bid Manager", "Reviewer", "Approver", "Auditor"];

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const [currentPersona, setCurrentPersonaState] = useState<Persona>("Bid Manager");

  const setCurrentPersona = useCallback((persona: Persona) => {
    setCurrentPersonaState(persona);
  }, []);

  return (
    <RoleContext.Provider value={{ currentPersona, setCurrentPersona }}>
      {children}
    </RoleContext.Provider>
  );
}

export function useRole() {
  const ctx = useContext(RoleContext);
  if (!ctx) throw new Error("useRole must be used within RoleProvider");
  return ctx;
}

export { PERSONAS };
