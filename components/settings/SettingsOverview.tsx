import { InfoCard, Panel } from "./index";

type ClinicSettingsOverview = {
  clinic_name: string | null;
  pack_expiration_days: number | null;
  auto_print_labels: boolean | null;
};

type SettingsOverviewProps = {
  clinicSettings: ClinicSettingsOverview | null;
  activeUsersCount: number;
  activeProvidersCount: number;
  activeSterilizersCount: number;
};

export default function SettingsOverview({
  clinicSettings,
  activeUsersCount,
  activeProvidersCount,
  activeSterilizersCount,
}: SettingsOverviewProps) {
  return (
    <section className="space-y-6">
      <Panel
        title="System Overview"
        description="Quick snapshot of the current SteriSphere configuration."
      >
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <InfoCard
            title="Clinic"
            value={clinicSettings?.clinic_name || "Not configured"}
          />
          <InfoCard
            title="Pack Shelf Life"
            value={`${clinicSettings?.pack_expiration_days || 365} days`}
          />
          <InfoCard title="Active Users" value={String(activeUsersCount)} />
          <InfoCard
            title="Active Providers"
            value={String(activeProvidersCount)}
          />
          <InfoCard
            title="Active Sterilizers"
            value={String(activeSterilizersCount)}
          />
          <InfoCard
            title="Auto Print Labels"
            value={clinicSettings?.auto_print_labels ? "Enabled" : "Disabled"}
          />
          <InfoCard title="Database" value="Connected" />
          <InfoCard title="Environment" value="MVP / Development" />
        </div>
      </Panel>
    </section>
  );
}
