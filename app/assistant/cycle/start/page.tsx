"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  ClipboardCheck,
  Clock,
  Package,
  ShieldCheck,
} from "lucide-react";

const steps = ["Sterilizer", "Load", "Duration", "Review"] as const;

const sterilizerOptions = [
  "Autoclave 1",
  "Washer 500 v2",
  "STATIM 5000",
  "STATIM 1000",
];

const loadOptions = [
  "Exam Kit",
  "Surgical Kit",
  "Hygiene Kit",
  "Implant Kit",
  "Custom Load",
];

const durationOptions = [15, 20, 30, 45];

type LoadItem = {
  name: string;
  quantity: number;
};

export default function GuidedCycleStartPage() {
  const router = useRouter();
  const [stepIndex, setStepIndex] = useState(0);
  const [sterilizer, setSterilizer] = useState("");
  const [loadItems, setLoadItems] = useState<LoadItem[]>([]);
  const [duration, setDuration] = useState<number | null>(null);
  const [customDuration, setCustomDuration] = useState("");
  const [returnCountdown, setReturnCountdown] = useState(8);

  const selectedDuration = useMemo(() => {
    if (duration !== null) {
      return duration;
    }

    const parsed = Number(customDuration);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }, [customDuration, duration]);

  const expectedFinish = useMemo(() => {
    if (!selectedDuration) {
      return "Not selected";
    }

    const finish = new Date(Date.now() + selectedDuration * 60000);
    return finish.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
  }, [selectedDuration]);

  const canContinue =
    (stepIndex === 0 && Boolean(sterilizer)) ||
    (stepIndex === 1 && loadItems.length > 0) ||
    (stepIndex === 2 && Boolean(selectedDuration));

  function toggleLoadItem(name: string) {
    setLoadItems((current) => {
      const exists = current.some((item) => item.name === name);

      if (exists) {
        return current.filter((item) => item.name !== name);
      }

      return [...current, { name, quantity: 1 }];
    });
  }

  function updateLoadQuantity(name: string, quantity: number) {
    setLoadItems((current) =>
      current.map((item) =>
        item.name === name ? { ...item, quantity: Math.max(1, quantity) } : item
      )
    );
  }

  function selectDuration(minutes: number | null) {
    setDuration(minutes);

    if (minutes !== null) {
      setCustomDuration("");
    }
  }

  function continueToNextStep() {
    if (!canContinue) {
      return;
    }

    setStepIndex((current) => Math.min(current + 1, 3));
  }

  function startCyclePreview() {
    setStepIndex(4);
  }

  const isSuccess = stepIndex === 4;

  useEffect(() => {
    if (!isSuccess) {
      return;
    }

    setReturnCountdown(8);

    const timer = window.setInterval(() => {
      setReturnCountdown((current) => {
        if (current <= 1) {
          window.clearInterval(timer);
          router.push("/assistant");
          return 0;
        }

        return current - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [isSuccess, router]);

  return (
    <main className="flex min-h-[100svh] flex-col bg-slate-100 p-3 text-slate-950 lg:h-[100svh] lg:overflow-hidden">
      <header className="mb-3 flex items-center justify-between gap-3 rounded-2xl bg-slate-950 px-4 py-3 text-white shadow-sm">
        <div>
          <p className="text-sm font-semibold text-slate-300">
            SteriSphere Workstation
          </p>
          <h1 className="text-2xl font-bold tracking-normal">
            Guided Cycle Start
          </h1>
        </div>

        {!isSuccess && (
          <Link
            href="/assistant"
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-white/10 px-4 py-3 text-sm font-bold text-white"
          >
            <ArrowLeft className="h-5 w-5" />
            Cancel
          </Link>
        )}
      </header>

      {!isSuccess && (
        <nav className="mb-3 grid grid-cols-4 gap-2">
          {steps.map((step, index) => {
            const isActive = index === stepIndex;
            const isComplete = index < stepIndex;

            return (
              <div
                key={step}
                className={`rounded-2xl border px-3 py-2 text-center text-sm font-bold shadow-sm ${
                  isActive
                    ? "border-slate-950 bg-slate-950 text-white"
                    : isComplete
                      ? "border-green-200 bg-green-50 text-green-700"
                      : "border-slate-200 bg-white text-slate-500"
                }`}
              >
                {step}
              </div>
            );
          })}
        </nav>
      )}

      <section className="grid min-h-0 flex-1 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:overflow-hidden">
        {stepIndex === 0 && (
          <WorkflowStep
            icon={ShieldCheck}
            title="Select Sterilizer"
            subtitle="Choose the device prepared for this cycle."
            footer={
              <StepFooter
                canContinue={canContinue}
                onContinue={continueToNextStep}
              />
            }
          >
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {sterilizerOptions.map((option) => (
                <ChoiceCard
                  key={option}
                  label={option}
                  selected={sterilizer === option}
                  onClick={() => setSterilizer(option)}
                />
              ))}
            </div>
          </WorkflowStep>
        )}

        {stepIndex === 1 && (
          <WorkflowStep
            icon={Package}
            title="Load Composition"
            subtitle="Select one or more load types and confirm quantities."
            footer={
              <StepFooter
                canContinue={canContinue}
                onBack={() => setStepIndex(0)}
                onContinue={continueToNextStep}
              />
            }
          >
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              {loadOptions.map((option) => {
                const item = loadItems.find((entry) => entry.name === option);

                return (
                  <div
                    key={option}
                    className={`rounded-2xl border p-3 shadow-sm ${
                      item
                        ? "border-slate-950 bg-slate-950 text-white"
                        : "border-slate-200 bg-slate-50 text-slate-800"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleLoadItem(option)}
                      className="flex min-h-24 w-full flex-col justify-between text-left"
                    >
                      <Package className="h-6 w-6" />
                      <span className="text-lg font-bold">{option}</span>
                    </button>

                    {item && (
                      <div className="mt-3 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            updateLoadQuantity(option, item.quantity - 1)
                          }
                          className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 text-xl font-bold"
                        >
                          -
                        </button>
                        <input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(event) =>
                            updateLoadQuantity(option, Number(event.target.value))
                          }
                          className="h-11 min-w-0 flex-1 rounded-xl border border-white/30 bg-white px-2 text-center font-bold text-slate-950"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            updateLoadQuantity(option, item.quantity + 1)
                          }
                          className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 text-xl font-bold"
                        >
                          +
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </WorkflowStep>
        )}

        {stepIndex === 2 && (
          <WorkflowStep
            icon={Clock}
            title="Cycle Duration"
            subtitle="Select the programmed duration on the sterilizer."
            footer={
              <StepFooter
                canContinue={canContinue}
                onBack={() => setStepIndex(1)}
                onContinue={continueToNextStep}
              />
            }
          >
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              {durationOptions.map((minutes) => (
                <ChoiceCard
                  key={minutes}
                  label={`${minutes} min`}
                  selected={duration === minutes}
                  onClick={() => selectDuration(minutes)}
                />
              ))}
              <div
                className={`rounded-2xl border p-3 shadow-sm ${
                  duration === null && customDuration
                    ? "border-slate-950 bg-slate-950 text-white"
                    : "border-slate-200 bg-slate-50 text-slate-800"
                }`}
              >
                <button
                  type="button"
                  onClick={() => selectDuration(null)}
                  className="mb-3 flex min-h-16 w-full items-center text-left text-lg font-bold"
                >
                  Custom
                </button>
                <input
                  type="number"
                  min="1"
                  value={customDuration}
                  onChange={(event) => {
                    selectDuration(null);
                    setCustomDuration(event.target.value);
                  }}
                  className="h-12 w-full rounded-xl border border-slate-300 px-3 text-center text-lg font-bold text-slate-950"
                  placeholder="Min"
                />
              </div>
            </div>
          </WorkflowStep>
        )}

        {stepIndex === 3 && (
          <WorkflowStep
            icon={ClipboardCheck}
            title="Review Cycle"
            subtitle="Confirm the guided setup before starting the cycle."
            footer={
              <StepFooter
                canContinue
                continueLabel="Start Cycle"
                onBack={() => setStepIndex(2)}
                onContinue={startCyclePreview}
              />
            }
          >
            <div className="grid gap-3 lg:grid-cols-4">
              <ReviewCard title="Sterilizer" value={sterilizer} />
              <ReviewCard
                title="Duration"
                value={selectedDuration ? `${selectedDuration} min` : "N/A"}
              />
              <ReviewCard title="Expected Finish" value={expectedFinish} />
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-bold uppercase tracking-wide text-slate-500">
                  Load
                </p>
                <div className="mt-3 space-y-2">
                  {loadItems.map((item) => (
                    <p
                      key={item.name}
                      className="flex justify-between gap-3 text-base font-bold"
                    >
                      <span>{item.name}</span>
                      <span>x{item.quantity}</span>
                    </p>
                  ))}
                </div>
              </div>
            </div>
          </WorkflowStep>
        )}

        {isSuccess && (
          <div className="flex min-h-0 flex-col items-center justify-center text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-green-100 text-green-700">
              <Check className="h-10 w-10" />
            </div>
            <h2 className="mt-5 text-4xl font-bold">Cycle Ready</h2>
            <p className="mt-3 text-lg text-slate-600">
              Guided workflow completed successfully.
            </p>
            <p className="mt-2 text-sm font-semibold text-slate-500">
              Returning to Workstation in {returnCountdown} seconds...
            </p>
            <Link
              href="/assistant"
              className="mt-6 inline-flex min-h-12 items-center justify-center rounded-xl bg-slate-950 px-6 py-3 text-base font-bold text-white"
            >
              Return Now
            </Link>
          </div>
        )}
      </section>
    </main>
  );
}

function WorkflowStep({
  icon: Icon,
  title,
  subtitle,
  children,
  footer,
}: {
  icon: typeof ShieldCheck;
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-col">
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
          <Icon className="h-6 w-6" />
        </span>
        <div>
          <h2 className="text-2xl font-bold">{title}</h2>
          <p className="mt-1 text-sm text-slate-600">{subtitle}</p>
        </div>
      </div>

      <div className="min-h-0 flex-1">{children}</div>
      {footer}
    </div>
  );
}

function ChoiceCard({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-[clamp(6.5rem,18vh,9rem)] flex-col justify-between rounded-2xl border p-4 text-left shadow-sm ${
        selected
          ? "border-slate-950 bg-slate-950 text-white"
          : "border-slate-200 bg-slate-50 text-slate-800"
      }`}
    >
      <ShieldCheck className="h-6 w-6 opacity-80" />
      <span className="text-xl font-bold">{label}</span>
    </button>
  );
}

function StepFooter({
  canContinue,
  continueLabel = "Continue",
  onBack,
  onContinue,
}: {
  canContinue: boolean;
  continueLabel?: string;
  onBack?: () => void;
  onContinue: () => void;
}) {
  return (
    <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-200 pt-4">
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="min-h-12 rounded-xl border border-slate-300 px-5 py-3 text-sm font-bold text-slate-700"
        >
          Back
        </button>
      ) : (
        <span />
      )}

      <button
        type="button"
        onClick={onContinue}
        disabled={!canContinue}
        className="min-h-12 rounded-xl bg-slate-950 px-6 py-3 text-sm font-bold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-40"
      >
        {continueLabel}
      </button>
    </div>
  );
}

function ReviewCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-sm font-bold uppercase tracking-wide text-slate-500">
        {title}
      </p>
      <p className="mt-3 text-xl font-bold text-slate-950">{value}</p>
    </div>
  );
}
