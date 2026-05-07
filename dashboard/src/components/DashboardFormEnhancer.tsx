"use client";

import { useEffect } from "react";
import { dispatchDashboardToast } from "@/lib/clientToasts";
import { notifyDashboardDataChanged, type DashboardDataScope } from "@/lib/dashboardLiveRefresh";

type ToastPayload = {
  tone?: "info" | "success" | "warning" | "error";
  title?: string;
  message?: string;
  ttl?: number;
};

function formUsesApi(form: HTMLFormElement) {
  if (form.dataset.toastManaged === "true") return false;
  if (form.dataset.dashboardActionForm === "true") return true;
  const action = form.getAttribute("action") || "";
  return action.startsWith("/api/") || action.includes("/api/");
}

function formUsesLiveSubmit(form: HTMLFormElement) {
  return form.dataset.dashboardLiveSubmit === "true";
}

function actionText(action: string) {
  if (action === "access-groups-create") return { label: "Створюємо...", title: "Створюємо групу", message: "Перевіряємо ID, Discord role ID, іконку та права доступу." };
  if (action === "access-groups-save") return { label: "Зберігаємо...", title: "Зберігаємо групу", message: "Оновлюємо назву, іконку, Discord role ID та права у Firebase." };
  if (action === "access-groups-delete") return { label: "Видаляємо...", title: "Видаляємо групу", message: "Перевіряємо захист системних груп і оновлюємо список." };
  if (action === "access-groups-impersonate") return { label: "Вмикаємо перегляд...", title: "Вмикаємо режим перегляду", message: "Перемикаємо тестовий доступ без зміни реальної ролі акаунта." };
  if (action === "access-groups-impersonation-end") return { label: "Завершуємо...", title: "Завершуємо режим перегляду", message: "Повертаємо реальні права твого акаунта." };
  if (action.includes("/applications/bulk-status")) return { label: "Синхронізуємо...", title: "Масова модерація", message: "Оновлюємо вибрані заявки та Discord-повідомлення." };
  if (action.includes("/profile/characters/bulk-add")) return { label: "Додаємо...", title: "Додаємо персонажів", message: "Додаємо вибраних персонажів однією дією." };
  if (action.includes("/profile/characters/add")) return { label: "Додаємо...", title: "Додаємо персонажа", message: "Перевіряємо Battle.net і додаємо персонажа до профілю." };
  if (action.includes("/profile/characters/remove")) return { label: "Видаляємо...", title: "Видаляємо персонажа", message: "Оновлюємо список персонажів і мейна." };
  if (action.includes("/profile/characters/main")) return { label: "Оновлюємо...", title: "Оновлюємо мейна", message: "Зберігаємо основного персонажа для сайту й Discord." };
  if (action.includes("/profile/raid-role")) return { label: "Зберігаємо...", title: "Зберігаємо роль у рейді", message: "Оновлюємо пріоритет ролі для запису на рейди." };
  if (action.includes("/profile/name-mode")) return { label: "Зберігаємо...", title: "Зберігаємо формат імені", message: "Оновлюємо, як імʼя показується в панелі, рейдах і авторах." };
  if (action.includes("/profile/name")) return { label: "Зберігаємо...", title: "Зберігаємо імʼя", message: "Оновлюємо імʼя в профілі." };
  if (action.includes("/profile/discord-nickname")) return { label: "Синхронізуємо...", title: "Оновлюємо Discord імʼя", message: "Змінюємо серверний nickname у Discord за профільним стандартом." };
  if (action.includes("/raids/") && action.includes("/attendance")) return { label: "Оновлюємо...", title: "Оновлюємо запис", message: "Записуємо дію та оновлюємо склад рейду без перезавантаження." };
  if (action.includes("/delete")) return { label: "Видаляємо...", title: "Видаляємо", message: "Обробляємо запит і оновлюємо дані." };
  if (action.includes("/logout")) return { label: "Виходимо...", title: "Вихід", message: "Завершуємо поточну сесію." };
  if (action.includes("/auth/login")) return { label: "Перевіряємо...", title: "Перевіряємо доступ", message: "Перевіряємо доступ і відкриваємо панель." };
  if (action.includes("/discord/embeds")) return { label: "Виконуємо...", title: "Дія в Discord виконується", message: "Передаємо зміни в Discord." };
  if (action.includes("/api/raids/publish")) return { label: "Публікуємо...", title: "Публікуємо рейд", message: "Оновлюємо Discord-оголошення та кнопки запису." };
  if (action.includes("/api/raids")) return { label: "Зберігаємо...", title: "Зберігаємо рейд", message: "Зберігаємо зміни в панелі." };
  if (action.includes("/content/create")) return { label: "Публікуємо...", title: "Публікуємо матеріал", message: "Зберігаємо матеріал і готуємо оновлення сторінки." };
  if (action.includes("/content/update")) return { label: "Зберігаємо...", title: "Зберігаємо зміни", message: "Оновлюємо матеріал." };
  return { label: "Виконуємо...", title: "Обробка дії", message: "Запит виконується. Зачекай кілька секунд." };
}

