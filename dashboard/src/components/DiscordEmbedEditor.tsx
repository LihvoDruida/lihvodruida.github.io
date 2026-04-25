"use client";

import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";

export type DiscordChannelOption = {
  id: string;
  name: string;
  type: number;
};

export type DiscordRoleOption = {
  id: string;
  name: string;
  color: number;
  position: number;
  managed?: boolean;
};

type EmbedObject = Record<string, any>;

type EmbedFieldState = {
  id: string;
  name: string;
  value: string;
  inline: boolean;
};

type DiscordEmbedEditorProps = {
  mode: "rules" | "general";
  editorMode: "create" | "edit";
  channels: DiscordChannelOption[];
  roles?: DiscordRoleOption[];
  suggestedChannelId: string;
  defaultEmbedJson: string;
  defaultContent?: string;
  defaultMessageLink?: string;
  selectedRoleIds?: string[];
  returnTo: string;
};

const COLOR_FALLBACK = "#B8E986";

function parseInitialEmbed(value: string): EmbedObject {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function urlFrom(value: unknown) {
  if (!value || typeof value !== "object") return "";
  return text((value as Record<string, unknown>).url);
}

function objectFrom(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function normalizeHexColor(value: string) {
  const raw = String(value || "").trim();
  const withHash = raw.startsWith("#") ? raw : `#${raw}`;
  return /^#[0-9a-fA-F]{6}$/.test(withHash) ? withHash.toUpperCase() : "";
}

function colorNumberToHex(value: unknown) {
  const color = Number(value);
  if (!Number.isFinite(color)) return COLOR_FALLBACK;
  return `#${Math.max(0, Math.min(0xffffff, Math.floor(color))).toString(16).padStart(6, "0")}`.toUpperCase();
}

function uniqueIds(values: string[]) {
  return Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean)));
}

function normalizeMessageLink(value: string) {
  return String(value || "").trim();
}

function looksLikeDiscordMessageRef(value: string) {
  const text = normalizeMessageLink(value);
  if (!text) return false;
  return /discord(?:app)?\.com\/channels\/(?:\d{16,25}|@me)\/\d{16,25}\/\d{16,25}/i.test(text) || /^(\d{16,25})[\s,/|:]+(\d{16,25})$/.test(text);
}

function extractErrorMessage(value: unknown, fallback = "Не вдалося підтягнути Discord-повідомлення.") {
  if (!value || typeof value !== "object") return fallback;
  const message = (value as Record<string, unknown>).error || (value as Record<string, unknown>).message;
  return typeof message === "string" && message.trim() ? message.trim() : fallback;
}

function hexToNumber(value: string) {
  const hex = normalizeHexColor(value);
  if (!hex) return undefined;
  return Number.parseInt(hex.slice(1), 16);
}

function initialFields(value: unknown): EmbedFieldState[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 25).map((field, index) => {
    const item = objectFrom(field);
    return {
      id: `field-${index}`,
      name: text(item.name),
      value: text(item.value),
      inline: Boolean(item.inline),
    };
  });
}

function cleanEmbedValue(value: string) {
  return value.trim();
}

function buildEmbed(params: {
  title: string;
  url: string;
  description: string;
  colorHex: string;
  authorName: string;
  authorUrl: string;
  authorIconUrl: string;
  thumbnailUrl: string;
  imageUrl: string;
  footerText: string;
  footerIconUrl: string;
  timestampEnabled: boolean;
  fields: EmbedFieldState[];
}) {
  const color = hexToNumber(params.colorHex);
  const authorName = cleanEmbedValue(params.authorName);
  const footerText = cleanEmbedValue(params.footerText);
  const fields = params.fields
    .slice(0, 25)
    .map((field) => ({
      name: cleanEmbedValue(field.name),
      value: cleanEmbedValue(field.value),
      inline: Boolean(field.inline),
    }))
    .filter((field) => field.name && field.value);

  const embed: EmbedObject = {
    title: cleanEmbedValue(params.title) || undefined,
    url: cleanEmbedValue(params.url) || undefined,
    description: cleanEmbedValue(params.description) || undefined,
    color,
    thumbnail: cleanEmbedValue(params.thumbnailUrl) ? { url: cleanEmbedValue(params.thumbnailUrl) } : undefined,
    image: cleanEmbedValue(params.imageUrl) ? { url: cleanEmbedValue(params.imageUrl) } : undefined,
    author: authorName
      ? {
          name: authorName,
          url: cleanEmbedValue(params.authorUrl) || undefined,
          icon_url: cleanEmbedValue(params.authorIconUrl) || undefined,
        }
      : undefined,
    footer: footerText
      ? {
          text: footerText,
          icon_url: cleanEmbedValue(params.footerIconUrl) || undefined,
        }
      : undefined,
    fields: fields.length ? fields : undefined,
    timestamp: params.timestampEnabled ? true : undefined,
  };

  return Object.fromEntries(Object.entries(embed).filter(([, value]) => value !== undefined && value !== null));
}

