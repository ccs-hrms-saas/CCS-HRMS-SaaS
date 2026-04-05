"use client";

import { useEffect, useState, Suspense } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter, useSearchParams } from "next/navigation";

function ResetForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Supabase appends tokens as URL hash — exchange the session
    supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setReady(true);
    });
    // Also check if already in a recovery session
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
  }, []);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) { setErr("Passwords do not match"); return; }
    if (password.length < 6) { setErr("Password must be at least 6 characters"); return; }
    setSaving(true); setErr("");
    const { error } = await supabase.auth.updateUser({ password });
    if (error) { setErr(error.message); }
    else {
      setMsg("✅ Password updated! Redirecting to login...");
      setTimeout(() => router.push("/login"), 2500);
    }
    setSaving(false);
  };

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "linear-gradient(135deg, #0f0f1a, #1a1a2e)", fontFamily: "Outfit, sans-serif"
    }}>
      <div style={{
        width: "100%", maxWidth: 420, background: "rgba(255,255,255,0.04)", backdropFilter: "blur(20px)",
        border: "1px solid rgba(99,102,241,0.3)", borderRadius: 20, padding: 40,
        boxShadow: "0 24px 64px rgba(0,0,0,0.5)"
      }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: "2.5rem", marginBottom: 12 }}>🔐</div>
          <h1 style={{ color: "#fff", fontSize: "1.5rem", fontWeight: 700, margin: 0 }}>Reset Password</h1>
          <p style={{ color: "#64748b", fontSize: "0.9rem", marginTop: 8 }}>Enter your new password below</p>
        </div>

        {msg && <div style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)", color: "#10b981", padding: "12px 16px", borderRadius: 10, marginBottom: 20, fontSize: "0.9rem" }}>{msg}</div>}
        {err && <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "#ef4444", padding: "12px 16px", borderRadius: 10, marginBottom: 20, fontSize: "0.9rem" }}>{err}</div>}

        {!ready && !msg && (
          <p style={{ color: "#f59e0b", textAlign: "center", fontSize: "0.9rem" }}>⏳ Verifying reset link...</p>
        )}

        {ready && !msg && (
          <form onSubmit={handleReset} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label style={{ color: "#94a3b8", fontSize: "0.82rem", display: "block", marginBottom: 6 }}>New Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                placeholder="Minimum 6 characters" required minLength={6}
                style={{ width: "100%", padding: "12px 16px", borderRadius: 10, border: "1px solid rgba(99,102,241,0.3)", background: "rgba(255,255,255,0.05)", color: "#fff", fontFamily: "Outfit,sans-serif", fontSize: "0.95rem", outline: "none", boxSizing: "border-box" }} />
            </div>
            <div>
              <label style={{ color: "#94a3b8", fontSize: "0.82rem", display: "block", marginBottom: 6 }}>Confirm Password</label>
              <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
                placeholder="Repeat new password" required
                style={{ width: "100%", padding: "12px 16px", borderRadius: 10, border: "1px solid rgba(99,102,241,0.3)", background: "rgba(255,255,255,0.05)", color: "#fff", fontFamily: "Outfit,sans-serif", fontSize: "0.95rem", outline: "none", boxSizing: "border-box" }} />
            </div>
            <button type="submit" disabled={saving}
              style={{ padding: "14px", borderRadius: 10, background: "linear-gradient(135deg,#6366f1,#8b5cf6)", color: "#fff", border: "none", fontFamily: "Outfit,sans-serif", fontSize: "1rem", fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1, marginTop: 4 }}>
              {saving ? "Saving..." : "Set New Password"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", background: "#0f0f1a" }} />}>
      <ResetForm />
    </Suspense>
  );
}
