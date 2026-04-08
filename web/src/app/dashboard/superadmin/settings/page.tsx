"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useAppSettings, THEMES, ThemeKey, FontFamily, FontSize } from "@/context/AppSettingsContext";
import styles from "../../../dashboard.module.css";
import * as Icons from "lucide-react";

// ── Lucide icon catalogue available in the picker ─────────────────────────────
// Each entry: { key: lucide component name, label: display name, group }
const ICON_CATALOGUE: { key: string; label: string; group: string }[] = [
  // General / Navigation
  { key: "LayoutDashboard", label: "Dashboard",    group: "Navigation" },
  { key: "Home",            label: "Home",         group: "Navigation" },
  { key: "Gauge",           label: "Gauge",        group: "Navigation" },
  { key: "BarChart3",       label: "Bar Chart",    group: "Navigation" },
  { key: "PieChart",        label: "Pie Chart",    group: "Navigation" },
  { key: "LineChart",       label: "Line Chart",   group: "Navigation" },
  { key: "TrendingUp",      label: "Trending",     group: "Navigation" },
  // People
  { key: "Users",           label: "Users",        group: "People" },
  { key: "Users2",          label: "Team",         group: "People" },
  { key: "User",            label: "User",         group: "People" },
  { key: "UserCheck",       label: "User Check",   group: "People" },
  { key: "UserPlus",        label: "Add User",     group: "People" },
  { key: "UserCog",         label: "User Settings",group: "People" },
  { key: "Contact",         label: "Contact",      group: "People" },
  { key: "Network",         label: "Network",      group: "People" },
  { key: "Building2",       label: "Building",     group: "People" },
  { key: "Briefcase",       label: "Briefcase",    group: "People" },
  // Time & Attendance
  { key: "Clock",           label: "Clock",        group: "Time & Attendance" },
  { key: "Timer",           label: "Timer",        group: "Time & Attendance" },
  { key: "AlarmClock",      label: "Alarm",        group: "Time & Attendance" },
  { key: "CalendarDays",    label: "Calendar",     group: "Time & Attendance" },
  { key: "CalendarCheck",   label: "Cal Check",    group: "Time & Attendance" },
  { key: "CalendarX",       label: "Cal X",        group: "Time & Attendance" },
  { key: "CalendarClock",   label: "Cal Clock",    group: "Time & Attendance" },
  { key: "Fingerprint",     label: "Fingerprint",  group: "Time & Attendance" },
  { key: "ScanFace",        label: "Face Scan",    group: "Time & Attendance" },
  // Documents & HR
  { key: "FileText",        label: "File Text",    group: "Documents" },
  { key: "ClipboardList",   label: "Clipboard",    group: "Documents" },
  { key: "Clipboard",       label: "Clipboard 2",  group: "Documents" },
  { key: "BookOpen",        label: "Book",         group: "Documents" },
  { key: "Scroll",          label: "Scroll",       group: "Documents" },
  { key: "Newspaper",       label: "Newspaper",    group: "Documents" },
  { key: "FileBadge",       label: "Badge",        group: "Documents" },
  { key: "FileCheck",       label: "File Check",   group: "Documents" },
  { key: "Megaphone",       label: "Megaphone",    group: "Documents" },
  { key: "Bell",            label: "Bell",         group: "Documents" },
  // Finance
  { key: "DollarSign",      label: "Dollar",       group: "Finance" },
  { key: "Banknote",        label: "Banknote",     group: "Finance" },
  { key: "Wallet",          label: "Wallet",       group: "Finance" },
  { key: "CreditCard",      label: "Card",         group: "Finance" },
  { key: "Receipt",         label: "Receipt",      group: "Finance" },
  { key: "Landmark",        label: "Bank",         group: "Finance" },
  { key: "PiggyBank",       label: "Savings",      group: "Finance" },
  { key: "TrendingDown",    label: "Trend Down",   group: "Finance" },
  // Settings & Admin
  { key: "Settings",        label: "Settings",     group: "Settings" },
  { key: "Settings2",       label: "Settings 2",   group: "Settings" },
  { key: "SlidersHorizontal",label: "Sliders",     group: "Settings" },
  { key: "Wrench",          label: "Wrench",       group: "Settings" },
  { key: "Shield",          label: "Shield",       group: "Settings" },
  { key: "ShieldCheck",     label: "Shield Check", group: "Settings" },
  { key: "Key",             label: "Key",          group: "Settings" },
  { key: "Lock",            label: "Lock",         group: "Settings" },
  { key: "Unlock",          label: "Unlock",       group: "Settings" },
  { key: "Star",            label: "Star",         group: "Settings" },
  { key: "Flag",            label: "Flag",         group: "Settings" },
  { key: "Tag",             label: "Tag",          group: "Settings" },
  { key: "CheckCircle",     label: "Check",        group: "Settings" },
  { key: "XCircle",         label: "X Circle",     group: "Settings" },
  { key: "HelpCircle",      label: "Help",         group: "Settings" },
];

