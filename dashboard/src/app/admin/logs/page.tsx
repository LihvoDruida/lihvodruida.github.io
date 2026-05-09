import { redirect } from "next/navigation";
import DashboardIdentity from "@/components/DashboardIdentity";
import AdminTabs from "@/components/AdminTabs";
import { buildPageMetadata } from "@/lib/seo";
import { getSession } from "@/lib/auth";
import { listAdminAuditLogs } from "@/lib/accessGroups";
import { canViewAdminLogs } from "@/lib/permissions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = buildPageMetadata({
  title: "Журнал дій",
  description: "Останні адміністративні дії Mistblossom, результати Discord API та помилки.",
  path: "/admin/logs",
  keywords: ["журнал", "адмін", "Discord", "помилки"],
});

function cleanLimit(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 50;
  return Math.max(10, Math.min(100, Math.floor(number)));
}

function formatDate(value?: string | null) {
  if (!value) return "щойно";
  try {
    return new Intl.DateTimeFormat("uk-UA", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function statusLabel(status: string) {
  if (status === "success") return "Успішно";
  if (status === "warning") return "Попередження";
  if (status === "error") return "Помилка";
  return "Інфо";
}

function detailsJson(details: Record<string, unknown>) {
  try {
    return JSON.stringify(details, null, 2);
  } catch {
    return "{}";
  }
}

export default async function AdminLogsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await getSession();
  if (!user) { redirect("/login"); throw new Error("Login required"); }
  if (!canViewAdminLogs(user)) {
    redirect(user.profileId ? `/profile/${user.profileId}` : "/profile");
    throw new Error("Access denied");
  }

  const params = await searchParams;
  const limit = cleanLimit(params.limit);
  const logs = await listAdminAuditLogs(limit);
  const failed = logs.filter((item) => item.status === "error").length;
  const warnings = logs.filter((item) => item.status === "warning").length;

  return (
    <main className="container admin-container">
      <section className="dashboard-shell content-shell admin-page admin-logs-page" aria-label="Журнал адміністративних дій">
        <DashboardIdentity user={user} activeSection="admin" />
        <header className="hero panel admin-hero">
          <div>
            <span className="eyebrow">Адміністрування</span>
            <h1>Журнал дій</h1>
            <p>Останні адміністративні дії, Discord-операції, результати та помилки. Зберігаються останні 100 записів.</p>
          </div>
          <div className="hero-actions">
            <span className="status-pill">Записів: {logs.length}</span>
            {warnings ? <span className="status-pill warning">Попереджень: {warnings}</span> : null}
            {failed ? <span className="status-pill danger">Помилок: {failed}</span> : null}
          </div>
        </header>

        <AdminTabs active="logs" />

        <section className="panel admin-log-toolbar" aria-label="Параметри журналу">
          <form className="admin-log-limit-form" method="get">
            <label className="field-label">Кількість дій для показу
              <input className="input" type="number" name="limit" min="10" max="100" defaultValue={limit} />
              <small>Можна показати від 10 до 100 останніх дій.</small>
            </label>
            <button className="btn subtle" type="submit">Оновити журнал</button>
          </form>
        </section>

        <section className="admin-log-list" aria-label="Останні дії">
          {logs.length ? logs.map((item) => (
            <article className={`panel admin-log-row admin-log-row--${item.status}`} key={item.id}>
              <div className="admin-log-row__head">
                <span className={`admin-log-status admin-log-status--${item.status}`}>{statusLabel(item.status)}</span>
                <strong>{item.action}</strong>
                <time dateTime={item.createdAt || undefined}>{formatDate(item.createdAt)}</time>
              </div>
              <p>{item.summary || "Дію виконано."}</p>
              <div className="admin-log-meta">
                <span>Автор: <strong>{item.actorName || item.actorId || "невідомо"}</strong></span>
                {item.actorGroupId ? <span>Група: <strong>{item.actorGroupId}</strong></span> : null}
                {item.isServerOwner ? <span>Власник сервера</span> : null}
              </div>
              <details className="admin-log-details">
                <summary>Технічні деталі</summary>
                <pre>{detailsJson(item.details)}</pre>
              </details>
            </article>
          )) : (
            <article className="panel admin-log-row admin-log-row--info">
              <strong>Журнал порожній</strong>
              <p>Після першої адмін-дії тут зʼявиться запис із результатом.</p>
            </article>
          )}
        </section>
      </section>
    </main>
  );
}
