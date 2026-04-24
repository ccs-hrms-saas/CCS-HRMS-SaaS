/**
 * Kiosk Layout
 *
 * The kiosk page is a standalone fullscreen app — it must NOT render
 * inside the regular app shell (Sidebar, nav, etc.).
 *
 * This layout simply renders {children} directly with a fullscreen body,
 * bypassing the root layout's tenant-aware providers.
 */
export const metadata = {
  title: "CCS HRMS Kiosk",
  description: "Attendance kiosk for CCS HRMS",
  viewport: "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover",
  themeColor: "#060810",
};

export default function KioskLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      width:     "100vw",
      height:    "100vh",
      margin:    0,
      padding:   0,
      overflow:  "hidden",
      background:"#060810",
    }}>
      {children}
    </div>
  );
}
