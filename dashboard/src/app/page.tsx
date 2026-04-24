import { canModerate, getSessionUser, isAuthenticated } from "@/src/lib/auth";
import { ApplicationItem, listApplications, updateApplicationStatus } from "@/src/lib/github";
import { STATUS, StatusKey } from "@/src/lib/status";
import { redirect } from "next/navigation";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("uk-UA", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function formatScore(value: unknown) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return "—";
  return Number.isInteger(num) ? String(num) : num.toFixed(1);
}

function StatusBadge({ status }: { status: StatusKey }) {
  const icon = status === "accepted" ? "●" : status === "declined" ? "●" : "●";
  return <span className={`badge ${status}`}><span>{icon}</span>{STATUS[status].label}</span>;
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return <span className="mini-metric"><strong>{value}</strong><small>{label}</small></span>;
}

function RaiderIoPanel({ item }: { item: ApplicationItem }) {
  const rio = item.raider_io;
  const current = rio?.mythic_plus?.current || {};
  const previous = rio?.mythic_plus?.previous || {};
  const currentRaids = rio?.raids?.current || [];
  const previousRaids = rio?.raids?.previous || [];

  return (
    <div className="rio-panel">
      <div className="section-title">Raider.IO</div>
      {item.raider_io_error ? <p className="hint warning">{item.raider_io_error}</p> : null}
      <div className="metric-grid">
        <MiniMetric label="M+ current" value={formatScore(current.all)} />
        <MiniMetric label="Хіл" value={formatScore(current.healer)} />
        <MiniMetric label="DPS" value={formatScore(current.dps)} />
        <MiniMetric label="Танк" value={formatScore(current.tank)} />
        <MiniMetric label="M+ previous" value={formatScore(previous.all)} />
      </div>
      <div className="raid-grid">
        <div>
          <strong>Рейди current</strong>
          {currentRaids.length ? currentRaids.map((raid) => <span key={raid}>{raid}</span>) : <span>Дані відсутні</span>}
        </div>
        <div>
          <strong>Рейди previous</strong>
          {previousRaids.length ? previousRaids.map((raid) => <span key={raid}>{raid}</span>) : <span>Дані відсутні</span>}
        </div>
      </div>
      {rio?.profile_url ? <a className="rio-link" href={rio.profile_url} target="_blank" rel="noreferrer">Відкрити Raider.IO</a> : null}
    </div>
  );
}

