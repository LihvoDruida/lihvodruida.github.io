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
    message: "Свіжий список персонажів відкритий тимчасово. Додавай потрібних одразу: у профілі збережуться тільки вибрані персонажі.",
    ttl: 7200,
  },
  bnet_no_guild_characters: {
    tone: "warning",
    title: "У гільдії нікого не знайдено",
    message: "Battle.net підключено, але не підтвердив персонажів Mistblossom Vanguard. Перевір гільдію персонажа, регіон EU і повтори оновлення.",
    ttl: 8200,
  },
  bnet_failed: {
    tone: "error",
    title: "Battle.net не оновлено",
    message: "Battle.net не повернув список персонажів. Спробуй повторити вхід через Battle.net.",
    ttl: 9000,
  },
  bnet_state: {
    tone: "warning",
    title: "Battle.net авторизацію відхилено",
    message: "Сесія Battle.net застаріла або перевірка не пройшла. Запусти підключення Battle.net ще раз із цієї ж вкладки.",
    ttl: 7600,
  },
  character_added: {
    tone: "success",
    title: "Персонажа додано",
    message: "Персонаж записаний у профілі. Якщо це перший персонаж у профілі, він автоматично стає main.",
  },
  characters_added: {
    tone: "success",
    title: "Персонажів додано",
    message: "Вибрані персонажі збережені у профілі. Додані записи прибрано з тимчасового Battle.net списку.",
    ttl: 7200,
  },
  characters_added_partial: {
    tone: "warning",
    title: "Додано не всіх персонажів",
    message: "Частина персонажів збережена, а частина пропущена: зазвичай це дублікати або ліміт профілю. Перевір список збережених персонажів нижче.",
    ttl: 8200,
  },
  characters_bulk_empty: {
    tone: "warning",
    title: "Немає вибраних персонажів",
    message: "Познач хоча б одного персонажа у тимчасовому Battle.net списку або натисни “Додати всі”.",
  },
  characters_bulk_noop: {
    tone: "warning",
    title: "Нічого не додано",
    message: "Запит оброблено, але нових персонажів не додано. Найчастіше всі вибрані вже були збережені або список змінився після перевірки.",
    ttl: 7600,
  },
  characters_bulk_no_verified: {
    tone: "error",
    title: "Немає підтверджених персонажів гільдії",
    message: "У вибраному Battle.net списку немає персонажів, підтверджених як Mistblossom Vanguard. Онови персонажів через Battle.net і перевір гільдію/регіон.",
    ttl: 9000,
  },
  characters_bulk_all_duplicates: {
    tone: "warning",
    title: "Усі вибрані вже додані",
    message: "Ці персонажі вже є у профілі. Повторно вони не додаються — це захист від дублікатів.",
    ttl: 7600,
  },
  characters_bulk_limit_reached: {
    tone: "warning",
    title: "Досягнуто ліміт персонажів",
    message: "Профіль уже має максимальну кількість збережених персонажів. Видали зайві записи або не додавай весь Battle.net список одразу.",
    ttl: 8200,
  },
  character_add_failed: {
    tone: "error",
    title: "Персонажа не додано",
    message: "Персонажа не вдалося зберегти. Онови сторінку і повтори дію.",
    ttl: 9000,
  },
  character_add_duplicate: {
    tone: "warning",
    title: "Персонаж уже є в профілі",
    message: "Повторний запис не створюється. Якщо хочеш оновити список, спочатку пройди Battle.net реавторизацію або видали старий запис.",
    ttl: 7000,
  },
  character_add_limit: {
    tone: "warning",
    title: "Ліміт персонажів у профілі",
    message: "Новий запис не додано, бо профіль уже заповнений. Видали непотрібних персонажів і повтори додавання.",
    ttl: 7800,
  },
  character_add_invalid: {
    tone: "error",
    title: "Некоректний персонаж",
    message: "Дані персонажа застаріли або пошкоджені. Онови сторінку профілю і натисни кнопку додавання ще раз.",
    ttl: 7600,
  },
  character_add_not_guild: {
    tone: "error",
    title: "Персонаж не підтверджений у гільдії",
    message: "Додаються тільки персонажі, яких свіжа Battle.net перевірка позначила як Mistblossom Vanguard. Перевір гільдію персонажа, EU-регіон і зроби нову перевірку.",
    ttl: 9000,
  },
  character_add_profile_missing: {
    tone: "error",
    title: "Профіль не знайдено",
    message: "Сесія активна, але профіль ще не створився. Вийди й увійди через Discord, потім повтори Battle.net перевірку.",
    ttl: 9200,
  },
  character_add_firebase_unconfigured: {
    tone: "error",
    title: "Збереження профілів недоступне",
    message: "Сервер тимчасово не може зберігати профілі. Звернись до гільдмайстра або повтори пізніше.",
    ttl: 9200,
  },
  character_add_firebase_failed: {
    tone: "error",
    title: "Персонажа не збережено",
    message: "Профіль не вдалося оновити. Онови сторінку і повтори дію.",
    ttl: 9200,
  },
  character_reauth_required: {
    tone: "warning",
    title: "Потрібна свіжа Battle.net перевірка",
    message: "Тимчасовий список персонажів відсутній або застарів. Натисни “Оновити персонажів”, пройди Battle.net і додавай персонажа одразу після повернення.",
    ttl: 8600,
  },
  character_removed: {
    tone: "success",
    title: "Персонажа видалено",
    message: "Запис прибрано з профілю. Якщо це був main, система автоматично вибере наступного доступного персонажа.",
    ttl: 6800,
  },
  character_remove_failed: {
    tone: "error",
    title: "Не вдалося видалити персонажа",
    message: "Запис не видалено. Онови сторінку і повтори дію.",
    ttl: 8600,
  },
  character_remove_invalid: {
    tone: "error",
    title: "Некоректний запит видалення",
    message: "Дані персонажа застаріли або пошкоджені. Онови сторінку профілю і повтори дію.",
    ttl: 7600,
  },
  character_remove_profile_missing: {
    tone: "error",
    title: "Профіль для видалення не знайдено",
    message: "Не вдалося знайти профіль поточної сесії. Увійди через Discord ще раз.",
    ttl: 8600,
  },
  character_remove_firebase_unconfigured: {
    tone: "error",
    title: "Профіль недоступний для видалення",
    message: "Сервер тимчасово не може змінювати список персонажів. Звернись до гільдмайстра або повтори пізніше.",
    ttl: 8600,
  },
  main_character_set: {
    tone: "success",
    title: "Мейн оновлено",
    message: "Цей персонаж тепер використовується як основний для сайту, рейдових правил та інтеграцій Discord.",
  },
  main_character_failed: {
    tone: "error",
    title: "Мейна не змінено",
    message: "Не вдалося зберегти main-персонажа. Онови сторінку і повтори дію.",
    ttl: 8600,
  },
  main_character_invalid: {
    tone: "error",
    title: "Некоректний main-персонаж",
    message: "Дані персонажа застаріли або пошкоджені. Онови сторінку і натисни “Зробити мейном” ще раз.",
    ttl: 7600,
  },
  main_character_missing: {
    tone: "warning",
    title: "Спочатку додай персонажа",
    message: "Main можна вибрати тільки серед персонажів, уже збережених у профілі.",
    ttl: 7600,
  },
  main_character_profile_missing: {
    tone: "error",
    title: "Профіль для main не знайдено",
    message: "Не вдалося знайти твій профіль. Вийди й увійди через Discord, потім повтори дію.",
    ttl: 8600,
  },
  main_character_firebase_unconfigured: {
    tone: "error",
    title: "Профіль недоступний для main",
    message: "Сервер тимчасово не може зберегти main-персонажа. Звернись до гільдмайстра або повтори пізніше.",
    ttl: 8600,
  },
  rate_limit: {
    tone: "warning",
    title: "Забагато дій",
    message: "Зачекай кілька хвилин і повтори спробу. Це захист від дублювання дій.",
  },
};
const LOGIN_ERROR_MESSAGES: Record<string, Omit<Toast, "id">> = {
  rate_limit: { tone: "warning", title: "Забагато спроб входу", message: "Зачекай кілька хвилин і повтори авторизацію." },
  token: { tone: "error", title: "Вхід не виконано", message: "Токен недійсний або застарів." },
  session_required: { tone: "warning", title: "Потрібен вхід", message: "Увійди в акаунт, щоб продовжити дію." },
  discord_only: { tone: "warning", title: "Доступ через Discord", message: "Для входу в панель використовується Discord." },
  oauth_state: { tone: "warning", title: "Перевірка Discord не пройшла", message: "Спробуй авторизуватися ще раз." },
  oauth_failed: { tone: "error", title: "Авторизація не вдалася", message: "Спробуй повторити вхід через Discord. Якщо помилка лишиться — звернись до гільдмайстра." },
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
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 360);
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
