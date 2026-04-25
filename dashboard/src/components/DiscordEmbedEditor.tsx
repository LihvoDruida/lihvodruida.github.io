"use client";

import { useMemo, useState } from "react";

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

function safeParseEmbed(value: string) {
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { embed: null, error: "Embed має бути JSON-обʼєктом, не масивом." };
    }
    return { embed: parsed as EmbedObject, error: "" };
  } catch (error) {
    return { embed: null, error: error instanceof Error ? error.message : "JSON parse error" };
  }
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function urlFrom(value: unknown) {
  if (!value || typeof value !== "object") return "";
  return text((value as Record<string, unknown>).url);
}

function normalizeMarkdownLine(line: string) {
  return line.replace(/\*\*(.*?)\*\*/g, "$1").replace(/__(.*?)__/g, "$1").trim();
}

function MarkdownPreview({ value }: { value: string }) {
  const lines = value.split("\n").slice(0, 80);

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

function DiscordPreview({ embed, content }: { embed: EmbedObject | null; content: string }) {
  const color = typeof embed?.color === "number" ? `#${Math.max(0, Math.min(0xffffff, embed.color)).toString(16).padStart(6, "0")}` : "#95f28c";
  const author = embed?.author && typeof embed.author === "object" ? embed.author as Record<string, unknown> : null;
  const footer = embed?.footer && typeof embed.footer === "object" ? embed.footer as Record<string, unknown> : null;
  const fields = Array.isArray(embed?.fields) ? embed?.fields.slice(0, 25) : [];
  const thumbnail = urlFrom(embed?.thumbnail);
  const image = urlFrom(embed?.image);

  return (
    <aside className="discord-preview-panel" aria-label="Preview Discord embed">
      <div className="discord-preview-titlebar">Preview</div>
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
        {embed ? null : <div className="discord-preview-error">JSON preview недоступний: виправ помилку в embed.</div>}
      </div>
    </aside>
  );
}

function RolePicker({ roles, selectedRoleIds, onChange }: {
  roles: DiscordRoleOption[];
  selectedRoleIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const selected = new Set(selectedRoleIds);

  return (
    <div className="discord-role-picker">
      <div className="discord-role-selected" aria-label="Вибрані ролі">
        {selectedRoleIds.length === 0 ? <span className="discord-role-placeholder">Select option</span> : null}
        {roles.filter((role) => selected.has(role.id)).map((role) => (
          <span className="discord-role-chip" key={role.id}>● {role.name}</span>
        ))}
      </div>
      <select
        className="select modern-select discord-role-native"
        name="roleIds"
        multiple
        size={Math.min(Math.max(roles.length, 6), 12)}
        value={selectedRoleIds}
        onChange={(event) => onChange(Array.from(event.currentTarget.selectedOptions, (option) => option.value))}
        required
      >
        {roles.map((role) => (
          <option key={role.id} value={role.id}>🌿 {role.name}</option>
        ))}
      </select>
      <small>Ctrl/⌘ + клік дозволяє вибрати кілька ролей. Discord видасть лише ролі нижче ролі бота.</small>
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
  const [embedJson, setEmbedJson] = useState(defaultEmbedJson);
  const [content, setContent] = useState(defaultContent);
  const [channelId, setChannelId] = useState(suggestedChannelId || channels[0]?.id || "");
  const [messageLink, setMessageLink] = useState(defaultMessageLink);
  const [roleIds, setRoleIds] = useState(selectedRoleIds);
  const parsed = useMemo(() => safeParseEmbed(embedJson), [embedJson]);
  const isRules = mode === "rules";
  const title = isRules ? "Rules embed builder" : "Embed builder";
  const actionLabel = editorMode === "edit" ? "Зберегти зміни" : isRules ? "Опублікувати правила" : "Опублікувати embed";

  return (
    <div className="discord-builder-shell">
      <section className="discord-builder-panel" aria-label={title}>
        <div className="discord-builder-titlebar">▧ Embed</div>
        <div className="discord-builder-body">
          <div className="discord-builder-head">
            <div>
              <span className="eyebrow">{isRules ? "Rules" : "General"} • {editorMode === "edit" ? "Edit" : "Create"}</span>
              <h2>{title}</h2>
            </div>
            <div className="discord-builder-tabs" aria-hidden="true">
              <span className="is-active">{editorMode === "edit" ? "Edit Embed" : "Create Embed"}</span>
            </div>
          </div>

          <form className="discord-builder-form" method="post" action="/api/discord/embeds/publish">
            <input type="hidden" name="mode" value={mode} />
            <input type="hidden" name="returnTo" value={returnTo} />
            <input type="hidden" name="action" value={editorMode === "edit" ? "edit" : "publish"} />

            <label className="content-field content-field--wide">
              <span>Normal text sent with the embed</span>
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

            <div className="discord-builder-card discord-builder-card--accent">
              <label className="content-field content-field--wide">
                <span>Embed JSON</span>
                <textarea
                  className="input textarea markdown-area discord-json-code"
                  name="embedJson"
                  value={embedJson}
                  minLength={20}
                  required
                  spellCheck={false}
                  onChange={(event) => setEmbedJson(event.currentTarget.value)}
                />
                <small className={parsed.error ? "discord-json-error" : undefined}>{parsed.error || `${embedJson.length}/6000+ символів JSON`}</small>
              </label>
            </div>

            <div className="discord-builder-grid">
              <label className="content-field">
                <span>Destination</span>
                <select className="select modern-select" name="channelId" value={channelId} onChange={(event) => setChannelId(event.currentTarget.value)} required>
                  {channels.map((channel) => (
                    <option key={channel.id} value={channel.id}># {channel.name}{channel.type === 5 ? " • announcement" : ""}</option>
                  ))}
                </select>
              </label>

              <label className="content-field">
                <span>Message link for edit</span>
                <input
                  className="input"
                  name="messageLink"
                  value={messageLink}
                  placeholder="https://discord.com/channels/.../.../..."
                  onChange={(event) => setMessageLink(event.currentTarget.value)}
                />
              </label>
            </div>

            {isRules ? (
              <div className="discord-builder-card discord-builder-card--roles">
                <div className="content-form-section-head">
                  <strong>Ролі для кнопки “Прийняти”</strong>
                  <small>Можна вибрати одну або кілька ролей. Внизу залишено саме те, чого бракувало у попередній версії редактора.</small>
                </div>
                <RolePicker roles={roles} selectedRoleIds={roleIds} onChange={setRoleIds} />
              </div>
            ) : null}

            <div className="discord-builder-actions">
              <a className="btn subtle" href={isRules ? "/discord/rules" : "/discord"}>Скасувати</a>
              <button className="btn primary" type="submit" disabled={Boolean(parsed.error)}>{actionLabel}</button>
            </div>
          </form>
        </div>
      </section>

      <DiscordPreview embed={parsed.embed} content={content} />
    </div>
  );
}
