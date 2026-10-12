export function shelfView(value) {
  return value === "list" ? "list" : "covers";
}
export function initializeShelves() {
  document.querySelectorAll("[data-shelf]").forEach((root) => {
    if (root.dataset.ready) return;
    root.dataset.ready = "true";
    root.querySelector(".shelf-controls").hidden = false;
    const setView = (value) => {
      root.dataset.view = shelfView(value);
      root
        .querySelectorAll("[data-shelf-view]")
        .forEach((button) =>
          button.setAttribute(
            "aria-pressed",
            String(button.dataset.shelfView === root.dataset.view),
          ),
        );
    };
    try {
      setView(localStorage.getItem("kaban-shelf-view"));
    } catch {
      setView("covers");
    }
    root.addEventListener("click", (event) => {
      const button = event.target.closest("button");
      if (!button) return;
      if (button.hasAttribute("data-shelf-view")) {
        setView(button.dataset.shelfView);
        try {
          localStorage.setItem("kaban-shelf-view", root.dataset.view);
        } catch {}
      }
      if (button.hasAttribute("data-shelf-filter")) {
        const status = button.dataset.shelfFilter;
        let count = 0;
        root.querySelectorAll("[data-shelf-status]").forEach((item) => {
          item.hidden = !!status && item.dataset.shelfStatus !== status;
          if (!item.hidden) count++;
        });
        root
          .querySelectorAll("[data-shelf-filter]")
          .forEach((option) =>
            option.setAttribute("aria-pressed", String(option === button)),
          );
        const message = root.querySelector(".shelf-filter-status");
        message.hidden = false;
        message.textContent = `Показано: ${count}`;
      }
    });
    root.querySelectorAll("[data-external-cover]").forEach((image) => {
      const failed = () => {
        if (image.dataset.failed) return;
        image.dataset.failed = "true";
        image.hidden = true;
        const label = document.createElement("div");
        label.className = "shelf-cover-type";
        label.textContent = image.closest("a").querySelector("h2").textContent;
        image.after(label);
      };
      image.addEventListener("error", failed, { once: true });
      if (image.complete && !image.naturalWidth) failed();
    });
  });
}