function pushToast(title: string, message?: string) {
  dispatchDashboardToast({ tone: "info", title, message, ttl: 3600 });
}

function deleteConfirmText(form: HTMLFormElement, submitter: HTMLButtonElement | null) {
  const action = submitter?.formAction || form.getAttribute("action") || "";
  const explicit = form.dataset.confirmMessage || submitter?.dataset.confirmMessage || "";
  if (explicit) return explicit;

  const dangerousButton = submitter?.classList.contains("danger") || submitter?.classList.contains("btn-danger");
  if (action.includes("/delete") || dangerousButton) {
    return "Підтвердити видалення? Дію не можна швидко скасувати.";
  }
  return "";
}

function preserveSubmitterValue(form: HTMLFormElement, submitter: HTMLButtonElement | null) {
  form.querySelectorAll<HTMLInputElement>('input[data-submitter-proxy="true"]').forEach((input) => input.remove());
  if (!submitter?.name) return;

  const input = document.createElement("input");
  input.type = "hidden";
  input.name = submitter.name;
  input.value = submitter.value;
  input.dataset.submitterProxy = "true";
  form.appendChild(input);
}

function preserveButtonState(buttons: HTMLButtonElement[]) {
  for (const button of buttons) {
    button.dataset.wasDisabled = button.disabled ? "true" : "false";
    button.dataset.originalText = button.textContent || "";
  }
}

function setWorking(form: HTMLFormElement, buttons: HTMLButtonElement[], submitter: HTMLButtonElement | null, label: string) {
  form.dataset.submitting = "true";
  form.classList.add("is-submitting");
  form.setAttribute("aria-busy", "true");

  for (const button of buttons) {
    button.disabled = true;
    if (button === submitter) {
      button.setAttribute("aria-busy", "true");
      button.classList.add("btn-working");
    } else {
      button.removeAttribute("aria-busy");
      button.classList.add("btn-waiting");
    }
  }

  if (submitter) {
    const shouldPreserveLabel =
      submitter.dataset.preserveLabel === "true" ||
      submitter.classList.contains("profile-icon-action") ||
      submitter.classList.contains("icon-only");

    if (!shouldPreserveLabel) {
      submitter.textContent = submitter.dataset.loadingLabel || label;
    }
  }
}

function resetWorking(form: HTMLFormElement, buttons: HTMLButtonElement[]) {
  delete form.dataset.submitting;
  form.classList.remove("is-submitting");
  form.removeAttribute("aria-busy");
  form.querySelectorAll<HTMLInputElement>('input[data-submitter-proxy="true"]').forEach((input) => input.remove());

  for (const button of buttons) {
    button.disabled = button.dataset.wasDisabled === "true";
    button.removeAttribute("aria-busy");
    button.classList.remove("btn-working", "btn-waiting");
    if (button.dataset.originalText) button.textContent = button.dataset.originalText;
    delete button.dataset.wasDisabled;
    delete button.dataset.originalText;
  }
}


