"use client";

import { Settings } from "lucide-react";
import dp from "../dev-page.module.css";

export default function SettingsPage() {
  return (
    <div className={dp.page}>
      <div className={dp.pageHeader}>
        <div>
          <h1 className={dp.heading}>Platform Settings</h1>
          <p className={dp.subheading}>Global configuration for the SaaS platform.</p>
        </div>
      </div>

      <div className={dp.panel}>
        <div className={dp.emptyState}>
          <Settings size={36} />
          <div>Platform-level settings will be configured here.</div>
          <div style={{ marginTop: 8, fontSize: "0.8rem", color: "#334155" }}>
            Items like global branding, email provider, billing gateway, and Supabase config coming in a future phase.
          </div>
        </div>
      </div>
    </div>
  );
}
