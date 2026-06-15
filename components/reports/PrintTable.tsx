import type { ReactNode } from "react";

type PrintTableProps = {
  title: string;
  rows: number;
  children: ReactNode;
};

export default function PrintTable({ title, rows, children }: PrintTableProps) {
  return (
    <section className="mt-8">
      <h2 className="text-xl font-semibold mb-2">
        {title} ({rows})
      </h2>
      {rows === 0 ? <p>No records.</p> : children}
    </section>
  );
}
