"use client";

import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { createAuditLog } from "@/lib/audit";

type CycleWizardProps = {
  onCycleCreated?: () => void | Promise<void>;
  triggerLabel?: string;
};

type Sterilizer = {
  id: string;
  name: string;
  type: string | null;
  active: boolean;
};

type LoadItem = {
  packType: string;
  quantity: string;
  details: string;
};

const packTypeOptions = [
  "Instrument Pouch",
  "Cassette",
  "Surgical Kit",
  "Hygiene Kit",
  "Exam Kit",
  "Mixed Load",
  "Other",
];

const durationOptions = [30, 45, 60];

export default function CycleWizard({
  onCycleCreated,
  triggerLabel = "Start Guided Cycle",
}: CycleWizardProps) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [loadingSterilizers, setLoadingSterilizers] = useState(false);

  const [sterilizers, setSterilizers] = useState<Sterilizer[]>([]);
  const [sterilizer, setSterilizer] = useState("");
  const [operatorEmail, setOperatorEmail] = useState("");
  const [loadItems, setLoadItems] = useState<LoadItem[]>([
    {
      packType: "Exam Kit",
      quantity: "1",
      details: "",
    },
  ]);
  const [selectedDuration, setSelectedDuration] = useState<number | "custom">(
    45
  );
  const [customDuration, setCustomDuration] = useState("");

  useEffect(() => {
    if (!open) return;

    fetchActiveSterilizers();
    fetchOperator();
  }, [open]);

  const durationMinutes = useMemo(() => {
    if (selectedDuration === "custom") {
      return Number(customDuration);
    }

    return selectedDuration;
  }, [customDuration, selectedDuration]);

  const expectedFinishAt = useMemo(() => {
    if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
      return null;
    }

    const date = new Date();
    date.setMinutes(date.getMinutes() + durationMinutes);
    return date;
  }, [durationMinutes]);

  const expectedPackCount = useMemo(() => {
    return loadItems.reduce((total, item) => {
      const quantity = Number(item.quantity);
      return total + (Number.isInteger(quantity) && quantity > 0 ? quantity : 0);
    }, 0);
  }, [loadItems]);

  const loadSummary = useMemo(() => buildLoadSummary(loadItems), [loadItems]);

  async function fetchOperator() {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error) {
      console.error(error);
    }

    setOperatorEmail(user?.email || "Unknown operator");
  }

  async function fetchActiveSterilizers() {
    setLoadingSterilizers(true);

    const { data, error } = await supabase
      .from("sterilizers")
      .select("id, name, type, active")
      .eq("active", true)
      .order("name", { ascending: true });

    if (error) {
      console.error(error);
      toast.error("Error loading sterilizers.");
      setLoadingSterilizers(false);
      return;
    }

    setSterilizers(data || []);
    setLoadingSterilizers(false);
  }

  function openWizard() {
    setOpen(true);
    setStep(1);
  }

  function closeWizard() {
    if (saving) return;

    setOpen(false);
    resetWizard();
  }

  function resetWizard() {
    setStep(1);
    setSterilizer("");
    setLoadItems([
      {
        packType: "Exam Kit",
        quantity: "1",
        details: "",
      },
    ]);
    setSelectedDuration(45);
    setCustomDuration("");
  }

  function updateLoadItem(index: number, field: keyof LoadItem, value: string) {
    setLoadItems((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item
      )
    );
  }

  function addLoadItem() {
    setLoadItems((current) => [
      ...current,
      {
        packType: "Exam Kit",
        quantity: "1",
        details: "",
      },
    ]);
  }

  function removeLoadItem(index: number) {
    setLoadItems((current) =>
      current.length === 1
        ? current
        : current.filter((_, itemIndex) => itemIndex !== index)
    );
  }

  function canGoNext() {
    if (step === 1) return Boolean(sterilizer);

    if (step === 2) {
      if (loadItems.length === 0) return false;

      return loadItems.every((item) => {
        const quantity = Number(item.quantity);
        const hasValidPackType = Boolean(item.packType);
        const hasValidQuantity = Number.isInteger(quantity) && quantity > 0;
        const needsDetails =
          item.packType === "Other" || item.packType === "Mixed Load";
        const hasDetails = item.details.trim().length > 0;

        return (
          hasValidPackType && hasValidQuantity && (!needsDetails || hasDetails)
        );
      });
    }

    if (step === 3) {
      return Number.isInteger(durationMinutes) && durationMinutes > 0;
    }

    return true;
  }

  async function generateCycleNumber() {
    const year = new Date().getFullYear();
    const prefix = `STERI-${year}-`;

    const { data, error } = await supabase
      .from("cycles")
      .select("cycle_number")
      .like("cycle_number", `${prefix}%`);

    if (error) {
      console.error(error);
      throw new Error("Unable to generate cycle number.");
    }

    const maxExistingNumber =
      data?.reduce((max, cycle) => {
        const numericPart = Number(cycle.cycle_number.replace(prefix, ""));
        return Number.isFinite(numericPart) && numericPart > max
          ? numericPart
          : max;
      }, 0) || 0;

    return `${prefix}${String(maxExistingNumber + 1).padStart(4, "0")}`;
  }

  async function startCycle() {
    if (!canGoNext() || !expectedFinishAt) {
      toast.error("Please complete all wizard steps.");
      return;
    }

    if (!operatorEmail || operatorEmail === "Unknown operator") {
      toast.error("Unable to identify the logged-in operator.");
      return;
    }

    if (expectedPackCount <= 0) {
      toast.error("Expected pack count must be greater than zero.");
      return;
    }

    setSaving(true);

    try {
      const cycleNumber = await generateCycleNumber();

      const { data: newCycle, error: cycleError } = await supabase
        .from("cycles")
        .insert([
          {
            cycle_number: cycleNumber,
            sterilizer,
            operator: operatorEmail,
            load_contents: loadSummary,
            status: "Pending",
            cycle_state: "Open",
            expected_pack_count: expectedPackCount,
            duration_minutes: durationMinutes,
            expected_finish_at: expectedFinishAt.toISOString(),
            created_by: operatorEmail,
          },
        ])
        .select()
        .single();

      if (cycleError || !newCycle) {
        console.error(cycleError);
        toast.error(cycleError?.message || "Error starting guided cycle.");
        setSaving(false);
        return;
      }

      const loadRows = loadItems.map((item) => ({
        cycle_id: newCycle.id,
        pack_type: buildPackTypeLabel(item),
        quantity: Number(item.quantity),
      }));

      const { error: loadItemsError } = await supabase
        .from("load_items")
        .insert(loadRows);

      if (loadItemsError) {
        await supabase.from("cycles").delete().eq("id", newCycle.id);

        console.error(loadItemsError);
        toast.error("Error saving load composition.");
        setSaving(false);
        return;
      }

      await createAuditLog({
        action: "guided_cycle_started",
        entityType: "cycle",
        entityId: newCycle.id,
        description: `Started guided cycle ${cycleNumber}`,
        metadata: {
          cycle_number: cycleNumber,
          sterilizer,
          operator: operatorEmail,
          load_contents: loadSummary,
          expected_pack_count: expectedPackCount,
          duration_minutes: durationMinutes,
          expected_finish_at: expectedFinishAt.toISOString(),
          load_items: loadRows,
        },
      });

      toast.success(`Cycle ${cycleNumber} started.`);
      setOpen(false);
      resetWizard();

      if (onCycleCreated) {
        await onCycleCreated();
      }
    } catch (error) {
      console.error(error);
      toast.error("Error starting guided cycle.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={openWizard}
        className="rounded-xl bg-slate-950 text-white px-5 py-3 min-h-11 text-center text-sm font-medium cursor-pointer hover:bg-slate-800 active:scale-95 transition"
      >
        {triggerLabel}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 py-6">
          <div className="w-full max-w-3xl rounded-3xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
              <div>
                <p className="text-sm text-slate-500">SteriSphere Assistant</p>
                <h2 className="text-2xl font-bold text-slate-950">
                  Guided Cycle Wizard
                </h2>
                <p className="text-sm text-slate-600 mt-1">
                  Step {step} of 4
                </p>
                <p className="text-xs text-slate-500 mt-2">
                  Operator: {operatorEmail || "Loading operator..."}
                </p>
              </div>

              <button
                type="button"
                onClick={closeWizard}
                disabled={saving}
                className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 disabled:opacity-50"
                aria-label="Close wizard"
              >
                <X size={20} />
              </button>
            </div>

            <div className="max-h-[70vh] overflow-y-auto p-5">
              <Progress step={step} />

              {step === 1 && (
                <WizardSection
                  title="Choose sterilizer"
                  description="Select the active sterilizer used for this cycle."
                >
                  {loadingSterilizers ? (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                      Loading sterilizers...
                    </div>
                  ) : sterilizers.length === 0 ? (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                      No active sterilizers are available. Add or activate a
                      sterilizer in Settings first.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {sterilizers.map((item) => (
                        <ChoiceButton
                          key={item.id}
                          selected={sterilizer === item.name}
                          onClick={() => setSterilizer(item.name)}
                        >
                          <span className="block text-base">{item.name}</span>
                          {item.type && (
                            <span className="mt-1 block text-xs font-normal text-slate-500">
                              {item.type}
                            </span>
                          )}
                        </ChoiceButton>
                      ))}
                    </div>
                  )}
                </WizardSection>
              )}

              {step === 2 && (
                <WizardSection
                  title="Load composition"
                  description="Choose what is inside the cycle and specify the quantity. This quantity becomes the expected number of packs generated after a passed cycle."
                >
                  <div className="space-y-4">
                    {loadItems.map((item, index) => {
                      const detailsRequired =
                        item.packType === "Other" || item.packType === "Mixed Load";

                      return (
                        <div
                          key={index}
                          className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <p className="font-semibold text-slate-900">
                              Load item {index + 1}
                            </p>
                            {loadItems.length > 1 && (
                              <button
                                type="button"
                                onClick={() => removeLoadItem(index)}
                                className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50"
                              >
                                <Trash2 size={14} />
                                Remove
                              </button>
                            )}
                          </div>

                          <div className="mt-4 grid grid-cols-1 md:grid-cols-[1fr_140px] gap-3">
                            <div>
                              <label className="text-sm font-medium text-slate-700">
                                Pack / load type
                              </label>
                              <select
                                value={item.packType}
                                onChange={(event) =>
                                  updateLoadItem(index, "packType", event.target.value)
                                }
                                className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                              >
                                {packTypeOptions.map((option) => (
                                  <option key={option} value={option}>
                                    {option}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div>
                              <label className="text-sm font-medium text-slate-700">
                                Quantity
                              </label>
                              <input
                                type="number"
                                min={1}
                                value={item.quantity}
                                onChange={(event) =>
                                  updateLoadItem(index, "quantity", event.target.value)
                                }
                                className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                              />
                            </div>
                          </div>

                          <div className="mt-4">
                            <label className="text-sm font-medium text-slate-700">
                              Additional details {detailsRequired && (
                                <span className="text-red-600">*</span>
                              )}
                            </label>
                            <textarea
                              value={item.details}
                              onChange={(event) =>
                                updateLoadItem(index, "details", event.target.value)
                              }
                              rows={2}
                              placeholder={
                                detailsRequired
                                  ? "Describe the load contents"
                                  : "Optional cassette, pouch, or instrument details..."
                              }
                              className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    onClick={addLoadItem}
                    className="mt-4 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <Plus size={16} />
                    Add another load item
                  </button>

                  <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-blue-700">
                      Expected packs after passed cycle
                    </p>
                    <p className="mt-1 text-lg font-semibold text-blue-950">
                      {expectedPackCount} pack{expectedPackCount === 1 ? "" : "s"}
                    </p>
                  </div>
                </WizardSection>
              )}

              {step === 3 && (
                <WizardSection
                  title="Cycle duration"
                  description="Choose a predefined duration or enter a custom duration."
                >
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    {durationOptions.map((option) => (
                      <ChoiceButton
                        key={option}
                        selected={selectedDuration === option}
                        onClick={() => setSelectedDuration(option)}
                      >
                        {option} min
                      </ChoiceButton>
                    ))}

                    <ChoiceButton
                      selected={selectedDuration === "custom"}
                      onClick={() => setSelectedDuration("custom")}
                    >
                      Custom
                    </ChoiceButton>
                  </div>

                  {selectedDuration === "custom" && (
                    <div className="mt-4">
                      <label className="text-sm font-medium text-slate-700">
                        Custom duration in minutes
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={customDuration}
                        onChange={(event) =>
                          setCustomDuration(event.target.value)
                        }
                        className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                        placeholder="Example: 75"
                      />
                    </div>
                  )}

                  <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-blue-700">
                      Expected finish
                    </p>
                    <p className="mt-1 text-lg font-semibold text-blue-950">
                      {expectedFinishAt
                        ? expectedFinishAt.toLocaleString()
                        : "Choose a valid duration"}
                    </p>
                  </div>
                </WizardSection>
              )}

              {step === 4 && (
                <WizardSection
                  title="Review and start"
                  description="Confirm the cycle details before starting."
                >
                  <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <ReviewRow label="Sterilizer" value={sterilizer} />
                    <ReviewRow label="Operator" value={operatorEmail} />
                    <ReviewRow label="Load contents" value={loadSummary} />
                    <ReviewRow
                      label="Expected packs"
                      value={`${expectedPackCount} pack${
                        expectedPackCount === 1 ? "" : "s"
                      }`}
                    />
                    <ReviewRow
                      label="Duration"
                      value={`${durationMinutes} minutes`}
                    />
                    <ReviewRow
                      label="Expected finish"
                      value={expectedFinishAt?.toLocaleString() || "N/A"}
                    />
                  </div>
                </WizardSection>
              )}
            </div>

            <div className="flex flex-col-reverse md:flex-row md:items-center md:justify-between gap-3 border-t border-slate-200 p-5">
              <button
                type="button"
                onClick={() => setStep((current) => Math.max(1, current - 1))}
                disabled={step === 1 || saving}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-5 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft size={18} />
                Back
              </button>

              {step < 4 ? (
                <button
                  type="button"
                  onClick={() => setStep((current) => Math.min(4, current + 1))}
                  disabled={!canGoNext() || saving || loadingSterilizers}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                  <ChevronRight size={18} />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={startCycle}
                  disabled={saving || !canGoNext()}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-green-600 px-5 py-3 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <CheckCircle2 size={18} />
                  {saving ? "Starting..." : "Start Cycle"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function buildPackTypeLabel(item: LoadItem) {
  const details = item.details.trim();

  if (details) {
    return `${item.packType} — ${details}`;
  }

  return item.packType;
}

function buildLoadSummary(items: LoadItem[]) {
  return items
    .map((item) => `${buildPackTypeLabel(item)} × ${item.quantity}`)
    .join(", ");
}

function Progress({ step }: { step: number }) {
  return (
    <div className="mb-6 grid grid-cols-4 gap-2">
      {[1, 2, 3, 4].map((item) => (
        <div
          key={item}
          className={`h-2 rounded-full ${
            item <= step ? "bg-blue-600" : "bg-slate-200"
          }`}
        />
      ))}
    </div>
  );
}

function WizardSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="text-xl font-semibold text-slate-950">{title}</h3>
      <p className="mt-1 text-sm text-slate-600">{description}</p>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function ChoiceButton({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl border px-4 py-4 text-left text-sm font-medium transition ${
        selected
          ? "border-blue-500 bg-blue-50 text-blue-800 ring-2 ring-blue-100"
          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
      }`}
    >
      {children}
    </button>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-1 border-b border-slate-200 pb-3 last:border-b-0 last:pb-0">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="text-sm font-semibold text-slate-900 md:text-right">
        {value}
      </p>
    </div>
  );
}
