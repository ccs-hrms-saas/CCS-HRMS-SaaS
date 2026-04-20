# CCS HRMS — Android APK Build Guide

> Two APKs are produced from this project:
> - **`ccshrms-employee.apk`** — Full employee & admin portal
> - **`ccshrms-kiosk.apk`** — Tablet kiosk for attendance punch-in

---

## Prerequisites (one-time setup)

Install on your Mac:

```bash
# 1. Node.js (if not already installed)
brew install node

# 2. Android Studio — download from https://developer.android.com/studio
# After installing, open Android Studio → SDK Manager → install:
#   - Android SDK Platform 34 (Android 14)
#   - Android SDK Build-Tools 34.x.x

# 3. Set ANDROID_HOME in ~/.zshrc
echo 'export ANDROID_HOME=$HOME/Library/Android/sdk' >> ~/.zshrc
echo 'export PATH=$PATH:$ANDROID_HOME/tools:$ANDROID_HOME/platform-tools' >> ~/.zshrc
source ~/.zshrc

# 4. Java (required by Android build tools)
brew install --cask temurin  # or install via Android Studio
```

---

## Install Capacitor (one-time, in /web directory)

```bash
cd /Users/dc/CCS-HRMS-SaaS/web
npm install @capacitor/core @capacitor/cli @capacitor/android @capacitor/splash-screen @capacitor/status-bar
```

---

## Build 1 — Employee Mobile App (`ccshrms-employee.apk`)

### Step 1 — Verify `capacitor.config.ts` server URL points to your deployment

```ts
// capacitor.config.ts
server: {
  url: 'https://ccs-hrms-saas.vercel.app',  // ← your Vercel URL
}
```

### Step 2 — Initialise & sync the Android project

```bash
cd /Users/dc/CCS-HRMS-SaaS/web

# First time only — creates the android/ directory
npx cap add android

# Every time (syncs config & plugins)
npx cap sync android
```

### Step 3 — Open in Android Studio and build

```bash
npx cap open android
```

Inside Android Studio:
1. Wait for Gradle sync to finish
2. **Build → Generate Signed Bundle / APK**
3. Choose **APK** (not Bundle, unless targeting Play Store)
4. Create or select a keystore file (keep it safe!)
5. Build variant: **release**
6. Output: `android/app/release/app-release.apk`

### Step 4 — Rename and distribute

```bash
cp android/app/release/app-release.apk ~/Desktop/ccshrms-employee.apk
```

---

## Build 2 — Kiosk APK (`ccshrms-kiosk.apk`)

The Kiosk APK uses a different Capacitor config. Swap it before building.

### Step 1 — Swap config

```bash
cd /Users/dc/CCS-HRMS-SaaS/web
cp capacitor.config.ts capacitor.config.employee.ts  # backup
cp capacitor.kiosk.config.ts capacitor.config.ts     # activate kiosk config
```

### Step 2 — Update the Kiosk config URL with your actual deployment URL

In `capacitor.config.ts` (currently kiosk config):
```ts
server: {
  url: 'https://ccs-hrms-saas.vercel.app/kiosk',  // ← confirm URL
}
```

### Step 3 — Sync and build

```bash
npx cap sync android
npx cap open android
# → Build → Generate Signed APK (use the SAME keystore as employee app)
```

### Step 4 — Rename and restore

```bash
cp android/app/release/app-release.apk ~/Desktop/ccshrms-kiosk.apk
# Restore employee config
cp capacitor.config.employee.ts capacitor.config.ts
```

---

## Kiosk APK — First-Time Tablet Setup

When the Kiosk APK is installed on an Android tablet:

1. Open the app → **Setup / Pairing screen** appears
2. Enter the **Company Code** (subdomain, e.g. `acmecorp`)
3. Enter the **Setup PIN** (generate from Developer Panel → Tenant → Mobile & Kiosk tab → Kiosk section)
4. Enter a **Device Name** (e.g. `Reception Kiosk`)
5. Tap **Pair Device** → device registers and stores a device token
6. App loads the kiosk UI — employee grid appears

> The PIN is stored encrypted in `company_modules.properties.setup_pin`.
> Regenerating the PIN does NOT disconnect already-paired devices.

### Lock the tablet to kiosk mode (Android)

To prevent employees from exiting the app:

1. Go to **Settings → Security → Screen pinning**
2. Enable screen pinning
3. Open the Kiosk APK
4. Tap Recent Apps → tap the pin icon on the CCS HRMS Kiosk card
5. The back and home buttons are now disabled

For fully managed devices (MDM), set the kiosk app as the device owner using:
```bash
adb shell dpm set-device-owner com.ccshrms.kiosk/.AdminReceiver
```

---

## Employee APK — Per-Tenant Authentication

The Employee APK loads the full web portal. Employees:

1. Open the app → routed to `/login`
2. Enter their company email and password (same credentials as web)
3. The middleware resolves their tenant from their Supabase session
4. They see their company's customised dashboard

> The module system applies — if a module is disabled for their company,
> the nav item is hidden automatically (same as web).

---

## Updating the APKs

Since both APKs use **remote URL mode** (WebView pointing to Vercel):

- **Web app updates** (new features, bug fixes) → deploy to Vercel → both APKs update automatically on next launch. **No APK rebuild needed.**
- **APK rebuild required** only when:
  - Changing the `appId`, `appName`, or `server.url` in Capacitor config
  - Adding new native Capacitor plugins (camera, biometrics, push notifications)
  - Updating the splash screen or app icon

---

## Adding Native Plugins (future)

```bash
# Biometric authentication (Employee APK)
npm install @capacitor/biometric-auth

# Push notifications
npm install @capacitor/push-notifications

# Camera (for profile photo or QR code)
npm install @capacitor/camera

# After installing any plugin:
npx cap sync android
```

---

## App Icons & Splash Screen

Place these files in `android/app/src/main/res/`:

| File | Size | Usage |
|---|---|---|
| `mipmap-xxxhdpi/ic_launcher.png` | 192×192 | App icon |
| `mipmap-xxhdpi/ic_launcher.png` | 144×144 | App icon |
| `drawable/splash.png` | 1280×1920 | Splash screen |

Run after updating:
```bash
npx cap sync android
```

---

## Deployment Checklist

- [ ] Vercel deployment URL confirmed in both `capacitor.config.ts` files  
- [ ] Kiosk module enabled for the tenant (Developer Panel → Tenant → Modules)
- [ ] Setup PIN generated (Developer Panel → Tenant → Mobile & Kiosk)
- [ ] Employee APK signed with release keystore
- [ ] Kiosk APK signed with same keystore
- [ ] Kiosk tablet tested with screen pinning
- [ ] Employee APK tested with company login
