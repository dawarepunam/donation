const API_BASE = window.appSession?.apiBase || `${window.location.origin}/api`;
const token = localStorage.getItem("token");
let storedUser = JSON.parse(localStorage.getItem("user") || "null");

if (!token) {
  window.location.href = "login.html";
}

if (storedUser?.setup?.required) {
  window.location.href = "account-setup.html";
}

const authHeaders = {
  Authorization: token,
};

const currency = (amount) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount || 0);

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

const deletionCountdown = (accountDeletion = {}) => {
  if (!accountDeletion?.isScheduled || accountDeletion.remainingDays == null) return "";
  return `${accountDeletion.remainingDays} day${accountDeletion.remainingDays === 1 ? "" : "s"} remaining`;
};

const pageKey = document.body.dataset.settingsPage || "profile";

const pageMeta = {
  profile: {
    title: "Profile",
    intro: "Edit your donor identity, contact details, and profile photo from a dedicated page.",
    icon: `<svg viewBox="0 0 24 24"><path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm0 2c-4.42 0-8 1.79-8 4v2h16v-2c0-2.21-3.58-4-8-4Z"/></svg>`,
    href: "profile.html",
  },
  documents: {
    title: "Tax & Documents",
    intro: "Review tax totals, donation years, and export-ready records without opening the dashboard.",
    icon: `<svg viewBox="0 0 24 24"><path d="M7 3h7l5 5v13H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm7 1.5V9h4.5"/></svg>`,
    href: "documents.html",
  },
  updates: {
    title: "Updates",
    intro: "See approved campaign events and messages sent to your donor account on a separate page.",
    icon: `<svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h10"/></svg>`,
    href: "updates.html",
  },
  subscriptions: {
    title: "Subscriptions",
    intro: "Manage recurring contributions and monitor upcoming payment cycles from a single place.",
    icon: `<svg viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7"/></svg>`,
    href: "subscriptions.html",
  },
  privacy: {
    title: "Privacy",
    intro: "Control how your donor identity appears and how future donations should be handled.",
    icon: `<svg viewBox="0 0 24 24"><path d="M12 3 5 6v6c0 4.97 3.06 9.63 7 11 3.94-1.37 7-6.03 7-11V6Z"/></svg>`,
    href: "privacy.html",
  },
  notifications: {
    title: "Notifications",
    intro: "Choose which email updates and reminder nudges you want to receive.",
    icon: `<svg viewBox="0 0 24 24"><path d="M15 17h5l-1.4-1.4a2 2 0 0 1-.6-1.42V11a6 6 0 1 0-12 0v3.18a2 2 0 0 1-.6 1.42L4 17h5m3 0a2 2 0 0 1-4 0"/></svg>`,
    href: "notifications.html",
  },
  security: {
    title: "Security",
    intro: "Update your password, review account protection details, and delete your account if needed.",
    icon: `<svg viewBox="0 0 24 24"><path d="M12 3 5 6v6c0 4.97 3.06 9.63 7 11 3.94-1.37 7-6.03 7-11V6Zm0 7a2 2 0 1 1-2 2 2 2 0 0 1 2-2Z"/></svg>`,
    href: "security.html",
  },
  "delete-account-info": {
    title: "Delete Account",
    intro: "Review the 30-day grace period, active subscription impact, and your cancellation options before continuing.",
    icon: `<svg viewBox="0 0 24 24"><path d="M6 7h12M9 7V5h6v2m-7 4v6m4-6v6m4-6v6M5 7l1 13a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-13"/></svg>`,
    href: "delete-account.html",
    sidebar: false,
  },
  "delete-account-confirm": {
    title: "Confirm Deletion",
    intro: "Enter your password and confirm your request to schedule account deletion.",
    icon: `<svg viewBox="0 0 24 24"><path d="m9 12 2 2 4-4m-3-7 7 3v6c0 4.97-3.06 9.63-7 11-3.94-1.37-7-6.03-7-11V6l7-3Z"/></svg>`,
    href: "delete-account-confirm.html",
    sidebar: false,
  },
};

