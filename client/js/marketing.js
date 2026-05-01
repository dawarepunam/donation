const API_BASE = window.appSession?.apiBase || `${window.location.origin}/api`;

const marketingSession = {
  token: localStorage.getItem("token"),
  user: JSON.parse(localStorage.getItem("user") || "null"),
};

const pageConfig = {
  dashboard: { title: "Dashboard", subtitle: "Consent-based donor engagement, campaign automation, and communication analytics." },
  donors: { title: "Donors", subtitle: "Only consented donors with limited, secure visibility are shown here." },
  campaigns: { title: "Campaign Studio", subtitle: "Email templates, A/B testing, WhatsApp share flow, and scheduled sends." },
  impact: { title: "Impact / Events", subtitle: "Publish field updates, proof media, fund utilization, and trust-building stories." },
  settings: { title: "Settings", subtitle: "Manage profile, workflow preferences, and secure access." },
  profile: { title: "Profile", subtitle: "Update marketing profile, notifications, and password." },
  security: { title: "Security", subtitle: "Review your own marketing activity and access history." },
};

const navSections = [
  {
    label: "Core",
    links: [
      ["/marketing/dashboard", "dashboard", "Dashboard"],
      ["/marketing/donors", "donors", "Donors"],
      ["/marketing/campaigns", "campaigns", "Campaigns"],
      ["/marketing/impact", "impact", "Impact / Events"],
    ],
  },
  {
    label: "Settings",
    links: [
      ["/marketing/settings", "settings", "Settings Home"],
      ["/marketing/settings/profile", "profile", "Profile"],
      ["/marketing/settings/security", "security", "Security"],
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
const formatShortDate = (value) => (value ? new Date(value).toLocaleDateString("en-IN") : "Not available");
const initials = (name = "MK") =>
  String(name)
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

const params = new URLSearchParams(window.location.search);

const getHeaders = (json = true) => ({
  ...(json ? { "Content-Type": "application/json" } : {}),
  ...(marketingSession.token ? { Authorization: marketingSession.token } : {}),
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

const ensureMarketing = async () => {
  if (!marketingSession.token) {
    window.location.replace("/marketing/login");
    return false;
  }

  try {
    const data = await api("/auth/me", { headers: getHeaders(false) });
    marketingSession.user = data.user;
    localStorage.setItem("user", JSON.stringify(data.user));
    if (data.user.role !== "marketing") {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      window.location.replace("/marketing/login");
      return false;
    }
    return true;
  } catch (error) {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.location.replace("/marketing/login");
    return false;
  }
};

const renderShell = (pageKey) => {
  const mount = document.getElementById("marketingShell");
  if (!mount) return;

  const content = mount.querySelector("[data-page-content]");
  const page = pageConfig[pageKey] || pageConfig.dashboard;
  const avatar = marketingSession.user?.profilePhoto
    ? `<img src="${marketingSession.user.profilePhoto}" alt="${marketingSession.user.name || "Marketing"}" />`
    : initials(marketingSession.user?.name || "Marketing");

  mount.className = "superadmin-shell";
  mount.innerHTML = `
    <aside class="superadmin-sidebar">
      <a class="superadmin-brand" href="/marketing/dashboard">
        HopeSpring
        <small>Marketing Workspace</small>
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
          <p class="superadmin-kicker">Marketing</p>
          <h1>${page.title}</h1>
          <p>${page.subtitle}</p>
        </div>
        <div class="superadmin-userbox">
          <div class="superadmin-avatar">${avatar}</div>
          <div>
            <strong>${marketingSession.user?.name || "Marketing User"}</strong>
            <div class="superadmin-meta">${marketingSession.user?.email || ""}</div>
          </div>
          <button id="marketingLogout" class="superadmin-btn-secondary" type="button">Logout</button>
        </div>
      </div>
      <div class="superadmin-page"></div>
    </div>
  `;

  mount.querySelector(".superadmin-page").appendChild(content);
  document.getElementById("marketingLogout")?.addEventListener("click", () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.location.replace("/marketing/login");
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

const campaignSupportSummary = (campaigns = []) =>
  campaigns.length
    ? campaigns
        .map((campaign) => `${campaign.title} (${currency(campaign.totalDonated)}${campaign.donationCount ? `, ${campaign.donationCount} donation${campaign.donationCount > 1 ? "s" : ""}` : ""})`)
        .join(" | ")
    : "No campaign history yet";

const escapeHtml = (value = "") =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

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

const linesFromList = (items = []) => items.map((item) => item.url || item).filter(Boolean).join("\n");
const linesFromMetrics = (items = []) => items.map((item) => `${item.label}: ${item.value}`).join("\n");

const loadDashboard = async () => {
  const data = await api("/marketing/dashboard", { headers: getHeaders(false) });
  const stats = document.getElementById("marketingStats");
  if (stats) {
    stats.innerHTML = statCards([
      { label: "Total Donors", value: data.totals.totalDonors, help: "Consented donors only" },
      { label: "Active Donors", value: data.totals.activeDonors, help: "Recent donor activity" },
      { label: "High-value Donors", value: data.totals.highValueDonors, help: "Top donation range supporters" },
      { label: "Engagement Rate", value: data.totals.engagementRate, help: "Average engagement score" },
      { label: "Scheduled Campaigns", value: data.totals.scheduledCampaigns, help: "Automation queue" },
      { label: "Emails Sent", value: data.totals.emailsSent, help: "Tracked Gmail sends" },
    ]);
  }

  renderList(
    "marketingRecentCampaigns",
    data.recentCampaigns,
    (item) => `
      <article class="superadmin-list-card">
        <div class="superadmin-list-head">
          <div>
            <strong>${item.title}</strong>
            <p>${item.channel} | ${item.templateKey}</p>
          </div>
          <span class="superadmin-badge status-${item.status}">${item.status}</span>
        </div>
        <div class="superadmin-meta">Reach: ${item.metrics.reach} | Delivered: ${item.metrics.delivered} | Clicks: ${item.metrics.clicks}</div>
      </article>
    `,
    "Your campaign activity will appear here."
  );

  renderList(
    "marketingLiveActivity",
    data.liveActivity,
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
    "Activity logs will appear after your first action."
  );

  renderList(
    "marketingSegments",
    data.topSegments,
    (item) => `
      <article class="superadmin-list-card">
        <div class="superadmin-list-head">
          <strong>${item.segment.toUpperCase()}</strong>
          <span class="superadmin-badge">${item.count}</span>
        </div>
        <p>${item.segment} engagement donors ready for targeting</p>
      </article>
    `,
    "No segment data available."
  );
};

const loadDonors = async () => {
  const query = new URLSearchParams();
  if (params.get("q")) query.set("q", params.get("q"));
  if (params.get("segment")) query.set("segment", params.get("segment"));
  const donors = await api(`/marketing/donors${query.toString() ? `?${query.toString()}` : ""}`, {
    headers: getHeaders(false),
  });

  document.getElementById("donorSearch").value = params.get("q") || "";
  document.getElementById("donorSegment").value = params.get("segment") || "all";

  renderList(
    "donorList",
    donors,
    (item) => `
      <article class="superadmin-list-card">
        <div class="superadmin-list-head">
          <div>
            <strong>${item.name}</strong>
            <p>${item.email}</p>
          </div>
          <span class="superadmin-badge">${item.engagementScore}</span>
        </div>
        <div class="superadmin-meta">Donation range: ${item.donationRange} | Segment: ${item.segment} | Donations: ${item.donationCount}</div>
        <p>${item.engagementLabel} | Total donated: ${currency(item.totalDonated)} | Last donation: ${formatDate(item.lastDonationAt)}</p>
        <div class="superadmin-meta">${item.engagementGuide}</div>
        <div class="superadmin-meta">Campaigns supported: ${campaignSupportSummary(item.campaignsSupported)}</div>
      </article>
    `,
    "No consented donors match these filters."
  );
};

const loadCampaignStudio = async () => {
  const [campaigns, templates, publicCampaigns] = await Promise.all([
    api("/marketing/campaigns", { headers: getHeaders(false) }),
    api("/marketing/templates", { headers: getHeaders(false) }),
    fetch(`${API_BASE}/campaign`).then((response) => response.json()),
  ]);

  const templateMap = templates.templates || {};
  const campaignSelect = document.getElementById("targetCampaignId");
  const audiencePreviewTarget = document.getElementById("marketingAudiencePreview");
  const deliveryPreviewTarget = document.getElementById("marketingDeliveryPreview");
  if (campaignSelect) {
    campaignSelect.innerHTML = `<option value="">No linked campaign</option>${(Array.isArray(publicCampaigns) ? publicCampaigns : [])
      .map((campaign) => `<option value="${campaign._id}">${campaign.title}</option>`)
      .join("")}`;
  }

  const applyTemplate = () => {
    const selectedTemplate = document.getElementById("templateKey").value;
    if (!templateMap[selectedTemplate]) return;
    document.getElementById("messageA").value = templateMap[selectedTemplate];
    if (!document.getElementById("messageB").value) {
      document.getElementById("messageB").value = templateMap[selectedTemplate];
    }
  };

  document.getElementById("templateKey")?.addEventListener("change", applyTemplate);

  const renderDeliveryPreview = () => {
    if (!deliveryPreviewTarget) return;

    const selectedCampaignTitle =
      document.getElementById("targetCampaignId")?.selectedOptions?.[0]?.textContent || "HopeSpring campaign";
    const messageA = document.getElementById("messageA")?.value?.trim() || "Thank you for your continued support, {name}.";
    const messageB = document.getElementById("messageB")?.value?.trim();
    const subject = document.getElementById("campaignSubject")?.value?.trim() || `Support ${selectedCampaignTitle}`;
    const channel = document.getElementById("channel")?.value || "email";
    const sampleName = "Aarav Patil";
    const sampleLink = "https://hopespring.org/campaign.html?id=sample";
    const sampleImpact = "Your current giving range is INR 5,000 - 19,999.";
    const buildPreviewText = (template) =>
      template
        .replaceAll("{name}", sampleName)
        .replaceAll("{campaignTitle}", selectedCampaignTitle === "No linked campaign" ? "HopeSpring campaign" : selectedCampaignTitle)
        .replaceAll("{ctaLink}", sampleLink)
        .replaceAll("{impact}", sampleImpact);

    deliveryPreviewTarget.innerHTML = `
      <div class="superadmin-list">
        <article class="superadmin-list-card">
          <div class="superadmin-list-head">
            <div>
              <strong>${channel === "email" ? "Email delivery format" : "WhatsApp delivery format"}</strong>
              <p>This is the professional format donors will receive based on the current form.</p>
            </div>
            <span class="superadmin-badge">${channel}</span>
          </div>
          <div class="superadmin-preview-grid">
            <div class="superadmin-preview-panel">
              <span class="superadmin-preview-label">Data sent to donor</span>
              <div class="superadmin-meta">Name: ${sampleName}</div>
              <div class="superadmin-meta">Campaign: ${selectedCampaignTitle === "No linked campaign" ? "HopeSpring campaign" : selectedCampaignTitle}</div>
              <div class="superadmin-meta">CTA link: tracked campaign open link</div>
              <div class="superadmin-meta">Impact note: ${sampleImpact}</div>
              <div class="superadmin-meta">Subject/heading: ${subject}</div>
            </div>
            <div class="superadmin-preview-panel">
              <span class="superadmin-preview-label">Sample message A</span>
              <div class="superadmin-message-preview">
                ${
                  channel === "email"
                    ? `<strong>Subject:</strong> ${escapeHtml(subject)}<br /><br />${escapeHtml(buildPreviewText(messageA)).replaceAll("\n", "<br />")}`
                    : `${escapeHtml(buildPreviewText(messageA)).replaceAll("\n", "<br />")}`
                }
              </div>
            </div>
            ${
              messageB
                ? `
                  <div class="superadmin-preview-panel">
                    <span class="superadmin-preview-label">Sample message B</span>
                    <div class="superadmin-message-preview">${escapeHtml(buildPreviewText(messageB)).replaceAll("\n", "<br />")}</div>
                  </div>
                `
                : ""
            }
          </div>
        </article>
      </div>
    `;
  };

  const loadAudiencePreview = async () => {
    if (!audiencePreviewTarget) return;
    const query = new URLSearchParams({
      segment: document.getElementById("audienceSegment")?.value || "all",
      donorState: document.getElementById("audienceState")?.value || "all",
      channel: document.getElementById("channel")?.value || "email",
    });

    const targetCampaignId = document.getElementById("targetCampaignId")?.value;
    if (targetCampaignId) {
      query.set("targetCampaignId", targetCampaignId);
    }

    const preview = await api(`/marketing/audience-preview?${query.toString()}`, {
      headers: getHeaders(false),
    });

    const segmentSummary = `High: ${preview.segmentCounts.high} | Medium: ${preview.segmentCounts.medium} | Low: ${preview.segmentCounts.low}`;
    audiencePreviewTarget.innerHTML = `
      <div class="superadmin-list">
        <article class="superadmin-list-card">
          <div class="superadmin-list-head">
            <div>
              <strong>${preview.totalMatchingDonors} matching donors</strong>
              <p>${segmentSummary}</p>
            </div>
            <span class="superadmin-badge">${document.getElementById("channel")?.value || "email"}</span>
          </div>
          <div class="superadmin-meta">Active donors: ${preview.activeDonors} | High-value donors: ${preview.highValueDonors}</div>
          <p>${preview.emptyReason || "These donors match the current targeting filters and consent settings."}</p>
        </article>
        ${
          preview.donors.length
            ? preview.donors
                .map(
                  (item) => `
                    <article class="superadmin-list-card">
                      <div class="superadmin-list-head">
                        <div>
                          <strong>${item.name}</strong>
                          <p>${item.email}</p>
                        </div>
                        <span class="superadmin-badge">${item.engagementScore}</span>
                      </div>
                      <div class="superadmin-meta">Range: ${item.donationRange} | Donations: ${item.donationCount} | Last donation: ${formatDate(item.lastDonationAt)}</div>
                      <p>Total donated: ${currency(item.totalDonated)} | Segment: ${item.segment}</p>
                      <div class="superadmin-meta">${item.engagementGuide}</div>
                      <div class="superadmin-meta">Campaigns: ${item.campaignsSupported.join(" | ") || "No campaign history yet"}</div>
                    </article>
                  `
                )
                .join("")
            : `<div class="superadmin-empty">No donors are currently eligible for this marketing send.</div>`
        }
      </div>
    `;
  };

  ["channel", "audienceSegment", "audienceState", "targetCampaignId"].forEach((id) => {
    document.getElementById(id)?.addEventListener("change", () => {
      loadAudiencePreview().catch((error) => {
        audiencePreviewTarget.innerHTML = `<div class="superadmin-message is-error">${error.message}</div>`;
      });
      renderDeliveryPreview();
    });
  });

  ["campaignSubject", "messageA", "messageB", "templateKey"].forEach((id) => {
    document.getElementById(id)?.addEventListener("input", renderDeliveryPreview);
    document.getElementById(id)?.addEventListener("change", renderDeliveryPreview);
  });

  document.getElementById("marketingCampaignForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const sendMode = document.getElementById("campaignSendMode").value;
    const payload = {
      title: document.getElementById("campaignTitle").value.trim(),
      channel: document.getElementById("channel").value,
      templateKey: document.getElementById("templateKey").value,
      subject: document.getElementById("campaignSubject").value.trim(),
      targetCampaignId: document.getElementById("targetCampaignId").value || "",
      messageA: document.getElementById("messageA").value.trim(),
      messageB: document.getElementById("messageB").value.trim(),
      audience: {
        segment: document.getElementById("audienceSegment").value,
        donorState: document.getElementById("audienceState").value,
      },
      abTest: {
        enabled: document.getElementById("abEnabled").checked,
        splitPercentage: 50,
      },
      scheduleAt: document.getElementById("scheduleAt").value || null,
      sendNow: sendMode === "send",
    };

    const response = await api("/marketing/campaigns", {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });
    showMessage(document.getElementById("campaignMessage"), response.message);
    window.location.reload();
  });

  await loadAudiencePreview();
  renderDeliveryPreview();

  renderList(
    "marketingCampaignList",
    campaigns,
    (item) => `
      <article class="superadmin-list-card">
        <div class="superadmin-list-head">
          <div>
            <strong>${item.title}</strong>
            <p>${item.channel} | ${item.templateKey}${item.targetCampaignTitle ? ` | Linked: ${item.targetCampaignTitle}` : ""}</p>
          </div>
          <span class="superadmin-badge status-${item.status}">${item.status}</span>
        </div>
        <div class="superadmin-meta">Audience: ${item.audience.segment}/${item.audience.donorState} | Reach: ${item.metrics.reach}</div>
        <p>Delivered: ${item.metrics.delivered} | Clicks: ${item.metrics.clicks}${item.scheduleAt ? ` | Schedule: ${formatDate(item.scheduleAt)}` : ""}</p>
        ${
          item.recipientPreview.length
            ? `<div class="superadmin-meta">Recipients: ${item.recipientPreview
                .map(
                  (recipient) =>
                    `${recipient.recipientName || recipient.name || recipient.email} (${recipient.status}, ${recipient.donationRange || currency(recipient.totalDonated || 0)})`
                )
                .join(" | ")}</div>`
            : `<div class="superadmin-meta">No recipient records saved yet.</div>`
        }
        ${
          item.recipientPreview.length
            ? `<div class="superadmin-meta">Message sample: ${item.recipientPreview[0].subjectPreview || item.recipientPreview[0].messagePreview || "Preview unavailable"}</div>`
            : ""
        }
        ${
          item.recipientPreview.some((recipient) => recipient.shareLink)
            ? `<div class="superadmin-actions">${item.recipientPreview
                .filter((recipient) => recipient.shareLink)
                .slice(0, 2)
                .map((recipient) => `<a class="superadmin-btn-secondary" href="${recipient.shareLink}" target="_blank">WhatsApp link ${recipient.variant}</a>`)
                .join("")}</div>`
            : ""
        }
      </article>
    `,
    "No marketing campaigns created yet."
  );
};

const fillImpactForm = (event = null) => {
  document.getElementById("impactEventId").value = event?.id || "";
  document.getElementById("impactCampaignId").value = event?.campaignId || "";
  document.getElementById("impactTitle").value = event?.title || "";
  document.getElementById("impactDate").value = event?.eventDate ? new Date(event.eventDate).toISOString().slice(0, 10) : "";
  document.getElementById("impactLocation").value = event?.location || "";
  document.getElementById("impactNumber").value = event?.impactNumber || "";
  document.getElementById("impactLabel").value = event?.impactLabel || "people supported";
  document.getElementById("impactFundUsed").value = event?.fundUsed || "";
  document.getElementById("impactProgress").value = event?.progressPercent || "";
  document.getElementById("impactLiveUpdate").checked = Boolean(event?.isLiveUpdate);
  document.getElementById("impactLiveLabel").value = event?.liveLabel || "";
  document.getElementById("impactDescription").value = event?.description || "";
  document.getElementById("impactStoryTitle").value = event?.storyTitle || "";
  document.getElementById("impactStoryDescription").value = event?.storyDescription || "";
  document.getElementById("impactMapLink").value = event?.mapLink || "";
  document.getElementById("impactMetrics").value = linesFromMetrics(event?.metrics || []);
  document.getElementById("impactPhotos").value = linesFromList(event?.photos || []);
  document.getElementById("impactBeforePhotos").value = linesFromList(event?.beforePhotos || []);
  document.getElementById("impactAfterPhotos").value = linesFromList(event?.afterPhotos || []);
  document.getElementById("impactVideoUrl").value = event?.videoUrl || "";
  document.getElementById("impactReportNotes").value = event?.reportNotes || "";
  document.getElementById("impactShareMessage").value = event?.shareMessage || "";
  document.getElementById("impactDonorTags").value = (event?.donorTags || []).join("\n");
};

const loadImpactWorkspace = async () => {
  const [publicCampaigns, impactEvents] = await Promise.all([
    fetch(`${API_BASE}/campaign`).then((response) => response.json()),
    api("/marketing/impact-events", { headers: getHeaders(false) }),
  ]);

  const campaignSelect = document.getElementById("impactCampaignId");
  if (campaignSelect) {
    campaignSelect.innerHTML = `<option value="">Select campaign</option>${(Array.isArray(publicCampaigns) ? publicCampaigns : [])
      .map((campaign) => `<option value="${campaign._id}">${campaign.title}</option>`)
      .join("")}`;
  }

  fillImpactForm();

  document.getElementById("impactEventReset")?.addEventListener("click", () => {
    document.getElementById("impactEventForm")?.reset();
    fillImpactForm();
  });

  document.getElementById("impactEventForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const eventId = document.getElementById("impactEventId").value.trim();
    const payload = {
      campaignId: document.getElementById("impactCampaignId").value,
      title: document.getElementById("impactTitle").value.trim(),
      eventDate: document.getElementById("impactDate").value,
      location: document.getElementById("impactLocation").value.trim(),
      impactNumber: Number(document.getElementById("impactNumber").value || 0),
      impactLabel: document.getElementById("impactLabel").value.trim(),
      fundUsed: Number(document.getElementById("impactFundUsed").value || 0),
      progressPercent: Number(document.getElementById("impactProgress").value || 0),
      isLiveUpdate: document.getElementById("impactLiveUpdate").checked,
      liveLabel: document.getElementById("impactLiveLabel").value.trim(),
      description: document.getElementById("impactDescription").value.trim(),
      storyTitle: document.getElementById("impactStoryTitle").value.trim(),
      storyDescription: document.getElementById("impactStoryDescription").value.trim(),
      mapLink: document.getElementById("impactMapLink").value.trim(),
      metrics: document.getElementById("impactMetrics").value.trim(),
      photos: document.getElementById("impactPhotos").value.trim(),
      beforePhotos: document.getElementById("impactBeforePhotos").value.trim(),
      afterPhotos: document.getElementById("impactAfterPhotos").value.trim(),
      videoUrl: document.getElementById("impactVideoUrl").value.trim(),
      reportNotes: document.getElementById("impactReportNotes").value.trim(),
      shareMessage: document.getElementById("impactShareMessage").value.trim(),
      donorTags: document.getElementById("impactDonorTags").value.trim(),
    };

    const endpoint = eventId ? `/marketing/impact-events/${eventId}` : "/marketing/impact-events";
    const method = eventId ? "PUT" : "POST";
    const response = await api(endpoint, {
      method,
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });
    showMessage(document.getElementById("impactEventMessage"), response.message);
    window.location.reload();
  });

  renderList(
    "impactEventList",
    impactEvents,
    (item) => `
      <article class="superadmin-list-card superadmin-impact-card">
        <div class="superadmin-list-head">
          <div>
            <strong>${item.title}</strong>
            <p>${item.campaignTitle || "Campaign"} | ${formatShortDate(item.eventDate)}</p>
          </div>
          <span class="superadmin-badge status-${item.status}">${item.status}</span>
        </div>
        <div class="superadmin-impact-metrics">
          <div class="superadmin-impact-metric">
            <span>Fund used</span>
            <strong>${currency(item.fundUsed)}</strong>
          </div>
          <div class="superadmin-impact-metric">
            <span>Impact</span>
            <strong>${item.impactNumber} ${item.impactLabel}</strong>
          </div>
          <div class="superadmin-impact-metric">
            <span>Progress</span>
            <strong>${item.progressPercent || 0}%</strong>
          </div>
        </div>
        <p>${item.description || "No description added yet."}</p>
        <div class="superadmin-impact-footer">
          <div class="superadmin-meta">${item.isLiveUpdate ? item.liveLabel || "Live update" : item.location || "Location pending"}</div>
          ${item.reviewNotes ? `<div class="superadmin-meta">Review: ${item.reviewNotes}</div>` : ""}
        </div>
        <div class="superadmin-actions">
          <button class="superadmin-btn-secondary" type="button" data-edit-impact="${item.id}">Edit</button>
          <a class="superadmin-btn-secondary" href="${API_BASE}/marketing/impact-events/${item.id}/report" target="_blank">Report</a>
          ${
            item.shareMessage
              ? `<a class="superadmin-btn-secondary" href="https://wa.me/?text=${encodeURIComponent(item.shareMessage)}" target="_blank">Share</a>`
              : ""
          }
          <button class="superadmin-btn-danger" type="button" data-delete-impact="${item.id}">Delete</button>
        </div>
      </article>
    `,
    "No impact updates created yet."
  );

  document.querySelectorAll("[data-edit-impact]").forEach((button) => {
    button.addEventListener("click", () => {
      const selected = impactEvents.find((item) => item.id === button.dataset.editImpact);
      if (!selected) return;
      fillImpactForm(selected);
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });

  document.querySelectorAll("[data-delete-impact]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!window.confirm("Delete this impact update?")) return;
      await api(`/marketing/impact-events/${button.dataset.deleteImpact}`, {
        method: "DELETE",
        headers: getHeaders(false),
      });
      window.location.reload();
    });
  });
};

const loadSettingsHome = async () => {
  const data = await api("/marketing/dashboard", { headers: getHeaders(false) });
  const settingsOverview = document.getElementById("settingsOverview");
  if (settingsOverview) {
    settingsOverview.innerHTML = statCards([
      { label: "Consented Donors", value: data.totals.totalDonors, help: "Secure donor audience" },
      { label: "Engagement", value: data.totals.engagementRate, help: "Current average score" },
      { label: "Scheduled", value: data.totals.scheduledCampaigns, help: "Upcoming automation" },
      { label: "Email Sends", value: data.totals.emailsSent, help: "Tracked sends" },
    ]);
  }
};

const loadProfile = async () => {
  const data = await api("/marketing/settings", { headers: getHeaders(false) });
  document.getElementById("profileName").value = data.user?.name || "";
  document.getElementById("profileEmail").value = data.user?.email || "";
  document.getElementById("profileMobile").value = data.user?.mobile || "";
  document.getElementById("profilePhoto").value = data.user?.profilePhoto || "";
  document.getElementById("notificationEmail").checked = Boolean(data.user?.notifications?.email);
  document.getElementById("notificationReminders").checked = Boolean(data.user?.notifications?.reminders);

  document.getElementById("profileForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const response = await api("/marketing/profile", {
      method: "PUT",
      headers: getHeaders(),
      body: JSON.stringify({
        name: document.getElementById("profileName").value.trim(),
        email: document.getElementById("profileEmail").value.trim(),
        mobile: document.getElementById("profileMobile").value.trim(),
        profilePhoto: document.getElementById("profilePhoto").value.trim(),
        notifications: {
          email: document.getElementById("notificationEmail").checked,
          reminders: document.getElementById("notificationReminders").checked,
        },
      }),
    });
    if (response.user) {
      marketingSession.user = response.user;
      localStorage.setItem("user", JSON.stringify(response.user));
    }
    showMessage(document.getElementById("profileMessage"), response.message);
  });

  document.getElementById("passwordForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const response = await api("/marketing/profile/password", {
      method: "PUT",
      headers: getHeaders(),
      body: JSON.stringify({
        currentPassword: document.getElementById("currentPassword").value,
        newPassword: document.getElementById("newPassword").value,
      }),
    });
    event.target.reset();
    showMessage(document.getElementById("passwordMessage"), response.message);
  });
};

