const API_BASE = window.appSession?.apiBase || `${window.location.origin}/api`;

const superAdminSession = {
  token: localStorage.getItem("token"),
  user: JSON.parse(localStorage.getItem("user") || "null"),
};

const pageConfig = {
  dashboard: { title: "Dashboard", subtitle: "System overview, live activity, and donation visibility." },
  admins: { title: "Admins", subtitle: "Create, search, edit, block, and remove admin accounts." },
  adminForm: { title: "Admin Form", subtitle: "Manage admin identity, login access, and permissions." },
  users: { title: "Users", subtitle: "Review donor accounts and account health." },
  marketing: { title: "Marketing Users", subtitle: "Create, edit, block, and remove marketing accounts." },
  marketingForm: { title: "Marketing Form", subtitle: "Manage marketing role access and permissions." },
  marketingActivity: { title: "Marketing Activity", subtitle: "Monitor campaign reach, messages, and marketing-side actions." },
  userDetail: { title: "User Detail", subtitle: "Profile, donation history, and subscription activity." },
  campaigns: { title: "Campaign Requests", subtitle: "Approve, reject, and monitor fundraising campaigns." },
  donations: { title: "Donations", subtitle: "Track collections, donor activity, and finance filters." },
  subscriptions: { title: "Subscriptions", subtitle: "Monitor recurring support and cancel risk cases." },
  certificates: { title: "Certificates", subtitle: "Verify 80G certificates and download records." },
  analytics: { title: "Analytics", subtitle: "Monthly donation trends, top campaigns, and user growth." },
  settings: { title: "Settings", subtitle: "Control profile, users, system configuration, and security." },
  profile: { title: "Profile", subtitle: "Update superadmin profile and password." },
  system: { title: "System Settings", subtitle: "Platform tax, templates, and global controls." },
  security: { title: "Security", subtitle: "Audit logs and suspicious admin-side actions." },
};

const navSections = [
  {
    label: "Core",
    links: [
      ["/superadmin/dashboard", "dashboard", "Dashboard"],
      ["/superadmin/admins", "admins", "Admins"],
      ["/superadmin/users", "users", "Users"],
      ["/superadmin/marketing", "marketing", "Marketing"],
      ["/superadmin/campaigns", "campaigns", "Campaigns"],
      ["/superadmin/donations", "donations", "Donations"],
      ["/superadmin/subscriptions", "subscriptions", "Subscriptions"],
      ["/superadmin/certificates", "certificates", "Certificates"],
      ["/superadmin/analytics", "analytics", "Analytics"],
      ["/superadmin/marketing/activity", "marketingActivity", "Marketing Activity"],
    ],
  },
  {
    label: "Settings",
    links: [
      ["/superadmin/settings", "settings", "Settings Home"],
      ["/superadmin/settings/profile", "profile", "Profile"],
      ["/superadmin/settings/system", "system", "System"],
      ["/superadmin/settings/security", "security", "Security"],
    ],
  },
];

const currency = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

const formatDate = (value) => (value ? new Date(value).toLocaleString("en-IN") : "Not available");
const initials = (name = "SA") =>
  String(name)
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

const params = new URLSearchParams(window.location.search);
const pathParts = window.location.pathname.split("/").filter(Boolean);

const getHeaders = (json = true) => ({
  ...(json ? { "Content-Type": "application/json" } : {}),
  ...(superAdminSession.token ? { Authorization: superAdminSession.token } : {}),
});

const showMessage = (node, message, error = false) => {
  if (!node) return;
  node.removeAttribute("hidden");
  node.textContent = message;
  node.className = `superadmin-message${error ? " is-error" : ""}`;
};

const api = async (path, options = {}) => {
  const response = await fetch(`${API_BASE}${path}`, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || "Request failed");
  }
  return data;
};

const ensureSuperAdmin = async () => {
  if (!superAdminSession.token) {
    window.location.replace("/superadmin/login");
    return false;
  }

  try {
    const data = await api("/auth/me", { headers: getHeaders(false) });
    superAdminSession.user = data.user;
    localStorage.setItem("user", JSON.stringify(data.user));
    if (data.user.role !== "superadmin") {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      window.location.replace("/superadmin/login");
      return false;
    }
    return true;
  } catch (error) {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.location.replace("/superadmin/login");
    return false;
  }
};

