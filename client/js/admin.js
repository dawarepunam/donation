const API_BASE = window.appSession?.apiBase || `${window.location.origin}/api`;
const token = localStorage.getItem("token");
const sessionUser = JSON.parse(localStorage.getItem("user") || "null");

const headers = {
  "Content-Type": "application/json",
  ...(token ? { Authorization: token } : {}),
};

const currency = (amount) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount || 0);

const toLines = (value = "") =>
  String(value)
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);

const parseLineItems = (value, type) =>
  value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [first, second, ...rest] = line.split("|").map((item) => item.trim());
      if (type === "media") {
        return { type: first || "image", url: second || "" };
      }
      return {
        title: first || "",
        percentage: Number(second || 0),
        description: rest.join(" | "),
      };
    })
    .filter((item) => {
      if (type === "media") return item.url;
      return item.title;
    });

const hydrateCampaignForm = (campaign = null) => {
  document.getElementById("campaignId").value = campaign?._id || "";
  document.getElementById("title").value = campaign?.title || "";
  document.getElementById("tagline").value = campaign?.tagline || "";
  document.getElementById("goalAmount").value = campaign?.goalAmount || "";
  document.getElementById("impactPerUnit").value = campaign?.impactPerUnit || 250;
  document.getElementById("impactLabel").value = campaign?.impactLabel || "child supported";
  document.getElementById("category").value = campaign?.category || "Community Support";
  document.getElementById("location").value = campaign?.location || "";
  document.getElementById("coverImage").value = campaign?.coverImage || "";
  document.getElementById("description").value = campaign?.description || "";
  document.getElementById("storyTitle").value = campaign?.story?.title || "";
  document.getElementById("storyImpact").value = campaign?.story?.impact || "";
  document.getElementById("storyDescription").value = campaign?.story?.description || "";
  document.getElementById("storyImageUrl").value = campaign?.story?.imageUrl || "";
  document.getElementById("mediaLines").value = (campaign?.media || [])
    .map((item) => `${item.type}|${item.url}`)
    .join("\n");
  document.getElementById("allocationLines").value = (campaign?.whereMoneyGoes || [])
    .map((item) => `${item.title}|${item.percentage}|${item.description}`)
    .join("\n");
  document.getElementById("ngoName").value = campaign?.ngoDetails?.name || "";
  document.getElementById("ngoPan").value = campaign?.ngoDetails?.pan || "";
  document.getElementById("ngo80G").value = campaign?.ngoDetails?.eightyGNumber || "";
  document.getElementById("ngoPhone").value = campaign?.ngoDetails?.phone || "";
  document.getElementById("ngoEmail").value = campaign?.ngoDetails?.email || "";
  document.getElementById("ngoAddress").value = campaign?.ngoDetails?.address || "";
  document.getElementById("featured").checked = Boolean(campaign?.featured);
};

const readCampaignPayload = () => ({
  title: document.getElementById("title").value.trim(),
  tagline: document.getElementById("tagline").value.trim(),
  goalAmount: Number(document.getElementById("goalAmount").value),
  impactPerUnit: Number(document.getElementById("impactPerUnit").value),
  impactLabel: document.getElementById("impactLabel").value.trim(),
  category: document.getElementById("category").value.trim(),
  location: document.getElementById("location").value.trim(),
  coverImage: document.getElementById("coverImage").value.trim(),
  description: document.getElementById("description").value.trim(),
  featured: document.getElementById("featured").checked,
  media: parseLineItems(document.getElementById("mediaLines").value, "media"),
  whereMoneyGoes: parseLineItems(document.getElementById("allocationLines").value, "allocation"),
  ngoDetails: {
    name: document.getElementById("ngoName").value.trim(),
    pan: document.getElementById("ngoPan").value.trim(),
    eightyGNumber: document.getElementById("ngo80G").value.trim(),
    phone: document.getElementById("ngoPhone").value.trim(),
    email: document.getElementById("ngoEmail").value.trim(),
    address: document.getElementById("ngoAddress").value.trim(),
  },
  story: {
    title: document.getElementById("storyTitle").value.trim(),
    impact: document.getElementById("storyImpact").value.trim(),
    description: document.getElementById("storyDescription").value.trim(),
    imageUrl: document.getElementById("storyImageUrl").value.trim(),
  },
});

