const key = "kaban-feed-return";
const read = () => {
  try {
    return JSON.parse(sessionStorage.getItem(key) || "null");
  } catch {
    return null;
  }
};
function valid(item) {
  return (
    item &&
    typeof item.source === "string" &&
    /^\/(?:$|blog\/|tags\/|archive\/|world\/)/.test(item.source) &&
    !item.source.startsWith("//") &&
    typeof item.target === "string" &&
    /^\/blog\/[^/]+\/$/.test(item.target) &&
    Number.isFinite(item.y) &&
    item.y >= 0 &&
    Date.now() - item.time < 1800000
  );
}
document.addEventListener(
  "click",
  (event) => {
    if (
      !(event.target instanceof Element) ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    const link = event.target.closest("a");
    if (!link) return;
    if (link.hasAttribute("data-return-feed")) return;
    if (!link.closest(".note-preview") || link.target === "_blank") return;
    const target = new URL(link.href, location.href);
    if (
      target.origin !== location.origin ||
      !/^\/blog\/[^/]+\/$/.test(target.pathname)
    )
      return;
    try {
      sessionStorage.setItem(
        key,
        JSON.stringify({
          source: location.pathname + location.search,
          target: target.pathname,
          y: window.scrollY,
          time: Date.now(),
        }),
      );
    } catch {}
  },
  true,
);
function initializeReturn() {
  const item = read();
  if (!valid(item)) return;
  if (location.pathname === item.target) {
    const back = document.querySelector(".blog-post-heading .back-to-notes");
    if (back) {
      back.setAttribute(
        "href",
        item.source +
          "#" +
          encodeURIComponent("feed-" + item.target.split("/")[2]),
      );
      back.setAttribute("data-return-feed", "");
      back.textContent = "← К списку записей";
    }
  }
}
initializeReturn();
document.addEventListener("astro:page-load", initializeReturn);
