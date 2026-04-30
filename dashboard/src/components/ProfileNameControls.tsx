"use client";

import { useEffect, useId, useRef, useState } from "react";

type Props = {
  preferredName?: string | null;
  discordName: string;
  nicknamePreview?: string | null;
  lastSyncedNickname?: string | null;
  lastSyncedAt?: string | null;
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
            <small>Для профілю та Discord-формату.</small>
          </div>
          {!editing && canManage ? (
            <button
              className="profile-icon-action profile-icon-action--edit"
              type="button"
              onClick={() => setEditing(true)}
              aria-label="Редагувати імʼя"
              title="Редагувати імʼя"
            >
              ✎
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
              aria-label="Зберегти імʼя"
              title="Зберегти імʼя"
            >
              ✓
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
              ×
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
                <span aria-hidden="true">⧉</span>
                {copied ? "Скопійовано" : "Скопіювати"}
              </button>
            ) : (
              <form className="profile-discord-nick-form" action="/api/profile/discord-nickname" method="post">
                <button
                  className={`profile-nick-sync-button${synced ? " is-synced" : ""}`}
                  type="submit"
                  title={`Змінити серверне імʼя на: ${nicknamePreview}`}
                  aria-label="Стандартизувати серверне імʼя Discord"
                >
                  <span aria-hidden="true">↻</span>
                  {syncLabel}
                </button>
              </form>
            )
          ) : null}
        </div>

        {canSyncDiscord && hasName && nicknamePreview ? (
          <div className={`profile-nickname-preview${synced ? " is-synced" : ""}${discordOwnerLocked ? " is-owner-locked" : ""}`}>
            <span>Буде в Discord</span>
            <strong>{nicknamePreview}</strong>
            {discordOwnerLocked ? (
              <small>Власника сервера Discord не дає перейменувати боту. Скопіюй і встанови вручну.</small>
            ) : synced ? (
              <small>Готово{lastSyncedAt ? ` • ${lastSyncedAt}` : ""}. Можна застосувати повторно.</small>
            ) : (
              <small>Зміниться тільки на цьому сервері.</small>
            )}
          </div>
        ) : canManage ? (
          <small className="profile-nickname-hint">
            {!hasName
              ? "Вкажи імʼя — зберемо Discord-формат автоматично."
              : "Discord-синхронізація доступна після входу через Discord."}
          </small>
        ) : null}
      </section>
    </div>
  );
}