const renderSidebar = () => {
  const sidebar = document.getElementById("settingsSidebar");
  sidebar.innerHTML = `
    <div class="section-heading">
      <p class="eyebrow">Settings menu</p>
      <h2>Manage your account</h2>
    </div>
    <nav class="settings-link-list">
      ${Object.entries(pageMeta)
        .filter(([, meta]) => meta.sidebar !== false)
        .map(
          ([key, meta]) => `
            <a class="settings-page-link ${key === pageKey ? "is-active" : ""}" href="${meta.href}">
              <span class="settings-inline-icon" aria-hidden="true">${meta.icon}</span>
              <span>${meta.title}</span>
            </a>
          `
        )
        .join("")}
    </nav>
  `;
};

const renderHeader = () => {
  document.getElementById("settingsPageTitle").textContent = pageMeta[pageKey]?.title || "Settings";
  document.getElementById("settingsPageIntro").textContent = pageMeta[pageKey]?.intro || "";
};

const profileAvatar = (user) =>
  user?.profilePhoto
    ? `<img class="profile-avatar image-avatar" src="${user.profilePhoto}" alt="${user.name || "Supporter"}" />`
    : `<div class="profile-avatar">${(user?.name || "S").slice(0, 1).toUpperCase()}</div>`;

const renderProfilePage = (data) => `
  <div class="settings-stack">
    <div class="settings-block">
      <span class="settings-block-icon" aria-hidden="true">${pageMeta.profile.icon}</span>
      <div class="profile-card">
        ${profileAvatar(data.profile)}
        <div>
          <strong>${data.profile?.name || storedUser?.name || "Supporter"}</strong>
          <p>${data.profile?.email || storedUser?.email || ""}</p>
          <small>${data.profile?.mobile || "Mobile not added yet"}</small>
        </div>
      </div>
    </div>
    <form id="profileForm" class="settings-form">
      <div class="form-grid">
        <label>
          Full name
          <input id="profileName" value="${data.profile?.name || storedUser?.name || ""}" />
        </label>
        <label>
          Mobile
          <input id="profileMobile" value="${data.profile?.mobile || storedUser?.mobile || ""}" />
        </label>
      </div>
      <label>
        Profile photo
        <input id="profilePhotoInput" type="file" accept="image/*" />
      </label>
      <div id="profilePhotoPreview" class="photo-upload-preview">${
        data.profile?.profilePhoto
          ? `<img src="${data.profile.profilePhoto}" alt="Profile preview" class="photo-preview-image" />`
          : `<div class="empty-state compact-empty">Choose an image to personalize your donor dashboard.</div>`
      }</div>
      <button class="btn btn-primary" type="submit">Update Profile</button>
    </form>
  </div>
`;

const renderDocumentsPage = (data) => `
  <div class="settings-card-grid">
    <div class="settings-block">
      <span class="settings-block-icon" aria-hidden="true">${pageMeta.documents.icon}</span>
      <strong>Total donated</strong>
      <p>${currency(data.summary.totalDonated)}</p>
      <small>Use the export button to download your tax report.</small>
    </div>
    <div class="settings-block">
      <span class="settings-block-icon" aria-hidden="true">${pageMeta.notifications.icon}</span>
      <strong>Available financial years</strong>
      <p>${(data.filters.availableFinancialYears || []).join(", ") || "No donation years yet"}</p>
      <small>Helpful for tax filing and record-keeping.</small>
    </div>
  </div>
  <div class="settings-inline-actions">
    <button id="downloadTaxReport" class="btn btn-primary" type="button">Download Tax Report</button>
    <button id="downloadAllCertificates" class="btn btn-secondary" type="button">Download All Certificates</button>
  </div>
  <div class="settings-stack">
    ${Object.entries(data.tax.yearly || {}).length ? Object.entries(data.tax.yearly).map(([label, amount]) => `
      <div class="settings-block">
        <span class="settings-block-icon" aria-hidden="true">${pageMeta.documents.icon}</span>
        <strong>${label}</strong>
        <p>${currency(amount)}</p>
        <small>Yearly tax donation summary.</small>
      </div>
    `).join("") : `<div class="empty-state">No tax summary yet.</div>`}
  </div>
`;

