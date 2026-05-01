const API_BASE = window.appSession?.apiBase || `${window.location.origin}/api`;
let sliderInterval = null;

const currency = (amount) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount || 0);

const formatFeedTime = (date) => {
  const diffMinutes = Math.max(1, Math.round((Date.now() - new Date(date).getTime()) / 60000));
  return diffMinutes <= 1 ? "just now" : `${diffMinutes} mins ago`;
};

const donorAvatar = (item, className) =>
  item.profilePhoto
    ? `<img class="${className}" src="${item.profilePhoto}" alt="${item.donorName}" />`
    : `<div class="${className} avatar-fallback">${item.profileInitials || "HS"}</div>`;

const renderStats = (stats) => {
  const target = document.getElementById("homeStats");
  if (!target) return;

  target.innerHTML = `
    <article class="stat-card">
      <span>Total donated</span>
      <strong>${currency(stats.donated)}</strong>
    </article>
    <article class="stat-card">
      <span>Lives helped</span>
      <strong>${stats.livesImpacted}</strong>
    </article>
    <article class="stat-card">
      <span>Campaigns</span>
      <strong>${stats.campaigns}</strong>
    </article>
    <article class="stat-card">
      <span>Donors</span>
      <strong>${stats.donors}</strong>
    </article>
  `;
};

const renderHeroSlider = (campaigns) => {
  const container = document.getElementById("heroSlider");
  if (!container) return;

  if (!campaigns.length) {
    container.innerHTML = `<div class="empty-state">Featured campaign visuals will appear here.</div>`;
    return;
  }

  const featured = campaigns.filter((campaign) => campaign.featured).length
    ? campaigns.filter((campaign) => campaign.featured)
    : campaigns;

  container.innerHTML = `
    <div class="slider-stage">
      ${featured
        .slice(0, 4)
        .map(
          (campaign, index) => `
            <article class="slider-card ${index === 0 ? "active" : ""}" data-slide="${index}">
              <img src="${campaign.coverImage}" alt="${campaign.title}" />
              <div class="slider-overlay">
                <p class="eyebrow">${campaign.category || "HopeSpring campaigns"}</p>
                <h3>${campaign.title}</h3>
                <p>${campaign.tagline || campaign.description || "Support a verified cause with transparent impact tracking."}</p>
                <a class="btn btn-primary" href="campaign.html?id=${campaign._id}">Donate Now</a>
              </div>
            </article>
          `
        )
        .join("")}
    </div>
    <div class="slider-dots">
      ${featured
        .slice(0, 4)
        .map((_, index) => `<button class="${index === 0 ? "active" : ""}" data-dot="${index}" type="button"></button>`)
        .join("")}
    </div>
  `;

  const slides = Array.from(container.querySelectorAll(".slider-card"));
  const dots = Array.from(container.querySelectorAll(".slider-dots button"));
  let activeIndex = 0;

  const setActiveSlide = (index) => {
    activeIndex = index;
    slides.forEach((slide, slideIndex) => {
      slide.classList.toggle("active", slideIndex === index);
    });
    dots.forEach((dot, dotIndex) => {
      dot.classList.toggle("active", dotIndex === index);
    });
  };

  dots.forEach((dot) => {
    dot.addEventListener("click", () => setActiveSlide(Number(dot.dataset.dot)));
  });

  if (sliderInterval) {
    window.clearInterval(sliderInterval);
  }

  sliderInterval = window.setInterval(() => {
    setActiveSlide((activeIndex + 1) % slides.length);
  }, 4000);
};

const renderCampaigns = (campaigns) => {
  const container = document.getElementById("campaign-grid");
  if (!container) return;

  if (!campaigns.length) {
    container.innerHTML = `<div class="empty-state">No campaigns yet. Add one from the admin panel.</div>`;
    return;
  }

  container.innerHTML = campaigns
    .map((campaign) => {
      const progress = Math.min(100, Math.round((campaign.raisedAmount / campaign.goalAmount) * 100 || 0));
      return `
        <article class="campaign-card campaign-card-large">
          <img src="${campaign.coverImage}" alt="${campaign.title}" />
          <div class="campaign-card-body">
            <p class="campaign-status ${campaign.status}">${campaign.status}</p>
            <h3>${campaign.title}</h3>
            <p>${campaign.tagline || campaign.description || "Direct giving with transparent impact tracking."}</p>
            <div class="progress-track">
              <span style="width:${progress}%"></span>
            </div>
            <div class="card-meta">
              <strong>${currency(campaign.raisedAmount)}</strong>
              <span>Goal ${currency(campaign.goalAmount)}</span>
            </div>
            <div class="campaign-metrics home-campaign-meta">
              <div>
                <small>Impact</small>
                <strong>INR ${campaign.impactPerUnit} = 1 ${campaign.impactLabel}</strong>
              </div>
              <div>
                <small>Donors</small>
                <strong>${campaign.donorCount}</strong>
              </div>
            </div>
            <div class="hero-actions">
              <a class="btn btn-secondary" href="campaign.html?id=${campaign._id}">View Campaign</a>
              <a class="btn btn-primary" href="campaign.html?id=${campaign._id}">Donate Now</a>
            </div>
          </div>
        </article>
      `;
    })
    .join("");
};

