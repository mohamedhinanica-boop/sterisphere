type ChecklistItemProps = {
  text: string;
};

export default function ChecklistItem({ text }: ChecklistItemProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      ☐ {text}
    </div>
  );
}