const renderAdmin = ({ stats, donations }) => {
  document.getElementById("adminStats").innerHTML = `
    <div class="dashboard-summary">
      <article class="summary-card">
        <span>Total campaigns</span>
        <strong>${stats.totals.totalCampaigns}</strong>
      </article>
      <article class="summary-card">
        <span>Active campaigns</span>
        <strong>${stats.totals.activeCampaigns}</strong>
      </article>
      <article class="summary-card">
        <span>Total collections</span>
        <strong>${currency(stats.totals.totalAmount)}</strong>
      </article>
      <article class="summary-card">
        <span>Subscription revenue</span>
        <strong>${currency(stats.totals.subscriptionRevenue)}</strong>
      </article>
    </div>
    <div class="stack-list">
      ${(stats.monthlyDonations || [])
        .map(
          (item) => `
            <div class="list-card">
              <strong>${item.month}</strong>
              <p>${currency(item.amount)}</p>
            </div>
          `
        )
        .join("")}
    </div>
  `;

  document.getElementById("adminDonations").innerHTML = donations.length
    ? donations
        .slice(0, 10)
        .map(
          (donation) => `
            <div class="list-card">
              <strong>${donation.isAnonymous ? "Anonymous supporter" : donation.donorName}</strong>
              <p>${currency(donation.amount)} | ${donation.campaignId?.title || "Campaign"}</p>
              <small>${new Date(donation.date).toLocaleString("en-IN")}</small>
              <small>FY ${donation.financialYear}</small>
            </div>
          `
        )
        .join("")
    : `<div class="empty-state">Donations will appear here after payments succeed.</div>`;

  document.getElementById("adminCampaignList").innerHTML = stats.campaigns.length
    ? stats.campaigns
        .map(
          (campaign) => `
            <article class="list-card admin-campaign-card">
              <div class="history-card-top">
                <strong>${campaign.title}</strong>
                <span class="campaign-status ${campaign.status}">${campaign.status}</span>
              </div>
              <p>${campaign.tagline || campaign.description || "No tagline added yet."}</p>
              <small>${currency(campaign.raisedAmount)} raised of ${currency(campaign.goalAmount)}</small>
              <small>${campaign.donorCount} donors | ${campaign.category || "Community Support"}</small>
              <div class="action-row">
                <button class="btn btn-secondary edit-campaign-btn" type="button" data-id="${campaign._id}">Edit</button>
              </div>
            </article>
          `
        )
        .join("")
    : `<div class="empty-state">Campaigns will appear here after creation.</div>`;

  document.getElementById("adminLeaderboard").innerHTML = stats.leaderboard.length
    ? stats.leaderboard
        .map(
          (entry, index) => `
            <div class="leaderboard-card">
              <div>
                <span class="leaderboard-rank">#${index + 1}</span>
                <strong>${entry.donorName}</strong>
                <p>${entry.campaignTitle}</p>
              </div>
              <strong>${currency(entry.amount)}</strong>
            </div>
          `
        )
        .join("")
    : `<div class="empty-state">Leaderboard entries will appear here.</div>`;

  document.querySelectorAll(".edit-campaign-btn").forEach((button) => {
    button.addEventListener("click", () => {
      const campaign = stats.campaigns.find((item) => item._id === button.dataset.id);
      hydrateCampaignForm(campaign);
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });
};

const renderSuperAdminOverview = (dashboard) => {
  const target = document.getElementById("superAdminOverview");
  if (!target) return;

  target.innerHTML = `
    <article class="summary-card">
      <span>Total users</span>
      <strong>${dashboard.totals.totalUsers}</strong>
    </article>
    <article class="summary-card">
      <span>Total admins</span>
      <strong>${dashboard.totals.totalAdmins}</strong>
    </article>
    <article class="summary-card">
      <span>Total donation</span>
      <strong>${currency(dashboard.totals.totalDonationAmount)}</strong>
    </article>
    <article class="summary-card">
      <span>Active users</span>
      <strong>${dashboard.totals.activeUsers}</strong>
    </article>
    <article class="summary-card">
      <span>Active campaigns</span>
      <strong>${dashboard.totals.activeCampaigns}</strong>
    </article>
    <article class="summary-card">
      <span>Subscriptions</span>
      <strong>${dashboard.totals.activeSubscriptions}</strong>
    </article>
  `;
};

const renderSuperAdminUsers = ({ users, admins }) => {
  const usersTarget = document.getElementById("superAdminUsers");
  const adminsTarget = document.getElementById("superAdminAdmins");
  if (!usersTarget || !adminsTarget) return;

  usersTarget.innerHTML = users.length
    ? users
        .map(
          (user) => `
            <article class="list-card access-card">
              <div class="history-card-top">
                <strong>${user.name}</strong>
                <span class="role-pill role-${user.role}">${user.role}</span>
              </div>
              <p>${user.email}</p>
              <small>Status: ${user.isActive ? "Active" : "Blocked"}</small>
              <small>Total donated: ${currency(user.totalDonated)}</small>
              <div class="action-row">
                <button class="btn btn-secondary access-toggle-btn" type="button" data-id="${user.id}" data-active="${user.isActive}">
                  ${user.isActive ? "Block" : "Unblock"}
                </button>
                <button class="btn btn-secondary donation-history-btn" type="button" data-id="${user.id}">Donation History</button>
              </div>
              <div id="donation-history-${user.id}" class="compact-history"></div>
            </article>
          `
        )
        .join("")
    : `<div class="empty-state">No users found.</div>`;

  adminsTarget.innerHTML = admins.length
    ? admins
        .map(
          (admin) => `
            <article class="list-card access-card">
              <div class="history-card-top">
                <strong>${admin.name}</strong>
                <span class="role-pill role-${admin.role}">${admin.role}</span>
              </div>
              <p>${admin.email}</p>
              <small>Status: ${admin.isActive ? "Active" : "Blocked"}</small>
              <small>Permissions: ${(admin.permissions || []).join(", ") || "No explicit permissions"}</small>
              <div class="action-row">
                ${
                  admin.role !== "superadmin"
                    ? `
                      <button class="btn btn-secondary access-toggle-btn" type="button" data-id="${admin.id}" data-active="${admin.isActive}">
                        ${admin.isActive ? "Block" : "Unblock"}
                      </button>
                      <button class="btn btn-secondary delete-user-btn" type="button" data-id="${admin.id}">Delete</button>
                    `
                    : ""
                }
              </div>
            </article>
          `
        )
        .join("")
    : `<div class="empty-state">No admins found.</div>`;

  document.querySelectorAll(".access-toggle-btn").forEach((button) => {
    button.addEventListener("click", async () => {
      const isActive = button.dataset.active === "true";
      await updateUserAccess(button.dataset.id, { isActive: !isActive });
    });
  });

  document.querySelectorAll(".delete-user-btn").forEach((button) => {
    button.addEventListener("click", async () => {
      const confirmed = window.confirm("Delete this account permanently?");
      if (!confirmed) return;
      await deleteUser(button.dataset.id);
    });
  });

  document.querySelectorAll(".donation-history-btn").forEach((button) => {
    button.addEventListener("click", async () => {
      await loadUserDonationHistory(button.dataset.id);
    });
  });
};

const renderSuperAdminMetrics = (dashboard) => {
  const revenueTarget = document.getElementById("superAdminRevenue");
  const recentTarget = document.getElementById("superAdminRecent");
  if (!revenueTarget || !recentTarget) return;

  revenueTarget.innerHTML = dashboard.monthlyRevenue.length
    ? dashboard.monthlyRevenue
        .map(
          (item) => `
            <div class="list-card">
              <strong>${item.month}</strong>
              <p>${currency(item.amount)}</p>
            </div>
          `
        )
        .join("")
    : `<div class="empty-state">Monthly revenue will appear here.</div>`;

  recentTarget.innerHTML = dashboard.recentDonations.length
    ? dashboard.recentDonations
        .map(
          (item) => `
            <div class="list-card">
              <strong>${item.donorName}</strong>
              <p>${item.campaignTitle}</p>
              <small>${currency(item.amount)}</small>
              <small>${new Date(item.createdAt).toLocaleString("en-IN")}</small>
            </div>
          `
        )
        .join("")
    : `<div class="empty-state">Recent activity will appear here.</div>`;
};

const loadUserDonationHistory = async (userId) => {
  const target = document.getElementById(`donation-history-${userId}`);
  if (!target) return;

  target.innerHTML = `<div class="mini-note">Loading donation history...</div>`;
  const res = await fetch(`${API_BASE}/superadmin/users/${userId}/donations`, { headers });
  const data = await res.json();

  if (!res.ok) {
    target.innerHTML = `<div class="mini-note">${data.message || "Unable to load donation history"}</div>`;
    return;
  }

  target.innerHTML = data.length
    ? data
        .map(
          (item) => `
            <div class="mini-history-row">
              <strong>${currency(item.amount)}</strong>
              <span>${item.campaignTitle}</span>
            </div>
          `
        )
        .join("")
    : `<div class="mini-note">No donations found for this user.</div>`;
};

const updateUserAccess = async (userId, payload) => {
  const res = await fetch(`${API_BASE}/superadmin/users/${userId}/access`, {
    method: "PUT",
    headers,
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) {
    alert(data.message || "Unable to update access");
    return;
  }

  await loadSuperAdmin();
};

const deleteUser = async (userId) => {
  const res = await fetch(`${API_BASE}/superadmin/users/${userId}`, {
    method: "DELETE",
    headers,
  });
  const data = await res.json();
  if (!res.ok) {
    alert(data.message || "Unable to delete user");
    return;
  }

  await loadSuperAdmin();
};

const loadSuperAdmin = async () => {
  const panel = document.getElementById("superAdminPanel");
  if (!panel || sessionUser?.role !== "superadmin") return;

  // The existing admin view remains unchanged; this block only hydrates when a superadmin is logged in.
  panel.classList.remove("hidden");

  const [dashboardRes, usersRes, adminsRes] = await Promise.all([
    fetch(`${API_BASE}/superadmin/dashboard`, { headers }),
    fetch(`${API_BASE}/superadmin/users?role=user`, { headers }),
    fetch(`${API_BASE}/superadmin/users?role=admin`, { headers }),
  ]);

  const dashboard = await dashboardRes.json();
  const users = await usersRes.json();
  const admins = await adminsRes.json();

  if (!dashboardRes.ok) {
    throw new Error(dashboard.message || "Unable to load superadmin dashboard");
  }
  if (!usersRes.ok) {
    throw new Error(users.message || "Unable to load users");
  }
  if (!adminsRes.ok) {
    throw new Error(admins.message || "Unable to load admins");
  }

  renderSuperAdminOverview(dashboard);
  renderSuperAdminUsers({ users, admins });
  renderSuperAdminMetrics(dashboard);
};

const loadAdmin = async () => {
  if (!token) {
    document.getElementById("adminStats").innerHTML =
      '<div class="empty-state">Login with the admin account to access this panel.</div>';
    return;
  }

  if (sessionUser?.role !== "admin") {
    document.getElementById("adminStats").innerHTML =
      '<div class="empty-state">This panel is only available to admin users configured in the server environment.</div>';
  }

  const [statsRes, donationsRes] = await Promise.all([
    fetch(`${API_BASE}/admin/stats`, { headers }),
    fetch(`${API_BASE}/admin/donations`, { headers }),
  ]);

  const stats = await statsRes.json();
  const donations = await donationsRes.json();
  if (!statsRes.ok) {
    throw new Error(stats.message || stats.msg || "Unable to load admin stats");
  }
  if (!donationsRes.ok) {
    throw new Error(donations.message || donations.msg || "Unable to load donations");
  }

  renderAdmin({ stats, donations });
  await loadSuperAdmin();
};

const superAdminCreateForm = document.getElementById("superAdminCreateForm");
if (superAdminCreateForm) {
  superAdminCreateForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const payload = {
      name: document.getElementById("superAdminName").value.trim(),
      email: document.getElementById("superAdminEmail").value.trim(),
      password: document.getElementById("superAdminPassword").value,
      mobile: document.getElementById("superAdminMobile").value.trim(),
      permissions: toLines(document.getElementById("superAdminPermissions").value),
    };

    const res = await fetch(`${API_BASE}/superadmin/admins`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    const data = await res.json();

    if (!res.ok) {
      alert(data.message || "Unable to create admin");
      return;
    }

    superAdminCreateForm.reset();
    await loadSuperAdmin();
  });
}

document.getElementById("campaignForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  const campaignId = document.getElementById("campaignId").value;
  const payload = readCampaignPayload();
  const isEdit = Boolean(campaignId);

  const res = await fetch(
    `${API_BASE}/campaign/${isEdit ? campaignId : "create"}`,
    {
      method: isEdit ? "PUT" : "POST",
      headers,
      body: JSON.stringify(payload),
    }
  );

  const data = await res.json();
  if (!res.ok) {
    alert(data.message || "Unable to save campaign");
    return;
  }

  hydrateCampaignForm(null);
  await loadAdmin();
});

document.getElementById("resetCampaignForm").addEventListener("click", () => {
  hydrateCampaignForm(null);
});

document.getElementById("markCompleted").addEventListener("click", async () => {
  const campaignId = document.getElementById("campaignId").value;
  if (!campaignId) {
    alert("Select a campaign to mark it completed.");
    return;
  }

  const payload = {
    ...readCampaignPayload(),
    status: "completed",
  };

  const res = await fetch(`${API_BASE}/campaign/${campaignId}`, {
    method: "PUT",
    headers,
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) {
    alert(data.message || "Unable to update campaign status");
    return;
  }

  hydrateCampaignForm(data);
  await loadAdmin();
});

hydrateCampaignForm(null);
loadAdmin().catch((error) => {
  document.getElementById("adminStats").innerHTML = `<div class="empty-state">${error.message}</div>`;
});
