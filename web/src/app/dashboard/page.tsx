"use client";

import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import styles from "./dashboard.module.css";

export default function DashboardRedirect() {
  const { profile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      if (profile) {
        if (profile.system_role === "platform_owner") {
          router.replace("/developer");
        } else {
          const isAdmin = profile.role === "admin" || profile.role === "superadmin";
          router.replace(isAdmin ? "/dashboard/admin" : "/dashboard/employee");
        }
      } else {
        // If there's no profile but authentication successfully loaded, redirect to an onboarding or error step.
        // For now, we'll force them into the employee dashboard which will eventually display an error, or just push to /developer
        router.replace("/developer");
      }
    }
  }, [profile, loading, router]);

  return (
    <div className={styles.loadingScreen}>
      <div className={styles.spinner}></div>
    </div>
  );
}
