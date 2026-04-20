"use client";

/**
 * ModulesContext
 *
 * Fetches the company_modules config for the current tenant.
 * Used by the Layer 2 Sidebar and individual pages to:
 *   - Show/hide nav items based on which modules are enabled
 *   - Read module-specific properties (e.g., who can post announcements)
 *
 * For platform_owner users (system_role IS NOT NULL), all modules are
 * considered enabled since they have full access.
 */

import {
  createContext, useContext, useEffect, useState, useCallback,
} from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";

// ── Types ──────────────────────────────────────────────────────────────────
export interface ModuleConfig {
  module_key:  string;
  is_enabled:  boolean;
  properties:  Record<string, any>;
}

interface ModulesContextType {
  modules:      Record<string, ModuleConfig>; // keyed by module_key
  isEnabled:    (key: string) => boolean;
  getProps:     (key: string) => Record<string, any>;
  loading:      boolean;
  refresh:      () => void;
}

const Ctx = createContext<ModulesContextType>({
  modules:   {},
  isEnabled: () => true,
  getProps:  () => ({}),
  loading:   true,
  refresh:   () => {},
});

// ── Provider ───────────────────────────────────────────────────────────────
export function ModulesProvider({ children }: { children: React.ReactNode }) {
  const { profile, loading: authLoading } = useAuth();

  const [modules,  setModules]  = useState<Record<string, ModuleConfig>>({});
  const [loading,  setLoading]  = useState(true);

  const fetchModules = useCallback(async () => {
    if (authLoading) return;

    // Platform-level users (platform_owner, platform_admin) have no company_id.
    // Give them a pass — all modules considered enabled.
    if (!profile || profile.system_role) {
      setModules({});
      setLoading(false);
      return;
    }

    if (!profile.company_id) {
      setLoading(false);
      return;
    }

    const { data } = await supabase
      .from("company_modules")
      .select("module_key, is_enabled, properties")
      .eq("company_id", profile.company_id);

    if (data) {
      const map: Record<string, ModuleConfig> = {};
      data.forEach((row) => { map[row.module_key] = row; });
      setModules(map);
    }
    setLoading(false);
  }, [profile, authLoading]);

  useEffect(() => { fetchModules(); }, [fetchModules]);

  /**
   * isEnabled(key)
   * Returns true if the module is explicitly enabled.
   * Returns true for platform-level users (no restrictions).
   * Returns true if no module record exists yet (graceful fallback).
   */
  const isEnabled = useCallback((key: string): boolean => {
    // Platform-level users bypass all module restrictions
    if (profile?.system_role) return true;
    // If we haven't loaded the module config yet, show everything
    if (loading) return true;
    // If the module key isn't in the table at all, default to enabled
    if (!(key in modules)) return true;
    return modules[key].is_enabled;
  }, [modules, loading, profile]);

  const getProps = useCallback((key: string): Record<string, any> => {
    return modules[key]?.properties ?? {};
  }, [modules]);

  return (
    <Ctx.Provider value={{ modules, isEnabled, loading, getProps, refresh: fetchModules }}>
      {children}
    </Ctx.Provider>
  );
}

export const useModules = () => useContext(Ctx);
