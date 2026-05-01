const API_BASE = window.appSession?.apiBase || `${window.location.origin}/api`;

const adminSession = {
  token: localStorage.getItem("token"),
  user: JSON.parse(localStorage.getItem("user") || "null"),
};

const adminPages = {
  dashboard: { title: "Dashboard", subtitle: "Track your campaign pipeline, donations, and recurring support." },
  createCampaign: { title: "Create Campaign", subtitle: "Draft, preview, and submit a campaign for superadmin approval." },
  campaigns: { title: "Manage Campaigns", subtitle: "Review all of your campaigns with filters and quick actions." },
  donations: { title: "Donations", subtitle: "Campaign-wise donor activity and latest contributions." },
  subscriptions: { title: "Subscriptions", subtitle: "Monitor recurring supporters and upcoming billing cycles." },
  reports: { title: "Reports", subtitle: "Monthly totals, campaign summaries, and downloadable reports." },
  settings: { title: "Settings", subtitle: "Profile, password, and notification preferences." },
  profile: { title: "Profile", subtitle: "Update your admin profile details." },
  security: { title: "Security", subtitle: "Change your password with strong password rules." },
  notifications: { title: "Notifications", subtitle: "Control email and reminder preferences." },
};

const adminNav = [
  {
    label: "Operations",
    links: [
      ["/admin/dashboard", "dashboard", "Dashboard"],
      ["/admin/create-campaign", "createCampaign", "Create Campaign"],
      ["/admin/campaigns", "campaigns", "Manage Campaigns"],
      ["/admin/donations", "donations", "Donations"],
      ["/admin/subscriptions", "subscriptions", "Subscriptions"],
      ["/admin/reports", "reports", "Reports"],
    ],
  },
  {
    label: "Settings",
    links: [
      ["/admin/settings", "settings", "Settings Home"],
      ["/admin/settings/profile", "profile", "Profile"],
      ["/admin/settings/security", "security", "Security"],
      ["/admin/settings/notifications", "notifications", "Notifications"],
    ],
  },
];

const pageKey = document.body.dataset.page;
const pathParts = window.location.pathname.split("/").filter(Boolean);
const params = new URLSearchParams(window.location.search);

const headers = (json = true) => ({
  ...(json ? { "Content-Type": "application/json" } : {}),
  ...(adminSession.token ? { Authorization: adminSession.token } : {}),
});

const currency = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

const formatDate = (value) => (value ? new Date(value).toLocaleString("en-IN") : "Not available");
const initials = (name = "AD") => String(name).split(" ").map((x) => x[0]).join("").slice(0, 2).toUpperCase();

const api = async (path, options = {}) => {
  const response = await fetch(`${API_BASE}${path}`, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || data.msg || "Request failed");
  return data;
};

const showMessage = (nodeId, message, error = false) => {
  const node = document.getElementById(nodeId);
  if (!node) return;
  node.textContent = message;
  node.className = `admin-message${error ? " is-error" : ""}`;
};

const ensureAdmin = async () => {
  if (!adminSession.token) {
    window.location.replace("/login.html");
    return false;
  }
  const data = await api("/auth/me", { headers: headers(false) });
  adminSession.user = data.user;
  localStorage.setItem("user", JSON.stringify(data.user));
  if (!["admin", "superadmin"].includes(data.user.role)) {
    window.location.replace("/login.html");
    return false;
  }
  return true;
};

