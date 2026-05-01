const CAMPAIGN_API_BASE = window.appSession?.apiBase || `${window.location.origin}/api`;

const formatCurrency = (amount) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount || 0);

const renderCampaignList = (campaigns) => {
  const statNode = document.getElementById("campaignListStats");
  const titleList = document.getElementById("campaignTitleList");
  const directory = document.getElementById("campaignDirectory");

  const totalRaised = campaigns.reduce((sum, campaign) => sum + (campaign.raisedAmount || 0), 0);
  const totalDonors = campaigns.reduce((sum, campaign) => sum + (campaign.donorCount || 0), 0);

  statNode.innerHTML = `
    <article class="stat-card">
      <span>Total campaigns</span>
      <strong>${campaigns.length}</strong>
    </article>
    <article class="stat-card">
      <span>Total raised</span>
      <strong>${formatCurrency(totalRaised)}</strong>
    </article>
    <article class="stat-card">
      <span>Total donors</span>
      <strong>${totalDonors}</strong>
    </article>
    <article class="stat-card">
      <span>Active causes</span>
      <strong>${campaigns.filter((campaign) => campaign.status === "active").length}</strong>
    </article>
  `;

  if (titleList) {
    titleList.innerHTML = campaigns.length
      ? campaigns
          .map(
            (campaign) => `
              <a class="campaign-title-chip" href="campaign.html?id=${campaign._id}">
                <strong>${campaign.title}</strong>
                <span>${campaign.status} | Goal ${formatCurrency(campaign.goalAmount)}</span>
              </a>
            `
          )
          .join("")
      : `<div class="empty-state">Campaign titles will appear here.</div>`;
  }

  if (directory) {
    directory.innerHTML = campaigns.length
      ? campaigns
          .map((campaign) => {
            const progress = Math.min(100, Math.round((campaign.raisedAmount / campaign.goalAmount) * 100 || 0));

            return `
              <article class="campaign-card">
                <img src="${campaign.coverImage}" alt="${campaign.title}" />
                <div class="campaign-card-body">
                  <p class="campaign-status ${campaign.status}">${campaign.status}</p>
                  <h3>${campaign.title}</h3>
                  <p>${campaign.tagline || campaign.description || "Transparent fundraising with measurable impact."}</p>
                  <div class="progress-track">
                    <span style="width:${progress}%"></span>
                  </div>
                  <div class="campaign-metrics">
                    <div>
                      <small>Raised</small>
                      <strong>${formatCurrency(campaign.raisedAmount)}</strong>
                    </div>
                    <div>
                      <small>Goal</small>
                      <strong>${formatCurrency(campaign.goalAmount)}</strong>
                    </div>
                    <div>
                      <small>Donors</small>
                      <strong>${campaign.donorCount || 0}</strong>
                    </div>
                    <div>
                      <small>Impact</small>
                      <strong>INR ${campaign.impactPerUnit} = 1 ${campaign.impactLabel}</strong>
                    </div>
                  </div>
                  <div class="hero-actions">
                    <a class="btn btn-secondary" href="campaign.html?id=${campaign._id}">View</a>
                    <a class="btn btn-primary" href="campaign.html?id=${campaign._id}">Donate</a>
                  </div>
                </div>
              </article>
            `;
          })
          .join("")
      : `<div class="empty-state">Campaign cards will appear here.</div>`;
  }
};

fetch(`${CAMPAIGN_API_BASE}/campaign`)
  .then((response) => response.json())
  .then((campaigns) => renderCampaignList(Array.isArray(campaigns) ? campaigns : []))
  .catch(() => {
    document.getElementById("campaignTitleList").innerHTML =
      `<div class="empty-state">Unable to load the campaign list right now.</div>`;
    const directory = document.getElementById("campaignDirectory");
    if (directory) {
      directory.innerHTML = `<div class="empty-state">Unable to load campaign cards right now.</div>`;
    }
  });
