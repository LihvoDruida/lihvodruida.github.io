import DashboardIdentity from "@/components/DashboardIdentity";
import { getSession } from "@/lib/auth";
import { listSiteContent } from "@/lib/content";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ContentPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await getSession();
  if (!user) redirect("/login");

  const params = await searchParams;
  const isAdmin = user.role === "admin";
  const items = isAdmin ? await listSiteContent() : [];

  return (
    <main className="container">
      <section className="dashboard-shell content-shell" aria-label="Публікація матеріалів Mistblossom Vanguard">
        <DashboardIdentity user={user} />
        <header className="content-hero panel">
          <div>
            <div className="eyebrow">Mistblossom Vanguard • Content panel</div>
            <h1>Новини та гайди</h1>
            <p className="lead">Створюй, редагуй і видаляй матеріали основного сайту. Авторство автоматично прив’язане до Discord-імені адміністратора.</p>
          </div>
          <div className="content-role-card">
            <span>Автор</span>
            <strong>{user.name}</strong>
            <small>Discord • {user.role}</small>
          </div>
        </header>
      </section>

      {params.published ? <div className="notice panel success">Опубліковано файл: <strong>{params.published}</strong></div> : null}
      {params.updated ? <div className="notice panel success">Оновлено файл: <strong>{params.updated}</strong></div> : null}
      {params.deleted ? <div className="notice panel success">Видалено файл: <strong>{params.deleted}</strong></div> : null}
      {params.error ? <div className="notice panel error-note">{params.error}</div> : null}

      {!isAdmin ? (
        <div className="notice panel">Ця сторінка доступна тільки адміністраторам. Модератори можуть працювати із заявками, але не публікувати новини або гайди.</div>
      ) : (
        <section className="content-grid content-grid--editor">
          <div className="content-main-stack">
            <form className="content-form panel" method="post" action="/api/content/create" encType="multipart/form-data">
              <div className="content-section-head">
                <div>
                  <span className="eyebrow">Create</span>
                  <h2>Новий матеріал</h2>
                </div>
                <small>Новина піде в <code>_news</code>, гайд — у <code>_guides</code>.</small>
              </div>

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

            <section className="content-list panel" aria-label="Редагування існуючих матеріалів">
              <div className="content-section-head">
                <div>
                  <span className="eyebrow">Manage</span>
                  <h2>Редагування контенту</h2>
                </div>
                <small>{items.length} матеріалів</small>
              </div>

              {items.length === 0 ? (
                <p className="content-empty">Матеріали не знайдено або GitHub API не повернув колекції.</p>
              ) : (
                <div className="content-edit-list">
                  {items.map((item) => (
                    <details className="content-edit-card" key={item.path}>
                      <summary>
                        <span className="content-kind">{item.kind === "news" ? "Новина" : "Гайд"}</span>
                        <strong>{item.title}</strong>
                        <small>{item.path}</small>
                      </summary>

                      <form className="content-edit-form" method="post" action="/api/content/update" encType="multipart/form-data">
                        <input type="hidden" name="path" value={item.path} />
                        <input type="hidden" name="existingImage" value={item.image} />

                        <div className="form-row three">
                          <label>
                            <span>Тип</span>
                            <select className="select" name="kind" defaultValue={item.kind} required>
                              <option value="news">Новина</option>
                              <option value="guides">Гайд</option>
                            </select>
                          </label>
                          <label>
                            <span>Дата</span>
                            <input className="input" type="date" name="date" defaultValue={item.date} required />
                          </label>
                          <label>
                            <span>Оновлено</span>
                            <input className="input" type="date" name="lastModifiedAt" defaultValue={new Date().toISOString().slice(0, 10)} required />
                          </label>
                        </div>

                        <div className="form-row two">
                          <label>
                            <span>Заголовок</span>
                            <input className="input" name="title" defaultValue={item.title} minLength={3} required />
                          </label>
                          <label>
                            <span>Slug</span>
                            <input className="input" name="slug" defaultValue={item.slug} required />
                          </label>
                        </div>

                        <label>
                          <span>Опис</span>
                          <textarea className="input textarea compact" name="description" defaultValue={item.description} minLength={12} required />
                        </label>

                        <div className="form-row two">
                          <label>
                            <span>Категорії</span>
                            <input className="input" name="categories" defaultValue={item.categories} />
                          </label>
                          <label>
                            <span>Теги</span>
                            <input className="input" name="tags" defaultValue={item.tags} />
                          </label>
                        </div>

                        <div className="form-row two">
                          <label>
                            <span>Автор</span>
                            <input className="input" name="author" defaultValue={item.author || user.name} />
                            <small>Можна виправити старі матеріали, за замовчуванням використовується Discord-ім’я.</small>
                          </label>
                          <label>
                            <span>Поточна обкладинка</span>
                            <input className="input" name="imagePathPreview" defaultValue={item.image} readOnly />
                          </label>
                        </div>

                        <label>
                          <span>Замінити обкладинку</span>
                          <input className="input file-input" type="file" name="image" accept="image/png,image/jpeg,image/webp,image/gif" />
                        </label>

                        <label className="inline-check">
                          <input type="checkbox" name="removeImage" value="1" />
                          <span>Прибрати обкладинку і поставити placeholder</span>
                        </label>

                        <label>
                          <span>Markdown</span>
                          <textarea className="input textarea markdown-area" name="body" defaultValue={item.body} minLength={20} required />
                        </label>

                        <div className="content-actions-row">
                          <button className="btn primary" type="submit">Зберегти зміни</button>
                        </div>
                      </form>

                      <form className="content-delete-form" method="post" action="/api/content/delete">
                        <input type="hidden" name="path" value={item.path} />
                        <button className="btn danger" type="submit">Видалити матеріал</button>
                        <small>Видаляє Markdown-файл з репозиторію. Картинка не видаляється, щоб не зламати інші матеріали.</small>
                      </form>
                    </details>
                  ))}
                </div>
              )}
            </section>
          </div>

          <aside className="content-help panel">
            <h2>Можна редагувати</h2>
            <ul>
              <li>тип: новина або гайд;</li>
              <li>заголовок, slug, опис, дату;</li>
              <li>категорії, теги, автора;</li>
              <li>обкладинку або placeholder;</li>
              <li>повний Markdown-текст;</li>
              <li>видалення Markdown-файлу.</li>
            </ul>
          </aside>
        </section>
      )}
    </main>
  );
}
