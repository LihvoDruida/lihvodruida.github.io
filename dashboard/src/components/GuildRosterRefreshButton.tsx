"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type RefreshState = "idle" | "loading" | "done" | "error";

export default function GuildRosterRefreshButton() {
  const router = useRouter();
  const [state, setState] = useState<RefreshState>("idle");
  const [message, setMessage] = useState("");

  async function refreshRoster() {
    if (state === "loading") return;
    setState("loading");
    setMessage("Оновлюю склад…");

    try {
      const response = await fetch("/api/guild/refresh", {
        method: "POST",
        headers: { Accept: "application/json" },
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.error || "Оновлення не виконалось.");
      }

      setState("done");
      setMessage(`Оновлено: ${payload?.memberCount ?? 0} персонажів`);
      router.refresh();
      window.setTimeout(() => {
        setState("idle");
        setMessage("");
      }, 4000);
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Не вдалося оновити склад.");
    }
  }

  return (
    <div className="guild-refresh-action">
      <button type="button" onClick={refreshRoster} disabled={state === "loading"} aria-busy={state === "loading"}>
        {state === "loading" ? "Оновлення…" : "Оновити склад"}
      </button>
      {message ? <span className={`guild-refresh-action__status guild-refresh-action__status--${state}`}>{message}</span> : null}
    </div>
  );
}