const renderShell = () => {
  const mount = document.getElementById("adminShell");
  const content = mount.querySelector("[data-page-content]");
  const meta = adminPages[pageKey] || adminPages.dashboard;
  const avatar = adminSession.user?.profilePhoto
    ? `<img src="${adminSession.user.profilePhoto}" alt="${adminSession.user.name || "Admin"}" />`
    : initials(adminSession.user?.name || "Admin");

  mount.className = "admin-shell";
  mount.innerHTML = `
    <aside class="admin-sidebar">
      <a class="admin-brand" href="/admin/dashboard">HopeSpring<small>Admin Console</small></a>
      ${adminNav
        .map(
          (section) => `
            <div class="admin-nav-group">
              <h3>${section.label}</h3>
              <nav class="admin-nav">
                ${section.links
                  .map(([href, key, label]) => `<a class="${key === pageKey ? "is-active" : ""}" href="${href}">${label}</a>`)
                  .join("")}
              </nav>
            </div>
          `
        )
        .join("")}
    </aside>
    <div class="admin-main">
      <div class="admin-topbar">
        <div class="admin-page-head">
          <p class="admin-kicker">Admin Panel</p>
          <h1>${meta.title}</h1>
          <p>${meta.subtitle}</p>
        </div>
        <div class="admin-userbox">
          <div class="admin-avatar">${avatar}</div>
          <div>
            <strong>${adminSession.user?.name || "Admin"}</strong>
            <div class="admin-meta">${adminSession.user?.email || ""}</div>
          </div>
          <button id="adminLogout" class="admin-btn-secondary" type="button">Logout</button>
        </div>
      </div>
      <div class="admin-page"></div>
    </div>
  `;

  mount.querySelector(".admin-page").appendChild(content);
  document.getElementById("adminLogout")?.addEventListener("click", () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.location.assign("/login.html");
  });
};

const statCards = (items) =>
  items
    .map(
      (item) => `
        <article class="admin-stat-card admin-col-3">
          <span>${item.label}</span>
          <strong>${item.value}</strong>
          <p>${item.help || ""}</p>
        </article>
      `
    )
    .join("");

const renderList = (targetId, items, renderer, empty = "No records found.") => {
  const target = document.getElementById(targetId);
  if (!target) return;
  target.innerHTML = items.length ? `<div class="admin-list">${items.map(renderer).join("")}</div>` : `<div class="admin-empty">${empty}</div>`;
};

const bindSearchForm = (formId, entries) => {
  document.getElementById(formId)?.addEventListener("submit", (event) => {
    event.preventDefault();
    const query = new URLSearchParams();
    entries.forEach(([id, key]) => {
      const value = document.getElementById(id)?.value?.trim();
      if (value) query.set(key, value);
    });
    const path = window.location.pathname;
    window.location.assign(query.toString() ? `${path}?${query.toString()}` : path);
  });
};

const setInputValue = (id, value) => {
  const node = document.getElementById(id);
  if (node) node.value = value || "";
};

const loadDashboard = async () => {
  const data = await api("/admin/dashboard", { headers: headers(false) });
  document.getElementById("dashboardStats").innerHTML = statCards([
    { label: "My Campaigns", value: data.totals.myCampaigns, help: "Campaigns owned by your account" },
    { label: "Total Raised", value: currency(data.totals.totalRaised), help: "Collections across your campaigns" },
    { label: "Active Campaigns", value: data.totals.activeCampaigns, help: "Currently visible campaigns" },
    { label: "Pending Campaigns", value: data.totals.pendingCampaigns, help: "Waiting for superadmin review" },
  ]);

  renderList(
    "dashboardDonations",
    data.recentDonations,
    (item) => `
      <article class="admin-list-card">
        <div class="admin-list-head">
          <strong>${item.donorName}</strong>
          <span class="admin-badge">${currency(item.amount)}</span>
        </div>
        <p>${item.campaignTitle}</p>
        <div class="admin-meta">${formatDate(item.date)}</div>
      </article>
    `,
    "Recent donations will appear here."
  );

  renderList(
    "dashboardCampaigns",
    data.campaigns,
    (item) => `
      <article class="admin-list-card">
        <div class="admin-list-head">
          <div>
            <strong>${item.title}</strong>
            <p>${currency(item.raisedAmount)} of ${currency(item.goalAmount)}</p>
          </div>
          <span class="admin-badge status-${item.isDraft ? "draft" : item.isPaused ? "paused" : item.status}">${item.isDraft ? "draft" : item.isPaused ? "paused" : item.status}</span>
        </div>
        <div class="admin-meta">${item.donorCount} donors | Views: ${item.viewCount} | Conversion: ${item.conversionRate}%</div>
        <div class="admin-actions">
          <a class="admin-btn-secondary" href="/admin/create-campaign?id=${item.id}">Edit</a>
        </div>
      </article>
    `,
    "Your campaign performance will appear here."
  );
};

