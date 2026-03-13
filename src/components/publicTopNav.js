const NAV_ITEMS = [
  { key: "search", label: "Search", href: "search.html" },
  { key: "schools", label: "Schools", href: "schools.html" },
  { key: "research", label: "Research", href: "stats.html" },
  { key: "about", label: "About", href: "about.html" },
  { key: "login", label: "Log In", href: "portal/login.html" },
];

export function mountPublicTopNav(options = {}) {
  const { active = "search", landing = false, basePath = "" } = options;
  const host = document.querySelector("[data-public-nav]");
  if (!host) {
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
}
