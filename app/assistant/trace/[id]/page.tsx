"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ClipboardList,
  Home,
  Package,
  UserRound,
} from "lucide-react";
import toast from "react-hot-toast";
import { supabase } from "@/lib/supabase";

type TraceRecord = {
  id: string;
  patient_id: string | null;
  patient_name: string;
  provider: string;
  treatment_room: string;
  procedure: string;
  created_at: string | null;
  pack_id: string | null;
  pack_number: string;
};

type PatientRecord = {
  id: string;
  external_id: string | null;
  full_name: string;
};

type PackRecord = {
  id: string;
  pack_number: string;
  cycle_number: string;
  pack_type: string;
  contents: string | null;
};

export default function AssistantTraceDetailsPage() {
  const params = useParams<{ id: string }>();
  const traceId = params.id;
  const [trace, setTrace] = useState<TraceRecord | null>(null);
  const [patient, setPatient] = useState<PatientRecord | null>(null);
  const [pack, setPack] = useState<PackRecord | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTraceDetails();
  }, [traceId]);

  async function loadTraceDetails() {
    setLoading(true);
    setPatient(null);
    setPack(null);

    try {
      const { data: traceData, error: traceError } = await supabase
        .from("patient_traces")
        .select(
          "id, patient_id, patient_name, provider, treatment_room, procedure, created_at, pack_id, pack_number"
        )
        .eq("id", traceId)
        .maybeSingle<TraceRecord>();

      if (traceError) {
        throw traceError;
      }

      if (!traceData) {
        setTrace(null);
        return;
      }

      setTrace(traceData);

      if (traceData.patient_id) {
        const { data: patientData, error: patientError } = await supabase
          .from("patients")
          .select("id, external_id, full_name")
          .eq("id", traceData.patient_id)
          .maybeSingle<PatientRecord>();

        if (patientError) {
          throw patientError;
        }

        setPatient(patientData || null);
      }

      if (traceData.pack_id) {
        const { data: packById, error: packByIdError } = await supabase
          .from("packs")
          .select("id, pack_number, cycle_number, pack_type, contents")
          .eq("id", traceData.pack_id)
          .maybeSingle<PackRecord>();

        if (packByIdError) {
          throw packByIdError;
        }

        if (packById) {
          setPack(packById);
          return;
        }
      }

      const { data: packByNumber, error: packByNumberError } = await supabase
        .from("packs")
        .select("id, pack_number, cycle_number, pack_type, contents")
        .eq("pack_number", traceData.pack_number)
        .maybeSingle<PackRecord>();

      if (packByNumberError) {
        throw packByNumberError;
      }

      setPack(packByNumber || null);
    } catch (error) {
      toast.error("Error loading traceability details.");
      console.error("Assistant trace details load error:", error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-[100svh] flex-col bg-slate-100 p-3 text-slate-950 lg:h-[100svh] lg:overflow-hidden">
      <header className="mb-3 flex items-center justify-between gap-3 rounded-2xl bg-slate-950 px-4 py-3 text-white shadow-sm">
        <div>
          <p className="text-sm font-semibold text-slate-300">
            SteriSphere Workstation
          </p>
          <h1 className="text-2xl font-bold tracking-normal">
            Traceability Details
          </h1>
        </div>

        <Link
          href="/assistant/inventory"
          className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-white/10 px-4 py-3 text-sm font-bold text-white transition-all hover:bg-white/15 active:scale-[0.98] active:brightness-95 active:shadow-inner"
        >
          <ArrowLeft className="h-5 w-5" />
          Inventory
        </Link>
      </header>

      <section className="grid min-h-0 flex-1 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:overflow-hidden">
        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-lg font-bold text-slate-500">
            Loading traceability details...
          </div>
        ) : !trace ? (
          <div className="flex min-h-0 flex-1 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 p-8 text-center">
            <div>
              <ClipboardList className="mx-auto h-14 w-14 text-slate-500" />
              <h2 className="mt-4 text-3xl font-black">Trace Not Found</h2>
              <Link
                href="/assistant/inventory"
                className="mt-6 inline-flex min-h-12 items-center justify-center rounded-xl bg-slate-950 px-6 py-3 text-base font-bold text-white transition-all hover:shadow-md active:scale-[0.98] active:brightness-95 active:shadow-inner"
              >
                Back to Inventory
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid min-h-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.38fr)]">
            <section className="min-h-0 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-4 pr-3">
              <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-blue-950">
                <div>
                  <p className="text-sm font-bold uppercase tracking-wide text-blue-700">
                    Patient
                  </p>
                  <h2 className="mt-1 break-words text-4xl font-black">
                    {trace.patient_name}
                  </h2>
                  <p className="mt-2 text-base font-bold text-blue-800">
                    File ID: {patient?.external_id || "N/A"}
                  </p>
                </div>
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-blue-800 shadow-sm">
                  <UserRound className="h-7 w-7" />
                </span>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                <Detail title="Provider" value={trace.provider} />
                <Detail title="Treatment Room" value={trace.treatment_room} />
                <Detail title="Procedure" value={trace.procedure} />
                <Detail title="Pack Number" value={trace.pack_number} />
                <Detail
                  title="Pack Contents"
                  value={pack?.contents || pack?.pack_type || "N/A"}
                />
                <Detail title="Cycle Number" value={pack?.cycle_number || "N/A"} />
                <Detail
                  title="Trace Date / Time"
                  value={formatDateTime(trace.created_at)}
                />
                <Detail title="Patient External ID" value={patient?.external_id || "N/A"} />
                <Detail title="Trace Record ID" value={trace.id} />
              </div>
            </section>

            <aside className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-sm font-bold uppercase tracking-wide text-slate-500">
                  Pack
                </p>
                <p className="mt-2 break-words text-2xl font-black">
                  {pack?.pack_number || trace.pack_number}
                </p>
                <p className="mt-1 text-sm font-bold text-slate-500">
                  Cycle {pack?.cycle_number || "N/A"}
                </p>
              </div>

              <Link
                href="/assistant/inventory"
                className="inline-flex min-h-14 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-3 text-base font-bold text-slate-800 shadow-sm transition-all hover:shadow-md active:scale-[0.98] active:brightness-95 active:shadow-inner"
              >
                <ArrowLeft className="h-5 w-5" />
                Back to Inventory
              </Link>

              <Link
                href="/assistant"
                className="inline-flex min-h-14 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-3 text-base font-bold text-slate-800 shadow-sm transition-all hover:shadow-md active:scale-[0.98] active:brightness-95 active:shadow-inner"
              >
                <Home className="h-5 w-5" />
                Back to Workstation
              </Link>

              {pack && (
                <Link
                  href={`/assistant/inventory?packId=${pack.id}`}
                  className="inline-flex min-h-14 items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 py-3 text-base font-bold text-white shadow-sm transition-all hover:shadow-md active:scale-[0.98] active:brightness-95 active:shadow-inner"
                >
                  <Package className="h-5 w-5" />
                  View Pack Details
                </Link>
              )}
            </aside>
          </div>
        )}
      </section>
    </main>
  );
}

function Detail({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-sm font-bold uppercase tracking-wide text-slate-500">
        {title}
      </p>
      <p className="mt-2 break-words text-xl font-black text-slate-950">
        {value || "N/A"}
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
