type ChecklistItemProps = {
  text: string;
  checked?: boolean;
  onChange?: (checked: boolean) => void;
};

export default function ChecklistItem({
  text,
  checked = false,
  onChange,
}: ChecklistItemProps) {
  return (
    <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange?.(event.target.checked)}
        className="mt-1 h-4 w-4 rounded border-slate-300"
      />
      <span>{text}</span>
    </label>
  );
}
