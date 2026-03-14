import { mountPublicTopNav } from "./components/publicTopNav.js";

mountPublicTopNav({ active: "about" });

const VALID_TABS = new Set(["about", "privacy", "terms", "disclaimer", "ownership"]);
const tabButtons = Array.from(document.querySelectorAll("[data-about-tab]"));
const tabPanels = Array.from(document.querySelectorAll("[data-about-panel]"));

tabButtons.forEach((button) => {
  button.addEventListener("click", () => {
    activateAboutTab(button.dataset.aboutTab, { updateHash: true });
  });
});

window.addEventListener("hashchange", syncAboutTabFromHash);
syncAboutTabFromHash();

function syncAboutTabFromHash() {
  const nextTab = VALID_TABS.has(window.location.hash.replace(/^#/, "")) ? window.location.hash.replace(/^#/, "") : "about";
  activateAboutTab(nextTab, { updateHash: false });
}

function activateAboutTab(tabKey, { updateHash = false } = {}) {
  const safeTabKey = VALID_TABS.has(tabKey) ? tabKey : "about";

  tabButtons.forEach((button) => {
    const isActive = button.dataset.aboutTab === safeTabKey;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-selected", String(isActive));
  });

  tabPanels.forEach((panel) => {
    panel.hidden = panel.dataset.aboutPanel !== safeTabKey;
  });

  if (updateHash) {
    const nextHash = `#${safeTabKey}`;
    if (window.location.hash !== nextHash) {
      history.replaceState(null, "", nextHash);
    }
  }
}
