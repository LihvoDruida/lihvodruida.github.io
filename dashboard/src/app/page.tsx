import { isAuthenticated } from "@/src/lib/auth";
import { listApplications, updateApplicationStatus } from "@/src/lib/github";
import { STATUS, StatusKey } from "@/src/lib/status";
import { redirect } from "next/navigation";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("uk-UA", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function StatusBadge({ status }: { status: StatusKey }) {
  return <span className={`badge ${status}`}>{STATUS[status].label}</span>;
}

async function setStatus(formData: FormData) {
  "use server";
  const issueNumber = Number(formData.get("issueNumber") || 0);
  const status = String(formData.get("status") || "") as StatusKey;
  if (!Number.isInteger(issueNumber) || issueNumber <= 0) return;
  if (status !== "accepted" && status !== "declined") return;
  if (!(await isAuthenticated())) return;
  await updateApplicationStatus(issueNumber, status, "Dashboard");
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (!(await isAuthenticated())) redirect("/login");
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
      <header className="header">
        <div>
          <div className="eyebrow">Secure dashboard</div>
          <h1>Заявки до гільдії</h1>
          <p className="lead">Безпечна панель для перегляду, фільтрації та швидкого рішення по заявках. GitHub token працює тільки на сервері.</p>
        </div>
        <form method="post" action="/api/auth/logout"><button className="btn" type="submit">Вийти</button></form>
      </header>

      <section className="stats">
        <div className="stat panel"><strong>{counts.all}</strong><span>Всього</span></div>
        <div className="stat panel"><strong>{counts.review}</strong><span>На розгляді</span></div>
        <div className="stat panel"><strong>{counts.accepted}</strong><span>Прийнято</span></div>
        <div className="stat panel"><strong>{counts.declined}</strong><span>Відхилено</span></div>
      </section>

      <form className="toolbar panel">
        <input className="input" name="q" placeholder="Пошук: персонаж, realm, клас..." defaultValue={params.q || ""} />
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
        <button className="btn" type="submit" style={{ background: "var(--brand)" }}>Фільтрувати</button>
      </form>

      <section className="grid">
        {items.length ? items.map((item) => (
          <article className={`card panel ${item.status_key}`} key={item.number}>
            <div>
              <h2>#{item.number} • {item.character_name || item.title}</h2>
              <div className="meta">
                <StatusBadge status={item.status_key} />
                <span>{item.realm || "Realm не вказано"}</span>
                <span>{item.class_name || "Клас не вказано"}</span>
                <span>{item.faction || "Фракція не вказана"}</span>
                <span>{formatDate(item.created_at)}</span>
                <a href={item.html_url} target="_blank" rel="noreferrer">GitHub Issue</a>
              </div>
              <p className="lead" style={{ marginTop: 12 }}>{item.summary || "Деталі заявки відсутні"}</p>
            </div>
            <div className="actions">
              <form action={setStatus}>
                <input type="hidden" name="issueNumber" value={item.number} />
                <input type="hidden" name="status" value="accepted" />
                <button className="btn accept" type="submit" disabled={item.status_key !== "review"}>Прийняти</button>
              </form>
              <form action={setStatus}>
                <input type="hidden" name="issueNumber" value={item.number} />
                <input type="hidden" name="status" value="declined" />
                <button className="btn decline" type="submit" disabled={item.status_key !== "review"}>Відхилити</button>
              </form>
            </div>
          </article>
        )) : <div className="empty panel">Заявок за цими фільтрами немає.</div>}
      </section>
    </main>
  );
}
