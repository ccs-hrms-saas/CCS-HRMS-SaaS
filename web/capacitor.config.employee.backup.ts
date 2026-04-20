import { CapacitorConfig } from '@capacitor/cli';

/**
 * Employee Mobile App — Capacitor Config
 *
 * This config wraps the full employee/admin web portal as an Android APK.
 * The app loads the live Vercel deployment via a remote URL (no static export
 * needed). Changes to the web app automatically reflect in the APK on next launch.
 *
 * Build command:
 *   npx cap sync android && npx cap open android
 *   (then Build → Generate Signed Bundle/APK in Android Studio)
 *
 * Output: ccshrms-employee.apk
 */
const config: CapacitorConfig = {
  appId:   'com.ccshrms.employee',
  appName: 'CCS HRMS',
  // Remote URL mode — loads the live deployment, no local build needed
  server: {
    url:             'https://ccs-hrms-saas.vercel.app',  // ← update when custom domain is live
    cleartext:        false,
    allowNavigation: ['*.supabase.co', '*.vercel.app', '*.ccshrms.com'],
  },
  android: {
    buildOptions: {
      releaseType: 'APK',
    },
    // Prevent screenshot capture (security for payslip data)
    allowMixedContent: false,
    captureInput:      true,
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration:    2000,
      backgroundColor:       '#060810',
      androidSplashResourceName: 'splash',
      showSpinner:           false,
    },
    StatusBar: {
      style:           'dark',
      backgroundColor: '#060810',
    },
  },
};

export default config;
