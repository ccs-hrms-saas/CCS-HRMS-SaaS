"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function NotificationBell() {
  const { profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  const unread = notifications.filter((n) => !n.is_read).length;

  const load = async () => {
    if (!profile) return;
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(30);
    setNotifications(data ?? []);
  };

  useEffect(() => {
    if (!profile) return;
    load();

    // Real-time subscription
    const channel = supabase
      .channel(`notifs_${profile.id}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${profile.id}`,
      }, () => load())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [profile]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const markAllRead = async () => {
    if (!profile) return;
    await supabase.from("notifications").update({ is_read: true }).eq("user_id", profile.id).eq("is_read", false);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  };

  const handleClick = async (n: any) => {
    if (!n.is_read) {
      await supabase.from("notifications").update({ is_read: true }).eq("id", n.id);
      setNotifications((prev) => prev.map((x) => x.id === n.id ? { ...x, is_read: true } : x));
    }
    setOpen(false);
    if (n.link) window.location.href = n.link;
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      {/* Bell Button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Notifications"
        style={{
          position: "relative", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: "10px", width: 38, height: 38, display: "flex", alignItems: "center", justifyContent: "center",
          cursor: "pointer", fontSize: "1.1rem", transition: "background 0.2s",
          color: "var(--text-primary)"
        }}
      >
        🔔
        {unread > 0 && (
          <span style={{
            position: "absolute", top: -4, right: -4, background: "#ef4444",
            color: "#fff", borderRadius: "50%", width: 18, height: 18, fontSize: "0.65rem",
            fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: "Outfit, sans-serif", border: "2px solid var(--bg-primary)"
          }}>
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: "fixed",
          top: 64,
          left: 270,
          width: "clamp(280px, 340px, calc(100vw - 286px))",
          maxHeight: "min(480px, calc(100vh - 80px))",
          overflowY: "auto",
          background: "var(--glass-bg-solid, #1a1a2e)",
          border: "1px solid var(--glass-border)",
          borderRadius: 14,
          boxShadow: "0 16px 48px rgba(0,0,0,0.6)",
          zIndex: 1000,
          backdropFilter: "blur(20px)"
        }}>
          {/* Header */}
          <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--glass-border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontWeight: 700, fontSize: "0.9rem" }}>Notifications {unread > 0 && <span style={{ color: "#ef4444" }}>({unread})</span>}</span>
            {unread > 0 && (
              <button onClick={markAllRead} style={{ background: "none", border: "none", color: "var(--accent-primary)", cursor: "pointer", fontSize: "0.76rem", fontFamily: "Outfit,sans-serif" }}>
                Mark all read
              </button>
            )}
          </div>

          {/* Notification List */}
          {notifications.length === 0 ? (
            <div style={{ padding: 32, textAlign: "center", color: "var(--text-secondary)", fontSize: "0.85rem" }}>
              <div style={{ fontSize: "2rem", marginBottom: 8 }}>🔕</div>
              No notifications yet
            </div>
          ) : (
            notifications.map((n) => (
              <div key={n.id} onClick={() => handleClick(n)}
                style={{
                  padding: "12px 16px", cursor: n.link ? "pointer" : "default",
                  borderBottom: "1px solid rgba(255,255,255,0.04)",
                  background: n.is_read ? "transparent" : "rgba(99,102,241,0.07)",
                  transition: "background 0.15s"
                }}
              >
                <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: n.is_read ? "transparent" : "#6366f1", flexShrink: 0, marginTop: 5 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: n.is_read ? 500 : 700, fontSize: "0.85rem", lineHeight: 1.4 }}>{n.title}</div>
                    {n.message && <div style={{ color: "var(--text-secondary)", fontSize: "0.78rem", marginTop: 3, lineHeight: 1.4 }}>{n.message}</div>}
                    <div style={{ color: "var(--text-secondary)", fontSize: "0.72rem", marginTop: 4, opacity: 0.7 }}>{timeAgo(n.created_at)}</div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
