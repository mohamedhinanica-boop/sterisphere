"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { createAuditLog } from "@/lib/audit";
import toast from "react-hot-toast";
import {
  InfoCard,
  InputField,
  ManagementRow,
  Panel,
  ProviderRoleBadge,
  RoleBadge,
  SectionHeader,
  StatusBadge,
  StatusCount,
  SterilizerTypeBadge,
} from "@/components/settings";


type UserRole = {
  id: string;
  user_email: string;
  role: string;
  active: boolean;
  created_at: string;
};

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

type Sterilizer = {
  id: string;
  name: string;
  type: string | null;
  active: boolean;
  created_at: string;
};

type ClinicSettings = {
  id: string;
  clinic_name: string | null;
  clinic_address: string | null;
  clinic_phone: string | null;
  clinic_email: string | null;
  pack_expiration_days: number | null;
  auto_print_labels: boolean | null;
  sound_alerts_enabled: boolean | null;
  sound_alert_cycle_complete: boolean | null;
  sound_alert_cycle_overdue: boolean | null;
  sound_alert_failed_cycle: boolean | null;
  sound_alert_expiring_packs: boolean | null;
  sound_alert_expired_packs: boolean | null;
  created_at: string;
  updated_at: string | null;
};

const baseTabs = [
  { id: "overview", label: "Overview" },
  { id: "general", label: "General" },
  { id: "policies", label: "Policies" },
  { id: "alerts", label: "Alerts" },
  { id: "users", label: "Users & Roles" },
  { id: "providers", label: "Providers" },
  { id: "sterilizers", label: "Sterilizers" },
];