const renderShell = (pageKey) => {
  const mount = document.getElementById("superadminShell");
  if (!mount) return;

  const content = mount.querySelector("[data-page-content]");
  const page = pageConfig[pageKey] || pageConfig.dashboard;
  const avatar = superAdminSession.user?.profilePhoto
    ? `<img src="${superAdminSession.user.profilePhoto}" alt="${superAdminSession.user.name || "Superadmin"}" />`
    : initials(superAdminSession.user?.name || "Superadmin");

  mount.className = "superadmin-shell";
  mount.innerHTML = `
    <aside class="superadmin-sidebar">
      <a class="superadmin-brand" href="/superadmin/dashboard">
        HopeSpring
        <small>SuperAdmin Control</small>
      </a>
      ${navSections
        .map(
          (section) => `
            <div class="superadmin-nav-group">
              <h3>${section.label}</h3>
              <nav class="superadmin-nav">
                ${section.links
                  .map(
                    ([href, key, label]) =>
                      `<a class="${key === pageKey ? "is-active" : ""}" href="${href}">${label}</a>`
                  )
                  .join("")}
              </nav>
            </div>
          `
        )
        .join("")}
    </aside>
    <div class="superadmin-main">
      <div class="superadmin-topbar">
        <div class="superadmin-page-head">
          <p class="superadmin-kicker">SuperAdmin</p>
          <h1>${page.title}</h1>
          <p>${page.subtitle}</p>
        </div>
        <div class="superadmin-userbox">
          <div class="superadmin-avatar">${avatar}</div>
          <div>
            <strong>${superAdminSession.user?.name || "SuperAdmin"}</strong>
            <div class="superadmin-meta">${superAdminSession.user?.email || ""}</div>
          </div>
          <button id="superadminLogout" class="superadmin-btn-secondary" type="button">Logout</button>
        </div>
      </div>
      <div class="superadmin-page"></div>
    </div>
  `;

  mount.querySelector(".superadmin-page").appendChild(content);
  document.getElementById("superadminLogout")?.addEventListener("click", () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.location.replace("/superadmin/login");
  });
};

const statCards = (cards) =>
  cards
    .map(
      (card) => `
        <article class="superadmin-stat-card superadmin-col-3">
          <span>${card.label}</span>
          <strong>${card.value}</strong>
          <p>${card.help || ""}</p>
        </article>
      `
    )
    .join("");

const renderList = (targetId, items, renderer, emptyText = "No records found.") => {
  const target = document.getElementById(targetId);
  if (!target) return;
  target.innerHTML = items.length ? `<div class="superadmin-list">${items.map(renderer).join("")}</div>` : `<div class="superadmin-empty">${emptyText}</div>`;
};

const renderBars = (items, valueKey, labelKey, formatter = (value) => value) => {
  if (!items.length) {
    return `<div class="superadmin-empty">No chart data available.</div>`;
  }
  const max = Math.max(...items.map((item) => Number(item[valueKey] || 0)), 1);
  return `
    <div class="superadmin-chart-list">
      ${items
        .map((item) => {
          const value = Number(item[valueKey] || 0);
          const width = Math.max((value / max) * 100, 4);
          return `
            <div class="superadmin-chart-row">
              <div class="superadmin-split">
                <strong>${item[labelKey]}</strong>
                <span class="superadmin-meta">${formatter(value)}</span>
              </div>
              <div class="superadmin-bar"><span style="width:${width}%"></span></div>
            </div>
          `;
        })
        .join("")}
    </div>
  `;
};

const loadDashboard = async () => {
  const data = await api("/superadmin/dashboard", { headers: getHeaders(false) });
  const stats = document.getElementById("dashboardStats");
  if (stats) {
    stats.innerHTML = statCards([
      { label: "Total Users", value: data.totals.totalUsers, help: "Registered donor accounts" },
      { label: "Total Admins", value: data.totals.totalAdmins, help: "Operational platform admins" },
      { label: "Marketing Users", value: data.totals.totalMarketingUsers, help: "Campaign communication team" },
      { label: "Total Donations", value: currency(data.totals.totalDonationAmount), help: "Overall collection volume" },
      { label: "Active Campaigns", value: data.totals.activeCampaigns, help: `${data.totals.pendingCampaigns} waiting for review` },
      { label: "Marketing Reach", value: data.totals.marketingCampaignReach, help: `${data.totals.marketingEmailsSent} email sends tracked` },
    ]);
  }

  renderList(
    "recentDonations",
    data.recentDonations,
    (item) => `
      <article class="superadmin-list-card">
        <div class="superadmin-list-head">
          <strong>${item.donorName}</strong>
          <span class="superadmin-badge">${currency(item.amount)}</span>
        </div>
        <p>${item.campaignTitle}</p>
        <div class="superadmin-meta">${formatDate(item.createdAt)}</div>
      </article>
    `,
    "Recent donations will appear here."
  );

  renderList(
    "liveActivity",
    data.liveActivity,
    (item) => `
      <article class="superadmin-list-card">
        <div class="superadmin-list-head">
          <strong>${item.action}</strong>
          <span class="superadmin-badge status-${item.severity}">${item.severity}</span>
        </div>
        <p>${item.targetLabel || "System action"}</p>
        <div class="superadmin-meta">${formatDate(item.createdAt)}</div>
      </article>
    `,
    "Activity feed will appear after admin actions."
  );

  renderList(
    "topCampaigns",
    data.topCampaigns,
    (item) => `
      <article class="superadmin-list-card">
        <div class="superadmin-list-head">
          <strong>${item.title}</strong>
          <span class="superadmin-badge status-${item.status}">${item.status}</span>
        </div>
        <p>${currency(item.raisedAmount)} raised of ${currency(item.goalAmount)}</p>
        <div class="superadmin-meta">${item.donorCount} donors</div>
      </article>
    `,
    "Campaign metrics will appear here."
  );
};

