"use client";

import { useEffect } from "react";

function formUsesApi(form: HTMLFormElement) {
  const action = form.getAttribute("action") || "";
  return action.startsWith("/api/") || action.includes("/api/");
}

function actionText(action: string) {
  if (action.includes("/profile/characters/add")) return { label: "Додаємо...", title: "Додаємо персонажа", message: "Перевіряємо Battle.net сесію і записуємо персонажа у Firebase." };
  if (action.includes("/profile/characters/remove")) return { label: "Видаляємо...", title: "Видаляємо персонажа", message: "Оновлюємо профіль і main-персонажа у Firebase." };
  if (action.includes("/profile/characters/main")) return { label: "Оновлюємо...", title: "Оновлюємо мейна", message: "Зберігаємо основного персонажа для сайту й інтеграцій." };
  if (action.includes("/delete")) return { label: "Видаляємо...", title: "Видаляємо", message: "Обробляємо запит і оновлюємо дані." };
  if (action.includes("/logout")) return { label: "Виходимо...", title: "Вихід", message: "Завершуємо поточну сесію." };
  if (action.includes("/discord/embeds")) return { label: "Виконуємо...", title: "Discord дія виконується", message: "Надсилаємо запит до Discord API." };
  if (action.includes("/content/create")) return { label: "Публікуємо...", title: "Публікуємо матеріал", message: "Зберігаємо контент і готуємо оновлення сторінки." };
  if (action.includes("/content/update")) return { label: "Зберігаємо...", title: "Зберігаємо зміни", message: "Оновлюємо матеріал." };
  return { label: "Виконуємо...", title: "Обробка дії", message: "Запит виконується. Зачекай кілька секунд." };
}

function pushToast(title: string, message?: string) {
  window.dispatchEvent(new CustomEvent("dashboard:toast", {
    detail: { tone: "info", title, message, ttl: 3600 },
  }));
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
      const action = form.getAttribute("action") || "";
      const copy = actionText(action);

      pushToast(copy.title, copy.message);

      for (const button of buttons) {
        button.disabled = true;
        button.setAttribute("aria-busy", "true");
        button.classList.add("btn-working");
      }

      if (submitter) {
        submitter.dataset.originalText = submitter.textContent || "";
        submitter.textContent = copy.label;
      }
    }

    function onClick(event: MouseEvent) {
      const target = event.target instanceof Element ? event.target : null;
      const link = target?.closest<HTMLAnchorElement>('a[href*="/api/auth/battlenet/start"]');
      if (!link) return;

      pushToast("Відкриваємо Battle.net", "Зараз буде справжня реавторизація акаунта для оновлення списку персонажів.");
      link.classList.add("is-submitting");
      link.setAttribute("aria-busy", "true");
    }

    window.addEventListener("submit", onSubmit, true);
    window.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("submit", onSubmit, true);
      window.removeEventListener("click", onClick, true);
    };
  }, []);

  return null;
}
