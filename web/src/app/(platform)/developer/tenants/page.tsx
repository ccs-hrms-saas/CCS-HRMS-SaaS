"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Search, Building2, Plus } from "lucide-react";
import styles from "../dev-page.module.css";

interface Company {
  id: string;
  name: string;
  subdomain: string | null;
  domain: string | null;
  is_active: boolean;
  plan_id: string | null;
  created_at: string;
}

export default function TenantsPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "suspended">("all");

  useEffect(() => { fetchCompanies(); }, []);

  async function fetchCompanies() {
    setLoading(true);
    const { data } = await supabase
      .from("companies")
      .select("*")
      .order("created_at", { ascending: false });
    setCompanies(data ?? []);
    setLoading(false);
  }

  const filtered = companies.filter((c) => {
    const matchSearch = c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.subdomain ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (c.domain ?? "").toLowerCase().includes(search.toLowerCase());
    const matchStatus =
      statusFilter === "all" ? true :
      statusFilter === "active" ? c.is_active :
      !c.is_active;
    return matchSearch && matchStatus;
  });

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.heading}>Tenant Registry</h1>
          <p className={styles.subheading}>
            All deployed company workspaces across the platform.
          </p>
        </div>
        <Link href="/developer" className={styles.primaryBtn}>
          <Plus size={16} /> Deploy Tenant
        </Link>
      </div>

      {/* Filter bar */}
      <div className={styles.filterBar}>
        <div className={styles.searchWrap}>
          <Search size={15} className={styles.searchIcon} />
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Search by name, subdomain, or domain..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className={styles.filterSelect}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as any)}
        >
          <option value="all">All Statuses</option>
          <option value="active">Active only</option>
          <option value="suspended">Suspended only</option>
        </select>
      </div>

      {/* Table */}
      <div className={styles.panel}>
        <div className={styles.countLabel}>
          {loading ? "Loading..." : `${filtered.length} tenant${filtered.length !== 1 ? "s" : ""} found`}
        </div>

        {loading ? (
          <div className={styles.loading}>Loading tenants...</div>
        ) : filtered.length === 0 ? (
          <div className={styles.emptyState}>
            <Building2 size={36} />
            <div>No tenants match your search.</div>
          </div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Company</th>
                <th>Routing</th>
                <th>Status</th>
                <th>Deployed</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id}>
                  <td>
                    <div className={styles.cellPrimary}>{c.name}</div>
                    <div className={styles.cellSub}>{c.id.slice(0, 8)}…</div>
                  </td>
                  <td>
                    <div className={styles.cellPrimary}>
                      {c.subdomain ? `${c.subdomain}.ccshrms.com` : "—"}
                    </div>
                    {c.domain && (
                      <div className={styles.cellSub}>{c.domain}</div>
                    )}
                  </td>
                  <td>
                    <span className={`${styles.badge} ${c.is_active ? styles.badgeGreen : styles.badgeRed}`}>
                      {c.is_active ? "Active" : "Suspended"}
                    </span>
                  </td>
                  <td>
                    {new Date(c.created_at).toLocaleDateString("en-US", {
                      month: "short", day: "numeric", year: "numeric",
                    })}
                  </td>
                  <td>
                    <Link href={`/developer/tenants/${c.id}`} className={styles.actionLink}>
                      Manage →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
