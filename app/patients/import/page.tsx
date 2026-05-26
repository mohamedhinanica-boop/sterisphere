"use client";

import { useState } from "react";
import Papa from "papaparse";
import { supabase } from "@/lib/supabase";

type PatientRow = {
  external_id?: string | null;
  full_name: string;
  date_of_birth?: string | null;
  source_system?: string | null;
};

export default function ImportPatientsPage() {
  const [rows, setRows] = useState<PatientRow[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState("");
  const [messageType, setMessageType] = useState<"success" | "warning">(
    "success"
  );

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrors([]);
    setSuccess("");
    setMessageType("success");

    Papa.parse<PatientRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        const parsedRows = result.data
          .filter(
            (row) =>
              row.full_name ||
              row.external_id ||
              row.date_of_birth ||
              row.source_system
          )
          .map((row) => ({
            external_id: row.external_id?.trim() || null,
            full_name: row.full_name?.trim(),
            date_of_birth: row.date_of_birth?.trim() || null,
            source_system: row.source_system?.trim() || "CSV Import",
          }));

        const validationErrors: string[] = [];

        parsedRows.forEach((row, index) => {
          if (!row.full_name) {
            validationErrors.push(`Row ${index + 2}: full_name is required`);
          }
        });

        setErrors(validationErrors);

        if (validationErrors.length === 0) {
          setRows(parsedRows as PatientRow[]);
        } else {
          setRows([]);
        }
      },
      error: () => {
        setErrors(["Unable to read the CSV file."]);
        setRows([]);
      },
    });
  }

  async function importPatients() {
    if (rows.length === 0) return;

    setLoading(true);
    setErrors([]);
    setSuccess("");

    const externalIds = rows
      .filter((row) => row.external_id)
      .map((row) => row.external_id as string);

    let existingExternalIds = new Set<string>();

    if (externalIds.length > 0) {
      const { data: existingPatients, error: checkError } = await supabase
        .from("patients")
        .select("external_id")
        .in("external_id", externalIds);

      if (checkError) {
        setErrors([checkError.message]);
        setLoading(false);
        return;
      }

      existingExternalIds = new Set(
        existingPatients
          ?.map((patient) => patient.external_id)
          .filter(Boolean) as string[]
      );
    }

    const rowsToImport = rows.filter(
      (row) => !row.external_id || !existingExternalIds.has(row.external_id)
    );

    const skippedCount = rows.length - rowsToImport.length;

    if (rowsToImport.length === 0) {
      setMessageType("warning");
      setSuccess(
        `No new patients imported. ${skippedCount} duplicate patient(s) skipped.`
      );
      setRows([]);
      setLoading(false);
      return;
    }

    const { error } = await supabase.from("patients").insert(rowsToImport);

    if (error) {
      setErrors([error.message]);
    } else {
      setMessageType(skippedCount > 0 ? "warning" : "success");
      setSuccess(
        `${rowsToImport.length} patient(s) imported successfully. ${skippedCount} duplicate patient(s) skipped.`
      );
      setRows([]);
    }

    setLoading(false);
  }

  return (
    <main className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Import Patients
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Upload a CSV file to import patients into SteriSphere.
          </p>
        </div>

        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <label className="block text-sm font-medium text-slate-700">
            CSV file
          </label>

          <input
            type="file"
            accept=".csv"
            onChange={handleFileUpload}
            className="mt-3 block w-full rounded-xl border border-slate-300 bg-white p-3 text-sm"
          />

          <div className="mt-4 rounded-xl bg-slate-100 p-4 text-sm text-slate-700">
            <p className="font-medium">Required format:</p>
            <pre className="mt-2 overflow-x-auto text-xs">
{`external_id,full_name,date_of_birth,source_system
12345,John Smith,1985-04-22,Dentitek
12346,Maria Tremblay,1979-11-05,ABELDent`}
            </pre>

            <p className="mt-3 text-xs text-slate-600">
              Date format must be YYYY-MM-DD. Source system can be Dentitek,
              ABELDent, AD2000, Progident, Manual, or CSV Import.
            </p>
          </div>
        </div>

        {errors.length > 0 && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <strong>Import error:</strong>
            <ul className="mt-2 list-disc pl-5">
              {errors.map((err, index) => (
                <li key={index}>{err}</li>
              ))}
            </ul>
          </div>
        )}

        {success && (
          <div
            className={`rounded-2xl border p-4 text-sm ${
              messageType === "warning"
                ? "border-yellow-200 bg-yellow-50 text-yellow-800"
                : "border-green-200 bg-green-50 text-green-700"
            }`}
          >
            {success}
          </div>
        )}

        {rows.length > 0 && (
          <div className="rounded-2xl border bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-4">
              <h2 className="text-lg font-semibold text-slate-900">
                Preview: {rows.length} patients
              </h2>

              <button
                onClick={importPatients}
                disabled={loading}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white cursor-pointer hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Importing..." : "Import Patients"}
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b bg-slate-50 text-left">
                    <th className="p-3">External ID</th>
                    <th className="p-3">Full name</th>
                    <th className="p-3">Date of birth</th>
                    <th className="p-3">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => (
                    <tr key={index} className="border-b">
                      <td className="p-3">{row.external_id || "-"}</td>
                      <td className="p-3 font-medium">{row.full_name}</td>
                      <td className="p-3">{row.date_of_birth || "-"}</td>
                      <td className="p-3">{row.source_system || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}