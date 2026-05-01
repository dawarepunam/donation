const API_BASE = window.appSession?.apiBase || `${window.location.origin}/api`;
const token = localStorage.getItem("token");
let storedUser = JSON.parse(localStorage.getItem("user") || "null");

if (!token) {
  window.location.href = "login.html";
}

if (storedUser?.setup?.required) {
  window.location.href = "account-setup.html";
}

const currency = (amount) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount || 0);

const noun = (count, singular, plural = `${singular}s`) => (count === 1 ? singular : plural);

const authHeaders = {
  Authorization: token,
};

const linkToCampaign = (id) => `campaign.html?id=${id}`;

const formatDate = (value) =>
  new Date(value).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

const formatDateTime = (value) =>
  new Date(value).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

const buildProfileAvatar = (profile) =>
  profile?.profilePhoto
    ? `<img class="profile-avatar image-avatar" src="${profile.profilePhoto}" alt="${profile.name || "Supporter"}" />`
    : `<div class="profile-avatar">${(profile?.name || storedUser?.name || "S").slice(0, 1).toUpperCase()}</div>`;

const renderBreakdownCards = (entries, fallback) =>
  entries.length
    ? entries
        .map(
          ([label, amount]) => `
            <div class="list-card">
              <strong>${label}</strong>
              <p>${currency(amount)}</p>
            </div>
          `
        )
        .join("")
    : `<div class="empty-state">${fallback}</div>`;

const renderDeletionBanner = (profile = {}) => {
  const existing = document.getElementById("dashboardDeletionBanner");
  if (existing) {
    existing.remove();
  }

  if (!profile.accountDeletion?.isScheduled) {
    return;
  }

  // Surface the countdown prominently after login so donors can still cancel within the grace period.
  const banner = document.createElement("section");
  banner.id = "dashboardDeletionBanner";
  banner.className = "panel dashboard-alert-banner";
  banner.innerHTML = `
    <strong>Account deletion is scheduled.</strong>
    <p>${profile.accountDeletion.remainingDays} day${profile.accountDeletion.remainingDays === 1 ? "" : "s"} remaining before permanent deletion.</p>
    <a class="btn btn-secondary" href="delete-account.html">Review or Cancel</a>
  `;

  document.getElementById("dashboardSummary")?.before(banner);
};

const renderCampaignQuickNav = async () => {
  const res = await fetch(`${API_BASE}/campaign`);
  const campaigns = await res.json();
  const nav = document.getElementById("campaignQuickNav");

  if (!Array.isArray(campaigns) || !nav) return;

  nav.innerHTML = campaigns.length
    ? campaigns
        .slice(0, 8)
        .map(
          (campaign) => `
            <a class="campaign-link-card" href="${linkToCampaign(campaign._id)}">
              <strong>${campaign.title}</strong>
              <span>${currency(campaign.raisedAmount)} raised</span>
            </a>
          `
        )
        .join("")
    : `<div class="empty-state">Campaign links will appear here.</div>`;
};

let dashboardRefreshTimer = null;
const scheduleDashboardRefresh = () => {
  if (dashboardRefreshTimer) {
    window.clearTimeout(dashboardRefreshTimer);
  }

  dashboardRefreshTimer = window.setTimeout(() => {
    fetchDashboard().catch(() => {});
  }, 500);
};

const renderHero = (data) => {
  const profileName = data.profile?.name || storedUser?.name || "Supporter";
  const lastDonationDate = data.summary.lastDonation?.date ? formatDate(data.summary.lastDonation.date) : "No donations yet";

  document.getElementById("dashboardGreeting").textContent = `Welcome back, ${profileName}.`;
  document.getElementById("dashboardHeroMeta").textContent = `You have contributed ${currency(
    data.summary.totalDonated
  )} across ${data.summary.totalDonations} ${noun(data.summary.totalDonations, "donation")} and can manage profile, security, subscriptions, and tax documents from dedicated pages.`;
  document.getElementById("dashboardBadge").textContent = `${data.summary.badge} Donor`;

  document.getElementById("heroProfileCard").innerHTML = `
    <div class="profile-card profile-card-hero">
      ${buildProfileAvatar(data.profile)}
      <div>
        <strong>${profileName}</strong>
        <p>${data.profile?.email || storedUser?.email || ""}</p>
        <p>${data.profile?.mobile || "Mobile not added yet"}</p>
      </div>
    </div>
  `;

  document.getElementById("dashboardPulse").innerHTML = `
    <div class="pulse-item">
      <span>Last donation</span>
      <strong>${lastDonationDate}</strong>
    </div>
    <div class="pulse-item">
      <span>Active plans</span>
      <strong>${data.summary.activeSubscriptions || 0}</strong>
    </div>
    <div class="pulse-item">
      <span>Impact created</span>
      <strong>${data.summary.totalImpactUnits} lives touched</strong>
    </div>
  `;
};

