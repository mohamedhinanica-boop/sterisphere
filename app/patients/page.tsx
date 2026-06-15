"use client";

import { createAuditLog } from "@/lib/audit";
import { supabase } from "@/lib/supabase";
import { getProviders } from "@/lib/modules/traceability";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import SummaryCard from '@/components/patients/SummaryCard';
import PreviewRow from '@/components/patients/PreviewRow';
import TraceabilityFilters from "@/components/patients/TraceabilityFilters";
import TraceabilityRecordsList from "@/components/patients/TraceabilityRecordsList";
import { buildExportFileName, escapeCsvValue } from "@/components/patients/exportUtils";

type Patient = {
  id: string;
  external_id: string | null;
  full_name: string;
  date_of_birth: string | null;
  source_system: string | null;
};

type Pack = {
  id: string;
  pack_number: string;
  cycle_number: string;
  pack_type: string;
  status: string | null;
  expires_at: string | null;
};

type PatientTrace = {
  id: string;
  patient_name: string;
  provider: string;
  treatment_room: string;
  pack_number: string;
  procedure: string;
  created_at: string | null;
};

type Provider = {
  id: string;
  full_name: string;
  role: string | null;
  active: boolean;
};

type CycleStatus = {
  cycle_number: string;
  status: string;
};

type TraceFilters = {
  patientName: string;
  provider: string;
  packNumber: string;
  procedure: string;
  dateFrom: string;
  dateTo: string;
};

const itemsPerPage = 5;

