"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter, usePathname } from "next/navigation";

const routePermissions: Record<string, string[]> = {
  "/": ["admin", "clinical_staff", "doctor", "auditor"],
  "/cycles": ["admin", "clinical_staff"],
  "/packs": ["admin", "clinical_staff"],
  "/patients": ["admin", "clinical_staff", "doctor"],
  "/reports": ["admin", "doctor", "auditor"],
  "/investigation": ["admin", "doctor", "auditor"],
  "/settings": ["admin"],
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
        return;
      }

      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_email", user.email)
        .maybeSingle();

      const userRole = roleData?.role || "";

      const allowedRoles = routePermissions[pathname] || [];

      if (!allowedRoles.includes(userRole)) {
        router.push("/");
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