const renderSubscriptionsPage = (data) => `
  <div class="settings-subscription-list">
    ${
      data.subscriptions.length
        ? data.subscriptions
            .map(
              (item) => `
                <article class="subscription-card">
                  <strong>${item.campaignId?.title || "Campaign"}</strong>
                  <p>${currency(item.amount)} every month for ${item.duration} months</p>
                  <small>Status: ${item.status}</small>
                  <small>Completed cycles: ${item.completedCycles || 0}/${item.duration}</small>
                  <small>Next payment: ${item.nextPaymentDate ? formatDate(item.nextPaymentDate) : "TBD"}</small>
                  ${
                    item.status === "active"
                      ? `<button class="btn btn-secondary cancel-subscription-btn" type="button" data-id="${item._id}">Cancel Plan</button>`
                      : ""
                  }
                </article>
              `
            )
            .join("")
        : `<div class="empty-state">No active recurring plans yet.</div>`
    }
  </div>
`;

const renderPrivacyPage = (data) => `
  <div class="settings-stack">
    <form id="privacyForm" class="settings-form">
      <label class="toggle-card">
        <span>
          <strong>Anonymous donation by default</strong>
          <small>Future donations will start with your identity hidden.</small>
        </span>
        <input id="privacyAnonymousDefault" type="checkbox" ${data.profile?.privacy?.anonymousDefault ? "checked" : ""} />
      </label>
      <label class="toggle-card">
        <span>
          <strong>Show name publicly</strong>
          <small>Allow your name to appear in donor-facing areas when relevant.</small>
        </span>
        <input id="privacyShowName" type="checkbox" ${data.profile?.privacy?.showName ? "checked" : ""} />
      </label>
      <button class="btn btn-primary" type="submit">Save Privacy Settings</button>
    </form>
    <div class="privacy-subtle-link-wrap">
      <span class="privacy-subtle-label">Advanced privacy</span>
      <a class="privacy-subtle-link" href="delete-account.html">${
        data.profile?.accountDeletion?.isScheduled
          ? `Deletion scheduled. ${deletionCountdown(data.profile.accountDeletion)}`
          : "Delete account"
      }</a>
    </div>
  </div>
`;

const renderNotificationsPage = (data) => `
  <form id="notificationForm" class="settings-form">
    <label class="toggle-card">
      <span>
        <strong>Email updates</strong>
        <small>Receive donation, certificate, and account messages by email.</small>
      </span>
      <input id="notificationsEmail" type="checkbox" ${data.profile?.notifications?.email ? "checked" : ""} />
    </label>
    <label class="toggle-card">
      <span>
        <strong>Reminder nudges</strong>
        <small>Get reminders for tax season, recurring plans, and anniversaries.</small>
      </span>
      <input id="notificationsReminders" type="checkbox" ${data.profile?.notifications?.reminders ? "checked" : ""} />
    </label>
    <button class="btn btn-primary" type="submit">Save Notification Settings</button>
  </form>
`;

const renderUpdatesPage = (data) => `
  <div class="settings-stack">
    <div class="settings-block">
      <span class="settings-block-icon" aria-hidden="true">${pageMeta.updates.icon}</span>
      <strong>Campaign events and marketing communication</strong>
      <p>This page shows approved field events and marketing messages connected to your donor account.</p>
      <small>${(data.eventUpdates || []).length} event updates | ${(data.marketingMessages || []).length} marketing messages</small>
    </div>

    <div class="settings-update-section">
      <div class="section-heading">
        <p class="eyebrow">Events</p>
        <h2>Approved campaign events</h2>
      </div>
      <div class="settings-update-list">
        ${
          data.eventUpdates?.length
            ? data.eventUpdates
                .map(
                  (item) => `
                    <article class="list-card settings-update-card">
                      <div class="history-card-top">
                        <strong>${item.title}</strong>
                        <span class="campaign-status ${item.isLiveUpdate ? "active" : "paid"}">${item.isLiveUpdate ? item.liveLabel || "Live" : "Approved"}</span>
                      </div>
                      <p>${item.campaignTitle}</p>
                      <small>${formatDateTime(item.eventDate)}${item.location ? ` | ${item.location}` : ""}</small>
                      <small>${item.description || "Campaign event update published for donors."}</small>
                      <small>${currency(item.fundUsed)} used | ${item.impactNumber} ${item.impactLabel} | ${item.progressPercent}% progress</small>
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
                        <a class="mini-link" href="campaign.html?id=${item.campaignId}">Open campaign</a>
                        ${item.mapLink ? `<a class="mini-link" href="${item.mapLink}" target="_blank">Open location</a>` : ""}
                        ${item.shareMessage ? `<a class="mini-link" href="https://wa.me/?text=${encodeURIComponent(item.shareMessage)}" target="_blank">Share update</a>` : ""}
                      </div>
                    </article>
                  `
                )
                .join("")
            : `<div class="empty-state">Approved campaign events will appear here after your supported causes publish updates.</div>`
        }
      </div>
    </div>

    <div class="settings-update-section">
      <div class="section-heading">
        <p class="eyebrow">Marketing</p>
        <h2>Messages sent to you</h2>
      </div>
      <div class="settings-update-list">
        ${
          data.marketingMessages?.length
            ? data.marketingMessages
                .map(
                  (item) => `
                    <article class="list-card settings-update-card">
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
                        ${item.campaignId ? `<a class="mini-link" href="campaign.html?id=${item.campaignId}">Open campaign</a>` : ""}
                        ${item.shareLink ? `<a class="mini-link" href="${item.shareLink}" target="_blank">Open WhatsApp draft</a>` : ""}
                      </div>
                    </article>
                  `
                )
                .join("")
            : `<div class="empty-state">Marketing messages sent to your donor account will appear here.</div>`
        }
      </div>
    </div>
  </div>
`;