function mutationScopeFromAction(action: string): DashboardDataScope {
  if (action.includes("/applications/")) return "applications";
  if (action.includes("/content/")) return "content";
  if (action.includes("/discord/")) return "discord";
  if (action.includes("/guild/")) return "guild";
  if (action.includes("/profile/")) return "profile";
  if (action.includes("/raids")) return "raids";
  if (action.includes("/auth/")) return "session";
  return "unknown";
}

function toastFromResponse(data: unknown, responseOk: boolean): ToastPayload {
  if (data && typeof data === "object" && "toast" in data) {
    const toast = (data as { toast?: ToastPayload }).toast;
    if (toast?.title) return toast;
  }
  if (data && typeof data === "object" && "message" in data) {
    const message = String((data as { message?: unknown }).message || "");
    if (message) return { tone: responseOk ? "success" : "error", title: responseOk ? "Готово" : "Дію не виконано", message };
  }
  return responseOk
    ? { tone: "success", title: "Готово", message: "Дані оновлено." }
    : { tone: "error", title: "Дію не виконано", message: "Сервер не повернув зрозумілу відповідь." };
}

export default function DashboardFormEnhancer() {
  useEffect(() => {
    async function submitLiveForm(form: HTMLFormElement, submitter: HTMLButtonElement | null, buttons: HTMLButtonElement[], action: string, label: string) {
      try {
        const response = await fetch(action || window.location.href, {
          method: (form.method || "post").toUpperCase(),
          body: new FormData(form),
          credentials: "same-origin",
          headers: {
            Accept: "application/json",
            "X-Dashboard-Action": "live",
          },
        });
        const data = await response.json().catch(() => null);
        const toast = toastFromResponse(data, response.ok);
        dispatchDashboardToast({
          tone: toast.tone || (response.ok ? "success" : "error"),
          title: toast.title || (response.ok ? "Готово" : "Дію не виконано"),
          message: toast.message,
          ttl: toast.ttl || (response.ok ? 4200 : 7600),
        });

        const loginUrl = data && typeof data === "object" && "loginUrl" in data ? String((data as { loginUrl?: unknown }).loginUrl || "") : "";
        if (!response.ok && loginUrl) {
          window.setTimeout(() => window.location.assign(loginUrl), 650);
          return;
        }

        if (response.ok) {
          notifyDashboardDataChanged({ scope: mutationScopeFromAction(action), action, source: "form-enhancer" });
        }
      } catch {
        dispatchDashboardToast({
          tone: "error",
          title: "Немає відповіді від сервера",
          message: "Перевір інтернет або повтори дію через кілька секунд.",
          ttl: 7600,
        });
      } finally {
        resetWorking(form, buttons);
        if (submitter) submitter.focus({ preventScroll: true });
      }
    }

    function onSubmit(event: SubmitEvent) {
      const form = event.target instanceof HTMLFormElement ? event.target : null;
      if (!form || !formUsesApi(form) || form.dataset.submitting === "true") return;

      const submitter = event.submitter instanceof HTMLButtonElement ? event.submitter : null;
      const confirmText = deleteConfirmText(form, submitter);
      if (confirmText && !window.confirm(confirmText)) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      const buttons = Array.from(form.querySelectorAll<HTMLButtonElement>('button[type="submit"], button:not([type])'));
      const action = submitter?.dataset.dashboardAction || form.dataset.dashboardAction || submitter?.formAction || form.getAttribute("action") || "";
      const submitAction = submitter?.formAction || form.getAttribute("action") || "";
      const copy = actionText(action);

      const liveSubmit = formUsesLiveSubmit(form);
      if (liveSubmit) {
        event.preventDefault();
        event.stopPropagation();
        if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
      }

      preserveSubmitterValue(form, submitter);
      preserveButtonState(buttons);
      setWorking(form, buttons, submitter, copy.label);
      pushToast(copy.title, copy.message);

      if (liveSubmit) {
        void submitLiveForm(form, submitter, buttons, submitAction, copy.label);
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
        message: field?.validationMessage || "Перевір поля форми й заповни обов’язкові значення.",
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