function hasVisibleEmbedContent(embed: EmbedObject) {
  return Boolean(embed.title || embed.description || embed.image || embed.thumbnail || (Array.isArray(embed.fields) && embed.fields.length));
}

function normalizeMarkdownLine(line: string) {
  return line.replace(/\*\*(.*?)\*\*/g, "$1").replace(/__(.*?)__/g, "$1").trim();
}

function MarkdownPreview({ value }: { value: string }) {
  const lines = value.split("\n").slice(0, 90);

  return (
    <div className="discord-preview-markdown">
      {lines.map((rawLine, index) => {
        const line = rawLine.trimEnd();
        const key = `${index}-${line.slice(0, 20)}`;
        if (!line.trim()) return <span className="discord-preview-gap" key={key} />;
        if (line.startsWith("### ")) return <h4 key={key}>{normalizeMarkdownLine(line.slice(4))}</h4>;
        if (line.startsWith("## ")) return <h3 key={key}>{normalizeMarkdownLine(line.slice(3))}</h3>;
        if (line.startsWith("# ")) return <h2 key={key}>{normalizeMarkdownLine(line.slice(2))}</h2>;
        if (line.startsWith(">")) return <p className="discord-preview-quote" key={key}>{normalizeMarkdownLine(line.replace(/^>\s?/, ""))}</p>;
        if (/^[-*]\s+/.test(line)) return <p className="discord-preview-list" key={key}>{normalizeMarkdownLine(line.replace(/^[-*]\s+/, ""))}</p>;
        return <p key={key}>{normalizeMarkdownLine(line)}</p>;
      })}
    </div>
  );
}

function DiscordPreview({ embed, content, isValid }: { embed: EmbedObject; content: string; isValid: boolean }) {
  const color = typeof embed?.color === "number" ? `#${Math.max(0, Math.min(0xffffff, embed.color)).toString(16).padStart(6, "0")}` : COLOR_FALLBACK;
  const author = embed?.author && typeof embed.author === "object" ? embed.author as Record<string, unknown> : null;
  const footer = embed?.footer && typeof embed.footer === "object" ? embed.footer as Record<string, unknown> : null;
  const fields = Array.isArray(embed?.fields) ? embed.fields.slice(0, 25) : [];
  const thumbnail = urlFrom(embed?.thumbnail);
  const image = urlFrom(embed?.image);

  return (
    <aside className="discord-preview-panel panel" aria-label="Preview Discord embed">
      <div className="discord-preview-titlebar">
        <span>Preview</span>
        <small>Discord вигляд</small>
      </div>
      <div className="discord-preview-canvas">
        {content ? <div className="discord-preview-content">{content}</div> : null}
        <article className="discord-message-preview" style={{ borderLeftColor: color }}>
          {thumbnail ? <img className="discord-preview-thumb" src={thumbnail} alt="" /> : null}
          {author?.icon_url ? <img className="discord-preview-author-icon" src={text(author.icon_url)} alt="" /> : null}
          {author?.name ? <div className="discord-preview-author">{text(author.name)}</div> : null}
          {embed?.title ? <h2>{text(embed.title)}</h2> : null}
          {embed?.description ? <MarkdownPreview value={text(embed.description)} /> : null}
          {fields.length > 0 ? (
            <div className="discord-preview-fields">
              {fields.map((field: any, index: number) => (
                <div className={field?.inline ? "is-inline" : undefined} key={`${index}-${field?.name || "field"}`}>
                  <strong>{text(field?.name)}</strong>
                  <span>{text(field?.value)}</span>
                </div>
              ))}
            </div>
          ) : null}
          {image ? <img className="discord-preview-image" src={image} alt="" /> : null}
          {footer?.text ? <footer>{footer?.icon_url ? <img src={text(footer.icon_url)} alt="" /> : null}<span>{text(footer.text)}</span></footer> : null}
        </article>
        {!isValid ? <div className="discord-preview-error">Embed порожній або код кольору невалідний. Додай title, description, image, thumbnail або field.</div> : null}
      </div>
    </aside>
  );
}

