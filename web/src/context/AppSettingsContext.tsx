"use client";

import {
  createContext, useContext, useEffect, useState, useCallback,
} from "react";
import { supabase } from "@/lib/supabase";

// ── Types ─────────────────────────────────────────────────────────────────────
export type ThemeKey =
  | "dark_indigo" | "dark_violet" | "dark_rose"
  | "dark_cyan"   | "dark_emerald" | "light_clean";

export type FontFamily = "Outfit" | "Inter" | "Poppins" | "Roboto";
export type FontSize   = "sm" | "md" | "lg";

export interface AppSettings {
  id?:         string;
  logo_url?:   string | null;
  theme:       ThemeKey;
  font_family: FontFamily;
  font_size:   FontSize;
  nav_icons:   Record<string, string>;  // { "Dashboard": "LayoutDashboard", ... }
}

export interface WhiteLabelConfig {
  tier:     1 | 2 | 3;      // 1 = none, 2 = name only, 3 = name + logo
  name:     string;          // effective display name (or "" if tier 1)
  logoUrl:  string | null;   // effective logo URL (tier 3 only)
}

interface AppSettingsCtx {
  settings:         AppSettings;
  companyName:      string;          // raw company name from DB
  whiteLabel:       WhiteLabelConfig;
  demoModeEnabled:  boolean;
  loading:          boolean;
  updateSettings:   (partial: Partial<AppSettings>) => Promise<void>;
  refetch:          () => Promise<void>;
}

// ── Theme Map ─────────────────────────────────────────────────────────────────
export const THEMES: Record<ThemeKey, {
  label: string; emoji: string;
  vars: Record<string, string>;
}> = {
  dark_indigo: {
    label: "Dark Indigo", emoji: "🌑",
    vars: {
      "--bg-dark":          "#0f111a",
      "--bg-secondary":     "#13161f",
      "--bg-gradient":      "linear-gradient(135deg,#0f111a 0%,#1a1e2d 100%)",
      "--accent-primary":   "#6366f1",
      "--accent-secondary": "#ec4899",
      "--text-primary":     "#ffffff",
      "--text-secondary":   "#94a3b8",
      "--glass-bg":         "rgba(255,255,255,0.05)",
      "--glass-border":     "rgba(255,255,255,0.1)",
    },
  },
  dark_violet: {
    label: "Dark Violet", emoji: "🟣",
    vars: {
      "--bg-dark":          "#0d0f18",
      "--bg-secondary":     "#11131e",
      "--bg-gradient":      "linear-gradient(135deg,#0d0f18 0%,#181229 100%)",
      "--accent-primary":   "#8b5cf6",
      "--accent-secondary": "#a78bfa",
      "--text-primary":     "#ffffff",
      "--text-secondary":   "#a5b4fc",
      "--glass-bg":         "rgba(139,92,246,0.07)",
      "--glass-border":     "rgba(139,92,246,0.18)",
    },
  },
  dark_rose: {
    label: "Dark Rose", emoji: "🌹",
    vars: {
      "--bg-dark":          "#120f14",
      "--bg-secondary":     "#17121a",
      "--bg-gradient":      "linear-gradient(135deg,#120f14 0%,#1f1020 100%)",
      "--accent-primary":   "#f43f5e",
      "--accent-secondary": "#fb7185",
      "--text-primary":     "#ffffff",
      "--text-secondary":   "#fda4af",
      "--glass-bg":         "rgba(244,63,94,0.07)",
      "--glass-border":     "rgba(244,63,94,0.18)",
    },
  },
  dark_cyan: {
    label: "Dark Cyan", emoji: "🩵",
    vars: {
      "--bg-dark":          "#0a1117",
      "--bg-secondary":     "#0d1620",
      "--bg-gradient":      "linear-gradient(135deg,#0a1117 0%,#0e1c2a 100%)",
      "--accent-primary":   "#06b6d4",
      "--accent-secondary": "#22d3ee",
      "--text-primary":     "#ffffff",
      "--text-secondary":   "#67e8f9",
      "--glass-bg":         "rgba(6,182,212,0.07)",
      "--glass-border":     "rgba(6,182,212,0.18)",
    },
  },
  dark_emerald: {
    label: "Dark Emerald", emoji: "🌿",
    vars: {
      "--bg-dark":          "#0a1210",
      "--bg-secondary":     "#0d1914",
      "--bg-gradient":      "linear-gradient(135deg,#0a1210 0%,#0e1f18 100%)",
      "--accent-primary":   "#10b981",
      "--accent-secondary": "#34d399",
      "--text-primary":     "#ffffff",
      "--text-secondary":   "#6ee7b7",
      "--glass-bg":         "rgba(16,185,129,0.07)",
      "--glass-border":     "rgba(16,185,129,0.18)",
    },
  },
  light_clean: {
    label: "Light Mode", emoji: "☀️",
    vars: {
      "--bg-dark":          "#f8fafc",
      "--bg-secondary":     "#f1f5f9",
      "--bg-gradient":      "linear-gradient(135deg,#f8fafc 0%,#e2e8f0 100%)",
      "--accent-primary":   "#6366f1",
      "--accent-secondary": "#ec4899",
      "--text-primary":     "#0f172a",
      "--text-secondary":   "#64748b",
      "--glass-bg":         "rgba(0,0,0,0.04)",
      "--glass-border":     "rgba(0,0,0,0.1)",
    },
  },
};

