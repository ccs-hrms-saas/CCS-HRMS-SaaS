"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import styles from "../../dashboard.module.css";

interface LightboxState { photos: string[]; index: number; name: string; }

export default function AdminAttendance() {
  const [records, setRecords]         = useState<any[]>([]);
  const [employees, setEmployees]     = useState<any[]>([]);
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [selectedUser, setSelectedUser] = useState("");
  const [loading, setLoading]         = useState(true);
  const [lightbox, setLightbox]       = useState<LightboxState | null>(null);

  useEffect(() => {
    supabase.from("profiles").select("id, full_name").eq("role", "employee")
      .then(({ data }) => setEmployees(data ?? []));
  }, []);

  const load = async () => {
    setLoading(true);
    let query = supabase.from("attendance_records")
      .select("*, profiles(full_name, id)")
      .eq("date", selectedDate);
    if (selectedUser) query = query.eq("user_id", selectedUser);
    const { data } = await query.order("check_in");
    setRecords(data ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [selectedDate, selectedUser]);

  const openLightbox = (photos: string[], index: number, name: string) => {
    setLightbox({ photos, index, name });
  };

  const fmt = (d?: string) => d ? new Date(d).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—";
  const hrs = (ci?: string, co?: string) => ci && co
    ? ((new Date(co).getTime() - new Date(ci).getTime()) / 3600000).toFixed(2) + "h" : "—";

  return (
    <div className="animate-fade-in">
      <div className={styles.pageHeader}>
        <h1>Attendance Records</h1>
        <p>View and monitor daily attendance with verification photos</p>
      </div>

      <div className="glass-panel" style={{ padding: 20, marginBottom: 24 }}>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div className={styles.formGroup} style={{ marginBottom: 0 }}>
            <label>Date</label>
            <input type="date" className="premium-input" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} />
          </div>
          <div className={styles.formGroup} style={{ marginBottom: 0 }}>
            <label>Employee (optional)</label>
            <select className="premium-input" value={selectedUser} onChange={e => setSelectedUser(e.target.value)}>
              <option value="">All Employees</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className={`glass-panel ${styles.tableWrap}`}>
        <table>
          <thead>
            <tr>
              <th>Employee</th><th>Check In</th><th>Check Out</th><th>Hours</th>
              <th>Photos</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ textAlign: "center", padding: 32 }}><div className={styles.spinner} style={{ margin: "0 auto" }} /></td></tr>
            ) : records.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--text-secondary)", padding: "32px" }}>No records for this date.</td></tr>
            ) : records.map((r) => {
              const photos: string[] = [];
              if (r.photo_url)          photos.push(r.photo_url);
              if (r.checkout_photo_url) photos.push(r.checkout_photo_url);
              const name = (r.profiles as any)?.full_name ?? "Employee";

              return (
                <tr key={r.id}>
                  <td>{name}</td>
                  <td>{fmt(r.check_in)}</td>
                  <td>{fmt(r.check_out)}</td>
                  <td>{hrs(r.check_in, r.check_out)}</td>
                  <td>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      {photos.length === 0 && <span style={{ color: "var(--text-secondary)", fontSize: "0.78rem" }}>No photo</span>}
                      {photos.map((url, i) => (
                        <button key={i} onClick={() => openLightbox(photos, i, name)}
                          title={i === 0 ? "Check-In Photo" : "Check-Out Photo"}
                          style={{ background: "none", border: "none", padding: 0, cursor: "pointer", position: "relative" }}>
                          <img src={url} alt={i === 0 ? "check-in" : "check-out"}
                            style={{ width: 38, height: 38, borderRadius: "50%", objectFit: "cover",
                              border: `2px solid ${i === 0 ? "var(--accent-primary)" : "#10b981"}`,
                              display: "block", transition: "transform 0.15s" }}
                            onMouseEnter={e => (e.currentTarget.style.transform = "scale(1.15)")}
                            onMouseLeave={e => (e.currentTarget.style.transform = "scale(1)")}
                          />
                          <span style={{ position: "absolute", bottom: -2, right: -2, fontSize: "0.55rem", background: i === 0 ? "var(--accent-primary)" : "#10b981", color: "white", borderRadius: 4, padding: "1px 3px", fontWeight: 700 }}>
                            {i === 0 ? "IN" : "OUT"}
                          </span>
                        </button>
                      ))}
                    </div>
                  </td>
                  <td>
                    <span className={`${styles.statBadge} ${r.check_out ? styles.badgeSuccess : styles.badgeWarning}`}>
                      {r.check_out ? "Completed" : "In Office"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Lightbox ── */}
      {lightbox && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.9)", backdropFilter: "blur(8px)", zIndex: 200, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}
          onClick={() => setLightbox(null)}>

          {/* Header */}
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 28px" }}>
            <div>
              <div style={{ color: "white", fontWeight: 700, fontSize: "1rem" }}>{lightbox.name}</div>
              <div style={{ color: "#94a3b8", fontSize: "0.8rem", marginTop: 2 }}>
                {lightbox.index === 0 ? "📸 Check-In Photo" : "📸 Check-Out Photo"}
                {" · "}{lightbox.index + 1} of {lightbox.photos.length}
              </div>
            </div>
            <button onClick={() => setLightbox(null)}
              style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", color: "white", width: 40, height: 40, borderRadius: "50%", cursor: "pointer", fontSize: "1.1rem", display: "flex", alignItems: "center", justifyContent: "center" }}>
              ✕
            </button>
          </div>

          {/* Photo */}
          <div onClick={e => e.stopPropagation()} style={{ display: "flex", alignItems: "center", gap: 24 }}>

            {/* Left arrow */}
            <button onClick={() => setLightbox(l => l ? { ...l, index: l.index - 1 } : l)}
              disabled={lightbox.index === 0}
              style={{ width: 48, height: 48, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.3)", background: "rgba(255,255,255,0.1)", color: "white", cursor: lightbox.index === 0 ? "not-allowed" : "pointer", fontSize: "1.4rem", opacity: lightbox.index === 0 ? 0.3 : 1, display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s" }}>
              ‹
            </button>

            {/* Image */}
            <div style={{ borderRadius: 16, overflow: "hidden", border: `3px solid ${lightbox.index === 0 ? "var(--accent-primary)" : "#10b981"}`, boxShadow: "0 20px 60px rgba(0,0,0,0.8)" }}>
              <img src={lightbox.photos[lightbox.index]} alt="attendance photo"
                style={{ width: "min(80vw, 420px)", height: "min(80vw, 420px)", objectFit: "cover", display: "block" }} />
            </div>

            {/* Right arrow */}
            <button onClick={() => setLightbox(l => l ? { ...l, index: l.index + 1 } : l)}
              disabled={lightbox.index === lightbox.photos.length - 1}
              style={{ width: 48, height: 48, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.3)", background: "rgba(255,255,255,0.1)", color: "white", cursor: lightbox.index === lightbox.photos.length - 1 ? "not-allowed" : "pointer", fontSize: "1.4rem", opacity: lightbox.index === lightbox.photos.length - 1 ? 0.3 : 1, display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s" }}>
              ›
            </button>
          </div>

          {/* Dots */}
          {lightbox.photos.length > 1 && (
            <div style={{ display: "flex", gap: 8, marginTop: 24 }}>
              {lightbox.photos.map((_, i) => (
                <button key={i} onClick={e => { e.stopPropagation(); setLightbox(l => l ? { ...l, index: i } : l); }}
                  style={{ width: 8, height: 8, borderRadius: "50%", border: "none", cursor: "pointer", background: i === lightbox.index ? "white" : "rgba(255,255,255,0.3)", padding: 0, transition: "all 0.2s" }} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
