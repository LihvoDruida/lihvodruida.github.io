"use client";

import { type FormEvent, useState } from "react";

export default function LogoutButton() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

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
        headers: {
          Accept: "application/json",
          "X-Dashboard-Action": "logout",
        },
      });

      if (!response.ok && !response.redirected) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.error || "Не вдалося вийти з акаунта.");
      }

      window.location.assign("/login");
    } catch (caught) {
      console.error("[dashboard:logout]", caught);
      setError(caught instanceof Error ? caught.message : "Не вдалося вийти з акаунта.");
      setPending(false);
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
