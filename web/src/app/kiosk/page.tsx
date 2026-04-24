"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Search } from "lucide-react";
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

type Screen = "setup" | "loading" | "main" | "pin" | "camera" | "processing" | "success";

interface SuccessInfo {
  name:   string;
  action: "check_in" | "check_out";
  time:   string;
}

const BASE = "";

const LS_TOKEN = "kiosk_device_token";

function initials(name: string) {
  return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

function fmtTime(d: Date) {
  return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true });
}

function fmtDate(d: Date) {
  return d.toLocaleDateString("en-IN", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

// ── Main Component ──────────────────────────────────────────────────────────
export default function KioskPage() {
  const [screen,    setScreen]    = useState<Screen>("loading");
  const [config,    setConfig]    = useState<KioskConfig | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [search,    setSearch]    = useState("");
  const [selected,  setSelected]  = useState<Employee | null>(null);
  const [success,   setSuccess]   = useState<SuccessInfo | null>(null);
  const [now,       setNow]       = useState(new Date());

  // PIN entry
  const [pin, setPin]         = useState("");
  const [pinError, setPinError] = useState("");

  // Camera
  const videoRef    = useRef<HTMLVideoElement>(null);
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const streamRef   = useRef<MediaStream | null>(null);
  const [countdown, setCountdown] = useState(3);

  // Setup
  const [companyCode, setCompanyCode] = useState("");
  const [setupPin,    setSetupPin]    = useState("");
  const [deviceName,  setDeviceName]  = useState("Kiosk Phone 1");
  const [setupErr,    setSetupErr]    = useState("");
  const [pairing,     setPairing]     = useState(false);

  const searchRef = useRef<HTMLInputElement>(null);

  // ── Clock ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // ── On mount: check stored token ─────────────────────────────────────────
  useEffect(() => {
    const token = localStorage.getItem(LS_TOKEN);
    if (token) validateToken(token);
    else setScreen("setup");
  }, []);

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

  const loadEmployees = useCallback(async (token?: string) => {
    const t = token ?? localStorage.getItem(LS_TOKEN);
    if (!t) return;
    const res  = await fetch(`${BASE}/api/kiosk/employees`, { headers: { "x-device-token": t } });
    const data = await res.json();
    setEmployees(data.employees ?? []);
  }, []);

  useEffect(() => {
    if (screen !== "main") return;
    const t = setInterval(() => loadEmployees(), 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [screen, loadEmployees]);

  useEffect(() => {
    if (screen === "main") searchRef.current?.focus();
  }, [screen]);

  // ── Pairing ───────────────────────────────────────────────────────────────
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

  // ── Select employee → go to PIN screen ───────────────────────────────────
  function selectEmployee(emp: Employee) {
    setSelected(emp);
    setPin("");
    setPinError("");
    setScreen("pin");
  }

  // ── PIN keypad input ──────────────────────────────────────────────────────
  function pressDigit(d: string) {
    if (pin.length >= 4) return;
    const next = pin + d;
    setPin(next);
    setPinError("");
    if (next.length === 4) {
      // Small delay so user sees the 4th dot fill in
      setTimeout(() => openCamera(next), 150);
    }
  }

  function deleteDigit() {
    setPin(p => p.slice(0, -1));
    setPinError("");
  }

  // ── Camera ───────────────────────────────────────────────────────────────
  async function openCamera(enteredPin: string) {
    setScreen("camera");
    setCountdown(3);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) throw new Error("no video element");

      video.srcObject = stream;

      // Wait until video is actually ready to render frames
      await new Promise<void>((resolve, reject) => {
        video.oncanplay  = () => resolve();
        video.onerror    = () => reject(new Error("video error"));
        video.play().catch(reject);
        // Safety timeout — if canplay doesn't fire in 5s, proceed anyway
        setTimeout(resolve, 5000);
      });

      // Now start the 3-second countdown
      let count = 3;
      setCountdown(count);
      const timer = setInterval(() => {
        count--;
        setCountdown(count);
        if (count <= 0) {
          clearInterval(timer);
          captureAndPunch(enteredPin);
        }
      }, 1000);
    } catch {
      // Camera not available / permission denied — punch without photo
      setScreen("processing");
      await submitPunch(enteredPin, null);
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }

  async function captureAndPunch(enteredPin: string) {
    let photo64: string | null = null;
    try {
      const video  = videoRef.current;
      const canvas = canvasRef.current;
      // Only capture if video has real frame data
      if (video && canvas && video.readyState >= 2 && video.videoWidth > 0) {
        canvas.width  = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext("2d")?.drawImage(video, 0, 0);
        photo64 = canvas.toDataURL("image/jpeg", 0.82).split(",")[1];
      }
    } catch { /* ignore capture errors */ }
    stopCamera();
    setScreen("processing");
    await submitPunch(enteredPin, photo64);
  }

  // ── Submit to /api/mark-attendance ────────────────────────────────────────
  async function submitPunch(enteredPin: string, photo64: string | null) {
    if (!selected) { goMain(); return; }
    try {
      const body: any = { user_id: selected.id, pin: enteredPin };
      if (photo64) body.photo_base64 = photo64;

      const res  = await fetch(`${BASE}/api/mark-attendance`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });
      const data = await res.json();

      if (!res.ok) {
        // Wrong PIN or other error — go back to PIN screen
        setPin("");
        setPinError(data.error ?? "Invalid PIN. Try again.");
        stopCamera();
        setScreen("pin");
        return;
      }

      setSuccess({
        name:   selected.full_name,
        action: data.action,
        time:   fmtTime(new Date()),
      });
      setScreen("success");
      setTimeout(() => {
        setSuccess(null);
        goMain();
      }, 3500);
    } catch {
      setPin("");
      setPinError("Network error. Please try again.");
      stopCamera();
      setScreen("pin");
    }
  }

  function goMain() {
    stopCamera();
    setSelected(null);
    setPin("");
    setPinError("");
    setSearch("");
    setScreen("main");
  }

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

  // ── RENDER: Setup ─────────────────────────────────────────────────────────
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
                placeholder="e.g. acmecorp" autoCapitalize="none" />
            </div>
            <div className={s.setupField}>
              <label className={s.setupLabel}>Setup PIN (from admin panel)</label>
              <input className={s.setupInput} value={setupPin} type="password"
                onChange={e => setSetupPin(e.target.value)} placeholder="• • • • • •" />
            </div>
            <div className={s.setupField}>
              <label className={s.setupLabel}>Device Name</label>
              <input className={s.setupInput} value={deviceName}
                onChange={e => setDeviceName(e.target.value)} placeholder="Kiosk Phone 1" />
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

  // ── RENDER: PIN entry ─────────────────────────────────────────────────────
  if (screen === "pin" && selected) {
    return (
      <div className={s.kiosk}>
        <div className={s.pinScreen}>
          {/* Employee avatar */}
          <div className={s.pinAvatar}>
            {config?.show_employee_photo && selected.avatar_url
              ? <img src={selected.avatar_url} alt={selected.full_name} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "inherit" }} />
              : initials(selected.full_name)}
          </div>
          <div className={s.pinName}>{selected.full_name}</div>
          <div className={s.pinLabel}>Enter your 4-digit attendance PIN</div>
          <div className={s.pinHint}>Open your Employee Portal to see your PIN</div>

          {/* PIN dots */}
          <div className={s.pinDots}>
            {[0,1,2,3].map(i => (
              <div key={i} className={`${s.pinDot} ${pin.length > i ? s.pinDotFilled : ""}`} />
            ))}
          </div>

          {pinError && <div className={s.pinError}>{pinError}</div>}

          {/* Numpad */}
          <div className={s.numpad}>
            {["1","2","3","4","5","6","7","8","9"].map(d => (
              <button key={d} className={s.numKey} onClick={() => pressDigit(d)}>{d}</button>
            ))}
            <button className={s.numKey} onClick={goMain} style={{ color: "#475569", fontSize: "0.75rem" }}>Cancel</button>
            <button className={s.numKey} onClick={() => pressDigit("0")}>0</button>
            <button className={s.numKey} onClick={deleteDigit} style={{ fontSize: "1.3rem" }}>⌫</button>
          </div>
        </div>
      </div>
    );
  }

  // ── RENDER: Camera countdown ──────────────────────────────────────────────
  if (screen === "camera") {
    return (
      <div className={s.kiosk}>
        <div className={s.cameraScreen}>
          <video ref={videoRef} className={s.cameraVideo} autoPlay playsInline muted />
          <canvas ref={canvasRef} style={{ display: "none" }} />
          <div className={s.cameraOverlay}>
            <div className={s.cameraName}>{selected?.full_name}</div>
            <div className={s.cameraCountdown}>{countdown}</div>
            <div className={s.cameraHint}>Hold still…</div>
          </div>
        </div>
      </div>
    );
  }

  // ── RENDER: Processing ────────────────────────────────────────────────────
  if (screen === "processing") {
    return (
      <div className={s.kiosk}>
        <div className={s.loadingScreen}>
          <div className={s.spinner} />
          <div>Recording attendance…</div>
        </div>
      </div>
    );
  }

  // ── RENDER: Main employee grid ────────────────────────────────────────────
  return (
    <div className={s.kiosk}>
      {/* Success overlay */}
      {success && (
        <div className={s.successOverlay}>
          <div className={s.successIcon}>{success.action === "check_in" ? "✅" : "👋"}</div>
          <div className={s.successName}>{success.name}</div>
          <div className={s.successAction} style={{ color: success.action === "check_in" ? "#34d399" : "#f87171" }}>
            {success.action === "check_in" ? "Clocked In" : "Clocked Out"} Successfully
          </div>
          <div className={s.successTime}>at {success.time}</div>
        </div>
      )}

      {/* Header */}
      <div className={s.header}>
        <div className={s.headerLeft}>
          {config?.company_logo
            ? <img src={config.company_logo} alt="Logo" className={s.companyLogo} />
            : <div className={s.companyName}>{config?.company_name ?? "CCS HRMS"}</div>}
        </div>
        <div className={s.headerTime}>
          <div className={s.clockTime}>{fmtTime(now)}</div>
          <div className={s.clockDate}>{fmtDate(now)}</div>
        </div>
      </div>

      {/* Body */}
      <div className={s.body}>
        <div className={s.searchPanel}>
          <div className={s.searchWrap}>
            <Search className={s.searchIcon} size={18} />
            <input
              ref={searchRef}
              className={s.searchInput}
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search employee name…"
            />
          </div>
          <div className={s.employeeGrid}>
            {filtered.length === 0 && (
              <div style={{ gridColumn: "1/-1", textAlign: "center", color: "#334155", paddingTop: 40, fontSize: "0.88rem" }}>
                No employees found
              </div>
            )}
            {filtered.map(emp => (
              <div key={emp.id} className={s.employeeCard} onClick={() => selectEmployee(emp)}>
                {config?.show_employee_photo && emp.avatar_url
                  ? <img src={emp.avatar_url} alt={emp.full_name} className={s.employeeAvatar} />
                  : <div className={s.employeeAvatarInitials}>{initials(emp.full_name)}</div>}
                <div className={s.employeeName}>{emp.full_name}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