export default function PatientsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedTraceId = searchParams.get("traceId");

  const [patients, setPatients] = useState<Patient[]>([]);
  const [packs, setPacks] = useState<Pack[]>([]);
  const [traces, setTraces] = useState<PatientTrace[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [patientSearch, setPatientSearch] = useState("");
  const [traceSearch, setTraceSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  const [filters, setFilters] = useState<TraceFilters>({
    patientName: "",
    provider: "",
    packNumber: "",
    procedure: "",
    dateFrom: "",
    dateTo: "",
  });

  const [form, setForm] = useState({
    patientId: "",
    packNumber: "",
    provider: "",
    treatmentRoom: "",
    procedure: "",
  });

  useEffect(() => {
    fetchPatients();
    fetchPacks();
    fetchTraces();
    fetchProviders();
  }, []);

 useEffect(() => {
  if (searchParams.get("today") !== "true") return;

  const now = new Date();
  const localToday = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");

  setFilters((current) => ({
    ...current,
    dateFrom: localToday,
    dateTo: localToday,
  }));

  setCurrentPage(1);
}, [searchParams]);

  async function fetchPatients() {
    const { data, error } = await supabase
      .from("patients")
      .select("*")
      .order("full_name", { ascending: true });

    if (error) {
      toast.error("Error loading patients.");
      console.error(error);
      return;
    }

    setPatients(data || []);
  }

  async function fetchPacks() {
    const now = new Date().toISOString();

    const { data: packData, error: packError } = await supabase
      .from("packs")
      .select("id, pack_number, cycle_number, pack_type, status, expires_at")
      .eq("status", "Available")
      .gte("expires_at", now)
      .order("created_at", { ascending: false });

    if (packError) {
      toast.error("Error loading available packs.");
      console.error(packError);
      return;
    }

    if (!packData || packData.length === 0) {
      setPacks([]);
      return;
    }

    const cycleNumbers = Array.from(
      new Set(packData.map((pack) => pack.cycle_number))
    );

    const { data: cycleData, error: cycleError } = await supabase
      .from("cycles")
      .select("cycle_number, status")
      .in("cycle_number", cycleNumbers);

    if (cycleError) {
      toast.error("Error validating cycle status for packs.");
      console.error(cycleError);
      return;
    }

    const passedCycles = new Set(
      (cycleData || [])
        .filter((cycle: CycleStatus) => cycle.status === "Passed")
        .map((cycle: CycleStatus) => cycle.cycle_number)
    );

    const { data: traceData, error: traceError } = await supabase
      .from("patient_traces")
      .select("pack_number")
      .in(
        "pack_number",
        packData.map((pack) => pack.pack_number)
      );

    if (traceError) {
      toast.error("Error validating used packs.");
      console.error(traceError);
      return;
    }

    const alreadyLinkedPacks = new Set(
      (traceData || []).map((trace) => trace.pack_number)
    );

    const usablePacks = packData.filter(
      (pack) =>
        passedCycles.has(pack.cycle_number) &&
        !alreadyLinkedPacks.has(pack.pack_number)
    );

    setPacks(usablePacks);
  }

  async function fetchTraces() {
    const { data, error } = await supabase
      .from("patient_traces")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Error loading patient traceability records.");
      console.error(error);
      return;
    }

    setTraces(data || []);
  }

  async function fetchProviders() {
    try {
      const data = await getProviders(supabase);
      setProviders(data);
    } catch (error) {
      toast.error("Error loading providers.");
      console.error(error);
    }
  }

  function updateForm(field: string, value: string) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function updateFilter(field: keyof TraceFilters, value: string) {
    setFilters((current) => ({
      ...current,
      [field]: value,
    }));
    setCurrentPage(1);
  }

  function clearFilters() {
    setFilters({
      patientName: "",
      provider: "",
      packNumber: "",
      procedure: "",
      dateFrom: "",
      dateTo: "",
    });
    setTraceSearch("");
    setCurrentPage(1);
    router.replace("/patients", { scroll: false });
  }

  function selectPatient(patient: Patient) {
    updateForm("patientId", patient.id);
    setPatientSearch(patient.full_name);
  }

  const selectedPatient = patients.find(
    (patient) => patient.id === form.patientId
  );

  const selectedPack = packs.find(
    (pack) => pack.pack_number === form.packNumber
  );

  const filteredPatients = patients.filter((patient) => {
    const search = patientSearch.toLowerCase();

    return (
      patient.full_name.toLowerCase().includes(search) ||
      patient.external_id?.toLowerCase().includes(search)
    );
  });

  const filteredTraces = traces.filter((trace) => {
    const quickSearch = traceSearch.toLowerCase();
    const patientFilter = filters.patientName.toLowerCase();
    const packFilter = filters.packNumber.toLowerCase();
    const procedureFilter = filters.procedure.toLowerCase();

    const matchesQuickSearch =
      !quickSearch ||
      trace.patient_name.toLowerCase().includes(quickSearch) ||
      trace.pack_number.toLowerCase().includes(quickSearch) ||
      trace.provider.toLowerCase().includes(quickSearch) ||
      trace.treatment_room.toLowerCase().includes(quickSearch) ||
      trace.procedure.toLowerCase().includes(quickSearch);

    const matchesPatient =
      !patientFilter || trace.patient_name.toLowerCase().includes(patientFilter);

    const matchesProvider =
      !filters.provider || trace.provider === filters.provider;

    const matchesPack =
      !packFilter || trace.pack_number.toLowerCase().includes(packFilter);

    const matchesProcedure =
      !procedureFilter ||
      trace.procedure.toLowerCase().includes(procedureFilter);

    const matchesDate = isTraceWithinDateRange(
      trace.created_at,
      filters.dateFrom,
      filters.dateTo
    );

    return (
      matchesQuickSearch &&
      matchesPatient &&
      matchesProvider &&
      matchesPack &&
      matchesProcedure &&
      matchesDate
    );
  });

  useEffect(() => {
    if (!selectedTraceId || filteredTraces.length === 0) return;

    const index = filteredTraces.findIndex(
      (trace) => trace.id === selectedTraceId
    );

    if (index === -1) return;

    const page = Math.floor(index / itemsPerPage) + 1;
    setCurrentPage(page);

    setTimeout(() => {
      const element = document.getElementById(`trace-${selectedTraceId}`);
      element?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 300);
  }, [selectedTraceId, filteredTraces]);

  const tracesToday = traces.filter((trace) => {
    if (!trace.created_at) return false;
    return (
      new Date(trace.created_at).toDateString() === new Date().toDateString()
    );
  });

  const totalPages = Math.ceil(filteredTraces.length / itemsPerPage);

  const paginatedTraces = filteredTraces.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  async function validatePackBeforeUse(packNumber: string) {
    const now = new Date().toISOString();

    const { data: pack, error: packError } = await supabase
      .from("packs")
      .select("id, pack_number, cycle_number, status, expires_at")
      .eq("pack_number", packNumber)
      .maybeSingle();

    if (packError || !pack) {
      throw new Error("Pack could not be validated.");
    }

    if (pack.status !== "Available") {
      throw new Error("This pack is no longer available.");
    }

    if (!pack.expires_at || pack.expires_at < now) {
      throw new Error("This pack is expired and cannot be used.");
    }

    const { data: cycle, error: cycleError } = await supabase
      .from("cycles")
      .select("status")
      .eq("cycle_number", pack.cycle_number)
      .maybeSingle();

    if (cycleError || !cycle) {
      throw new Error("Cycle could not be validated.");
    }

    if (cycle.status !== "Passed") {
      throw new Error("Only packs from Passed cycles can be used.");
    }

    const { data: existingTrace, error: traceError } = await supabase
      .from("patient_traces")
      .select("id")
      .eq("pack_number", packNumber)
      .maybeSingle();

    if (traceError) {
      throw new Error("Pack usage history could not be validated.");
    }

    if (existingTrace) {
      throw new Error("This pack is already linked to a patient.");
    }

    return pack;
  }

  async function saveTrace() {
    if (
      !selectedPatient ||
      !form.packNumber ||
      !form.provider ||
      !form.treatmentRoom ||
      !form.procedure
    ) {
      toast.error("Please fill all required fields.");
      return;
    }

    setLoading(true);

    try {
      const validatedPack = await validatePackBeforeUse(form.packNumber);

      const { data: newTrace, error } = await supabase
        .from("patient_traces")
        .insert([
          {
            patient_id: selectedPatient.id,
            patient_name: selectedPatient.full_name,
            provider: form.provider,
            treatment_room: form.treatmentRoom,
            pack_number: form.packNumber,
            pack_id: validatedPack.id,
            procedure: form.procedure,
          },
        ])
        .select()
        .single();

      if (error || !newTrace) {
        throw error || new Error("Error saving patient trace.");
      }

      await createAuditLog({
        action: "patient_trace_created",
        entityType: "patient_trace",
        entityId: newTrace.id,
        description: `Linked pack ${newTrace.pack_number} to patient ${newTrace.patient_name}`,
        metadata: {
          patient_name: newTrace.patient_name,
          pack_number: newTrace.pack_number,
          provider: newTrace.provider,
          treatment_room: newTrace.treatment_room,
          procedure: newTrace.procedure,
        },
      });

      const { error: packUpdateError } = await supabase
        .from("packs")
        .update({ status: "Used" })
        .eq("pack_number", form.packNumber)
        .eq("status", "Available");

      if (packUpdateError) {
        throw packUpdateError;
      }

      await createAuditLog({
        action: "pack_marked_used",
        entityType: "pack",
        entityId: validatedPack.id,
        description: `Pack ${form.packNumber} marked as used`,
        metadata: {
          pack_number: form.packNumber,
          patient_name: selectedPatient.full_name,
        },
      });

      setForm({
        patientId: "",
        packNumber: "",
        provider: "",
        treatmentRoom: "",
        procedure: "",
      });

      setPatientSearch("");
      setCurrentPage(1);

      await fetchTraces();
      await fetchPacks();

      toast.success("Patient traceability record saved. Pack marked as used.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Error saving patient trace.";

      toast.error(message);
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  async function exportFilteredCsv() {
    if (filteredTraces.length === 0) {
      toast.error("No traceability records to export.");
      return;
    }

    setExporting(true);

    try {
      const generatedAt = new Date();

      const metadataRows = [
        ["SteriSphere Traceability Export"],
        ["Generated At", generatedAt.toLocaleString()],
        ["Records Exported", String(filteredTraces.length)],
        ["Quick Search", traceSearch || "All"],
        ["Patient Filter", filters.patientName || "All"],
        ["Provider Filter", filters.provider || "All"],
        ["Pack Filter", filters.packNumber || "All"],
        ["Procedure Filter", filters.procedure || "All"],
        ["Date From", filters.dateFrom || "All"],
        ["Date To", filters.dateTo || "All"],
        [],
      ];

      const header = [
        "Patient Name",
        "Provider",
        "Treatment Room",
        "Procedure",
        "Pack Number",
        "Created At",
      ];

      const rows = filteredTraces.map((trace) => [
        trace.patient_name,
        trace.provider,
        trace.treatment_room,
        trace.procedure,
        trace.pack_number,
        formatDateTime(trace.created_at),
      ]);

      const csv = [...metadataRows, header, ...rows]
        .map((row) => row.map(escapeCsvValue).join(","))
        .join("\n");

      const blob = new Blob([csv], {
        type: "text/csv;charset=utf-8;",
      });

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download = buildExportFileName(filters, traceSearch);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      await createAuditLog({
        action: "traceability_csv_exported",
        entityType: "patient_trace",
        entityId: "traceability-export",
        description: `Exported ${filteredTraces.length} patient traceability record(s)`,
        metadata: {
          record_count: filteredTraces.length,
          quick_search: traceSearch || null,
          filters,
        },
      });

      toast.success("Traceability CSV exported.");
    } catch (error) {
      toast.error("Error exporting CSV.");
      console.error(error);
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <header className="mb-8">
        <h1 className="text-4xl font-bold">Patient Traceability</h1>
        <p className="mt-2 text-slate-600">
          Link available, non-expired sterilized instrument packs to patient care
          records.
        </p>
      </header>

      <div className="mb-6 flex flex-col gap-6 min-[1100px]:flex-row min-[1100px]:items-start">
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 min-[1100px]:basis-[68%]">
          <h2 className="text-2xl font-semibold mb-6">New Patient Trace</h2>

          <form className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Patient
              </label>

              <input
                value={patientSearch}
                onChange={(e) => {
                  setPatientSearch(e.target.value);
                  updateForm("patientId", "");
                }}
                className="w-full rounded-xl border border-slate-300 px-4 py-3"
                placeholder="Search by patient name or file ID"
              />

              {patientSearch && !form.patientId && (
                <div className="mt-3 space-y-2">
                  {filteredPatients.length === 0 ? (
                    <p className="text-sm text-slate-500">No patient found.</p>
                  ) : (
                    filteredPatients.slice(0, 5).map((patient) => (
                      <button
                        key={patient.id}
                        type="button"
                        onClick={() => selectPatient(patient)}
                        className="w-full rounded-xl border border-slate-200 bg-white p-4 text-left hover:bg-slate-50 cursor-pointer transition"
                      >
                        <p className="font-medium text-slate-900">
                          {patient.full_name}
                        </p>
                        <p className="text-sm text-slate-500">
                          File ID: {patient.external_id || "N/A"} · DOB:{" "}
                          {patient.date_of_birth || "N/A"}
                        </p>
                      </button>
                    ))
                  )}
                </div>
              )}

              {selectedPatient && (
                <div className="mt-3 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-700">
                  Selected patient: <strong>{selectedPatient.full_name}</strong>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Usable Instrument Pack
              </label>

              <select
                value={form.packNumber}
                onChange={(e) => updateForm("packNumber", e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-4 py-3"
              >
                <option value="">
                  {packs.length === 0
                    ? "No usable packs available"
                    : "Select a usable instrument pack"}
                </option>

                {packs.map((pack) => (
                  <option key={pack.id} value={pack.pack_number}>
                    {pack.pack_number} · {pack.pack_type} · Cycle:{" "}
                    {pack.cycle_number} · Expires: {formatDate(pack.expires_at)}
                  </option>
                ))}
              </select>

              <p className="mt-2 text-xs text-slate-500">
                Only Available, non-expired packs from Passed cycles are shown.
                Once linked to a patient, the pack is marked as Used.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Provider</label>

              <select
                value={form.provider}
                onChange={(e) => updateForm("provider", e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-4 py-3"
              >
                <option value="">Select a provider</option>

                {providers.map((provider) => (
                  <option key={provider.id} value={provider.full_name}>
                    {provider.full_name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Treatment Room
              </label>

              <input
                value={form.treatmentRoom}
                onChange={(e) => updateForm("treatmentRoom", e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-4 py-3"
                placeholder="Example: Room 2"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Procedure</label>

              <input
                value={form.procedure}
                onChange={(e) => updateForm("procedure", e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-4 py-3"
                placeholder="Example: Exam, cleaning, filling..."
              />
            </div>

            <button
              type="button"
              onClick={saveTrace}
              disabled={loading}
              className="rounded-xl bg-slate-950 text-white px-6 py-3 font-medium cursor-pointer hover:bg-slate-800 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Saving..." : "Save Patient Trace"}
            </button>
          </form>
        </section>

        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 min-[1100px]:basis-[32%]">
          <h2 className="text-xl font-semibold">Traceability Summary</h2>
          <p className="mt-1 text-sm text-slate-500">
            Quick operational overview for today.
          </p>

          <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2 gap-3">
            <SummaryCard label="Traces Today" value={tracesToday.length} />
            <SummaryCard label="Usable Packs" value={packs.length} />
            <SummaryCard label="Total Traces" value={traces.length} />
            <SummaryCard label="Providers" value={providers.length} />
          </div>
        </section>
      </div>

      <section className="mb-8 bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h2 className="text-xl font-semibold">Selected Pack Preview</h2>
        <p className="mt-1 text-sm text-slate-500">
          Confirm the pack before linking it to a patient.
        </p>

        {selectedPack ? (
          <div className="mt-5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
            <PreviewRow label="Pack Number" value={selectedPack.pack_number} />
            <PreviewRow label="Pack Type" value={selectedPack.pack_type} />
            <PreviewRow label="Cycle" value={selectedPack.cycle_number} />
            <PreviewRow
              label="Expires"
              value={formatDate(selectedPack.expires_at)}
            />

            <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm font-medium text-green-700 xl:flex xl:items-center">
              This pack is available and eligible for patient traceability.
            </div>
          </div>
        ) : (
          <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
            Select an instrument pack to preview its details here.
          </div>
        )}
      </section>

      <TraceabilityFilters
        filters={filters}
        providers={providers}
        filteredTraceCount={filteredTraces.length}
        totalTraceCount={traces.length}
        exporting={exporting}
        onClearFilters={clearFilters}
        onExportFilteredCsv={exportFilteredCsv}
        onUpdateFilter={updateFilter}
      />

      <TraceabilityRecordsList
        traceSearch={traceSearch}
        setTraceSearch={setTraceSearch}
        currentPage={currentPage}
        setCurrentPage={setCurrentPage}
        paginatedTraces={paginatedTraces}
        filteredTraces={filteredTraces}
        selectedTraceId={selectedTraceId}
        totalPages={totalPages}
        formatDateTime={formatDateTime}
      />

    </>
  );
}

function isTraceWithinDateRange(
  createdAt: string | null,
  dateFrom: string,
  dateTo: string
) {
  if (!dateFrom && !dateTo) return true;
  if (!createdAt) return false;

  const traceDate = new Date(createdAt);
  const traceLocalDate = [
    traceDate.getFullYear(),
    String(traceDate.getMonth() + 1).padStart(2, "0"),
    String(traceDate.getDate()).padStart(2, "0"),
  ].join("-");

  if (dateFrom && traceLocalDate < dateFrom) return false;
  if (dateTo && traceLocalDate > dateTo) return false;

  return true;
}

function formatDate(date: string | null) {
  if (!date) return "N/A";
  return new Date(date).toLocaleDateString();
}

function formatDateTime(date: string | null) {
  if (!date) return "N/A";
  return new Date(date).toLocaleString();
}