const superAdminTab = { id: "super_admin", label: "Super Admin" };

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState("overview");
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [sterilizers, setSterilizers] = useState<Sterilizer[]>([]);
  const [clinicSettings, setClinicSettings] = useState<ClinicSettings | null>(
    null,
  );

  const [loading, setLoading] = useState(false);
  const [currentUserEmail, setCurrentUserEmail] = useState("");
  const [currentUserRole, setCurrentUserRole] = useState("");

  const [providerForm, setProviderForm] = useState({
    firstName: "",
    lastName: "",
    role: "Dentist",
  });

  const [sterilizerForm, setSterilizerForm] = useState({
    name: "",
    type: "Autoclave",
  });

  const [clinicForm, setClinicForm] = useState({
    clinicName: "",
    clinicAddress: "",
    clinicPhone: "",
    clinicEmail: "",
  });

  const [policyForm, setPolicyForm] = useState({
    packExpirationPreset: "365",
    packExpirationDays: "365",
    autoPrintLabels: false,
  });

  const [soundAlertsEnabled, setSoundAlertsEnabled] = useState(false);
  const [soundAlertCycleComplete, setSoundAlertCycleComplete] = useState(true);
  const [soundAlertCycleOverdue, setSoundAlertCycleOverdue] = useState(true);
  const [soundAlertFailedCycle, setSoundAlertFailedCycle] = useState(true);
  const [soundAlertExpiringPacks, setSoundAlertExpiringPacks] = useState(true);
  const [soundAlertExpiredPacks, setSoundAlertExpiredPacks] = useState(true);

  useEffect(() => {
    loadCurrentUser();
    fetchRoles();
    fetchProviders();
    fetchSterilizers();
    fetchClinicSettings();
  }, []);

  function getCurrentRole() {
    return (
      roles.find((role) => role.user_email === currentUserEmail)?.role ||
      currentUserRole
    );
  }

  function canManageSettings() {
    const role = getCurrentRole();
    return role === "super_admin" || role === "admin";
  }

  async function loadCurrentUser() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    setCurrentUserEmail(user?.email || "");

    if (user?.email) {
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_email", user.email)
        .maybeSingle();

      setCurrentUserRole(data?.role || "");
    }
  }

  async function fetchClinicSettings() {
    const { data, error } = await supabase
      .from("clinic_settings")
      .select("*")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) {
      toast.error("Error loading clinic settings.");
      console.error(error);
      return;
    }

    if (!data) {
      return;
    }

    setClinicSettings(data);

    setClinicForm({
      clinicName: data.clinic_name || "",
      clinicAddress: data.clinic_address || "",
      clinicPhone: data.clinic_phone || "",
      clinicEmail: data.clinic_email || "",
    });

    const expirationDays = data.pack_expiration_days || 365;

    setPolicyForm({
      packExpirationPreset: getExpirationPreset(expirationDays),
      packExpirationDays: String(expirationDays),
      autoPrintLabels: Boolean(data.auto_print_labels),
    });

    setSoundAlertsEnabled(Boolean(data.sound_alerts_enabled));
    setSoundAlertCycleComplete(data.sound_alert_cycle_complete ?? true);
    setSoundAlertCycleOverdue(data.sound_alert_cycle_overdue ?? true);
    setSoundAlertFailedCycle(data.sound_alert_failed_cycle ?? true);
    setSoundAlertExpiringPacks(data.sound_alert_expiring_packs ?? true);
    setSoundAlertExpiredPacks(data.sound_alert_expired_packs ?? true);
  }

  

  async function saveGeneralSettings() {
  if (!clinicSettings) {
    toast.error("Clinic settings record not found.");
    return;
  }

  if (!canManageSettings()) {
    toast.error("You do not have permission.");
    return;
  }

  setLoading(true);

  const payload = {
    clinic_name: clinicForm.clinicName.trim(),
    clinic_address: clinicForm.clinicAddress.trim(),
    clinic_phone: clinicForm.clinicPhone.trim(),
    clinic_email: clinicForm.clinicEmail.trim(),
    auto_print_labels: policyForm.autoPrintLabels,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("clinic_settings")
    .update(payload)
    .eq("id", clinicSettings.id);

  if (error) {
    toast.error(error.message || "Error saving general settings.");
    console.error("General settings save error:", error);
    setLoading(false);
    return;
  }

  await createAuditLog({
    action: "general_settings_updated",
    entityType: "clinic_settings",
    entityId: clinicSettings.id,
    description: "Updated general settings",
    metadata: payload,
  });

  await fetchClinicSettings();
  toast.success("General settings saved.");
  setLoading(false);
}

  async function saveSterilizationPolicies() {
    if (!clinicSettings) {
      toast.error("Clinic settings record not found.");
      return;
    }

    if (!canManageSettings()) {
      toast.error("You do not have permission.");
      return;
    }

    const expirationDays = Number(policyForm.packExpirationDays);

    if (!Number.isInteger(expirationDays) || expirationDays <= 0) {
      toast.error("Pack expiration days must be a positive number.");
      return;
    }

    setLoading(true);

    const { error } = await supabase
      .from("clinic_settings")
      .update({
        pack_expiration_days: expirationDays,
        updated_at: new Date().toISOString(),
      })
      .eq("id", clinicSettings.id);

    if (error) {
      toast.error("Error saving sterilization policies.");
      console.error(error);
      setLoading(false);
      return;
    }

    await createAuditLog({
      action: "sterilization_policies_updated",
      entityType: "clinic_settings",
      entityId: clinicSettings.id,
      description: `Updated sterilization policies`,
      metadata: {
        pack_expiration_days: expirationDays,
      },
    });

    await fetchClinicSettings();
    toast.success("Sterilization policies saved.");
    setLoading(false);
  }

  async function saveSoundAlertSettings() {
    if (!clinicSettings) {
      toast.error("Clinic settings record not found.");
      return;
    }

    if (!canManageSettings()) {
      toast.error("You do not have permission.");
      return;
    }

    setLoading(true);

    const { error } = await supabase
      .from("clinic_settings")
      .update({
        sound_alerts_enabled: soundAlertsEnabled,
        sound_alert_cycle_complete: soundAlertCycleComplete,
        sound_alert_cycle_overdue: soundAlertCycleOverdue,
        sound_alert_failed_cycle: soundAlertFailedCycle,
        sound_alert_expiring_packs: soundAlertExpiringPacks,
        sound_alert_expired_packs: soundAlertExpiredPacks,
        updated_at: new Date().toISOString(),
      })
      .eq("id", clinicSettings.id);

    if (error) {
      toast.error("Error saving sound alert settings.");
      console.error(error);
      setLoading(false);
      return;
    }

    await createAuditLog({
      action: "sound_alert_settings_updated",
      entityType: "clinic_settings",
      entityId: clinicSettings.id,
      description: "Updated sound alert settings",
      metadata: {
        sound_alerts_enabled: soundAlertsEnabled,
        sound_alert_cycle_complete: soundAlertCycleComplete,
        sound_alert_cycle_overdue: soundAlertCycleOverdue,
        sound_alert_failed_cycle: soundAlertFailedCycle,
        sound_alert_expiring_packs: soundAlertExpiringPacks,
        sound_alert_expired_packs: soundAlertExpiredPacks,
      },
    });

    await fetchClinicSettings();
    toast.success("Sound alert settings saved.");
    setLoading(false);
  }

  async function fetchRoles() {
    const { data, error } = await supabase
      .from("user_roles")
      .select("id, user_email, role, active, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Error loading user roles.");
      console.error(error);
      return;
    }

    setRoles(data || []);
  }

  async function fetchProviders() {
    const { data, error } = await supabase
      .from("providers")
      .select(
        "id, first_name, last_name, title, display_name, full_name, role, active, created_at",
      )
      .order("full_name", { ascending: true });

    if (error) {
      toast.error("Error loading providers.");
      console.error(error);
      return;
    }

    setProviders(data || []);
  }

  async function fetchSterilizers() {
    const { data, error } = await supabase
      .from("sterilizers")
      .select("*")
      .order("name", { ascending: true });

    if (error) {
      toast.error("Error loading sterilizers.");
      console.error(error);
      return;
    }

    setSterilizers(data || []);
  }

  async function updateUserRole(roleId: string, newRole: string) {
    if (getCurrentRole() !== "super_admin") {
      toast.error("Only super admin can manage user roles.");
      return;
    }

    const targetUser = roles.find((role) => role.id === roleId);

    setLoading(true);

    const { error } = await supabase
      .from("user_roles")
      .update({ role: newRole })
      .eq("id", roleId);

    if (error) {
      toast.error("Error updating role.");
      console.error(error);
      setLoading(false);
      return;
    }

    await createAuditLog({
      action: "user_role_updated",
      entityType: "user_role",
      entityId: roleId,
      description: `Updated ${
        targetUser?.user_email || "user"
      } role to ${newRole}`,
      metadata: {
        user_email: targetUser?.user_email,
        new_role: newRole,
      },
    });

    await fetchRoles();
    toast.success("User role updated.");
    setLoading(false);
  }

  async function toggleUserStatus(userId: string, currentStatus: boolean) {
    if (getCurrentRole() !== "super_admin") {
      toast.error("Only super admin can activate or deactivate users.");
      return;
    }

    const targetUser = roles.find((role) => role.id === userId);

    setLoading(true);

    const { error } = await supabase
      .from("user_roles")
      .update({ active: !currentStatus })
      .eq("id", userId);

    if (error) {
      toast.error("Error updating user status.");
      console.error(error);
      setLoading(false);
      return;
    }

    await createAuditLog({
      action: currentStatus ? "user_deactivated" : "user_activated",
      entityType: "user_role",
      entityId: userId,
      description: `${currentStatus ? "Deactivated" : "Activated"} user ${
        targetUser?.user_email || ""
      }`,
      metadata: {
        user_email: targetUser?.user_email,
        active: !currentStatus,
      },
    });

    await fetchRoles();
    toast.success(currentStatus ? "User deactivated." : "User activated.");
    setLoading(false);
  }

  async function addProvider() {
    if (!canManageSettings()) {
      toast.error("You do not have permission.");
      return;
    }

    const firstName = providerForm.firstName.trim();
    const lastName = providerForm.lastName.trim();

    if (!firstName || !lastName) {
      toast.error("Please enter first and last name.");
      return;
    }

    setLoading(true);

    const title = getProviderTitle(providerForm.role);
    const displayName =
      title !== ""
        ? `${title} ${firstName} ${lastName}`
        : `${firstName} ${lastName}`;

    const normalizedNewName = normalizeProviderName(displayName);

    const duplicateProvider = providers.find(
      (provider) =>
        normalizeProviderName(provider.display_name || provider.full_name) ===
        normalizedNewName,
    );

    if (duplicateProvider) {
      toast.error("Provider already exists.");
      setLoading(false);
      return;
    }

    const { error } = await supabase.from("providers").insert([
      {
        first_name: firstName,
        last_name: lastName,
        title,
        display_name: displayName,
        full_name: displayName,
        role: providerForm.role,
        active: true,
      },
    ]);

    if (error) {
      toast.error(
        error.code === "23505"
          ? "Provider already exists."
          : error.message || "Error adding provider.",
      );
      console.error(error);
      setLoading(false);
      return;
    }

    await createAuditLog({
      action: "provider_created",
      entityType: "provider",
      description: `Created provider ${displayName}`,
      metadata: {
        first_name: firstName,
        last_name: lastName,
        title,
        display_name: displayName,
        role: providerForm.role,
        active: true,
      },
    });

    setProviderForm({
      firstName: "",
      lastName: "",
      role: "Dentist",
    });

    await fetchProviders();
    toast.success("Provider added successfully.");
    setLoading(false);
  }

  async function toggleProviderStatus(
    providerId: string,
    currentStatus: boolean,
  ) {
    if (!canManageSettings()) {
      toast.error("You do not have permission.");
      return;
    }

    const provider = providers.find((item) => item.id === providerId);

    setLoading(true);

    const { error } = await supabase
      .from("providers")
      .update({
        active: !currentStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", providerId);

    if (error) {
      toast.error(error.message || "Error updating provider status.");
      console.error(error);
      setLoading(false);
      return;
    }

    await createAuditLog({
      action: currentStatus ? "provider_deactivated" : "provider_activated",
      entityType: "provider",
      entityId: providerId,
      description: `${currentStatus ? "Deactivated" : "Activated"} provider ${
        provider?.display_name || provider?.full_name || ""
      }`,
      metadata: {
        display_name: provider?.display_name,
        full_name: provider?.full_name,
        role: provider?.role,
        active: !currentStatus,
      },
    });

    await fetchProviders();
    toast.success(
      currentStatus ? "Provider deactivated." : "Provider activated.",
    );
    setLoading(false);
  }

  async function addSterilizer() {
    if (!canManageSettings()) {
      toast.error("You do not have permission.");
      return;
    }

    const cleanName = sterilizerForm.name.trim();

    if (!cleanName) {
      toast.error("Please enter a sterilizer name.");
      return;
    }

    const duplicate = sterilizers.find(
      (item) =>
        normalizeSterilizerName(item.name) ===
        normalizeSterilizerName(cleanName),
    );

    if (duplicate) {
      toast.error("Sterilizer already exists.");
      return;
    }

    setLoading(true);

    const { error } = await supabase.from("sterilizers").insert([
      {
        name: cleanName,
        type: sterilizerForm.type,
        active: true,
      },
    ]);

    if (error) {
      toast.error(
        error.code === "23505"
          ? "Sterilizer already exists."
          : error.message || "Error adding sterilizer.",
      );
      console.error(error);
      setLoading(false);
      return;
    }

    await createAuditLog({
      action: "sterilizer_created",
      entityType: "sterilizer",
      description: `Created sterilizer ${cleanName}`,
      metadata: {
        name: cleanName,
        type: sterilizerForm.type,
        active: true,
      },
    });

    setSterilizerForm({
      name: "",
      type: "Autoclave",
    });

    await fetchSterilizers();
    toast.success("Sterilizer added.");
    setLoading(false);
  }

  async function toggleSterilizerStatus(
    sterilizerId: string,
    currentStatus: boolean,
  ) {
    if (!canManageSettings()) {
      toast.error("You do not have permission.");
      return;
    }

    const sterilizer = sterilizers.find((item) => item.id === sterilizerId);

    setLoading(true);

    const { error } = await supabase
      .from("sterilizers")
      .update({
        active: !currentStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", sterilizerId);

    if (error) {
      toast.error(error.message || "Error updating sterilizer.");
      console.error(error);
      setLoading(false);
      return;
    }

    await createAuditLog({
      action: currentStatus ? "sterilizer_deactivated" : "sterilizer_activated",
      entityType: "sterilizer",
      entityId: sterilizerId,
      description: `${currentStatus ? "Deactivated" : "Activated"} sterilizer ${
        sterilizer?.name || ""
      }`,
      metadata: {
        name: sterilizer?.name,
        type: sterilizer?.type,
        active: !currentStatus,
      },
    });

    await fetchSterilizers();
    toast.success(
      currentStatus ? "Sterilizer deactivated." : "Sterilizer activated.",
    );
    setLoading(false);
  }

  const activeProviders = providers.filter((provider) => provider.active);
  const inactiveProviders = providers.filter((provider) => !provider.active);
  const activeSterilizers = sterilizers.filter(
    (sterilizer) => sterilizer.active,
  );
  const inactiveSterilizers = sterilizers.filter(
    (sterilizer) => !sterilizer.active,
  );
  const activeUsers = roles.filter((role) => role.active);
  const inactiveUsers = roles.filter((role) => !role.active);

  const providerPreviewTitle = getProviderTitle(providerForm.role);
  const providerPreview =
    providerForm.firstName.trim() || providerForm.lastName.trim()
      ? `${
          providerPreviewTitle ? `${providerPreviewTitle} ` : ""
        }${providerForm.firstName.trim()} ${providerForm.lastName.trim()}`.trim()
      : "";

  const visibleTabs =
    getCurrentRole() === "super_admin" ? [...baseTabs, superAdminTab] : baseTabs;

  return (
    <>
      <header className="mb-8">
        <h1 className="text-4xl font-bold">Settings</h1>
        <p className="mt-2 text-slate-600">
          Admin center for clinic profile, policies, users, providers,
          sterilizers, and future automation settings.
        </p>
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-[260px_1fr] gap-6">
        <aside className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 h-fit">
          <nav className="space-y-2">
            {visibleTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`w-full text-left rounded-xl px-4 py-3 text-sm font-medium transition ${
                  activeTab === tab.id
                    ? "bg-slate-950 text-white"
                    : "text-slate-700 hover:bg-slate-100"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </aside>

        <main>
          {activeTab === "overview" && (
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
                    value={`${
                      clinicSettings?.pack_expiration_days || 365
                    } days`}
                  />
                  <InfoCard
                    title="Active Users"
                    value={String(activeUsers.length)}
                  />
                  <InfoCard
                    title="Active Providers"
                    value={String(activeProviders.length)}
                  />
                  <InfoCard
                    title="Active Sterilizers"
                    value={String(activeSterilizers.length)}
                  />
                  <InfoCard
                    title="Auto Print Labels"
                    value={
                      clinicSettings?.auto_print_labels ? "Enabled" : "Disabled"
                    }
                  />
                  <InfoCard title="Database" value="Connected" />
                  <InfoCard title="Environment" value="MVP / Development" />
                </div>
              </Panel>
            </section>
          )}

          {activeTab === "general" && (
            <section className="space-y-6">
              <Panel
                title="Clinic Profile"
                description="These details will be used later in printed reports, labels, and clinic-specific configuration."
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <InputField
                    label="Clinic Name"
                    value={clinicForm.clinicName}
                    onChange={(value) =>
                      setClinicForm((current) => ({
                        ...current,
                        clinicName: value,
                      }))
                    }
                    placeholder="Example: Dentaria"
                  />

                  <InputField
                    label="Clinic Phone"
                    value={clinicForm.clinicPhone}
                    onChange={(value) =>
                      setClinicForm((current) => ({
                        ...current,
                        clinicPhone: value,
                      }))
                    }
                    placeholder="Example: 514-000-0000"
                  />

                  <InputField
                    label="Clinic Email"
                    value={clinicForm.clinicEmail}
                    onChange={(value) =>
                      setClinicForm((current) => ({
                        ...current,
                        clinicEmail: value,
                      }))
                    }
                    placeholder="Example: admin@clinic.com"
                  />

                  <InputField
                    label="Clinic Address"
                    value={clinicForm.clinicAddress}
                    onChange={(value) =>
                      setClinicForm((current) => ({
                        ...current,
                        clinicAddress: value,
                      }))
                    }
                    placeholder="Clinic address"
                  />
                </div>

                
              </Panel>

              <Panel
                title="General Workflow Settings"
                description="General platform options that affect workflow behavior and future device integrations."
              >
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={policyForm.autoPrintLabels}
                      onChange={(e) =>
                        setPolicyForm((current) => ({
                          ...current,
                          autoPrintLabels: e.target.checked,
                        }))
                      }
                      className="mt-1"
                    />

                    <div>
                      <p className="font-medium">Auto-print QR labels</p>
                      <p className="text-sm text-slate-500 mt-1">
                        Future-ready option for the Zywell label printer. This
                        does not print yet until printer integration is added.
                      </p>
                    </div>
                  </label>
                </div>

                <button
                  type="button"
                  onClick={saveGeneralSettings}
                  disabled={loading || !canManageSettings()}
                  className="mt-6 rounded-xl bg-slate-950 text-white px-6 py-3 font-medium cursor-pointer hover:bg-slate-800 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? "Saving..." : "Save General Settings"}
                </button>
              </Panel>
            </section>
          )}

          {activeTab === "policies" && (
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
                    onChange={(e) => {
                      const preset = e.target.value;

                      setPolicyForm((current) => ({
                        ...current,
                        packExpirationPreset: preset,
                        packExpirationDays:
                          preset === "custom"
                            ? current.packExpirationDays
                            : preset,
                      }));
                    }}
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3"
                  >
                    <option value="180">6 months / 180 days</option>
                    <option value="365">1 year / 365 days</option>
                    <option value="730">2 years / 730 days</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">
                    Shelf Life Days
                  </label>

                  <input
                    type="number"
                    min="1"
                    value={policyForm.packExpirationDays}
                    onChange={(e) => {
                      const value = e.target.value;
                      const numericValue = Number(value);

                      setPolicyForm((current) => ({
                        ...current,
                        packExpirationDays: value,
                        packExpirationPreset:
                          Number.isInteger(numericValue) && numericValue > 0
                            ? getExpirationPreset(numericValue)
                            : "custom",
                      }));
                    }}
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3"
                    placeholder="Example: 365"
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={saveSterilizationPolicies}
                disabled={loading || !canManageSettings()}
                className="mt-6 rounded-xl bg-slate-950 text-white px-6 py-3 font-medium cursor-pointer hover:bg-slate-800 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Saving..." : "Save Policies"}
              </button>
            </Panel>
          )}

          {activeTab === "alerts" && (
            <Panel
              title="Alerts"
              description="Configure tablet-friendly notifications for important sterilization events."
            >
              <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
                <div className="mb-4">
                  <h3 className="font-semibold text-slate-900">Sound Alerts</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Optional tablet-friendly sounds for important sterilization
                    events.
                  </p>
                </div>

                <label className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 cursor-pointer">
                  <div>
                    <p className="font-medium text-slate-900">
                      Enable sound alerts
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      Master switch for all SteriSphere sound notifications.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={soundAlertsEnabled}
                    onChange={(e) => setSoundAlertsEnabled(e.target.checked)}
                    className="mt-1 h-5 w-5"
                  />
                </label>

                <div
                  className={`mt-4 space-y-3 ${
                    !soundAlertsEnabled ? "pointer-events-none opacity-50" : ""
                  }`}
                >
                  {[
                    {
                      label: "Cycle completed",
                      description:
                        "Play a sound when a cycle reaches its expected finish time.",
                      checked: soundAlertCycleComplete,
                      onChange: setSoundAlertCycleComplete,
                    },
                    {
                      label: "Cycle overdue",
                      description:
                        "Play a sound when a pending cycle is past its expected duration.",
                      checked: soundAlertCycleOverdue,
                      onChange: setSoundAlertCycleOverdue,
                    },
                    {
                      label: "Failed cycle",
                      description:
                        "Play a sound when a failed cycle needs review or investigation.",
                      checked: soundAlertFailedCycle,
                      onChange: setSoundAlertFailedCycle,
                    },
                    {
                      label: "Packs expiring soon",
                      description:
                        "Play a sound when packs are approaching expiration.",
                      checked: soundAlertExpiringPacks,
                      onChange: setSoundAlertExpiringPacks,
                    },
                    {
                      label: "Expired packs",
                      description:
                        "Play a sound when expired packs are detected.",
                      checked: soundAlertExpiredPacks,
                      onChange: setSoundAlertExpiredPacks,
                    },
                  ].map((alert) => (
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
                onClick={saveSoundAlertSettings}
                disabled={loading || !canManageSettings()}
                className="mt-6 rounded-xl bg-slate-950 text-white px-6 py-3 font-medium cursor-pointer hover:bg-slate-800 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Saving..." : "Save Alert Settings"}
              </button>
            </Panel>
          )}

          {activeTab === "users" && (
            <Panel
              title="Users & Roles"
              description="Manage account roles and access permissions."
            >
              {getCurrentRole() !== "super_admin" && (
                <div className="mb-4 rounded-xl border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
                  You can view users, but only a super admin can change roles or
                  activate/deactivate accounts.
                </div>
              )}

              <div className="mb-4 flex flex-wrap gap-2 text-sm">
                <StatusCount label="Active" value={activeUsers.length} />
                <StatusCount label="Inactive" value={inactiveUsers.length} />
              </div>

              {roles.length === 0 ? (
                <p className="text-slate-500">No user roles found.</p>
              ) : (
                <div className="space-y-3">
                  {roles.map((role) => {
                    const isCurrentUser = role.user_email === currentUserEmail;
                    const canManageUser =
                      getCurrentRole() === "super_admin" && !isCurrentUser;

                    return (
                      <div
                        key={role.id}
                        className="rounded-xl border border-slate-200 p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4"
                      >
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium">{role.user_email}</p>
                            <RoleBadge role={role.role} />

                            {isCurrentUser && (
                              <span className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                                You
                              </span>
                            )}

                            <StatusBadge active={role.active} />
                          </div>

                          <p className="text-xs text-slate-400 mt-1">
                            Added: {new Date(role.created_at).toLocaleString()}
                          </p>
                        </div>

                        <div className="flex flex-col md:flex-row gap-3">
                          <select
                            value={role.role}
                            disabled={loading || !canManageUser}
                            onChange={(e) =>
                              updateUserRole(role.id, e.target.value)
                            }
                            className="w-full md:w-auto h-fit rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm capitalize disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <option value="super_admin">super_admin</option>
                            <option value="admin">admin</option>
                            <option value="clinical_staff">
                              clinical_staff
                            </option>
                            <option value="doctor">doctor</option>
                            <option value="auditor">auditor</option>
                          </select>

                          <button
                            type="button"
                            disabled={loading || !canManageUser}
                            onClick={() =>
                              toggleUserStatus(role.id, role.active)
                            }
                            className={`rounded-xl px-4 py-2 text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed ${
                              role.active
                                ? "bg-slate-100 text-slate-700 hover:bg-slate-200"
                                : "bg-green-600 text-white hover:bg-green-700"
                            }`}
                          >
                            {role.active ? "Deactivate" : "Activate"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Panel>
          )}

          {activeTab === "providers" && (
            <Panel
              title="Provider Management"
              description="Manage doctors and providers used in patient traceability."
            >
              <SectionHeader
                activeCount={activeProviders.length}
                inactiveCount={inactiveProviders.length}
              />

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 mb-6">
                <h3 className="font-semibold mb-4">Add Provider</h3>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <input
                    value={providerForm.firstName}
                    onChange={(e) =>
                      setProviderForm((current) => ({
                        ...current,
                        firstName: e.target.value,
                      }))
                    }
                    className="rounded-xl border border-slate-300 bg-white px-4 py-3"
                    placeholder="First Name"
                  />

                  <input
                    value={providerForm.lastName}
                    onChange={(e) =>
                      setProviderForm((current) => ({
                        ...current,
                        lastName: e.target.value,
                      }))
                    }
                    className="rounded-xl border border-slate-300 bg-white px-4 py-3"
                    placeholder="Last Name"
                  />

                  <select
                    value={providerForm.role}
                    onChange={(e) =>
                      setProviderForm((current) => ({
                        ...current,
                        role: e.target.value,
                      }))
                    }
                    className="rounded-xl border border-slate-300 bg-white px-4 py-3"
                  >
                    <option value="Dentist">Dentist</option>
                    <option value="Hygienist">Hygienist</option>
                    <option value="Assistant">Assistant</option>
                    <option value="Specialist">Specialist</option>
                    <option value="Other">Other</option>
                  </select>

                  <button
                    type="button"
                    onClick={addProvider}
                    disabled={loading || !canManageSettings()}
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
                {providers.map((provider) => (
                  <ManagementRow
                    key={provider.id}
                    title={provider.display_name || provider.full_name}
                    badge={
                      <ProviderRoleBadge role={provider.role || "Provider"} />
                    }
                    active={provider.active}
                    createdAt={provider.created_at}
                    onToggle={() =>
                      toggleProviderStatus(provider.id, provider.active)
                    }
                    loading={loading}
                  />
                ))}
              </div>
            </Panel>
          )}

          {activeTab === "sterilizers" && (
            <Panel
              title="Sterilizer Management"
              description="Manage sterilizers used during cycle creation."
            >
              <SectionHeader
                activeCount={activeSterilizers.length}
                inactiveCount={inactiveSterilizers.length}
              />

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 mb-6">
                <h3 className="font-semibold mb-4">Add Sterilizer</h3>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <input
                    value={sterilizerForm.name}
                    onChange={(e) =>
                      setSterilizerForm((current) => ({
                        ...current,
                        name: e.target.value,
                      }))
                    }
                    className="rounded-xl border border-slate-300 bg-white px-4 py-3"
                    placeholder="Example: STATIM 5000 #1"
                  />

                  <select
                    value={sterilizerForm.type}
                    onChange={(e) =>
                      setSterilizerForm((current) => ({
                        ...current,
                        type: e.target.value,
                      }))
                    }
                    className="rounded-xl border border-slate-300 bg-white px-4 py-3"
                  >
                    <option value="Autoclave">Autoclave</option>
                    <option value="Statim">Statim</option>
                    <option value="Washer">Washer</option>
                    <option value="Other">Other</option>
                  </select>

                  <button
                    type="button"
                    onClick={addSterilizer}
                    disabled={loading || !canManageSettings()}
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
                    badge={
                      <SterilizerTypeBadge type={sterilizer.type || "Other"} />
                    }
                    active={sterilizer.active}
                    createdAt={sterilizer.created_at}
                    onToggle={() =>
                      toggleSterilizerStatus(sterilizer.id, sterilizer.active)
                    }
                    loading={loading}
                  />
                ))}
              </div>
            </Panel>
          )}


          {activeTab === "super_admin" && getCurrentRole() === "super_admin" && (
            <Panel
              title="Super Admin Tools"
              description="Advanced tools reserved for system migration and maintenance."
            >
              <Link
                href="/patients/import"
                className="inline-block rounded-xl bg-slate-950 text-white px-5 py-3 font-medium cursor-pointer hover:bg-slate-800 transition"
              >
                Import Patients Database
              </Link>
            </Panel>
          )}
        </main>
      </div>
    </>
  );
}

function getExpirationPreset(days: number) {
  if (days === 180) return "180";
  if (days === 365) return "365";
  if (days === 730) return "730";
  return "custom";
}

function normalizeProviderName(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/^(dr\.?|dre\.?|hyg\.?)\s+/, "")
    .replace(/\s+/g, " ");
}

function normalizeSterilizerName(name: string) {
  return name.toLowerCase().trim().replace(/\s+/g, " ");
}

function getProviderTitle(role: string) {
  if (role === "Dentist" || role === "Specialist") return "Dr.";
  if (role === "Hygienist") return "Hyg.";
  return "";
}
