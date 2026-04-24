import { githubFetch } from "@/lib/github";
import type { DashboardSession } from "@/lib/auth";

export type ContentKind = "news" | "guides";

export type CreateContentInput = {
  kind: ContentKind;
  title: string;
  description: string;
  body: string;
  categories: string;
  tags: string;
  slug?: string;
  image?: File | null;
  author: string;
  user: DashboardSession;
};

const MAX_IMAGE_SIZE = 8 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export function isContentKind(value: string): value is ContentKind {
  return value === "news" || value === "guides";
}

export function slugify(value: string) {
  const translit: Record<string, string> = {
    а: "a", б: "b", в: "v", г: "h", ґ: "g", д: "d", е: "e", є: "ie", ж: "zh", з: "z", и: "y", і: "i", ї: "i", й: "i", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch", ь: "", ю: "iu", я: "ia",
  };

  return String(value || "")
    .trim()
    .toLowerCase()
    .split("")
    .map((char) => translit[char] ?? char)
    .join("")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
}

function yamlScalar(value: string) {
  return JSON.stringify(String(value || "").replace(/\r\n/g, "\n"));
}

function yamlList(value: string, fallback: string) {
  const items = String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  const normalized = items.length ? items : [fallback];
  return `[${normalized.map(yamlScalar).join(", ")}]`;
}

function normalizeMarkdown(value: string) {
  return String(value || "").replace(/\r\n/g, "\n").trim();
}

function normalizeAuthor(value: string, user: DashboardSession) {
  return String(value || user.name || user.login || "Mistblossom Admin").trim();
}

function githubBranch() {
  return process.env.GITHUB_CONTENT_BRANCH || process.env.GITHUB_BRANCH || "main";
}

function toBase64(content: string | Buffer) {
  return Buffer.isBuffer(content) ? content.toString("base64") : Buffer.from(content, "utf8").toString("base64");
}

async function getExistingSha(path: string): Promise<string | undefined> {
  try {
    const data = await githubFetch(`/contents/${encodeURIComponentPath(path)}?ref=${encodeURIComponent(githubBranch())}`);
    return typeof data?.sha === "string" ? data.sha : undefined;
  } catch (error) {
    const message = String((error as Error)?.message || error || "").toLowerCase();
    if (message.includes("not found")) return undefined;
    throw error;
  }
}

function encodeURIComponentPath(path: string) {
  return path.split("/").map(encodeURIComponent).join("/");
}

export async function putRepoFile(path: string, content: string | Buffer, message: string) {
  const sha = await getExistingSha(path);
  return githubFetch(`/contents/${encodeURIComponentPath(path)}`, {
    method: "PUT",
    body: JSON.stringify({
      message,
      content: toBase64(content),
      branch: githubBranch(),
      ...(sha ? { sha } : {}),
    }),
  });
}

async function saveImage(slug: string, file: File | null | undefined, message: string) {
  if (!file || file.size <= 0) return null;

  const ext = ALLOWED_IMAGE_TYPES[file.type];
  if (!ext) throw new Error("Підтримуються лише JPG, PNG, WEBP або GIF.");
  if (file.size > MAX_IMAGE_SIZE) throw new Error("Картинка завелика. Максимум 8 MB.");

  const buffer = Buffer.from(await file.arrayBuffer());
  const imagePath = `assets/img-content/${slug}.${ext}`;
  await putRepoFile(imagePath, buffer, message);
  return `/${imagePath}`;
}

export async function createSiteContent(input: CreateContentInput) {
  if (input.user.role !== "admin") {
    throw new Error("Створювати новини та гайди може лише адміністратор.");
  }

  const title = input.title.trim();
  const description = input.description.trim();
  const body = normalizeMarkdown(input.body);
  const slug = slugify(input.slug || title);
  const author = normalizeAuthor(input.author, input.user);
  const today = new Date().toISOString().slice(0, 10);

  if (!isContentKind(input.kind)) throw new Error("Невідомий тип матеріалу.");
  if (title.length < 3) throw new Error("Заголовок занадто короткий.");
  if (description.length < 12) throw new Error("Опис занадто короткий.");
  if (body.length < 20) throw new Error("Текст матеріалу занадто короткий.");
  if (!slug) throw new Error("Не вдалося створити slug.");

  const message = `content: publish ${input.kind === "news" ? "news" : "guide"} ${slug}`;
  const imagePath = await saveImage(slug, input.image, message);
  const collection = input.kind === "news" ? "_news" : "_guides";
  const layout = input.kind === "news" ? "news" : "guides";
  const fallbackCategory = input.kind === "news" ? "новини" : "гайди";
  const contentPath = `${collection}/${today}-${slug}.md`;

  const frontmatter = [
    "---",
    `layout: ${layout}`,
    `title: ${yamlScalar(title)}`,
    `slug: ${slug}`,
    `description: ${yamlScalar(description)}`,
    `date: ${today}`,
    `last_modified_at: ${today}`,
    `author: ${yamlScalar(author)}`,
    `categories: ${yamlList(input.categories, fallbackCategory)}`,
    `tags: ${yamlList(input.tags, fallbackCategory)}`,
    imagePath ? `image: ${imagePath}` : "image: /assets/img/news-placeholder.webp",
    "---",
    "",
  ].join("\n");

  await putRepoFile(contentPath, `${frontmatter}${body}\n`, message);

  return {
    ok: true,
    slug,
    path: contentPath,
    image: imagePath,
  };
}
