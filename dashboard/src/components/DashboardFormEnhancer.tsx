"use client";

import { useEffect } from "react";

function formUsesApi(form: HTMLFormElement) {
  const action = form.getAttribute("action") || "";
  return action.startsWith("/api/") || action.includes("/api/");
}

function buttonLabelFor(form: HTMLFormElement) {
  const action = form.getAttribute("action") || "";
  if (action.includes("/delete")) return "Видаляємо...";
  if (action.includes("/logout")) return "Виходимо...";
  if (action.includes("/discord/embeds")) return "Виконуємо...";
  if (action.includes("/content/create")) return "Публікуємо...";
  if (action.includes("/content/update")) return "Зберігаємо...";
  return "Виконуємо...";
}

export default function DashboardFormEnhancer() {
  useEffect(() => {
    function onSubmit(event: SubmitEvent) {
      const form = event.target instanceof HTMLFormElement ? event.target : null;
      if (!form || !formUsesApi(form) || form.dataset.submitting === "true") return;

      form.dataset.submitting = "true";
      form.classList.add("is-submitting");
      form.setAttribute("aria-busy", "true");

      const submitter = event.submitter instanceof HTMLButtonElement ? event.submitter : null;
      const buttons = Array.from(form.querySelectorAll<HTMLButtonElement>('button[type="submit"], button:not([type])'));
      const label = buttonLabelFor(form);

      for (const button of buttons) {
        button.disabled = true;
        button.setAttribute("aria-busy", "true");
        button.classList.add("btn-working");
      }

      if (submitter) {
        submitter.dataset.originalText = submitter.textContent || "";
        submitter.textContent = label;
      }
    }

    window.addEventListener("submit", onSubmit, true);
    return () => window.removeEventListener("submit", onSubmit, true);
  }, []);

  return null;
}