// All nav items that can have their icon changed
const NAV_ITEMS_CONFIGURABLE = [
  "Dashboard", "Users", "Organogram", "Attendance", "Leave Approvals",
  "Announcements", "HR Policies", "Overrides", "Leave Settings",
  "Holidays", "Payroll", "Reports", "Approvals", "Permissions", "Settings",
];

// Default icon keys for each nav item
const NAV_DEFAULT_ICONS: Record<string, string> = {
  "Dashboard":     "LayoutDashboard",
  "Users":         "Users",
  "Organogram":    "Network",
  "Attendance":    "ClipboardList",
  "Leave Approvals":"CalendarCheck",
  "Announcements": "Megaphone",
  "HR Policies":   "BookOpen",
  "Overrides":     "Wrench",
  "Leave Settings":"Settings2",
  "Holidays":      "Star",
  "Payroll":       "Banknote",
  "Reports":       "BarChart3",
  "Approvals":     "CheckCircle",
  "Permissions":   "ShieldCheck",
  "Settings":      "Settings",
};

// Dynamic icon renderer
function LucideIcon({ name, size = 18, ...props }: { name: string; size?: number; [k: string]: any }) {
  const Comp = (Icons as any)[name];
  if (!Comp) return null;
  return <Comp size={size} {...props} />;
}

