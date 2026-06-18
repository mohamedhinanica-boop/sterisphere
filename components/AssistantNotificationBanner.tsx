"use client";

import { useEffect } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  ShieldAlert,
} from "lucide-react";

export type AssistantNotificationVariant =
  | "success"
  | "warning"
  | "critical"
  | "info";

export type AssistantNotification = {
  title: string;
  message: string;
  detail?: string;
  variant: AssistantNotificationVariant;
};

type AssistantNotificationBannerProps = {
  notification: AssistantNotification | null;
  onDismiss: () => void;
  durationMs?: number;
};

const variantStyles = {
  success: {
    shell: "border-green-200 bg-green-50 text-green-950 shadow-green-950/10",
    icon: "bg-green-600 text-white",
    Icon: CheckCircle2,
  },
  warning: {
    shell: "border-yellow-200 bg-yellow-50 text-yellow-950 shadow-yellow-950/10",
    icon: "bg-yellow-500 text-yellow-950",
    Icon: AlertTriangle,
  },
  critical: {
    shell: "border-red-200 bg-red-50 text-red-950 shadow-red-950/10",
    icon: "bg-red-600 text-white",
    Icon: ShieldAlert,
  },
  info: {
    shell: "border-blue-200 bg-blue-50 text-blue-950 shadow-blue-950/10",
    icon: "bg-blue-600 text-white",
    Icon: Info,
  },
};

export default function AssistantNotificationBanner({
  notification,
  onDismiss,
  durationMs = 5500,
}: AssistantNotificationBannerProps) {
  useEffect(() => {
    if (!notification) {
      return;
    }

    const timer = window.setTimeout(onDismiss, durationMs);
    return () => window.clearTimeout(timer);
  }, [durationMs, notification, onDismiss]);

  const activeStyles = notification
    ? variantStyles[notification.variant]
    : variantStyles.info;
  const Icon = activeStyles.Icon;

  return (
    <div className="pointer-events-none fixed left-0 right-0 top-3 z-50 flex justify-center px-3 sm:top-4">
      <div
        aria-live="polite"
        className={`w-full max-w-[min(42rem,calc(100vw-1.5rem))] rounded-[2rem] border px-4 py-3 shadow-2xl transition-all duration-300 ease-out sm:px-5 ${
          notification
            ? "translate-y-0 scale-100 opacity-100"
            : "-translate-y-4 scale-95 opacity-0"
        } ${activeStyles.shell}`}
      >
        <div className="flex items-center gap-3">
          <span
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${activeStyles.icon}`}
          >
            <Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-base font-black leading-tight sm:text-lg">
              {notification?.title || "Notification"}
            </p>
            <p className="mt-1 break-words text-sm font-bold leading-snug sm:text-base">
              {notification?.message || ""}
            </p>
            {notification?.detail && (
              <p className="mt-1 break-words text-xs font-semibold opacity-75 sm:text-sm">
                {notification.detail}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
