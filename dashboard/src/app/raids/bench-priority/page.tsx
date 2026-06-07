import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canManageRaids } from "@/lib/permissions";
import { getOwnProfilePath } from "@/lib/profiles";
import { loadStoredGuildRosterData } from "@/lib/guildRoster";
import {
  getRaidBenchPrioritySettings,
  hasRaidStorage,
} from "@/lib/raids";
import { RaidPageShell, StatusNotice } from "@/components/RaidViews";
import { buildPageMetadata } from "@/lib/seo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = buildPageMetadata({
  title: "Сірий список рейдів",
  description:
    "Глобальний список персонажів, які поступаються місцем у рейдовому складі та переходять на лаву запасних при вичерпанні лімітів.",
  path: "/raids/bench-priority",
  keywords: ["сірий список рейдів", "лава запасних", "рейдовий склад"],
});

function memberLabel(member: {
  name: string;
  realmName?: string | null;
  realmSlug?: string | null;
  className?: string | null;
  specName?: string | null;
  itemLevel?: number | null;
}) {
  return [
    member.name,
    member.realmName || member.realmSlug || null,
    member.className || null,
    member.specName || null,
    member.itemLevel ? `${member.itemLevel} ilvl` : null,
  ]
    .filter(Boolean)
    .join(" • ");
}

export default async function RaidBenchPriorityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await getSession();
  if (!user) {
    redirect("/login");
    throw new Error("Login required");
  }
  if (!canManageRaids(user)) redirect(await getOwnProfilePath(user));

  const params = await searchParams;
  const [settings, roster] = await Promise.all([
    getRaidBenchPrioritySettings({ bypassCache: true }).catch(() => null),
    loadStoredGuildRosterData().catch(() => null),
  ]);
  const selectedKeys = new Set(settings?.characterKeys || []);
  const rosterMembers = (roster?.members || [])
    .filter((member) => member.key && member.name)
    .sort((a, b) =>
      a.name.localeCompare(b.name, "uk") ||
      String(a.realmName || a.realmSlug).localeCompare(
        String(b.realmName || b.realmSlug),
        "uk",
      ),
    );
  const selectedMembers = rosterMembers.filter((member) =>
    selectedKeys.has(member.key),
  );
  const missingSelectedKeys = (settings?.characterKeys || []).filter(
    (key) => !rosterMembers.some((member) => member.key === key),
  );

  return (
    <RaidPageShell
      user={user}
      title="Сірий список рейдів"
      description="Глобальна лава пріоритету: ці персонажі не видаляються із запису, але при заповненому ліміті першими поступаються місцем і переходять у лаву запасних."
    >
      <StatusNotice params={params} />
      {!hasRaidStorage() ? (
        <div className="notice panel error-note raid-notice">
          Збереження сірого списку тимчасово недоступне: Firebase не відповідає
          або не налаштований.
        </div>
      ) : null}

      <section className="panel raid-list-page-panel raid-greylist-panel">
        <div className="raid-list-page-head raid-greylist-head">
          <div>
            <h2>Глобальні правила лави запасних</h2>
            <p>
              Список застосовується до всіх рейдів. Коли `maxPlayers` уже
              заповнений, звичайний учасник може зайняти місце, а персонаж із
              цього списку піде на лаву запасних. Якщо місць вистачає — він
              залишається у складі.
            </p>
            <div className="raid-list-summary">
              <span>Зі складу: {settings?.characterKeys.length || 0}</span>
              <span>Вручну: {settings?.manualNames.length || 0}</span>
              <span>{settings?.enabled === false ? "Вимкнено" : "Увімкнено"}</span>
            </div>
          </div>
          <a className="btn subtle" href="/raids">
            ← До рейдів
          </a>
        </div>

        <form
          className="raid-greylist-form"
          action="/api/raids/bench-priority"
          method="post"
        >
          <label className="raid-checkbox-line raid-greylist-enabled">
            <input
              type="checkbox"
              name="enabled"
              value="1"
              defaultChecked={settings?.enabled !== false}
            />
            <span>
              Увімкнути глобальний сірий список для автоматичного складу рейдів
            </span>
          </label>

          <div className="raid-greylist-layout">
            <section className="raid-greylist-box">
              <div className="raid-greylist-box-head">
                <strong>Вибір зі складу гільдії</strong>
                <small>{rosterMembers.length} персонажів у локальному складі</small>
              </div>
              {roster?.error ? (
                <div className="notice warning-note raid-notice">
                  Склад гільдії прочитано з попередженням: {roster.error}
                </div>
              ) : null}
              <div className="raid-greylist-roster">
                {rosterMembers.length ? (
                  rosterMembers.map((member) => (
                    <label className="raid-greylist-member" key={member.key}>
                      <input
                        type="checkbox"
                        name="characterKeys"
                        value={member.key}
                        defaultChecked={selectedKeys.has(member.key)}
                      />
                      {member.avatarUrl ? (
                        <img
                          src={member.avatarUrl}
                          alt=""
                          width={34}
                          height={34}
                          loading="lazy"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <span className="raid-greylist-avatar" aria-hidden="true">
                          {member.name.charAt(0)}
                        </span>
                      )}
                      <span>
                        <strong>{member.name}</strong>
                        <small>{memberLabel(member)}</small>
                      </span>
                    </label>
                  ))
                ) : (
                  <p className="raid-empty">
                    Немає збереженого складу гільдії. Запусти синхронізацію
                    складу або додай ніки вручну праворуч.
                  </p>
                )}
              </div>
            </section>

            <section className="raid-greylist-box">
              <div className="raid-greylist-box-head">
                <strong>Ручні ніки</strong>
                <small>Один нік на рядок або через кому</small>
              </div>
              <textarea
                className="input textarea raid-greylist-manual"
                name="manualNames"
                rows={14}
                placeholder={"Forchun\nKhayen-Terokkar\nІмʼя персонажа"}
                defaultValue={(settings?.manualNames || []).join("\n")}
              />
              <p className="raid-form-hint">
                Ручний запис матчиться за ніком персонажа, `Name-Realm` або
                `Name Realm`. Це потрібно для персонажів, яких ще немає у
                складі гільдії або які додані вручну.
              </p>

              <div className="raid-greylist-selected">
                <strong>Зараз у списку</strong>
                {selectedMembers.length || settings?.manualNames.length ? (
                  <ul>
                    {selectedMembers.map((member) => (
                      <li key={`selected-${member.key}`}>{memberLabel(member)}</li>
                    ))}
                    {(settings?.manualNames || []).map((name) => (
                      <li key={`manual-${name}`}>Вручну: {name}</li>
                    ))}
                  </ul>
                ) : (
                  <p>Список порожній.</p>
                )}
                {missingSelectedKeys.length ? (
                  <div className="raid-greylist-missing">
                    <strong>Ключі, яких немає в поточному складі</strong>
                    <p className="raid-form-hint">
                      Вони ще активні. Зніми галочку, якщо треба прибрати їх
                      із сірого списку.
                    </p>
                    {missingSelectedKeys.map((key) => (
                      <label key={key} className="raid-checkbox-line">
                        <input
                          type="checkbox"
                          name="characterKeys"
                          value={key}
                          defaultChecked
                        />
                        <span>{key}</span>
                      </label>
                    ))}
                  </div>
                ) : null}
              </div>
            </section>
          </div>

          <div className="raid-form-actions raid-greylist-actions">
            <button className="btn primary" type="submit">
              Зберегти сірий список
            </button>
            <a className="btn subtle" href="/raids">
              Скасувати
            </a>
          </div>
        </form>
      </section>
    </RaidPageShell>
  );
}
