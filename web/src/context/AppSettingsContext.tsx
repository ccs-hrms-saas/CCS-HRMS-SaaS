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

interface AppSettingsCtx {
  settings:       AppSettings;
  loading:        boolean;
  updateSettings: (partial: Partial<AppSettings>) => Promise<void>;
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

// ── Context ───────────────────────────────────────────────────────────────────
const Ctx = createContext<AppSettingsCtx>({
  settings:       DEFAULT_SETTINGS,
  loading:        true,
  updateSettings: async () => {},
});

export function AppSettingsProvider({ children, tenantHost }: { children: React.ReactNode; tenantHost?: string }) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    // No tenantHost = platform host (developer layer). Use defaults.
    if (!tenantHost) {
      setLoading(false);
      return;
    }

    // Middleware has already verified the tenant is active and real.
    // This context only needs to load the tenant's branding preferences.
    const subdomain = tenantHost.split(':')[0].split('.')[0]; // strip port

    supabase.from('companies')
      .select('branding')
      .or(`domain.eq.${tenantHost},subdomain.eq.${subdomain}`)
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.branding) {
          const b = data.branding as any;
          const s: AppSettings = {
            id:          b.id,
            logo_url:    b.logo_url,
            theme:       (b.theme       as ThemeKey)              ?? 'dark_indigo',
            font_family: (b.font_family as FontFamily)            ?? 'Outfit',
            font_size:   (b.font_size   as FontSize)              ?? 'md',
            nav_icons:   (b.nav_icons   as Record<string, string>) ?? {},
          };
          setSettings(s);
          applySettings(s);
        }
        setLoading(false);
      });
  }, [tenantHost]);

  const updateSettings = useCallback(async (partial: Partial<AppSettings>) => {
    const merged = { ...settings, ...partial };
    setSettings(merged);
    applySettings(merged);

    if (!tenantHost) return;

    const subdomain = tenantHost.split('.')[0];
    
    // For Multi-Tenant, we push the settings into the companies.branding JSONB column
    await supabase.from("companies")
      .update({ branding: merged })
      .or(`domain.eq.${tenantHost},subdomain.eq.${subdomain}`);
      
  }, [settings, tenantHost]);

  return (
    <Ctx.Provider value={{ settings, loading, updateSettings }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAppSettings = () => useContext(Ctx);
