"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import toast from "react-hot-toast";

import { supabase } from "@/lib/supabase";
import AuthGuard from "@/components/AuthGuard";

const navItems = [
  {
    label: "Dashboard",
    href: "/",
    roles: ["admin", "clinical_staff", "doctor", "auditor"],
  },
  {
    label: "Sterilization Cycles",
    href: "/cycles",
    roles: ["admin", "clinical_staff"],
  },
  {
    label: "Instrument Packs",
    href: "/packs",
    roles: ["admin", "clinical_staff"],
  },
  {
    label: "Patient Traceability",
    href: "/patients",
    roles: ["admin", "clinical_staff", "doctor"],
  },
  {
    label: "Reports",
    href: "/reports",
    roles: ["admin", "doctor", "auditor"],
  },
  {
    label: "Investigation",
    href: "/investigation",
    roles: ["admin", "doctor", "auditor"],
  },
  {
    label: "Settings",
    href: "/settings",
    roles: ["admin"],
  },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const isLoginPage = pathname === "/login";

  const [userEmail, setUserEmail] = useState("");
  const [userRole, setUserRole] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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

    if (!isLoginPage) {
      loadUser();
    }
  }, [isLoginPage]);

  async function logout() {
    await supabase.auth.signOut();
    toast.success("Logged out successfully.");
    router.push("/login");
  }

  if (isLoginPage) {
    return <>{children}</>;
  }

  return (
    <AuthGuard>
      <div className="min-h-screen bg-slate-100 text-slate-950 flex">
        <div className="md:hidden fixed top-0 left-0 right-0 z-50 bg-slate-950 text-white p-4 flex items-center justify-between">
  <h1 className="text-xl font-bold">SteriSphere</h1>

  <button
    type="button"
    onClick={() => setMobileMenuOpen((current) => !current)}
    className="rounded-lg bg-white/10 px-3 py-2 text-sm font-medium"
  >
    Menu
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
            className="block rounded-lg px-4 py-3 text-slate-200 hover:bg-white/10"
          >
            {item.label}
          </Link>
        ))}
    </nav>

    <div className="mt-4 border-t border-white/10 pt-4">
      <p className="text-xs text-slate-400">Logged in as</p>
      <p className="text-sm break-all">{userEmail}</p>
      <p className="text-xs text-slate-400 mt-1 capitalize">Role: {userRole}</p>

      <button
        type="button"
        onClick={logout}
        className="mt-3 w-full rounded-xl bg-white/10 px-4 py-2 text-sm font-medium text-white"
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
                  className="block rounded-lg px-4 py-3 text-slate-300 hover:bg-white/10 hover:text-white"
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
              className="mt-4 w-full rounded-xl bg-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/20 transition cursor-pointer"
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
        </main>
      </div>
    </AuthGuard>
  );
}