const loadAdmins = async () => {
  const query = params.get("q") ? `?q=${encodeURIComponent(params.get("q"))}` : "";
  const admins = await api(`/superadmin/admins${query}`, { headers: getHeaders(false) });
  const searchInput = document.getElementById("adminSearch");
  if (searchInput) searchInput.value = params.get("q") || "";

  renderList(
    "adminList",
    admins,
    (admin) => `
      <article class="superadmin-list-card">
        <div class="superadmin-list-head">
          <div>
            <strong>${admin.name}</strong>
            <p>${admin.email}</p>
          </div>
          <span class="superadmin-badge status-${admin.isActive ? "active" : "blocked"}">${admin.isActive ? "active" : "blocked"}</span>
        </div>
        <div class="superadmin-meta">Permissions: ${(admin.permissions || []).join(", ") || "No explicit permissions"}</div>
        <div class="superadmin-actions">
          <a class="superadmin-btn-secondary" href="/superadmin/admins/edit/${admin.id}">Edit</a>
          <button class="superadmin-btn-secondary" type="button" data-toggle-admin="${admin.id}" data-active="${admin.isActive}">
            ${admin.isActive ? "Block" : "Unblock"}
          </button>
          <button class="superadmin-btn-danger" type="button" data-delete-admin="${admin.id}">Delete</button>
        </div>
      </article>
    `,
    "No admins found."
  );

  document.querySelectorAll("[data-toggle-admin]").forEach((button) => {
    button.addEventListener("click", async () => {
      await api(`/superadmin/users/${button.dataset.toggleAdmin}/access`, {
        method: "PUT",
        headers: getHeaders(),
        body: JSON.stringify({ isActive: button.dataset.active !== "true" }),
      });
      window.location.reload();
    });
  });

  document.querySelectorAll("[data-delete-admin]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!window.confirm("Delete this admin account?")) return;
      await api(`/superadmin/admins/${button.dataset.deleteAdmin}`, {
        method: "DELETE",
        headers: getHeaders(false),
      });
      window.location.reload();
    });
  });
};

const loadAdminForm = async () => {
  const isEdit = pathParts.includes("edit");
  const adminId = pathParts[pathParts.length - 1];
  const titleNode = document.getElementById("adminFormTitle");
  if (titleNode) {
    titleNode.textContent = isEdit ? "Edit admin account" : "Create admin account";
  }

  if (isEdit) {
    const admin = await api(`/superadmin/admins/${adminId}`, { headers: getHeaders(false) });
    document.getElementById("adminName").value = admin.name || "";
    document.getElementById("adminEmail").value = admin.email || "";
    document.getElementById("adminMobile").value = admin.mobile || "";
    document.getElementById("adminPermissions").value = (admin.permissions || []).join("\n");
    document.getElementById("adminStatus").value = admin.isActive ? "active" : "blocked";
  }

  document.getElementById("adminForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = {
      name: document.getElementById("adminName").value.trim(),
      email: document.getElementById("adminEmail").value.trim(),
      mobile: document.getElementById("adminMobile").value.trim(),
      permissions: document
        .getElementById("adminPermissions")
        .value.split("\n")
        .map((item) => item.trim())
        .filter(Boolean),
      isActive: document.getElementById("adminStatus").value === "active",
    };

    const password = document.getElementById("adminPassword").value.trim();
    if (password) payload.password = password;

    const endpoint = isEdit ? `/superadmin/admins/${adminId}` : "/superadmin/admins";
    const method = isEdit ? "PUT" : "POST";
    await api(endpoint, { method, headers: getHeaders(), body: JSON.stringify(payload) });
    window.location.assign("/superadmin/admins");
  });
};

const loadUsers = async () => {
  const query = params.get("q") ? `?q=${encodeURIComponent(params.get("q"))}&role=user` : "?role=user";
  const users = await api(`/superadmin/users${query}`, { headers: getHeaders(false) });
  const searchInput = document.getElementById("userSearch");
  if (searchInput) searchInput.value = params.get("q") || "";

  renderList(
    "userList",
    users,
    (user) => `
      <article class="superadmin-list-card">
        <div class="superadmin-list-head">
          <div>
            <strong>${user.name}</strong>
            <p>${user.email}</p>
          </div>
          <span class="superadmin-badge status-${user.isActive ? "active" : "blocked"}">${user.isActive ? "active" : "blocked"}</span>
        </div>
        <div class="superadmin-meta">Total donated: ${currency(user.totalDonated)} | Last donation: ${formatDate(user.lastDonationAt)}</div>
        <div class="superadmin-actions">
          <a class="superadmin-btn-secondary" href="/superadmin/users/${user.id}">View Details</a>
          <button class="superadmin-btn-secondary" type="button" data-toggle-user="${user.id}" data-active="${user.isActive}">
            ${user.isActive ? "Block" : "Unblock"}
          </button>
          <button class="superadmin-btn-danger" type="button" data-delete-user="${user.id}">Delete</button>
        </div>
      </article>
    `,
    "No users found."
  );

  document.querySelectorAll("[data-toggle-user]").forEach((button) => {
    button.addEventListener("click", async () => {
      await api(`/superadmin/users/${button.dataset.toggleUser}/access`, {
        method: "PUT",
        headers: getHeaders(),
        body: JSON.stringify({ isActive: button.dataset.active !== "true" }),
      });
      window.location.reload();
    });
  });

  document.querySelectorAll("[data-delete-user]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!window.confirm("Delete this user account?")) return;
      await api(`/superadmin/users/${button.dataset.deleteUser}`, {
        method: "DELETE",
        headers: getHeaders(false),
      });
      window.location.reload();
    });
  });
};

