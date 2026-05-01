const resolveAppOrigin = () => {
  if (window.location.protocol === "http:" || window.location.protocol === "https:") {
    localStorage.setItem("appOrigin", window.location.origin);
    return window.location.origin;
  }

  return localStorage.getItem("appOrigin") || "http://localhost:5001";
};

const APP_ORIGIN = resolveAppOrigin();
const APP_API_BASE = `${APP_ORIGIN}/api`;

const getSessionToken = () => localStorage.getItem("token");
const getSessionUser = () => JSON.parse(localStorage.getItem("user") || "null");
const isAdminUser = (user) => user?.role === "admin" || user?.role === "superadmin";

const initialsFromName = (name = "Supporter") =>
  String(name)
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

const avatarMarkup = (user, className = "nav-avatar") =>
  user?.profilePhoto
    ? `<img class="${className}" src="${user.profilePhoto}" alt="${user.name || "User"}" />`
    : `<div class="${className} avatar-fallback">${initialsFromName(user?.name || "Supporter")}</div>`;

const navLink = (href, label) => `<a href="${href}">${label}</a>`;
const adminEntryLink = (user) => (user?.role === "superadmin" ? "/superadmin/dashboard" : "/admin/dashboard");

const profileDropdownMarkup = (user) => {
  const isSuperAdmin = user?.role === "superadmin";
  const isAdmin = user?.role === "admin";
  const links = isSuperAdmin
    ? [
        ["/superadmin/dashboard", "Dashboard"],
        ["/superadmin/admins", "Manage Admins"],
        ["/superadmin/users", "Users"],
        ["/superadmin/settings", "Settings"],
      ]
    : isAdmin
      ? [
          ["/admin/dashboard", "Dashboard"],
          ["/admin/campaigns", "Manage Campaigns"],
          ["/admin/reports", "Reports"],
          ["/admin/settings", "Settings"],
        ]
      : [
          ["dashboard.html", "Open Dashboard"],
          ["updates.html", "Updates"],
          ["profile.html", "Profile"],
          ["documents.html", "Tax & Documents"],
          ["subscriptions.html", "Subscriptions"],
          ["privacy.html", "Privacy"],
          ["notifications.html", "Notifications"],
          ["security.html", "Security"],
        ];

  return `
    <div class="nav-profile-menu">
      <button class="nav-profile-trigger" type="button" data-profile-trigger>
        ${avatarMarkup(user)}
        <span>${user?.name || "Dashboard"}</span>
        <span class="nav-profile-caret" aria-hidden="true">v</span>
      </button>
      <div class="nav-profile-dropdown">
        <div class="nav-profile-summary">
          ${avatarMarkup(user, "nav-avatar nav-avatar-lg")}
          <div>
            <strong>${user?.name || "Supporter"}</strong>
            <p>${user?.email || ""}</p>
          </div>
        </div>
        ${links.map(([href, label]) => `<a href="${href}">${label}</a>`).join("")}
        <button class="nav-logout nav-dropdown-logout" type="button" data-logout-button>Logout</button>
      </div>
    </div>
  `;
};

const renderNav = async () => {
  const navNodes = document.querySelectorAll("[data-app-nav]");
  if (!navNodes.length) return;

  const token = getSessionToken();
  const user = getSessionUser();

  navNodes.forEach((nav) => {
    if (token && user) {
      nav.innerHTML = `
        ${navLink("index.html", "Home")}
        ${navLink("campaigns.html", "Campaign List")}
        ${navLink("index.html#totalImpactSection", "Total Impact")}
        ${navLink("index.html#liveFeedSection", "Live Donation Feed")}
        ${isAdminUser(user) ? navLink(adminEntryLink(user), user?.role === "superadmin" ? "SuperAdmin" : "Admin") : ""}
        ${profileDropdownMarkup(user)}
      `;
      return;
    }

    nav.innerHTML = `
      ${navLink("index.html", "Home")}
      ${navLink("campaigns.html", "Campaign List")}
      ${navLink("login.html", "Login")}
      ${navLink("register.html", "Register")}
    `;
  });

  document.querySelectorAll("[data-logout-button]").forEach((button) => {
    button.addEventListener("click", () => {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      window.location.href = "login.html";
    });
  });

  document.querySelectorAll("[data-profile-trigger]").forEach((button) => {
    button.addEventListener("click", () => {
      button.closest(".nav-profile-menu")?.classList.toggle("is-open");
    });
  });
};

const refreshSessionUser = async () => {
  const token = getSessionToken();
  if (!token) return null;

  try {
    const response = await fetch(`${APP_API_BASE}/auth/me`, {
      headers: { Authorization: token },
    });
    const data = await response.json();
    if (!response.ok || !data.user) return null;
    localStorage.setItem("user", JSON.stringify(data.user));
    return data.user;
  } catch (error) {
    return null;
  }
};

window.appSession = {
  origin: APP_ORIGIN,
  apiBase: APP_API_BASE,
  getToken: getSessionToken,
  getUser: getSessionUser,
  initialsFromName,
  avatarMarkup,
  refreshSessionUser,
  renderNav,
};

renderNav();
