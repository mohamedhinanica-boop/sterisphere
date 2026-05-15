import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "SteriSphere",
  description: "Dental sterilization traceability platform",
};

const navItems = [
  { label: "Dashboard", href: "/" },
  { label: "Sterilization Cycles", href: "/cycles" },
  { label: "Instrument Packs", href: "/packs" },
  { label: "Patient Traceability", href: "/patients" },
  { label: "Reports", href: "/reports" },
  { label: "Settings", href: "/settings" },
];

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
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
          </aside>

          <main className="flex-1 p-8">{children}</main>
        </div>
      </body>
    </html>
  );
}