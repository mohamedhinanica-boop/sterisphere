"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, FileSearch, Home } from "lucide-react";
import toast from "react-hot-toast";
import { supabase } from "@/lib/supabase";

type OpenInvestigation = {
  id: string;
  cycle_number: string;
  sterilizer: string;
  operator: string;
  investigation_status: string | null;
  created_at: string;
};

export default function AssistantInvestigationsPage() {
  const [investigations, setInvestigations] = useState<OpenInvestigation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadInvestigations();
  }, []);

  async function loadInvestigations() {
    setLoading(true);

    try {
      const { data, error } = await supabase
        .from("cycles")
        .select("id, cycle_number, sterilizer, operator, investigation_status, created_at")
        .eq("investigation_status", "Open")
        .order("created_at", { ascending: true })
        .returns<OpenInvestigation[]>();

      if (error) {
        throw error;
      }

      setInvestigations(data || []);
    } catch (error) {
      toast.error("Error loading investigations.");
      console.error("Assistant investigations load error:", error);
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
            Investigation Center
          </h1>
        </div>

        <Link
          href="/assistant"
          className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-white/10 px-4 py-3 text-sm font-bold text-white transition-all hover:bg-white/15 active:scale-[0.98] active:brightness-95 active:shadow-inner"
        >
          <ArrowLeft className="h-5 w-5" />
          Workstation
        </Link>
      </header>

      <section className="grid min-h-0 flex-1 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:overflow-hidden">
        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-lg font-bold text-slate-500">
            Loading investigations...
          </div>
        ) : investigations.length === 0 ? (
          <div className="flex min-h-0 flex-1 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 p-8 text-center">
            <div>
              <FileSearch className="mx-auto h-14 w-14 text-slate-500" />
              <h2 className="mt-4 text-3xl font-black">No Open Investigations</h2>
              <p className="mt-2 text-base font-semibold text-slate-500">
                Open cycle investigations will appear here.
              </p>
              <Link
                href="/assistant"
                className="mt-6 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-slate-950 px-6 py-3 text-base font-bold text-white shadow-sm transition-all hover:shadow-md active:scale-[0.98] active:brightness-95 active:shadow-inner"
              >
                <Home className="h-5 w-5" />
                Back to Workstation
              </Link>
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-col">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-2xl font-black">Open Investigations</h2>
                <p className="mt-1 text-sm font-semibold text-slate-500">
                  {investigations.length} cycle{investigations.length === 1 ? "" : "s"} need follow-up.
                </p>
              </div>
              <button
                type="button"
                onClick={loadInvestigations}
                className="min-h-11 rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 transition-all hover:bg-slate-50 hover:shadow-sm active:scale-[0.98] active:brightness-95 active:shadow-inner"
              >
                Refresh
              </button>
            </div>

            <div className="grid min-h-0 gap-3 overflow-y-auto pr-1 md:grid-cols-2 lg:grid-cols-3">
              {investigations.map((investigation) => (
                <article
                  key={investigation.id}
                  className="flex min-h-[12rem] flex-col justify-between rounded-2xl border border-red-200 bg-red-50 p-4 text-red-950 shadow-sm"
                >
                  <div>
                    <p className="text-sm font-bold uppercase tracking-wide text-red-700">
                      Investigation Open
                    </p>
                    <h3 className="mt-2 break-words text-2xl font-black">
                      {investigation.cycle_number}
                    </h3>
                    <div className="mt-3 grid gap-2 text-sm">
                      <Detail label="Sterilizer" value={investigation.sterilizer} />
                      <Detail label="Operator" value={investigation.operator || "N/A"} />
                    </div>
                  </div>
                  <span className="mt-4 text-sm font-black text-red-800">
                    Investigation remains open.
                  </span>
                </article>
              ))}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <p>
      <span className="block text-xs font-bold uppercase tracking-wide opacity-65">
        {label}
      </span>
      <span className="mt-1 line-clamp-2 block break-words text-base font-black">
        {value}
      </span>
    </p>
  );
}