const renderSecurityPage = (data) => `
  <div class="settings-card-grid">
    <div class="settings-block">
      <span class="settings-block-icon" aria-hidden="true">${pageMeta.security.icon}</span>
      <strong>Logged in as</strong>
      <p>${data.profile?.email || storedUser?.email || ""}</p>
      <small>Your dashboard session is protected using token-based authentication.</small>
    </div>
    <div class="settings-block">
      <span class="settings-block-icon" aria-hidden="true">${pageMeta.notifications.icon}</span>
      <strong>Last login</strong>
      <p>${data.profile?.lastLoginAt ? formatDateTime(data.profile.lastLoginAt) : "First active session"}</p>
      <small>Recent sign-in snapshot for this account.</small>
    </div>
  </div>
  <form id="passwordForm" class="settings-form">
    <div class="form-grid">
      <label>
        Current password
        <input id="currentPassword" type="password" />
      </label>
      <label>
        New password
        <input id="newPassword" type="password" />
      </label>
    </div>
    <label>
      Confirm new password
      <input id="confirmPassword" type="password" />
    </label>
    <div class="helper-copy">Use 8+ characters with uppercase, lowercase, number, and special character.</div>
    <button class="btn btn-primary" type="submit">Change Password</button>
  </form>
  <div class="settings-form danger-zone">
    <div class="helper-copy">Account deletion now lives in Privacy so the request follows a separate 2-step confirmation flow.</div>
    <a class="btn btn-secondary" href="delete-account.html">Manage Delete Account</a>
  </div>
`;

const renderDeleteAccountInfoPage = (data) => {
  const accountDeletion = data.profile?.accountDeletion || {};
  const isScheduled = Boolean(accountDeletion.isScheduled);

  return `
    <div class="delete-flow-shell">
      <div class="delete-stepper">
        <span class="delete-step is-active">1. Review</span>
        <span class="delete-step">2. Confirm</span>
      </div>
      ${
        isScheduled
          ? `
            <div class="status-banner warning">
              <strong>Account deletion is scheduled.</strong>
              <p>${deletionCountdown(accountDeletion)} before permanent deletion.</p>
            </div>
          `
          : ""
      }
      <article class="delete-doc-shell">
        <div class="delete-doc-header">
          <p class="eyebrow">Review carefully</p>
          <h3>Account deletion policy and final impact</h3>
          <p>This request does not delete your account immediately. It starts a controlled offboarding process with a grace period and recovery option.</p>
        </div>
        <div id="deletePolicyScrollBox" class="delete-policy-scroll">
          <section class="delete-policy-section">
            <h4>1. Grace period</h4>
            <p>Your account enters a ${accountDeletion.graceDays || 30}-day review window before permanent deletion. During this period, you can still sign in and cancel the request.</p>
            <p>The deletion countdown is shown inside your dashboard and privacy settings so you always know how much time remains.</p>
          </section>
          <section class="delete-policy-section">
            <h4>2. Subscription impact</h4>
            <p>Any active monthly donation plan is cancelled as soon as the deletion request is scheduled. Future automatic charges are stopped and upcoming payment dates are removed.</p>
            <p>If you still want to support a campaign later, you will need to create a fresh donation after restoring the account or registering again.</p>
          </section>
          <section class="delete-policy-section">
            <h4>3. What stays during the 30 days</h4>
            <p>Your profile, donation history, and tax certificates remain available during the grace period. This allows you to review records, download documents, or reverse the request if needed.</p>
            <p>No permanent anonymization happens until the countdown ends.</p>
          </section>
          <section class="delete-policy-section">
            <h4>4. Final deletion</h4>
            <p>Once the grace period ends, personal fields such as your name, email, password, mobile number, and profile photo are removed or anonymized. Historical donations are preserved for compliance, finance, and reporting.</p>
            <p>Past donor records remain in the system as anonymous history instead of a live user profile.</p>
          </section>
          <section class="delete-policy-section">
            <h4>5. Before you continue</h4>
            <p>Please scroll through this notice and make sure you understand that the process affects subscriptions immediately, while final account removal happens later.</p>
            <p>Only continue if you are certain you want to start the deletion workflow.</p>
          </section>
        </div>
      </article>
      ${
        isScheduled
          ? ""
          : `
            <label class="toggle-card confirm-toggle delete-doc-toggle">
              <span>
                <strong>I have read this notice and understand what will happen next</strong>
                <small>You must acknowledge the policy before moving to password confirmation.</small>
              </span>
              <input id="deletePolicyCheckbox" type="checkbox" disabled />
            </label>
          `
      }
      <div class="delete-flow-actions">
        <a class="btn btn-secondary" href="privacy.html">Back to Privacy</a>
        ${
          isScheduled
            ? `<button id="cancelDeletionBtn" class="btn btn-primary" type="button">Cancel Deletion</button>`
            : `<a id="deletePolicyContinue" class="btn btn-primary is-disabled" href="delete-account-confirm.html" aria-disabled="true">Continue</a>`
        }
      </div>
    </div>
  `;
};

