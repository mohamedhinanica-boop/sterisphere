import type { Dispatch, SetStateAction } from "react";
import {
  InputField,
  ManagementRow,
  Panel,
  SectionHeader,
  SterilizerTypeBadge,
} from "./index";

type Sterilizer = {
  id: string;
  name: string;
  type: string | null;
  active: boolean;
  created_at: string;
};

type SterilizerForm = {
  name: string;
  type: string;
};

type SettingsSterilizersProps = {
  sterilizers: Sterilizer[];
  activeSterilizersCount: number;
  inactiveSterilizersCount: number;
  sterilizerForm: SterilizerForm;
  setSterilizerForm: Dispatch<SetStateAction<SterilizerForm>>;
  addSterilizer: () => void;
  onToggleSterilizerStatus: (
    sterilizerId: string,
    currentStatus: boolean,
  ) => void | Promise<void>;
  loading: boolean;
  canManageSettings: boolean;
};

const sterilizerTypeOptions = ["Autoclave", "Statim", "Washer", "Other"];

export default function SettingsSterilizers({
  sterilizers,
  activeSterilizersCount,
  inactiveSterilizersCount,
  sterilizerForm,
  setSterilizerForm,
  addSterilizer,
  onToggleSterilizerStatus,
  loading,
  canManageSettings,
}: SettingsSterilizersProps) {
  return (
    <Panel
      title="Sterilizer Management"
      description="Manage sterilizers used during cycle creation."
    >
      <SectionHeader
        activeCount={activeSterilizersCount}
        inactiveCount={inactiveSterilizersCount}
      />

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 mb-6">
        <h3 className="font-semibold mb-4">Add Sterilizer</h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <InputField
            value={sterilizerForm.name}
            onChange={(value) =>
              setSterilizerForm((current) => ({
                ...current,
                name: value,
              }))
            }
            placeholder="Example: STATIM 5000 #1"
          />

          <select
            value={sterilizerForm.type}
            onChange={(event) =>
              setSterilizerForm((current) => ({
                ...current,
                type: event.target.value,
              }))
            }
            className="rounded-xl border border-slate-300 bg-white px-4 py-3"
          >
            {sterilizerTypeOptions.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={addSterilizer}
            disabled={loading || !canManageSettings}
            className="rounded-xl bg-slate-950 text-white px-5 py-3 font-medium cursor-pointer hover:bg-slate-800 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Add Sterilizer
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {sterilizers.map((sterilizer) => (
          <ManagementRow
            key={sterilizer.id}
            title={sterilizer.name}
            badge={<SterilizerTypeBadge type={sterilizer.type || "Other"} />}
            active={sterilizer.active}
            createdAt={sterilizer.created_at}
            onToggle={() =>
              onToggleSterilizerStatus(sterilizer.id, sterilizer.active)
            }
            loading={loading}
          />
        ))}
      </div>
    </Panel>
  );
}