const previewCampaign = () => {
  const title = document.getElementById("campaignTitle")?.value?.trim() || "Campaign title";
  const description = document.getElementById("campaignDescription")?.value?.trim() || "Campaign description preview.";
  const goal = document.getElementById("campaignGoalAmount")?.value || "0";
  const cover = document.getElementById("campaignCoverImage")?.value?.trim() || "";
  const status = document.getElementById("campaignDraft")?.checked ? "Draft" : "Pending Approval";
  const target = document.getElementById("campaignPreview");
  if (!target) return;
  target.innerHTML = `
    <div class="admin-preview">
      ${cover ? `<img class="admin-preview-cover" src="${cover}" alt="${title}" />` : `<div class="admin-preview-cover"></div>`}
      <h3>${title}</h3>
      <p>${description}</p>
      <div class="admin-actions">
        <span class="admin-badge">${currency(goal)}</span>
        <span class="admin-badge status-pending">${status}</span>
      </div>
    </div>
  `;
};

const loadCampaignEditor = async () => {
  const campaignId = params.get("id");
  if (campaignId) {
    const data = await api(`/admin/campaigns/${campaignId}`, { headers: headers(false) });
    setInputValue("campaignTitle", data.title);
    setInputValue("campaignTagline", data.tagline);
    setInputValue("campaignDescription", data.description);
    setInputValue("campaignGoalAmount", data.goalAmount);
    setInputValue("campaignCategory", data.category);
    setInputValue("campaignLocation", data.location);
    setInputValue("campaignCoverImage", data.coverImage);
    setInputValue("campaignImpactPerUnit", data.impactPerUnit);
    setInputValue("campaignImpactLabel", data.impactLabel);
    setInputValue("campaignStoryTitle", data.story?.title);
    setInputValue("campaignStoryDescription", data.story?.description);
    setInputValue("campaignStoryImpact", data.story?.impact);
    setInputValue("campaignStoryImageUrl", data.story?.imageUrl);
    setInputValue("campaignUpdateTitle", "");
    setInputValue("campaignUpdateDescription", "");
    document.getElementById("campaignDraft").checked = Boolean(data.isDraft);
    document.getElementById("campaignPaused").checked = Boolean(data.isPaused);
  }

  document.querySelectorAll("#campaignForm input, #campaignForm textarea").forEach((node) => {
    node.addEventListener("input", previewCampaign);
  });
  document.getElementById("campaignDraft")?.addEventListener("change", previewCampaign);
  previewCampaign();

  document.getElementById("campaignForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = {
      title: document.getElementById("campaignTitle").value.trim(),
      tagline: document.getElementById("campaignTagline").value.trim(),
      description: document.getElementById("campaignDescription").value.trim(),
      goalAmount: Number(document.getElementById("campaignGoalAmount").value),
      category: document.getElementById("campaignCategory").value.trim(),
      location: document.getElementById("campaignLocation").value.trim(),
      coverImage: document.getElementById("campaignCoverImage").value.trim(),
      impactPerUnit: Number(document.getElementById("campaignImpactPerUnit").value || 0),
      impactLabel: document.getElementById("campaignImpactLabel").value.trim(),
      isDraft: document.getElementById("campaignDraft").checked,
      isPaused: document.getElementById("campaignPaused").checked,
      story: {
        title: document.getElementById("campaignStoryTitle").value.trim(),
        description: document.getElementById("campaignStoryDescription").value.trim(),
        impact: document.getElementById("campaignStoryImpact").value.trim(),
        imageUrl: document.getElementById("campaignStoryImageUrl").value.trim(),
      },
      updateTitle: document.getElementById("campaignUpdateTitle").value.trim(),
      updateDescription: document.getElementById("campaignUpdateDescription").value.trim(),
    };

    const endpoint = campaignId ? `/campaign/${campaignId}` : "/campaign/create";
    const method = campaignId ? "PUT" : "POST";
    await api(endpoint, { method, headers: headers(), body: JSON.stringify(payload) });
    window.location.assign("/admin/campaigns");
  });
};

