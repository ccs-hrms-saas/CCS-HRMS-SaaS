"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import styles from "./login.module.css";
import { useRouter } from "next/navigation";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"login" | "forgot">("login");
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({ email, password });
    if (authErr) {
      setError(authErr.message);
      setLoading(false);
      return;
    }
    // Route based on role
    const { data: profile } = await supabase
      .from("profiles")
      .select("system_role, role")
      .eq("id", authData.user.id)
      .single();
    const sysRole = profile?.system_role;
    if (sysRole === "platform_owner" || sysRole === "platform_admin") {
      router.push("/developer");
    } else {
      router.push("/dashboard");
    }
    setLoading(false);
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotLoading(true);
    setError("");
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
    const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
      redirectTo: `${appUrl}/reset-password`,
    });
    if (error) { setError(error.message); }
    else { setForgotSent(true); }
    setForgotLoading(false);
  };

  return (
    <div className={styles.loginContainer}>
      <div className={`glass-panel animate-fade-in ${styles.loginCard}`}>
        <div className={styles.logoContainer}>
          <div className={styles.logoIcon}></div>
          <h1 className={styles.title}>CCS-HRMS</h1>
          <p className={styles.subtitle}>
            {mode === "login" ? "Welcome back to your workspace" : "Reset your password"}
          </p>
        </div>

        {error && <div className={styles.errorBanner}>{error}</div>}

        {/* ── LOGIN FORM ── */}
        {mode === "login" && (
          <form onSubmit={handleLogin} className={styles.form}>
            <div className={styles.inputGroup}>
              <label>Email Address</label>
              <input type="email" className="premium-input" value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="employee@company.com" required />
            </div>
            <div className={styles.inputGroup}>
              <label>Password</label>
              <input type="password" className="premium-input" value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••" required />
            </div>
            <button type="submit" className={`premium-button ${styles.submitBtn}`} disabled={loading}>
              {loading ? "Authenticating..." : "Sign In"}
            </button>
            <div style={{ textAlign: "center", marginTop: 16 }}>
              <button type="button" onClick={() => { setMode("forgot"); setError(""); }}
                style={{ background: "none", border: "none", color: "var(--accent-primary)", cursor: "pointer", fontSize: "0.88rem", fontFamily: "Outfit, sans-serif", textDecoration: "underline" }}>
                Forgot Password?
              </button>
            </div>
          </form>
        )}

        {/* ── FORGOT PASSWORD FORM ── */}
        {mode === "forgot" && !forgotSent && (
          <form onSubmit={handleForgot} className={styles.form}>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.88rem", marginBottom: 20, lineHeight: 1.5 }}>
              Enter your registered email. We'll send you a link to reset your password.
            </p>
            <div className={styles.inputGroup}>
              <label>Email Address</label>
              <input type="email" className="premium-input" value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                placeholder="employee@company.com" required />
            </div>
            <button type="submit" className={`premium-button ${styles.submitBtn}`} disabled={forgotLoading}>
              {forgotLoading ? "Sending..." : "Send Reset Link"}
            </button>
            <div style={{ textAlign: "center", marginTop: 16 }}>
              <button type="button" onClick={() => { setMode("login"); setError(""); }}
                style={{ background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer", fontSize: "0.88rem", fontFamily: "Outfit, sans-serif" }}>
                ← Back to Sign In
              </button>
            </div>
          </form>
        )}

        {/* ── SENT CONFIRMATION ── */}
        {mode === "forgot" && forgotSent && (
          <div style={{ textAlign: "center", padding: "24px 0" }}>
            <div style={{ fontSize: "3rem", marginBottom: 16 }}>📧</div>
            <h3 style={{ color: "#fff", marginBottom: 8 }}>Reset Link Sent!</h3>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.88rem", lineHeight: 1.6 }}>
              Check your inbox at <strong style={{ color: "var(--accent-primary)" }}>{forgotEmail}</strong>.
              Click the link in the email to reset your password.
            </p>
            <button onClick={() => { setMode("login"); setForgotSent(false); setForgotEmail(""); setError(""); }}
              style={{ marginTop: 24, background: "none", border: "1px solid rgba(99,102,241,0.4)", color: "var(--accent-primary)", cursor: "pointer", fontFamily: "Outfit,sans-serif", padding: "10px 24px", borderRadius: 10, fontSize: "0.9rem" }}>
              ← Back to Sign In
            </button>
          </div>
        )}
      </div>

      <div className={styles.orb1}></div>
      <div className={styles.orb2}></div>
    </div>
  );
}