const loadMarketingUsers = async () => {
  const query = params.get("q") ? `?q=${encodeURIComponent(params.get("q"))}` : "";
  const users = await api(`/superadmin/marketing-users${query}`, { headers: getHeaders(false) });
  const searchInput = document.getElementById("marketingSearch");
  if (searchInput) searchInput.value = params.get("q") || "";

  renderList(
    "marketingList",
    users,
    (user) => `
      <article class="superadmin-list-card">
        <div class="superadmin-list-head">
          <div>
            <strong>${user.name}</strong>
            <p>${user.email}</p>
          </div>
          <span class="superadmin-badge status-${user.isActive ? "active" : "blocked"}">${user.isActive ? "active" : "blocked"}</span>
        </div>
        <div class="superadmin-meta">Permissions: ${(user.permissions || []).join(", ") || "Default marketing access"}</div>
        <div class="superadmin-actions">
          <a class="superadmin-btn-secondary" href="/superadmin/marketing/edit/${user.id}">Edit</a>
          <button class="superadmin-btn-secondary" type="button" data-toggle-marketing="${user.id}" data-active="${user.isActive}">
            ${user.isActive ? "Block" : "Unblock"}
          </button>
          <button class="superadmin-btn-danger" type="button" data-delete-marketing="${user.id}">Delete</button>
        </div>
      </article>
    `,
    "No marketing users found."
  );

  document.querySelectorAll("[data-toggle-marketing]").forEach((button) => {
    button.addEventListener("click", async () => {
      await api(`/superadmin/users/${button.dataset.toggleMarketing}/access`, {
        method: "PUT",
        headers: getHeaders(),
        body: JSON.stringify({ isActive: button.dataset.active !== "true" }),
      });
      window.location.reload();
    });
  });

  document.querySelectorAll("[data-delete-marketing]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!window.confirm("Delete this marketing account?")) return;
      await api(`/superadmin/users/${button.dataset.deleteMarketing}`, {
        method: "DELETE",
        headers: getHeaders(false),
      });
      window.location.reload();
    });
  });
};

const loadMarketingForm = async () => {
  const isEdit = pathParts.includes("edit");
  const marketingId = pathParts[pathParts.length - 1];
  const titleNode = document.getElementById("marketingFormTitle");
  const form = document.getElementById("marketingForm");
  const messageNode = document.getElementById("marketingFormMessage");
  const passwordInput = document.getElementById("marketingPassword");
  if (titleNode) {
    titleNode.textContent = isEdit ? "Edit marketing account" : "Create marketing account";
  }
  if (passwordInput) {
    passwordInput.required = !isEdit;
  }

  if (isEdit) {
    const userData = await api(`/superadmin/users/${marketingId}`, { headers: getHeaders(false) });
    const user = userData.profile;
    document.getElementById("marketingName").value = user.name || "";
    document.getElementById("marketingEmail").value = user.email || "";
    document.getElementById("marketingMobile").value = user.mobile || "";
    document.getElementById("marketingPermissions").value = (user.permissions || []).join("\n");
    document.getElementById("marketingStatus").value = user.isActive ? "active" : "blocked";
  }

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (messageNode) messageNode.hidden = true;

    try {
      const payload = {
        name: document.getElementById("marketingName").value.trim(),
        email: document.getElementById("marketingEmail").value.trim(),
        mobile: document.getElementById("marketingMobile").value.trim(),
        permissions: document
          .getElementById("marketingPermissions")
          .value.split("\n")
          .map((item) => item.trim())
          .filter(Boolean),
        isActive: document.getElementById("marketingStatus").value === "active",
      };

      const password = passwordInput?.value.trim() || "";
      if (password) payload.password = password;
      if (!isEdit && !password) {
        throw new Error("Password is required while creating a marketing user");
      }

      const endpoint = isEdit ? `/superadmin/marketing-users/${marketingId}` : "/superadmin/marketing-users";
      const method = isEdit ? "PUT" : "POST";
      const response = await api(endpoint, { method, headers: getHeaders(), body: JSON.stringify(payload) });
      showMessage(messageNode, response.message || `Marketing user ${isEdit ? "updated" : "created"} successfully.`);
      window.setTimeout(() => {
        window.location.assign("/superadmin/marketing");
      }, 700);
    } catch (error) {
      showMessage(messageNode, error.message, true);
    }
  });
};

