"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Toaster } from "react-hot-toast";
import toast from "react-hot-toast";

import { supabase } from "@/lib/supabase";
import AuthGuard from "@/components/AuthGuard";
import "./globals.css";

const navItems = [
  { label: "Dashboard", href: "/" },
  { label: "Sterilization Cycles", href: "/cycles" },
  { label: "Instrument Packs", href: "/packs" },
  { label: "Patient Traceability", href: "/patients" },
  { label: "Reports", href: "/reports" },
  { label: "Investigation", href: "/investigation" },
  { label: "Settings", href: "/settings" },
];

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [userEmail, setUserEmail] = useState("");

  useEffect(() => {
    async function loadUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user?.email) {
        setUserEmail(user.email);
      }
    }

    loadUser();
  }, []);

  async function logout() {
    await supabase.auth.signOut();
    toast.success("Logged out successfully.");
    router.push("/login");
  }

  return (
    <html lang="en">
      <body>
        <Toaster position="top-right" />

        <AuthGuard>
          <div className="min-h-screen bg-slate-100 text-slate-950 flex">
            <aside className="w-64 bg-slate-950 text-white p-6 hidden md:block">
              <h1 className="text-2xl font-bold mb-8">SteriSphere</h1>

              <nav className="space-y-2 text-sm">
                {navItems.map((item) => (
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

                <button
                  type="button"
                  onClick={logout}
                  className="mt-4 w-full rounded-xl bg-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/20 transition cursor-pointer"
                >
                  Logout
                </button>
              </div>
            </aside>

            <main className="flex-1 p-8">{children}</main>
          </div>
        </AuthGuard>
      </body>
    </html>
  );
}