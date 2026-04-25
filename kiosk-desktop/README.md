# CCS HRMS — Desktop Kiosk App

Electron-based desktop attendance kiosk for **Windows** and **macOS**.  
Same functionality as the Android APK — paired to your tenant, PIN + camera punch.

---

## Quick Start (Development)

```bash
cd kiosk-desktop
npm install
npm run dev         # Opens in a resizable window with DevTools
```

## Build Installers

```bash
# macOS — produces .dmg in dist/
npm run build:mac

# Windows — produces .exe (NSIS installer) in dist/
npm run build:win

# Both at once
npm run build
```

---

## Setup Flow (First Launch)

1. Launch the app
2. Enter:
   - **Company Code** → your subdomain (e.g. `radiance`)
   - **API Server URL** → `https://www.ccshrms.com` (default)
   - **Setup PIN** → set in Developer → Tenant → Kiosk tab
   - **Device Name** → `Reception Desk`, `Main Entrance`, etc.
3. Click **Pair Device** → device token saved locally

---

## Employee Attendance Flow

```
Home (employee grid)
  → Tap employee name
  → Enter 4-digit rotating PIN
  → Camera countdown (3-2-1 → auto-capture)
  → Checked In / Checked Out ✅
  → Returns to home in 3 seconds
```

---

## Admin Exit

Three ways to open the Admin Exit overlay:
1. Click the **⚙** gear icon in the top-right (3 clicks)
2. Press **Ctrl+Shift+Q** (Windows) or **Cmd+Shift+Q** (Mac)
3. Click the live clock 5 times rapidly

Default admin exit PIN: `9999` (change `ADMIN_EXIT_PIN` in `renderer/app.js`)

---

## Adding App Icons (for Production Build)

Place icons in `assets/`:
- `icon.icns` — macOS (512×512 minimum)
- `icon.ico` — Windows (256×256 minimum)  
- `icon.png` — Linux (512×512)

Generate from a single PNG at https://www.electronjs.org/docs/latest/tutorial/application-distribution

---

## Architecture

```
kiosk-desktop/
  main.js          — Electron main process (window, shortcuts, IPC)
  preload.js       — Context bridge (exposes kiosk.quit() to renderer)
  renderer/
    index.html     — All screen HTML (setup/home/pin/camera/success)
    styles.css     — Premium dark UI styles
    app.js         — Full state machine + API calls
  assets/          — App icons for packaging
```

APIs used (same as Android kiosk):
- `POST /api/kiosk/register` — pair device
- `GET  /api/kiosk/config`   — validate + company info
- `GET  /api/kiosk/employees` — employee list
- `POST /api/mark-attendance` — PIN verify + record punch + upload photo
