"use client";

import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import styles from "./dashboard.module.css";

export default function DashboardRedirect() {
  const { profile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && profile) {
      const isAdmin = profile.role === "admin" || profile.role === "superadmin";
      router.replace(isAdmin ? "/dashboard/admin" : "/dashboard/employee");
    }
  }, [profile, loading, router]);

  return (
    <div className={styles.loadingScreen}>
      <div className={styles.spinner}></div>
    </div>
  );
}
