"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { createAuditLog } from "@/lib/audit";
import toast from "react-hot-toast";
import SettingsOverview from "@/components/settings/SettingsOverview";
import SettingsPolicies from "@/components/settings/SettingsPolicies";
import SettingsAlerts from "@/components/settings/SettingsAlerts";
import SettingsProviders from "@/components/settings/SettingsProviders";
import SettingsSterilizers from "@/components/settings/SettingsSterilizers";
import SettingsUsers from "@/components/settings/SettingsUsers";
import SettingsPrinting from "@/components/settings/SettingsPrinting";
import SettingsWorkstations from "@/components/settings/SettingsWorkstations";
import SettingsClinicAgents from "@/components/settings/SettingsClinicAgents";
import SettingsHardwareDevices from "@/components/settings/SettingsHardwareDevices";
import {
  DEFAULT_LABEL_HEIGHT_MM,
  DEFAULT_LABEL_WIDTH_MM,
  DEFAULT_LOCAL_PRINT_AGENT_URL,
  DEFAULT_PRINTER_PORT,
  type CertifiedPrinterModel,
  type PrinterConnectionType,
} from "@/lib/modules/printers";
import {
  getExpirationPreset,
  getProviderTitle,
  normalizeProviderName,
  normalizeSterilizerName,
} from "@/components/settings/settingsUtils";
import {
  InputField,
  Panel,
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
  printer_model?: CertifiedPrinterModel | null;
  printer_connection_type?: PrinterConnectionType | null;
  printer_ip?: string | null;
  printer_port?: number | null;
  printer_label_width_mm?: number | null;
  printer_label_height_mm?: number | null;
  local_print_agent_url?: string | null;
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
  { id: "printing", label: "Printing" },
  { id: "users", label: "Users & Roles" },
  { id: "providers", label: "Providers" },
  { id: "sterilizers", label: "Sterilizers" },
];

const superAdminTabs = [
  { id: "workstations", label: "Workstations" },
  { id: "clinic_agents", label: "Clinic Agents" },
  { id: "hardware_devices", label: "Hardware Devices" },
  { id: "super_admin", label: "Super Admin" },
];

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

const [editingProviderId, setEditingProviderId] = useState<string | null>(null);

