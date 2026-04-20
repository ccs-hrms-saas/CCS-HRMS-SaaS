"use client";

import { ToggleLeft } from "lucide-react";
import dp from "../dev-page.module.css";

export default function FlagsPage() {
  return (
    <div className={dp.page}>
      <div className={dp.pageHeader}>
        <div>
          <h1 className={dp.heading}>Feature Flags</h1>
          <p className={dp.subheading}>
            Global platform-wide feature switches — separate from per-tenant module config.
          </p>
        </div>
      </div>

      <div className={dp.panel}>
        <div className={dp.emptyState}>
          <ToggleLeft size={36} />
          <div>Feature flags are managed per-tenant in the <strong>Modules</strong> tab.</div>
          <div style={{ marginTop: 8, fontSize: "0.8rem", color: "#334155" }}>
            Global platform flags (e.g. maintenance mode, new feature rollouts) will appear here in a future update.
          </div>
        </div>
      </div>
    </div>
  );
}
