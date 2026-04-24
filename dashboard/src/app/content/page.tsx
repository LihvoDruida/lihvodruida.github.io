import DashboardIdentity from "@/components/DashboardIdentity";
import { getSession } from "@/lib/auth";
import { listSiteContent, type SiteContentItem } from "@/lib/content";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function contentTypeLabel(kind: SiteContentItem["kind"]) {
  return kind === "news" ? "Новина" : "Гайд";
}

function editHref(path: string) {
  return `/content?edit=${encodeURIComponent(path)}`;
}

function CreateContentForm({ author }: { author: string }) {
  return (
    <form className="content-form panel content-editor-panel" method="post" action="/api/content/create" encType="multipart/form-data">
      <div className="content-section-head">
        <div>
          <span className="eyebrow">Create</span>
          <h2>Новий матеріал</h2>
        </div>
        <a className="btn subtle" href="/content">До списку</a>
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
        <span>Автор</span>
        <input className="input" name="authorPreview" value={author} readOnly />
        <small>Авторство береться з Discord-імені адміністратора.</small>
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
  );
}

function EditContentForm({ item, author }: { item: SiteContentItem; author: string }) {
  return (
    <section className="panel content-editor-panel" aria-label={`Редагування: ${item.title}`}>
      <form className="content-edit-form content-edit-form--standalone" method="post" action="/api/content/update" encType="multipart/form-data">
        <input type="hidden" name="path" value={item.path} />
        <input type="hidden" name="existingImage" value={item.image} />

        <div className="content-section-head">
          <div>
            <span className="eyebrow">Edit • {contentTypeLabel(item.kind)}</span>
            <h2>{item.title}</h2>
            <small>{item.path}</small>
          </div>
          <a className="btn subtle" href="/content">До списку</a>
        </div>

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
            <input className="input" name="author" defaultValue={item.author || author} />
            <small>Для нових матеріалів автор береться з Discord-імені. Тут можна виправити старі записи.</small>
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

      <form className="content-delete-form content-delete-form--standalone" method="post" action="/api/content/delete">
        <input type="hidden" name="path" value={item.path} />
        <button className="btn danger" type="submit">Видалити матеріал</button>
        <small>Видаляє Markdown-файл з репозиторію. Картинка не видаляється, щоб не зламати інші матеріали.</small>
      </form>
    </section>
  );
}

export default async function ContentPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await getSession();
  if (!user) redirect("/login");

  const params = await searchParams;
  const isAdmin = user.role === "admin";
  const items = isAdmin ? await listSiteContent() : [];
  const selectedItem = params.edit ? items.find((item) => item.path === params.edit) : undefined;
  const isCreateMode = params.new === "1" || params.action === "new";
  const showEditor = isCreateMode || selectedItem;

  return (
    <main className="container">
      <section className="dashboard-shell content-shell" aria-label="Публікація матеріалів Mistblossom Vanguard">
        <DashboardIdentity user={user} />
        <header className="content-hero panel content-hero--list">
          <div>
            <div className="eyebrow">Mistblossom Vanguard • Content panel</div>
            <h1>Матеріали сайту</h1>
            <p className="lead">Список новин і гайдів основного сайту. Вибери матеріал для редагування або створи новий.</p>
          </div>
          {isAdmin ? <a className="btn primary content-add-btn" href="/content?new=1">Додати матеріал</a> : null}
        </header>
      </section>

      {params.published ? <div className="notice panel success">Опубліковано файл: <strong>{params.published}</strong></div> : null}
      {params.updated ? <div className="notice panel success">Оновлено файл: <strong>{params.updated}</strong></div> : null}
      {params.deleted ? <div className="notice panel success">Видалено файл: <strong>{params.deleted}</strong></div> : null}
      {params.error ? <div className="notice panel error-note">{params.error}</div> : null}
      {params.edit && !selectedItem ? <div className="notice panel error-note">Матеріал не знайдено: <strong>{params.edit}</strong></div> : null}

      {!isAdmin ? (
        <div className="notice panel">Ця сторінка доступна тільки адміністраторам. Модератори можуть працювати із заявками, але не публікувати новини або гайди.</div>
      ) : (
        <section className="content-page-stack">
          {showEditor ? (
            isCreateMode ? <CreateContentForm author={user.name} /> : selectedItem ? <EditContentForm item={selectedItem} author={user.name} /> : null
          ) : null}

          <section className="content-list panel content-list--page" aria-label="Список матеріалів сайту">
            <div className="content-section-head content-section-head--toolbar">
              <div>
                <span className="eyebrow">Content library</span>
                <h2>Список матеріалів</h2>
              </div>
              <div className="content-toolbar-actions">
                <small>{items.length} матеріалів</small>
                <a className="btn primary" href="/content?new=1">Додати матеріал</a>
              </div>
            </div>

            {items.length === 0 ? (
              <p className="content-empty">Матеріали не знайдено або GitHub API не повернув колекції.</p>
            ) : (
              <div className="content-table" role="list">
                {items.map((item) => {
                  const active = selectedItem?.path === item.path;
                  return (
                    <article className={`content-row${active ? " is-active" : ""}`} key={item.path} role="listitem">
                      <a className="content-row-main" href={editHref(item.path)} aria-current={active ? "page" : undefined}>
                        <span className="content-kind">{contentTypeLabel(item.kind)}</span>
                        <span className="content-row-title">
                          <strong>{item.title}</strong>
                          <small>{item.path}</small>
                        </span>
                        <span className="content-row-meta">
                          <time dateTime={item.date}>{item.date || "Без дати"}</time>
                          <small>{item.author || "Без автора"}</small>
                        </span>
                      </a>

                      <div className="content-row-actions">
                        <a className="btn subtle" href={editHref(item.path)}>Редагувати</a>
                        <form method="post" action="/api/content/delete">
                          <input type="hidden" name="path" value={item.path} />
                          <button className="btn danger" type="submit">Видалити</button>
                        </form>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </section>
      )}
    </main>
  );
}
