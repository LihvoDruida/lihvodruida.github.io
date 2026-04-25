"use client";

import { type FormEvent, useState } from "react";

export default function LogoutButton() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  function fallbackLogout(message?: string) {
    if (message) console.warn("[dashboard:logout:fallback]", message);
    window.location.assign("/api/auth/logout?fallback=1");
  }

  async function submitLogout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    setPending(true);
    setError("");

    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        redirect: "follow",
        headers: {
          Accept: "application/json, text/html;q=0.9, */*;q=0.8",
          "X-Dashboard-Action": "logout",
        },
      });

      if (!response.ok && !response.redirected) {
        const data = await response.json().catch(() => ({}));
        fallbackLogout(data?.error || `Logout POST failed with ${response.status}`);
        return;
      }

      window.location.assign("/login");
    } catch (caught) {
      console.error("[dashboard:logout]", caught);
      setError("Виконуємо резервний вихід...");
      fallbackLogout(caught instanceof Error ? caught.message : "Logout fetch failed");
    }
  }

  return (
    <form method="post" action="/api/auth/logout" className="dashboard-user__logout" onSubmit={submitLogout}>
      <button type="submit" aria-label="Вийти" disabled={pending} aria-busy={pending}>
        {pending ? "Виходимо..." : "Вийти"}
      </button>
      {error ? <small className="dashboard-user__logout-error" role="alert">{error}</small> : null}
    </form>
  );
}
