"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import toast from "react-hot-toast";

type UserRole = {
  id: string;
  user_email: string;
  role: string;
  created_at: string;
};

export default function SettingsPage() {
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchRoles();
  }, []);

  async function fetchRoles() {
    const { data, error } = await supabase
      .from("user_roles")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Error loading user roles.");
      console.error(error);
      return;
    }

    setRoles(data || []);
  }

  async function updateUserRole(roleId: string, newRole: string) {
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

    await fetchRoles();

    toast.success("User role updated.");
    window.location.reload();
    setLoading(false);
  }

  return (
    <>
      <header className="mb-8">
        <h1 className="text-4xl font-bold">Settings</h1>
        <p className="mt-2 text-slate-600">
          Admin configuration for users, roles, and system settings.
        </p>
      </header>

      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-6">
        <h2 className="text-2xl font-semibold mb-4">System Overview</h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <InfoCard title="Clinic" value="Dentaria" />
          <InfoCard title="Database" value="Connected" />
          <InfoCard title="Environment" value="MVP / Development" />
        </div>
      </section>

      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h2 className="text-2xl font-semibold mb-4">User Roles</h2>

        {roles.length === 0 ? (
          <p className="text-slate-500">No user roles found.</p>
        ) : (
          <div className="space-y-3">
            {roles.map((role) => (
              <div
                key={role.id}
                className="rounded-xl border border-slate-200 p-4 flex justify-between gap-4"
              >
                <div>
                  <p className="font-medium">{role.user_email}</p>
                  <p className="text-xs text-slate-400">
                    Added: {new Date(role.created_at).toLocaleString()}
                  </p>
                </div>

                <select
                  value={role.role}
                  disabled={loading}
                  onChange={(e) => updateUserRole(role.id, e.target.value)}
                  className="h-fit rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm capitalize"
                >
                  <option value="admin">admin</option>
                  <option value="clinical_staff">clinical_staff</option>
                  <option value="doctor">doctor</option>
                  <option value="auditor">auditor</option>
                </select>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

function InfoCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-sm text-slate-500">{title}</p>
      <p className="text-lg font-semibold mt-1">{value}</p>
    </div>
  );
}