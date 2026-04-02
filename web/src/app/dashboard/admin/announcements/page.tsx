"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import styles from "../../dashboard.module.css";

export default function AdminAnnouncements() {
  const { profile } = useAuth();
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const { data } = await supabase
      .from("announcements")
      .select("*, profiles(full_name)")
      .order("created_at", { ascending: false });
    setAnnouncements(data ?? []);
  };

  useEffect(() => { load(); }, []);

  const publish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !content || !profile) return;
    setSaving(true);
    await supabase.from("announcements").insert({ title, content, author_id: profile.id });
    setTitle(""); setContent("");
    await load();
    setSaving(false);
  };

  const deleteAnnouncement = async (id: string) => {
    await supabase.from("announcements").delete().eq("id", id);
    load();
  };

  return (
    <div className="animate-fade-in">
      <div className={styles.pageHeader}>
        <h1>Announcements</h1>
        <p>Publish announcements visible to all employees</p>
      </div>

      <div className={styles.twoCol}>
        <div>
          <div className="glass-panel" style={{ padding: 28 }}>
            <h2 style={{ marginBottom: 20, fontSize: "1rem" }}>Create Announcement</h2>
            <form onSubmit={publish}>
              <div className={styles.formGroup}>
                <label>Title</label>
                <input className="premium-input" value={title} onChange={e => setTitle(e.target.value)} placeholder="Announcement title" required />
              </div>
              <div className={styles.formGroup}>
                <label>Content</label>
                <textarea className="premium-input" value={content} onChange={e => setContent(e.target.value)} placeholder="Write your announcement here..." rows={5} required />
              </div>
              <button type="submit" className={styles.primaryBtn} disabled={saving} style={{ width: "100%" }}>
                {saving ? "Publishing..." : "📢 Publish"}
              </button>
            </form>
          </div>
        </div>

        <div>
          <h2 style={{ marginBottom: 16, fontSize: "1rem" }}>Published</h2>
          <div className="glass-panel">
            {announcements.length === 0 ? (
              <div style={{ padding: 32, textAlign: "center", color: "var(--text-secondary)" }}>No announcements yet.</div>
            ) : announcements.map((a) => (
              <div key={a.id} className={styles.announcementCard}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div className={styles.announcementTitle}>{a.title}</div>
                  <button onClick={() => deleteAnnouncement(a.id)} style={{ background: "none", border: "none", color: "var(--danger)", cursor: "pointer", fontSize: "1rem" }}>🗑</button>
                </div>
                <div className={styles.announcementMeta}>
                  By {(a.profiles as any)?.full_name} · {new Date(a.created_at).toLocaleDateString("en-IN")}
                </div>
                <div className={styles.announcementContent}>{a.content}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
