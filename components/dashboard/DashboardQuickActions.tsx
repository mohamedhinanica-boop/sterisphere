import type { ReactNode } from "react";
import QuickAction from "./QuickAction";

type DashboardQuickActionsProps = {
  children: ReactNode;
};

export default function DashboardQuickActions({ children }: DashboardQuickActionsProps) {
  return (
    <section className="mb-8 grid grid-cols-1 gap-4 lg:grid-cols-4">
      {children}
      <QuickAction href="/packs" label="Pack Inventory" />
      <QuickAction href="/patients" label="Trace Patient Pack" />
      <QuickAction href="/reports" label="View Reports" />
    </section>
  );
}
