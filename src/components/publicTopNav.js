const NAV_ITEMS = [
  { key: "search", label: "Search", href: "search.html" },
  { key: "schools", label: "Schools", href: "schools.html" },
  { key: "research", label: "Research", href: "stats.html" },
  { key: "about", label: "About", href: "about.html" },
  { key: "login", label: "Log In", href: "portal/login.html" },
];

const FOOTER_ITEMS = [
  { key: "about", label: "About", href: "about.html" },
  { key: "privacy", label: "Privacy Policy", href: "privacy.html" },
  { key: "terms", label: "Terms of Use", href: "terms.html" },
  { key: "disclaimer", label: "Data Accuracy Disclaimer", href: "disclaimer.html" },
  { key: "ownership", label: "Ownership & Use", href: "ownership.html" },
  { key: "contact", label: "Contact", href: "contact.html" },
];

function wireResponsiveNav(host) {
  const toggle = host.querySelector("[data-public-nav-toggle]");
  const overlayRoot = document.querySelector("[data-public-nav-overlay-root]");
  const backdrop = overlayRoot?.querySelector("[data-public-nav-backdrop]");
  const closeButton = overlayRoot?.querySelector("[data-public-nav-close]");
  const flyoutShell = overlayRoot?.querySelector("[data-public-nav-flyout-shell]");
  const flyout = overlayRoot?.querySelector("[data-public-nav-flyout]");
  const flyoutLinks = overlayRoot?.querySelector("[data-public-nav-flyout-links]");
  const root = document.documentElement;
  let backdropHideTimer = null;

  if (!toggle || !flyout || !flyoutShell || !backdrop || !flyoutLinks) {
    return;
  }

  const clearBackdropTimer = () => {
    if (backdropHideTimer) {
      window.clearTimeout(backdropHideTimer);
      backdropHideTimer = null;
    }
  };

  const setOpen = (isOpen) => {
    clearBackdropTimer();
    if (isOpen) {
      backdrop.hidden = false;
    }

    toggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
    flyout.setAttribute("aria-hidden", isOpen ? "false" : "true");
    flyoutShell.setAttribute("aria-hidden", isOpen ? "false" : "true");
    backdrop.setAttribute("aria-hidden", isOpen ? "false" : "true");
    flyoutShell.classList.toggle("is-open", isOpen);
    flyout.classList.toggle("is-open", isOpen);
    backdrop.classList.toggle("is-open", isOpen);
    host.classList.toggle("is-nav-open", isOpen);
    root.classList.toggle("public-nav-open", isOpen);
    document.body.classList.toggle("public-nav-open", isOpen);

    if (!isOpen) {
      backdropHideTimer = window.setTimeout(() => {
        backdrop.hidden = true;
        backdropHideTimer = null;
      }, 180);
    }
  };

  setOpen(false);

  const openMenu = () => {
    setOpen(true);
    window.requestAnimationFrame(() => {
      closeButton?.focus({ preventScroll: true });
    });
  };

  const closeMenu = (restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) {
      toggle.focus({ preventScroll: true });
    }
  };

  toggle.addEventListener("click", () => {
    const isOpen = toggle.getAttribute("aria-expanded") === "true";
    if (isOpen) {
      closeMenu();
      return;
    }

    openMenu();
  });

  closeButton?.addEventListener("click", () => closeMenu(true));
  backdrop.addEventListener("click", () => closeMenu(true));

  flyoutLinks.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => closeMenu());
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeMenu(true);
    }
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 768) {
      closeMenu();
    }
  });

  window.addEventListener("popstate", () => closeMenu());
  window.addEventListener("pagehide", () => setOpen(false));
}

