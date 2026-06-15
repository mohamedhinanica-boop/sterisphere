import { InputField, Panel } from "./index";

type PolicyForm = {
  packExpirationPreset: string;
  packExpirationDays: string;
  autoPrintLabels: boolean;
};

type SettingsPoliciesProps = {
  policyForm: PolicyForm;
  onPackExpirationPresetChange: (value: string) => void;
  onPackExpirationDaysChange: (value: string) => void;
  onSaveSterilizationPolicies: () => void;
  loading: boolean;
  canManageSettings: boolean;
};

export default function SettingsPolicies({
  policyForm,
  onPackExpirationPresetChange,
  onPackExpirationDaysChange,
  onSaveSterilizationPolicies,
  loading,
  canManageSettings,
}: SettingsPoliciesProps) {
  return (
    <Panel
      title="Sterilization Policies"
      description="Configure pack shelf life and future automation preferences."
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-2">
            Pack Shelf Life Preset
          </label>

          <select
            value={policyForm.packExpirationPreset}
            onChange={(e) => onPackExpirationPresetChange(e.target.value)}
            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3"
          >
            <option value="180">6 months / 180 days</option>
            <option value="365">1 year / 365 days</option>
            <option value="730">2 years / 730 days</option>
            <option value="custom">Custom</option>
          </select>
        </div>

        <InputField
          label="Shelf Life Days"
          type="number"
          min="1"
          value={policyForm.packExpirationDays}
          onChange={onPackExpirationDaysChange}
          placeholder="Example: 365"
        />
      </div>

      <button
        type="button"
        onClick={onSaveSterilizationPolicies}
        disabled={loading || !canManageSettings}
        className="mt-6 rounded-xl bg-slate-950 text-white px-6 py-3 font-medium cursor-pointer hover:bg-slate-800 transition disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? "Saving..." : "Save Policies"}
      </button>
    </Panel>
  );
}
