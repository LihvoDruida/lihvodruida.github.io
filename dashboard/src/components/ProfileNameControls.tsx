"use client";

import { useEffect, useId, useRef, useState } from "react";

type IconName = "edit" | "check" | "x" | "copy" | "sync";

function ProfileActionIcon({ name }: { name: IconName }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    xmlns: "http://www.w3.org/2000/svg",
    "aria-hidden": true,
    focusable: false,
  } as const;

  if (name === "edit") {
    return (
      <svg {...common}>
        <path d="M4 20h4.6L19.1 9.5a2.2 2.2 0 0 0 0-3.1l-1.5-1.5a2.2 2.2 0 0 0-3.1 0L4 15.4V20Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="m13.5 5.9 4.6 4.6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }

  if (name === "check") {
    return (
      <svg {...common}>
        <path d="M5 12.6 9.2 17 19 7" stroke="currentColor" strokeWidth="2.35" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (name === "x") {
    return (
      <svg {...common}>
        <path d="M7 7l10 10M17 7 7 17" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" />
      </svg>
    );
  }

  if (name === "copy") {
    return (
      <svg {...common}>
        <rect x="8" y="8" width="11" height="11" rx="2.2" stroke="currentColor" strokeWidth="2" />
        <path d="M5 15.5V6.8C5 5.8 5.8 5 6.8 5h8.7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <path d="M20 7v5h-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 17v-5h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M18.5 10A7 7 0 0 0 6.6 6.6L4 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5.5 14A7 7 0 0 0 17.4 17.4L20 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

type Props = {
  preferredName?: string | null;
  discordName: string;
  nicknamePreview?: string | null;
  lastSyncedNickname?: string | null;
  lastSyncedAt?: string | null;
  currentServerNickname?: string | null;
  canManage: boolean;
  canSyncDiscord: boolean;
  discordOwnerLocked?: boolean;
};

export default function ProfileNameControls({
  preferredName,
  discordName,
  nicknamePreview,
  lastSyncedNickname,
  lastSyncedAt,
  currentServerNickname,
  canManage,
  canSyncDiscord,
  discordOwnerLocked = false,
}: Props) {
  const inputId = useId();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(preferredName || "");
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setValue(preferredName || "");
    setEditing(false);
  }, [preferredName]);

  useEffect(() => {
    if (!editing) return;
    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, [editing]);

  useEffect(() => {
    setCopied(false);
  }, [nicknamePreview]);

  const savedName = (preferredName || "").trim();
  const draftName = value.trim();
  const hasName = Boolean(savedName);
  const synced = Boolean(nicknamePreview && lastSyncedNickname === nicknamePreview);
  const serverNickname = (currentServerNickname || "").trim();
  const showServerNickname = Boolean(hasName && nicknamePreview && serverNickname && serverNickname !== nicknamePreview);
  const canSubmitName = draftName.length >= 2 && draftName !== savedName;
  const syncLabel = synced ? "Оновити" : "Застосувати";

  async function copyNickname() {
    if (!nicknamePreview) return;
    try {
      await navigator.clipboard.writeText(nicknamePreview);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="profile-name-panel">
      <section className="profile-name-section" aria-labelledby={`${inputId}-name-title`}>
        <div className="profile-name-section__head">
          <div>
            <span className="profile-name-panel__label" id={`${inputId}-name-title`}>Імʼя</span>
            <small>Для профілю.</small>
          </div>
          {!editing && canManage ? (
            <button
              className="profile-icon-action profile-icon-action--edit"
              type="button"
              onClick={() => setEditing(true)}
              aria-label="Редагувати імʼя"
              title="Редагувати імʼя"
            >
              <ProfileActionIcon name="edit" />
            </button>
          ) : null}
        </div>

        {canManage && editing ? (
          <form className="profile-name-edit-form is-editing" action="/api/profile/name" method="post">
            <label className="sr-only" htmlFor={inputId}>Імʼя в профілі</label>
            <input
              ref={inputRef}
              id={inputId}
              name="preferredName"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder="Наприклад, Дмитро"
              minLength={2}
              maxLength={32}
              autoComplete="given-name"
              required
            />
            <button
              className="profile-icon-action profile-icon-action--confirm"
              type="submit"
              disabled={!canSubmitName}
              data-preserve-label="true"
              aria-label="Зберегти імʼя"
              title="Зберегти імʼя"
            >
              <ProfileActionIcon name="check" />
            </button>
            <button
              className="profile-icon-action profile-icon-action--cancel"
              type="button"
              onClick={() => {
                setValue(preferredName || "");
                setEditing(false);
              }}
              aria-label="Скасувати редагування"
              title="Скасувати"
            >
              <ProfileActionIcon name="x" />
            </button>
          </form>
        ) : (
          <div className={`profile-name-display-row${hasName ? "" : " is-empty"}`}>
            <strong>{savedName || "Додай імʼя"}</strong>
          </div>
        )}
      </section>

      <section className="profile-discord-standard" aria-label="Discord nickname">
        <div className="profile-discord-standard__head">
          <div className="profile-discord-standard__identity">
            <span className="profile-name-panel__label">Discord</span>
            <strong title={discordName || "Discord"}>{discordName || "Discord"}</strong>
          </div>

          {canManage && canSyncDiscord && hasName && nicknamePreview ? (
            discordOwnerLocked ? (
              <button
                className="profile-nick-sync-button profile-nick-sync-button--copy"
                type="button"
                onClick={copyNickname}
                title={`Скопіювати: ${nicknamePreview}`}
                aria-label="Скопіювати Discord nickname"
              >
                <ProfileActionIcon name="copy" />
                <span>{copied ? "Скопійовано" : "Скопіювати"}</span>
              </button>
            ) : (
              <form className="profile-discord-nick-form" action="/api/profile/discord-nickname" method="post">
                <button
                  className={`profile-nick-sync-button${synced ? " is-synced" : ""}`}
                  type="submit"
                  title={`Змінити серверне імʼя на: ${nicknamePreview}`}
                  aria-label="Стандартизувати серверне імʼя Discord"
                >
                  <ProfileActionIcon name="sync" />
                  <span>{syncLabel}</span>
                </button>
              </form>
            )
          ) : null}
        </div>

        {showServerNickname ? (
          <div className="profile-server-nickname" aria-label="Поточне імʼя на Discord-сервері">
            <span className="profile-server-nickname__icon" aria-hidden="true">⌁</span>
            <span className="profile-server-nickname__body">
              <small>Зараз на сервері</small>
              <strong>{serverNickname}</strong>
            </span>
          </div>
        ) : null}

        {canSyncDiscord && hasName && nicknamePreview ? (
          <div className={`profile-nickname-preview${synced ? " is-synced" : ""}${discordOwnerLocked ? " is-owner-locked" : ""}`}>
            <span>Буде в Discord</span>
            <strong>{nicknamePreview}</strong>
            {discordOwnerLocked ? (
              <small>Власник сервера змінює вручну.</small>
            ) : synced ? (
              <small>Готово{lastSyncedAt ? ` • ${lastSyncedAt}` : ""}.</small>
            ) : (
              <small>Лише на цьому сервері.</small>
            )}
          </div>
        ) : canManage ? (
          <small className="profile-nickname-hint">
            {!hasName
              ? "Вкажи імʼя — формат збереться автоматично."
              : "Discord-синхронізація доступна після входу через Discord."}
          </small>
        ) : null}
      </section>
    </div>
  );
}