const renderDeleteAccountConfirmPage = (data) => {
  const accountDeletion = data.profile?.accountDeletion || {};

  return `
    <div class="delete-flow-shell">
      <div class="delete-stepper">
        <span class="delete-step">1. Review</span>
        <span class="delete-step is-active">2. Confirm</span>
      </div>
      ${
        accountDeletion.isScheduled
          ? `
            <div class="status-banner warning">
              <strong>Deletion already scheduled.</strong>
              <p>${deletionCountdown(accountDeletion)}. You can cancel instead of submitting again.</p>
            </div>
          `
          : ""
      }
      <form id="deleteAccountConfirmForm" class="settings-form delete-confirm-form">
        <label>
          Confirm your password
          <input id="deleteConfirmPassword" type="password" autocomplete="current-password" ${
            accountDeletion.isScheduled ? "disabled" : ""
          } />
        </label>
        <div id="deletePasswordStatus" class="helper-copy">Enter your current password to unlock the final button.</div>
        <label class="toggle-card confirm-toggle">
          <span>
            <strong>I understand this request starts a 30-day deletion countdown</strong>
            <small>You can cancel during the grace period, but subscriptions will be cancelled immediately.</small>
          </span>
          <input id="deleteConfirmCheckbox" type="checkbox" ${accountDeletion.isScheduled ? "disabled" : ""} />
        </label>
        <div class="delete-flow-actions">
          <a class="btn btn-secondary" href="delete-account.html">Back</a>
          ${
            accountDeletion.isScheduled
              ? `<button id="cancelDeletionConfirmBtn" class="btn btn-primary" type="button">Cancel Deletion</button>`
              : `<button id="submitDeleteAccountBtn" class="btn btn-primary" type="submit" disabled>Schedule Deletion</button>`
          }
        </div>
      </form>
    </div>
  `;
};

const renderSettingsPage = (data) => {
  const content = document.getElementById("settingsPageContent");

  const markupByPage = {
    profile: renderProfilePage(data),
    documents: renderDocumentsPage(data),
    subscriptions: renderSubscriptionsPage(data),
    privacy: renderPrivacyPage(data),
    notifications: renderNotificationsPage(data),
    updates: renderUpdatesPage(data),
    security: renderSecurityPage(data),
    "delete-account-info": renderDeleteAccountInfoPage(data),
    "delete-account-confirm": renderDeleteAccountConfirmPage(data),
  };

  content.innerHTML = markupByPage[pageKey] || `<div class="empty-state">Settings page not found.</div>`;
};

