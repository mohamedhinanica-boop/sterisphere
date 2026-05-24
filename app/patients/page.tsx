"use client";

import { useEffect, useState } from "react";
import { Html5QrcodeScanner } from "html5-qrcode";
import toast from "react-hot-toast";
import { supabase } from "@/lib/supabase";

type PatientTrace = {
  id: string;
  patient_name: string;
  provider: string;
  treatment_room: string;
  pack_number: string;
  procedure: string;
  created_at: string;
};

type Pack = {
  id: string;
  pack_number: string;
  cycle_number: string;
};

type Patient = {
  id: string;
  full_name: string;
  external_id: string | null;
  date_of_birth: string | null;
};

export default function PatientsPage() {
  const [records, setRecords] = useState<PatientTrace[]>([]);
  const [packs, setPacks] = useState<Pack[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [patientSearch, setPatientSearch] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const [manualPatient, setManualPatient] = useState({
    fullName: "",
    externalId: "",
    dateOfBirth: "",
  });

  const [form, setForm] = useState({
    patientId: "",
    provider: "",
    treatmentRoom: "",
    packId: "",
    procedure: "",
  });

  useEffect(() => {
    fetchRecords();
    fetchPacks();
    fetchPatients();
  }, []);

 useEffect(() => {
  if (!scannerOpen) return;

  const scanner = new Html5QrcodeScanner(
    "qr-reader",
    {
      fps: 10,
      qrbox: 250,
    },
    false
  );

  scanner.render(
    async (decodedText) => {
      const scannedPack = packs.find(
        (pack) => pack.pack_number === decodedText
      );

      if (!scannedPack) {
        toast.error("This pack is not available or has already been used.");

        try {
          await scanner.clear();
        } catch {}

        setScannerOpen(false);
        return;
      }

      updateForm("packId", scannedPack.id);
      toast.success("Available pack scanned successfully.");

      try {
        await scanner.clear();
      } catch {}

      setScannerOpen(false);
    },
    () => {}
  );

  return () => {
    try {
      scanner.clear();
    } catch {}
  };
}, [scannerOpen, packs]);

  async function fetchRecords() {
    const { data, error } = await supabase
      .from("patient_traces")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Error loading patient traceability records.");
      console.error(error);
      return;
    }

    setRecords(data || []);
  }

  async function fetchPacks() {
    const { data: allPacks, error: packsError } = await supabase
      .from("packs")
      .select("id, pack_number, cycle_number")
      .order("created_at", { ascending: false });

    if (packsError) {
      toast.error("Error loading packs.");
      console.error(packsError);
      return;
    }

    const { data: usedPacks, error: usedError } = await supabase
      .from("patient_traces")
      .select("pack_id");

    if (usedError) {
      toast.error("Error checking used packs.");
      console.error(usedError);
      return;
    }

    const { data: passedCycles, error: cyclesError } = await supabase
      .from("cycles")
      .select("cycle_number")
      .eq("status", "Passed");

    if (cyclesError) {
      toast.error("Error checking cycle status.");
      console.error(cyclesError);
      return;
    }

    const usedPackIds = new Set((usedPacks || []).map((record) => record.pack_id));
    const passedCycleNumbers = new Set(
      (passedCycles || []).map((cycle) => cycle.cycle_number)
    );

    const availablePacks = (allPacks || []).filter(
      (pack) =>
        !usedPackIds.has(pack.id) && passedCycleNumbers.has(pack.cycle_number)
    );

    setPacks(availablePacks);
  }

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

  function updateForm(field: string, value: string) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function addManualPatient() {
    if (!manualPatient.fullName) {
      toast.error("Patient full name is required.");
      return;
    }

    if (manualPatient.externalId) {
      const { data: existingPatient, error: checkError } = await supabase
        .from("patients")
        .select("id")
        .eq("external_id", manualPatient.externalId)
        .maybeSingle();

      if (checkError) {
        toast.error("Error checking patient file ID.");
        console.error(checkError);
        return;
      }

      if (existingPatient) {
        toast.error("This patient file ID already exists.");
        return;
      }
    }

    const { data, error } = await supabase
      .from("patients")
      .insert([
        {
          full_name: manualPatient.fullName,
          external_id: manualPatient.externalId || null,
          date_of_birth: manualPatient.dateOfBirth || null,
          source_system: "Manual",
        },
      ])
      .select()
      .single();

    if (error) {
      toast.error("Error adding patient.");
      console.error(error);
      return;
    }

    await fetchPatients();

    updateForm("patientId", data.id);
    setPatientSearch(data.full_name);

    setManualPatient({
      fullName: "",
      externalId: "",
      dateOfBirth: "",
    });

    toast.success("Manual patient added and selected.");
  }

  async function saveRecord() {
    if (
      !form.patientId ||
      !form.provider ||
      !form.treatmentRoom ||
      !form.packId ||
      !form.procedure
    ) {
      toast.error("Please fill all required fields.");
      return;
    }

    const selectedPack = packs.find((pack) => pack.id === form.packId);

    if (!selectedPack) {
      toast.error("Selected pack not found.");
      return;
    }

    const selectedPatient = patients.find(
      (patient) => patient.id === form.patientId
    );

    if (!selectedPatient) {
      toast.error("Selected patient not found.");
      return;
    }

    const { data: existingUse, error: checkError } = await supabase
      .from("patient_traces")
      .select("id")
      .eq("pack_id", form.packId)
      .maybeSingle();

    if (checkError) {
      toast.error("Error checking pack availability.");
      console.error(checkError);
      return;
    }

    if (existingUse) {
      toast.error("This pack has already been assigned to a patient.");
      await fetchPacks();
      return;
    }

    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error } = await supabase.from("patient_traces").insert([
      {
        patient_id: selectedPatient.id,
        patient_name: selectedPatient.full_name,
        provider: form.provider,
        treatment_room: form.treatmentRoom,
        pack_id: selectedPack.id,
        pack_number: selectedPack.pack_number,
        procedure: form.procedure,
        created_by: user?.email || "unknown",
      },
    ]);

    if (error) {
      toast.error("Error saving traceability record.");
      console.error(error);
      setLoading(false);
      return;
    }

    setForm({
      patientId: "",
      provider: "",
      treatmentRoom: "",
      packId: "",
      procedure: "",
    });

    setPatientSearch("");

    await fetchRecords();
    await fetchPacks();

    toast.success("Traceability record saved successfully.");
    setLoading(false);
  }

  const filteredPatients = patients.filter((patient) => {
    const search = patientSearch.toLowerCase();

    return (
      patient.full_name.toLowerCase().includes(search) ||
      (patient.external_id || "").toLowerCase().includes(search)
    );
  });

  return (
    <>
      <header className="mb-8">
        <h1 className="text-4xl font-bold">Patient Traceability</h1>
        <p className="mt-2 text-slate-600">
          Link sterilized instrument packs to patients and procedures.
        </p>
      </header>

      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 max-w-3xl mb-8">
        <h2 className="text-2xl font-semibold mb-6">
          New Patient Traceability Record
        </h2>

        <form className="space-y-5">
          <div>
            <label className="block text-sm font-medium mb-2">
              Patient Search
            </label>

            <input
              value={patientSearch}
              onChange={(e) => setPatientSearch(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3"
              placeholder="Search by patient name or file ID"
            />

            <select
              value={form.patientId}
              onChange={(e) => updateForm("patientId", e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 mt-3"
            >
              <option value="">Select a patient</option>

              {filteredPatients.map((patient) => (
                <option key={patient.id} value={patient.id}>
                  {patient.full_name}
                  {patient.external_id ? ` (${patient.external_id})` : ""}
                  {patient.date_of_birth
                    ? ` - DOB: ${patient.date_of_birth}`
                    : ""}
                </option>
              ))}
            </select>

            <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <h3 className="font-semibold mb-3">Add Manual Patient</h3>

              <div className="space-y-3">
                <input
                  value={manualPatient.fullName}
                  onChange={(e) =>
                    setManualPatient((current) => ({
                      ...current,
                      fullName: e.target.value,
                    }))
                  }
                  className="w-full rounded-xl border border-slate-300 px-4 py-3"
                  placeholder="Full name"
                />

                <input
                  value={manualPatient.externalId}
                  onChange={(e) =>
                    setManualPatient((current) => ({
                      ...current,
                      externalId: e.target.value,
                    }))
                  }
                  className="w-full rounded-xl border border-slate-300 px-4 py-3"
                  placeholder="File ID / chart number optional"
                />

                <input
                  type="date"
                  value={manualPatient.dateOfBirth}
                  onChange={(e) =>
                    setManualPatient((current) => ({
                      ...current,
                      dateOfBirth: e.target.value,
                    }))
                  }
                  className="w-full rounded-xl border border-slate-300 px-4 py-3"
                />

                <button
                  type="button"
                  onClick={addManualPatient}
                  className="rounded-xl bg-slate-700 text-white px-5 py-3 min-h-11 text-sm font-medium cursor-pointer hover:bg-slate-800 active:scale-95 transition"
                >
                  Add Manual Patient
                </button>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Provider</label>
            <input
              value={form.provider}
              onChange={(e) => updateForm("provider", e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3"
              placeholder="Example: Dre Ola"
            />
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
            <label className="block text-sm font-medium mb-2">
              Instrument Pack Number
            </label>

            <select
              value={form.packId}
              onChange={(e) => updateForm("packId", e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3"
            >
              <option value="">Select an instrument pack</option>

              {packs.map((pack) => (
                <option key={pack.id} value={pack.id}>
                  {pack.pack_number}
                </option>
              ))}
            </select>

            <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 p-4">
              <h3 className="font-semibold text-blue-900">QR Scanner</h3>

              <p className="mt-1 text-sm text-blue-700">
                Use this to scan a printed pack QR code. On mobile/tablet,
                allow camera access and tap Start Scanning if prompted.
              </p>

              <button
                type="button"
                onClick={() => setScannerOpen(true)}
                className="mt-4 w-full md:w-auto rounded-xl bg-blue-600 text-white px-5 py-3 min-h-11 text-sm font-medium cursor-pointer hover:bg-blue-700 active:scale-95 transition"
              >
                Open QR Scanner
              </button>

              {scannerOpen && (
                <div className="mt-4 rounded-xl border border-blue-300 bg-white p-3">
                  <p className="mb-3 text-sm font-medium text-slate-700">
                    Camera scanner active — point the camera at the pack QR
                    code.
                  </p>
<button
  type="button"
  onClick={() => setScannerOpen(false)}
  className="mb-3 rounded-xl bg-slate-700 text-white px-4 py-2 min-h-11 text-sm font-medium cursor-pointer hover:bg-slate-800 active:scale-95 transition"
>
  Close Scanner
</button>
                  <div
                    id="qr-reader"
                    className="overflow-hidden rounded-xl border border-slate-300"
                  />
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Procedure</label>
            <input
              value={form.procedure}
              onChange={(e) => updateForm("procedure", e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3"
              placeholder="Example: Hygiene cleaning / Extraction / Exam"
            />
          </div>

          <button
            type="button"
            onClick={saveRecord}
            disabled={loading}
            className="rounded-xl bg-slate-950 text-white px-6 py-3 min-h-11 font-medium cursor-pointer hover:bg-slate-800 active:scale-95 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Saving..." : "Save Traceability Record"}
          </button>
        </form>
      </section>

      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h2 className="text-2xl font-semibold mb-4">
          Saved Traceability Records
        </h2>

        {records.length === 0 ? (
          <p className="text-slate-500">No patient traceability records yet.</p>
        ) : (
          <div className="space-y-3">
            {records.map((record) => (
              <div
                key={record.id}
                className="rounded-xl border border-slate-200 p-4"
              >
                <div className="flex flex-col md:flex-row md:justify-between gap-2">
                  <h3 className="font-semibold">{record.patient_name}</h3>
                  <span className="text-sm text-slate-500">
                    {record.pack_number}
                  </span>
                </div>

                <p className="text-sm text-slate-600 mt-1">
                  Provider: {record.provider} · {record.treatment_room}
                </p>

                <p className="text-sm text-slate-500 mt-2">
                  Procedure: {record.procedure}
                </p>

                <p className="text-xs text-slate-400 mt-3">
                  Created: {new Date(record.created_at).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}