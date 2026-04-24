import DashboardIdentity from "@/components/DashboardIdentity";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ContentPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await getSession();
  if (!user) redirect("/login");

  const params = await searchParams;
  const isAdmin = user.role === "admin";

  return (
    <main className="container">
      <section className="dashboard-shell content-shell" aria-label="Публікація матеріалів Mistblossom Vanguard">
        <DashboardIdentity user={user} />
        <header className="content-hero panel">
          <div>
            <div className="eyebrow">Mistblossom Vanguard • Content panel</div>
            <h1>Новини та гайди</h1>
            <p className="lead">Створюй матеріали для основного сайту, завантажуй обкладинки в правильний розділ і публікуй Markdown напряму в репозиторій.</p>
          </div>
          <div className="content-role-card">
            <span>Автор</span>
            <strong>{user.name}</strong>
            <small>Береться з Discord-імені</small>
          </div>
        </header>
      </section>

      {params.published ? <div className="notice panel success">Опубліковано файл: <strong>{params.published}</strong></div> : null}
      {params.error ? <div className="notice panel error-note">{params.error}</div> : null}

      {!isAdmin ? (
        <div className="notice panel">Ця сторінка доступна тільки адміністраторам. Модератори можуть працювати із заявками, але не публікувати новини або гайди.</div>
      ) : (
        <section className="content-grid">
          <form className="content-form panel" method="post" action="/api/content/create" encType="multipart/form-data">
            <div className="form-row two">
              <label>
                <span>Тип матеріалу</span>
                <select className="select" name="kind" defaultValue="news" required>
                  <option value="news">Новина</option>
                  <option value="guides">Гайд</option>
                </select>
              </label>
              <label>
                <span>Slug</span>
                <input className="input" name="slug" placeholder="можна залишити порожнім" />
              </label>
            </div>

            <label>
              <span>Заголовок</span>
              <input className="input" name="title" placeholder="Наприклад: Новий рейдовий розклад" minLength={3} required />
            </label>

            <label>
              <span>Короткий опис</span>
              <textarea className="input textarea compact" name="description" placeholder="Короткий SEO-опис для картки та сторінки матеріалу" minLength={12} required />
            </label>

            <div className="form-row two">
              <label>
                <span>Категорії</span>
                <input className="input" name="categories" placeholder="WoW Midnight, Рейд" />
              </label>
              <label>
                <span>Теги</span>
                <input className="input" name="tags" placeholder="Mistblossom, Raid, Guide" />
              </label>
            </div>

            <label>
              <span>Обкладинка</span>
              <input className="input file-input" type="file" name="image" accept="image/png,image/jpeg,image/webp,image/gif" />
              <small>Файл піде в <code>assets/img-content</code>, а шлях автоматично запишеться у frontmatter.</small>
            </label>

            <label>
              <span>Текст Markdown</span>
              <textarea className="input textarea markdown-area" name="body" placeholder="## Вступ&#10;&#10;Основний текст матеріалу..." minLength={20} required />
            </label>

            <button className="btn primary content-submit" type="submit">Опублікувати на сайт</button>
          </form>

          <aside className="content-help panel">
            <h2>Як це працює</h2>
            <ul>
              <li>Доступ має лише роль <strong>admin</strong>.</li>
              <li>Автор автоматично береться з Discord-імені.</li>
              <li>Новини створюються в <code>_news</code>.</li>
              <li>Гайди створюються в <code>_guides</code>.</li>
              <li>Картинки завантажуються в <code>assets/img-content</code>.</li>
              <li>Після commit GitHub Pages сам перебудує основний сайт.</li>
            </ul>
          </aside>
        </section>
      )}
    </main>
  );
}
