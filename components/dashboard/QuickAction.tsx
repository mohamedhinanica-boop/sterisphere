import Link from "next/link";

type QuickActionProps = {
  href: string;
  label: string;
};

export default function QuickAction({ href, label }: QuickActionProps) {
  return (
    <Link
      href={href}
      className="min-h-11 rounded-xl bg-slate-950 px-5 py-3 text-center text-sm font-medium text-white transition hover:bg-slate-800 active:scale-95"
    >
      {label}
    </Link>
  );
}
