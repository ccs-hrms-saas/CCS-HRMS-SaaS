import { CapacitorConfig } from '@capacitor/cli';

/**
 * Kiosk APK — Capacitor Config
 *
 * This config packages the kiosk attendance page as a dedicated tablet APK.
 * It opens directly to the /kiosk setup page, runs fullscreen in landscape,
 * and hides all browser navigation controls.
 *
 * To build this APK separately:
 *   CAPACITOR_CONFIG=kiosk npx cap sync android-kiosk
 *   (then build in Android Studio using the android-kiosk project)
 *
 * OR simply copy this file over capacitor.config.ts before each kiosk build.
 *
 * Output: ccshrms-kiosk.apk
 */
const config: CapacitorConfig = {
  appId:   'com.ccshrms.kiosk',
  appName: 'CCS HRMS Kiosk',
  server: {
    url:             'https://ccs-hrms-saas.vercel.app/kiosk',  // Opens directly to kiosk page
    cleartext:        false,
    allowNavigation: ['*.supabase.co', '*.vercel.app', '*.ccshrms.com'],
  },
  android: {
    buildOptions: {
      releaseType: 'APK',
    },
    allowMixedContent:            false,
    // Kiosk mode — lock the app to the screen
    captureInput:                 true,
    webContentsDebuggingEnabled:  false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration:    1500,
      backgroundColor:       '#060810',
      showSpinner:           false,
    },
    StatusBar: {
      style:           'dark',
      backgroundColor: '#060810',
      overlaysWebView: true,  // Full bleed on tablet
    },
  },
};

export default config;
