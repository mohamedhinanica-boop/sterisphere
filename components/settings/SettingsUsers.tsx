import { Panel, RoleBadge, StatusBadge, StatusCount } from "./index";

type UserRole = {
  id: string;
  user_email: string;
  role: string;
  active: boolean;
  created_at: string;
};

type SettingsUsersProps = {
  roles: UserRole[];
  activeUsersCount: number;
  inactiveUsersCount: number;
  currentUserEmail: string;
  currentRole: string;
  loading: boolean;
  updateUserRole: (roleId: string, newRole: string) => void | Promise<void>;
  toggleUserStatus: (
    userId: string,
    currentStatus: boolean,
  ) => void | Promise<void>;
};

const userRoleOptions = [
  "super_admin",
  "admin",
  "clinical_staff",
  "doctor",
  "auditor",
];

export default function SettingsUsers({
  roles,
  activeUsersCount,
  inactiveUsersCount,
  currentUserEmail,
  currentRole,
  loading,
  updateUserRole,
  toggleUserStatus,
}: SettingsUsersProps) {
  return (
    <Panel
      title="Users & Roles"
      description="Manage account roles and access permissions."
    >
      {currentRole !== "super_admin" && (
        <div className="mb-4 rounded-xl border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
          You can view users, but only a super admin can change roles or
          activate/deactivate accounts.
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        <StatusCount label="Active" value={activeUsersCount} />
        <StatusCount label="Inactive" value={inactiveUsersCount} />
      </div>

      {roles.length === 0 ? (
        <p className="text-slate-500">No user roles found.</p>
      ) : (
        <div className="space-y-3">
          {roles.map((role) => {
            const isCurrentUser = role.user_email === currentUserEmail;
            const canManageUser =
              currentRole === "super_admin" && !isCurrentUser;

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
                    onChange={(event) =>
                      updateUserRole(role.id, event.target.value)
                    }
                    className="w-full md:w-auto h-fit rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm capitalize disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {userRoleOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
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
    </Panel>
  );
}
