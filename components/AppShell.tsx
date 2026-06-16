"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import toast from "react-hot-toast";
import SteriAssistantWidget from "./SteriAssistantWidget";
import { supabase } from "@/lib/supabase";
import AuthGuard from "@/components/AuthGuard";

const navItems = [
  {
    label: "Dashboard",
    href: "/",
    roles: ["super_admin", "admin", "clinical_staff", "doctor", "auditor"],
  },
  {
    label: "Sterilization Cycles",
    href: "/cycles",
    roles: ["super_admin", "admin", "clinical_staff"],
  },
  {
    label: "Instrument Packs",
    href: "/packs",
    roles: ["super_admin", "admin", "clinical_staff"],
  },
  {
    label: "Patient Traceability",
    href: "/patients",
    roles: ["super_admin", "admin", "clinical_staff", "doctor"],
  },
  {
    label: "Patient History",
    href: "/patient-history",
    roles: ["super_admin", "admin", "clinical_staff", "doctor", "auditor"],
  },
  {
    label: "Reports",
    href: "/reports",
    roles: ["super_admin", "admin", "doctor", "auditor"],
  },
  {
    label: "Investigation",
    href: "/investigation",
    roles: ["super_admin", "admin", "doctor", "auditor"],
  },
  {
    label: "Audit Logs",
    href: "/audit-logs",
    roles: ["super_admin", "admin", "auditor"],
  },
  {
    label: "Settings",
    href: "/settings",
    roles: ["super_admin", "admin"],
  },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const isLoginPage = pathname === "/login";
  const isAssistantPage = pathname === "/assistant";

  const [userEmail, setUserEmail] = useState("");
  const [userRole, setUserRole] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [assistantData, setAssistantData] = useState({
    overdueCycles: 0,
    failedCycles: 0,
    openInvestigations: 0,
    expiredPacks: 0,
    expiringSoonPacks: 0,
    availablePacks: 0,
  });

  useEffect(() => {
    async function loadUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user?.email) {
        setUserEmail(user.email);

        const { data: roleData } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_email", user.email)
          .maybeSingle();

        if (roleData?.role) {
          setUserRole(roleData.role);
        }
      }
    }

    if (!isLoginPage && !isAssistantPage) {
      loadUser();
    }
  }, [isLoginPage, isAssistantPage]);

  useEffect(() => {
    if (isLoginPage || isAssistantPage) return;

    fetchAssistantData();

    const interval = setInterval(() => {
      fetchAssistantData();
    }, 60000);

    return () => clearInterval(interval);
  }, [isLoginPage, isAssistantPage]);

  async function fetchAssistantData() {
    const now = new Date();
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    const { count: overdueCycles } = await supabase
      .from("cycles")
      .select("*", { count: "exact", head: true })
      .eq("status", "Pending")
      .lt("expected_finish_at", now.toISOString());

    const { count: failedCycles } = await supabase
      .from("cycles")
      .select("*", { count: "exact", head: true })
      .eq("status", "Failed")
      .is("reviewed_at", null);

    const { count: openInvestigations } = await supabase
      .from("cycles")
      .select("*", { count: "exact", head: true })
      .in("investigation_status", ["Open", "In Review"]);

    const { count: expiredPacks } = await supabase
  .from("packs")
  .select("*", { count: "exact", head: true })
  .lt("expires_at", now.toISOString())
  .neq("status", "Used")
  .or("expired_reviewed.is.null,expired_reviewed.eq.false");

    const { count: expiringSoonPacks } = await supabase
      .from("packs")
      .select("*", { count: "exact", head: true })
      .gte("expires_at", now.toISOString())
      .lte("expires_at", thirtyDaysFromNow.toISOString())
      .neq("status", "Used");

    const { count: availablePacks } = await supabase
      .from("packs")
      .select("*", { count: "exact", head: true })
      .eq("status", "Available");

    setAssistantData({
      overdueCycles: overdueCycles || 0,
      failedCycles: failedCycles || 0,
      openInvestigations: openInvestigations || 0,
      expiredPacks: expiredPacks || 0,
      expiringSoonPacks: expiringSoonPacks || 0,
      availablePacks: availablePacks || 0,
    });
  }

  async function logout() {
    await supabase.auth.signOut();
    toast.success("Logged out successfully.");
    router.push("/login");
  }

  if (isLoginPage) {
    return <>{children}</>;
  }

  if (isAssistantPage) {
    return (
      <AuthGuard>
        <div className="min-h-screen bg-slate-100 text-slate-950">
          {children}
        </div>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <div className="min-h-screen bg-slate-100 text-slate-950 flex">
        <div className="md:hidden fixed top-0 left-0 right-0 z-50 bg-slate-950 text-white p-4 flex items-center justify-between">
          <h1 className="text-xl font-bold">SteriSphere</h1>

          <button
            type="button"
            onClick={() => setMobileMenuOpen((current) => !current)}
            className="rounded-lg bg-white/10 px-4 py-2 min-h-11 text-sm font-medium active:scale-95 hover:bg-white/20 transition cursor-pointer"
          >
            {mobileMenuOpen ? "Close" : "Menu"}
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden fixed top-16 left-0 right-0 z-50 bg-slate-900 text-white p-4 shadow-lg">
            <nav className="space-y-2 text-sm">
              {navItems
                .filter((item) => item.roles.includes(userRole))
                .map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className="block rounded-lg px-4 py-3 min-h-11 text-slate-200 hover:bg-white/10 active:scale-95 transition"
                  >
                    {item.label}
                  </Link>
                ))}
            </nav>

            <div className="mt-4 border-t border-white/10 pt-4">
              <p className="text-xs text-slate-400">Logged in as</p>
              <p className="text-sm break-all">{userEmail || "Loading..."}</p>
              <p className="text-xs text-slate-400 mt-1 capitalize">
                Role: {userRole || "unknown"}
              </p>

              <button
                type="button"
                onClick={logout}
                className="mt-4 w-full rounded-xl bg-white/10 px-4 py-3 min-h-11 text-sm font-medium text-white hover:bg-white/20 active:scale-95 transition cursor-pointer"
              >
                Logout
              </button>
            </div>
          </div>
        )}

        <aside className="w-64 bg-slate-950 text-white p-6 hidden md:block">
          <h1 className="text-2xl font-bold mb-8">SteriSphere</h1>

          <nav className="space-y-2 text-sm">
            {navItems
              .filter((item) => item.roles.includes(userRole))
              .map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="block rounded-lg px-4 py-3 min-h-11 text-slate-300 hover:bg-white/10 hover:text-white active:scale-95 transition"
                >
                  {item.label}
                </Link>
              ))}
          </nav>

          <div className="mt-10 border-t border-white/10 pt-6">
            <p className="text-xs text-slate-400 mb-2">Logged in as</p>

            <p className="text-sm font-medium break-all">
              {userEmail || "Loading..."}
            </p>

            <p className="text-xs text-slate-400 mt-1 capitalize">
              Role: {userRole || "unknown"}
            </p>

            <button
              type="button"
              onClick={logout}
              className="mt-4 w-full rounded-xl bg-white/10 px-4 py-3 min-h-11 text-sm font-medium text-white hover:bg-white/20 active:scale-95 transition cursor-pointer"
            >
              Logout
            </button>
          </div>
        </aside>

        <main className="flex-1 p-6 pt-24 md:p-8 flex flex-col">
          <div className="flex-1">{children}</div>

          <footer className="mt-10 border-t border-slate-200 pt-6 text-center text-sm text-slate-500">
            © 2026 SteriSphere. All rights reserved.
          </footer>

          <SteriAssistantWidget
            overdueCycles={assistantData.overdueCycles}
            failedCycles={assistantData.failedCycles}
            openInvestigations={assistantData.openInvestigations}
            expiredPacks={assistantData.expiredPacks}
            expiringSoonPacks={assistantData.expiringSoonPacks}
            availablePacks={assistantData.availablePacks}
          />
        </main>
      </div>
    </AuthGuard>
  );
}
