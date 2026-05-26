"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import toast from "react-hot-toast";

export default function LoginPage() {
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
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-100 via-slate-200 to-slate-300 p-6">
      <section className="w-full max-w-md rounded-3xl bg-white shadow-2xl border border-slate-200 p-8">
        <div className="text-center mb-8">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-950 text-white text-2xl font-bold shadow-lg">
            S
          </div>

          <h1 className="text-4xl font-bold text-slate-900">
            SteriSphere
          </h1>

          <p className="mt-2 text-slate-600">
            Sterilization Traceability Platform
          </p>
        </div>

        <div className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Email
            </label>

            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 placeholder-slate-400 outline-none transition focus:border-slate-500 focus:ring-4 focus:ring-slate-200"
              placeholder="Enter your email"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Password
            </label>

            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 placeholder-slate-400 outline-none transition focus:border-slate-500 focus:ring-4 focus:ring-slate-200"
              placeholder="Enter your password"
            />
          </div>

          <button
            type="button"
            onClick={login}
            disabled={loading}
            className="w-full rounded-2xl bg-slate-950 text-white px-6 py-3 font-semibold shadow-lg cursor-pointer hover:bg-slate-800 active:scale-[0.98] transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Logging in..." : "Login"}
          </button>
        </div>

        <div className="mt-8 border-t border-slate-200 pt-5 text-center">
          <p className="text-xs text-slate-500">
            Secure sterilization workflow & patient traceability
          </p>
        </div>
      </section>
    </main>
  );
}