"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import styles from "../../dashboard.module.css";
import Image from "next/image";

export default function EmployeeProfile() {
  const { profile, refreshProfile } = useAuth();
  const [data, setData] = useState<any>(null);
  const [appraisals, setAppraisals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState("");
  const [isEditing, setIsEditing] = useState(false);

  const avatarRef = useRef<HTMLInputElement>(null);
  const aadharFrontRef = useRef<HTMLInputElement>(null);
  const aadharBackRef = useRef<HTMLInputElement>(null);
  const panRef = useRef<HTMLInputElement>(null);

  const loadData = async () => {
    if (!profile) return;
    const { data: pData } = await supabase.from("profiles").select("*, manager:profiles!manager_id(full_name)").eq("id", profile.id).single();
    setData(pData || {});
    // Load appraisal letters
    const { data: aData } = await supabase.from("employee_appraisals").select("*").eq("user_id", profile.id).order("appraisal_date", { ascending: false });
    setAppraisals(aData ?? []);
    setLoading(false);
  };

  useEffect(() => { loadData(); }, [profile]);

  const handleChange = (e: any) => setData({ ...data, [e.target.name]: e.target.value });

  const handleUpload = async (file: File, bucket: string, pathPrefix: string, column: string) => {
    if (!profile) return;
    setSaving(true);
    setSuccess(`Uploading ${pathPrefix.replace(/_/g, ' ')}... Please wait.`);

    // Reset input so selecting the same file again works
    const refMap: Record<string, React.RefObject<HTMLInputElement | null>> = {
      aadhar_front: aadharFrontRef, aadhar_back: aadharBackRef, pan_card: panRef, avatar: avatarRef
    };
    const ref = refMap[pathPrefix];
    if (ref?.current) ref.current.value = "";

    // 1. Upload file to Supabase Storage
    const fileName = `${pathPrefix}_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.\-]/g, "_")}`;
    const storagePath = `${profile.id}/${fileName}`;
    const { error: storageErr } = await supabase.storage.from(bucket).upload(storagePath, file, { upsert: true });

    if (storageErr) {
      setSuccess(`❌ Storage upload failed: ${storageErr.message}`);
      setSaving(false);
      return;
    }

    // 2. Get the public URL
    const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(storagePath);
    const publicUrl = urlData.publicUrl;

    // 3. Save URL to profiles table via secure admin API (bypasses RLS)
    const res = await fetch("/api/update-doc-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: profile.id, column, value: publicUrl })
    });
    const json = await res.json();

    if (!res.ok) {
      setSuccess(`❌ Failed to save: ${json.error}`);
      setSaving(false);
      return;
    }

    // 4. Immediately update local state so UI reflects change without full reload
    setData((prev: any) => ({ ...prev, [column]: publicUrl }));
    // 5. If avatar, refresh the global AuthContext profile so sidebar updates
    if (column === "avatar_url") await refreshProfile();
    setSuccess("✅ Document uploaded and saved successfully!");
    setTimeout(() => setSuccess(""), 4000);
    setSaving(false);
  };


  const submitMeta = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase.from("profiles").update({
      emergency_contact: data.emergency_contact,
      father_name:       data.father_name,
      mother_name:       data.mother_name,
      address:           data.address,
      aadhar_number:     data.aadhar_number,
      pan_number:        data.pan_number,
      bank_name:         data.bank_name,
      bank_account_number: data.bank_account_number,
      bank_ifsc:         data.bank_ifsc,
    }).eq("id", profile!.id);

    if (error) {
      setSuccess("\u274c Save failed: " + error.message);
    } else {
      await loadData();          // <- refresh from DB
      setIsEditing(false);       // <- go back to display mode
      setSuccess("\u2705 Profile saved successfully!");
      setTimeout(() => setSuccess(""), 5000);
    }
    setSaving(false);
  };

  if (loading) return <div className={styles.loadingScreen}><div className={styles.spinner}></div></div>;

  return (
    <div className="animate-fade-in">
      <div className={styles.pageHeader}>
        <h1>My Digital Profile</h1>
        <p>Manage your personal, family, and financial information safely.</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 32, alignItems: "start" }}>
        
        {/* LEFT COLUMN: Admin Pre-Filled fields & Avatar */}
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          
          <div className="glass-panel" style={{ padding: 32, textAlign: "center" }}>
            <div style={{ position: "relative", width: 120, height: 120, margin: "0 auto 20px", borderRadius: "50%", overflow: "hidden", background: "var(--glass-bg)", border: "3px solid var(--accent-primary)" }}>
              {data.avatar_url ? (
                <img src={data.avatar_url} alt="Profile" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "2.5rem" }}>👤</div>
              )}
            </div>
            <h2 style={{ fontSize: "1.4rem", marginBottom: 4 }}>{data.full_name}</h2>
            <div style={{ color: "var(--text-secondary)", marginBottom: 16 }}>{data.designation || "Employee"}</div>
            
            <input type="file" ref={avatarRef} accept="image/*" style={{ display: "none" }} onChange={(e) => { if (e.target.files?.[0]) handleUpload(e.target.files[0], "profile-pictures", "avatar", "avatar_url"); }} />
            <button onClick={() => avatarRef.current?.click()} className={styles.secondaryBtn} style={{ padding: "8px 16px", fontSize: "0.85rem" }}>Upload Picture</button>
          </div>

          <div className="glass-panel" style={{ padding: 24 }}>
            <h3 style={{ marginBottom: 20, fontSize: "1.1rem", borderBottom: '1px solid var(--glass-border)', paddingBottom: 10 }}>Work Profile (Admin Filled)</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div><small style={{ color: "var(--text-secondary)" }}>Email</small><div style={{ fontWeight: 500 }}>{data.email}</div></div>
              <div><small style={{ color: "var(--text-secondary)" }}>Phone Number</small><div style={{ fontWeight: 500 }}>{data.phone_number || "—"}</div></div>
              <div><small style={{ color: "var(--text-secondary)" }}>Gender</small><div style={{ fontWeight: 500 }}>{data.gender || "—"}</div></div>
              <div><small style={{ color: "var(--text-secondary)" }}>Reporting Manager</small><div style={{ fontWeight: 500 }}>{data.manager?.full_name || "—"}</div></div>
              <div><small style={{ color: "var(--text-secondary)" }}>Joining Date</small><div style={{ fontWeight: 500 }}>{data.joining_date ? new Date(data.joining_date).toLocaleDateString("en-IN") : "—"}</div></div>
              {data.remuneration && (
                <div style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.2)", borderRadius: 10, padding: "10px 14px" }}>
                  <small style={{ color: "var(--accent-primary)", fontWeight: 600 }}>Monthly Remuneration</small>
                  <div style={{ fontWeight: 700, fontSize: "1.15rem", marginTop: 2 }}>₹{Number(data.remuneration).toLocaleString("en-IN")}</div>
                </div>
              )}
              {data.joining_letter_url && (
                <div><small style={{ color: "var(--text-secondary)" }}>Joining Letter</small><div><a href={data.joining_letter_url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent-primary)", fontWeight: 600, textDecoration: "none" }}>📄 View Document</a></div></div>
              )}
            </div>
          </div>

          {/* Appraisal Letters */}
          {appraisals.length > 0 && (
            <div className="glass-panel" style={{ padding: 24 }}>
              <h3 style={{ marginBottom: 16, fontSize: "1.05rem", borderBottom: '1px solid var(--glass-border)', paddingBottom: 10 }}>📈 Appraisal Letters</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {appraisals.map((a, i) => (
                  <div key={a.id ?? i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: "rgba(255,255,255,0.03)", borderRadius: 10, border: "1px solid var(--glass-border)" }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>Appraisal Letter</div>
                      <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginTop: 2 }}>
                        {a.appraisal_date ? new Date(a.appraisal_date).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) : ""}
                      </div>
                    </div>
                    <a href={a.letter_url} target="_blank" rel="noopener noreferrer"
                      style={{ color: "var(--accent-primary)", fontWeight: 600, textDecoration: "none", fontSize: "0.85rem", padding: "6px 14px", border: "1px solid rgba(99,102,241,0.4)", borderRadius: 8, background: "rgba(99,102,241,0.08)" }}>
                      📄 View
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>{/* END LEFT COLUMN */}

        {/* RIGHT COLUMN: Employee Updatable Forms */}
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          
          <div className="glass-panel" style={{ padding: 32 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
              <h3 style={{ fontSize: "1.2rem", margin: 0 }}>My Information</h3>
              {!isEditing && (
                <button onClick={() => setIsEditing(true)}
                  style={{ padding: "8px 18px", borderRadius: 8, border: "1px solid rgba(99,102,241,0.4)", background: "rgba(99,102,241,0.1)", color: "var(--accent-primary)", cursor: "pointer", fontWeight: 600, fontSize: "0.85rem", fontFamily: "Outfit, sans-serif" }}>
                  ✏️ Edit
                </button>
              )}
            </div>

            {success && (
              <div style={{ background: success.startsWith("❌") ? "rgba(239,68,68,0.1)" : "rgba(16,185,129,0.1)", border: `1px solid ${success.startsWith("❌") ? "rgba(239,68,68,0.3)" : "rgba(16,185,129,0.3)"}`, color: success.startsWith("❌") ? "var(--danger)" : "var(--success)", padding: "12px 16px", borderRadius: 10, marginBottom: 20, fontSize: "0.9rem" }}>
                {success}
              </div>
            )}

            {/* ── READ-ONLY DISPLAY VIEW ── */}
            {!isEditing && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                {[
                  { label: "Father's Name",      value: data.father_name },
                  { label: "Mother's Name",       value: data.mother_name },
                  { label: "Emergency Contact",   value: data.emergency_contact },
                  { label: "Full Address",        value: data.address },
                  { label: "Bank Name",           value: data.bank_name },
                  { label: "Account Number",      value: data.bank_account_number ? "••••••" + String(data.bank_account_number).slice(-4) : null },
                  { label: "IFSC Code",           value: data.bank_ifsc },
                  { label: "Aadhar Number",       value: data.aadhar_number ? String(data.aadhar_number).replace(/\d(?=\d{4})/g, "•") : null },
                  { label: "PAN Number",          value: data.pan_number },
                ].map(({ label, value }) => (
                  <div key={label} style={{ padding: "12px 14px", background: "rgba(255,255,255,0.02)", borderRadius: 10, border: "1px solid var(--glass-border)" }}>
                    <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.6 }}>{label}</div>
                    <div style={{ fontWeight: 600, fontSize: "0.92rem", color: value ? "var(--text-primary)" : "var(--text-secondary)" }}>
                      {value || <span style={{ fontStyle: "italic", fontWeight: 400 }}>Not filled</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── EDIT FORM ── */}
            {isEditing && (
              <form onSubmit={submitMeta}>
                <div style={{display: "flex", gap: 16}}>
                  <div className={styles.formGroup} style={{flex: 1}}><label>Father's Name</label><input className="premium-input" name="father_name" value={data.father_name || ""} onChange={handleChange} /></div>
                  <div className={styles.formGroup} style={{flex: 1}}><label>Mother's Name</label><input className="premium-input" name="mother_name" value={data.mother_name || ""} onChange={handleChange} /></div>
                </div>
                <div style={{display: "flex", gap: 16}}>
                  <div className={styles.formGroup} style={{flex: 1}}><label>Emergency Contact No.</label><input className="premium-input" name="emergency_contact" value={data.emergency_contact || ""} onChange={handleChange} /></div>
                  <div className={styles.formGroup} style={{flex: 1}}><label>Full Address</label><input className="premium-input" name="address" value={data.address || ""} onChange={handleChange} /></div>
                </div>

                <h4 style={{marginTop: 16, marginBottom: 16, color: "var(--text-secondary)", borderBottom: "1px solid var(--glass-border)", paddingBottom: 8}}>Bank Details</h4>
                <div style={{display: "flex", gap: 16}}>
                  <div className={styles.formGroup} style={{flex: 1}}><label>Bank Name</label><input className="premium-input" name="bank_name" value={data.bank_name || ""} onChange={handleChange} /></div>
                  <div className={styles.formGroup} style={{flex: 1}}><label>Account Number</label><input className="premium-input" name="bank_account_number" value={data.bank_account_number || ""} onChange={handleChange} placeholder="Account number" /></div>
                  <div className={styles.formGroup} style={{flex: 1}}><label>IFSC Code</label><input className="premium-input" name="bank_ifsc" value={data.bank_ifsc || ""} onChange={handleChange} /></div>
                </div>

                <h4 style={{marginTop: 16, marginBottom: 16, color: "var(--text-secondary)", borderBottom: "1px solid var(--glass-border)", paddingBottom: 8}}>Identity & Compliance</h4>
                <div style={{display: "flex", gap: 16}}>
                  <div className={styles.formGroup} style={{flex: 1}}><label>Aadhar Number</label><input className="premium-input" name="aadhar_number" value={data.aadhar_number || ""} onChange={handleChange} /></div>
                  <div className={styles.formGroup} style={{flex: 1}}><label>PAN Number</label><input className="premium-input" name="pan_number" value={data.pan_number || ""} onChange={handleChange} style={{textTransform: "uppercase"}} /></div>
                </div>

                <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
                  <button type="submit" className={styles.primaryBtn} disabled={saving} style={{ flex: 1 }}>
                    {saving ? "Saving..." : "💾 Save Changes"}
                  </button>
                  <button type="button" onClick={() => { setIsEditing(false); loadData(); }}
                    style={{ flex: "0 0 auto", padding: "14px 20px", borderRadius: 12, border: "1px solid var(--glass-border)", background: "var(--glass-bg)", color: "var(--text-secondary)", cursor: "pointer", fontFamily: "Outfit, sans-serif", fontSize: "0.9rem" }}>
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>


          {/* Secure Document Vault */}
          <div className="glass-panel" style={{ padding: 32 }}>
            <h3 style={{ marginBottom: 8, fontSize: "1.2rem" }}>Secure Document Vault</h3>
            <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)", marginBottom: 24 }}>Upload your KYC documents. Only visible to you and HR Admin.</p>

            {/* Success/progress banner inside vault too */}
            {success && saving === false && success.startsWith("✅") && (
              <div style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)", color: "var(--success)", padding: "10px 14px", borderRadius: 10, marginBottom: 16, fontSize: "0.88rem" }}>{success}</div>
            )}

            <input type="file" ref={aadharFrontRef} accept="image/*,.pdf" style={{ display: "none" }} onChange={(e) => { if (e.target.files?.[0]) handleUpload(e.target.files[0], "employee-documents", "aadhar_front", "aadhar_front_url"); }} />
            <input type="file" ref={aadharBackRef}  accept="image/*,.pdf" style={{ display: "none" }} onChange={(e) => { if (e.target.files?.[0]) handleUpload(e.target.files[0], "employee-documents", "aadhar_back",  "aadhar_back_url"); }} />
            <input type="file" ref={panRef}          accept="image/*,.pdf" style={{ display: "none" }} onChange={(e) => { if (e.target.files?.[0]) handleUpload(e.target.files[0], "employee-documents", "pan_card",    "pan_url"); }} />

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {[
                { label: "Aadhar Card (Front)", url: data.aadhar_front_url, ref: aadharFrontRef },
                { label: "Aadhar Card (Back)",  url: data.aadhar_back_url,  ref: aadharBackRef },
                { label: "PAN Card",            url: data.pan_url,          ref: panRef },
              ].map(({ label, url, ref }) => (
                <div key={label} style={{ display: "flex", alignItems: "center", gap: 16, padding: "14px 16px", background: "rgba(255,255,255,0.03)", borderRadius: 12, border: `1px solid ${url ? "rgba(16,185,129,0.3)" : "var(--glass-border)"}` }}>
                  {/* Thumbnail or placeholder */}
                  <div style={{ width: 64, height: 64, borderRadius: 8, overflow: "hidden", background: "rgba(255,255,255,0.05)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid var(--glass-border)" }}>
                    {url ? (
                      url.match(/\.(jpg|jpeg|png|webp|gif)(\?|$)/i)
                        ? <img src={url} alt={label} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        : <span style={{ fontSize: "1.8rem" }}>📄</span>
                    ) : <span style={{ fontSize: "1.8rem", opacity: 0.3 }}>🪪</span>}
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: "0.92rem" }}>{label}</div>
                    <div style={{ fontSize: "0.78rem", marginTop: 3, color: url ? "var(--success)" : "var(--danger)" }}>
                      {url ? "✅ Uploaded" : "❌ Not uploaded yet"}
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                    {url && (
                      <a href={url} target="_blank" rel="noopener noreferrer"
                        style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid rgba(99,102,241,0.4)", background: "rgba(99,102,241,0.1)", color: "var(--accent-primary)", fontWeight: 600, textDecoration: "none", fontSize: "0.82rem" }}>
                        View
                      </a>
                    )}
                    <button onClick={() => ref.current?.click()} disabled={saving}
                      style={{ padding: "7px 14px", borderRadius: 8, border: `1px solid ${url ? "rgba(100,116,139,0.4)" : "rgba(99,102,241,0.5)"}`, background: url ? "rgba(100,116,139,0.1)" : "rgba(99,102,241,0.15)", color: url ? "var(--text-secondary)" : "var(--accent-primary)", cursor: saving ? "not-allowed" : "pointer", fontWeight: 600, fontSize: "0.82rem", fontFamily: "Outfit, sans-serif" }}>
                      {saving ? "Uploading…" : url ? "Replace" : "Upload"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
