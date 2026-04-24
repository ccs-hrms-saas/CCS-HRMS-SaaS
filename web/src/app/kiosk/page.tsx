"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Search, LogIn, LogOut, Clock } from "lucide-react";
import s from "./kiosk.module.css";

// ── Types ──────────────────────────────────────────────────────────────────
interface KioskConfig {
  company_name:        string;
  company_logo:        string | null;
  show_employee_photo: boolean;
}

interface Employee {
  id:         string;
  full_name:  string;
  role:       string;
  avatar_url: string | null;
}

type Screen = "setup" | "loading" | "main";

const BASE = ""; // same-origin API calls

// ── Kiosk Storage keys ─────────────────────────────────────────────────────
const LS_TOKEN = "kiosk_device_token";
const LS_NAME  = "kiosk_company_name";
const LS_LOGO  = "kiosk_company_logo";

// ── Helpers ────────────────────────────────────────────────────────────────
function initials(name: string) {
  return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

function fmtTime(d: Date) {
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function fmtDate(d: Date) {
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

// ── Main Component ──────────────────────────────────────────────────────────
export default function KioskPage() {
  const [screen,    setScreen]    = useState<Screen>("loading");
  const [config,    setConfig]    = useState<KioskConfig | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [search,    setSearch]    = useState("");
  const [selected,  setSelected]  = useState<Employee | null>(null);
  const [success,   setSuccess]   = useState<{ name: string; action: string; time: string } | null>(null);
  const [punching,  setPunching]  = useState(false);
  const [now,       setNow]       = useState(new Date());

  // Setup form
  const [companyCode, setCompanyCode] = useState("");
  const [setupPin,    setSetupPin]    = useState("");
  const [deviceName,  setDeviceName]  = useState("Kiosk Tablet 1");
  const [setupErr,    setSetupErr]    = useState("");
  const [pairing,     setPairing]     = useState(false);

  const searchRef = useRef<HTMLInputElement>(null);

  // ── Clock ticker ──────────────────────────────────────────────────────────
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // ── On mount: check for stored device token ───────────────────────────────
  useEffect(() => {
    const token = localStorage.getItem(LS_TOKEN);
    if (token) {
      validateToken(token);
    } else {
      setScreen("setup");
    }
  }, []);

  // ── Validate stored token with /api/kiosk/config ──────────────────────────
  async function validateToken(token: string) {
    setScreen("loading");
    try {
      const res  = await fetch(`${BASE}/api/kiosk/config`, { headers: { "x-device-token": token } });
      const data = await res.json();
      if (!res.ok || !data.company_active) {
        localStorage.removeItem(LS_TOKEN);
        setScreen("setup");
        return;
      }
      setConfig({
        company_name:        data.company_name,
        company_logo:        data.company_logo,
        show_employee_photo: data.show_employee_photo ?? true,
      });
      await loadEmployees(token);
      setScreen("main");
    } catch {
      localStorage.removeItem(LS_TOKEN);
      setScreen("setup");
    }
  }

  // ── Load employee list ────────────────────────────────────────────────────
  const loadEmployees = useCallback(async (token?: string) => {
    const t = token ?? localStorage.getItem(LS_TOKEN);
    if (!t) return;
    const res  = await fetch(`${BASE}/api/kiosk/employees`, { headers: { "x-device-token": t } });
    const data = await res.json();
    setEmployees(data.employees ?? []);
  }, []);

  // ── Re-fetch employee list every 5 minutes ────────────────────────────────
  useEffect(() => {
    if (screen !== "main") return;
    const t = setInterval(() => loadEmployees(), 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [screen, loadEmployees]);

  // ── Auto-focus search when screen = main ─────────────────────────────────
  useEffect(() => {
    if (screen === "main") searchRef.current?.focus();
  }, [screen]);

  // ── Pair device (setup form submit) ──────────────────────────────────────
  async function pairDevice() {
    setSetupErr("");
    if (!companyCode.trim() || !setupPin.trim()) {
      setSetupErr("Both company code and setup PIN are required.");
      return;
    }
    setPairing(true);
    try {
      const res = await fetch(`${BASE}/api/kiosk/register`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ company_code: companyCode.trim().toLowerCase(), setup_pin: setupPin.trim(), device_name: deviceName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Pairing failed");
      localStorage.setItem(LS_TOKEN, data.device_token);
      await validateToken(data.device_token);
    } catch (e: any) {
      setSetupErr(e.message);
    } finally {
      setPairing(false);
    }
  }

  // ── Punch in/out ──────────────────────────────────────────────────────────
  async function punch(action: "in" | "out") {
    if (!selected || punching) return;
    setPunching(true);
    try {
      const token = localStorage.getItem(LS_TOKEN) ?? "";
      const res = await fetch(`${BASE}/api/kiosk/punch`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", "x-device-token": token },
        body:    JSON.stringify({ employee_id: selected.id, action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Punch failed");
      setSuccess({
        name:   selected.full_name,
        action: action === "in" ? "Clocked In" : "Clocked Out",
        time:   fmtTime(new Date()),
      });
      setSelected(null);
      setSearch("");
      setTimeout(() => { setSuccess(null); searchRef.current?.focus(); }, 3500);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setPunching(false);
    }
  }

  // ── Filtered employees ────────────────────────────────────────────────────
  const filtered = employees.filter(e =>
    e.full_name.toLowerCase().includes(search.toLowerCase())
  );

  // ── RENDER: Loading ───────────────────────────────────────────────────────
  if (screen === "loading") {
    return (
      <div className={s.kiosk}>
        <div className={s.loadingScreen}>
          <div className={s.spinner} />
          <div>Connecting to CCS HRMS…</div>
        </div>
      </div>
    );
  }

  // ── RENDER: Setup / Pairing ───────────────────────────────────────────────
  if (screen === "setup") {
    return (
      <div className={s.kiosk}>
        <div className={s.setupScreen}>
          <div className={s.setupCard}>
            <div className={s.setupLogo}>CCS HRMS</div>
            <div className={s.setupTagline}>Kiosk Attendance System</div>
            <div className={s.setupTitle}>Pair this device to your workspace</div>

            <div className={s.setupField}>
              <label className={s.setupLabel}>Company Code (subdomain)</label>
              <input className={s.setupInput} value={companyCode}
                onChange={e => setCompanyCode(e.target.value)}
                placeholder="e.g. acmecorp"
                autoCapitalize="none"
              />
            </div>
            <div className={s.setupField}>
              <label className={s.setupLabel}>Setup PIN (from admin panel)</label>
              <input className={s.setupInput} value={setupPin} type="password"
                onChange={e => setSetupPin(e.target.value)}
                placeholder="• • • • • •"
              />
            </div>
            <div className={s.setupField}>
              <label className={s.setupLabel}>Device Name</label>
              <input className={s.setupInput} value={deviceName}
                onChange={e => setDeviceName(e.target.value)}
                placeholder="Kiosk Tablet 1"
              />
            </div>

            <button className={s.setupBtn} onClick={pairDevice}
              disabled={pairing || !companyCode || !setupPin}>
              {pairing ? "Pairing…" : "Pair Device"}
            </button>
            {setupErr && <div className={s.setupErr}>⚠️ {setupErr}</div>}
          </div>
        </div>
      </div>
    );
  }

  // ── RENDER: Main kiosk UI ─────────────────────────────────────────────────
  return (
    <div className={s.kiosk}>
      {/* Success overlay */}
      {success && (
        <div className={s.successOverlay}>
          <div className={s.successIcon}>{success.action === "Clocked In" ? "✅" : "👋"}</div>
          <div className={s.successName}>{success.name}</div>
          <div className={s.successAction} style={{ color: success.action === "Clocked In" ? "#34d399" : "#f87171" }}>
            {success.action} Successfully
          </div>
          <div className={s.successTime}>at {success.time}</div>
        </div>
      )}

      {/* Header */}
      <div className={s.header}>
        <div className={s.headerLeft}>
          {config?.company_logo ? (
            <img src={config.company_logo} alt="Logo" className={s.companyLogo} />
          ) : (
            <div className={s.companyName}>{config?.company_name ?? "CCS HRMS"}</div>
          )}
        </div>
        <div className={s.headerTime}>
          <div className={s.clockTime}>{fmtTime(now)}</div>
          <div className={s.clockDate}>{fmtDate(now)}</div>
        </div>
      </div>

      {/* Body */}
      <div className={s.body}>
        {/* Left — Employee Search */}
        <div className={s.searchPanel}>
          <div className={s.searchWrap}>
            <Search className={s.searchIcon} size={20} />
            <input
              ref={searchRef}
              className={s.searchInput}
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search employee name…"
            />
          </div>
          <div className={s.employeeGrid}>
            {filtered.map(emp => (
              <div
                key={emp.id}
                className={`${s.employeeCard} ${selected?.id === emp.id ? s.selected : ""}`}
                onClick={() => setSelected(emp)}
              >
                {config?.show_employee_photo && emp.avatar_url ? (
                  <img src={emp.avatar_url} alt={emp.full_name} className={s.employeeAvatar} />
                ) : (
                  <div className={s.employeeAvatarInitials}>{initials(emp.full_name)}</div>
                )}
                <div className={s.employeeName}>{emp.full_name}</div>
                <div className={s.employeeRole}>{emp.role}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Right/Bottom — Action Panel */}
        <div className={`${s.actionPanel} ${!selected ? s.empty : ""}`}>
          {!selected ? (
            <div className={s.actionPrompt}>
              <div className={s.actionPromptIcon}>👆</div>
              <div className={s.actionPromptText}>Select an employee<br />to clock in or out</div>
            </div>
          ) : (
            <>
              <div className={s.selectedProfile}>
                <div className={s.selectedAvatarLarge}>
                  {config?.show_employee_photo && selected.avatar_url
                    ? <img src={selected.avatar_url} alt={selected.full_name} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "inherit" }} />
                    : initials(selected.full_name)}
                </div>
                <div>
                  <div className={s.selectedName}>{selected.full_name}</div>
                  <div className={s.selectedRole}>{selected.role}</div>
                </div>
              </div>

              <div className={s.punchBtns}>
                <button className={s.punchInBtn} onClick={() => punch("in")} disabled={punching}>
                  <LogIn size={20} />
                  {punching ? "…" : "Clock In"}
                </button>
                <button className={s.punchOutBtn} onClick={() => punch("out")} disabled={punching}>
                  <LogOut size={20} />
                  {punching ? "…" : "Clock Out"}
                </button>
                <div className={s.cancelBtnRow}>
                  <button className={s.cancelBtn} onClick={() => { setSelected(null); setSearch(""); }}>
                    Cancel
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
