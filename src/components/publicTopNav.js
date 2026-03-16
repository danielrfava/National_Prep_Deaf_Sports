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

  host.innerHTML = `
    <div class="topbar-container">
      <a class="brand" href="${basePath}index.html" aria-label="National Prep Deaf Sports home">
        <div class="logo">NP</div>
        <div class="brand-text">
          <div class="brand-title">National Prep Deaf Sports</div>
          <div class="brand-tag">Deaf High School Athletics</div>
        </div>
      </a>

      <nav class="nav public-nav" aria-label="Primary">
        ${NAV_ITEMS.map((item) => {
          const isActive = item.key === active;
          return `<a class="nav-link${isActive ? " nav-link-active" : ""}" data-nav-key="${item.key}" href="${basePath}${item.href}"${isActive ? ' aria-current="page"' : ""}>${item.label}</a>`;
        }).join("")}
      </nav>
    </div>
  `;

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
