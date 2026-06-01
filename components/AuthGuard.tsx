"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter, usePathname } from "next/navigation";

const routePermissions: Record<string, string[]> = {
  "/": ["super_admin", "admin", "clinical_staff", "doctor", "auditor"],
  "/cycles": ["super_admin", "admin", "clinical_staff"],
  "/packs": ["super_admin", "admin", "clinical_staff"],
  "/patients": ["super_admin", "admin", "clinical_staff", "doctor"],
  "/patients/import": ["super_admin"],
  "/patient-history": [
    "super_admin",
    "admin",
    "clinical_staff",
    "doctor",
    "auditor",
  ],
  "/reports": ["super_admin", "admin", "doctor", "auditor"],
  "/investigation": ["super_admin", "admin", "doctor", "auditor"],
  "/settings": ["super_admin", "admin"],
  "/audit-logs": ["super_admin", "admin", "auditor"],
};

export default function AuthGuard({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    async function checkAccess() {
      setChecking(true);
      setAllowed(false);

      if (pathname === "/login") {
        setAllowed(true);
        setChecking(false);
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user?.email) {
        router.push("/login");
        setChecking(false);
        return;
      }

      const { data: roleData, error } = await supabase
        .from("user_roles")
        .select("role, active")
        .eq("user_email", user.email)
        .maybeSingle();

      if (error || !roleData?.active) {
        await supabase.auth.signOut();
        router.push("/login");
        setChecking(false);
        return;
      }

      const userRole = roleData.role || "";
      const allowedRoles = routePermissions[pathname] || [];

      if (!allowedRoles.includes(userRole)) {
        router.push("/");
        setChecking(false);
        return;
      }

      setAllowed(true);
      setChecking(false);
    }

    checkAccess();
  }, [pathname, router]);

  if (checking) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-100">
        <p className="text-slate-600">Checking access...</p>
      </main>
    );
  }

  if (!allowed) {
    return null;
  }

  return <>{children}</>;
}