const loadMarketingActivity = async () => {
  const data = await api("/superadmin/marketing/activity", { headers: getHeaders(false) });
  renderList(
    "marketingCampaignActivity",
    data.campaigns,
    (item) => `
      <article class="superadmin-list-card">
        <div class="superadmin-list-head">
          <div>
            <strong>${item.title}</strong>
            <p>${item.createdBy} | ${item.channel}</p>
          </div>
          <span class="superadmin-badge status-${item.status}">${item.status}</span>
        </div>
        <div class="superadmin-meta">Reach: ${item.reach} | Delivered: ${item.delivered} | Clicks: ${item.clicks}</div>
      </article>
    `,
    "No marketing campaigns tracked yet."
  );

  renderList(
    "marketingAuditActivity",
    data.logs,
    (item) => `
      <article class="superadmin-list-card">
        <div class="superadmin-list-head">
          <strong>${item.action}</strong>
          <span class="superadmin-badge status-${item.severity}">${item.severity}</span>
        </div>
        <p>${item.targetLabel || "Marketing action"}</p>
        <div class="superadmin-meta">${formatDate(item.createdAt)}</div>
      </article>
    `,
    "No marketing activity logs yet."
  );

  renderList(
    "marketingImpactReview",
    data.impactEvents || [],
    (item) => `
      <article class="superadmin-list-card">
        <div class="superadmin-list-head">
          <div>
            <strong>${item.title}</strong>
            <p>${item.campaignTitle} | ${item.createdBy}</p>
          </div>
          <span class="superadmin-badge status-${item.status}">${item.status}</span>
        </div>
        <div class="superadmin-meta">${currency(item.fundUsed)} used | ${item.impactNumber} ${item.impactLabel} | ${formatDate(item.eventDate)}</div>
        ${item.reviewNotes ? `<p>Review: ${item.reviewNotes}</p>` : ""}
        <div class="superadmin-actions">
          <button class="superadmin-btn-secondary" type="button" data-impact-review="${item.id}" data-status="approved">Approve</button>
          <button class="superadmin-btn-danger" type="button" data-impact-review="${item.id}" data-status="rejected">Reject</button>
        </div>
      </article>
    `,
    "No impact updates waiting for review."
  );

  document.querySelectorAll("[data-impact-review]").forEach((button) => {
    button.addEventListener("click", async () => {
      const reviewNotes = window.prompt("Add review note (optional):", "") || "";
      await api(`/superadmin/marketing/impact-events/${button.dataset.impactReview}/review`, {
        method: "PUT",
        headers: getHeaders(),
        body: JSON.stringify({
          status: button.dataset.status,
          reviewNotes,
        }),
      });
      window.location.reload();
    });
  });
};

const loadUserDetail = async () => {
  const userId = pathParts[pathParts.length - 1];
  const data = await api(`/superadmin/users/${userId}`, { headers: getHeaders(false) });
  const profile = document.getElementById("userProfile");
  if (profile) {
    profile.innerHTML = `
      <article class="superadmin-card">
        <div class="superadmin-list-head">
          <div>
            <strong>${data.profile.name}</strong>
            <p>${data.profile.email}</p>
          </div>
          <span class="superadmin-badge status-${data.profile.isActive ? "active" : "blocked"}">${data.profile.isActive ? "active" : "blocked"}</span>
        </div>
        <p>Mobile: ${data.profile.mobile || "Not added"}</p>
        <div class="superadmin-meta">Joined: ${formatDate(data.profile.createdAt)}</div>
        <div class="superadmin-actions">
          <button class="superadmin-btn-secondary" id="toggleDetailUser" type="button">${data.profile.isActive ? "Block User" : "Unblock User"}</button>
          <button class="superadmin-btn-danger" id="deleteDetailUser" type="button">Delete User</button>
        </div>
      </article>
    `;

    document.getElementById("toggleDetailUser")?.addEventListener("click", async () => {
      await api(`/superadmin/users/${userId}/access`, {
        method: "PUT",
        headers: getHeaders(),
        body: JSON.stringify({ isActive: !data.profile.isActive }),
      });
      window.location.reload();
    });

    document.getElementById("deleteDetailUser")?.addEventListener("click", async () => {
      if (!window.confirm("Delete this user account?")) return;
      await api(`/superadmin/users/${userId}`, { method: "DELETE", headers: getHeaders(false) });
      window.location.assign("/superadmin/users");
    });
  }

  renderList(
    "userDonationHistory",
    data.donations,
    (item) => `
      <article class="superadmin-list-card">
        <div class="superadmin-list-head">
          <strong>${item.campaignTitle}</strong>
          <span class="superadmin-badge">${currency(item.amount)}</span>
        </div>
        <p>${item.donationType} donation</p>
        <div class="superadmin-meta">${formatDate(item.date)} | FY ${item.financialYear}</div>
      </article>
    `,
    "No donation history found."
  );

  renderList(
    "userSubscriptions",
    data.subscriptions,
    (item) => `
      <article class="superadmin-list-card">
        <div class="superadmin-list-head">
          <strong>${item.campaignTitle}</strong>
          <span class="superadmin-badge status-${item.status}">${item.status}</span>
        </div>
        <p>${currency(item.amount)}</p>
        <div class="superadmin-meta">Next billing: ${formatDate(item.nextPaymentDate)}</div>
      </article>
    `,
    "No subscriptions found."
  );
};