const loadCampaigns = async () => {
  const query = new URLSearchParams();
  if (params.get("q")) query.set("q", params.get("q"));
  if (params.get("status")) query.set("status", params.get("status"));
  setInputValue("campaignSearch", params.get("q"));
  setInputValue("campaignStatusFilter", params.get("status"));
  const list = await api(`/admin/campaigns${query.toString() ? `?${query.toString()}` : ""}`, { headers: headers(false) });

  renderList(
    "campaignList",
    list,
    (item) => `
      <article class="admin-list-card">
        <div class="admin-list-head">
          <div>
            <strong>${item.title}</strong>
            <p>${currency(item.raisedAmount)} of ${currency(item.goalAmount)}</p>
          </div>
          <span class="admin-badge status-${item.isDraft ? "draft" : item.isPaused ? "paused" : item.status}">
            ${item.isDraft ? "draft" : item.isPaused ? "paused" : item.status}
          </span>
        </div>
        <div class="admin-meta">${item.category || "Campaign"} | ${item.location || "No location"} | ${item.donorCount} donors</div>
        <div class="admin-actions">
          <a class="admin-btn-secondary" href="/admin/create-campaign?id=${item.id}">Edit</a>
          <button class="admin-btn-danger" type="button" data-delete-campaign="${item.id}">Delete</button>
        </div>
      </article>
    `,
    "No campaigns found."
  );

  document.querySelectorAll("[data-delete-campaign]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!window.confirm("Delete this campaign?")) return;
      await api(`/campaign/${button.dataset.deleteCampaign}`, { method: "DELETE", headers: headers(false) });
      window.location.reload();
    });
  });
};

const loadDonations = async () => {
  const donations = await api("/admin/donations", { headers: headers(false) });
  renderList(
    "donationList",
    donations,
    (item) => `
      <article class="admin-list-card">
        <div class="admin-list-head">
          <div>
            <strong>${item.donorName}</strong>
            <p>${item.campaignTitle}</p>
          </div>
          <span class="admin-badge">${currency(item.amount)}</span>
        </div>
        <div class="admin-meta">${formatDate(item.date)} | ${item.donorEmail || "No email"} | FY ${item.financialYear}</div>
      </article>
    `,
    "No donations found yet."
  );
};

const loadSubscriptions = async () => {
  const subscriptions = await api("/admin/subscriptions", { headers: headers(false) });
  renderList(
    "subscriptionList",
    subscriptions,
    (item) => `
      <article class="admin-list-card">
        <div class="admin-list-head">
          <div>
            <strong>${item.userName}</strong>
            <p>${item.campaignTitle}</p>
          </div>
          <span class="admin-badge status-${item.status}">${item.status}</span>
        </div>
        <div class="admin-meta">${currency(item.amount)} | Next payment: ${formatDate(item.nextPaymentDate)}</div>
      </article>
    `,
    "No recurring donors found."
  );
};

