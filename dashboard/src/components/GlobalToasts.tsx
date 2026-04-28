"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type ToastTone = "info" | "success" | "warning" | "error";

type Toast = {
  id: string;
  tone: ToastTone;
  title: string;
  message?: string;
  ttl?: number;
};

const CHARACTER_STATUS_MESSAGES: Record<string, Omit<Toast, "id">> = {
  bnet_connected: {
    tone: "success",
    title: "Battle.net перевірено",
    message: "Свіжий список персонажів тимчасово доступний для додавання. У Firebase збережуться лише ті, які ти додаси.",
  },
  bnet_no_guild_characters: {
    tone: "warning",
    title: "Персонажів гільдії не знайдено",
    message: "Battle.net підключено, але серед підтверджених персонажів немає Mistblossom Vanguard.",
  },
  bnet_failed: {
    tone: "error",
    title: "Battle.net не оновлено",
    message: "Перевір OAuth env, scope wow.profile, redirect URI та регіон.",
  },
  bnet_state: {
    tone: "warning",
    title: "Battle.net авторизацію відхилено",
    message: "OAuth-перевірка не пройшла. Запусти підключення ще раз.",
  },
  character_added: {
    tone: "success",
    title: "Персонажа додано",
    message: "Він збережений у Firebase і прив’язаний до твого профілю.",
  },
  characters_added: {
    tone: "success",
    title: "Персонажів додано",
    message: "Вибрані персонажі збережені одним batch-запитом. Тимчасовий список очищено від доданих записів.",
  },
  characters_bulk_empty: {
    tone: "warning",
    title: "Немає вибраних персонажів",
    message: "Познач персонажів у списку або натисни “Додати всі”.",
  },
  characters_bulk_noop: {
    tone: "warning",
    title: "Нічого не додано",
    message: "Вибрані персонажі вже є в профілі або досягнуто ліміт збережених персонажів.",
  },
  character_add_failed: {
    tone: "error",
    title: "Персонажа не додано",
    message: "Потрібна свіжа Battle.net перевірка, а персонаж має бути в Mistblossom Vanguard.",
  },
  character_reauth_required: {
    tone: "warning",
    title: "Потрібна реавторизація Battle.net",
    message: "Тимчасова перевірка персонажів уже недійсна або була очищена.",
  },
  character_removed: {
    tone: "success",
    title: "Персонажа видалено",
    message: "Запис прибрано з Firebase. Для повторного додавання потрібна нова Battle.net перевірка.",
  },
  character_remove_failed: {
    tone: "error",
    title: "Не вдалося видалити персонажа",
    message: "Спробуй ще раз або перевір доступ до Firebase.",
  },
  main_character_set: {
    tone: "success",
    title: "Мейн оновлено",
    message: "Цей персонаж тепер використовується як основний для сайту й інтеграцій.",
  },
  main_character_failed: {
    tone: "error",
    title: "Мейна не змінено",
    message: "Персонаж має бути доданий до профілю перед призначенням main.",
  },
  rate_limit: {
    tone: "warning",
    title: "Забагато дій",
    message: "Зачекай кілька хвилин і повтори спробу.",
  },
};

const LOGIN_ERROR_MESSAGES: Record<string, Omit<Toast, "id">> = {
  rate_limit: { tone: "warning", title: "Забагато спроб входу", message: "Зачекай кілька хвилин і повтори авторизацію." },
  token: { tone: "error", title: "Вхід не виконано", message: "Токен недійсний або застарів." },
  session_required: { tone: "warning", title: "Потрібен вхід", message: "Увійди в акаунт, щоб продовжити дію." },
  discord_only: { tone: "warning", title: "Доступ через Discord", message: "Для панелі використовується Discord OAuth." },
  oauth_state: { tone: "warning", title: "OAuth-перевірка не пройшла", message: "Спробуй авторизуватися ще раз." },
  oauth_failed: { tone: "error", title: "Авторизація не вдалася", message: "Перевір Discord OAuth налаштування." },
  access_denied: { tone: "error", title: "Доступ заборонено", message: "У цього акаунта немає потрібної ролі." },
};

const TOAST_QUERY_KEYS = ["characterStatus", "toast", "notice", "success", "error", "published", "updated", "deleted", "created", "saved", "warning"];

function toneIcon(tone: ToastTone) {
  if (tone === "success") return "✓";
  if (tone === "warning") return "!";
  if (tone === "error") return "×";
  return "✦";
}

function createId(prefix = "toast") {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function cleanMessage(value: string | null | undefined) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 220);
}

