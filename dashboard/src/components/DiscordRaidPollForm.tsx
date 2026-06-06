"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { dashboardErrorMessage, dispatchDashboardToast } from "@/lib/clientToasts";

export type DiscordRaidPollChannel = {
  id: string;
  name: string;
};

type DiscordRaidPollFormProps = {
  channels: DiscordRaidPollChannel[];
  defaultChannelId?: string;
  defaultDescription: string;
  disabled?: boolean;
};

type Difficulty = "normal" | "heroic" | "mythic";

const POPULAR_RAIDS = [
  "Палац Неруб'ар",
  "Визволення Хрому",
  "Гробниця",
  "Амірдрассіл",
  "The Voidspire",
  "The Dreamrift",
];

const CLOSE_OPTIONS = [
  { value: 120, label: "2 години" },
  { value: 720, label: "12 годин" },
  { value: 1440, label: "24 години" },
  { value: 2880, label: "48 годин" },
];

const DIFFICULTY_OPTIONS: Array<{ value: Difficulty; label: string }> = [
  { value: "normal", label: "Звичайна" },
  { value: "heroic", label: "Героїчна" },
  { value: "mythic", label: "Міфічна" },
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

export default function DiscordRaidPollForm({
  channels,
  defaultChannelId = "",
  defaultDescription,
  disabled = false,
}: DiscordRaidPollFormProps) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty>("heroic");
  const [channelId, setChannelId] = useState(defaultChannelId || channels[0]?.id || "");
  const [closeAfterMinutes, setCloseAfterMinutes] = useState(720);
  const [description, setDescription] = useState(defaultDescription);
  const [pending, setPending] = useState(false);
  const [fieldError, setFieldError] = useState("");

  const channelLabel = useMemo(() => {
    const found = channels.find((channel) => channel.id === channelId);
    return found ? `#${found.name}` : channelId ? "Ручний Channel ID" : "Канал не вибрано";
  }, [channels, channelId]);

  function resetForm() {
    setTitle("");
    setDifficulty("heroic");
    setChannelId(defaultChannelId || channels[0]?.id || "");
    setCloseAfterMinutes(720);
    setDescription(defaultDescription);
    setFieldError("");
  }

  function validate() {
    const normalizedTitle = clean(title);
    const normalizedChannelId = clean(channelId);
    const normalizedDescription = description.trim();

    if (normalizedTitle.length < 3) return "Вкажи назву рейду мінімум з 3 символів.";
    if (!DIFFICULTY_OPTIONS.some((option) => option.value === difficulty)) return "Вибери коректну складність рейду.";
    if (!looksLikeDiscordChannelId(normalizedChannelId)) return "Вкажи коректний Discord Channel ID.";
    if (!CLOSE_OPTIONS.some((option) => option.value === closeAfterMinutes)) return "Вибери коректний таймер закриття голосування.";
    if (normalizedDescription.length < 20) return "Опис занадто короткий. Залиши зрозумілий текст для учасників.";
    if (normalizedDescription.length > 900) return "Опис занадто довгий. Максимум — 900 символів.";
    return "";
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || disabled) return;

    const validationMessage = validate();
    if (validationMessage) {
      setFieldError(validationMessage);
      dispatchDashboardToast({ tone: "warning", title: "Перевір форму рейд-голосування", message: validationMessage });
      return;
    }

    setPending(true);
    setFieldError("");
    dispatchDashboardToast({
      tone: "info",
      title: "Створюємо рейд-голосування",
      message: "Зберігаємо пул у Firebase і публікуємо Discord-повідомлення.",
      ttl: 3600,
    });

    try {
      const response = await fetch("/api/polls", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "X-Dashboard-Action": "create-raid-poll-from-discord-page",
        },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({
          title: clean(title),
          difficulty,
          description: description.trim(),
          channelId: clean(channelId),
          closeAfterMinutes,
        }),
      });

      const data = await response.json().catch(() => ({ error: "Сервер повернув неочікувану відповідь." }));
      if (!response.ok || data?.error || data?.ok === false) {
        throw new Error(errorFromPayload(data, "Не вдалося створити рейд-голосування."));
      }

      const pollId = typeof data?.pollId === "string" ? data.pollId : typeof data?.poll?.id === "string" ? data.poll.id : "";
      const redirectTo = typeof data?.redirectTo === "string" && data.redirectTo ? data.redirectTo : pollId ? `/polls/${encodeURIComponent(pollId)}` : "/polls";

      dispatchDashboardToast({
        tone: "success",
        title: "Рейд-голосування створено",
        message: "Пул опубліковано в Discord, учасники вже можуть голосувати.",
        ttl: 6200,
      });
      resetForm();
      router.push(redirectTo);
      router.refresh();
    } catch (error) {
      const message = dashboardErrorMessage(error, "Не вдалося створити рейд-голосування.");
      setFieldError(message);
      dispatchDashboardToast({ tone: "error", title: "Рейд-голосування не створено", message, ttl: 8200 });
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="panel raid-form-panel raid-form-panel--modern discord-raid-poll-form" onSubmit={submit} noValidate>
      <div className="raid-form-heading">
        <div>
          <span className="eyebrow">Discord • Рейд-голосування</span>
          <h2>Створення рейд-голосування</h2>
          <p>Сайт створює запис у Firebase, публікує Discord embed і підключає select-menu для голосування за дні та час.</p>
        </div>
        <span className="raid-state raid-state--published">Site-created</span>
      </div>

      {fieldError ? <div className="notice error-note discord-raid-poll-alert">{fieldError}</div> : null}
      {disabled ? <div className="notice warning-note discord-raid-poll-alert">Створення тимчасово недоступне: перевір Firebase або Discord API конфігурацію.</div> : null}

      <div className="raid-form-section">
        <label className="field-label" htmlFor="raid-poll-title">
          <span>Назва рейду</span>
          <input
            id="raid-poll-title"
            className="input"
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
      </div>

      <div className="raid-form-section raid-form-section--two">
        <label className="field-label" htmlFor="raid-poll-difficulty">
          <span>Складність рейду</span>
          <select
            id="raid-poll-difficulty"
            className="select"
            value={difficulty}
            onChange={(event) => setDifficulty(event.target.value as Difficulty)}
            required
            disabled={pending || disabled}
          >
            {DIFFICULTY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>

        <label className="field-label" htmlFor="raid-poll-close-after">
          <span>Час закриття голосування</span>
          <select
            id="raid-poll-close-after"
            className="select"
            value={closeAfterMinutes}
            onChange={(event) => setCloseAfterMinutes(Number(event.target.value))}
            required
            disabled={pending || disabled}
          >
            {CLOSE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
      </div>

      <div className="raid-form-section">
        <label className="field-label" htmlFor="raid-poll-channel-id">
          <span>Канал публікації Discord</span>
          <input
            id="raid-poll-channel-id"
            className="input"
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
          <small className="raid-form-hint">Поточний вибір: {channelLabel}. Можна вибрати канал зі списку або вставити Channel ID вручну.</small>
        </label>
      </div>

      <div className="raid-form-section">
        <label className="field-label" htmlFor="raid-poll-description">
          <span>Статичний опис</span>
          <textarea
            id="raid-poll-description"
            className="textarea"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={5}
            maxLength={900}
            required
            disabled={pending || disabled}
          />
          <small className="raid-form-hint">{description.trim().length}/900 символів. Цей текст піде в Discord embed.</small>
        </label>
      </div>

      <div className="discord-raid-poll-static-grid" aria-label="Статичні опції голосування">
        <div>
          <strong>Дні</strong>
          <span>Пн • Вт • Ср • Чт • Пт • Сб • Нд</span>
        </div>
        <div>
          <strong>Час</strong>
          <span>19:00 • 19:30 • 20:00 • 20:30 • 21:00</span>
        </div>
      </div>

      <div className="raid-form-actions">
        <a className="btn subtle" href="/polls">Переглянути пули</a>
        <button className="btn primary" type="submit" disabled={pending || disabled} aria-busy={pending ? "true" : "false"}>
          {pending ? "Створюємо..." : "Створити та опублікувати"}
        </button>
      </div>
    </form>
  );
}
