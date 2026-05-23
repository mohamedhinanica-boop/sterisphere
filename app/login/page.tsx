"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import toast from "react-hot-toast";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function login() {
    if (!email || !password) {
      toast.error("Please enter your email and password.");
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      toast.error("Login failed.");
      setLoading(false);
      return;
    }

    toast.success("Logged in successfully.");
    window.location.href = "/";
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-100 p-6">
      <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 w-full max-w-md">
        <h1 className="text-3xl font-bold">SteriSphere Login</h1>
        <p className="text-slate-600 mt-2">
          Sign in to access the sterilization traceability platform.
        </p>

        <div className="space-y-4 mt-8">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-4 py-3"
            placeholder="Email"
          />

          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-4 py-3"
            placeholder="Password"
          />

          <button
            type="button"
            onClick={login}
            disabled={loading}
            className="w-full rounded-xl bg-slate-950 text-white px-6 py-3 font-medium cursor-pointer hover:bg-slate-800 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Logging in..." : "Login"}
          </button>
        </div>
      </section>
    </main>
  );
}