const renderSummary = (data) => {
  document.getElementById("dashboardSummary").innerHTML = `
    <article class="summary-card">
      <span>Total donation</span>
      <strong>${currency(data.summary.totalDonated)}</strong>
    </article>
    <article class="summary-card">
      <span>Last donation</span>
      <strong>${data.summary.lastDonation ? currency(data.summary.lastDonation.amount) : "No donations"}</strong>
    </article>
    <article class="summary-card">
      <span>Active subscription</span>
      <strong>${data.summary.activeSubscriptions ? `${data.summary.activeSubscriptions} live` : "Not active"}</strong>
    </article>
    <article class="summary-card">
      <span>Badge</span>
      <strong>${data.summary.badge}</strong>
    </article>
    <article class="summary-card">
      <span>Total donations</span>
      <strong>${data.summary.totalDonations}</strong>
    </article>
    <article class="summary-card">
      <span>Impact</span>
      <strong>${data.summary.totalImpactUnits} lives touched</strong>
    </article>
    <article class="summary-card">
      <span>Recurring total</span>
      <strong>${currency(data.summary.recurringTotal || 0)}</strong>
    </article>
    <article class="summary-card">
      <span>Campaigns supported</span>
      <strong>${data.profile?.totalCampaignsSupported || 0}</strong>
    </article>
  `;
};

const renderImpactSpotlight = (data) => {
  const lastDonation = data.summary.lastDonation;
  const impactMessage = lastDonation?.impactMessage || `You helped create ${data.summary.totalImpactUnits} measurable moments of support.`;

  document.getElementById("impactSpotlight").innerHTML = `
    <div class="impact-copy">
      <span class="impact-label">Your giving impact</span>
      <h3>${impactMessage}</h3>
      <p>
        This page is now your high-level overview. Detailed account controls and documents are available from dedicated pages in the profile dropdown.
      </p>
    </div>
    <div class="impact-metrics">
      <div class="impact-metric">
        <strong>${currency(data.summary.totalDonated)}</strong>
        <span>Total contribution</span>
      </div>
      <div class="impact-metric">
        <strong>${data.summary.totalImpactUnits}</strong>
        <span>Impact units</span>
      </div>
      <div class="impact-metric">
        <strong>${data.summary.badge}</strong>
        <span>Supporter tier</span>
      </div>
    </div>
  `;
};

const renderRecentActivity = (recentActivity = []) => {
  document.getElementById("recentActivity").innerHTML = recentActivity.length
    ? recentActivity
        .map(
          (item) => `
            <div class="list-card activity-card">
              <strong>${item.campaignTitle}</strong>
              <p>${currency(item.amount)} | ${item.paymentStatus}</p>
              <small>${formatDateTime(item.date)}</small>
              <small>${item.donationType === "monthly" ? `Monthly cycle ${item.cycleNumber || 1}` : "One-time donation"}</small>
            </div>
          `
        )
        .join("")
    : `<div class="empty-state">Your latest payment activity will appear here.</div>`;
};

const renderTimeline = (timeline = []) => {
  document.getElementById("timeline").innerHTML = timeline.length
    ? timeline
        .map(
          (item) => `
            <div class="list-card">
              <strong>${item.label}</strong>
              <p>${currency(item.amount)}</p>
              <small>${item.donationsCount || 0} ${noun(item.donationsCount || 0, "donation")}</small>
            </div>
          `
        )
        .join("")
    : `<div class="empty-state">Timeline will populate after your first donation.</div>`;
};

const renderHistory = (donations = []) => {
  document.getElementById("history").innerHTML = donations.length
    ? donations
        .map(
          (donation) => `
            <article class="history-card">
              <div class="history-card-top">
                <strong>${currency(donation.amount)}</strong>
                <span class="campaign-status ${donation.payment?.status || "paid"}">${donation.payment?.status || "paid"}</span>
              </div>
              <p>${donation.campaignId?.title || "Campaign"}</p>
              <small>${formatDateTime(donation.date)}</small>
              <small>${donation.impactMessage}</small>
              <small>FY ${donation.financialYear}</small>
              <small>Payment ID: ${donation.payment?.paymentId || "-"}</small>
            </article>
          `
        )
        .join("")
    : `<div class="empty-state">No donations match these filters.</div>`;
};

