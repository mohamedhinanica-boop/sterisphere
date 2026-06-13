"use client";

import { QRCodeSVG } from "qrcode.react";
import type { LabelData } from "@/lib/modules/labels/types";

export default function LabelPreviewModal({
  labelData,
  onClose,
  onPrint,
}: {
  labelData: LabelData;
  onClose: () => void;
  onPrint: () => void;
}) {
  const packType = labelData.packType || "Instrument Pack";
  const expiry = labelData.expiresAt
    ? new Date(labelData.expiresAt).toLocaleDateString()
    : "N/A";

  return (
    <>
      <style jsx global>{`
        @media print {
          @page {
            size: 50mm 30mm;
            margin: 0;
          }

          html,
          body {
            width: 50mm;
            height: 30mm;
            margin: 0 !important;
            padding: 0 !important;
            overflow: hidden !important;
            background: white !important;
          }

          body * {
            visibility: hidden !important;
          }

          .label-print-area,
          .label-print-area * {
            visibility: visible !important;
          }

          .label-print-area {
            display: flex !important;
            position: fixed !important;
            left: 0 !important;
            top: 0 !important;
            width: 50mm !important;
            height: 30mm !important;
            margin: 0 !important;
            padding: 1.5mm !important;
            box-sizing: border-box !important;
            align-items: center !important;
            gap: 2mm !important;
            background: white !important;
            color: black !important;
            font-family: Arial, Helvetica, sans-serif !important;
            box-shadow: none !important;
            border: none !important;
          }

          .label-qr {
            width: 18mm !important;
            height: 27mm !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            flex-shrink: 0 !important;
          }

          .label-qr svg {
            width: 18mm !important;
            height: 18mm !important;
          }

          .label-info {
            width: 27mm !important;
            height: 27mm !important;
            display: flex !important;
            flex-direction: column !important;
            justify-content: center !important;
            overflow: hidden !important;
          }

          .label-title {
            font-size: 10px !important;
            font-weight: 900 !important;
            line-height: 1 !important;
            white-space: nowrap !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
          }

          .label-line {
            height: 1px !important;
            background: #000 !important;
            width: 100% !important;
            margin: 2.2mm 0 !important;
          }

          .label-row {
            display: flex !important;
            align-items: baseline !important;
            gap: 1mm !important;
            white-space: nowrap !important;
            line-height: 1 !important;
          }

          .label-key {
            font-size: 7px !important;
            font-weight: 800 !important;
          }

          .label-value {
            font-size: 8px !important;
            font-weight: 900 !important;
          }

          .label-pack {
            font-size: 6px !important;
          }

          .no-print {
            display: none !important;
          }
        }
      `}</style>

      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 no-print">
        <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold">Label Preview</h2>
              <p className="mt-1 text-sm text-slate-500">
                Standard 50 × 30 mm SteriSphere pack label.
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium"
            >
              Close
            </button>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <div className="mx-auto flex h-[180px] w-[300px] flex-col items-center justify-between rounded-xl border border-slate-300 bg-white p-3 text-center shadow-sm">
              <p className="text-sm font-bold text-slate-950">{packType}</p>

              <QRCodeSVG value={labelData.qrValue} size={96} />

              <div>
                <p className="text-[11px] font-semibold text-slate-900">
                  EXP {expiry}
                </p>
                <p className="text-[10px] font-semibold text-slate-700">
                  {labelData.packNumber}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-5 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-medium"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={onPrint}
              className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-medium text-white"
            >
              Print Label
            </button>
          </div>
        </div>
      </div>

      <div className="label-print-area hidden bg-white text-black">
        <div className="label-qr">
          <QRCodeSVG value={labelData.qrValue} size={78} />
        </div>

        <div className="label-info">
          <div className="label-title">{packType}</div>

          <div className="label-line" />

          <div className="label-row">
            <span className="label-key">EXP:</span>
            <span className="label-value">{expiry}</span>
          </div>

          <div className="label-line" />

          <div className="label-row">
            <span className="label-key">PACK:</span>
            <span className="label-value label-pack">
              {labelData.packNumber}
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