const wireProfileForm = async () => {
  let profilePhotoDraft = storedUser?.profilePhoto || "";
  const photoInput = document.getElementById("profilePhotoInput");

  photoInput?.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    profilePhotoDraft = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    document.getElementById("profilePhotoPreview").innerHTML =
      `<img src="${profilePhotoDraft}" alt="Profile preview" class="photo-preview-image" />`;
  });

  document.getElementById("profileForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const res = await fetch(`${API_BASE}/auth/profile`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders,
      },
      body: JSON.stringify({
        name: document.getElementById("profileName").value,
        mobile: document.getElementById("profileMobile").value,
        profilePhoto: profilePhotoDraft,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.message || "Unable to update profile");
      return;
    }

    storedUser = data.user;
    localStorage.setItem("user", JSON.stringify(data.user));
    await window.appSession?.renderNav?.();
    alert(data.message || "Profile updated successfully");
  });
};

const wireDocumentsPage = () => {
  document.getElementById("downloadTaxReport")?.addEventListener("click", async () => {
    const res = await fetch(`${API_BASE}/donation/tax-report`, { headers: authHeaders });
    const report = await res.json();
    if (!res.ok) {
      alert(report.message || "Unable to download tax report");
      return;
    }

    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `tax-report-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  });

  document.getElementById("downloadAllCertificates")?.addEventListener("click", async () => {
    const res = await fetch(`${API_BASE}/donation/certificates`, { headers: authHeaders });
    if (!res.ok) {
      const data = await res.json();
      alert(data.message || "Unable to export certificates");
      return;
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "donation-certificates.zip";
    link.click();
    URL.revokeObjectURL(url);
  });
};

const wireSubscriptionsPage = () => {
  document.querySelectorAll(".cancel-subscription-btn").forEach((button) => {
    button.addEventListener("click", async () => {
      const res = await fetch(`${API_BASE}/subscription/${button.dataset.id}/cancel`, {
        method: "PUT",
        headers: authHeaders,
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.message || "Unable to cancel subscription");
        return;
      }
      window.location.reload();
    });
  });
};

const wirePreferencesPage = (type) => {
  const formId = type === "privacy" ? "privacyForm" : "notificationForm";
  document.getElementById(formId)?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const body =
      type === "privacy"
        ? {
            privacy: {
              anonymousDefault: document.getElementById("privacyAnonymousDefault").checked,
              showName: document.getElementById("privacyShowName").checked,
            },
          }
        : {
            notifications: {
              email: document.getElementById("notificationsEmail").checked,
              reminders: document.getElementById("notificationsReminders").checked,
            },
          };

    const res = await fetch(`${API_BASE}/auth/preferences`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders,
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.message || "Unable to save settings");
      return;
    }

    storedUser = data.user;
    localStorage.setItem("user", JSON.stringify(data.user));
    alert(data.message || "Settings updated successfully");
  });
};

const wireSecurityPage = () => {
  document.getElementById("passwordForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const res = await fetch(`${API_BASE}/auth/password`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders,
      },
      body: JSON.stringify({
        currentPassword: document.getElementById("currentPassword").value,
        newPassword: document.getElementById("newPassword").value,
        confirmPassword: document.getElementById("confirmPassword").value,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.message || "Unable to update password");
      return;
    }

    document.getElementById("passwordForm").reset();
    alert(data.message || "Password updated successfully");
  });
};

const wireDeleteAccountInfoPage = () => {
  document.getElementById("cancelDeletionBtn")?.addEventListener("click", async () => {
    const res = await fetch(`${API_BASE}/auth/delete-account/cancel`, {
      method: "PUT",
      headers: authHeaders,
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.message || "Unable to cancel deletion");
      return;
    }

    storedUser = data.user;
    localStorage.setItem("user", JSON.stringify(data.user));
    window.location.assign("privacy.html");
  });

  const scrollBox = document.getElementById("deletePolicyScrollBox");
  const checkbox = document.getElementById("deletePolicyCheckbox");
  const continueLink = document.getElementById("deletePolicyContinue");

  const syncDeletePolicyState = () => {
    if (!checkbox || !continueLink || !scrollBox) return;

    const reachedEnd = scrollBox.scrollTop + scrollBox.clientHeight >= scrollBox.scrollHeight - 12;
    checkbox.disabled = !reachedEnd;
    if (!reachedEnd) {
      checkbox.checked = false;
    }

    const enabled = reachedEnd && checkbox.checked;
    continueLink.classList.toggle("is-disabled", !enabled);
    continueLink.setAttribute("aria-disabled", String(!enabled));
  };

  scrollBox?.addEventListener("scroll", syncDeletePolicyState);
  checkbox?.addEventListener("change", syncDeletePolicyState);
  continueLink?.addEventListener("click", (event) => {
    if (continueLink.getAttribute("aria-disabled") === "true") {
      event.preventDefault();
    }
  });

  syncDeletePolicyState();
};

const wireDeleteAccountConfirmPage = () => {
  const passwordInput = document.getElementById("deleteConfirmPassword");
  const checkboxInput = document.getElementById("deleteConfirmCheckbox");
  const submitButton = document.getElementById("submitDeleteAccountBtn");
  const status = document.getElementById("deletePasswordStatus");

  let passwordValid = false;
  let validateTimer = null;

  const syncSubmitState = () => {
    if (!submitButton) return;
    submitButton.disabled = !(passwordValid && checkboxInput?.checked);
  };

  const setStatus = (message, tone = "") => {
    status.textContent = message;
    status.className = `helper-copy ${tone}`.trim();
  };

  checkboxInput?.addEventListener("change", syncSubmitState);

  passwordInput?.addEventListener("input", () => {
    passwordValid = false;
    syncSubmitState();

    const password = passwordInput.value.trim();
    if (!password) {
      setStatus("Enter your current password to unlock the final button.");
      return;
    }

    setStatus("Checking password...");
    window.clearTimeout(validateTimer);
    // Validate against the server so the final CTA only unlocks for the real current password.
    validateTimer = window.setTimeout(async () => {
      const res = await fetch(`${API_BASE}/auth/validate-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      passwordValid = Boolean(data.valid);
      setStatus(data.message || (passwordValid ? "Password confirmed" : "Password is incorrect"), passwordValid ? "success" : "error");
      syncSubmitState();
    }, 350);
  });

  document.getElementById("cancelDeletionConfirmBtn")?.addEventListener("click", async () => {
    const res = await fetch(`${API_BASE}/auth/delete-account/cancel`, {
      method: "PUT",
      headers: authHeaders,
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.message || "Unable to cancel deletion");
      return;
    }

    storedUser = data.user;
    localStorage.setItem("user", JSON.stringify(data.user));
    window.location.assign("privacy.html");
  });

  document.getElementById("deleteAccountConfirmForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const res = await fetch(`${API_BASE}/auth/delete-account`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders,
      },
      body: JSON.stringify({
        password: passwordInput.value,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setStatus(data.message || "Unable to schedule deletion", "error");
      return;
    }

    storedUser = data.user;
    localStorage.setItem("user", JSON.stringify(data.user));
    window.location.assign("delete-account.html");
  });
};

