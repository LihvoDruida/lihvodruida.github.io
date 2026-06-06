"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { dashboardErrorMessage, dispatchDashboardToast } from "@/lib/clientToasts";
import { RAID_POLL_CLOSE_OPTIONS, RAID_POLL_DAYS, raidPollDescription, type RaidPollDay, type RaidPollDifficulty } from "@/lib/raidPollShared";

export type RaidPollCreateChannel = {
  id: string;
  name: string;
};

type RaidPollCreateClientFormProps = {
  channels: RaidPollCreateChannel[];
  defaultChannelId?: string;
  disabled?: boolean;
};

const POPULAR_RAIDS = [
  "Палац Неруб'ар",
  "Визволення Хрому",
  "Гробниця",
  "Амірдрассіл",
  "The Voidspire",
  "The Dreamrift",
];

const DIFFICULTIES: Array<{ value: RaidPollDifficulty; label: string; hint: string }> = [
  { value: "normal", label: "Звичайна", hint: "Для спокійного збору складу" },
  { value: "heroic", label: "Героїчна", hint: "Основний формат рейду" },
  { value: "mythic", label: "Міфічна", hint: "Прогрес / основний склад" },
];

function clean(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function looksLikeDiscordChannelId(value: string) {
  return /^\d{16,25}$/.test(value.trim());
}

function errorFromPayload(data: unknown, fallback: string) {
  if (!data || typeof data !== "object") return fallback;
  const message = (data as Record<string, unknown>).error || (data as Record<string, unknown>).message;
  return typeof message === "string" && message.trim() ? message.trim() : fallback;
}

export default function RaidPollCreateClientForm({ channels, defaultChannelId = "", disabled = false }: RaidPollCreateClientFormProps) {
  const router = useRouter();
  const initialChannelId = defaultChannelId || channels[0]?.id || "";
  const defaultDescription = raidPollDescription();

  const [title, setTitle] = useState("");
  const [difficulty, setDifficulty] = useState<RaidPollDifficulty>("heroic");
  const [channelId, setChannelId] = useState(initialChannelId);
  const [closeAfterMinutes, setCloseAfterMinutes] = useState(720);
  const [description, setDescription] = useState(defaultDescription);
  const [selectedDays, setSelectedDays] = useState<RaidPollDay[]>(RAID_POLL_DAYS.map((day) => day.value));
  const [pending, setPending] = useState(false);
  const [fieldError, setFieldError] = useState("");

  const channelLabel = useMemo(() => {
    const found = channels.find((channel) => channel.id === channelId);
    return found ? `#${found.name}` : channelId ? "Ручний Channel ID" : "Канал не вибрано";
  }, [channels, channelId]);

  const closeLabel = useMemo(
    () => RAID_POLL_CLOSE_OPTIONS.find((option) => option.minutes === closeAfterMinutes)?.label || `${closeAfterMinutes} хв`,
    [closeAfterMinutes],
  );

  function resetForm() {
    setTitle("");
    setDifficulty("heroic");
    setChannelId(initialChannelId);
    setCloseAfterMinutes(720);
    setDescription(defaultDescription);
    setSelectedDays(RAID_POLL_DAYS.map((day) => day.value));
    setFieldError("");
  }

  function validate() {
    const normalizedTitle = clean(title);
    const normalizedChannelId = clean(channelId);
    const normalizedDescription = description.trim();

    if (normalizedTitle.length < 3) return "Вкажи назву рейду мінімум з 3 символів.";
    if (!DIFFICULTIES.some((option) => option.value === difficulty)) return "Вибери коректну складність рейду.";
    if (!looksLikeDiscordChannelId(normalizedChannelId)) return "Вкажи коректний Discord Channel ID.";
    if (!RAID_POLL_CLOSE_OPTIONS.some((option) => option.minutes === closeAfterMinutes)) return "Вибери коректний таймер закриття голосування.";
    if (!selectedDays.length) return "Вибери хоча б один день рейд-тижня.";
    if (normalizedDescription.length < 20) return "Опис занадто короткий. Залиши зрозумілий текст для учасників.";
    if (normalizedDescription.length > 900) return "Опис занадто довгий. Максимум — 900 символів.";
    return "";
  }


  function toggleDay(day: RaidPollDay) {
    setSelectedDays((current) => {
      if (current.includes(day)) return current.filter((item) => item !== day);
      return RAID_POLL_DAYS.map((item) => item.value).filter((item) => item === day || current.includes(item));
    });
  }

  const selectedDayLabel = selectedDays.length === RAID_POLL_DAYS.length
    ? "Пн • Вт • Ср • Чт • Пт • Сб • Нд"
    : RAID_POLL_DAYS.filter((day) => selectedDays.includes(day.value)).map((day) => day.label).join(" • ") || "Дні не вибрано";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || disabled) return;

    const validationMessage = validate();
    if (validationMessage) {
      setFieldError(validationMessage);
      dispatchDashboardToast({ tone: "warning", title: "Перевір форму рейд-пулу", message: validationMessage });
      return;
    }

    setPending(true);
    setFieldError("");
    dispatchDashboardToast({
      tone: "info",
      title: "Створюємо рейд-пул",
      message: "Зберігаємо голосування у Firebase і публікуємо Discord-повідомлення.",
      ttl: 3600,
    });

    try {
      const response = await fetch("/api/polls", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "X-Dashboard-Action": "create-raid-poll",
        },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({
          title: clean(title),
          difficulty,
          description: description.trim(),
          channelId: clean(channelId),
          closeAfterMinutes,
          days: selectedDays,
        }),
      });

      const data = await response.json().catch(() => ({ error: "Сервер повернув неочікувану відповідь." }));
      if (!response.ok || data?.error || data?.ok === false) {
        throw new Error(errorFromPayload(data, "Не вдалося створити рейд-пул."));
      }

      const pollId = typeof data?.pollId === "string" ? data.pollId : typeof data?.poll?.id === "string" ? data.poll.id : "";
      const redirectTo = typeof data?.redirectTo === "string" && data.redirectTo ? data.redirectTo : pollId ? `/polls/${encodeURIComponent(pollId)}` : "/polls";

      dispatchDashboardToast({
        tone: "success",
        title: "Рейд-пул створено",
        message: "Пул опубліковано в Discord. Учасники вже можуть голосувати.",
        ttl: 6200,
      });
      resetForm();
      router.push(redirectTo);
      router.refresh();
    } catch (error) {
      const message = dashboardErrorMessage(error, "Не вдалося створити рейд-пул.");
      setFieldError(message);
      dispatchDashboardToast({ tone: "error", title: "Рейд-пул не створено", message, ttl: 8200 });
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="panel raid-poll-create-panel" onSubmit={submit} noValidate>
      <div className="raid-poll-create-head">
        <div>
          <span className="eyebrow">Новий рейд-пул</span>
          <h2>Створити голосування</h2>
          <p>Сайт є джерелом правди: він створює запис у Firebase, публікує Discord embed і відкриває голосування через select-menu.</p>
        </div>
        <span className="raid-status-pill published">Site → Discord</span>
      </div>

      {fieldError ? <div className="notice error-note raid-poll-create-alert">{fieldError}</div> : null}
      {disabled ? <div className="notice warning-note raid-poll-create-alert">Створення тимчасово недоступне: перевір Firebase або Discord API конфігурацію.</div> : null}

      <div className="raid-poll-form-grid">
        <label className="raid-poll-field raid-poll-field--wide" htmlFor="raid-poll-title">
          <span>Назва рейду</span>
          <input
            id="raid-poll-title"
            list="raid-poll-popular-raids"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            minLength={3}
            maxLength={160}
            placeholder="Наприклад: Палац Неруб'ар"
            required
            disabled={pending || disabled}
          />
          <datalist id="raid-poll-popular-raids">
            {POPULAR_RAIDS.map((raid) => <option key={raid} value={raid} />)}
          </datalist>
        </label>

        <label className="raid-poll-field" htmlFor="raid-poll-difficulty">
          <span>Складність</span>
          <select id="raid-poll-difficulty" value={difficulty} onChange={(event) => setDifficulty(event.target.value as RaidPollDifficulty)} disabled={pending || disabled} required>
            {DIFFICULTIES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <small>{DIFFICULTIES.find((option) => option.value === difficulty)?.hint}</small>
        </label>

        <label className="raid-poll-field" htmlFor="raid-poll-close-after">
          <span>Таймер закриття</span>
          <select id="raid-poll-close-after" value={closeAfterMinutes} onChange={(event) => setCloseAfterMinutes(Number(event.target.value))} disabled={pending || disabled} required>
            {RAID_POLL_CLOSE_OPTIONS.map((option) => <option key={option.minutes} value={option.minutes}>{option.label}</option>)}
          </select>
          <small>Після дедлайну Discord-компоненти вимикаються.</small>
        </label>

        <label className="raid-poll-field raid-poll-field--wide" htmlFor="raid-poll-channel-id">
          <span>Discord-канал публікації</span>
          <input
            id="raid-poll-channel-id"
            list="raid-poll-discord-channels"
            value={channelId}
            onChange={(event) => setChannelId(event.target.value)}
            inputMode="numeric"
            pattern="\d{16,25}"
            placeholder="123456789012345678"
            required
            disabled={pending || disabled}
          />
          <datalist id="raid-poll-discord-channels">
            {channels.map((channel) => <option key={channel.id} value={channel.id}>{`#${channel.name}`}</option>)}
          </datalist>
          <small>Поточний вибір: {channelLabel}. Можна вибрати канал зі списку або вставити Channel ID вручну.</small>
        </label>

        <fieldset className="raid-poll-field raid-poll-field--wide raid-poll-days-field">
          <legend>Дні рейд-тижня</legend>
          <div className="raid-poll-day-toggle-grid">
            {RAID_POLL_DAYS.map((day) => (
              <button
                key={day.value}
                className={`raid-poll-day-toggle ${selectedDays.includes(day.value) ? "is-selected" : ""}`}
                type="button"
                onClick={() => toggleDay(day.value)}
                disabled={pending || disabled}
                aria-pressed={selectedDays.includes(day.value)}
              >
                <strong>{day.label}</strong>
                <span>{day.fullLabel}</span>
              </button>
            ))}
          </div>
          <small>У Discord для кожного вибраного дня буде окрема опція часу або «Не можу».</small>
        </fieldset>

        <label className="raid-poll-field raid-poll-field--wide" htmlFor="raid-poll-description">
          <span>Опис у Discord</span>
          <textarea
            id="raid-poll-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={5}
            maxLength={900}
            required
            disabled={pending || disabled}
          />
          <small>{description.trim().length}/900 символів. Текст буде в embed-повідомленні.</small>
        </label>
      </div>

      <div className="raid-poll-create-preview" aria-label="Налаштування голосування">
        <div>
          <strong>Дні голосування</strong>
          <span>{selectedDayLabel}</span>
        </div>
        <div>
          <strong>Час рейду</strong>
          <span>Для кожного дня: 19:00 • 19:30 • 20:00 • 20:30 • 21:00 • Не можу</span>
        </div>
        <div>
          <strong>Закриття</strong>
          <span>{closeLabel}</span>
        </div>
      </div>

      <div className="raid-form-actions raid-poll-create-actions">
        <a className="btn subtle" href="/polls">До списку</a>
        <button className="btn primary" type="submit" disabled={pending || disabled} aria-busy={pending ? "true" : "false"}>
          {pending ? "Створюємо..." : "Створити й опублікувати"}
        </button>
      </div>
    </form>
  );
}