const loadReports = async () => {
  const report = await api("/admin/reports", { headers: headers(false) });
  document.getElementById("reportSummary").innerHTML = statCards([
    { label: "Total Donation", value: currency(report.summary.totalDonationAmount), help: "All campaign collections" },
    { label: "Total Donations", value: report.summary.totalDonations, help: "Completed donation records" },
    { label: "Campaigns", value: report.summary.totalCampaigns, help: "Campaigns in this report" },
    { label: "Generated", value: new Date(report.generatedAt).toLocaleDateString("en-IN"), help: "Report timestamp" },
  ]);

  renderList(
    "monthlyReportList",
    report.monthlyReport,
    (item) => `
      <article class="admin-list-card">
        <div class="admin-list-head">
          <strong>${item.month}</strong>
          <span class="admin-badge">${currency(item.amount)}</span>
        </div>
      </article>
    `,
    "Monthly report data not available."
  );

  renderList(
    "campaignReportList",
    report.campaignReport,
    (item) => `
      <article class="admin-list-card">
        <div class="admin-list-head">
          <div>
            <strong>${item.title}</strong>
            <p>${item.donorCount} donors</p>
          </div>
          <span class="admin-badge status-${item.status}">${item.status}</span>
        </div>
        <div class="admin-meta">${currency(item.raisedAmount)} of ${currency(item.goalAmount)}</div>
      </article>
    `,
    "Campaign report data not available."
  );

  document.getElementById("downloadAdminReport")?.addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `admin-report-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  });
};

const loadSettingsHome = async () => {
  const dashboard = await api("/admin/dashboard", { headers: headers(false) });
  document.getElementById("settingsOverview").innerHTML = statCards([
    { label: "My Campaigns", value: dashboard.totals.myCampaigns, help: "Campaigns managed by you" },
    { label: "Pending Campaigns", value: dashboard.totals.pendingCampaigns, help: "Waiting for approval" },
    { label: "Active Subscriptions", value: dashboard.totals.activeSubscriptions, help: "Recurring supporters" },
    { label: "Raised", value: currency(dashboard.totals.totalRaised), help: "All-time collections" },
  ]);
};

const loadProfile = async () => {
  setInputValue("adminProfileName", adminSession.user?.name);
  setInputValue("adminProfileEmail", adminSession.user?.email);
  setInputValue("adminProfileMobile", adminSession.user?.mobile);
  setInputValue("adminProfilePhoto", adminSession.user?.profilePhoto);

  document.getElementById("adminProfileForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = await api("/auth/profile", {
      method: "PUT",
      headers: headers(),
      body: JSON.stringify({
        name: document.getElementById("adminProfileName").value.trim(),
        mobile: document.getElementById("adminProfileMobile").value.trim(),
        profilePhoto: document.getElementById("adminProfilePhoto").value.trim(),
      }),
    });
    localStorage.setItem("user", JSON.stringify(data.user));
    showMessage("adminProfileMessage", "Profile updated successfully.");
  });
};

const loadSecurity = async () => {
  document.getElementById("adminPasswordForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await api("/auth/password", {
      method: "PUT",
      headers: headers(),
      body: JSON.stringify({
        currentPassword: document.getElementById("adminCurrentPassword").value,
        newPassword: document.getElementById("adminNewPassword").value,
        confirmPassword: document.getElementById("adminConfirmPassword").value,
      }),
    });
    event.target.reset();
    showMessage("adminSecurityMessage", "Password updated successfully. New password can be used on next login.");
  });
};

const loadNotifications = async () => {
  document.getElementById("adminNotificationEmail").checked = Boolean(adminSession.user?.notifications?.email);
  document.getElementById("adminNotificationReminders").checked = Boolean(adminSession.user?.notifications?.reminders);

  document.getElementById("adminNotificationForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = await api("/auth/preferences", {
      method: "PUT",
      headers: headers(),
      body: JSON.stringify({
        notifications: {
          email: document.getElementById("adminNotificationEmail").checked,
          reminders: document.getElementById("adminNotificationReminders").checked,
        },
      }),
    });
    localStorage.setItem("user", JSON.stringify(data.user));
    showMessage("adminNotificationMessage", "Notification settings updated successfully.");
  });
};

const initAdmin = async () => {
  const allowed = await ensureAdmin();
  if (!allowed) return;
  renderShell();

  if (pageKey === "dashboard") await loadDashboard();
  if (pageKey === "createCampaign") await loadCampaignEditor();
  if (pageKey === "campaigns") {
    bindSearchForm("campaignSearchForm", [["campaignSearch", "q"], ["campaignStatusFilter", "status"]]);
    await loadCampaigns();
  }
  if (pageKey === "donations") await loadDonations();
  if (pageKey === "subscriptions") await loadSubscriptions();
  if (pageKey === "reports") await loadReports();
  if (pageKey === "settings") await loadSettingsHome();
  if (pageKey === "profile") await loadProfile();
  if (pageKey === "security") await loadSecurity();
  if (pageKey === "notifications") await loadNotifications();
};

initAdmin().catch((error) => {
  const mount = document.querySelector("[data-page-content]");
  if (mount) {
    mount.innerHTML = `<div class="admin-card"><div class="admin-message is-error">${error.message}</div></div>`;
  }
});
