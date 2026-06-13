"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { supabase } from "@/lib/supabase";
import CompactDetail from "@/components/packs/CompactDetail";
import type { ExtendedPack, PatientTrace } from "@/components/packs/types";
import {
  formatInitials,
  formatLoadComposition,
  formatPackDate,
  getPackEffectiveStatus,
} from "@/lib/modules/packs";

export default function PackDetailsModal({
  pack,
  onClose,
  onPrintLabel,
}: {
  pack: ExtendedPack;
  onClose: () => void;
  onPrintLabel: (pack: ExtendedPack) => void;
}) {
  const effectiveStatus = getPackEffectiveStatus(pack);
  const compositionItems = formatLoadComposition(pack.cycle_load_summary);
  const [trace, setTrace] = useState<PatientTrace | null>(null);
  const [loadingTrace, setLoadingTrace] = useState(true);

  useEffect(() => {
    loadTrace();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pack.id]);

  async function loadTrace() {
    setLoadingTrace(true);

    const { data: traceByPackId, error: packIdError } = await supabase
      .from("patient_traces")
      .select(
        "id, patient_name, provider, treatment_room, procedure, created_at, pack_id, pack_number",
      )
      .eq("pack_id", pack.id)
      .maybeSingle();

    if (packIdError) {
      console.error(packIdError);
    }

    if (traceByPackId) {
      setTrace(traceByPackId);
      setLoadingTrace(false);
      return;
    }

    const { data: traceByPackNumber, error: packNumberError } = await supabase
      .from("patient_traces")
      .select(
        "id, patient_name, provider, treatment_room, procedure, created_at, pack_id, pack_number",
      )
      .eq("pack_number", pack.pack_number)
      .maybeSingle();

    if (packNumberError) {
      console.error(packNumberError);
    }

    setTrace(traceByPackNumber || null);
    setLoadingTrace(false);
  }

  const canPrintLabel = effectiveStatus === "Available";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 no-print">
      <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold">Pack Details</h2>
            <p className="mt-1 text-sm text-slate-500">
              Sterilization pack identity, lifecycle, and usage information.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50"
          >
            Close
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_220px] gap-5">
          <div className="space-y-4">
            <div>
              <h3 className="mb-3 text-sm font-semibold text-slate-900">
                Pack Identity
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <DetailRow label="Pack Number" value={pack.pack_number} />
                <DetailRow label="Status" value={effectiveStatus} />
                <DetailRow label="Pack Type" value={pack.pack_type} />
                <DetailRow label="Cycle Number" value={pack.cycle_number} />
              </div>
            </div>

            <div>
              <h3 className="mb-3 text-sm font-semibold text-slate-900">
                Sterilization
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <DetailRow
                  label="Created Date"
                  value={new Date(pack.created_at).toLocaleString()}
                />

                <DetailRow
                  label="Sterilized Date"
                  value={formatPackDate(pack.sterilized_at)}
                />

                <DetailRow
                  label="Expiry Date"
                  value={formatPackDate(pack.expires_at)}
                />

                <DetailRow
                  label="Sterilizer"
                  value={pack.cycle?.sterilizer || "N/A"}
                />

                <DetailRow
                  label="Started By"
                  value={formatInitials(pack.cycle?.operator)}
                />

                <DetailRow
                  label="Completed By"
                  value={formatInitials(pack.cycle?.released_by)}
                />
              </div>
            </div>

            <div>
              <h3 className="mb-3 text-sm font-semibold text-slate-900">
                Load Information
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <DetailRow
                  label="Load Position"
                  value={
                    pack.load_item_index && pack.load_item_total
                      ? `${pack.load_item_index} of ${pack.load_item_total}`
                      : "N/A"
                  }
                />

                <DetailRow
                  label="Cycle Pack Total"
                  value={
                    pack.cycle_pack_total
                      ? `${pack.cycle_pack_total} pack(s)`
                      : "N/A"
                  }
                />
              </div>

              {compositionItems.length > 0 && (
                <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                    Load Composition
                  </p>

                  <ul className="mt-2 space-y-1 text-sm font-medium text-slate-700">
                    {compositionItems.map((item) => (
                      <li key={item}>• {item}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <QRCodeSVG value={pack.pack_number} size={150} />

              <p className="mt-4 text-center text-sm font-semibold text-slate-700">
                {pack.pack_number}
              </p>

              <p className="mt-1 text-center text-xs text-slate-500">
                Scan to identify this pack.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-slate-900">
                Usage Information
              </h3>

              {loadingTrace ? (
                <p className="mt-3 text-sm text-slate-500">
                  Loading usage information...
                </p>
              ) : trace ? (
                <div className="mt-3 space-y-2 text-sm">
                  <CompactDetail label="Patient" value={trace.patient_name} />
                  <CompactDetail label="Provider" value={trace.provider} />
                  <CompactDetail label="Procedure" value={trace.procedure} />
                  <CompactDetail label="Room" value={trace.treatment_room} />
                  <CompactDetail
                    label="Used On"
                    value={
                      trace.created_at
                        ? new Date(trace.created_at).toLocaleString()
                        : "N/A"
                    }
                  />
                  <button
                    type="button"
                    onClick={() =>
                      (window.location.href = `/patients?traceId=${trace.id}`)
                    }
                    className="mt-3 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                  >
                    View Traceability Record
                  </button>
                </div>
              ) : (
                <div className="mt-3 rounded-xl border border-green-200 bg-green-50 p-3">
                  <p className="text-sm font-medium text-green-700">
                    This pack has not yet been linked to a patient.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-medium hover:bg-slate-50"
          >
            Close
          </button>

          <button
            type="button"
            disabled={!canPrintLabel}
            onClick={() => onPrintLabel(pack)}
            className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            Print Label
          </button>
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className="mt-1 font-semibold text-slate-800">{value || "N/A"}</p>
    </div>
  );
}
