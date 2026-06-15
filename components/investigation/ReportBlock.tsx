import type { ReactNode } from "react";

type ReportBlockProps = {
  title: string;
  children: ReactNode;
};

export default function ReportBlock({ title, children }: ReportBlockProps) {
  return (
    <div className="mb-8">
      <h3 className="mb-3 text-xl font-semibold">{title}</h3>
      <div>{children}</div>
    </div>
  );
}