const [editProviderForm, setEditProviderForm] = useState({
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

  const [printerForm, setPrinterForm] = useState<{
    printerModel: CertifiedPrinterModel;
    connectionType: PrinterConnectionType;
    printerIp: string;
    printerPort: string;
    labelWidthMm: string;
    labelHeightMm: string;
    localAgentUrl: string;
    autoPrintLabels: boolean;
  }>({
    printerModel: "brother_ql_820nwb",
    connectionType: "wifi",
    printerIp: "",
    printerPort: String(DEFAULT_PRINTER_PORT),
    labelWidthMm: String(DEFAULT_LABEL_WIDTH_MM),
    labelHeightMm: String(DEFAULT_LABEL_HEIGHT_MM),
    localAgentUrl: DEFAULT_LOCAL_PRINT_AGENT_URL,
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

  function isSuperAdmin() {
    return getCurrentRole() === "super_admin";
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

    setPrinterForm({
      printerModel: data.printer_model || "brother_ql_820nwb",
      connectionType: data.printer_connection_type || "wifi",
      printerIp: data.printer_ip || "",
      printerPort: String(data.printer_port || DEFAULT_PRINTER_PORT),
      labelWidthMm: String(
        data.printer_label_width_mm || DEFAULT_LABEL_WIDTH_MM,
      ),
      labelHeightMm: String(
        data.printer_label_height_mm || DEFAULT_LABEL_HEIGHT_MM,
      ),
      localAgentUrl: data.local_print_agent_url || DEFAULT_LOCAL_PRINT_AGENT_URL,
      autoPrintLabels: Boolean(data.auto_print_labels),
    });

    setSoundAlertsEnabled(Boolean(data.sound_alerts_enabled));
    setSoundAlertCycleComplete(data.sound_alert_cycle_complete ?? true);
    setSoundAlertCycleOverdue(data.sound_alert_cycle_overdue ?? true);
    setSoundAlertFailedCycle(data.sound_alert_failed_cycle ?? true);
    setSoundAlertExpiringPacks(data.sound_alert_expiring_packs ?? true);
    setSoundAlertExpiredPacks(data.sound_alert_expired_packs ?? true);
  }

  
  function setAutoPrintLabels(value: boolean) {
    setPolicyForm((current) => ({
      ...current,
      autoPrintLabels: value,
    }));

    setPrinterForm((current) => ({
      ...current,
      autoPrintLabels: value,
    }));
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

  async function savePrinterSettings() {
    if (!clinicSettings) {
      toast.error("Clinic settings record not found.");
      return;
    }

    if (!canManageSettings()) {
      toast.error("You do not have permission.");
      return;
    }

    if (!isSuperAdmin()) {
      setLoading(true);

      const payload = {
        auto_print_labels: printerForm.autoPrintLabels,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from("clinic_settings")
        .update(payload)
        .eq("id", clinicSettings.id);

      if (error) {
        toast.error(error.message || "Error saving printer settings.");
        console.error("Printer settings save error:", error);
        setLoading(false);
        return;
      }

      await createAuditLog({
        action: "printer_settings_updated",
        entityType: "clinic_settings",
        entityId: clinicSettings.id,
        description: "Updated printer auto-print setting",
        metadata: payload,
      });

      await fetchClinicSettings();
      toast.success("Auto-print setting saved.");
      setLoading(false);
      return;
    }

    const printerPort = Number(printerForm.printerPort);
    const labelWidthMm = Number(printerForm.labelWidthMm);
    const labelHeightMm = Number(printerForm.labelHeightMm);

    if (
      !Number.isInteger(printerPort) ||
      printerPort < 1 ||
      printerPort > 65535
    ) {
      toast.error("Printer port must be a number between 1 and 65535.");
      return;
    }

    if (!Number.isInteger(labelWidthMm) || labelWidthMm <= 0) {
      toast.error("Label width must be a positive number.");
      return;
    }

    if (!Number.isInteger(labelHeightMm) || labelHeightMm <= 0) {
      toast.error("Label height must be a positive number.");
      return;
    }

    setLoading(true);

    const payload = {
      printer_model: printerForm.printerModel,
      printer_connection_type: printerForm.connectionType,
      printer_ip: printerForm.printerIp.trim() || null,
      printer_port: printerPort,
      printer_label_width_mm: labelWidthMm,
      printer_label_height_mm: labelHeightMm,
      local_print_agent_url:
        printerForm.localAgentUrl.trim() || DEFAULT_LOCAL_PRINT_AGENT_URL,
      auto_print_labels: printerForm.autoPrintLabels,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("clinic_settings")
      .update(payload)
      .eq("id", clinicSettings.id);

    if (error) {
      console.error("Printer settings save error:", error);

      const fallbackPayload = {
        auto_print_labels: printerForm.autoPrintLabels,
        updated_at: payload.updated_at,
      };

      const { error: fallbackError } = await supabase
        .from("clinic_settings")
        .update(fallbackPayload)
        .eq("id", clinicSettings.id);

      if (fallbackError) {
        toast.error(fallbackError.message || "Error saving printer settings.");
        console.error("Printer settings fallback save error:", fallbackError);
        setLoading(false);
        return;
      }

      await createAuditLog({
        action: "printer_settings_updated",
        entityType: "clinic_settings",
        entityId: clinicSettings.id,
        description: "Updated printer auto-print setting",
        metadata: fallbackPayload,
      });

      await fetchClinicSettings();
      toast.success(
        "Auto-print setting saved. Printer fields need the database patch before they can persist.",
      );
      setLoading(false);
      return;
    }

    await createAuditLog({
      action: "printer_settings_updated",
      entityType: "clinic_settings",
      entityId: clinicSettings.id,
      description: "Updated printer settings",
      metadata: payload,
    });

    await fetchClinicSettings();
    toast.success("Printer settings saved.");
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

function startEditingProvider(provider: Provider) {
  const fallbackName = provider.display_name || provider.full_name || "";
  const cleanName = fallbackName
    .replace(/^Dr\.?\s+/i, "")
    .replace(/^Hyg\.?\s+/i, "")
    .trim();

  const nameParts = cleanName.split(" ").filter(Boolean);

  setEditingProviderId(provider.id);
  setEditProviderForm({
    firstName: provider.first_name || nameParts[0] || "",
    lastName: provider.last_name || nameParts.slice(1).join(" ") || "",
    role: provider.role || "Dentist",
  });
}

function cancelEditingProvider() {
  setEditingProviderId(null);
  setEditProviderForm({
    firstName: "",
    lastName: "",
    role: "Dentist",
  });
}

async function updateProvider(providerId: string) {
  if (!canManageSettings()) {
    toast.error("You do not have permission.");
    return;
  }

  const firstName = editProviderForm.firstName.trim();
  const lastName = editProviderForm.lastName.trim();

  if (!firstName || !lastName) {
    toast.error("Please enter first and last name.");
    return;
  }

  const title = getProviderTitle(editProviderForm.role);
  const displayName =
    title !== ""
      ? `${title} ${firstName} ${lastName}`
      : `${firstName} ${lastName}`;

  const normalizedEditedName = normalizeProviderName(displayName);

  const duplicateProvider = providers.find(
    (provider) =>
      provider.id !== providerId &&
      normalizeProviderName(provider.display_name || provider.full_name) ===
        normalizedEditedName,
  );

  if (duplicateProvider) {
    toast.error("Another provider already has this name.");
    return;
  }

  setLoading(true);

  const { error } = await supabase
    .from("providers")
    .update({
      first_name: firstName,
      last_name: lastName,
      title,
      display_name: displayName,
      full_name: displayName,
      role: editProviderForm.role,
      updated_at: new Date().toISOString(),
    })
    .eq("id", providerId);

  if (error) {
    toast.error(error.message || "Error updating provider.");
    console.error(error);
    setLoading(false);
    return;
  }

  await createAuditLog({
    action: "provider_updated",
    entityType: "provider",
    entityId: providerId,
    description: `Updated provider ${displayName}`,
    metadata: {
      first_name: firstName,
      last_name: lastName,
      title,
      display_name: displayName,
      role: editProviderForm.role,
    },
  });

  cancelEditingProvider();
  await fetchProviders();
  toast.success("Provider updated successfully.");
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
      })
      .eq("id", sterilizerId);

    if (error) {
      toast.error(error.message || "Error updating sterilizer.");
      console.error("Sterilizer status update error:", {
        error,
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
      });
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
    getCurrentRole() === "super_admin"
      ? [...baseTabs, ...superAdminTabs]
      : baseTabs;

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
            <SettingsOverview
              clinicSettings={clinicSettings}
              activeUsersCount={activeUsers.length}
              activeProvidersCount={activeProviders.length}
              activeSterilizersCount={activeSterilizers.length}
            />
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
                        setAutoPrintLabels(e.target.checked)
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
            <SettingsPolicies
              policyForm={policyForm}
              onPackExpirationPresetChange={(preset) => {
                setPolicyForm((current) => ({
                  ...current,
                  packExpirationPreset: preset,
                  packExpirationDays:
                    preset === "custom" ? current.packExpirationDays : preset,
                }));
              }}
              onPackExpirationDaysChange={(value) => {
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
              onSaveSterilizationPolicies={saveSterilizationPolicies}
              loading={loading}
              canManageSettings={canManageSettings()}
            />
          )}

          {activeTab === "alerts" && (
            <SettingsAlerts
              soundAlertsEnabled={soundAlertsEnabled}
              soundAlertCycleComplete={soundAlertCycleComplete}
              soundAlertCycleOverdue={soundAlertCycleOverdue}
              soundAlertFailedCycle={soundAlertFailedCycle}
              soundAlertExpiringPacks={soundAlertExpiringPacks}
              soundAlertExpiredPacks={soundAlertExpiredPacks}
              onSoundAlertsEnabledChange={setSoundAlertsEnabled}
              onSoundAlertCycleCompleteChange={setSoundAlertCycleComplete}
              onSoundAlertCycleOverdueChange={setSoundAlertCycleOverdue}
              onSoundAlertFailedCycleChange={setSoundAlertFailedCycle}
              onSoundAlertExpiringPacksChange={setSoundAlertExpiringPacks}
              onSoundAlertExpiredPacksChange={setSoundAlertExpiredPacks}
              onSaveSoundAlertSettings={saveSoundAlertSettings}
              loading={loading}
              canManageSettings={canManageSettings()}
            />
          )}

          {activeTab === "printing" && (
            <SettingsPrinting
              printerForm={printerForm}
              onPrinterFormChange={(form) => {
                setPrinterForm(form);
                setPolicyForm((current) => ({
                  ...current,
                  autoPrintLabels: form.autoPrintLabels,
                }));
              }}
              onSavePrinterSettings={savePrinterSettings}
              loading={loading}
              canManageSettings={canManageSettings()}
              isSuperAdmin={isSuperAdmin()}
            />
          )}

          {activeTab === "users" && (
            <SettingsUsers
              roles={roles}
              activeUsersCount={activeUsers.length}
              inactiveUsersCount={inactiveUsers.length}
              currentUserEmail={currentUserEmail}
              currentRole={getCurrentRole()}
              loading={loading}
              updateUserRole={updateUserRole}
              toggleUserStatus={toggleUserStatus}
            />
          )}

          {activeTab === "providers" && (
            <SettingsProviders
              providers={providers}
              activeProvidersCount={activeProviders.length}
              inactiveProvidersCount={inactiveProviders.length}
              providerForm={providerForm}
              setProviderForm={setProviderForm}
              editingProviderId={editingProviderId}
              editProviderForm={editProviderForm}
              setEditProviderForm={setEditProviderForm}
              providerPreview={providerPreview}
              addProvider={addProvider}
              updateProvider={updateProvider}
              toggleProviderStatus={toggleProviderStatus}
              startEditingProvider={startEditingProvider}
              cancelEditingProvider={cancelEditingProvider}
              loading={loading}
              canManageSettings={canManageSettings()}
            />
          )}

          {activeTab === "sterilizers" && (
            <SettingsSterilizers
              sterilizers={sterilizers}
              activeSterilizersCount={activeSterilizers.length}
              inactiveSterilizersCount={inactiveSterilizers.length}
              sterilizerForm={sterilizerForm}
              setSterilizerForm={setSterilizerForm}
              addSterilizer={addSterilizer}
              onToggleSterilizerStatus={toggleSterilizerStatus}
              loading={loading}
              canManageSettings={canManageSettings()}
            />
          )}

          {activeTab === "workstations" && getCurrentRole() === "super_admin" && (
            <SettingsWorkstations />
          )}

          {activeTab === "clinic_agents" &&
            getCurrentRole() === "super_admin" && <SettingsClinicAgents />}

          {activeTab === "hardware_devices" &&
            getCurrentRole() === "super_admin" && <SettingsHardwareDevices />}

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
