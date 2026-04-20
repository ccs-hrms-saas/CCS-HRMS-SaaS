import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import { AppSettingsProvider } from "@/context/AppSettingsContext";

export const metadata: Metadata = {
  title: "CCS-HRMS SaaS",
  description: "HR & Attendance Management System",
  manifest: "/manifest.json",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Read the tenant host injected by our new Edge Middleware
  const headersList = await headers();
  const tenantHost = headersList.get('x-tenant-host') || 'demo.lookbook-connect.com';

  return (
    <html lang="en">
      <body>
        <AuthProvider>
          {/* We pass the tenantHost to the client-side provider so it pulls the correct company branding */}
          <AppSettingsProvider tenantHost={tenantHost}>
            {children}
          </AppSettingsProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