export function mountPublicTopNav(options = {}) {
  const { active = "search", footerActive = active, landing = false, basePath = "" } = options;
  const host = document.querySelector("[data-public-nav]");
  const footerHost = document.querySelector("[data-public-footer]");

  if (!host) {
    if (footerHost) {
      mountPublicFooter(footerHost, footerActive, basePath);
    }
    return;
  }

  host.className = landing ? "topbar public-topbar landing-topbar" : "topbar public-topbar";
  const menuId = "publicNavMenu";
  let overlayRoot = document.querySelector("[data-public-nav-overlay-root]");

  if (!overlayRoot) {
    overlayRoot = document.createElement("div");
    overlayRoot.setAttribute("data-public-nav-overlay-root", "");
    document.body.appendChild(overlayRoot);
  }

  host.innerHTML = `
    <div class="topbar-container">
      <a class="brand" href="${basePath}index.html" aria-label="National Prep Deaf Sports home">
        <div class="logo">NP</div>
        <div class="brand-text">
          <div class="brand-title">National Prep Deaf Sports</div>
          <div class="brand-tag">Deaf High School Athletics</div>
        </div>
      </a>

      <button
        class="public-nav-toggle"
        type="button"
        aria-expanded="false"
        aria-controls="${menuId}"
        aria-haspopup="dialog"
        data-public-nav-toggle
      >
        <span class="sr-only">Toggle navigation</span>
        <span></span>
        <span></span>
        <span></span>
      </button>

      <nav class="nav public-nav public-nav-desktop" aria-label="Primary">
        ${NAV_ITEMS.map((item) => {
          const isActive = item.key === active;
          return `<a class="nav-link${isActive ? " nav-link-active" : ""}" data-nav-key="${item.key}" href="${basePath}${item.href}"${isActive ? ' aria-current="page"' : ""}>${item.label}</a>`;
        }).join("")}
      </nav>
    </div>
  `;

  overlayRoot.className = "public-nav-overlay-root";
  overlayRoot.innerHTML = `
    <div class="public-nav-backdrop" data-public-nav-backdrop hidden></div>

    <div class="public-nav-flyout-shell" data-public-nav-flyout-shell aria-hidden="true">
      <nav
        class="public-nav-flyout"
        id="${menuId}"
        aria-label="Primary"
        aria-hidden="true"
        data-public-nav-flyout
      >
        <div class="public-nav-panel-head">
          <div>
            <p class="public-nav-panel-kicker">Menu</p>
            <p class="public-nav-panel-title">National Prep Deaf Sports</p>
          </div>
          <button class="public-nav-close" type="button" data-public-nav-close>
            <span class="sr-only">Close navigation</span>
            <span aria-hidden="true">+</span>
          </button>
        </div>
        <div class="public-nav-flyout-links" data-public-nav-flyout-links>
          ${NAV_ITEMS.map((item) => {
            const isActive = item.key === active;
            return `<a class="nav-link public-nav-flyout-link${isActive ? " nav-link-active" : ""}" data-nav-key="${item.key}" href="${basePath}${item.href}"${isActive ? ' aria-current="page"' : ""}>${item.label}</a>`;
          }).join("")}
        </div>
      </nav>
    </div>
  `;

  wireResponsiveNav(host);

  if (footerHost) {
    mountPublicFooter(footerHost, footerActive, basePath);
  }
}

function mountPublicFooter(host, active = "", basePath = "") {
  host.className = "public-footer";
  host.innerHTML = `
    <div class="public-footer-shell">
      <div class="public-footer-brand">
        <p class="public-footer-title">&copy; National Prep Deaf Sports</p>
        <p class="public-footer-copy">Independent preservation and publishing platform for Deaf high school athletics.</p>
      </div>

      <nav class="public-footer-links" aria-label="Trust and legal">
        ${FOOTER_ITEMS.map((item) => {
          const isActive = item.key === active;
          return `<a class="public-footer-link${isActive ? " is-active" : ""}" href="${basePath}${item.href}"${isActive ? ' aria-current="page"' : ""}>${item.label}</a>`;
        }).join("")}
      </nav>
    </div>
  `;
}