const loadSecurity = async () => {
  const data = await api("/marketing/security", { headers: getHeaders(false) });
  renderList(
    "marketingSecurityLogs",
    data.logs,
    (item) => `
      <article class="superadmin-list-card">
        <div class="superadmin-list-head">
          <strong>${item.action}</strong>
          <span class="superadmin-badge status-${item.severity}">${item.severity}</span>
        </div>
        <p>${item.targetLabel || "Marketing security event"}</p>
        <div class="superadmin-meta">${formatDate(item.createdAt)}</div>
      </article>
    `,
    "No security logs available."
  );
};

const bootLogin = () => {
  const form = document.getElementById("marketingLoginForm");
  const message = document.getElementById("marketingLoginMessage");
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

      if (data.user?.role !== "marketing") {
        throw new Error("This login is only for marketing accounts");
      }

      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));
      window.location.assign("/marketing/dashboard");
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

  const allowed = await ensureMarketing();
  if (!allowed) return;

  renderShell(pageKey);

  if (pageKey === "dashboard") await loadDashboard();
  if (pageKey === "donors") {
    bindSearchForm("donorSearchForm", [["donorSearch", "q"], ["donorSegment", "segment"]]);
    await loadDonors();
  }
  if (pageKey === "campaigns") await loadCampaignStudio();
  if (pageKey === "impact") await loadImpactWorkspace();
  if (pageKey === "settings") await loadSettingsHome();
  if (pageKey === "profile") await loadProfile();
  if (pageKey === "security") await loadSecurity();
};

bootPage().catch((error) => {
  const mount = document.querySelector("[data-page-content]");
  if (mount) {
    mount.innerHTML = `<div class="superadmin-card"><div class="superadmin-message is-error">${error.message}</div></div>`;
  }
});
