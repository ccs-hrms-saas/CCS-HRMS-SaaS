"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

// ─── Types ────────────────────────────────────────────────────────────────────
export type DemoView = "real" | "employee";

interface ViewModeContextType {
  demoView: DemoView;
  toggleDemoView: () => void;
  exitDemo: () => void;
}

const ViewModeContext = createContext<ViewModeContextType>({
  demoView: "real",
  toggleDemoView: () => {},
  exitDemo: () => {},
});

export function ViewModeProvider({ children }: { children: React.ReactNode }) {
  // Persist across page navigations within the session only
  const [demoView, setDemoView] = useState<DemoView>("real");
  const router = useRouter();

  // Restore from sessionStorage on mount (survives Next.js client navigation)
  useEffect(() => {
    const saved = sessionStorage.getItem("hrms_demo_view") as DemoView | null;
    if (saved === "employee") setDemoView("employee");
  }, []);

  const toggleDemoView = useCallback(() => {
    const next: DemoView = demoView === "real" ? "employee" : "real";
    setDemoView(next);
    sessionStorage.setItem("hrms_demo_view", next);
    router.push(next === "employee" ? "/dashboard/employee" : "/dashboard/admin");
  }, [demoView, router]);

  const exitDemo = useCallback(() => {
    setDemoView("real");
    sessionStorage.removeItem("hrms_demo_view");
    router.push("/dashboard/admin");
  }, [router]);

  return (
    <ViewModeContext.Provider value={{ demoView, toggleDemoView, exitDemo }}>
      {children}
    </ViewModeContext.Provider>
  );
}

export const useViewMode = () => useContext(ViewModeContext);