function roleColor(value: number) {
  return value > 0 ? colorNumberToHex(value) : "#B8E986";
}

function RolePicker({ roles, selectedRoleIds, onChange }: {
  roles: DiscordRoleOption[];
  selectedRoleIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const normalizedSelectedRoleIds = uniqueIds(selectedRoleIds);
  const selected = new Set(normalizedSelectedRoleIds);
  const filteredRoles = roles.filter((role) => role.name.toLowerCase().includes(query.trim().toLowerCase()));
  const visibleRoleIds = new Set(filteredRoles.map((role) => role.id));
  const hiddenSelectedRoleIds = normalizedSelectedRoleIds.filter((roleId) => !visibleRoleIds.has(roleId));

  function toggleRole(roleId: string) {
    if (selected.has(roleId)) {
      onChange(normalizedSelectedRoleIds.filter((id) => id !== roleId));
      return;
    }
    onChange(uniqueIds([...normalizedSelectedRoleIds, roleId]));
  }

  return (
    <div className="discord-role-picker">
      {hiddenSelectedRoleIds.map((roleId) => (
        <input key={`hidden-${roleId}`} type="hidden" name="roleIds" value={roleId} />
      ))}
      <div className="discord-role-selected" aria-label="Вибрані ролі">
        {normalizedSelectedRoleIds.length === 0 ? <span className="discord-role-placeholder">Ролі ще не вибрані</span> : null}
        {roles.filter((role) => selected.has(role.id)).map((role) => (
          <span className="discord-role-chip" key={role.id}>
            <span className="discord-role-dot" style={{ backgroundColor: roleColor(role.color) }} />
            {role.name}
          </span>
        ))}
      </div>

      <input
        className="input discord-role-search"
        type="search"
        value={query}
        placeholder="Пошук ролі..."
        onChange={(event) => setQuery(event.currentTarget.value)}
      />

      <div className="discord-role-list" role="listbox" aria-label="Ролі для кнопки прийняття правил">
        {filteredRoles.length === 0 ? (
          <div className="discord-role-empty">Нічого не знайдено. Очисти пошук або перевір список ролей бота.</div>
        ) : null}
        {filteredRoles.map((role) => (
          <label className="discord-role-option" key={role.id} data-selected={selected.has(role.id) ? "true" : "false"}>
            <input
              type="checkbox"
              name="roleIds"
              value={role.id}
              checked={selected.has(role.id)}
              onChange={() => toggleRole(role.id)}
            />
            <span className="discord-role-dot" style={{ backgroundColor: roleColor(role.color) }} />
            <span>{role.name}</span>
            {selected.has(role.id) ? <strong>Вибрано</strong> : null}
          </label>
        ))}
      </div>
      <small>Бот зможе видати тільки ролі, які нижчі за його найвищу роль у Discord.</small>
    </div>
  );
}

function EmbedFieldEditor({ fields, onChange }: {
  fields: EmbedFieldState[];
  onChange: (fields: EmbedFieldState[]) => void;
}) {
  const [fieldSeq, setFieldSeq] = useState(fields.length);

  function patchField(id: string, patch: Partial<EmbedFieldState>) {
    onChange(fields.map((field) => field.id === id ? { ...field, ...patch } : field));
  }

  function addField() {
    if (fields.length >= 25) return;
    const nextSeq = fieldSeq + 1;
    setFieldSeq(nextSeq);
    onChange([...fields, { id: `field-${nextSeq}`, name: "", value: "", inline: false }]);
  }

  function removeField(id: string) {
    onChange(fields.filter((field) => field.id !== id));
  }

  return (
    <div className="discord-field-editor">
      {fields.length === 0 ? (
        <div className="discord-field-empty">Fields не додані. Їх можна використовувати для коротких блоків: розклад, ролі, посилання, вимоги.</div>
      ) : null}

      {fields.map((field, index) => (
        <div className="discord-field-row" key={field.id}>
          <div className="discord-field-row-head">
            <strong>Field {index + 1}</strong>
            <button className="btn danger discord-field-remove" type="button" onClick={() => removeField(field.id)}>Видалити</button>
          </div>
          <label className="content-field">
            <span>Назва field</span>
            <input className="input" value={field.name} maxLength={256} onChange={(event) => patchField(field.id, { name: event.currentTarget.value })} />
          </label>
          <label className="content-field content-field--wide">
            <span>Значення field</span>
            <textarea className="input textarea compact" value={field.value} maxLength={1024} onChange={(event) => patchField(field.id, { value: event.currentTarget.value })} />
          </label>
          <label className="inline-check discord-inline-check">
            <input type="checkbox" checked={field.inline} onChange={(event) => patchField(field.id, { inline: event.currentTarget.checked })} />
            <span>Показувати inline</span>
          </label>
        </div>
      ))}

      <button className="btn subtle discord-add-field" type="button" onClick={addField} disabled={fields.length >= 25}>+ Додати field</button>
      <small>{fields.length}/25 fields</small>
    </div>
  );
}

export default function DiscordEmbedEditor({
  mode,
  editorMode,
  channels,
  roles = [],
  suggestedChannelId,
  defaultEmbedJson,
  defaultContent = "",
  defaultMessageLink = "",
  selectedRoleIds = [],
  returnTo,
}: DiscordEmbedEditorProps) {
  const initialEmbed = useMemo(() => parseInitialEmbed(defaultEmbedJson), [defaultEmbedJson]);
  const author = objectFrom(initialEmbed.author);
  const footer = objectFrom(initialEmbed.footer);

  const [content, setContent] = useState(defaultContent);
  const [channelId, setChannelId] = useState(suggestedChannelId || channels[0]?.id || "");
  const [messageLink, setMessageLink] = useState(defaultMessageLink);
  const [roleIds, setRoleIds] = useState(selectedRoleIds);
  const [titleValue, setTitleValue] = useState(text(initialEmbed.title));
  const [urlValue, setUrlValue] = useState(text(initialEmbed.url));
  const [descriptionValue, setDescriptionValue] = useState(text(initialEmbed.description));
  const [colorHex, setColorHex] = useState(colorNumberToHex(initialEmbed.color));
  const [authorName, setAuthorName] = useState(text(author.name));
  const [authorUrl, setAuthorUrl] = useState(text(author.url));
  const [authorIconUrl, setAuthorIconUrl] = useState(text(author.icon_url));
  const [thumbnailUrl, setThumbnailUrl] = useState(urlFrom(initialEmbed.thumbnail));
  const [imageUrl, setImageUrl] = useState(urlFrom(initialEmbed.image));
  const [footerText, setFooterText] = useState(text(footer.text));
  const [footerIconUrl, setFooterIconUrl] = useState(text(footer.icon_url));
  const [timestampEnabled, setTimestampEnabled] = useState(Boolean(initialEmbed.timestamp));
  const [fields, setFields] = useState<EmbedFieldState[]>(initialFields(initialEmbed.fields));
  const [messageLoadState, setMessageLoadState] = useState<"idle" | "loading" | "loaded" | "error">("idle");
  const [messageLoadText, setMessageLoadText] = useState("");
  const [loadedMessageLink, setLoadedMessageLink] = useState(normalizeMessageLink(defaultMessageLink));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const lastLoadedMessageLinkRef = useRef(normalizeMessageLink(defaultMessageLink));
  const channelsKey = channels.map((channel) => channel.id).join("|");
  const selectedRoleIdsKey = uniqueIds(selectedRoleIds).join("|");
  const isRules = mode === "rules";

  useEffect(() => {
    const nextEmbed = parseInitialEmbed(defaultEmbedJson);
    const nextAuthor = objectFrom(nextEmbed.author);
    const nextFooter = objectFrom(nextEmbed.footer);

    setContent(defaultContent);
    setChannelId(suggestedChannelId || channels[0]?.id || "");
    setMessageLink(defaultMessageLink);
    setRoleIds(uniqueIds(selectedRoleIds));
    setTitleValue(text(nextEmbed.title));
    setUrlValue(text(nextEmbed.url));
    setDescriptionValue(text(nextEmbed.description));
    setColorHex(colorNumberToHex(nextEmbed.color));
    setAuthorName(text(nextAuthor.name));
    setAuthorUrl(text(nextAuthor.url));
    setAuthorIconUrl(text(nextAuthor.icon_url));
    setThumbnailUrl(urlFrom(nextEmbed.thumbnail));
    setImageUrl(urlFrom(nextEmbed.image));
    setFooterText(text(nextFooter.text));
    setFooterIconUrl(text(nextFooter.icon_url));
    setTimestampEnabled(Boolean(nextEmbed.timestamp));
    setFields(initialFields(nextEmbed.fields));
    const normalizedDefaultMessageLink = normalizeMessageLink(defaultMessageLink);
    lastLoadedMessageLinkRef.current = normalizedDefaultMessageLink;
    setLoadedMessageLink(normalizedDefaultMessageLink);
    setMessageLoadState("idle");
    setMessageLoadText("");
  }, [defaultEmbedJson, defaultContent, defaultMessageLink, suggestedChannelId, channelsKey, selectedRoleIdsKey]);

  function applyEmbedToEditor(nextEmbed: EmbedObject) {
    const nextAuthor = objectFrom(nextEmbed.author);
    const nextFooter = objectFrom(nextEmbed.footer);
    setTitleValue(text(nextEmbed.title));
    setUrlValue(text(nextEmbed.url));
    setDescriptionValue(text(nextEmbed.description));
    setColorHex(colorNumberToHex(nextEmbed.color));
    setAuthorName(text(nextAuthor.name));
    setAuthorUrl(text(nextAuthor.url));
    setAuthorIconUrl(text(nextAuthor.icon_url));
    setThumbnailUrl(urlFrom(nextEmbed.thumbnail));
    setImageUrl(urlFrom(nextEmbed.image));
    setFooterText(text(nextFooter.text));
    setFooterIconUrl(text(nextFooter.icon_url));
    setTimestampEnabled(Boolean(nextEmbed.timestamp));
    setFields(initialFields(nextEmbed.fields));
  }

  async function loadMessageFromLink(force = false, signal?: AbortSignal) {
    const rawLink = normalizeMessageLink(messageLink);
    if (!rawLink || !looksLikeDiscordMessageRef(rawLink)) {
      if (force) {
        setMessageLoadState("error");
        setMessageLoadText("Встав повне посилання Discord message або пару channelId/messageId.");
      }
      return;
    }

    if (!force && rawLink === lastLoadedMessageLinkRef.current) return;

    setMessageLoadState("loading");
    setMessageLoadText("Підтягуємо контент з Discord...");

    try {
      const params = new URLSearchParams({ message: rawLink, mode });
      const response = await fetch(`/api/discord/embeds/message?${params.toString()}`, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "X-Dashboard-Action": "load-discord-message",
        },
        credentials: "same-origin",
        cache: "no-store",
        signal,
      });
      const data = await response.json().catch(() => ({ error: "Сервер повернув не JSON-відповідь." }));

      if (!response.ok || data?.error) {
        throw new Error(extractErrorMessage(data));
      }

      const loaded = data?.message && typeof data.message === "object" ? data.message as Record<string, unknown> : null;
      if (!loaded) throw new Error("Discord-повідомлення не містить даних для редактора.");

      const rawEmbed = loaded.embed && typeof loaded.embed === "object" && !Array.isArray(loaded.embed)
        ? loaded.embed as EmbedObject
        : parseInitialEmbed(typeof loaded.embedJson === "string" ? loaded.embedJson : "{}");

      applyEmbedToEditor(rawEmbed);
      setContent(text(loaded.content));
      setChannelId(text(loaded.channelId) || channelId);
      setMessageLink(text(loaded.url) || rawLink);

      if (isRules) {
        setRoleIds(Array.isArray(loaded.roleIds) ? uniqueIds(loaded.roleIds.map((roleId) => String(roleId))) : []);
      }

      const nextLink = normalizeMessageLink(text(loaded.url) || rawLink);
      lastLoadedMessageLinkRef.current = nextLink;
      setLoadedMessageLink(nextLink);
      setMessageLoadState("loaded");
      setMessageLoadText(text(data.warning) || "Контент, embed і ролі підтягнуто з Discord-повідомлення.");
    } catch (error) {
      if ((error as DOMException)?.name === "AbortError") return;
      setMessageLoadState("error");
      setMessageLoadText(error instanceof Error ? error.message : "Не вдалося підтягнути Discord-повідомлення.");
    }
  }

  useEffect(() => {
    const rawLink = normalizeMessageLink(messageLink);
    if (!rawLink || rawLink === lastLoadedMessageLinkRef.current) return;

    if (!looksLikeDiscordMessageRef(rawLink)) {
      setMessageLoadState("idle");
      setMessageLoadText("");
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      loadMessageFromLink(false, controller.signal);
    }, 650);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [messageLink, mode, isRules]);

  const normalizedCurrentMessageLink = normalizeMessageLink(messageLink);
  const normalizedLoadedMessageLink = normalizeMessageLink(loadedMessageLink);
  const hasMessageLinkEditTarget = looksLikeDiscordMessageRef(normalizedCurrentMessageLink);
  const hasInvalidMessageLink = Boolean(normalizedCurrentMessageLink) && !hasMessageLinkEditTarget;
  const hasLoadedEditableMessage = Boolean(
    normalizedLoadedMessageLink &&
    normalizedCurrentMessageLink === normalizedLoadedMessageLink &&
    looksLikeDiscordMessageRef(normalizedLoadedMessageLink)
  );
  const effectiveSubmitAction = editorMode === "edit" || hasMessageLinkEditTarget ? "edit" : "publish";

  function handleSubmit(_: FormEvent<HTMLFormElement>) {
    setIsSubmitting(true);
    setMessageLoadText(
      effectiveSubmitAction === "edit"
        ? isRules ? "Оновлюємо підтягнуте повідомлення з правилами..." : "Оновлюємо підтягнуте Discord-повідомлення..."
        : isRules ? "Публікуємо нові правила Discord..." : "Публікуємо новий Discord embed..."
    );
  }

  const embed = useMemo(() => buildEmbed({
    title: titleValue,
    url: urlValue,
    description: descriptionValue,
    colorHex,
    authorName,
    authorUrl,
    authorIconUrl,
    thumbnailUrl,
    imageUrl,
    footerText,
    footerIconUrl,
    timestampEnabled,
    fields,
  }), [titleValue, urlValue, descriptionValue, colorHex, authorName, authorUrl, authorIconUrl, thumbnailUrl, imageUrl, footerText, footerIconUrl, timestampEnabled, fields]);

  const normalizedColor = normalizeHexColor(colorHex);
  const generatedEmbedJson = useMemo(() => JSON.stringify(embed), [embed]);
  const selectedRolesCount = uniqueIds(roleIds).length;
  const isValid = hasVisibleEmbedContent(embed) && Boolean(normalizedColor);
  const title = isRules ? "Редактор правил Discord" : "Редактор embed-поста";
  const actionLabel = effectiveSubmitAction === "edit"
    ? hasLoadedEditableMessage && editorMode !== "edit" ? "Оновити підтягнуте повідомлення" : editorMode !== "edit" ? "Оновити повідомлення за link" : "Зберегти зміни"
    : isRules ? "Опублікувати правила" : "Опублікувати embed";

  function updateColorFromText(value: string) {
    setColorHex(value.startsWith("#") ? value : `#${value}`);
  }

  return (
    <div className="discord-builder-shell discord-builder-shell--site">
      <section className="discord-builder-panel panel" aria-label={title}>
        <div className="discord-builder-titlebar">
          <span>{isRules ? "Rules" : "General"} embed</span>
          <small>{isValid ? "Готово до публікації" : "Потрібен видимий контент"}</small>
        </div>
        <div className="discord-builder-body">
          <div className="discord-builder-head">
            <div>
              <span className="eyebrow">{isRules ? "Rules" : "General post"} • {editorMode === "edit" ? "Edit" : "Create"}</span>
              <h2>{title}</h2>
              <p>{isRules ? "Створи або онови embed правил, а внизу вибери ролі для кнопки прийняття." : "Заповни поля embed окремо, обери канал і за потреби встав посилання на повідомлення для редагування."}</p>
            </div>
            <span className="discord-mode-pill">{effectiveSubmitAction === "edit" ? hasLoadedEditableMessage && editorMode !== "edit" ? "Редагування підтягнутого" : editorMode !== "edit" ? "Редагування за link" : "Редагування" : "Створення"}</span>
          </div>

          <form className={isSubmitting ? "discord-builder-form is-submitting" : "discord-builder-form"} method="post" action="/api/discord/embeds/publish" onSubmit={handleSubmit}>
            <input type="hidden" name="mode" value={mode} />
            <input type="hidden" name="returnTo" value={returnTo} />
            <input type="hidden" name="action" value={effectiveSubmitAction} />
            <input type="hidden" name="embedJson" value={generatedEmbedJson} />

            <div className="content-form-section discord-visual-section">
              <div className="content-form-section-head">
                <strong>Публікація</strong>
                <small>Канал, текст над embed і посилання для майбутнього редагування.</small>
              </div>
              <div className="discord-builder-grid">
                <label className="content-field">
                  <span>Канал</span>
                  <select className="select modern-select" name="channelId" value={channelId} onChange={(event) => setChannelId(event.currentTarget.value)} required>
                    {channels.map((channel) => (
                      <option key={channel.id} value={channel.id}># {channel.name}{channel.type === 5 ? " • announcement" : ""}</option>
                    ))}
                  </select>
                </label>

                <div className="content-field discord-message-link-field">
                  <span>Discord message link для редагування</span>
                  <div className="discord-message-link-row">
                    <input
                      className="input"
                      name="messageLink"
                      value={messageLink}
                      placeholder="https://discord.com/channels/.../.../..."
                      disabled={isSubmitting}
                      onChange={(event) => setMessageLink(event.currentTarget.value)}
                    />
                    <button
                      className="btn subtle discord-load-message-btn"
                      type="button"
                      disabled={isSubmitting || messageLoadState === "loading" || !looksLikeDiscordMessageRef(messageLink)}
                      aria-busy={messageLoadState === "loading"}
                      onClick={() => loadMessageFromLink(true)}
                    >
                      {messageLoadState === "loading" ? "Підтягуємо..." : "Підтягнути"}
                    </button>
                  </div>
                  {hasInvalidMessageLink ? (
                    <small className="discord-message-load-note discord-message-load-note--error" role="alert">Посилання не схоже на Discord message link. Виправ його або очисти поле.</small>
                  ) : messageLoadText ? (
                    <small className={`discord-message-load-note discord-message-load-note--${messageLoadState}`} role={messageLoadState === "error" ? "alert" : "status"}>{messageLoadText}</small>
                  ) : (
                    <small>Після вставки link редактор автоматично підтягне content, embed, канал і ролі.</small>
                  )}
                  {hasLoadedEditableMessage ? (
                    <small className="discord-edit-mode-note" role="status">Підтягнуто: кнопка збереження оновить саме це Discord-повідомлення. Нове повідомлення не створиться.</small>
                  ) : hasMessageLinkEditTarget ? (
                    <small className="discord-edit-mode-note" role="status">Link розпізнано: збереження буде редагувати це Discord-повідомлення, а не створювати нове.</small>
                  ) : null}
                </div>
              </div>

              <label className="content-field content-field--wide">
                <span>Текст над embed</span>
                <textarea
                  className="input textarea compact discord-builder-textarea"
                  name="content"
                  value={content}
                  maxLength={2000}
                  placeholder="Опціональний plain text над embed"
                  onChange={(event) => setContent(event.currentTarget.value)}
                />
                <small>{content.length}/2000</small>
              </label>
            </div>

            <div className="content-form-section discord-visual-section discord-visual-section--accent">
              <div className="content-form-section-head">
                <strong>Основний embed</strong>
                <small>Title, URL, description і колір. Колір можна вибрати або вставити кодом, наприклад #B8E986.</small>
              </div>

              <div className="discord-builder-grid">
                <label className="content-field">
                  <span>Title</span>
                  <input className="input" value={titleValue} maxLength={256} placeholder="🌸 Заголовок" onChange={(event) => setTitleValue(event.currentTarget.value)} />
                </label>
                <label className="content-field">
                  <span>URL заголовка</span>
                  <input className="input" value={urlValue} placeholder="https://..." onChange={(event) => setUrlValue(event.currentTarget.value)} />
                </label>
              </div>

              <label className="content-field content-field--wide">
                <span>Description</span>
                <textarea className="input textarea markdown-area discord-description-area" value={descriptionValue} maxLength={4096} placeholder="Discord Markdown: # Заголовок, ## Розділ, - список..." onChange={(event) => setDescriptionValue(event.currentTarget.value)} />
                <small>{descriptionValue.length}/4096</small>
              </label>

              <div className="discord-color-row">
                <label className="content-field discord-color-picker-field">
                  <span>Вибір кольору</span>
                  <input
                    className="discord-color-picker"
                    type="color"
                    value={normalizedColor || COLOR_FALLBACK}
                    onChange={(event) => setColorHex(event.currentTarget.value.toUpperCase())}
                    aria-label="Вибрати колір embed"
                  />
                </label>
                <label className="content-field">
                  <span>Код кольору</span>
                  <input
                    className="input discord-color-code"
                    value={colorHex}
                    placeholder="#B8E986"
                    maxLength={7}
                    onChange={(event) => updateColorFromText(event.currentTarget.value)}
                  />
                  <small className={normalizedColor ? undefined : "discord-json-error"}>{normalizedColor ? "Формат HEX, наприклад #B8E986" : "Невалідний HEX. Потрібно #RRGGBB."}</small>
                </label>
                <label className="inline-check discord-inline-check discord-timestamp-check">
                  <input type="checkbox" checked={timestampEnabled} onChange={(event) => setTimestampEnabled(event.currentTarget.checked)} />
                  <span>Додати поточний timestamp</span>
                </label>
              </div>
            </div>

            <div className="content-form-section discord-visual-section">
              <div className="content-form-section-head">
                <strong>Медіа</strong>
                <small>Thumbnail показується справа вгорі, image — великим блоком під текстом.</small>
              </div>
              <div className="discord-builder-grid">
                <label className="content-field">
                  <span>Thumbnail URL</span>
                  <input className="input" value={thumbnailUrl} placeholder="https://..." onChange={(event) => setThumbnailUrl(event.currentTarget.value)} />
                </label>
                <label className="content-field">
                  <span>Image URL</span>
                  <input className="input" value={imageUrl} placeholder="https://..." onChange={(event) => setImageUrl(event.currentTarget.value)} />
                </label>
              </div>
            </div>

            <div className="content-form-section discord-visual-section">
              <div className="content-form-section-head">
                <strong>Author і footer</strong>
                <small>Опціональні дані автора та нижній підпис embed.</small>
              </div>
              <div className="discord-builder-grid discord-builder-grid--three">
                <label className="content-field">
                  <span>Author name</span>
                  <input className="input" value={authorName} maxLength={256} onChange={(event) => setAuthorName(event.currentTarget.value)} />
                </label>
                <label className="content-field">
                  <span>Author URL</span>
                  <input className="input" value={authorUrl} placeholder="https://..." onChange={(event) => setAuthorUrl(event.currentTarget.value)} />
                </label>
                <label className="content-field">
                  <span>Author icon URL</span>
                  <input className="input" value={authorIconUrl} placeholder="https://..." onChange={(event) => setAuthorIconUrl(event.currentTarget.value)} />
                </label>
              </div>
              <div className="discord-builder-grid">
                <label className="content-field">
                  <span>Footer text</span>
                  <input className="input" value={footerText} maxLength={2048} onChange={(event) => setFooterText(event.currentTarget.value)} />
                </label>
                <label className="content-field">
                  <span>Footer icon URL</span>
                  <input className="input" value={footerIconUrl} placeholder="https://..." onChange={(event) => setFooterIconUrl(event.currentTarget.value)} />
                </label>
              </div>
            </div>

            <div className="content-form-section discord-visual-section">
              <div className="content-form-section-head">
                <strong>Fields</strong>
                <small>До 25 окремих embed fields. Порожні rows автоматично не потраплять у Discord.</small>
              </div>
              <EmbedFieldEditor fields={fields} onChange={setFields} />
            </div>

            {isRules ? (
              <div className="content-form-section discord-visual-section discord-visual-section--roles">
                <div className="content-form-section-head">
                  <strong>Ролі для кнопки “Прийняти правила”</strong>
                  <small>Вибрано: {selectedRolesCount}. Кнопка “Відмовитися” запускає підтвердження, а потім кік через Worker.</small>
                </div>
                <RolePicker roles={roles} selectedRoleIds={roleIds} onChange={setRoleIds} />
              </div>
            ) : null}

            <div className="discord-builder-actions">
              <a className="btn subtle" href={returnTo || (isRules ? "/discord/rules" : "/discord")}>Скасувати</a>
              <button className="btn primary" type="submit" disabled={!isValid || hasInvalidMessageLink || isSubmitting || messageLoadState === "loading"} aria-busy={isSubmitting} title={!isValid ? "Додай title, description, image, thumbnail або field та валідний HEX колір." : hasInvalidMessageLink ? "Виправ Discord message link або очисти поле." : undefined}>{isSubmitting ? "Виконуємо..." : actionLabel}</button>
            </div>
          </form>
        </div>
      </section>

      <DiscordPreview embed={embed} content={content} isValid={isValid} />
    </div>
  );
}
