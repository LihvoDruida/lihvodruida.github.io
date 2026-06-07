import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const sourcePath = path.join(root, "docs/shared/environment-variables.json");
const vars = JSON.parse(await fs.readFile(sourcePath, "utf8"));

function render(lang) {
  const isUa = lang === "ua";
  const title = isUa ? "# Змінні середовища" : "# Environment Variables";
  const intro = isUa
    ? "Цей файл генерується з `docs/shared/environment-variables.json`. Не редагуй таблицю вручну."
    : "This file is generated from `docs/shared/environment-variables.json`. Do not edit the table manually.";
  const header = isUa ? "| Назва | Обовʼязкова | Область | Опис |" : "| Name | Required | Scope | Description |";
  const separator = "|---|---:|---|---|";
  const rows = vars.map((item) => {
    const required = item.required ? (isUa ? "так" : "yes") : (isUa ? "ні" : "no");
    const description = isUa ? item.description_ua : item.description_en;
    return `| \`${item.name}\` | ${required} | ${item.scope} | ${description} |`;
  });
  return [title, "", intro, "", header, separator, ...rows, ""].join("\n");
}

await fs.writeFile(path.join(root, "docs/en/VARIABLES.md"), render("en"));
await fs.writeFile(path.join(root, "docs/ua/VARIABLES.md"), render("ua"));
console.log("Generated docs/en/VARIABLES.md and docs/ua/VARIABLES.md");
