"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import {
  Tablet, MonitorSmartphone, RefreshCw, Eye, EyeOff,
  Calendar, Receipt, Clock, Fingerprint, Check, Monitor,
  Apple, Download,
} from "lucide-react";
import s from "./MobileTab.module.css";

// ── Types ──────────────────────────────────────────────────────────────────
interface KioskDevice {
  id: string;
  device_name: string;
  is_active: boolean;
  last_ping: string | null;
  registered_at: string;
}

interface Module {
  id: string;
  module_key: string;
  is_enabled: boolean;
  properties: Record<string, any>;
}

interface Props {
  companyId: string;
}

// ── Employee app feature definitions ──────────────────────────────────────
const EMP_APP_FEATURES: {
  key: string;
  label: string;
  desc: string;
  icon: React.ElementType;
}[] = [
  { key: "allow_leave_requests",  label: "Leave Requests",   desc: "Employees can apply for leave from the app",     icon: Calendar   },
  { key: "allow_payslip_view",    label: "Payslip Viewer",   desc: "Employees can view and download payslips",       icon: Receipt    },
  { key: "allow_attendance_view", label: "Attendance Log",   desc: "Employees can see their own attendance history", icon: Clock      },
  { key: "require_biometric",     label: "Biometric Lock",   desc: "App requires fingerprint/face ID on open",       icon: Fingerprint },
];

// ── Helper: is ping recent (within 15 minutes = online) ───────────────────
function isPingOnline(ping: string | null) {
  if (!ping) return false;
  return Date.now() - new Date(ping).getTime() < 1000 * 60 * 15;
}

// ── Helper: time ago string ─────────────────────────────────────────────
function timeAgo(dateStr: string | null) {
  if (!dateStr) return "Never";
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60)   return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(dateStr).toLocaleDateString();
}

