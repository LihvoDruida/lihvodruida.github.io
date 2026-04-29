"use client";

import { useEffect } from "react";
import { dispatchDashboardToast } from "@/lib/clientToasts";

function formUsesApi(form: HTMLFormElement) {
  if (form.dataset.toastManaged === "true") return false;
  const action = form.getAttribute("action") || "";
  return action.startsWith("/api/") || action.includes("/api/");
}

function actionText(action: string) {
  if (action.includes("/applications/bulk-status")) return { label: "Синхронізуємо...", title: "Масова модерація", message: "Оновлюємо вибрані заявки та Discord-повідомлення." };
  if (action.includes("/profile/characters/bulk-add")) return { label: "Додаємо...", title: "Додаємо персонажів", message: "Додаємо вибраних персонажів однією дією." };
  if (action.includes("/profile/characters/add")) return { label: "Додаємо...", title: "Додаємо персонажа", message: "Перевіряємо Battle.net і додаємо персонажа до профілю." };
  if (action.includes("/profile/characters/remove")) return { label: "Видаляємо...", title: "Видаляємо персонажа", message: "Оновлюємо список персонажів і main-персонажа." };
  if (action.includes("/profile/characters/main")) return { label: "Оновлюємо...", title: "Оновлюємо мейна", message: "Зберігаємо основного персонажа для сайту й інтеграцій." };
  if (action.includes("/delete")) return { label: "Видаляємо...", title: "Видаляємо", message: "Обробляємо запит і оновлюємо дані." };
  if (action.includes("/logout")) return { label: "Виходимо...", title: "Вихід", message: "Завершуємо поточну сесію." };
  if (action.includes("/auth/login")) return { label: "Перевіряємо...", title: "Перевіряємо доступ", message: "Перевіряємо доступ і відкриваємо панель." };
  if (action.includes("/discord/embeds")) return { label: "Виконуємо...", title: "Дія в Discord виконується", message: "Передаємо зміни в Discord." };
  if (action.includes("/content/create")) return { label: "Публікуємо...", title: "Публікуємо матеріал", message: "Зберігаємо матеріал і готуємо оновлення сторінки." };
  if (action.includes("/content/update")) return { label: "Зберігаємо...", title: "Зберігаємо зміни", message: "Оновлюємо матеріал." };
  return { label: "Виконуємо...", title: "Обробка дії", message: "Запит виконується. Зачекай кілька секунд." };
}

function pushToast(title: string, message?: string) {
  dispatchDashboardToast({ tone: "info", title, message, ttl: 3600 });
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
      const bnetLink = target?.closest<HTMLAnchorElement>('a[href*="/api/auth/battlenet/start"]');
      const discordLoginLink = target?.closest<HTMLAnchorElement>('a[href*="/api/auth/discord/start"]');

      if (bnetLink) {
        pushToast("Відкриваємо Battle.net", "Зараз буде справжня реавторизація акаунта для оновлення списку персонажів.");
        bnetLink.classList.add("is-submitting");
        bnetLink.setAttribute("aria-busy", "true");
        return;
      }

      if (discordLoginLink) {
        pushToast("Відкриваємо Discord", "Відкриваємо вхід через Discord і перевірку ролей доступу.");
        discordLoginLink.classList.add("is-submitting");
        discordLoginLink.setAttribute("aria-busy", "true");
      }
    }

    function onInvalid(event: Event) {
      const field = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement
        ? event.target
        : null;
      const form = field?.form || null;
      if (!form || !formUsesApi(form) || form.dataset.invalidToastShown === "true") return;

      form.dataset.invalidToastShown = "true";
      window.setTimeout(() => {
        delete form.dataset.invalidToastShown;
      }, 1800);

      dispatchDashboardToast({
        tone: "warning",
        title: "Заповни обов’язкові поля",
        message: field?.validationMessage || "Форма має невалідні або порожні значення.",
        ttl: 4200,
      });
    }

    window.addEventListener("submit", onSubmit, true);
    window.addEventListener("click", onClick, true);
    window.addEventListener("invalid", onInvalid, true);
    return () => {
      window.removeEventListener("submit", onSubmit, true);
      window.removeEventListener("click", onClick, true);
      window.removeEventListener("invalid", onInvalid, true);
    };
  }, []);

  return null;
}