// ── Icon Picker Panel ─────────────────────────────────────────────────────────
function IconPicker({
  current, onSelect, onClose,
}: { current: string; onSelect: (key: string) => void; onClose: () => void }) {
  const [search, setSearch] = useState("");
  const groups = [...new Set(ICON_CATALOGUE.map(i => i.group))];
  const filtered = ICON_CATALOGUE.filter(i =>
    !search || i.label.toLowerCase().includes(search.toLowerCase()) ||
    i.key.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 900,
      background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }} onClick={onClose}>
      <div style={{
        background: "var(--bg-secondary)", border: "1px solid var(--glass-border)",
        borderRadius: 20, padding: 24, width: "min(620px, 92vw)",
        maxHeight: "80vh", overflow: "hidden", display: "flex", flexDirection: "column",
        boxShadow: "0 32px 80px rgba(0,0,0,0.8)",
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: "1.1rem", color: "var(--text-primary)" }}>Choose Icon</div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer", fontSize: "1.2rem" }}>✕</button>
        </div>
        <input
          autoFocus
          placeholder="Search icons…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            background: "rgba(0,0,0,0.3)", border: "1px solid var(--glass-border)",
            borderRadius: 10, padding: "10px 14px", color: "var(--text-primary)",
            fontFamily: "inherit", fontSize: "0.9rem", outline: "none", marginBottom: 16,
          }}
        />
        <div style={{ overflowY: "auto", flex: 1 }}>
          {(search ? ["Results"] : groups).map(group => {
            const items = search
              ? filtered
              : filtered.filter(i => i.group === group);
            if (!items.length) return null;
            return (
              <div key={group} style={{ marginBottom: 16 }}>
                {!search && (
                  <div style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "var(--text-secondary)", marginBottom: 8 }}>
                    {group}
                  </div>
                )}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(72px, 1fr))", gap: 8 }}>
                  {items.map(icon => (
                    <button key={icon.key} onClick={() => { onSelect(icon.key); onClose(); }}
                      title={icon.label}
                      style={{
                        display: "flex", flexDirection: "column", alignItems: "center", gap: 5,
                        padding: "10px 6px", borderRadius: 12, cursor: "pointer",
                        border: current === icon.key
                          ? "2px solid var(--accent-primary)"
                          : "1px solid var(--glass-border)",
                        background: current === icon.key
                          ? "rgba(99,102,241,0.15)"
                          : "rgba(255,255,255,0.03)",
                        color: current === icon.key ? "var(--accent-primary)" : "var(--text-secondary)",
                        transition: "all 0.15s",
                      }}
                    >
                      <LucideIcon name={icon.key} size={20} />
                      <span style={{ fontSize: "0.62rem", textAlign: "center", lineHeight: 1.2 }}>{icon.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Image Upload Helper ───────────────────────────────────────────────────────
function useImageUpload(onChange: (dataUrl: string) => void) {
  const inputRef = useRef<HTMLInputElement>(null);
  const trigger = () => inputRef.current?.click();
  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = ev => { if (ev.target?.result) onChange(ev.target.result as string); };
    reader.readAsDataURL(f);
  };
  return { inputRef, trigger, onFile };
}

// ══════════════════════════════════════════════════════════════════════════════
//  MAIN PAGE
// ══════════════════════════════════════════════════════════════════════════════
export default function SuperAdminSettings() {
  const { profile, refreshProfile } = useAuth();
  const { settings, updateSettings } = useAppSettings();

  const [tab, setTab]         = useState<"profile" | "branding" | "ui">("profile");
  const [uiTab, setUiTab]     = useState<"icons" | "fonts" | "themes">("icons");
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>((profile as any)?.avatar_url ?? null);
  const [logoPreview, setLogoPreview]     = useState<string | null>(settings.logo_url ?? null);
  const [pickerFor, setPickerFor] = useState<string | null>(null); // nav item label

  useEffect(() => {
    setLogoPreview(settings.logo_url ?? null);
  }, [settings.logo_url]);

  const flashSaved = () => { setSaved(true); setTimeout(() => setSaved(false), 2000); };

  // ── Profile picture upload ─────────────────────────────────────────────────
  const avatarUpload = useImageUpload(async (dataUrl) => {
    setAvatarPreview(dataUrl);
    setSaving(true);
    const res = await fetch("/api/upload-avatar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: profile?.id, image_base64: dataUrl }),
    });
    const json = await res.json();
    if (json.success) { await refreshProfile(); flashSaved(); }
    setSaving(false);
  });

  // ── Logo upload ────────────────────────────────────────────────────────────
  const logoUpload = useImageUpload(async (dataUrl) => {
    setLogoPreview(dataUrl);
    setSaving(true);
    const res = await fetch("/api/upload-logo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image_base64: dataUrl }),
    });
    const json = await res.json();
    if (json.success) {
      await updateSettings({ logo_url: json.logo_url });
      flashSaved();
    }
    setSaving(false);
  });

  // ── Nav icon update ────────────────────────────────────────────────────────
  const handleIconSelect = useCallback(async (navLabel: string, iconKey: string) => {
    const newIcons = { ...settings.nav_icons, [navLabel]: iconKey };
    await updateSettings({ nav_icons: newIcons });
    flashSaved();
  }, [settings.nav_icons, updateSettings]);

  // ── Theme / font updates ───────────────────────────────────────────────────
  const handleTheme = async (theme: ThemeKey) => {
    setSaving(true);
    await updateSettings({ theme });
    setSaving(false); flashSaved();
  };
  const handleFont = async (partial: Partial<{ font_family: FontFamily; font_size: FontSize }>) => {
    setSaving(true);
    await updateSettings(partial);
    setSaving(false); flashSaved();
  };

  const TAB_STYLE = (active: boolean) => ({
    padding: "10px 24px", borderRadius: 30, border: "none", cursor: "pointer",
    fontFamily: "inherit", fontWeight: 700, fontSize: "0.88rem",
    background: active ? "var(--accent-primary)" : "rgba(255,255,255,0.06)",
    color: active ? "#fff" : "var(--text-secondary)",
    transition: "all 0.2s",
  });

  const SUB_TAB = (active: boolean) => ({
    padding: "7px 18px", borderRadius: 20, border: "none", cursor: "pointer",
    fontFamily: "inherit", fontWeight: 600, fontSize: "0.82rem",
    background: active ? "rgba(99,102,241,0.18)" : "transparent",
    color: active ? "var(--accent-primary)" : "var(--text-secondary)",
    transition: "all 0.2s",
  });

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className={styles.pageHeader}>
        <h1>⚙️ Settings</h1>
        <p>Manage your profile, app branding, and global UI customisation</p>
      </div>

      {/* Saved toast */}
      {saved && (
        <div style={{
          position: "fixed", top: 24, right: 24, zIndex: 999,
          background: "linear-gradient(90deg,#10b981,#34d399)", color: "#fff",
          padding: "12px 24px", borderRadius: 14, fontWeight: 700,
          boxShadow: "0 8px 32px rgba(16,185,129,0.4)", animation: "fadeIn 0.3s ease",
        }}>✅ Saved successfully</div>
      )}

      {/* Main tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 28, flexWrap: "wrap" }}>
        <button style={TAB_STYLE(tab === "profile")}  onClick={() => setTab("profile")}>👤 Profile</button>
        <button style={TAB_STYLE(tab === "branding")} onClick={() => setTab("branding")}>🏢 App Branding</button>
        <button style={TAB_STYLE(tab === "ui")}       onClick={() => setTab("ui")}>🎨 UI Customisation</button>
      </div>

      {/* ── TAB: Profile ─────────────────────────────────────────────────────── */}
      {tab === "profile" && (
        <div className="glass-panel" style={{ padding: 32, maxWidth: 520 }}>
          <h2 style={{ fontWeight: 700, fontSize: "1.1rem", marginBottom: 24, color: "var(--text-primary)" }}>
            Profile Display Picture
          </h2>

          <div style={{ display: "flex", alignItems: "center", gap: 28, flexWrap: "wrap" }}>
            {/* Avatar preview */}
            <div style={{
              width: 110, height: 110, borderRadius: "50%", overflow: "hidden",
              border: "3px solid var(--accent-primary)",
              background: "rgba(99,102,241,0.15)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "2.5rem", fontWeight: 700, color: "var(--accent-primary)",
              flexShrink: 0,
            }}>
              {avatarPreview
                ? <img src={avatarPreview} alt="avatar" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                : profile?.full_name?.charAt(0)?.toUpperCase()}
            </div>

            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: "1rem", marginBottom: 4 }}>{profile?.full_name}</div>
              <div style={{ color: "var(--text-secondary)", fontSize: "0.85rem", marginBottom: 16, textTransform: "capitalize" }}>{profile?.role}</div>
              <input ref={avatarUpload.inputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={avatarUpload.onFile} />
              <button onClick={avatarUpload.trigger} disabled={saving}
                style={{
                  padding: "10px 22px", borderRadius: 10, border: "none", cursor: "pointer",
                  background: "linear-gradient(90deg,var(--accent-primary),var(--accent-secondary))",
                  color: "#fff", fontFamily: "inherit", fontWeight: 700, fontSize: "0.88rem",
                  opacity: saving ? 0.7 : 1,
                }}>
                {saving ? "Uploading…" : "📷 Change Photo"}
              </button>
            </div>
          </div>

          <p style={{ color: "var(--text-secondary)", fontSize: "0.8rem", marginTop: 20 }}>
            Recommended: Square image, min 200×200px. JPG or PNG. Max 5MB.
          </p>
        </div>
      )}

      {/* ── TAB: App Branding ────────────────────────────────────────────────── */}
      {tab === "branding" && (
        <div className="glass-panel" style={{ padding: 32, maxWidth: 580 }}>
          <h2 style={{ fontWeight: 700, fontSize: "1.1rem", marginBottom: 8, color: "var(--text-primary)" }}>
            App Logo
          </h2>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", marginBottom: 28 }}>
            Replaces the "CCS-HRMS" placeholder in the sidebar header across the entire app.
          </p>

          <div style={{ display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>
            {/* Logo preview box */}
            <div style={{
              width: 160, height: 100, borderRadius: 16, overflow: "hidden",
              border: "2px dashed var(--glass-border)", background: "rgba(0,0,0,0.2)",
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}>
              {logoPreview
                ? <img src={logoPreview} alt="logo" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
                : <div style={{ textAlign: "center", color: "var(--text-secondary)", fontSize: "0.78rem", padding: 12 }}>
                    No logo set<br /><span style={{ fontSize: "1.5rem" }}>🏢</span>
                  </div>
              }
            </div>

            <div>
              <div style={{ fontWeight: 600, fontSize: "0.9rem", marginBottom: 6 }}>Upload App Logo</div>
              <div style={{ color: "var(--text-secondary)", fontSize: "0.8rem", marginBottom: 16 }}>
                PNG with transparent background recommended.<br />
                Minimum 300×100px.
              </div>
              <input ref={logoUpload.inputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={logoUpload.onFile} />
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button onClick={logoUpload.trigger} disabled={saving}
                  style={{
                    padding: "10px 22px", borderRadius: 10, border: "none", cursor: "pointer",
                    background: "linear-gradient(90deg,var(--accent-primary),var(--accent-secondary))",
                    color: "#fff", fontFamily: "inherit", fontWeight: 700, fontSize: "0.88rem",
                    opacity: saving ? 0.7 : 1,
                  }}>
                  {saving ? "Uploading…" : "📁 Upload Logo"}
                </button>
                {logoPreview && (
                  <button onClick={async () => {
                    setSaving(true);
                    await updateSettings({ logo_url: null });
                    setLogoPreview(null);
                    setSaving(false); flashSaved();
                  }}
                    style={{
                      padding: "10px 22px", borderRadius: 10, cursor: "pointer",
                      border: "1px solid rgba(239,68,68,0.4)", background: "rgba(239,68,68,0.1)",
                      color: "#ef4444", fontFamily: "inherit", fontWeight: 700, fontSize: "0.88rem",
                    }}>
                    🗑 Remove Logo
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB: UI Customisation ────────────────────────────────────────────── */}
      {tab === "ui" && (
        <div>
          {/* Sub-tab bar */}
          <div style={{ display: "flex", gap: 6, marginBottom: 24, background: "rgba(255,255,255,0.04)", borderRadius: 20, padding: 6, width: "fit-content" }}>
            <button style={SUB_TAB(uiTab === "icons")}  onClick={() => setUiTab("icons")}>🔲 Icons</button>
            <button style={SUB_TAB(uiTab === "fonts")}  onClick={() => setUiTab("fonts")}>🔡 Fonts</button>
            <button style={SUB_TAB(uiTab === "themes")} onClick={() => setUiTab("themes")}>🎨 Themes</button>
          </div>

          {/* ── Sub-tab: Icons ──────────────────────────────────────────────── */}
          {uiTab === "icons" && (
            <div>
              <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", marginBottom: 20 }}>
                Click any nav item to choose a different SVG icon from the Lucide library.
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
                {NAV_ITEMS_CONFIGURABLE.map(label => {
                  const iconKey = settings.nav_icons[label] ?? NAV_DEFAULT_ICONS[label] ?? "Circle";
                  return (
                    <button key={label} onClick={() => setPickerFor(label)}
                      style={{
                        display: "flex", alignItems: "center", gap: 12,
                        padding: "14px 16px", borderRadius: 14, cursor: "pointer",
                        border: "1px solid var(--glass-border)",
                        background: "var(--glass-bg)",
                        color: "var(--text-primary)", fontFamily: "inherit",
                        textAlign: "left", transition: "all 0.2s",
                      }}
                      onMouseEnter={e => {
                        (e.currentTarget as HTMLElement).style.borderColor = "var(--accent-primary)";
                        (e.currentTarget as HTMLElement).style.background = "rgba(99,102,241,0.1)";
                      }}
                      onMouseLeave={e => {
                        (e.currentTarget as HTMLElement).style.borderColor = "var(--glass-border)";
                        (e.currentTarget as HTMLElement).style.background = "var(--glass-bg)";
                      }}
                    >
                      <div style={{
                        width: 38, height: 38, borderRadius: 10,
                        background: "rgba(99,102,241,0.12)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        flexShrink: 0, color: "var(--accent-primary)",
                      }}>
                        <LucideIcon name={iconKey} size={18} />
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: "0.88rem" }}>{label}</div>
                        <div style={{ color: "var(--text-secondary)", fontSize: "0.72rem", marginTop: 2 }}>{iconKey}</div>
                      </div>
                      <div style={{ marginLeft: "auto", color: "var(--text-secondary)", opacity: 0.5 }}>
                        <Icons.ChevronRight size={14} />
                      </div>
                    </button>
                  );
                })}
              </div>

              {pickerFor && (
                <IconPicker
                  current={settings.nav_icons[pickerFor] ?? NAV_DEFAULT_ICONS[pickerFor] ?? "Circle"}
                  onSelect={(key) => handleIconSelect(pickerFor, key)}
                  onClose={() => setPickerFor(null)}
                />
              )}
            </div>
          )}

          {/* ── Sub-tab: Fonts ──────────────────────────────────────────────── */}
          {uiTab === "fonts" && (
            <div style={{ maxWidth: 560 }}>
              {/* Font Family */}
              <div className="glass-panel" style={{ padding: 28, marginBottom: 20 }}>
                <div style={{ fontWeight: 700, fontSize: "1rem", marginBottom: 20 }}>Font Family</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  {(["Outfit", "Inter", "Poppins", "Roboto"] as FontFamily[]).map(f => (
                    <button key={f} onClick={() => handleFont({ font_family: f })}
                      style={{
                        padding: "16px 20px", borderRadius: 14, cursor: "pointer",
                        border: settings.font_family === f
                          ? "2px solid var(--accent-primary)"
                          : "1px solid var(--glass-border)",
                        background: settings.font_family === f
                          ? "rgba(99,102,241,0.15)"
                          : "rgba(255,255,255,0.03)",
                        textAlign: "left", transition: "all 0.2s",
                      }}>
                      <div style={{
                        fontFamily: `'${f}', sans-serif`,
                        fontSize: "1.15rem", fontWeight: 600,
                        color: settings.font_family === f ? "var(--accent-primary)" : "var(--text-primary)",
                        marginBottom: 4,
                      }}>
                        {f}
                      </div>
                      <div style={{
                        fontFamily: `'${f}', sans-serif`,
                        fontSize: "0.78rem", color: "var(--text-secondary)",
                      }}>
                        The quick brown fox jumps
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Font Size */}
              <div className="glass-panel" style={{ padding: 28 }}>
                <div style={{ fontWeight: 700, fontSize: "1rem", marginBottom: 20 }}>Font Size</div>
                <div style={{ display: "flex", gap: 12 }}>
                  {([
                    { key: "sm", label: "Small",  sample: "13px" },
                    { key: "md", label: "Medium", sample: "15px" },
                    { key: "lg", label: "Large",  sample: "17px" },
                  ] as { key: FontSize; label: string; sample: string }[]).map(s => (
                    <button key={s.key} onClick={() => handleFont({ font_size: s.key })}
                      style={{
                        flex: 1, padding: "16px 12px", borderRadius: 14, cursor: "pointer",
                        border: settings.font_size === s.key
                          ? "2px solid var(--accent-primary)"
                          : "1px solid var(--glass-border)",
                        background: settings.font_size === s.key
                          ? "rgba(99,102,241,0.15)"
                          : "rgba(255,255,255,0.03)",
                        textAlign: "center", transition: "all 0.2s",
                        color: settings.font_size === s.key ? "var(--accent-primary)" : "var(--text-primary)",
                      }}>
                      <div style={{ fontSize: s.sample, fontWeight: 600, marginBottom: 4 }}>Aa</div>
                      <div style={{ fontSize: "0.78rem", fontWeight: 600 }}>{s.label}</div>
                      <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)", marginTop: 2 }}>{s.sample}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Sub-tab: Themes ─────────────────────────────────────────────── */}
          {uiTab === "themes" && (
            <div>
              <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", marginBottom: 20 }}>
                Changes apply instantly across the entire application for all users.
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16 }}>
                {(Object.entries(THEMES) as [ThemeKey, typeof THEMES[ThemeKey]][]).map(([key, t]) => {
                  const isActive = settings.theme === key;
                  const accent   = t.vars["--accent-primary"];
                  const bg       = t.vars["--bg-dark"];
                  const bg2      = t.vars["--bg-gradient"];
                  return (
                    <button key={key} onClick={() => handleTheme(key)}
                      style={{
                        borderRadius: 18, overflow: "hidden", cursor: "pointer", padding: 0,
                        border: isActive ? `3px solid ${accent}` : "2px solid transparent",
                        boxShadow: isActive ? `0 0 0 1px ${accent}44, 0 8px 32px rgba(0,0,0,0.4)` : "0 4px 20px rgba(0,0,0,0.3)",
                        transition: "all 0.25s", background: "transparent",
                        transform: isActive ? "translateY(-3px)" : "translateY(0)",
                      }}>
                      {/* Theme preview */}
                      <div style={{ background: bg2, padding: "20px 16px 14px", position: "relative" }}>
                        {isActive && (
                          <div style={{
                            position: "absolute", top: 10, right: 10,
                            background: accent, borderRadius: "50%",
                            width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: "0.7rem", color: "#fff", fontWeight: 800,
                          }}>✓</div>
                        )}
                        {/* Mini sidebar mockup */}
                        <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                          <div style={{ width: 48, borderRight: `1px solid ${t.vars["--glass-border"]}`, paddingRight: 8 }}>
                            {[accent, accent + "88", accent + "44"].map((c, i) => (
                              <div key={i} style={{ width: "100%", height: 6, borderRadius: 4, background: c, marginBottom: 5 }} />
                            ))}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ width: "60%", height: 8, borderRadius: 4, background: t.vars["--text-primary"] + "cc", marginBottom: 6 }} />
                            <div style={{ width: "80%", height: 5, borderRadius: 4, background: t.vars["--text-secondary"] + "88", marginBottom: 4 }} />
                            <div style={{ width: "50%", height: 5, borderRadius: 4, background: t.vars["--text-secondary"] + "55" }} />
                            <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
                              <div style={{ flex: 1, height: 22, borderRadius: 6, background: accent + "33", border: `1px solid ${accent}44` }} />
                              <div style={{ flex: 1, height: 22, borderRadius: 6, background: t.vars["--glass-bg"] }} />
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Theme name */}
                      <div style={{
                        background: bg, padding: "12px 16px",
                        display: "flex", alignItems: "center", gap: 8,
                      }}>
                        <span style={{ fontSize: "1.1rem" }}>{t.emoji}</span>
                        <div style={{ textAlign: "left" }}>
                          <div style={{ color: t.vars["--text-primary"], fontWeight: 700, fontSize: "0.88rem" }}>{t.label}</div>
                          <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                            <div style={{ width: 14, height: 14, borderRadius: "50%", background: accent }} />
                            <div style={{ width: 14, height: 14, borderRadius: "50%", background: bg, border: "1px solid rgba(255,255,255,0.15)" }} title="Background" />
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
