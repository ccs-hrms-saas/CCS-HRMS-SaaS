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
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
    } else {
      router.push("/dashboard");
    }
    setLoading(false);
  };

  return (
    <div className={styles.loginContainer}>
      <div className={`glass-panel animate-fade-in ${styles.loginCard}`}>
        <div className={styles.logoContainer}>
          <div className={styles.logoIcon}></div>
          <h1 className={styles.title}>CCS-HRMS</h1>
          <p className={styles.subtitle}>Welcome back to your workspace</p>
        </div>

        <form onSubmit={handleLogin} className={styles.form}>
          {error && <div className={styles.errorBanner}>{error}</div>}
          
          <div className={styles.inputGroup}>
            <label>Email Address</label>
            <input
              type="email"
              className="premium-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="employee@company.com"
              required
            />
          </div>

          <div className={styles.inputGroup}>
            <label>Password</label>
            <input
              type="password"
              className="premium-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>

          <button 
            type="submit" 
            className={`premium-button ${styles.submitBtn}`}
            disabled={loading}
          >
            {loading ? "Authenticating..." : "Sign In"}
          </button>
        </form>
      </div>
      
      {/* Decorative Orbs for Premium feel */}
      <div className={styles.orb1}></div>
      <div className={styles.orb2}></div>
    </div>
  );
}
