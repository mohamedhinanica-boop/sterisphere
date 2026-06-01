"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { createAuditLog } from "@/lib/audit";
import toast from "react-hot-toast";

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

export default function SettingsPage() {
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [sterilizers, setSterilizers] = useState<Sterilizer[]>([]);
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

  useEffect(() => {
    loadCurrentUser();
    fetchRoles();
    fetchProviders();
    fetchSterilizers();
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
        "id, first_name, last_name, title, display_name, full_name, role, active, created_at"
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
      description: `Updated ${targetUser?.user_email || "user"} role to ${newRole}`,
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
      title !== "" ? `${title} ${firstName} ${lastName}` : `${firstName} ${lastName}`;

    const normalizedNewName = normalizeProviderName(displayName);

    const duplicateProvider = providers.find(
      (provider) =>
        normalizeProviderName(provider.display_name || provider.full_name) ===
        normalizedNewName
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
          : error.message || "Error adding provider."
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
    currentStatus: boolean
  ) {
    if (!canManageSettings()) {
      toast.error("You do not have permission.");
      return;
    }

    const provider = providers.find((item) => item.id === providerId);

    setLoading(true);

    const { error } = await supabase
      .from("providers")
      .update({ active: !currentStatus })
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
      currentStatus ? "Provider deactivated." : "Provider activated."
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
      (item) => normalizeSterilizerName(item.name) === normalizeSterilizerName(cleanName)
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
          : error.message || "Error adding sterilizer."
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
    currentStatus: boolean
  ) {
    if (!canManageSettings()) {
      toast.error("You do not have permission.");
      return;
    }

    const sterilizer = sterilizers.find((item) => item.id === sterilizerId);

    setLoading(true);

    const { error } = await supabase
      .from("sterilizers")
      .update({ active: !currentStatus })
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
      currentStatus ? "Sterilizer deactivated." : "Sterilizer activated."
    );
    setLoading(false);
  }

  const activeProviders = providers.filter((provider) => provider.active);
  const inactiveProviders = providers.filter((provider) => !provider.active);
  const activeSterilizers = sterilizers.filter((sterilizer) => sterilizer.active);
  const inactiveSterilizers = sterilizers.filter(
    (sterilizer) => !sterilizer.active
  );

  const providerPreviewTitle = getProviderTitle(providerForm.role);
  const providerPreview =
    providerForm.firstName.trim() || providerForm.lastName.trim()
      ? `${
          providerPreviewTitle ? `${providerPreviewTitle} ` : ""
        }${providerForm.firstName.trim()} ${providerForm.lastName.trim()}`.trim()
      : "";

  return (
    <>
      <header className="mb-8">
        <h1 className="text-4xl font-bold">Settings</h1>
        <p className="mt-2 text-slate-600">
          Admin configuration for users, roles, providers, sterilizers, and system
          settings.
        </p>
      </header>

      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-6">
        <h2 className="text-2xl font-semibold mb-4">System Overview</h2>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <InfoCard title="Clinic" value="Dentaria" />
          <InfoCard title="Database" value="Connected" />
          <InfoCard title="Active Providers" value={String(activeProviders.length)} />
          <InfoCard title="Active Sterilizers" value={String(activeSterilizers.length)} />
        </div>
      </section>

      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-6">
        <h2 className="text-2xl font-semibold mb-4">User Roles</h2>

        {getCurrentRole() !== "super_admin" && (
          <div className="mb-4 rounded-xl border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
            You can view users, but only a super admin can change roles or
            activate/deactivate accounts.
          </div>
        )}

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
                      onChange={(e) => updateUserRole(role.id, e.target.value)}
                      className="w-full md:w-auto h-fit rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm capitalize disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <option value="super_admin">super_admin</option>
                      <option value="admin">admin</option>
                      <option value="clinical_staff">clinical_staff</option>
                      <option value="doctor">doctor</option>
                      <option value="auditor">auditor</option>
                    </select>

                    <button
                      type="button"
                      disabled={loading || !canManageUser}
                      onClick={() => toggleUserStatus(role.id, role.active)}
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
      </section>

      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-6">
        <SectionHeader
          title="Provider Management"
          description="Manage doctors and providers used in patient traceability."
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
              disabled={loading}
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
              badge={<ProviderRoleBadge role={provider.role || "Provider"} />}
              active={provider.active}
              createdAt={provider.created_at}
              onToggle={() => toggleProviderStatus(provider.id, provider.active)}
              loading={loading}
            />
          ))}
        </div>
      </section>

      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-6">
        <SectionHeader
          title="Sterilizer Management"
          description="Manage sterilizers used during cycle creation."
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
              disabled={loading}
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
                toggleSterilizerStatus(sterilizer.id, sterilizer.active)
              }
              loading={loading}
            />
          ))}
        </div>
      </section>

      {getCurrentRole() === "super_admin" && (
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h2 className="text-2xl font-semibold mb-4">Super Admin Tools</h2>

          <p className="text-sm text-slate-600 mb-4">
            Advanced tools reserved for system migration and maintenance.
          </p>

          <Link
            href="/patients/import"
            className="inline-block rounded-xl bg-slate-950 text-white px-5 py-3 font-medium cursor-pointer hover:bg-slate-800 transition"
          >
            Import Patients Database
          </Link>
        </section>
      )}
    </>
  );
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

function InfoCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-sm text-slate-500">{title}</p>
      <p className="text-lg font-semibold mt-1">{value}</p>
    </div>
  );
}

function SectionHeader({
  title,
  description,
  activeCount,
  inactiveCount,
}: {
  title: string;
  description: string;
  activeCount: number;
  inactiveCount: number;
}) {
  return (
    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
      <div>
        <h2 className="text-2xl font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-slate-600">{description}</p>
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        <span className="rounded-lg border border-green-200 bg-green-50 px-3 py-1 text-green-700">
          Active: {activeCount}
        </span>
        <span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1 text-slate-600">
          Inactive: {inactiveCount}
        </span>
      </div>
    </div>
  );
}

function ManagementRow({
  title,
  badge,
  active,
  createdAt,
  onToggle,
  loading,
}: {
  title: string;
  badge: React.ReactNode;
  active: boolean;
  createdAt: string;
  onToggle: () => void;
  loading: boolean;
}) {
  return (
    <div className="rounded-xl border border-slate-200 p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium">{title}</p>
          {badge}
          <StatusBadge active={active} />
        </div>

        <p className="text-xs text-slate-400 mt-1">
          Added: {new Date(createdAt).toLocaleString()}
        </p>
      </div>

      <button
        type="button"
        onClick={onToggle}
        disabled={loading}
        className={`rounded-xl px-5 py-3 text-sm font-medium cursor-pointer transition disabled:opacity-50 disabled:cursor-not-allowed ${
          active
            ? "bg-slate-100 text-slate-700 hover:bg-slate-200"
            : "bg-green-600 text-white hover:bg-green-700"
        }`}
      >
        {active ? "Deactivate" : "Activate"}
      </button>
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  const classes: Record<string, string> = {
    super_admin: "border-purple-200 bg-purple-50 text-purple-700",
    admin: "border-blue-200 bg-blue-50 text-blue-700",
    clinical_staff: "border-green-200 bg-green-50 text-green-700",
    doctor: "border-indigo-200 bg-indigo-50 text-indigo-700",
    auditor: "border-slate-200 bg-slate-50 text-slate-600",
  };

  return (
    <span className={`rounded-lg border px-3 py-1 text-xs font-medium ${classes[role]}`}>
      {role}
    </span>
  );
}

function ProviderRoleBadge({ role }: { role: string }) {
  const classes: Record<string, string> = {
    Dentist: "border-blue-200 bg-blue-50 text-blue-700",
    Hygienist: "border-green-200 bg-green-50 text-green-700",
    Assistant: "border-purple-200 bg-purple-50 text-purple-700",
    Specialist: "border-indigo-200 bg-indigo-50 text-indigo-700",
    Other: "border-slate-200 bg-slate-50 text-slate-600",
    Provider: "border-slate-200 bg-slate-50 text-slate-600",
  };

  return (
    <span className={`rounded-lg border px-3 py-1 text-xs font-medium ${classes[role]}`}>
      {role}
    </span>
  );
}

function SterilizerTypeBadge({ type }: { type: string }) {
  const classes: Record<string, string> = {
    Autoclave: "border-blue-200 bg-blue-50 text-blue-700",
    Statim: "border-green-200 bg-green-50 text-green-700",
    Washer: "border-purple-200 bg-purple-50 text-purple-700",
    Other: "border-slate-200 bg-slate-50 text-slate-600",
  };

  return (
    <span className={`rounded-lg border px-3 py-1 text-xs font-medium ${classes[type]}`}>
      {type}
    </span>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={`rounded-lg border px-3 py-1 text-xs font-medium ${
        active
          ? "border-green-200 bg-green-50 text-green-700"
          : "border-slate-200 bg-slate-100 text-slate-600"
      }`}
    >
      {active ? "Active" : "Inactive"}
    </span>
  );
}