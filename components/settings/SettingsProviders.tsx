import type { Dispatch, SetStateAction } from "react";
import {
  InputField,
  ManagementRow,
  Panel,
  ProviderRoleBadge,
  SectionHeader,
} from "./index";

type Provider = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  display_name: string | null;
  full_name: string;
  role: string | null;
  active: boolean;
  created_at: string;
};

type ProviderForm = {
  firstName: string;
  lastName: string;
  role: string;
};

type SettingsProvidersProps = {
  providers: Provider[];
  activeProvidersCount: number;
  inactiveProvidersCount: number;
  providerForm: ProviderForm;
  setProviderForm: Dispatch<SetStateAction<ProviderForm>>;
  editingProviderId: string | null;
  editProviderForm: ProviderForm;
  setEditProviderForm: Dispatch<SetStateAction<ProviderForm>>;
  providerPreview: string;
  addProvider: () => void;
  updateProvider: (providerId: string) => void;
  toggleProviderStatus: (providerId: string, currentStatus: boolean) => void;
  startEditingProvider: (provider: Provider) => void;
  cancelEditingProvider: () => void;
  loading: boolean;
  canManageSettings: boolean;
};

const providerRoleOptions = [
  "Dentist",
  "Hygienist",
  "Assistant",
  "Specialist",
  "Other",
];

export default function SettingsProviders({
  providers,
  activeProvidersCount,
  inactiveProvidersCount,
  providerForm,
  setProviderForm,
  editingProviderId,
  editProviderForm,
  setEditProviderForm,
  providerPreview,
  addProvider,
  updateProvider,
  toggleProviderStatus,
  startEditingProvider,
  cancelEditingProvider,
  loading,
  canManageSettings,
}: SettingsProvidersProps) {
  return (
    <Panel
      title="Provider Management"
      description="Manage doctors and providers used in patient traceability."
    >
      <SectionHeader
        activeCount={activeProvidersCount}
        inactiveCount={inactiveProvidersCount}
      />

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 mb-6">
        <h3 className="font-semibold mb-4">Add Provider</h3>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <InputField
            value={providerForm.firstName}
            onChange={(value) =>
              setProviderForm((current) => ({
                ...current,
                firstName: value,
              }))
            }
            placeholder="First Name"
          />

          <InputField
            value={providerForm.lastName}
            onChange={(value) =>
              setProviderForm((current) => ({
                ...current,
                lastName: value,
              }))
            }
            placeholder="Last Name"
          />

          <select
            value={providerForm.role}
            onChange={(event) =>
              setProviderForm((current) => ({
                ...current,
                role: event.target.value,
              }))
            }
            className="rounded-xl border border-slate-300 bg-white px-4 py-3"
          >
            {providerRoleOptions.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={addProvider}
            disabled={loading || !canManageSettings}
            className="rounded-xl bg-slate-950 text-white px-5 py-3 font-medium cursor-pointer hover:bg-slate-800 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Add Provider
          </button>
        </div>

        {providerPreview && (
          <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-700">
            Display name preview: <strong>{providerPreview}</strong>
          </div>
        )}
      </div>

      <div className="space-y-3">
        {providers.map((provider) => {
          const isEditing = editingProviderId === provider.id;

          if (isEditing) {
            return (
              <div
                key={provider.id}
                className="rounded-xl border border-blue-200 bg-blue-50 p-4"
              >
                <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                  <InputField
                    value={editProviderForm.firstName}
                    onChange={(value) =>
                      setEditProviderForm((current) => ({
                        ...current,
                        firstName: value,
                      }))
                    }
                    placeholder="First Name"
                  />

                  <InputField
                    value={editProviderForm.lastName}
                    onChange={(value) =>
                      setEditProviderForm((current) => ({
                        ...current,
                        lastName: value,
                      }))
                    }
                    placeholder="Last Name"
                  />

                  <select
                    value={editProviderForm.role}
                    onChange={(event) =>
                      setEditProviderForm((current) => ({
                        ...current,
                        role: event.target.value,
                      }))
                    }
                    className="rounded-xl border border-slate-300 bg-white px-4 py-3"
                  >
                    {providerRoleOptions.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => updateProvider(provider.id)}
                      disabled={loading}
                      className="flex-1 rounded-xl bg-blue-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Save
                    </button>

                    <button
                      type="button"
                      onClick={cancelEditingProvider}
                      disabled={loading}
                      className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            );
          }

          return (
            <ManagementRow
              key={provider.id}
              title={provider.display_name || provider.full_name}
              badge={<ProviderRoleBadge role={provider.role || "Provider"} />}
              active={provider.active}
              createdAt={provider.created_at}
              onToggle={() =>
                toggleProviderStatus(provider.id, provider.active)
              }
              loading={loading}
              extraAction={
                <button
                  type="button"
                  onClick={() => startEditingProvider(provider)}
                  disabled={loading}
                  className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Edit
                </button>
              }
            />
          );
        })}
      </div>
    </Panel>
  );
}
