fetch("http://localhost:3000/api/platform-config", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify([
    { key: "desktop_win_url", value: "https://github.com/ccs-hrms-saas/CCS-HRMS-SaaS/releases/download/v1.0.0-kiosk/CCS.HRMS.Kiosk.Setup.1.0.0.exe" }
  ])
}).then(res => res.json()).then(console.log).catch(console.error);