const loadCampaigns = async () => {
  const search = params.get("q") || "";
  const status = params.get("status") || "";
  const query = new URLSearchParams();
  if (search) query.set("q", search);
  if (status) query.set("status", status);
  const campaigns = await api(`/superadmin/campaigns${query.toString() ? `?${query.toString()}` : ""}`, { headers: getHeaders(false) });

  document.getElementById("campaignSearch").value = search;
  document.getElementById("campaignStatus").value = status;

  renderList(
    "campaignList",
    campaigns,
    (campaign) => `
      <article class="superadmin-list-card">
        <div class="superadmin-list-head">
          <div>
            <strong>${campaign.title}</strong>
            <p>${campaign.category || "Campaign"} | ${campaign.location || "No location"}</p>
          </div>
          <span class="superadmin-badge status-${campaign.status}">${campaign.status}</span>
        </div>
        <div class="superadmin-meta">${currency(campaign.raisedAmount)} raised of ${currency(campaign.goalAmount)} | ${campaign.donorCount} donors</div>
        <div class="superadmin-actions">
          <button class="superadmin-btn" type="button" data-campaign-status="${campaign.id}" data-status="active">Approve</button>
          <button class="superadmin-btn-danger" type="button" data-campaign-status="${campaign.id}" data-status="rejected">Reject</button>
          <a class="superadmin-btn-secondary" href="/admin.html">Edit in Admin Editor</a>
        </div>
      </article>
    `,
    "No campaign requests found."
  );

  document.querySelectorAll("[data-campaign-status]").forEach((button) => {
    button.addEventListener("click", async () => {
      await api(`/superadmin/campaigns/${button.dataset.campaignStatus}/status`, {
        method: "PUT",
        headers: getHeaders(),
        body: JSON.stringify({ status: button.dataset.status }),
      });
      window.location.reload();
    });
  });
};

const loadDonations = async () => {
  const query = new URLSearchParams();
  ["q", "campaignId", "from", "to"].forEach((key) => {
    const value = params.get(key);
    if (value) query.set(key, value);
  });
  const donations = await api(`/superadmin/donations${query.toString() ? `?${query.toString()}` : ""}`, { headers: getHeaders(false) });

  ["donationSearch", "dateFrom", "dateTo"].forEach((id, index) => {
    const key = ["q", "from", "to"][index];
    const node = document.getElementById(id);
    if (node) node.value = params.get(key) || "";
  });

  renderList(
    "donationList",
    donations,
    (item) => `
      <article class="superadmin-list-card">
        <div class="superadmin-list-head">
          <div>
            <strong>${item.donorName}</strong>
            <p>${item.campaignTitle}</p>
          </div>
          <span class="superadmin-badge">${currency(item.amount)}</span>
        </div>
        <div class="superadmin-meta">${item.donationType} | ${formatDate(item.date)} | FY ${item.financialYear}</div>
      </article>
    `,
    "No donations found."
  );
};

const loadSubscriptions = async () => {
  const subscriptions = await api("/superadmin/subscriptions", { headers: getHeaders(false) });
  renderList(
    "subscriptionList",
    subscriptions,
    (item) => `
      <article class="superadmin-list-card">
        <div class="superadmin-list-head">
          <div>
            <strong>${item.userName}</strong>
            <p>${item.campaignTitle}</p>
          </div>
          <span class="superadmin-badge status-${item.status}">${item.status}</span>
        </div>
        <div class="superadmin-meta">${currency(item.amount)} | Next billing: ${formatDate(item.nextPaymentDate)}</div>
        <div class="superadmin-actions">
          <button class="superadmin-btn-danger" type="button" data-cancel-subscription="${item.id}">Cancel Subscription</button>
        </div>
      </article>
    `,
    "No subscriptions found."
  );

  document.querySelectorAll("[data-cancel-subscription]").forEach((button) => {
    button.addEventListener("click", async () => {
      await api(`/superadmin/subscriptions/${button.dataset.cancelSubscription}/cancel`, {
        method: "PUT",
        headers: getHeaders(false),
      });
      window.location.reload();
    });
  });
};