// ── Main Component ──────────────────────────────────────────────────────────
export default function MobileTab({ companyId }: Props) {
  const [devices,        setDevices]        = useState<KioskDevice[]>([]);
  const [kioskMod,       setKioskMod]       = useState<Module | null>(null);
  const [empMod,         setEmpMod]         = useState<Module | null>(null);
  const [kioskProps,     setKioskProps]     = useState<Record<string, any>>({});
  const [empProps,       setEmpProps]       = useState<Record<string, any>>({});
  const [loading,        setLoading]        = useState(true);
  const [pinVisible,     setPinVisible]     = useState(false);
  const [generating,     setGenerating]     = useState(false);
  const [savingEmp,      setSavingEmp]      = useState(false);
  const [toast,          setToast]          = useState("");
  const [desktopUrls,    setDesktopUrls]    = useState<{ mac: string; win: string; version: string }>({
    mac: "", win: "", version: "",
  });
  const [savingDesktop,  setSavingDesktop]  = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: devs }, { data: mods }, cfgRes] = await Promise.all([
      supabase
        .from("kiosk_devices")
        .select("*")
        .eq("company_id", companyId)
        .order("registered_at", { ascending: false }),
      supabase
        .from("company_modules")
        .select("*")
        .eq("company_id", companyId)
        .in("module_key", ["kiosk_attendance", "employee_mobile_app"]),
      fetch("/api/platform-config").then(r => r.json()).catch(() => ({})),
    ]);

    setDevices(devs ?? []);

    const kMod = (mods ?? []).find((m) => m.module_key === "kiosk_attendance") ?? null;
    const eMod = (mods ?? []).find((m) => m.module_key === "employee_mobile_app") ?? null;

    setKioskMod(kMod);
    setEmpMod(eMod);
    setKioskProps(kMod?.properties ?? { max_devices: 5, require_device_pin: true, pin_rotation_days: 30, show_employee_photo: true, desktop_kiosk_enabled: false });
    setEmpProps(eMod?.properties ?? { allow_leave_requests: true, allow_payslip_view: true, allow_attendance_view: true, require_biometric: false });
    setDesktopUrls({
      mac:     cfgRes?.desktop_mac_url     ?? "",
      win:     cfgRes?.desktop_win_url     ?? "",
      version: cfgRes?.desktop_kiosk_version ?? "1.0.0",
    });
    setLoading(false);
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  // ── Toggle module on/off ───────────────────────────────────────────────
  async function toggleModule(mod: Module | null, key: string, newVal: boolean) {
    if (!mod) return;
    await supabase.from("company_modules")
      .update({ is_enabled: newVal, updated_at: new Date().toISOString() })
      .eq("id", mod.id);
    if (key === "kiosk_attendance") setKioskMod(m => m ? { ...m, is_enabled: newVal } : m);
    else setEmpMod(m => m ? { ...m, is_enabled: newVal } : m);
    showToast(`Module ${newVal ? "enabled" : "disabled"}`);
  }

  // ── Generate new pairing PIN ───────────────────────────────────────────
  async function generatePin() {
    if (!kioskMod) return;
    setGenerating(true);
    // Generate a 6-digit numeric PIN
    const pin = String(Math.floor(100000 + Math.random() * 900000));
    const newProps = { ...kioskProps, setup_pin: pin };
    await supabase.from("company_modules")
      .update({ properties: newProps, updated_at: new Date().toISOString() })
      .eq("id", kioskMod.id);
    setKioskProps(newProps);
    setPinVisible(true);
    setGenerating(false);
    showToast("New pairing PIN generated — share with tablet administrator");
  }

  // ── Revoke a kiosk device ──────────────────────────────────────────────
  async function revokeDevice(deviceId: string) {
    await supabase.from("kiosk_devices").update({ is_active: false }).eq("id", deviceId);
    setDevices(prev => prev.map(d => d.id === deviceId ? { ...d, is_active: false } : d));
    showToast("Device revoked successfully");
  }

  // ── Save employee app features ─────────────────────────────────────────
  async function saveEmpProps() {
    if (!empMod) return;
    setSavingEmp(true);
    await supabase.from("company_modules")
      .update({ properties: empProps, updated_at: new Date().toISOString() })
      .eq("id", empMod.id);
    setSavingEmp(false);
    showToast("Employee app configuration saved");
  }

  // ── Toggle desktop kiosk enabled ───────────────────────────────────────
  async function toggleDesktopKiosk(enabled: boolean) {
    if (!kioskMod) return;
    const newProps = { ...kioskProps, desktop_kiosk_enabled: enabled };
    await supabase.from("company_modules")
      .update({ properties: newProps, updated_at: new Date().toISOString() })
      .eq("id", kioskMod.id);
    setKioskProps(newProps);
    showToast(`Desktop kiosk ${enabled ? "enabled" : "disabled"}`);
  }

  // ── Save desktop download URLs ─────────────────────────────────────────
  async function saveDesktopUrls() {
    setSavingDesktop(true);
    await fetch("/api/platform-config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([
        { key: "desktop_mac_url",          value: desktopUrls.mac },
        { key: "desktop_win_url",          value: desktopUrls.win },
        { key: "desktop_kiosk_version",    value: desktopUrls.version },
      ]),
    });
    setSavingDesktop(false);
    showToast("Desktop download links saved");
  }

  // ── Derived data ───────────────────────────────────────────────────────
  const activeDevices = devices.filter(d => d.is_active);
  const maxDevices    = kioskProps.max_devices ?? 5;
  const slotPercent   = Math.min((activeDevices.length / maxDevices) * 100, 100);
  const slotsAtLimit  = activeDevices.length >= maxDevices;
  const currentPin    = kioskProps.setup_pin ?? null;

  if (loading) {
    return <div style={{ padding: 40, color: "#334155", textAlign: "center" }}>Loading mobile configuration...</div>;
  }

  return (
    <div className={s.mobileGrid}>

      {/* ═══ LEFT: Kiosk Attendance App ═══════════════════════════════════ */}
      <div className={s.sectionCard}>
        {/* Header */}
        <div className={s.sectionHead}>
          <div className={s.sectionHeadIcon}>
            <Tablet size={18} color="#6366f1" />
          </div>
          <div>
            <div className={s.sectionTitle}>Kiosk Attendance App</div>
            <div className={s.sectionSub}>Android tablet APK for physical punch-ins</div>
          </div>
        </div>

        {/* Module on/off toggle */}
        <div className={s.moduleStatusRow}>
          <span className={s.moduleStatusLabel}>Kiosk module is currently</span>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: "0.82rem", color: kioskMod?.is_enabled ? "#34d399" : "#f87171", fontWeight: 600 }}>
              {kioskMod?.is_enabled ? "Enabled" : "Disabled"}
            </span>
            <label className={s.switch}>
              <input
                type="checkbox"
                checked={kioskMod?.is_enabled ?? false}
                onChange={e => toggleModule(kioskMod, "kiosk_attendance", e.target.checked)}
              />
              <span className={s.switchSlider} />
            </label>
          </div>
        </div>

        {/* Pairing PIN section */}
        <div className={s.pinSection}>
          <div className={s.pinLabel}>🔑 Tablet Pairing Code (Setup PIN)</div>
          <div className={s.pinDisplay}>
            <div className={`${s.pinCode} ${!pinVisible ? s.pinCodeMasked : ""}`}>
              {pinVisible && currentPin
                ? currentPin
                : currentPin
                  ? "• • • • • •"
                  : "— — — —"}
            </div>
          </div>
          <div className={s.pinHint}>
            {currentPin
              ? "Enter this PIN on the kiosk tablet during first-time setup to pair the device."
              : "No pairing PIN set yet. Generate one below to allow tablet registration."}
          </div>
          <div className={s.pinBtnRow}>
            <button
              className={s.generateBtn}
              onClick={generatePin}
              disabled={generating}
            >
              <RefreshCw size={13} /> {generating ? "Generating…" : currentPin ? "Regenerate PIN" : "Generate PIN"}
            </button>
            {currentPin && (
              <button className={s.revealBtn} onClick={() => setPinVisible(v => !v)}>
                {pinVisible ? <><EyeOff size={13} /> Hide</> : <><Eye size={13} /> Reveal</>}
              </button>
            )}
          </div>
        </div>

        {/* Device slots meter */}
        <div className={s.slotsMeter}>
          <span className={s.slotsLabel}>Device slots used</span>
          <span className={`${s.slotsCount} ${slotsAtLimit ? s.slotsFull : ""}`}>
            {activeDevices.length} / {maxDevices}
            {slotsAtLimit && " ⚠️ Full"}
          </span>
        </div>
        <div className={s.slotsBar}>
          <div
            className={s.slotsBarFill}
            style={{ width: `${slotPercent}%`, background: slotsAtLimit ? "linear-gradient(90deg,#f59e0b,#ef4444)" : undefined }}
          />
        </div>

        {/* Device list */}
        {devices.length === 0 ? (
          <div className={s.noDevices}>
            No devices registered yet.<br />
            Install the Kiosk APK on a tablet, enter the company subdomain<br />
            and pairing PIN to complete setup.
          </div>
        ) : (
          devices.map(d => {
            const online = isPingOnline(d.last_ping);
            return (
              <div key={d.id} className={s.deviceItem}>
                <div className={s.deviceIcon}>
                  <Tablet size={16} color={online ? "#10b981" : "#475569"} />
                  <span className={`${s.onlineDot} ${online ? s.dotOnline : s.dotOffline}`} />
                </div>
                <div className={s.deviceInfo}>
                  <div className={s.deviceName}>{d.device_name}</div>
                  <div className={s.deviceMeta}>
                    {online ? "🟢 Online" : "⚫ Offline"} &middot; Last ping {timeAgo(d.last_ping)}
                    <br />Registered {new Date(d.registered_at).toLocaleDateString()}
                  </div>
                </div>
                {d.is_active ? (
                  <button className={s.revokeBtn} onClick={() => revokeDevice(d.id)}>
                    Revoke
                  </button>
                ) : (
                  <span className={s.revokedTag}>Revoked</span>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* ═══ RIGHT: Employee Mobile App ═══════════════════════════════════ */}
      <div className={s.sectionCard}>
        {/* Header */}
        <div className={s.sectionHead}>
          <div className={s.sectionHeadIcon}>
            <MonitorSmartphone size={18} color="#6366f1" />
          </div>
          <div>
            <div className={s.sectionTitle}>Employee Mobile App</div>
            <div className={s.sectionSub}>Android APK for employee self-service</div>
          </div>
        </div>

        {/* Module on/off toggle */}
        <div className={s.moduleStatusRow}>
          <span className={s.moduleStatusLabel}>Employee app is currently</span>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: "0.82rem", color: empMod?.is_enabled ? "#34d399" : "#f87171", fontWeight: 600 }}>
              {empMod?.is_enabled ? "Enabled" : "Disabled"}
            </span>
            <label className={s.switch}>
              <input
                type="checkbox"
                checked={empMod?.is_enabled ?? false}
                onChange={e => toggleModule(empMod, "employee_mobile_app", e.target.checked)}
              />
              <span className={s.switchSlider} />
            </label>
          </div>
        </div>

        {/* Feature toggles */}
        <div className={s.featureGrid}>
          {EMP_APP_FEATURES.map(({ key, label, desc, icon: Icon }) => {
            const enabled = empProps[key] ?? false;
            return (
              <div
                key={key}
                className={`${s.featureCard} ${enabled ? s.enabled : ""}`}
                onClick={() => setEmpProps(p => ({ ...p, [key]: !p[key] }))}
                style={{ cursor: "pointer", userSelect: "none" }}
              >
                <div className={s.featureCardIcon}>
                  <Icon size={16} color={enabled ? "#6366f1" : "#475569"} />
                </div>
                <div className={s.featureText}>
                  <div className={s.featureName}>{label}</div>
                  <div className={s.featureDesc}>{desc}</div>
                </div>
                {/* Pill toggle */}
                <label className={s.switch} onClick={e => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={e => setEmpProps(p => ({ ...p, [key]: e.target.checked }))}
                  />
                  <span className={s.switchSlider} />
                </label>
              </div>
            );
          })}
        </div>

        {/* Save button */}
        <div className={s.saveRow}>
          <button className={s.saveBtn} onClick={saveEmpProps} disabled={savingEmp}>
            {savingEmp ? "Saving…" : <><Check size={15} style={{ display: "inline", marginRight: 6 }} />Save App Configuration</>}
          </button>
        </div>
      </div>

      {/* ═══ BOTTOM: Desktop Kiosk App ══════════════════════════════════ */}
      <div className={s.sectionCard} style={{ gridColumn: "1 / -1" }}>
        <div className={s.sectionHead}>
          <div className={s.sectionHeadIcon}>
            <Monitor size={18} color="#6366f1" />
          </div>
          <div style={{ flex: 1 }}>
            <div className={s.sectionTitle}>Desktop Kiosk App</div>
            <div className={s.sectionSub}>Windows &amp; macOS Electron app for offices without Android devices</div>
          </div>
          {/* Enable toggle */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: "0.82rem", color: kioskProps.desktop_kiosk_enabled ? "#34d399" : "#f87171", fontWeight: 600 }}>
              {kioskProps.desktop_kiosk_enabled ? "Enabled" : "Disabled"}
            </span>
            <label className={s.switch}>
              <input
                type="checkbox"
                checked={kioskProps.desktop_kiosk_enabled ?? false}
                onChange={e => toggleDesktopKiosk(e.target.checked)}
              />
              <span className={s.switchSlider} />
            </label>
          </div>
        </div>

        {/* PIN note */}
        <div style={{ padding: "12px 20px", background: "rgba(99,102,241,0.08)", borderRadius: 10, margin: "0 0 20px", fontSize: "0.82rem", color: "#94a3b8", border: "1px solid rgba(99,102,241,0.15)" }}>
          🔑 <strong style={{ color: "#c7d2fe" }}>Shared Pairing PIN</strong> — Desktop kiosk uses the same Tablet Pairing PIN shown above.
          Employees enter the company subdomain and that PIN to pair any desktop.
        </div>

        {/* Download URLs editor */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 12, alignItems: "flex-end", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8, color: "#64748b", marginBottom: 6 }}>🍎 macOS Download URL (.dmg)</div>
            <input
              value={desktopUrls.mac}
              onChange={e => setDesktopUrls(p => ({ ...p, mac: e.target.value }))}
              placeholder="https://cdn.ccshrms.com/desktop/CCS-HRMS-Kiosk-mac.dmg"
              style={{ width: "100%", padding: "10px 14px", borderRadius: 10, background: "rgba(0,0,0,0.25)", border: "1px solid rgba(255,255,255,0.08)", color: "#f1f5f9", fontFamily: "inherit", fontSize: "0.85rem", outline: "none" }}
            />
          </div>
          <div>
            <div style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8, color: "#64748b", marginBottom: 6 }}>🪟 Windows Download URL (.exe)</div>
            <input
              value={desktopUrls.win}
              onChange={e => setDesktopUrls(p => ({ ...p, win: e.target.value }))}
              placeholder="https://cdn.ccshrms.com/desktop/CCS-HRMS-Kiosk-Setup.exe"
              style={{ width: "100%", padding: "10px 14px", borderRadius: 10, background: "rgba(0,0,0,0.25)", border: "1px solid rgba(255,255,255,0.08)", color: "#f1f5f9", fontFamily: "inherit", fontSize: "0.85rem", outline: "none" }}
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8, color: "#64748b", marginBottom: 6 }}>Version</div>
            <input
              value={desktopUrls.version}
              onChange={e => setDesktopUrls(p => ({ ...p, version: e.target.value }))}
              placeholder="1.0.0"
              style={{ width: 100, padding: "10px 14px", borderRadius: 10, background: "rgba(0,0,0,0.25)", border: "1px solid rgba(255,255,255,0.08)", color: "#f1f5f9", fontFamily: "inherit", fontSize: "0.85rem", outline: "none" }}
            />
          </div>
        </div>
        <button
          className={s.saveBtn}
          onClick={saveDesktopUrls}
          disabled={savingDesktop}
          style={{ width: "auto" }}
        >
          {savingDesktop ? "Saving…" : <><Check size={15} style={{ display: "inline", marginRight: 6 }} />Save Desktop Download Links</>}
        </button>
      </div>

      {/* Toast notification */}
      {toast && (
        <div className={s.toast}>
          <Check size={15} /> {toast}
        </div>
      )}
    </div>
  );
}
