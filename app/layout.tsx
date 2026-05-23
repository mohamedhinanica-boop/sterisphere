import type { Metadata } from "next";
import { Toaster } from "react-hot-toast";
import AppShell from "@/components/AppShell";
import "./globals.css";

export const metadata: Metadata = {
  title: "SteriSphere",
  description: "Dental sterilization traceability platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Toaster position="top-right" />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}