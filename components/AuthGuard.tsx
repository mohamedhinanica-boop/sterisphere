"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter, usePathname } from "next/navigation";

const accessCheckTimeoutMs = 12000;

const routePermissions: Record<string, string[]> = {
  "/": ["super_admin", "admin", "clinical_staff", "doctor", "auditor"],
  "/assistant": ["super_admin", "admin", "clinical_staff"],
  "/cycles": ["super_admin", "admin", "clinical_staff"],
  "/packs": ["super_admin", "admin", "clinical_staff"],
  "/patients": ["super_admin", "admin", "clinical_staff", "doctor"],
  "/patients/import": ["super_admin"],
  "/patient-history": [
    "super_admin",
    "admin",
    "clinical_staff",
    "doctor",
    "auditor",
  ],
  "/reports": ["super_admin", "admin", "doctor", "auditor"],
  "/investigation": ["super_admin", "admin", "doctor", "auditor"],
  "/settings": ["super_admin", "admin"],
  "/audit-logs": ["super_admin", "admin", "auditor"],
};

export default function AuthGuard({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [accessError, setAccessError] = useState("");
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    function finishCheck(nextState: {
      checking: boolean;
      allowed: boolean;
      accessError?: string;
    }) {
      if (cancelled) {
        return;
      }

      setChecking(nextState.checking);
      setAllowed(nextState.allowed);
      setAccessError(nextState.accessError || "");
    }

    async function checkAccess() {
      try {
        finishCheck({ checking: true, allowed: false });

        if (pathname === "/login") {
          finishCheck({ checking: false, allowed: true });
          return;
        }

        console.info("[AuthGuard] Loading auth user.");
        const {
          data: { user },
          error: userError,
        } = await withTimeout(
          supabase.auth.getUser(),
          accessCheckTimeoutMs,
          "Auth user lookup timed out."
        );

        console.info("[AuthGuard] Auth user loaded.", {
          hasUser: Boolean(user),
          hasError: Boolean(userError),
        });
        console.info("[AuthGuard] User email:", user?.email || "none");

        if (userError || !user?.email) {
          await supabase.auth.signOut();
          router.push("/login");
          finishCheck({ checking: false, allowed: false });
          return;
        }

        console.info("[AuthGuard] Role lookup started.", {
          userEmail: user.email,
          pathname,
        });
        let roleData: { role: string | null; active: boolean | null } | null =
          null;
        let roleError: unknown = null;

        try {
          const result = await withTimeout(
            supabase
              .from("user_roles")
              .select("role, active")
              .eq("user_email", user.email)
              .maybeSingle(),
            accessCheckTimeoutMs,
            "Role lookup timed out."
          );

          roleData = result.data;
          roleError = result.error;
        } catch (error) {
          roleError = error;
        }

        console.info("[AuthGuard] Role lookup result.", {
          role: roleData?.role || null,
          active: roleData?.active ?? null,
        });

        if (roleError) {
          console.error("[AuthGuard] Role lookup error:", roleError);
          finishCheck({
            checking: false,
            allowed: false,
            accessError:
              "We could not verify your access role. Please check your connection and try again.",
          });
          return;
        }

        if (!roleData?.active) {
          console.warn("[AuthGuard] Role lookup returned no active role.", {
            userEmail: user.email,
            roleData,
          });
          finishCheck({
            checking: false,
            allowed: false,
            accessError:
              "Your account is signed in, but no active access role was found. Please contact an administrator.",
          });
          return;
        }

        const userRole = roleData.role || "";
        const allowedRoles = routePermissions[pathname] || [];

        if (!allowedRoles.includes(userRole)) {
          router.push("/");
          finishCheck({ checking: false, allowed: false });
          return;
        }

        finishCheck({ checking: false, allowed: true });
      } catch (error) {
        console.error("AuthGuard error:", error);
        finishCheck({
          checking: false,
          allowed: false,
          accessError:
            "Access verification took too long or failed. Please try again.",
        });
      }
    }

    checkAccess();

    return () => {
      cancelled = true;
    };
  }, [pathname, router, retryKey]);

  if (checking) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-100">
        <p className="text-slate-600">Checking access...</p>
      </main>
    );
  }

  if (!allowed) {
    if (accessError) {
      return (
        <main className="min-h-screen flex items-center justify-center bg-slate-100 p-6">
          <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
            <h1 className="text-2xl font-semibold text-slate-950">
              Access check failed
            </h1>
            <p className="mt-3 text-sm text-slate-600">{accessError}</p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
              <button
                type="button"
                onClick={() => setRetryKey((current) => current + 1)}
                className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-medium text-white hover:bg-slate-800"
              >
                Try Again
              </button>
              <button
                type="button"
                onClick={async () => {
                  await supabase.auth.signOut();
                  router.push("/login");
                }}
                className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Back to Login
              </button>
            </div>
          </section>
        </main>
      );
    }

    return null;
  }

  return <>{children}</>;
}

async function withTimeout<T>(
  promise: PromiseLike<T>,
  timeoutMs: number,
  message: string
) {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}