const renderSupportedCampaigns = (supportedCampaigns = []) => {
  document.getElementById("supportedCampaigns").innerHTML = supportedCampaigns.length
    ? supportedCampaigns
        .map((item) => `
          <div class="list-card">
            <strong>${item.title}</strong>
            <p>${currency(item.totalDonated)} across ${item.donationsCount} ${noun(item.donationsCount, "donation")}</p>
            ${item.lastDonatedAt ? `<small>Last donated on ${formatDate(item.lastDonatedAt)}</small>` : ""}
          </div>
        `)
        .join("")
    : `<div class="empty-state">Your supported campaigns will appear here.</div>`;
};

const renderMyImpact = (items = []) => {
  const target = document.getElementById("myImpact");
  if (!target) return;

  target.innerHTML = items.length
    ? items
        .map(
          (item) => `
            <article class="list-card my-impact-card">
              <div class="history-card-top">
                <strong>${item.campaignTitle}</strong>
                <span class="campaign-status paid">${currency(item.totalDonated)}</span>
              </div>
              <p>${item.message}</p>
              ${item.latestImpactStory ? `<small>${item.latestImpactStory}</small>` : ""}
              <small>${formatDate(item.latestImpactDate)}${item.latestImpactLocation ? ` | ${item.latestImpactLocation}` : ""}</small>
              <small>${item.impactNumber} ${item.impactLabel} in the latest field update</small>
              ${
                item.photos?.length
                  ? `<div class="my-impact-media">${item.photos
                      .map((photo) => `<img src="${photo.url}" alt="${item.campaignTitle}" />`)
                      .join("")}</div>`
                  : ""
              }
              <a class="mini-link" href="${linkToCampaign(item.campaignId)}">Open campaign update</a>
            </article>
          `
        )
        .join("")
    : `<div class="empty-state">Approved campaign event updates will appear here after your supported causes publish them.</div>`;
};

const renderEventUpdates = (items = []) => {
  const target = document.getElementById("eventUpdatesList");
  if (!target) return;

  target.innerHTML = items.length
    ? items
        .map(
          (item) => `
            <article class="list-card event-update-card">
              <div class="history-card-top">
                <strong>${item.title}</strong>
                <span class="campaign-status ${item.isLiveUpdate ? "active" : "paid"}">${item.isLiveUpdate ? item.liveLabel || "Live" : "Approved"}</span>
              </div>
              <p>${item.campaignTitle}</p>
              <small>${formatDateTime(item.eventDate)}${item.location ? ` | ${item.location}` : ""}</small>
              <small>${item.description || "Campaign event update published for donors."}</small>
              <small>${currency(item.fundUsed)} used | ${item.impactNumber} ${item.impactLabel} | ${item.progressPercent}% progress</small>
              ${
                item.storyTitle || item.storyDescription
                  ? `<small><strong>${item.storyTitle || "Story"}:</strong> ${item.storyDescription || ""}</small>`
                  : ""
              }
              ${
                item.metrics?.length
                  ? `<div class="event-inline-metrics">${item.metrics
                      .map((metric) => `<span>${metric.label}: <strong>${metric.value}</strong></span>`)
                      .join("")}</div>`
                  : ""
              }
              ${
                item.photos?.length
                  ? `<div class="my-impact-media">${item.photos
                      .map((photo) => `<img src="${photo.url}" alt="${item.title}" />`)
                      .join("")}</div>`
                  : ""
              }
              <div class="action-row">
                <a class="mini-link" href="${linkToCampaign(item.campaignId)}">Open campaign</a>
                ${item.mapLink ? `<a class="mini-link" href="${item.mapLink}" target="_blank">Open location</a>` : ""}
                ${item.shareMessage ? `<a class="mini-link" href="https://wa.me/?text=${encodeURIComponent(item.shareMessage)}" target="_blank">Share update</a>` : ""}
              </div>
            </article>
          `
        )
        .join("")
    : `<div class="empty-state">Campaign events will appear here when your supported causes publish approved updates.</div>`;
};

const renderMarketingInbox = (items = []) => {
  const target = document.getElementById("marketingInboxList");
  if (!target) return;

  target.innerHTML = items.length
    ? items
        .map(
          (item) => `
            <article class="list-card marketing-message-card">
              <div class="history-card-top">
                <strong>${item.marketingTitle}</strong>
                <span class="campaign-status ${item.status || "paid"}">${item.channel}</span>
              </div>
              <p>${item.subject}</p>
              <small>${item.campaignTitle}</small>
              <small>${formatDateTime(item.sentAt)}${item.clickedAt ? ` | Clicked: ${formatDateTime(item.clickedAt)}` : ""}</small>
              <div class="marketing-message-preview">${item.message.replaceAll("\n", "<br />")}</div>
              <small>Variant ${item.variant} | Clicks tracked: ${item.clickCount || 0}</small>
              <div class="action-row">
                ${item.campaignId ? `<a class="mini-link" href="${linkToCampaign(item.campaignId)}">Open campaign</a>` : ""}
                ${item.shareLink ? `<a class="mini-link" href="${item.shareLink}" target="_blank">Open WhatsApp draft</a>` : ""}
              </div>
            </article>
          `
        )
        .join("")
    : `<div class="empty-state">Marketing messages sent to your account will appear here.</div>`;
};