const init = async () => {
  renderHeader();
  renderSidebar();

  const [meRes, dashboardRes] = await Promise.all([
    fetch(`${API_BASE}/auth/me`, { headers: authHeaders }),
    fetch(`${API_BASE}/donation/user`, { headers: authHeaders }),
  ]);

  const meData = await meRes.json();
  const dashboardData = await dashboardRes.json();

  if (!meRes.ok || !dashboardRes.ok) {
    document.getElementById("settingsPageContent").innerHTML = `<div class="empty-state">Unable to load this settings page right now.</div>`;
    return;
  }

  storedUser = meData.user;
  localStorage.setItem("user", JSON.stringify(meData.user));
  await window.appSession?.renderNav?.();

  const mergedData = {
    ...dashboardData,
    profile: {
      ...dashboardData.profile,
      ...meData.user,
    },
  };

  renderSettingsPage(mergedData);

  if (pageKey === "profile") await wireProfileForm();
  if (pageKey === "documents") wireDocumentsPage();
  if (pageKey === "subscriptions") wireSubscriptionsPage();
  if (pageKey === "privacy") wirePreferencesPage("privacy");
  if (pageKey === "notifications") wirePreferencesPage("notifications");
  if (pageKey === "security") wireSecurityPage();
  if (pageKey === "delete-account-info") wireDeleteAccountInfoPage();
  if (pageKey === "delete-account-confirm") wireDeleteAccountConfirmPage();
};

init().catch(() => {
  document.getElementById("settingsPageContent").innerHTML = `<div class="empty-state">Unable to load this settings page right now.</div>`;
});
