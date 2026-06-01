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

export default function SettingsPage() {
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentUserEmail, setCurrentUserEmail] = useState("");
  const [currentUserRole, setCurrentUserRole] = useState("");

  const [providerForm, setProviderForm] = useState({
    firstName: "",
    lastName: "",
    role: "Dentist",
  });

  useEffect(() => {
    loadCurrentUser();
    fetchRoles();
    fetchProviders();
  }, []);

  function getCurrentRole() {
    return (
      roles.find((role) => role.user_email === currentUserEmail)?.role ||
      currentUserRole
    );
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
    const currentRole = getCurrentRole();

    if (currentRole !== "super_admin" && currentRole !== "admin") {
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
        full_name: displayName,
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
    const currentRole = getCurrentRole();

    if (currentRole !== "super_admin" && currentRole !== "admin") {
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
        full_name: provider?.full_name,
        display_name: provider?.display_name,
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

  const activeProviders = providers.filter((provider) => provider.active);
  const inactiveProviders = providers.filter((provider) => !provider.active);

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
          Admin configuration for users, roles, providers, and system settings.
        </p>
      </header>

      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-6">
        <h2 className="text-2xl font-semibold mb-4">System Overview</h2>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <InfoCard title="Clinic" value="Dentaria" />
          <InfoCard title="Database" value="Connected" />
          <InfoCard title="Environment" value="MVP / Development" />
          <InfoCard title="Active Providers" value={String(activeProviders.length)} />
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

                    {isCurrentUser && (
                      <p className="text-xs text-slate-500 mt-2">
                        Your own role and access status are protected to prevent
                        accidental lockout.
                      </p>
                    )}
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
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
          <div>
            <h2 className="text-2xl font-semibold">Provider Management</h2>
            <p className="mt-1 text-sm text-slate-600">
              Manage doctors and providers used in patient traceability.
            </p>
          </div>

          <div className="flex flex-wrap gap-2 text-sm">
            <span className="rounded-lg border border-green-200 bg-green-50 px-3 py-1 text-green-700">
              Active: {activeProviders.length}
            </span>
            <span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1 text-slate-600">
              Inactive: {inactiveProviders.length}
            </span>
          </div>
        </div>

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

        {providers.length === 0 ? (
          <p className="text-slate-500">No providers found.</p>
        ) : (
          <div className="space-y-3">
            {providers.map((provider) => (
              <div
                key={provider.id}
                className="rounded-xl border border-slate-200 p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">
                      {provider.display_name || provider.full_name}
                    </p>
                    <ProviderRoleBadge role={provider.role || "Provider"} />
                    <StatusBadge active={provider.active} />
                  </div>

                  <p className="text-xs text-slate-400 mt-1">
                    Added: {new Date(provider.created_at).toLocaleString()}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    toggleProviderStatus(provider.id, provider.active)
                  }
                  disabled={loading}
                  className={`rounded-xl px-5 py-3 text-sm font-medium cursor-pointer transition disabled:opacity-50 disabled:cursor-not-allowed ${
                    provider.active
                      ? "bg-slate-100 text-slate-700 hover:bg-slate-200"
                      : "bg-green-600 text-white hover:bg-green-700"
                  }`}
                >
                  {provider.active ? "Deactivate" : "Activate"}
                </button>
              </div>
            ))}
          </div>
        )}
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

function getProviderTitle(role: string) {
  switch (role) {
    case "Dentist":
    case "Specialist":
      return "Dr.";

    case "Hygienist":
      return "Hyg.";

    default:
      return "";
  }
}

function InfoCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-sm text-slate-500">{title}</p>
      <p className="text-lg font-semibold mt-1">{value}</p>
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  const roleClasses: Record<string, string> = {
    super_admin: "border-purple-200 bg-purple-50 text-purple-700",
    admin: "border-blue-200 bg-blue-50 text-blue-700",
    clinical_staff: "border-green-200 bg-green-50 text-green-700",
    doctor: "border-indigo-200 bg-indigo-50 text-indigo-700",
    auditor: "border-slate-200 bg-slate-50 text-slate-600",
  };

  return (
    <span
      className={`rounded-lg border px-3 py-1 text-xs font-medium ${
        roleClasses[role] || "border-slate-200 bg-slate-50 text-slate-600"
      }`}
    >
      {role}
    </span>
  );
}

function ProviderRoleBadge({ role }: { role: string }) {
  const roleClasses: Record<string, string> = {
    Dentist: "border-blue-200 bg-blue-50 text-blue-700",
    Hygienist: "border-green-200 bg-green-50 text-green-700",
    Assistant: "border-purple-200 bg-purple-50 text-purple-700",
    Specialist: "border-indigo-200 bg-indigo-50 text-indigo-700",
    Other: "border-slate-200 bg-slate-50 text-slate-600",
    Provider: "border-slate-200 bg-slate-50 text-slate-600",
  };

  return (
    <span
      className={`rounded-lg border px-3 py-1 text-xs font-medium ${
        roleClasses[role] || "border-slate-200 bg-slate-50 text-slate-600"
      }`}
    >
      {role}
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