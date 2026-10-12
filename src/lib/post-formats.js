import { postSummary } from "./post-text.js";
export const postFormats = {
  article: "История",
  note: "Короткая запись",
  photo: "Фотопост",
  link: "Ссылка с комментарием",
};
export function postTitle(format, title, body) {
  return (
    title.trim() ||
    (format === "note" ? postSummary(body, 80) : "") ||
    "Короткая запись"
  );
}
export function postLink(value) {
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("Укажи полный адрес ссылки.");
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error("Укажи ссылку http:// или https:// без логина и пароля.");
  return url.href;
}
