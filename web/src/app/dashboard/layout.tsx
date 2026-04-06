"use client";

import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import Sidebar from "@/components/Sidebar";
import styles from "./dashboard.module.css";
import { ViewModeProvider, useViewMode } from "@/context/ViewModeContext";

// ── Inner layout reads the demo context ──────────────────────────────────────
function DashboardInner({ children }: { children: React.ReactNode }) {
  const { demoView, exitDemo } = useViewMode();
  const isDemo = demoView === "employee";

  return (
    <div className={styles.layout}>
      <Sidebar />
      <div className={styles.mobileWrapper}>
        {/* Demo Mode Banner */}
        {isDemo && (
          <div style={{
            position: "sticky", top: 0, zIndex: 100,
            background: "linear-gradient(90deg, #7c3aed, #4f46e5)",
            color: "#fff", padding: "8px 20px",
            display: "flex", justifyContent: "space-between", alignItems: "center",
            fontSize: "0.82rem", fontWeight: 600, letterSpacing: 0.3,
            boxShadow: "0 2px 12px rgba(124,58,237,0.35)",
          }}>
            <span>
              🎭 <strong>DEMO MODE</strong> — You are previewing the Employee View.
              Your credentials and data remain unchanged.
            </span>
            <button onClick={exitDemo} style={{
              background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)",
              color: "#fff", padding: "4px 14px", borderRadius: 20, cursor: "pointer",
              fontFamily: "Outfit,sans-serif", fontWeight: 700, fontSize: "0.78rem",
            }}>
              ✕ Exit Demo
            </button>
          </div>
        )}
        <main className={styles.mainContent}>
          {children}
        </main>
      </div>
    </div>
  );
}

// ── Root layout — wraps with context ─────────────────────────────────────────
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [user, loading, router]);

  if (loading) return (
    <div className={styles.loadingScreen}>
      <div className={styles.spinner}></div>
    </div>
  );

  if (!user) return null;

  return (
    <ViewModeProvider>
      <DashboardInner>{children}</DashboardInner>
    </ViewModeProvider>
  );
}
