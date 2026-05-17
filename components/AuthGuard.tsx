"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter, usePathname } from "next/navigation";

export default function AuthGuard({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    async function checkUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user && pathname !== "/login") {
        router.push("/login");
        return;
      }

      setChecking(false);
    }

    checkUser();
  }, [pathname, router]);

  if (pathname === "/login") {
    return <>{children}</>;
  }

  if (checking) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-100">
        <p className="text-slate-600">Checking access...</p>
      </main>
    );
  }

  return <>{children}</>;
}