const renderReminders = (reminders = []) => {
  document.getElementById("reminders").innerHTML = reminders.length
    ? reminders
        .map(
          (item) => `
            <div class="list-card">
              <strong>${item.title}</strong>
              <p>${item.message}</p>
              <small>${formatDate(item.date)}</small>
            </div>
          `
        )
        .join("")
    : `<div class="empty-state">Reminder timeline will appear here.</div>`;
};

const renderQuickActions = () => {
  document.getElementById("dashboardQuickActions").innerHTML = `
    <a class="quick-action-card" href="profile.html">
      <strong>Profile</strong>
      <p>Edit your donor identity, mobile number, and photo.</p>
    </a>
    <a class="quick-action-card" href="documents.html">
      <strong>Tax & Documents</strong>
      <p>Open tax summaries, receipts, and certificate exports.</p>
    </a>
    <a class="quick-action-card" href="subscriptions.html">
      <strong>Subscriptions</strong>
      <p>Review recurring plans and cancel active cycles.</p>
    </a>
    <a class="quick-action-card" href="security.html">
      <strong>Security</strong>
      <p>Change password and protect your account.</p>
    </a>
  `;
};

const renderFinancialYearOptions = (availableFinancialYears = []) => {
  const fySelect = document.getElementById("filterFinancialYear");
  const currentFyValue = fySelect.value;

  fySelect.innerHTML = `<option value="">All</option>${availableFinancialYears
    .map((item) => `<option value="${item}">${item}</option>`)
    .join("")}`;
  fySelect.value = currentFyValue;
};

const renderDashboard = (data) => {
  const donations = Array.isArray(data.donations) ? data.donations : [];
  const timeline = Array.isArray(data.timeline) ? data.timeline : [];
  const recentActivity = Array.isArray(data.recentActivity) ? data.recentActivity : [];
  const supportedCampaigns = Array.isArray(data.campaignsSupported) ? data.campaignsSupported : [];
  const myImpact = Array.isArray(data.myImpact) ? data.myImpact : [];
  const eventUpdates = Array.isArray(data.eventUpdates) ? data.eventUpdates : [];
  const marketingMessages = Array.isArray(data.marketingMessages) ? data.marketingMessages : [];
  const reminders = Array.isArray(data.reminders) ? data.reminders : [];
  const availableFinancialYears = Array.isArray(data.filters?.availableFinancialYears)
    ? data.filters.availableFinancialYears
    : [];

  renderDeletionBanner(data.profile);
  renderHero(data);
  renderSummary(data);
  renderImpactSpotlight(data);
  renderRecentActivity(recentActivity);
  renderTimeline(timeline);
  renderHistory(donations);
  renderSupportedCampaigns(supportedCampaigns);
  renderMyImpact(myImpact);
  renderEventUpdates(eventUpdates);
  renderMarketingInbox(marketingMessages);
  renderReminders(reminders);
  renderQuickActions();
  renderFinancialYearOptions(availableFinancialYears);
};

const fetchDashboard = async () => {
  const params = new URLSearchParams();
  const year = document.getElementById("filterYear").value;
  const month = document.getElementById("filterMonth").value;
  const financialYear = document.getElementById("filterFinancialYear").value;

  if (year) params.set("year", year);
  if (month) params.set("month", month);
  if (financialYear) params.set("financialYear", financialYear);

  const res = await fetch(`${API_BASE}/donation/user?${params.toString()}`, {
    headers: authHeaders,
  });
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.message || data.msg || "Unable to load dashboard");
  }

  renderDashboard(data);
};

document.getElementById("applyFilters").addEventListener("click", () => {
  fetchDashboard().catch((error) => {
    alert(error.message);
  });
});

fetchDashboard().catch((error) => {
  document.getElementById("history").innerHTML = `<div class="empty-state">${error.message}</div>`;
});

renderCampaignQuickNav().catch(() => {});

if (typeof io === "function") {
  const dashboardSocket = io(window.appSession?.origin || window.location.origin);
  dashboardSocket.on("donation:new", scheduleDashboardRefresh);
  dashboardSocket.on("campaign:updated", scheduleDashboardRefresh);
}