async function setStatus(formData: FormData) {
  "use server";
  const issueNumber = Number(formData.get("issueNumber") || 0);
  const status = String(formData.get("status") || "") as StatusKey;
  if (!Number.isInteger(issueNumber) || issueNumber <= 0) return;
  if (status !== "accepted" && status !== "declined") return;
  if (!(await isAuthenticated())) return;
  const user = await getSessionUser();
  if (!canModerate(user)) return;
  await updateApplicationStatus(issueNumber, status, user?.name || user?.login || "Dashboard");
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (!(await isAuthenticated())) redirect("/login");
  const user = await getSessionUser();
  const mayModerate = canModerate(user);
  const params = await searchParams;
  const urlParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) urlParams.set(key, value);
  const items = await listApplications(urlParams);
  const counts = {
    all: items.length,
    review: items.filter((item) => item.status_key === "review").length,
    accepted: items.filter((item) => item.status_key === "accepted").length,
    declined: items.filter((item) => item.status_key === "declined").length
  };
  const classOptions = Array.from(new Set(items.map((item) => item.class_name).filter(Boolean))).sort();

  return (
    <main className="container">
      <header className="hero panel">
        <div className="hero-copy">
          <div className="eyebrow">Mistblossom Vanguard • Secure dashboard</div>
          <h1>Заявки до гільдії</h1>
          <p className="lead">Модеруй заявки, дивись Raider.IO, рейдовий прогрес і ключові дані персонажа в одному місці. Секрети та GitHub token залишаються тільки на сервері.</p>
        </div>
        <div className="admin-card">
          {user?.avatar_url ? <img src={user.avatar_url} alt="" /> : <div className="avatar-fallback">{(user?.name || user?.login || "A").charAt(0)}</div>}
          <div>
            <strong>{user?.name || user?.login}</strong>
            <span>{user?.provider} • {user?.role || "unauthorized"}</span>
          </div>
          <form method="post" action="/api/auth/logout"><button className="btn ghost" type="submit">Вийти</button></form>
        </div>
      </header>

      <section className="stats">
        <div className="stat panel"><strong>{counts.all}</strong><span>Всього</span></div>
        <div className="stat panel review"><strong>{counts.review}</strong><span>На розгляді</span></div>
        <div className="stat panel accepted"><strong>{counts.accepted}</strong><span>Прийнято</span></div>
        <div className="stat panel declined"><strong>{counts.declined}</strong><span>Відхилено</span></div>
      </section>

      <form className="toolbar panel">
        <input className="input" name="q" placeholder="Пошук: персонаж, realm, клас, джерело, доступність..." defaultValue={params.q || ""} />
        <select className="select" name="status" defaultValue={params.status || "all"}>
          <option value="all">Усі статуси</option>
          <option value="review">На розгляді</option>
          <option value="accepted">Прийнято</option>
          <option value="declined">Відхилено</option>
        </select>
        <select className="select" name="class" defaultValue={params.class || "all"}>
          <option value="all">Усі класи</option>
          {classOptions.map((className) => <option key={className} value={className}>{className}</option>)}
        </select>
        <select className="select" name="sort" defaultValue={params.sort || "created"}>
          <option value="created">За датою</option>
          <option value="updated">За оновленням</option>
        </select>
        <button className="btn primary" type="submit">Фільтрувати</button>
      </form>

      {!mayModerate ? <div className="notice panel">Твій акаунт має роль unauthorized: перегляд доступний, рішення по заявках вимкнені. Попроси адміна додати твою Discord роль у Moderator або Admin role IDs.</div> : null}

      <section className="grid">
        {items.length ? items.map((item) => (
          <article className={`card panel ${item.status_key}`} key={item.number}>
            <div className="card-main">
              <div className="character-head">
                {item.raider_io?.thumbnail_url ? <img className="character-avatar" src={item.raider_io.thumbnail_url} alt="" /> : <div className="character-avatar placeholder">{(item.character_name || "?").charAt(0)}</div>}
                <div>
                  <h2>#{item.number} • {item.character_name || item.title}</h2>
                  <div className="meta">
                    <StatusBadge status={item.status_key} />
                    <span>{item.region || "Region?"}</span>
                    <span>{item.realm || "Realm не вказано"}</span>
                    <span>{item.class_name || "Клас не вказано"}</span>
                    <span>{item.faction || "Фракція не вказана"}</span>
                    <span>{formatDate(item.created_at)}</span>
                    <a href={item.html_url} target="_blank" rel="noreferrer">GitHub Issue</a>
                  </div>
                </div>
              </div>

              <div className="details-grid">
                <div className="detail-box"><span>Звідки дізнався</span><strong>{item.source || "Не вказано"}</strong></div>
                <div className="detail-box"><span>Коли грає</span><strong>{item.availability || "Не вказано"}</strong></div>
              </div>

              <RaiderIoPanel item={item} />
            </div>

            <aside className="actions-panel">
              <StatusBadge status={item.status_key} />
              <div className="action-stack">
                <form action={setStatus}>
                  <input type="hidden" name="issueNumber" value={item.number} />
                  <input type="hidden" name="status" value="accepted" />
                  <button className="btn accept" type="submit" disabled={!mayModerate || item.status_key !== "review"}>Прийняти</button>
                </form>
                <form action={setStatus}>
                  <input type="hidden" name="issueNumber" value={item.number} />
                  <input type="hidden" name="status" value="declined" />
                  <button className="btn decline" type="submit" disabled={!mayModerate || item.status_key !== "review"}>Відхилити</button>
                </form>
              </div>
              <small>{item.state === "closed" ? "Issue закрито" : "Issue відкрито"}</small>
            </aside>
          </article>
        )) : <div className="empty panel">Заявок за цими фільтрами немає.</div>}
      </section>
    </main>
  );
}
