"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ComponentType } from "react";
import {
  ArrowLeft,
  Check,
  ClipboardCheck,
  QrCode,
  Search,
  Stethoscope,
  UserPlus,
  X,
} from "lucide-react";
import toast from "react-hot-toast";
import {
  createManualPatient as createManualPatientRecord,
  createPatientTrace,
  getPatients,
  getProviders,
  validatePackUsage,
  type Patient,
  type Provider,
  type ValidatedPack,
} from "@/lib/modules/traceability";
import {
  resolveScan,
  ScanIntent,
  ScanSource,
} from "@/lib/modules/scan-services";
import { supabase } from "@/lib/supabase";
import AssistantNotificationBanner, {
  type AssistantNotification,
} from "@/components/AssistantNotificationBanner";
import { useClinicalRooms } from "@/lib/hooks/useClinicalRooms";

const steps = ["Pack", "Patient", "Care", "Review"] as const;

type ManualPatientForm = {
  firstName: string;
  lastName: string;
  externalId: string;
  dateOfBirth: string;
};

export default function GuidedPatientTraceStartPage() {
  const router = useRouter();
  const { rooms: clinicalRooms, state: clinicalRoomsState } =
    useClinicalRooms();
  const scannerRef = useRef<any>(null);
  const cameraScanProcessingRef = useRef(false);
  const packInputRef = useRef<HTMLInputElement>(null);
  const scannerElementId = "trace-pack-qr-reader";

  const [stepIndex, setStepIndex] = useState(0);
  const [packNumber, setPackNumber] = useState("");
  const [validatedPack, setValidatedPack] = useState<ValidatedPack | null>(null);
  const [packValidationMessage, setPackValidationMessage] = useState("");
  const [validatingPack, setValidatingPack] = useState(false);
  const [scannerActive, setScannerActive] = useState(false);
  const [scannerLoading, setScannerLoading] = useState(false);

  const [patients, setPatients] = useState<Patient[]>([]);
  const [patientSearch, setPatientSearch] = useState("");
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [manualPatient, setManualPatient] = useState<ManualPatientForm>({
    firstName: "",
    lastName: "",
    externalId: "",
    dateOfBirth: "",
  });
  const [creatingPatient, setCreatingPatient] = useState(false);

  const [providers, setProviders] = useState<Provider[]>([]);
  const [provider, setProvider] = useState("");
  const [procedure, setProcedure] = useState("");
  const [treatmentRoom, setTreatmentRoom] = useState("");
  const [loadingData, setLoadingData] = useState(true);
  const [savingTrace, setSavingTrace] = useState(false);
  const [traceDateTime, setTraceDateTime] = useState<Date | null>(null);
  const [assistantNotification, setAssistantNotification] =
    useState<AssistantNotification | null>(null);
  const [returnCountdown, setReturnCountdown] = useState(8);
  const [isScanMode, setIsScanMode] = useState(false);

  const isSuccess = stepIndex === 4;
  const dismissAssistantNotification = useCallback(() => {
    setAssistantNotification(null);
  }, []);

  const filteredPatients = useMemo(() => {
    const search = patientSearch.trim().toLowerCase();

    if (!search) {
      return patients.slice(0, 8);
    }

    return patients
      .filter(
        (patient) =>
          patient.full_name.toLowerCase().includes(search) ||
          patient.external_id?.toLowerCase().includes(search)
      )
      .slice(0, 8);
  }, [patientSearch, patients]);

  const selectedProviderLabel = useMemo(() => {
    const selected = providers.find((entry) => entry.full_name === provider);
    return selected?.display_name || selected?.full_name || provider;
  }, [provider, providers]);

  const canContinue =
    (stepIndex === 0 && Boolean(validatedPack)) ||
    (stepIndex === 1 && Boolean(selectedPatient)) ||
    (stepIndex === 2 &&
      Boolean(provider) &&
      Boolean(procedure.trim()) &&
      Boolean(treatmentRoom.trim()));

  useEffect(() => {
    async function loadWizardData() {
      setLoadingData(true);

      try {
        const [patientData, providerData] = await Promise.all([
          getPatients(supabase),
          getProviders(supabase),
        ]);

        setPatients(patientData);
        setProviders(providerData);
      } catch (error) {
        toast.error("Error loading trace workflow data.");
        console.error("Trace wizard load error:", error);
      } finally {
        setLoadingData(false);
      }
    }

    loadWizardData();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setIsScanMode(params.get("mode") === "scan");
    setStepIndex(0);
  }, []);

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

  useEffect(() => {
    return () => {
      stopScanner();
    };
  }, []);

  function updatePackNumber(nextPackNumber: string) {
    setPackNumber(nextPackNumber);
    setValidatedPack(null);
    setPackValidationMessage("");
  }

  function normalizePackNumber(nextPackNumber: string) {
    return nextPackNumber.trim().toUpperCase();
  }

  async function validatePackNumber(nextPackNumber: string) {
    const normalizedPackNumber = normalizePackNumber(nextPackNumber);

    console.log("[GuidedTrace] validatePackNumber input", {
      inputPackNumber: nextPackNumber,
      normalizedPackNumber,
    });

    if (!normalizedPackNumber) {
      setPackValidationMessage("Enter or scan a pack number.");
      return;
    }

    setValidatingPack(true);
    setValidatedPack(null);
    setPackNumber(normalizedPackNumber);

    try {
      const pack = await validatePackUsage(supabase, normalizedPackNumber);

      console.log("[GuidedTrace] validatePackUsage result", pack);

      setPackNumber(pack.pack_number);
      setValidatedPack(pack);
      setPackValidationMessage("Pack validated and available.");
      toast.success("Pack validated.");
    } catch (error) {
      console.error("[GuidedTrace] validatePackUsage error", error);

      const message =
        error instanceof Error ? error.message : "Pack could not be validated.";

      setPackValidationMessage(message);
      toast.error(message);
    } finally {
      setValidatingPack(false);
    }
  }

  async function validateManualPack() {
    const manualPackNumber = packInputRef.current?.value ?? packNumber;

    console.log("[GuidedTrace] manual validate clicked", {
      inputPackNumber: manualPackNumber,
      statePackNumber: packNumber,
    });

    await validatePackNumber(manualPackNumber);
  }

  function goToStep(nextStepIndex: number) {
    if (nextStepIndex >= stepIndex || isSuccess) {
      return;
    }

    setStepIndex(nextStepIndex);
  }

  async function startScanner() {
    setScannerLoading(true);
    cameraScanProcessingRef.current = false;

    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      const scanner = new Html5Qrcode(scannerElementId);
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        async (decodedText: string) => {
          if (cameraScanProcessingRef.current) {
            return;
          }

          cameraScanProcessingRef.current = true;
          const scan = resolveScan({
            source: ScanSource.TABLET_CAMERA,
            rawValue: decodedText,
          });

          console.log("[GuidedTrace] QR decoded", {
            inputPackNumber: scan.normalizedValue,
            scanIntent: scan.intent,
          });

          await stopScanner();

          if (scan.intent !== ScanIntent.PACK_TRACE) {
            toast.error("Scanned code is not recognized as a pack.");
            return;
          }

          await validatePackNumber(scan.normalizedValue);
        },
        undefined
      );

      setScannerActive(true);
    } catch (error) {
      toast.error("Unable to start QR scanner.");
      console.error("Trace QR scanner error:", error);
    } finally {
      setScannerLoading(false);
    }
  }

  async function stopScanner() {
    const scanner = scannerRef.current;

    if (!scanner) {
      return;
    }

    try {
      if (scanner.isScanning) {
        await scanner.stop();
      }

      await scanner.clear();
    } catch (error) {
      console.error("Trace QR scanner stop error:", error);
    } finally {
      scannerRef.current = null;
      setScannerActive(false);
    }
  }

  function selectPatient(patient: Patient) {
    setSelectedPatient(patient);
    setPatientSearch(patient.full_name);
  }

  function clearSelectedPatient() {
    setSelectedPatient(null);
    setPatientSearch("");
  }

  async function createManualPatient() {
    setCreatingPatient(true);

    try {
      const { patient, possibleDuplicate } = await createManualPatientRecord(
        supabase,
        manualPatient,
      );

      setPatients((current) =>
        [...current, patient].sort((a, b) =>
          a.full_name.localeCompare(b.full_name)
        )
      );
      setSelectedPatient(patient);
      setPatientSearch(patient.full_name);
      setManualPatient({
        firstName: "",
        lastName: "",
        externalId: "",
        dateOfBirth: "",
      });
      toast.success("Patient created.");

      if (possibleDuplicate) {
        toast(
          "A patient with the same full name and date of birth already exists.",
          { icon: "⚠️" },
        );
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Patient could not be created.";

      toast.error(message);
      console.error("Manual patient creation error:", error);
    } finally {
      setCreatingPatient(false);
    }
  }

  function continueToNextStep() {
    if (!canContinue) {
      return;
    }

    if (stepIndex === 2) {
      setTraceDateTime(new Date());
    }

    setStepIndex((current) => Math.min(current + 1, 3));
  }

  async function confirmTrace() {
    if (!validatedPack || !selectedPatient || !provider || !procedure.trim()) {
      toast.error("Complete all required fields before confirming.");
      return;
    }

    setSavingTrace(true);

    try {
      await createPatientTrace(supabase, {
        patientId: selectedPatient.id,
        patientName: selectedPatient.full_name,
        provider,
        treatmentRoom: treatmentRoom.trim(),
        packNumber: validatedPack.pack_number,
        procedure: procedure.trim(),
      });

      setAssistantNotification({
        title: "Trace Recorded Successfully",
        message: `Pack ${validatedPack.pack_number}`,
        detail: selectedPatient.full_name,
        variant: "success",
      });
      setStepIndex(4);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Trace could not be recorded.";

      toast.error(message);
      console.error("Trace confirmation error:", error);
    } finally {
      setSavingTrace(false);
    }
  }

  return (
    <main className="flex min-h-[100svh] flex-col bg-slate-100 p-3 text-slate-950 lg:h-[100svh] lg:overflow-hidden">
      <AssistantNotificationBanner
        notification={assistantNotification}
        onDismiss={dismissAssistantNotification}
      />

      <header className="mb-3 flex items-center justify-between gap-3 rounded-2xl bg-slate-950 px-4 py-3 text-white shadow-sm">
        <div>
          <p className="text-sm font-semibold text-slate-300">
            SteriSphere Workstation
          </p>
          <h1 className="text-2xl font-bold tracking-normal">
            Guided Patient Trace
          </h1>
        </div>

        {!isSuccess && (
          <Link
            href="/assistant"
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-white/10 px-4 py-3 text-sm font-bold text-white transition-all hover:bg-white/15 active:scale-[0.98] active:brightness-95 active:shadow-inner"
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
              <button
                key={step}
                type="button"
                onClick={() => goToStep(index)}
                disabled={!isComplete}
                className={`rounded-2xl border px-3 py-2 text-center text-sm font-bold shadow-sm transition-all ${
                  isActive
                    ? "border-slate-950 bg-slate-950 text-white"
                    : isComplete
                      ? "border-green-200 bg-green-50 text-green-700 hover:shadow-md active:scale-[0.98] active:brightness-95 active:shadow-inner"
                      : "cursor-not-allowed border-slate-200 bg-white text-slate-500"
                }`}
              >
                {step}
              </button>
            );
          })}
        </nav>
      )}

      <section className="grid min-h-0 flex-1 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:overflow-hidden">
        {stepIndex === 0 && (
          <WorkflowStep
            icon={QrCode}
            title={isScanMode ? "Scan Pack QR" : "Scan or Enter Pack"}
            subtitle={
              isScanMode
                ? "Scan a pack label first, or use manual entry as a fallback."
                : "Validate that the pack exists, is available, and has not expired."
            }
            footer={
              <StepFooter
                canContinue={canContinue}
                onBack={() => router.push("/assistant")}
                onContinue={continueToNextStep}
              />
            }
          >
            <div
              className={`grid min-h-0 gap-3 lg:items-start ${
                isScanMode
                  ? "lg:grid-cols-[minmax(0,1fr)_minmax(340px,0.9fr)]"
                  : "lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.75fr)]"
              }`}
            >
              <div
                className={`self-start rounded-2xl border p-3 ${
                  isScanMode
                    ? "border-slate-300 bg-slate-50 shadow-sm"
                    : "border-slate-200 bg-slate-50"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-xl font-bold">
                      {isScanMode ? "Scan Pack Label" : "QR Scan"}
                    </h3>
                    <p className="mt-1 text-sm text-slate-600">
                      {isScanMode
                        ? "Position the pack QR code inside the scanner area."
                        : "Use the tablet camera to scan a pack label."}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={scannerActive ? stopScanner : startScanner}
                    disabled={scannerLoading}
                    className="inline-flex min-h-12 items-center justify-center rounded-xl bg-slate-950 px-5 py-3 text-sm font-bold text-white transition-all hover:shadow-md active:scale-[0.98] active:brightness-95 active:shadow-inner disabled:opacity-50 disabled:active:scale-100"
                  >
                    {scannerActive
                      ? "Stop Scanner"
                      : scannerLoading
                        ? "Starting..."
                        : "Start Scanner"}
                  </button>
                </div>

                <div
                  id={scannerElementId}
                  className={`mt-3 overflow-hidden rounded-2xl border border-slate-300 bg-white [&>div]:!h-full [&_canvas]:!h-full [&_canvas]:!w-full [&_canvas]:object-cover [&_img]:mx-auto [&_video]:!h-full [&_video]:!w-full [&_video]:object-cover ${
                    isScanMode
                      ? "h-[12.5rem] md:h-[13.5rem] lg:h-[38svh] lg:max-h-[18rem] xl:max-h-[19rem]"
                      : "h-[14rem] md:h-[16rem] lg:h-[42svh] lg:max-h-[20rem]"
                  }`}
                />
              </div>

              <div className="flex min-h-0 flex-col self-start rounded-2xl border border-slate-200 bg-white p-3 lg:max-h-[52svh] lg:overflow-y-auto xl:max-h-[24rem]">
                <label className="text-sm font-bold uppercase tracking-wide text-slate-500">
                  {isScanMode ? "Manual Fallback" : "Manual Pack Number"}
                </label>
                <input
                  ref={packInputRef}
                  value={packNumber}
                  onChange={(event) => updatePackNumber(event.target.value)}
                  className="mt-3 min-h-14 rounded-xl border-2 border-slate-300 px-4 text-xl font-bold focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-100"
                  placeholder="Enter pack number"
                />
                <button
                  type="button"
                  onClick={validateManualPack}
                  disabled={validatingPack || !packNumber.trim()}
                  className="mt-3 min-h-12 rounded-xl bg-slate-950 px-5 py-3 text-sm font-bold text-white transition-all hover:shadow-md active:scale-[0.98] active:brightness-95 active:shadow-inner disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100"
                >
                  {validatingPack ? "Validating..." : "Validate Pack"}
                </button>

                {packValidationMessage && (
                  <div
                    className={`mt-3 rounded-2xl border p-3 text-sm font-bold ${
                      validatedPack
                        ? "border-green-200 bg-green-50 text-green-700"
                        : "border-red-200 bg-red-50 text-red-700"
                    }`}
                  >
                    {packValidationMessage}
                  </div>
                )}

                {validatedPack && (
                  <PackDetailsGrid pack={validatedPack} />
                )}
              </div>
            </div>
          </WorkflowStep>
        )}

        {stepIndex === 1 && (
          <WorkflowStep
            icon={Search}
            title="Select Patient"
            subtitle="Search existing patients or create a patient if they are not found."
            footer={
              <StepFooter
                canContinue={canContinue}
                onBack={() => setStepIndex(0)}
                onContinue={continueToNextStep}
              />
            }
          >
            <div className="grid h-full min-h-0 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.7fr)]">
              <div className="flex min-h-0 flex-col rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <label className="text-sm font-bold uppercase tracking-wide text-slate-500">
                  Patient Search
                </label>
                <div className="mt-3 flex gap-2">
                  <input
                    value={patientSearch}
                    onChange={(event) => {
                      setPatientSearch(event.target.value);
                      setSelectedPatient(null);
                    }}
                    className="min-h-14 min-w-0 flex-1 rounded-xl border-2 border-slate-300 px-4 text-xl font-bold focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-100"
                    placeholder="Name or file ID"
                  />

                  {(selectedPatient || patientSearch.trim()) && (
                    <button
                      type="button"
                      onClick={clearSelectedPatient}
                      className="inline-flex min-h-14 shrink-0 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-700 shadow-sm transition-all hover:bg-slate-50 hover:shadow-md active:scale-[0.98] active:brightness-95 active:shadow-inner"
                    >
                      <X className="h-4 w-4" />
                      Clear
                    </button>
                  )}
                </div>

                <div className="mt-4 grid min-h-0 flex-1 gap-3 overflow-y-auto pr-1 md:grid-cols-2">
                  {loadingData ? (
                    <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm font-bold text-slate-500">
                      Loading patients...
                    </div>
                  ) : filteredPatients.length === 0 ? (
                    <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm font-bold text-slate-500">
                      No patient found.
                    </div>
                  ) : (
                    filteredPatients.map((patient) => (
                      <button
                        key={patient.id}
                        type="button"
                        onClick={() => selectPatient(patient)}
                        className={`min-h-28 rounded-2xl border p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md active:scale-[0.98] active:brightness-95 active:shadow-inner ${
                          selectedPatient?.id === patient.id
                            ? "border-slate-950 bg-slate-950 text-white"
                            : "border-slate-200 bg-white text-slate-800"
                        }`}
                      >
                        <span className="block text-lg font-bold">
                          {patient.full_name}
                        </span>
                        <span className="mt-2 block text-sm opacity-75">
                          File ID: {patient.external_id || "N/A"}
                        </span>
                        <span className="mt-1 block text-sm opacity-75">
                          DOB: {patient.date_of_birth || "N/A"}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>

              <div className="self-start rounded-2xl border border-slate-200 bg-white p-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
                    <UserPlus className="h-5 w-5" />
                  </span>
                  <div>
                    <h3 className="text-lg font-bold">Manual Patient</h3>
                    <p className="text-sm text-slate-600">
                      Create a patient record for this trace.
                    </p>
                  </div>
                </div>

                <div className="mt-3 space-y-2">
                  <TouchInput
                    label="First Name *"
                    value={manualPatient.firstName}
                    onChange={(value) =>
                      setManualPatient((current) => ({
                        ...current,
                        firstName: value,
                      }))
                    }
                    placeholder="First name"
                    compact
                  />
                  <TouchInput
                    label="Last Name *"
                    value={manualPatient.lastName}
                    onChange={(value) =>
                      setManualPatient((current) => ({
                        ...current,
                        lastName: value,
                      }))
                    }
                    placeholder="Last name"
                    compact
                  />
                  <TouchInput
                    label="File ID"
                    value={manualPatient.externalId}
                    onChange={(value) =>
                      setManualPatient((current) => ({
                        ...current,
                        externalId: value,
                      }))
                    }
                    placeholder="Optional"
                    compact
                  />
                  <TouchInput
                    label="Date of Birth *"
                    type="date"
                    value={manualPatient.dateOfBirth}
                    onChange={(value) =>
                      setManualPatient((current) => ({
                        ...current,
                        dateOfBirth: value,
                      }))
                    }
                    compact
                  />

                  <button
                    type="button"
                    onClick={createManualPatient}
                    disabled={
                      creatingPatient ||
                      !manualPatient.firstName.trim() ||
                      !manualPatient.lastName.trim() ||
                      !manualPatient.dateOfBirth
                    }
                    className="min-h-11 w-full rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-bold text-white transition-all hover:shadow-md active:scale-[0.98] active:brightness-95 active:shadow-inner disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100"
                  >
                    {creatingPatient ? "Creating..." : "Create and Select"}
                  </button>
                </div>
              </div>
            </div>
          </WorkflowStep>
        )}

        {stepIndex === 2 && (
          <WorkflowStep
            icon={Stethoscope}
            title="Provider & Procedure"
            subtitle="Capture the care details required for traceability."
            footer={
              <StepFooter
                canContinue={canContinue}
                onBack={() => setStepIndex(1)}
                onContinue={continueToNextStep}
              />
            }
          >
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="lg:col-span-1">
                <label className="text-sm font-bold uppercase tracking-wide text-slate-500">
                  Provider
                </label>
                <select
                  value={provider}
                  onChange={(event) => setProvider(event.target.value)}
                  className="mt-3 min-h-14 w-full rounded-xl border-2 border-slate-300 bg-white px-4 text-xl font-bold focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-100"
                >
                  <option value="">
                    {providers.length === 0
                      ? "No active providers"
                      : "Select provider"}
                  </option>
                  {providers.map((providerOption) => (
                    <option
                      key={providerOption.id}
                      value={providerOption.full_name}
                    >
                      {providerOption.display_name || providerOption.full_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-sm font-bold uppercase tracking-wide text-slate-500">
                  Clinical Room
                </label>
                {clinicalRoomsState === "ready" &&
                clinicalRooms.length > 0 ? (
                  <>
                    <select
                      value={treatmentRoom}
                      onChange={(event) => setTreatmentRoom(event.target.value)}
                      className="mt-3 min-h-14 w-full rounded-xl border-2 border-slate-300 bg-white px-4 text-xl font-bold focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-100"
                    >
                      <option value="">Select clinical room</option>
                      {clinicalRooms.map((room) => (
                        <option key={room.id} value={room.label}>
                          {room.label}
                        </option>
                      ))}
                    </select>
                    <p className="mt-2 text-sm font-medium text-slate-600">
                      Treatment rooms (operatories) only.
                    </p>
                  </>
                ) : clinicalRoomsState === "loading" ? (
                  <select
                    disabled
                    className="mt-3 min-h-14 w-full rounded-xl border-2 border-slate-300 bg-slate-100 px-4 text-xl font-bold text-slate-500"
                  >
                    <option>Loading clinical rooms...</option>
                  </select>
                ) : (
                  <>
                    <input
                      value={treatmentRoom}
                      onChange={(event) => setTreatmentRoom(event.target.value)}
                      placeholder="Enter clinical room"
                      className="mt-3 min-h-14 w-full rounded-xl border-2 border-amber-300 bg-white px-4 text-xl font-bold focus:border-amber-500 focus:outline-none focus:ring-4 focus:ring-amber-100"
                    />
                    <p className="mt-2 text-sm font-medium text-amber-700">
                      {clinicalRoomsState === "fallback"
                        ? "Configured rooms unavailable. Manual room entry enabled."
                        : "No active clinical rooms configured. Manual room entry enabled."}
                    </p>
                  </>
                )}
              </div>

              <TouchInput
                label="Procedure"
                value={procedure}
                onChange={setProcedure}
                placeholder="Example: Exam, cleaning, filling"
              />
            </div>
          </WorkflowStep>
        )}

        {stepIndex === 3 && (
          <WorkflowStep
            icon={ClipboardCheck}
            title="Review Trace"
            subtitle="Confirm the trace details before recording."
            footer={
              <StepFooter
                canContinue={!savingTrace}
                continueLabel={savingTrace ? "Recording..." : "Confirm Trace"}
                onBack={() => setStepIndex(2)}
                onContinue={confirmTrace}
              />
            }
          >
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <ReviewCard
                title="Pack Number"
                value={validatedPack?.pack_number || "N/A"}
              />
              <ReviewCard
                title="Patient"
                value={selectedPatient?.full_name || "N/A"}
              />
              <ReviewCard title="Provider" value={selectedProviderLabel || "N/A"} />
              <ReviewCard title="Procedure" value={procedure || "N/A"} />
              <ReviewCard
                title="Trace Date/Time"
                value={formatDateTime(traceDateTime?.toISOString() || null)}
              />
            </div>
          </WorkflowStep>
        )}

        {isSuccess && (
          <div className="flex min-h-0 flex-col items-center justify-center text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-green-100 text-green-700">
              <Check className="h-10 w-10" />
            </div>
            <h2 className="mt-5 text-4xl font-bold">
              Trace successfully recorded
            </h2>
            <p className="mt-3 text-lg text-slate-600">
              Pack {validatedPack?.pack_number} is linked to{" "}
              {selectedPatient?.full_name}.
            </p>
            <p className="mt-2 text-sm font-semibold text-slate-500">
              Returning to Workstation in {returnCountdown} seconds...
            </p>
            <Link
              href="/assistant"
              className="mt-6 inline-flex min-h-12 items-center justify-center rounded-xl bg-slate-950 px-6 py-3 text-base font-bold text-white transition-all hover:shadow-md active:scale-[0.98] active:brightness-95 active:shadow-inner"
            >
              Return to Workstation
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
  icon: ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-col">
      <div className="mb-4 flex shrink-0 items-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
          <Icon className="h-6 w-6" />
        </span>
        <div>
          <h2 className="text-2xl font-bold">{title}</h2>
          <p className="mt-1 text-sm text-slate-600">{subtitle}</p>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">{children}</div>
      <div className="shrink-0">{footer}</div>
    </div>
  );
}

function TouchInput({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  compact = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  compact?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-sm font-bold uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`w-full rounded-xl border-2 border-slate-300 px-4 font-bold focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-100 ${
          compact
            ? "mt-1.5 min-h-11 text-base"
            : "mt-3 min-h-14 text-xl"
        }`}
        placeholder={placeholder}
      />
    </label>
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
    <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-200 bg-white pt-4">
      <button
        type="button"
        onClick={onBack}
        disabled={!onBack}
        className="min-h-12 rounded-xl border border-slate-300 px-5 py-3 text-sm font-bold text-slate-700 transition-all hover:bg-slate-50 hover:shadow-sm active:scale-[0.98] active:brightness-95 active:shadow-inner disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100"
      >
        Back
      </button>

      <button
        type="button"
        onClick={onContinue}
        disabled={!canContinue}
        className="min-h-12 rounded-xl bg-slate-950 px-6 py-3 text-sm font-bold text-white shadow-sm transition-all hover:shadow-md active:scale-[0.98] active:brightness-95 active:shadow-inner disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100"
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
      <p className="mt-3 break-words text-xl font-bold text-slate-950">
        {value}
      </p>
    </div>
  );
}

function PackDetailsGrid({
  pack,
  compact = false,
}: {
  pack: ValidatedPack;
  compact?: boolean;
}) {
  const contents = pack.contents || pack.pack_type || "N/A";

  return (
    <div
      className={`mt-3 grid gap-2 text-sm ${
        compact ? "md:grid-cols-3 xl:grid-cols-6" : "md:grid-cols-2"
      }`}
    >
      <CompactDetail title="Pack" value={pack.pack_number} />
      <CompactDetail title="Cycle" value={pack.cycle_number} />
      <CompactDetail title="Contents" value={contents} />
      <CompactDetail title="Status" value={pack.status || "N/A"} />
      <CompactDetail title="Expiration" value={formatDateTime(pack.expires_at)} />
      <CompactDetail title="Created" value={formatDateTime(pack.created_at || null)} />
    </div>
  );
}

function CompactDetail({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <p className="text-[0.7rem] font-bold uppercase tracking-wide text-slate-500">
        {title}
      </p>
      <p className="mt-1 break-words text-sm font-bold text-slate-950">
        {value}
      </p>
    </div>
  );
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "N/A";
  }

  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