export const FONT_SIZES: Record<FontSize, string> = {
  sm: "13px", md: "15px", lg: "17px",
};

const DEFAULT_SETTINGS: AppSettings = {
  theme:       "dark_indigo",
  font_family: "Outfit",
  font_size:   "md",
  nav_icons:   {},
};

const DEFAULT_WHITE_LABEL: WhiteLabelConfig = { tier: 1, name: "", logoUrl: null };

// ── Apply settings to :root ───────────────────────────────────────────────────
function applySettings(s: AppSettings) {
  const root = document.documentElement;
  const themeVars = THEMES[s.theme]?.vars ?? THEMES.dark_indigo.vars;
  Object.entries(themeVars).forEach(([k, v]) => root.style.setProperty(k, v));
  root.style.setProperty("--font-family", `'${s.font_family}', sans-serif`);
  root.style.setProperty("--font-size-base", FONT_SIZES[s.font_size]);
  document.body.style.fontFamily = `'${s.font_family}', sans-serif`;
  document.body.style.fontSize   = FONT_SIZES[s.font_size];
}

// ── Known platform hosts that do NOT map to a specific tenant via hostname ────
const PLATFORM_HOSTNAMES = new Set([
  "localhost", "127.0.0.1",
  "ccs-hrms-saas.vercel.app",
  "ccshrms.com", "www.ccshrms.com",
  "app.ccshrms.com",
]);

// ── Context ───────────────────────────────────────────────────────────────────
const Ctx = createContext<AppSettingsCtx>({
  settings:        DEFAULT_SETTINGS,
  companyName:     "",
  whiteLabel:      DEFAULT_WHITE_LABEL,
  demoModeEnabled: true,
  loading:         true,
  updateSettings:  async () => {},
  refetch:         async () => {},
});

export function AppSettingsProvider({ children, tenantHost }: { children: React.ReactNode; tenantHost?: string }) {
  const [settings,        setSettings]        = useState<AppSettings>(DEFAULT_SETTINGS);
  const [companyName,     setCompanyName]      = useState("");
  const [whiteLabel,      setWhiteLabel]       = useState<WhiteLabelConfig>(DEFAULT_WHITE_LABEL);
  const [demoModeEnabled, setDemoModeEnabled]  = useState(true);
  const [loading,         setLoading]          = useState(true);
  const [companyId,       setCompanyId]        = useState<string | null>(null);

  // ── Helper: apply company row data to state ────────────────────────────────
  function applyCompanyData(co: any) {
    // Branding / UI settings
    const b = co.branding as any;
    if (b) {
      const s: AppSettings = {
        id:          b.id,
        logo_url:    b.logo_url,
        theme:       (b.theme       as ThemeKey)              ?? "dark_indigo",
        font_family: (b.font_family as FontFamily)            ?? "Outfit",
        font_size:   (b.font_size   as FontSize)              ?? "md",
        nav_icons:   (b.nav_icons   as Record<string, string>) ?? {},
      };
      setSettings(s);
      applySettings(s);
    }

    // Company identity
    setCompanyName(co.name ?? "");
    setCompanyId(co.id ?? null);

    // White-label
    const tier = (co.white_label_tier ?? 1) as 1 | 2 | 3;
    const wlName = (tier >= 2 && co.white_label_name) ? (co.white_label_name as string) : "";
    const wlLogo = (tier === 3 && co.white_label_logo_url) ? (co.white_label_logo_url as string) : null;
    setWhiteLabel({ tier, name: wlName, logoUrl: wlLogo });

    // Demo mode
    setDemoModeEnabled(co.demo_mode_enabled !== false); // default true
  }

  const fetchSettings = useCallback(async () => {
    setLoading(true);

    // ── Strategy 1: Host-based lookup (subdomain or custom domain) ─────────────
    if (tenantHost) {
      const hostname = tenantHost.split(":")[0]; // strip port
      if (!PLATFORM_HOSTNAMES.has(hostname)) {
        const subdomain = hostname.split(".")[0];
        const { data: co } = await supabase
          .from("companies")
          .select("id, name, branding, white_label_tier, white_label_name, white_label_logo_url, demo_mode_enabled")
          .or(`domain.eq.${hostname},subdomain.eq.${subdomain}`)
          .limit(1)
          .maybeSingle();

        if (co) {
          applyCompanyData(co);
          setLoading(false);
          return;
        }
      }
    }

    // ── Strategy 2: Auth-based lookup (user on main platform domain) ───────────
    // Fetch the logged-in user's profile to get their company_id
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const { data: prof } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("id", user.id)
      .single();

    if (!prof?.company_id) { setLoading(false); return; }

    const { data: co } = await supabase
      .from("companies")
      .select("id, name, branding, white_label_tier, white_label_name, white_label_logo_url, demo_mode_enabled")
      .eq("id", prof.company_id)
      .single();

    if (co) applyCompanyData(co);
    setLoading(false);
  }, [tenantHost]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  const updateSettings = useCallback(async (partial: Partial<AppSettings>) => {
    const merged = { ...settings, ...partial };
    setSettings(merged);
    applySettings(merged);

    if (!companyId) return;

    await supabase.from("companies")
      .update({ branding: merged })
      .eq("id", companyId);
  }, [settings, companyId]);

  return (
    <Ctx.Provider value={{
      settings, companyName, whiteLabel, demoModeEnabled,
      loading, updateSettings, refetch: fetchSettings,
    }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAppSettings = () => useContext(Ctx);
