"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import styles from "../../dashboard.module.css";

function generateTOTP(secret: string): { pin: string; secondsLeft: number } {
  const now = Math.floor(Date.now() / 1000);
  const step = 60;
  const counter = Math.floor(now / step);
  const secondsLeft = step - (now % step);

  // Simple deterministic PIN from secret + counter (no external lib needed)
  let hash = 0;
  const str = secret + counter.toString();
  for (let i = 0; i < str.length; i++) {
    hash = (Math.imul(31, hash) + str.charCodeAt(i)) | 0;
  }
  const pin = String(Math.abs(hash) % 10000).padStart(4, "0");
  return { pin, secondsLeft };
}

export default function AttendancePIN() {
  const { profile } = useAuth();
  const [secret, setSecret] = useState<string | null>(null);
  const [pin, setPin] = useState("----");
  const [secondsLeft, setSecondsLeft] = useState(60);
  const [loading, setLoading] = useState(true);

  const fetchOrCreateSecret = useCallback(async () => {
    if (!profile) return;
    const { data } = await supabase.from("totp_secrets").select("secret").eq("user_id", profile.id).single();
    if (data) {
      setSecret(data.secret);
    } else {
      // Generate a new random secret for this employee
      const newSecret = Array.from({ length: 16 }, () => Math.random().toString(36)[2]).join("").toUpperCase();
      await supabase.from("totp_secrets").insert({ user_id: profile.id, secret: newSecret });
      setSecret(newSecret);
    }
    setLoading(false);
  }, [profile]);

  useEffect(() => { fetchOrCreateSecret(); }, [fetchOrCreateSecret]);

  useEffect(() => {
    if (!secret) return;
    const tick = () => {
      const { pin: newPin, secondsLeft: secs } = generateTOTP(secret);
      setPin(newPin);
      setSecondsLeft(secs);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [secret]);

  const progress = (secondsLeft / 60) * 100;

  if (loading) return <div className={styles.loadingScreen}><div className={styles.spinner}></div></div>;

  return (
    <div className="animate-fade-in">
      <div className={styles.pageHeader}>
        <h1>Attendance PIN</h1>
        <p>Show this PIN at the office device to mark your attendance</p>
      </div>

      <div style={{ maxWidth: 420, margin: "0 auto" }}>
        <div className={`glass-panel ${styles.pinDisplay}`}>
          <div style={{ fontSize: "3rem", marginBottom: 8 }}>🔐</div>
          <p style={{ color: "var(--text-secondary)", marginBottom: 24, fontSize: "0.9rem" }}>
            Your one-time PIN (refreshes every 60 seconds)
          </p>

          <div className={styles.pinCode}>{pin}</div>

          <div className={styles.pinTimer}>Expires in <strong style={{ color: "var(--text-primary)" }}>{secondsLeft}s</strong></div>

          <div className={styles.pinTimerBar}>
            <div className={styles.pinTimerFill} style={{ width: `${progress}%` }}></div>
          </div>

          <p style={{ marginTop: 32, fontSize: "0.8rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>
            🛡️ This PIN is unique to you and refreshes automatically.<br />
            Never share this screen with anyone else.
          </p>
        </div>

        <div className="glass-panel" style={{ marginTop: 20, padding: 20 }}>
          <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: 8 }}>📋 How it works:</p>
          <ol style={{ fontSize: "0.85rem", color: "var(--text-secondary)", paddingLeft: 20, lineHeight: 2 }}>
            <li>Open this screen on your personal phone</li>
            <li>Go to the office attendance device</li>
            <li>Select your name from the list</li>
            <li>Enter the 4-digit PIN shown above</li>
            <li>Your attendance will be marked ✅</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
