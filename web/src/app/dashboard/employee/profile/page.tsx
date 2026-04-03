"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import styles from "../../dashboard.module.css";
import Image from "next/image";

export default function EmployeeProfile() {
  const { profile } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState("");

  const avatarRef = useRef<HTMLInputElement>(null);
  const aadharFrontRef = useRef<HTMLInputElement>(null);
  const aadharBackRef = useRef<HTMLInputElement>(null);
  const panRef = useRef<HTMLInputElement>(null);

  const loadData = async () => {
    if (!profile) return;
    const { data: pData } = await supabase.from("profiles").select("*, manager:profiles!manager_id(full_name)").eq("id", profile.id).single();
    setData(pData || {});
    setLoading(false);
  };

  useEffect(() => { loadData(); }, [profile]);

  const handleChange = (e: any) => setData({ ...data, [e.target.name]: e.target.value });

  const handleUpload = async (file: File, bucket: string, pathPrefix: string, column: string) => {
    if (!profile) return;
    const fileName = `${pathPrefix}_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.\-]/g, "_")}`;
    const { error } = await supabase.storage.from(bucket).upload(`${profile.id}/${fileName}`, file);
    if (error) { alert("Upload failed: " + error.message); return; }
    
    const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(`${profile.id}/${fileName}`);
    await supabase.from("profiles").update({ [column]: urlData.publicUrl }).eq("id", profile.id);
    loadData();
  };

  const submitMeta = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    await supabase.from("profiles").update({
      emergency_contact: data.emergency_contact,
      father_name: data.father_name,
      mother_name: data.mother_name,
      address: data.address,
      aadhar_number: data.aadhar_number,
      pan_number: data.pan_number,
      bank_name: data.bank_name,
      bank_account_number: data.bank_account_number,
      bank_ifsc: data.bank_ifsc,
    }).eq("id", profile!.id);
    setSuccess("Profile updated successfully!");
    setTimeout(() => setSuccess(""), 4000);
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
              {data.joining_letter_url && (
                <div><small style={{ color: "var(--text-secondary)" }}>Joining Letter</small><div><a href={data.joining_letter_url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent-primary)", fontWeight: 600, textDecoration: "none" }}>📄 View Document</a></div></div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Employee Updatable Forms */}
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          
          <div className="glass-panel" style={{ padding: 32 }}>
            <h3 style={{ marginBottom: 24, fontSize: "1.2rem" }}>Complete Your Profile</h3>
            {success && <div style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)", color: "var(--success)", padding: "12px 16px", borderRadius: 10, marginBottom: 20, fontSize: "0.9rem" }}>{success}</div>}
            
            <form onSubmit={submitMeta}>
              <div style={{display: 'flex', gap: 16}}>
                <div className={styles.formGroup} style={{flex: 1}}><label>Father's Name</label><input className="premium-input" name="father_name" value={data.father_name || ""} onChange={handleChange} /></div>
                <div className={styles.formGroup} style={{flex: 1}}><label>Mother's Name</label><input className="premium-input" name="mother_name" value={data.mother_name || ""} onChange={handleChange} /></div>
              </div>
              <div style={{display: 'flex', gap: 16}}>
                <div className={styles.formGroup} style={{flex: 1}}><label>Emergency Contact No.</label><input className="premium-input" name="emergency_contact" value={data.emergency_contact || ""} onChange={handleChange} /></div>
                <div className={styles.formGroup} style={{flex: 1}}><label>Full Address</label><input className="premium-input" name="address" value={data.address || ""} onChange={handleChange} /></div>
              </div>

              <h4 style={{marginTop: 16, marginBottom: 16, color: 'var(--text-secondary)', borderBottom: '1px solid var(--glass-border)', paddingBottom: 8}}>Bank Details</h4>
              <div style={{display: 'flex', gap: 16}}>
                <div className={styles.formGroup} style={{flex: 1}}><label>Bank Name</label><input className="premium-input" name="bank_name" value={data.bank_name || ""} onChange={handleChange} /></div>
                <div className={styles.formGroup} style={{flex: 1}}><label>Account Number</label><input className="premium-input" name="bank_account_number" type="password" placeholder="••••••••" value={data.bank_account_number || ""} onChange={handleChange} /></div>
                <div className={styles.formGroup} style={{flex: 1}}><label>IFSC Code</label><input className="premium-input" name="bank_ifsc" value={data.bank_ifsc || ""} onChange={handleChange} /></div>
              </div>

              <h4 style={{marginTop: 16, marginBottom: 16, color: 'var(--text-secondary)', borderBottom: '1px solid var(--glass-border)', paddingBottom: 8}}>Identity & Compliance</h4>
              <div style={{display: 'flex', gap: 16}}>
                <div className={styles.formGroup} style={{flex: 1}}><label>Aadhar Number</label><input className="premium-input" name="aadhar_number" value={data.aadhar_number || ""} onChange={handleChange} /></div>
                <div className={styles.formGroup} style={{flex: 1}}><label>PAN Number</label><input className="premium-input" name="pan_number" value={data.pan_number || ""} onChange={handleChange} style={{textTransform: 'uppercase'}} /></div>
              </div>
              
              <button type="submit" className={styles.primaryBtn} disabled={saving}>{saving ? "Saving..." : "💾 Save Details"}</button>
            </form>
          </div>

          {/* Secure Document Vault */}
          <div className="glass-panel" style={{ padding: 32 }}>
             <h3 style={{ marginBottom: 24, fontSize: "1.2rem" }}>Secure Document Vault</h3>
             <input type="file" ref={aadharFrontRef} accept="image/*,.pdf" style={{ display: "none" }} onChange={(e) => { if (e.target.files?.[0]) handleUpload(e.target.files[0], "employee-documents", "aadhar_front", "aadhar_front_url"); }} />
             <input type="file" ref={aadharBackRef} accept="image/*,.pdf" style={{ display: "none" }} onChange={(e) => { if (e.target.files?.[0]) handleUpload(e.target.files[0], "employee-documents", "aadhar_back", "aadhar_back_url"); }} />
             <input type="file" ref={panRef} accept="image/*,.pdf" style={{ display: "none" }} onChange={(e) => { if (e.target.files?.[0]) handleUpload(e.target.files[0], "employee-documents", "pan_card", "pan_url"); }} />
             
             <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: 16, background: "rgba(255,255,255,0.03)", borderRadius: 12, border: "1px solid var(--glass-border)" }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>Aadhar Card (Front)</div>
                    <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>{data.aadhar_front_url ? "Uploaded ✅" : "Missing"}</div>
                  </div>
                  {data.aadhar_front_url ? <a href={data.aadhar_front_url} target="_blank" rel="noopener noreferrer" className={styles.secondaryBtn} style={{textDecoration:'none', padding: "8px 16px"}}>View Current</a> : <button onClick={() => aadharFrontRef.current?.click()} className={styles.primaryBtn} style={{width: 'auto', padding: "8px 16px"}}>Upload</button>}
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: 16, background: "rgba(255,255,255,0.03)", borderRadius: 12, border: "1px solid var(--glass-border)" }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>Aadhar Card (Back)</div>
                    <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>{data.aadhar_back_url ? "Uploaded ✅" : "Missing"}</div>
                  </div>
                  {data.aadhar_back_url ? <a href={data.aadhar_back_url} target="_blank" rel="noopener noreferrer" className={styles.secondaryBtn} style={{textDecoration:'none', padding: "8px 16px"}}>View Current</a> : <button onClick={() => aadharBackRef.current?.click()} className={styles.primaryBtn} style={{width: 'auto', padding: "8px 16px"}}>Upload</button>}
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: 16, background: "rgba(255,255,255,0.03)", borderRadius: 12, border: "1px solid var(--glass-border)" }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>PAN Card</div>
                    <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>{data.pan_url ? "Uploaded ✅" : "Missing"}</div>
                  </div>
                  {data.pan_url ? <a href={data.pan_url} target="_blank" rel="noopener noreferrer" className={styles.secondaryBtn} style={{textDecoration:'none', padding: "8px 16px"}}>View Current</a> : <button onClick={() => panRef.current?.click()} className={styles.primaryBtn} style={{width: 'auto', padding: "8px 16px"}}>Upload</button>}
                </div>
             </div>
          </div>
        </div>

      </div>
    </div>
  );
}
