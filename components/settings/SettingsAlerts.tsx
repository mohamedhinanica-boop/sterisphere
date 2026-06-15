import { Panel } from "./index";

type SettingsAlertsProps = {
  soundAlertsEnabled: boolean;
  soundAlertCycleComplete: boolean;
  soundAlertCycleOverdue: boolean;
  soundAlertFailedCycle: boolean;
  soundAlertExpiringPacks: boolean;
  soundAlertExpiredPacks: boolean;
  onSoundAlertsEnabledChange: (value: boolean) => void;
  onSoundAlertCycleCompleteChange: (value: boolean) => void;
  onSoundAlertCycleOverdueChange: (value: boolean) => void;
  onSoundAlertFailedCycleChange: (value: boolean) => void;
  onSoundAlertExpiringPacksChange: (value: boolean) => void;
  onSoundAlertExpiredPacksChange: (value: boolean) => void;
  onSaveSoundAlertSettings: () => void;
  loading: boolean;
  canManageSettings: boolean;
};

export default function SettingsAlerts({
  soundAlertsEnabled,
  soundAlertCycleComplete,
  soundAlertCycleOverdue,
  soundAlertFailedCycle,
  soundAlertExpiringPacks,
  soundAlertExpiredPacks,
  onSoundAlertsEnabledChange,
  onSoundAlertCycleCompleteChange,
  onSoundAlertCycleOverdueChange,
  onSoundAlertFailedCycleChange,
  onSoundAlertExpiringPacksChange,
  onSoundAlertExpiredPacksChange,
  onSaveSoundAlertSettings,
  loading,
  canManageSettings,
}: SettingsAlertsProps) {
  const alertOptions = [
    {
      label: "Cycle completed",
      description: "Play a sound when a cycle reaches its expected finish time.",
      checked: soundAlertCycleComplete,
      onChange: onSoundAlertCycleCompleteChange,
    },
    {
      label: "Cycle overdue",
      description: "Play a sound when a pending cycle is past its expected duration.",
      checked: soundAlertCycleOverdue,
      onChange: onSoundAlertCycleOverdueChange,
    },
    {
      label: "Failed cycle",
      description: "Play a sound when a failed cycle needs review or investigation.",
      checked: soundAlertFailedCycle,
      onChange: onSoundAlertFailedCycleChange,
    },
    {
      label: "Packs expiring soon",
      description: "Play a sound when packs are approaching expiration.",
      checked: soundAlertExpiringPacks,
      onChange: onSoundAlertExpiringPacksChange,
    },
    {
      label: "Expired packs",
      description: "Play a sound when expired packs are detected.",
      checked: soundAlertExpiredPacks,
      onChange: onSoundAlertExpiredPacksChange,
    },
  ];

  return (
    <Panel
      title="Alerts"
      description="Configure tablet-friendly notifications for important sterilization events."
    >
      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-4">
          <h3 className="font-semibold text-slate-900">Sound Alerts</h3>
          <p className="mt-1 text-sm text-slate-500">
            Optional tablet-friendly sounds for important sterilization events.
          </p>
        </div>

        <label className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 cursor-pointer">
          <div>
            <p className="font-medium text-slate-900">Enable sound alerts</p>
            <p className="mt-1 text-sm text-slate-500">
              Master switch for all SteriSphere sound notifications.
            </p>
          </div>
          <input
            type="checkbox"
            checked={soundAlertsEnabled}
            onChange={(e) => onSoundAlertsEnabledChange(e.target.checked)}
            className="mt-1 h-5 w-5"
          />
        </label>

        <div
          className={`mt-4 space-y-3 ${
            !soundAlertsEnabled ? "pointer-events-none opacity-50" : ""
          }`}
        >
          {alertOptions.map((alert) => (
            <label
              key={alert.label}
              className="flex items-start justify-between gap-4 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 cursor-pointer"
            >
              <div>
                <p className="text-sm font-medium text-slate-800">
                  {alert.label}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {alert.description}
                </p>
              </div>
              <input
                type="checkbox"
                checked={alert.checked}
                onChange={(e) => alert.onChange(e.target.checked)}
                className="mt-1 h-5 w-5"
              />
            </label>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={onSaveSoundAlertSettings}
        disabled={loading || !canManageSettings}
        className="mt-6 rounded-xl bg-slate-950 text-white px-6 py-3 font-medium cursor-pointer hover:bg-slate-800 transition disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? "Saving..." : "Save Alert Settings"}
      </button>
    </Panel>
  );
}
