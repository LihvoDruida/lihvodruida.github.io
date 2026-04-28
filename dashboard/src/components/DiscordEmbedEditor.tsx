"use client";

import { type FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { dashboardErrorMessage, dispatchDashboardToast } from "@/lib/clientToasts";

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
  ruleType?: "guild" | "raid";
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

const DISCORD_MARKDOWN_BLOCK_LIMIT = 160;

type InlineMarkdownToken = {
  index: number;
  length: number;
  priority: number;
  render: (key: string) => ReactNode;
};

function isEscaped(value: string, index: number) {
  let slashCount = 0;
  for (let cursor = index - 1; cursor >= 0 && value[cursor] === "\\"; cursor -= 1) {
    slashCount += 1;
  }
  return slashCount % 2 === 1;
}

function unescapeDiscordText(value: string) {
  return value.replace(/\\([\\`*_~|>\[\]()#-])/g, "$1");
}

function pushPlain(nodes: ReactNode[], value: string) {
  if (value) nodes.push(unescapeDiscordText(value));
}

function findMarkdownToken(
  value: string,
  regex: RegExp,
  priority: number,
  render: (match: RegExpExecArray, key: string) => ReactNode,
): InlineMarkdownToken | null {
  regex.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(value))) {
    if (!match[0]) {
      regex.lastIndex += 1;
      continue;
    }

    if (isEscaped(value, match.index)) continue;

    return {
      index: match.index,
      length: match[0].length,
      priority,
      render: (key: string) => render(match as RegExpExecArray, key),
    };
  }

  return null;
}

function formatDiscordTimestamp(unixSeconds: string, style = "f") {
  const timestamp = Number(unixSeconds);
  if (!Number.isFinite(timestamp)) return `<t:${unixSeconds}${style ? `:${style}` : ""}>`;

  const date = new Date(timestamp * 1000);
  if (Number.isNaN(date.getTime())) return `<t:${unixSeconds}${style ? `:${style}` : ""}>`;

  if (style === "t") return new Intl.DateTimeFormat("uk-UA", { hour: "2-digit", minute: "2-digit" }).format(date);
  if (style === "T") return new Intl.DateTimeFormat("uk-UA", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(date);
  if (style === "d") return new Intl.DateTimeFormat("uk-UA", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
  if (style === "D") return new Intl.DateTimeFormat("uk-UA", { day: "2-digit", month: "long", year: "numeric" }).format(date);
  if (style === "R") return "відносний час";
  return new Intl.DateTimeFormat("uk-UA", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

function firstInlineToken(value: string): InlineMarkdownToken | null {
  const patterns: InlineMarkdownToken[] = [
    findMarkdownToken(value, /`([^`\n]+?)`/g, 0, (match, key) => <code key={key}>{match[1]}</code>),
    findMarkdownToken(value, /\[([^\]\n]+?)\]\((https?:\/\/[^\s<>)]+)\)/gi, 1, (match, key) => (
      <a className="discord-preview-link" key={key} href={match[2]} target="_blank" rel="noreferrer">
        {renderDiscordInlineMarkdown(match[1], `${key}-link`)}
      </a>
    )),
    findMarkdownToken(value, /<@&(\d{16,25})>/g, 2, (_match, key) => <span className="discord-preview-mention" key={key}>@role</span>),
    findMarkdownToken(value, /<@!?(\d{16,25})>/g, 2, (_match, key) => <span className="discord-preview-mention" key={key}>@user</span>),
    findMarkdownToken(value, /<#(\d{16,25})>/g, 2, (_match, key) => <span className="discord-preview-mention" key={key}>#channel</span>),
    findMarkdownToken(value, /<t:(\d{1,12})(?::([tTdDfFR]))?>/g, 2, (match, key) => <span className="discord-preview-timestamp" key={key}>{formatDiscordTimestamp(match[1], match[2] || "f")}</span>),
    findMarkdownToken(value, /<a?:([a-zA-Z0-9_]{2,32}):\d{16,25}>/g, 2, (match, key) => <span className="discord-preview-emoji" key={key}>:{match[1]}:</span>),
    findMarkdownToken(value, /\|\|([\s\S]+?)\|\|/g, 3, (match, key) => (
      <span className="discord-preview-spoiler" key={key}>{renderDiscordInlineMarkdown(match[1], `${key}-spoiler`)}</span>
    )),
    findMarkdownToken(value, /__\*\*\*([\s\S]+?)\*\*\*__/g, 4, (match, key) => (
      <u key={key}><strong><em>{renderDiscordInlineMarkdown(match[1], `${key}-ubi`)}</em></strong></u>
    )),
    findMarkdownToken(value, /__\*\*([\s\S]+?)\*\*__/g, 4, (match, key) => (
      <u key={key}><strong>{renderDiscordInlineMarkdown(match[1], `${key}-ub`)}</strong></u>
    )),
    findMarkdownToken(value, /__\*([\s\S]+?)\*__/g, 4, (match, key) => (
      <u key={key}><em>{renderDiscordInlineMarkdown(match[1], `${key}-ui`)}</em></u>
    )),
    findMarkdownToken(value, /\*\*\*([\s\S]+?)\*\*\*/g, 5, (match, key) => (
      <strong key={key}><em>{renderDiscordInlineMarkdown(match[1], `${key}-bi`)}</em></strong>
    )),
    findMarkdownToken(value, /\*\*([\s\S]+?)\*\*/g, 6, (match, key) => (
      <strong key={key}>{renderDiscordInlineMarkdown(match[1], `${key}-bold`)}</strong>
    )),
    findMarkdownToken(value, /__([\s\S]+?)__/g, 7, (match, key) => (
      <u key={key}>{renderDiscordInlineMarkdown(match[1], `${key}-underline`)}</u>
    )),
    findMarkdownToken(value, /~~([\s\S]+?)~~/g, 8, (match, key) => (
      <s key={key}>{renderDiscordInlineMarkdown(match[1], `${key}-strike`)}</s>
    )),
    findMarkdownToken(value, /(^|[^*\\])\*([^*\n]+?)\*(?!\*)/g, 9, (match, key) => (
      <span key={key}>{match[1]}<em>{renderDiscordInlineMarkdown(match[2], `${key}-italic`)}</em></span>
    )),
    findMarkdownToken(value, /(^|[^\w_\\])_([^_\n]+?)_(?![\w_])/g, 10, (match, key) => (
      <span key={key}>{match[1]}<em>{renderDiscordInlineMarkdown(match[2], `${key}-italic-u`)}</em></span>
    )),
    findMarkdownToken(value, /https?:\/\/[^\s<]+[^<.,:;"')\]\s]/gi, 11, (match, key) => (
      <a className="discord-preview-link" key={key} href={match[0]} target="_blank" rel="noreferrer">{match[0]}</a>
    )),
  ].filter(Boolean) as InlineMarkdownToken[];

  if (!patterns.length) return null;

  return patterns.sort((a, b) => (a.index - b.index) || (a.priority - b.priority))[0];
}

function renderDiscordInlineMarkdown(value: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let rest = value;
  let cursor = 0;

  while (rest) {
    const token = firstInlineToken(rest);
    if (!token) {
      pushPlain(nodes, rest);
      break;
    }

    if (token.index > 0) pushPlain(nodes, rest.slice(0, token.index));
    nodes.push(token.render(`${keyPrefix}-${cursor}-${token.index}`));
    rest = rest.slice(token.index + token.length);
    cursor += token.index + token.length;
  }

  return nodes;
}

function parseDiscordCodeFence(value: string) {
  const match = value.match(/^```([a-z0-9_+.-]*)[ \t]*\n?([\s\S]*?)```$/i);
  return {
    language: match?.[1] ? match[1].toLowerCase() : "",
    code: match?.[2] ?? value.replace(/^```[a-z0-9_+.-]*[ \t]*\n?/i, "").replace(/```$/, ""),
  };
}

function renderDiscordLineContent(value: string, keyPrefix: string) {
  return renderDiscordInlineMarkdown(value, keyPrefix);
}

function renderDiscordTextLines(value: string, keyPrefix: string) {
  const nodes: ReactNode[] = [];
  const lines = value.split("\n").slice(0, DISCORD_MARKDOWN_BLOCK_LIMIT);

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const rawLine = lines[lineIndex].replace(/\r$/, "");
    const line = rawLine.trimEnd();
    const key = `${keyPrefix}-line-${lineIndex}-${line.slice(0, 12)}`;
    const inlineKey = `${keyPrefix}-inline-${lineIndex}`;

    if (!line.trim()) {
      nodes.push(<span className="discord-preview-gap" key={key} />);
      continue;
    }

    const multiQuoteMatch = line.match(/^>>>\s?(.*)$/);
    if (multiQuoteMatch) {
      const quoteLines = [multiQuoteMatch[1], ...lines.slice(lineIndex + 1).map((nextLine) => nextLine.replace(/\r$/, "").trimEnd())];
      nodes.push(
        <div className="discord-preview-quote discord-preview-quote--multi" key={key}>
          {quoteLines.map((quoteLine, quoteIndex) => (
            quoteLine.trim()
              ? <p key={`${key}-quote-${quoteIndex}`}>{renderDiscordLineContent(quoteLine, `${inlineKey}-quote-${quoteIndex}`)}</p>
              : <span className="discord-preview-gap" key={`${key}-quote-${quoteIndex}`} />
          ))}
        </div>
      );
      break;
    }

    const quoteMatch = line.match(/^>\s?(.*)$/);
    if (quoteMatch) {
      nodes.push(<p className="discord-preview-quote" key={key}>{renderDiscordLineContent(quoteMatch[1], inlineKey)}</p>);
      continue;
    }

    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      nodes.push(
        <div className={`discord-preview-heading discord-preview-heading--${level}`} role="heading" aria-level={level} key={key}>
          {renderDiscordLineContent(headingMatch[2], inlineKey)}
        </div>
      );
      continue;
    }

    const subtextMatch = line.match(/^-#\s+(.+)$/);
    if (subtextMatch) {
      nodes.push(<p className="discord-preview-subtext" key={key}>{renderDiscordLineContent(subtextMatch[1], inlineKey)}</p>);
      continue;
    }

    const unorderedMatch = line.match(/^\s{0,3}[-*+]\s+(.+)$/);
    if (unorderedMatch) {
      nodes.push(
        <p className="discord-preview-list discord-preview-list--unordered" key={key}>
          <span className="discord-preview-list-bullet">•</span>
          <span>{renderDiscordLineContent(unorderedMatch[1], inlineKey)}</span>
        </p>
      );
      continue;
    }

    const orderedMatch = line.match(/^\s{0,3}(\d+)\.\s+(.+)$/);
    if (orderedMatch) {
      nodes.push(
        <p className="discord-preview-list discord-preview-list--ordered" key={key}>
          <span className="discord-preview-list-bullet">{orderedMatch[1]}.</span>
          <span>{renderDiscordLineContent(orderedMatch[2], inlineKey)}</span>
        </p>
      );
      continue;
    }

    nodes.push(<p key={key}>{renderDiscordLineContent(line, inlineKey)}</p>);
  }

  return nodes;
}

function DiscordMarkdown({ value, compact = false }: { value: string; compact?: boolean }) {
  const blocks = value.split(/(```[\s\S]*?```)/g).slice(0, DISCORD_MARKDOWN_BLOCK_LIMIT);

  return (
    <div className={compact ? "discord-preview-markdown discord-preview-markdown--compact" : "discord-preview-markdown"}>
      {blocks.map((block, blockIndex) => {
        const blockKey = `block-${blockIndex}`;
        if (!block) return null;
        if (block.startsWith("```")) {
          const parsed = parseDiscordCodeFence(block);
          return (
            <pre className="discord-preview-codeblock" data-language={parsed.language || undefined} key={blockKey}>
              <code>{parsed.code}</code>
            </pre>
          );
        }

        return renderDiscordTextLines(block, blockKey);
      })}
    </div>
  );
}

function formatPreviewTimestamp() {
  return new Intl.DateTimeFormat("uk-UA", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date());
}

function DiscordPreview({ embed, content, isValid, mentionRoles = [] }: { embed: EmbedObject; content: string; isValid: boolean; mentionRoles?: DiscordRoleOption[] }) {
  const color = typeof embed?.color === "number" ? `#${Math.max(0, Math.min(0xffffff, embed.color)).toString(16).padStart(6, "0")}` : COLOR_FALLBACK;
  const author = embed?.author && typeof embed.author === "object" ? embed.author as Record<string, unknown> : null;
  const footer = embed?.footer && typeof embed.footer === "object" ? embed.footer as Record<string, unknown> : null;
  const fields = Array.isArray(embed?.fields) ? embed.fields.slice(0, 25) : [];
  const thumbnail = urlFrom(embed?.thumbnail);
  const image = urlFrom(embed?.image);
  const previewTimestamp = embed?.timestamp ? formatPreviewTimestamp() : "";

  return (
    <aside className="discord-preview-panel panel" aria-label="Попередній перегляд Discord embed">
      <div className="discord-preview-titlebar">
        <span>Перегляд</span>
        <small>Стиль Discord</small>
      </div>
      <div className="discord-preview-canvas">
        <div className="discord-chat-preview">
          <div className="discord-chat-preview__avatar" aria-hidden="true">MV</div>
          <div className="discord-chat-preview__body">
            <div className="discord-chat-preview__meta">
              <strong>Mistblossom Bot</strong>
              <span>{formatPreviewTimestamp()}</span>
            </div>

            {(mentionRoles.length > 0 || content) ? (
              <div className="discord-preview-content">
                {mentionRoles.length > 0 ? (
                  <div className="discord-preview-mentions" aria-label="Ролі, які будуть згадані">
                    {mentionRoles.map((role) => <span key={role.id}>@{role.name}</span>)}
                  </div>
                ) : null}
                {content ? <DiscordMarkdown value={content} compact /> : null}
              </div>
            ) : null}

            <article className="discord-message-preview" style={{ borderLeftColor: color }}>
              <div className="discord-message-preview__body">
                <div className="discord-message-preview__main">
                  {author?.icon_url ? <img className="discord-preview-author-icon" src={text(author.icon_url)} alt="" /> : null}
                  {author?.name ? (
                    text(author.url) ? <a className="discord-preview-author discord-preview-link" href={text(author.url)} target="_blank" rel="noreferrer">{text(author.name)}</a> : <div className="discord-preview-author">{text(author.name)}</div>
                  ) : null}
                  {embed?.title ? (
                    text(embed.url)
                      ? <a className="discord-preview-title discord-preview-link" href={text(embed.url)} target="_blank" rel="noreferrer">{text(embed.title)}</a>
                      : <h2 className="discord-preview-title">{text(embed.title)}</h2>
                  ) : null}
                  {embed?.description ? <DiscordMarkdown value={text(embed.description)} /> : null}
                  {fields.length > 0 ? (
                    <div className={thumbnail ? "discord-preview-fields discord-preview-fields--with-thumb" : "discord-preview-fields"}>
                      {fields.map((field: any, index: number) => (
                        <div className={field?.inline ? "discord-preview-field discord-preview-field--inline" : "discord-preview-field discord-preview-field--full"} key={`${index}-${field?.name || "field"}`}>
                          <strong className="discord-preview-field-name">{text(field?.name)}</strong>
                          <div className="discord-preview-field-value"><DiscordMarkdown value={text(field?.value)} compact /></div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {(footer?.text || previewTimestamp) ? (
                    <footer>
                      {footer?.icon_url ? <img src={text(footer.icon_url)} alt="" /> : null}
                      {footer?.text ? <span>{text(footer.text)}</span> : null}
                      {footer?.text && previewTimestamp ? <span className="discord-preview-footer-separator">•</span> : null}
                      {previewTimestamp ? <time dateTime={new Date().toISOString()}>{previewTimestamp}</time> : null}
                    </footer>
                  ) : null}
                </div>
                {thumbnail ? <img className="discord-preview-thumb" src={thumbnail} alt="" /> : null}
              </div>
              {image ? <img className="discord-preview-image" src={image} alt="" /> : null}
            </article>

            {!isValid ? <div className="discord-preview-error">Embed порожній або код кольору невалідний. Додай title, description, image, thumbnail або field.</div> : null}
          </div>
        </div>
      </div>
    </aside>
  );
}

function roleColor(value: number) {
  return value > 0 ? colorNumberToHex(value) : "#B8E986";
}

function RolePicker({ roles, selectedRoleIds, onChange, ariaLabel = "Вибір ролей", emptyLabel = "Ролі ще не вибрані", helperText = "Бот зможе працювати тільки з ролями, які доступні йому в Discord." }: {
  roles: DiscordRoleOption[];
  selectedRoleIds: string[];
  onChange: (ids: string[]) => void;
  ariaLabel?: string;
  emptyLabel?: string;
  helperText?: string;
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
      <div className="discord-role-selected" aria-label={ariaLabel}>
        {normalizedSelectedRoleIds.length === 0 ? <span className="discord-role-placeholder">{emptyLabel}</span> : null}
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

      <div className="discord-role-list" role="listbox" aria-label={ariaLabel}>
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
      <small>{helperText}</small>
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
        <div className="discord-field-empty">Поля не додані.</div>
      ) : null}

      {fields.map((field, index) => (
        <div className="discord-field-row" key={field.id}>
          <div className="discord-field-row-head">
            <strong>Поле {index + 1}</strong>
            <button className="btn danger discord-field-remove" type="button" onClick={() => removeField(field.id)}>Видалити</button>
          </div>
          <label className="content-field">
            <span>Назва поля</span>
            <input className="input" value={field.name} maxLength={256} onChange={(event) => patchField(field.id, { name: event.currentTarget.value })} />
          </label>
          <label className="content-field content-field--wide">
            <span>Значення поля</span>
            <textarea className="input textarea compact" value={field.value} maxLength={1024} onChange={(event) => patchField(field.id, { value: event.currentTarget.value })} />
          </label>
          <label className="inline-check discord-inline-check">
            <input type="checkbox" checked={field.inline} onChange={(event) => patchField(field.id, { inline: event.currentTarget.checked })} />
            <span>Показувати inline</span>
          </label>
        </div>
      ))}

      <button className="btn subtle discord-add-field" type="button" onClick={addField} disabled={fields.length >= 25}>+ Додати поле</button>
      <small>{fields.length}/25 fields</small>
    </div>
  );
}

export default function DiscordEmbedEditor({
  mode,
  ruleType = "guild",
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
  const isRaidRules = isRules && ruleType === "raid";

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
        const errorMessage = "Встав повне посилання Discord message або пару channelId/messageId.";
        setMessageLoadState("error");
        setMessageLoadText(errorMessage);
        dispatchDashboardToast({ tone: "warning", title: "Невалідний Discord link", message: errorMessage });
      }
      return;
    }

    if (!force && rawLink === lastLoadedMessageLinkRef.current) return;

    setMessageLoadState("loading");
    setMessageLoadText("Підтягуємо контент з Discord...");
    if (force) {
      dispatchDashboardToast({ tone: "info", title: "Підтягуємо Discord повідомлення", message: "Завантажуємо content, embed, канал і ролі для редагування.", ttl: 3600 });
    }

    try {
      const params = new URLSearchParams({ message: rawLink, mode, ruleType });
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

      if (isRules && loaded.rulesType !== "raid") {
        setRoleIds(Array.isArray(loaded.roleIds) ? uniqueIds(loaded.roleIds.map((roleId) => String(roleId))) : []);
      }
      if (isRaidRules) {
        setRoleIds([]);
      }

      const nextLink = normalizeMessageLink(text(loaded.url) || rawLink);
      lastLoadedMessageLinkRef.current = nextLink;
      setLoadedMessageLink(nextLink);
      setMessageLoadState("loaded");
      setMessageLoadText(text(data.warning) || "Підтягнуто. Збереження оновить це Discord-повідомлення.");
      dispatchDashboardToast({
        tone: data.warning ? "warning" : "success",
        title: data.warning ? "Повідомлення підтягнуто з попередженням" : "Discord повідомлення підтягнуто",
        message: text(data.warning) || "Редактор заповнено даними з повідомлення.",
      });
    } catch (error) {
      if ((error as DOMException)?.name === "AbortError") return;
      const errorMessage = dashboardErrorMessage(error, "Не вдалося підтягнути Discord-повідомлення.");
      setMessageLoadState("error");
      setMessageLoadText(errorMessage);
      dispatchDashboardToast({ tone: "error", title: "Discord повідомлення не підтягнуто", message: errorMessage });
    }
  }

  useEffect(() => {
    const rawLink = normalizeMessageLink(messageLink);
    if (!rawLink) {
      setMessageLoadState("idle");
      setMessageLoadText("");
      return;
    }

    if (rawLink === lastLoadedMessageLinkRef.current) return;

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
  }, [messageLink, mode, ruleType, isRules, isRaidRules]);

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
    const submitMessage = effectiveSubmitAction === "edit"
      ? isRaidRules ? "Оновлюємо повідомлення з правилами рейду..." : isRules ? "Оновлюємо підтягнуте повідомлення з правилами..." : "Оновлюємо підтягнуте Discord-повідомлення..."
      : isRaidRules ? "Публікуємо нові правила рейду..." : isRules ? "Публікуємо нові правила Discord..." : "Публікуємо новий Discord embed...";
    setMessageLoadText(submitMessage);
    dispatchDashboardToast({
      tone: "info",
      title: effectiveSubmitAction === "edit" ? "Оновлюємо Discord повідомлення" : "Публікуємо Discord повідомлення",
      message: submitMessage,
      ttl: 4200,
    });
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
  const selectedRoleIdSet = new Set(uniqueIds(roleIds));
  const selectedMentionRoles = !isRules ? roles.filter((role) => selectedRoleIdSet.has(role.id)) : [];
  const selectedRolesCount = selectedRoleIdSet.size;
  const isValid = hasVisibleEmbedContent(embed) && Boolean(normalizedColor);
  const title = isRaidRules ? "Редактор правил рейду" : isRules ? "Редактор правил" : "Редактор embed";
  const actionLabel = effectiveSubmitAction === "edit"
    ? hasLoadedEditableMessage && editorMode !== "edit" ? "Оновити підтягнуте повідомлення" : editorMode !== "edit" ? "Оновити повідомлення за link" : "Зберегти зміни"
    : isRaidRules ? "Опублікувати правила рейду" : isRules ? "Опублікувати правила" : "Опублікувати embed";

  function updateColorFromText(value: string) {
    setColorHex(value.startsWith("#") ? value : `#${value}`);
  }

  return (
    <div className="discord-builder-shell discord-builder-shell--site">
      <section className="discord-builder-panel panel" aria-label={title}>
        <div className="discord-builder-titlebar">
          <span>{isRaidRules ? "Raid rules" : isRules ? "Rules" : "General"} embed</span>
          <small>{isValid ? "Валідно" : "Потрібен контент"}</small>
        </div>
        <div className="discord-builder-body">
          <div className="discord-builder-head">
            <div>
              <span className="eyebrow">{isRules ? "Правила" : "Звичайний embed"} • {editorMode === "edit" ? "Редагування" : "Створення"}</span>
              <h2>{title}</h2>
              <p>{isRaidRules ? "Канал, embed і кнопка підпису з перевіркою авторизації та main-персонажа." : isRules ? "Канал, embed і ролі для кнопки прийняття правил." : "Канал, embed, теги ролей і редагування за message link."}</p>
            </div>
            <span className="discord-mode-pill">{effectiveSubmitAction === "edit" ? hasLoadedEditableMessage && editorMode !== "edit" ? "Редагуємо підтягнуте" : editorMode !== "edit" ? "Редагуємо за link" : "Редагування" : "Створення"}</span>
          </div>

          <form className={isSubmitting ? "discord-builder-form is-submitting" : "discord-builder-form"} method="post" action="/api/discord/embeds/publish" data-toast-managed="true" onSubmit={handleSubmit}>
            <input type="hidden" name="mode" value={mode} />
            <input type="hidden" name="ruleType" value={ruleType} />
            <input type="hidden" name="returnTo" value={returnTo} />
            <input type="hidden" name="action" value={effectiveSubmitAction} />
            <input type="hidden" name="messageLink" value={messageLink} />
            <input type="hidden" name="embedJson" value={generatedEmbedJson} />

            <div className="content-form-section discord-visual-section discord-visual-section--edit">
              <div className="content-form-section-head">
                <strong>Редагування</strong>
                <small>Message link потрібен тільки для оновлення існуючого повідомлення.</small>
              </div>
              <div className="discord-edit-grid">
                <div className="content-field discord-message-link-field">
                  <span>Discord message link</span>
                  <div className="discord-message-link-row">
                    <input
                      className="input"
                      value={messageLink}
                      placeholder="https://discord.com/channels/.../.../..."
                      readOnly={isSubmitting}
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
                    <small className="discord-message-load-note discord-message-load-note--error" role="alert">Невалідний Discord message link.</small>
                  ) : messageLoadText ? (
                    <small className={`discord-message-load-note discord-message-load-note--${messageLoadState}`} role={messageLoadState === "error" ? "alert" : "status"}>{messageLoadText}</small>
                  ) : hasMessageLinkEditTarget ? (
                    <small className="discord-message-load-note discord-message-load-note--loaded" role="status">Буде оновлено повідомлення за цим link.</small>
                  ) : (
                    <small>Залиш порожнім, щоб створити нове повідомлення.</small>
                  )}
                </div>
              </div>
            </div>

            <div className="content-form-section discord-visual-section discord-visual-section--send">
              <div className="content-form-section-head">
                <strong>Відправка</strong>
                <small>Канал, текст над embed, колір і timestamp.</small>
              </div>
              <div className="discord-send-layout">
                <div className="discord-send-controls">
                  <label className="content-field discord-channel-field">
                    <span>Канал</span>
                    <select className="select modern-select" name="channelId" value={channelId} onChange={(event) => setChannelId(event.currentTarget.value)} required>
                      {channels.map((channel) => (
                        <option key={channel.id} value={channel.id}># {channel.name}{channel.type === 5 ? " • announcement" : ""}</option>
                      ))}
                    </select>
                  </label>

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

                  <label className="content-field discord-color-code-field">
                    <span>Код кольору</span>
                    <input
                      className="input discord-color-code"
                      value={colorHex}
                      placeholder="#B8E986"
                      maxLength={7}
                      onChange={(event) => updateColorFromText(event.currentTarget.value)}
                    />
                    <small className={normalizedColor ? undefined : "discord-json-error"}>{normalizedColor ? "HEX #RRGGBB" : "Невалідний HEX. Потрібно #RRGGBB."}</small>
                  </label>

                  <label className="inline-check discord-inline-check discord-timestamp-check">
                    <input type="checkbox" checked={timestampEnabled} onChange={(event) => setTimestampEnabled(event.currentTarget.checked)} />
                    <span>Додати timestamp</span>
                  </label>
                </div>

                <label className="content-field discord-content-field discord-content-field--full">
                  <span>Текст над embed</span>
                  <textarea
                    className="input textarea compact discord-builder-textarea"
                    name="content"
                    value={content}
                    maxLength={2000}
                    placeholder="Необовʼязковий текст над embed"
                    onChange={(event) => setContent(event.currentTarget.value)}
                  />
                  <small>{content.length}/2000</small>
                </label>
              </div>
            </div>

            <div className="content-form-section discord-visual-section discord-visual-section--accent">
              <div className="content-form-section-head">
                <strong>Основний embed</strong>
                <small>Заголовок, опис і URL.</small>
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
                <span>Опис</span>
                <textarea className="input textarea markdown-area discord-description-area" value={descriptionValue} maxLength={4096} placeholder="Discord Markdown: **жирний**, *курсив*, __підкреслення__, ~~закреслення~~, > цитата, `код`, [посилання](https://...)" onChange={(event) => setDescriptionValue(event.currentTarget.value)} />
                <small>{descriptionValue.length}/4096</small>
              </label>
            </div>

            <div className="content-form-section discord-visual-section">
              <div className="content-form-section-head">
                <strong>Медіа</strong>
                <small>Thumbnail або велике image.</small>
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
                <strong>Author / footer</strong>
                <small>Автор і підпис.</small>
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
                <strong>Поля</strong>
                <small>До 25. Порожні не відправляються.</small>
              </div>
              <EmbedFieldEditor fields={fields} onChange={setFields} />
            </div>

            {!isRules && roles.length > 0 ? (
              <div className="content-form-section discord-visual-section discord-visual-section--roles">
                <div className="content-form-section-head">
                  <strong>Теги ролей</strong>
                  <small>Вибрано: {selectedRolesCount}</small>
                </div>
                <RolePicker
                  roles={roles}
                  selectedRoleIds={roleIds}
                  onChange={setRoleIds}
                  ariaLabel="Ролі для згадки в Discord-повідомленні"
                  emptyLabel="Без тегів ролей"
                  helperText="Ролі додаються над embed; ping дозволений тільки для них."
                />
              </div>
            ) : null}

            {isRules && !isRaidRules ? (
              <div className="content-form-section discord-visual-section discord-visual-section--roles">
                <div className="content-form-section-head">
                  <strong>Ролі для кнопки “Прийняти правила”</strong>
                  <small>Вибрано: {selectedRolesCount}</small>
                </div>
                <RolePicker
                  roles={roles}
                  selectedRoleIds={roleIds}
                  onChange={setRoleIds}
                  ariaLabel="Ролі для кнопки прийняття правил"
                  helperText="Видаються після натискання кнопки прийняття правил."
                />
              </div>
            ) : null}

            {isRaidRules ? (
              <div className="content-form-section discord-visual-section discord-visual-section--raid-rules">
                <div className="content-form-section-head">
                  <strong>Кнопка підпису на рейд</strong>
                  <small>Без видачі ролей</small>
                </div>
                <div className="discord-raid-rules-hint">
                  <strong>Що буде після натискання:</strong> бот перевірить Discord-профіль у панелі, знайде main-персонажа і запише користувача у список підписантів. Якщо профілю або main немає — покаже посилання на авторизацію.
                </div>
              </div>
            ) : null}

            <div className="discord-builder-actions">
              <a className="btn subtle" href={returnTo || (isRules ? "/discord/rules" : "/discord")}>Скасувати</a>
              <button className="btn primary" type="submit" disabled={!isValid || hasInvalidMessageLink || isSubmitting || messageLoadState === "loading"} aria-busy={isSubmitting} title={!isValid ? "Додай title, description, image, thumbnail або field та валідний HEX колір." : hasInvalidMessageLink ? "Виправ Discord message link або очисти поле." : undefined}>{isSubmitting ? "Виконуємо..." : actionLabel}</button>
            </div>
          </form>
        </div>
      </section>

      <DiscordPreview embed={embed} content={content} isValid={isValid} mentionRoles={selectedMentionRoles} />
    </div>
  );
}