const loadCertificates = async () => {
  const certificates = await api("/superadmin/certificates", { headers: getHeaders(false) });
  renderList(
    "certificateList",
    certificates,
    (item) => `
      <article class="superadmin-list-card">
        <div class="superadmin-list-head">
          <div>
            <strong>${item.certificateId}</strong>
            <p>${item.donorName} | ${item.campaignTitle}</p>
          </div>
          <span class="superadmin-badge status-${item.verified ? "verified" : "pending"}">${item.verified ? "verified" : "pending"}</span>
        </div>
        <div class="superadmin-meta">${currency(item.amount)} | Issued: ${formatDate(item.issuedOn)}</div>
        <div class="superadmin-actions">
          <button class="superadmin-btn" type="button" data-verify-certificate="${item.id}">Verify</button>
          ${item.fileUrl ? `<a class="superadmin-btn-secondary" href="${item.fileUrl}" target="_blank" rel="noreferrer">View PDF</a>` : ""}
        </div>
      </article>
    `,
    "No certificates available."
  );

  document.querySelectorAll("[data-verify-certificate]").forEach((button) => {
    button.addEventListener("click", async () => {
      await api(`/superadmin/certificates/${button.dataset.verifyCertificate}/verify`, {
        method: "PUT",
        headers: getHeaders(false),
      });
      window.location.reload();
    });
  });
};

const loadAnalytics = async () => {
  const data = await api("/superadmin/analytics", { headers: getHeaders(false) });
  const donations = document.getElementById("analyticsDonations");
  const campaigns = document.getElementById("analyticsCampaigns");
  const users = document.getElementById("analyticsUsers");

  if (donations) donations.innerHTML = renderBars(data.monthlyDonations, "amount", "month", currency);
  if (campaigns) campaigns.innerHTML = renderBars(data.topCampaigns, "raisedAmount", "title", currency);
  if (users) users.innerHTML = renderBars(data.userGrowth, "count", "month");
};

const loadSettingsHome = async () => {
  const data = await api("/superadmin/dashboard", { headers: getHeaders(false) });
  const settingsOverview = document.getElementById("settingsOverview");
  if (settingsOverview) {
    settingsOverview.innerHTML = statCards([
      { label: "Admins", value: data.totals.totalAdmins, help: "Manage admin accounts" },
      { label: "Users", value: data.totals.totalUsers, help: "Monitor donor accounts" },
      { label: "Marketing", value: data.totals.totalMarketingUsers, help: "Communication team access" },
      { label: "Active Campaigns", value: data.totals.activeCampaigns, help: "Live fundraising pages" },
      { label: "Subscriptions", value: data.totals.activeSubscriptions, help: "Recurring donor base" },
    ]);
  }
};

const loadProfile = async () => {
  const user = superAdminSession.user;
  document.getElementById("profileName").value = user?.name || "";
  document.getElementById("profileEmail").value = user?.email || "";
  document.getElementById("profileMobile").value = user?.mobile || "";
  document.getElementById("profilePhoto").value = user?.profilePhoto || "";

  document.getElementById("profileForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await api("/superadmin/profile", {
      method: "PUT",
      headers: getHeaders(),
      body: JSON.stringify({
        name: document.getElementById("profileName").value.trim(),
        email: document.getElementById("profileEmail").value.trim(),
        mobile: document.getElementById("profileMobile").value.trim(),
        profilePhoto: document.getElementById("profilePhoto").value.trim(),
      }),
    });
    await window.appSession?.refreshSessionUser?.();
    showMessage(document.getElementById("profileMessage"), "Profile updated successfully.");
  });

  document.getElementById("passwordForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await api("/superadmin/profile/password", {
      method: "PUT",
      headers: getHeaders(),
      body: JSON.stringify({
        currentPassword: document.getElementById("currentPassword").value,
        newPassword: document.getElementById("newPassword").value,
      }),
    });
    event.target.reset();
    showMessage(document.getElementById("passwordMessage"), "Password updated successfully.");
  });
};

const loadSystem = async () => {
  const settings = await api("/superadmin/settings/system", { headers: getHeaders(false) });
  document.getElementById("taxPercentage").value = settings.taxPercentage ?? 50;
  document.getElementById("platformFeePercentage").value = settings.platformFeePercentage ?? 0;
  document.getElementById("supportEmail").value = settings.supportEmail || "";
  document.getElementById("receiptPrefix").value = settings.receiptPrefix || "";
  document.getElementById("maintenanceMode").checked = Boolean(settings.maintenanceMode);
  document.getElementById("templateDonation").value = settings.emailTemplates?.donationThankYou || "";
  document.getElementById("templateCampaign").value = settings.emailTemplates?.campaignApproval || "";
  document.getElementById("templateAccount").value = settings.emailTemplates?.accountStatus || "";
  document.getElementById("templateMarketingThankYou").value = settings.emailTemplates?.marketingThankYou || "";
  document.getElementById("templateMarketingCampaign").value = settings.emailTemplates?.marketingCampaignUpdate || "";
  document.getElementById("templateMarketingReminder").value = settings.emailTemplates?.marketingReminder || "";

  document.getElementById("systemForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await api("/superadmin/settings/system", {
      method: "PUT",
      headers: getHeaders(),
      body: JSON.stringify({
        taxPercentage: document.getElementById("taxPercentage").value,
        platformFeePercentage: document.getElementById("platformFeePercentage").value,
        supportEmail: document.getElementById("supportEmail").value.trim(),
        receiptPrefix: document.getElementById("receiptPrefix").value.trim(),
        maintenanceMode: document.getElementById("maintenanceMode").checked,
        emailTemplates: {
          donationThankYou: document.getElementById("templateDonation").value.trim(),
          campaignApproval: document.getElementById("templateCampaign").value.trim(),
          accountStatus: document.getElementById("templateAccount").value.trim(),
          marketingThankYou: document.getElementById("templateMarketingThankYou").value.trim(),
          marketingCampaignUpdate: document.getElementById("templateMarketingCampaign").value.trim(),
          marketingReminder: document.getElementById("templateMarketingReminder").value.trim(),
        },
      }),
    });
    showMessage(document.getElementById("systemMessage"), "System settings saved successfully.");
  });
};