const renderImpactHighlights = (stats, donors) => {
  const container = document.getElementById("impactHighlights");
  if (!container) return;

  const featuredDonors = donors.slice(0, 3);
  container.innerHTML = `
    <article class="impact-feature-card">
      <p class="eyebrow">Giving at a glance</p>
      <h3>${currency(stats.donated)} collected across ${stats.campaigns} campaigns</h3>
      <p>${stats.donors} donors have already created ${stats.livesImpacted} visible impact moments.</p>
    </article>
    ${featuredDonors
      .map(
        (item) => `
          <article class="impact-donor-card">
            <div class="feed-item">
              ${donorAvatar(item, "feed-profile")}
              <div>
                <strong>${item.donorName}</strong>
                <p>${currency(item.amount)} for ${item.campaignTitle}</p>
                <small>${formatFeedTime(item.createdAt)}</small>
              </div>
            </div>
          </article>
        `
      )
      .join("")}
  `;
};

const renderFlow = () => {
  const container = document.getElementById("flowSteps");
  if (!container) return;

  const steps = [
    ["1", "Choose a campaign", "Open a fundraiser, review the goal, donor count, and where the money goes."],
    ["2", "Donate with Razorpay", "Enter donor details, choose one-time or monthly, and complete the payment popup."],
    ["3", "Verification and impact", "The backend verifies payment, updates the campaign, and calculates the impact message."],
    ["4", "Certificate and dashboard", "Receipt, 80G certificate, history, subscriptions, and tax reports stay in the donor dashboard."],
  ];

  container.innerHTML = steps
    .map(
      ([count, title, text]) => `
        <article class="flow-card">
          <span class="flow-index">${count}</span>
          <strong>${title}</strong>
          <p>${text}</p>
        </article>
      `
    )
    .join("");
};

const renderLiveFeed = (feed) => {
  const container = document.getElementById("liveFeed");
  if (!container) return;

  container.innerHTML = feed.length
    ? feed
        .map(
          (item) => `
            <div class="feed-item">
              ${donorAvatar(item, "feed-profile")}
              <div>
                <strong>${item.donorName}</strong>
                <p>donated ${currency(item.amount)} to ${item.campaignTitle} ${formatFeedTime(item.createdAt)}</p>
              </div>
            </div>
          `
        )
        .join("")
    : `<div class="empty-state">Your live donation feed will appear here.</div>`;
};

const renderLeaderboard = (entries) => {
  const container = document.getElementById("leaderboardList");
  if (!container) return;

  container.innerHTML = entries.length
    ? entries
        .map(
          (entry, index) => `
            <article class="leaderboard-card">
              <div>
                <span class="leaderboard-rank">#${index + 1}</span>
                <strong>${entry.donorName}</strong>
                <p>${entry.campaignTitle}</p>
              </div>
              <strong>${currency(entry.amount)}</strong>
            </article>
          `
        )
        .join("")
    : `<div class="empty-state">Leaderboard entries will appear here after donations start.</div>`;
};

const renderRecentDonors = (donors) => {
  const container = document.getElementById("recentDonors");
  if (!container) return;

  container.innerHTML = donors.length
    ? donors
        .map(
          (item) => `
            <article class="donor-card">
              ${donorAvatar(item, "donor-avatar")}
              <div>
                <strong>${item.donorName}</strong>
                <p>${currency(item.amount)} for ${item.campaignTitle}</p>
                <small>${formatFeedTime(item.createdAt)}</small>
              </div>
            </article>
          `
        )
        .join("")
    : `<div class="empty-state">New donor highlights will appear here.</div>`;
};

const renderStories = async () => {
  const res = await fetch(`${API_BASE}/campaign/stories`);
  const stories = await res.json();
  const container = document.getElementById("stories");
  if (!container) return;

  if (!stories.length) {
    container.innerHTML = `<div class="empty-state">Success stories will appear once campaigns are completed.</div>`;
    return;
  }

  container.innerHTML = stories
    .map(
      (story) => `
        <article class="story-card">
          <h3>${story.title}</h3>
          <p>${story.description}</p>
          <strong>${story.impact || ""}</strong>
        </article>
      `
    )
    .join("");
};

async function loadHome() {
  const res = await fetch(`${API_BASE}/campaign/home`);
  const data = await res.json();

  renderHeroSlider(data.campaigns || []);
  renderStats(data.stats || {});
  renderImpactHighlights(data.stats || {}, data.recentDonors || []);
  renderFlow();
  renderCampaigns(data.campaigns || []);
  renderLiveFeed(data.liveFeed || []);
  renderLeaderboard(data.leaderboard || []);
  renderRecentDonors(data.recentDonors || []);
  await renderStories();
}

window.addLiveDonation = (item) => {
  const liveFeed = document.getElementById("liveFeed");
  if (!liveFeed) return;

  const current = liveFeed.innerHTML.includes("empty-state") ? "" : liveFeed.innerHTML;
  liveFeed.innerHTML = `
    <div class="feed-item highlight">
      ${donorAvatar(item, "feed-profile")}
      <div>
        <strong>${item.donorName}</strong>
        <p>donated ${currency(item.amount)} to ${item.campaignTitle || "the campaign"} just now</p>
      </div>
    </div>
    ${current}
  `;

  const donors = document.getElementById("recentDonors");
  if (donors) {
    const existing = donors.innerHTML.includes("empty-state") ? "" : donors.innerHTML;
    donors.innerHTML = `
      <article class="donor-card highlight">
        ${donorAvatar(item, "donor-avatar")}
        <div>
          <strong>${item.donorName}</strong>
          <p>${currency(item.amount)} for ${item.campaignTitle || "the campaign"}</p>
          <small>just now</small>
        </div>
      </article>
      ${existing}
    `;
  }
};

loadHome();
