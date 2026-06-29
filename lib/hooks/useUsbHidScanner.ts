"use client";

import { useEffect, useRef } from "react";

export const USB_HID_SCANNER_IDLE_TIMEOUT_MS = 50;

export type UsbHidScanHandler = (scan: string) => void;

export interface UseUsbHidScannerOptions {
  enabled?: boolean;
  idleTimeoutMs?: number;
}

function isEditableElement(element: Element | null): boolean {
  if (!(element instanceof HTMLElement)) {
    return false;
  }

  return (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element.isContentEditable
  );
}

/**
 * Listens for keyboard-wedge scanner input and emits complete QR or Code128
 * values. Scans finish when the device sends Enter or pauses between
 * characters for the configured idle timeout.
 */
export function useUsbHidScanner(
  onScan: UsbHidScanHandler,
  {
    enabled = true,
    idleTimeoutMs = USB_HID_SCANNER_IDLE_TIMEOUT_MS,
  }: UseUsbHidScannerOptions = {},
): void {
  const onScanRef = useRef(onScan);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let buffer = "";
    let idleTimer: ReturnType<typeof setTimeout> | null = null;

    function clearIdleTimer() {
      if (idleTimer !== null) {
        clearTimeout(idleTimer);
        idleTimer = null;
      }
    }

    function resetBuffer() {
      clearIdleTimer();
      buffer = "";
    }

    function completeScan() {
      clearIdleTimer();

      const scan = buffer.trim();
      buffer = "";

      if (scan) {
        onScanRef.current(scan);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (
        isEditableElement(event.target as Element | null) ||
        isEditableElement(document.activeElement)
      ) {
        resetBuffer();
        return;
      }

      if (event.key === "Enter") {
        if (buffer) {
          event.preventDefault();
          completeScan();
        }
        return;
      }

      if (
        event.key.length !== 1 ||
        event.ctrlKey ||
        event.altKey ||
        event.metaKey
      ) {
        return;
      }

      buffer += event.key;
      clearIdleTimer();
      idleTimer = setTimeout(completeScan, idleTimeoutMs);
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      resetBuffer();
    };
  }, [enabled, idleTimeoutMs]);
}