const loadSecurity = async () => {
  const data = await api("/superadmin/settings/security", { headers: getHeaders(false) });
  renderList(
    "suspiciousList",
    data.suspiciousActions,
    (item) => `
      <article class="superadmin-list-card">
        <div class="superadmin-list-head">
          <strong>${item.action}</strong>
          <span class="superadmin-badge status-${item.severity}">${item.severity}</span>
        </div>
        <p>${item.targetLabel || "Security event"}</p>
        <div class="superadmin-meta">${formatDate(item.createdAt)}</div>
      </article>
    `,
    "No suspicious actions found."
  );

  renderList(
    "auditLogList",
    data.logs,
    (item) => `
      <article class="superadmin-list-card">
        <div class="superadmin-list-head">
          <strong>${item.action}</strong>
          <span class="superadmin-badge status-${item.severity}">${item.severity}</span>
        </div>
        <p>${item.targetType}: ${item.targetLabel || "system"}</p>
        <div class="superadmin-meta">${formatDate(item.createdAt)}</div>
      </article>
    `,
    "Audit logs are empty."
  );
};

const bindSearchForm = (formId, fields) => {
  document.getElementById(formId)?.addEventListener("submit", (event) => {
    event.preventDefault();
    const query = new URLSearchParams();
    fields.forEach(([inputId, key]) => {
      const value = document.getElementById(inputId)?.value?.trim();
      if (value) query.set(key, value);
    });
    const path = window.location.pathname;
    window.location.assign(query.toString() ? `${path}?${query.toString()}` : path);
  });
};

const bootLogin = () => {
  const form = document.getElementById("superadminLoginForm");
  const message = document.getElementById("superadminLoginMessage");
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const data = await api("/auth/login", {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({
          email: document.getElementById("loginEmail").value.trim(),
          password: document.getElementById("loginPassword").value,
        }),
      });

      if (data.user?.role !== "superadmin") {
        throw new Error("This login is only for superadmin accounts");
      }

      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));
      window.location.assign("/superadmin/dashboard");
    } catch (error) {
      showMessage(message, error.message, true);
    }
  });
};

const bootPage = async () => {
  const pageKey = document.body.dataset.page;
  if (pageKey === "login") {
    bootLogin();
    return;
  }

  const allowed = await ensureSuperAdmin();
  if (!allowed) return;

  renderShell(pageKey);

  if (pageKey === "dashboard") await loadDashboard();
  if (pageKey === "admins") {
    bindSearchForm("adminSearchForm", [["adminSearch", "q"]]);
    await loadAdmins();
  }
  if (pageKey === "adminForm") await loadAdminForm();
  if (pageKey === "users") {
    bindSearchForm("userSearchForm", [["userSearch", "q"]]);
    await loadUsers();
  }
  if (pageKey === "marketing") {
    bindSearchForm("marketingSearchForm", [["marketingSearch", "q"]]);
    await loadMarketingUsers();
  }
  if (pageKey === "marketingForm") await loadMarketingForm();
  if (pageKey === "marketingActivity") await loadMarketingActivity();
  if (pageKey === "userDetail") await loadUserDetail();
  if (pageKey === "campaigns") {
    bindSearchForm("campaignSearchForm", [["campaignSearch", "q"], ["campaignStatus", "status"]]);
    await loadCampaigns();
  }
  if (pageKey === "donations") {
    bindSearchForm("donationSearchForm", [["donationSearch", "q"], ["dateFrom", "from"], ["dateTo", "to"]]);
    await loadDonations();
  }
  if (pageKey === "subscriptions") await loadSubscriptions();
  if (pageKey === "certificates") await loadCertificates();
  if (pageKey === "analytics") await loadAnalytics();
  if (pageKey === "settings") await loadSettingsHome();
  if (pageKey === "profile") await loadProfile();
  if (pageKey === "system") await loadSystem();
  if (pageKey === "security") await loadSecurity();
};

bootPage().catch((error) => {
  const mount = document.querySelector("[data-page-content]");
  if (mount) {
    mount.innerHTML = `<div class="superadmin-card"><div class="superadmin-message is-error">${error.message}</div></div>`;
  }
});