function toastFromSearchParams(params: URLSearchParams): Toast[] {
  const result: Toast[] = [];
  const characterStatus = cleanMessage(params.get("characterStatus"));
  if (characterStatus && CHARACTER_STATUS_MESSAGES[characterStatus]) {
    result.push({ id: createId("character"), ...CHARACTER_STATUS_MESSAGES[characterStatus] });
  }

  const rawError = cleanMessage(params.get("error"));
  if (rawError) {
    result.push({
      id: createId("error"),
      ...(LOGIN_ERROR_MESSAGES[rawError] || { tone: "error", title: "Дію не виконано", message: rawError }),
    });
  }

  const rawSuccess = cleanMessage(params.get("success"));
  if (rawSuccess) {
    result.push({ id: createId("success"), tone: "success", title: "Готово", message: rawSuccess });
  }

  const rawPublished = cleanMessage(params.get("published"));
  if (rawPublished) {
    const isDiscord = /^https?:\/\/discord(?:app)?\.com\//i.test(rawPublished) || rawPublished.includes("discord.com/channels/");
    result.push({
      id: createId("published"),
      tone: "success",
      title: isDiscord ? "Discord повідомлення опубліковано" : "Матеріал опубліковано",
      message: rawPublished,
      ttl: 6800,
    });
  }

  const rawUpdated = cleanMessage(params.get("updated") || params.get("saved"));
  if (rawUpdated) {
    const isDiscord = /^https?:\/\/discord(?:app)?\.com\//i.test(rawUpdated) || rawUpdated.includes("discord.com/channels/");
    result.push({
      id: createId("updated"),
      tone: "success",
      title: isDiscord ? "Discord повідомлення оновлено" : "Зміни збережено",
      message: rawUpdated,
      ttl: 6800,
    });
  }

  const rawDeleted = cleanMessage(params.get("deleted"));
  if (rawDeleted) {
    result.push({ id: createId("deleted"), tone: "success", title: "Видалено", message: rawDeleted, ttl: 6200 });
  }

  const rawCreated = cleanMessage(params.get("created"));
  if (rawCreated) {
    result.push({ id: createId("created"), tone: "success", title: "Створено", message: rawCreated, ttl: 6200 });
  }

  const rawWarning = cleanMessage(params.get("warning"));
  if (rawWarning) {
    result.push({ id: createId("warning"), tone: "warning", title: "Потрібна увага", message: rawWarning, ttl: 7200 });
  }

  const rawNotice = cleanMessage(params.get("notice") || params.get("toast"));
  if (rawNotice) {
    result.push({ id: createId("notice"), tone: "info", title: "Повідомлення", message: rawNotice });
  }

  return result;
}

function sanitizeToasts(toasts: Toast[]) {
  const seen = new Set<string>();
  return toasts.filter((toast) => {
    const key = `${toast.tone}:${toast.title}:${toast.message || ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export default function GlobalToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<string, number>>(new Map());
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  const searchKey = useMemo(() => searchParams.toString(), [searchParams]);

  const removeToast = (id: string) => {
    const timer = timers.current.get(id);
    if (timer) window.clearTimeout(timer);
    timers.current.delete(id);
    setToasts((current) => current.filter((toast) => toast.id !== id));
  };

  const pushToast = (toast: Omit<Toast, "id"> | Toast) => {
    const item = "id" in toast ? toast : { id: createId(), ...toast };
    setToasts((current) => sanitizeToasts([item, ...current]).slice(0, 4));

    const ttl = item.ttl ?? (item.tone === "error" ? 7200 : 5200);
    const timer = window.setTimeout(() => removeToast(item.id), ttl);
    timers.current.set(item.id, timer);
  };

  useEffect(() => {
    const next = toastFromSearchParams(new URLSearchParams(searchKey));
    if (!next.length) return;

    next.forEach(pushToast);

    const cleaned = new URLSearchParams(searchKey);
    let changed = false;
    TOAST_QUERY_KEYS.forEach((key) => {
      if (cleaned.has(key)) {
        cleaned.delete(key);
        changed = true;
      }
    });

    if (changed) {
      const nextUrl = cleaned.toString() ? `${pathname}?${cleaned}` : pathname;
      window.setTimeout(() => router.replace(nextUrl, { scroll: false }), 60);
    }
  }, [pathname, router, searchKey]);

  useEffect(() => {
    function onToast(event: Event) {
      const detail = (event as CustomEvent<Partial<Toast>>).detail || {};
      pushToast({
        tone: detail.tone || "info",
        title: cleanMessage(detail.title) || "Обробка дії",
        message: cleanMessage(detail.message),
        ttl: detail.ttl,
      });
    }

    window.addEventListener("dashboard:toast", onToast as EventListener);
    return () => {
      window.removeEventListener("dashboard:toast", onToast as EventListener);
      timers.current.forEach((timer) => window.clearTimeout(timer));
      timers.current.clear();
    };
  }, []);

  if (!toasts.length) return null;

  return (
    <aside className="global-toast-stack" aria-live="polite" aria-atomic="false">
      {toasts.map((toast) => (
        <article className={`global-toast global-toast--${toast.tone}`} key={toast.id} role="status">
          <span className="global-toast__icon" aria-hidden="true">{toneIcon(toast.tone)}</span>
          <span className="global-toast__body">
            <strong>{toast.title}</strong>
            {toast.message ? <small>{toast.message}</small> : null}
          </span>
          <button className="global-toast__close" type="button" onClick={() => removeToast(toast.id)} aria-label="Закрити повідомлення">×</button>
        </article>
      ))}
    </aside>
  );
}
