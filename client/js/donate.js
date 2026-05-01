const API_BASE = window.appSession?.apiBase || `${window.location.origin}/api`;
const APP_BASE = window.appSession?.origin || window.location.origin;
let token = localStorage.getItem("token");
const queryCampaignId = new URLSearchParams(window.location.search).get("id");
const campaignId = queryCampaignId || localStorage.getItem("campaignId");
let storedUser = JSON.parse(localStorage.getItem("user") || "null");

let campaignData = null;

const donationForm = document.getElementById("donationForm");
const donationSubmitButton = document.querySelector("#donationForm button[type='submit']");
let accountModalElements = null;

const renderDonationAccessState = () => {
  const helper = document.getElementById("donationAccessHelper");
  if (!helper) return;

  const returnTo = `${window.location.pathname}${window.location.search}`;
  helper.innerHTML =
    storedUser && token
      ? `Signed in as <strong>${storedUser.name || storedUser.email}</strong>. This donation will be linked to your account automatically.`
      : `You can continue as a guest. If this email is new, we will create your donor account automatically after payment. <a href="${APP_BASE}/login.html?reason=donate&returnTo=${encodeURIComponent(returnTo)}">Login</a> or <a href="${APP_BASE}/register.html?reason=donate&returnTo=${encodeURIComponent(returnTo)}">register</a> if you want the original flow first.`;
};

const persistDonationSession = (auth = null) => {
  if (!auth?.token || !auth?.user) {
    return;
  }

  token = auth.token;
  storedUser = auth.user;
  localStorage.setItem("token", auth.token);
  localStorage.setItem("user", JSON.stringify(auth.user));
  renderDonationAccessState();
};

const ensureAccountModal = () => {
  if (accountModalElements) {
    return accountModalElements;
  }

  const modal = document.createElement("div");
  modal.className = "account-modal";
  modal.setAttribute("hidden", "hidden");
  modal.innerHTML = `
    <div class="account-modal__backdrop" data-close-modal="true"></div>
    <div class="account-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="accountModalTitle">
      <button class="account-modal__close" type="button" aria-label="Close popup" data-close-modal="true">X</button>
      <div class="account-modal__badge">Account generated</div>
      <h3 id="accountModalTitle">Your donor account is ready</h3>
      <p class="account-modal__copy" id="accountModalMessage"></p>
      <div class="account-modal__card">
        <span>Email</span>
        <strong id="accountModalEmail"></strong>
      </div>
      <div class="account-modal__card">
        <span>Temporary password</span>
        <strong id="accountModalPassword"></strong>
      </div>
      <p class="account-modal__hint">This password is also sent by email. Login is already done automatically for this browser.</p>
      <div class="account-modal__actions">
        <a class="btn btn-secondary" href="${APP_BASE}/dashboard.html">Open Dashboard</a>
        <button class="btn btn-primary" type="button" id="accountModalDone">Continue</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const closeModal = () => {
    modal.setAttribute("hidden", "hidden");
    document.body.classList.remove("modal-open");
  };

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !modal.hasAttribute("hidden")) {
      closeModal();
    }
  });

  modal.addEventListener("click", (event) => {
    if (event.target instanceof HTMLElement && event.target.dataset.closeModal === "true") {
      closeModal();
    }
  });

  modal.querySelector("#accountModalDone")?.addEventListener("click", closeModal);

  accountModalElements = {
    modal,
    closeModal,
    message: modal.querySelector("#accountModalMessage"),
    email: modal.querySelector("#accountModalEmail"),
    password: modal.querySelector("#accountModalPassword"),
  };

  return accountModalElements;
};

const showAccountGeneratedPopup = (account = null) => {
  if (!account?.autoCreated) {
    return;
  }

  const modal = ensureAccountModal();
  if (!modal) {
    return;
  }

  modal.message.textContent =
    account.popupMessage || "Account generated successfully. Your login has also been completed automatically.";
  modal.email.textContent = account.email || storedUser?.email || "-";
  modal.password.textContent = account.generatedPassword || "Sent on email";
  modal.modal.removeAttribute("hidden");
  document.body.classList.add("modal-open");
};

const campaignTagline = (campaign) =>
  campaign.tagline ||
  campaign.story?.title ||
  `Support ${campaign.impactLabel || "meaningful change"} with transparent giving`;

const currency = (amount) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount || 0);

const getTaxEstimate = (amount) => Math.round(Number(amount || 0) * 0.15);
const getDurationMonths = () => Number(document.getElementById("durationMonths")?.value || 2);
const formatDate = (value) =>
  new Date(value).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

const renderCampaignImpactTimeline = (campaign) => {
  const target = document.getElementById("campaignImpactTimeline");
  if (!target) return;

  const events = Array.isArray(campaign.impactEvents) ? campaign.impactEvents : [];
  target.classList.remove("empty-state");
  target.innerHTML = events.length
    ? events
        .map(
          (event) => `
            <article class="impact-event-card">
              <div class="impact-event-card__head">
                <div>
                  <span class="impact-event-chip">${event.isLiveUpdate ? event.liveLabel || "Live update" : "Field update"}</span>
                  <h3>${event.title}</h3>
                  <p>${formatDate(event.eventDate)}${event.location ? ` | ${event.location}` : ""}</p>
                </div>
                <div class="impact-event-metrics">
                  <strong>${currency(event.fundUsed)}</strong>
                  <span>used</span>
                </div>
              </div>
              <p>${event.description || "Impact update published by the campaign team."}</p>
              <div class="impact-event-stats">
                <div><strong>${event.impactNumber}</strong><span>${event.impactLabel}</span></div>
                <div><strong>${event.progressPercent}%</strong><span>progress</span></div>
              </div>
              ${
                event.storyTitle || event.storyDescription
                  ? `<div class="impact-story-block"><strong>${event.storyTitle || "Impact story"}</strong><p>${event.storyDescription || ""}</p></div>`
                  : ""
              }
              ${
                event.metrics?.length
                  ? `<div class="impact-metric-inline">${event.metrics
                      .map((item) => `<span>${item.label}: <strong>${item.value}</strong></span>`)
                      .join("")}</div>`
                  : ""
              }
              ${
                [...(event.beforePhotos || []), ...(event.afterPhotos || []), ...(event.photos || [])].length
                  ? `<div class="impact-media-strip">${[
                      ...(event.beforePhotos || []),
                      ...(event.afterPhotos || []),
                      ...(event.photos || []),
                    ]
                      .slice(0, 6)
                      .map((item) => `<img src="${item.url}" alt="${item.label || event.title}" />`)
                      .join("")}</div>`
                  : ""
              }
              <div class="action-row">
                ${
                  event.mapLink
                    ? `<a class="btn btn-secondary" href="${event.mapLink}" target="_blank">Open Location</a>`
                    : ""
                }
                ${
                  event.shareMessage
                    ? `<a class="btn btn-secondary" href="https://wa.me/?text=${encodeURIComponent(event.shareMessage)}" target="_blank">Share Update</a>`
                    : ""
                }
              </div>
            </article>
          `
        )
        .join("")
    : `<div class="empty-state">Approved impact updates will appear here after the campaign team publishes them.</div>`;
};

const renderCampaignDetail = (campaign) => {
  const progress = Math.min(100, Math.round((campaign.raisedAmount / campaign.goalAmount) * 100 || 0));
  const media = campaign.media?.length
    ? campaign.media
        .map((item) =>
          item.type === "video"
            ? `<iframe src="${item.url}" title="${campaign.title}" loading="lazy"></iframe>`
            : `<img src="${item.url}" alt="${campaign.title}" />`
        )
        .join("")
    : `<img src="${campaign.coverImage}" alt="${campaign.title}" />`;

  const allocation = campaign.whereMoneyGoes?.length
    ? campaign.whereMoneyGoes
        .map(
          (item) => `
            <div class="allocation-item">
              <strong>${item.title} - ${item.percentage}%</strong>
              <p>${item.description}</p>
            </div>
          `
        )
        .join("")
    : `<div class="empty-state">Allocation details will be shared by the NGO team.</div>`;

  document.getElementById("campaignDetail").innerHTML = `
    <article class="panel campaign-overview">
      <div class="campaign-showcase">
        <div class="campaign-slider-card">
          <img src="${campaign.coverImage}" alt="${campaign.title}" />
          <div class="campaign-slider-overlay">
            <p class="eyebrow">${campaign.category || "Campaign spotlight"}</p>
            <h1>${campaign.title}</h1>
            <p class="campaign-tagline">${campaignTagline(campaign)}</p>
            <div class="hero-actions">
              <a class="btn btn-primary" href="#donationForm">Donate Now</a>
              <a
                class="btn btn-secondary"
                target="_blank"
                href="https://wa.me/?text=${encodeURIComponent(`Support ${campaign.title} with me: ${window.location.href}`)}"
              >
                Share
              </a>
            </div>
          </div>
        </div>
      </div>

      <div class="campaign-headline">
        <div>
          <p class="eyebrow">About this campaign</p>
          <h2>${campaign.title}</h2>
          <p>${campaign.description || "Transparent impact campaign."}</p>
        </div>
        <div class="helper-box">
          <div>
            <small>Location</small>
            <strong>${campaign.location || "Multi-city outreach"}</strong>
          </div>
          <div>
            <small>Status</small>
            <strong>${campaign.status}</strong>
          </div>
        </div>
      </div>

      <div class="media-grid">${media}</div>

      <div class="campaign-metrics">
        <div>
          <small>Raised</small>
          <strong>${currency(campaign.raisedAmount)}</strong>
        </div>
        <div>
          <small>Goal</small>
          <strong>${currency(campaign.goalAmount)}</strong>
        </div>
        <div>
          <small>Donors</small>
          <strong>${campaign.donorCount}</strong>
        </div>
        <div>
          <small>Impact</small>
          <strong>INR ${campaign.impactPerUnit} = 1 ${campaign.impactLabel}</strong>
        </div>
      </div>

      <div class="progress-track large">
        <span style="width:${progress}%"></span>
      </div>

      <div class="section-grid single">
        <div class="panel subtle">
          <p class="eyebrow">Impact per INR</p>
          <h3>INR ${campaign.impactPerUnit} = 1 ${campaign.impactLabel}</h3>
        </div>
        <div class="panel subtle">
          <p class="eyebrow">Where money goes</p>
          <div>${allocation}</div>
        </div>
      </div>
    </article>
  `;

  document.getElementById("impactPerRupee").textContent = `INR ${campaign.impactPerUnit} = 1 ${campaign.impactLabel}`;
  renderCampaignSupportMeta(campaign);
  renderCampaignImpactTimeline(campaign);
};

const renderCampaignSupportMeta = (campaign) => {
  document.getElementById("campaignSupportMeta").innerHTML = `
    <div class="support-meta-card">
      <strong>${campaign.donorCount}</strong>
      <span>people have already supported this campaign</span>
    </div>
    <div class="support-meta-card">
      <strong>${currency(campaign.goalAmount - campaign.raisedAmount > 0 ? campaign.goalAmount - campaign.raisedAmount : 0)}</strong>
      <span>still needed to reach the goal</span>
    </div>
    <div class="support-meta-card">
      <strong>${Math.min(100, Math.round((campaign.raisedAmount / campaign.goalAmount) * 100 || 0))}%</strong>
      <span>of the target is already funded</span>
    </div>
  `;
};

const updateTaxEstimate = () => {
  const amount = document.getElementById("amount").value;
  const show = document.getElementById("showTaxEstimate").checked;
  document.getElementById("taxEstimate").textContent = show ? currency(getTaxEstimate(amount)) : "Hidden";
  document.getElementById("monthlyDebit").textContent = currency(amount);
  document.getElementById("totalCommitment").textContent = currency(Number(amount || 0) * getDurationMonths());
};

const getDonationType = () =>
  document.querySelector("input[name='donationType']:checked")?.value || "one-time";

const syncDonationMode = () => {
  const isMonthly = getDonationType() === "monthly";
  document.getElementById("monthlyDurationWrap").classList.toggle("hidden", !isMonthly);
  document.querySelector("#donationForm button[type='submit']").textContent = isMonthly
    ? "Start Monthly Donation"
    : "Donate with Razorpay";
  updateTaxEstimate();
};

const renderImpactResult = (data) => {
  document.getElementById("impactResult").innerHTML = `
    <div class="success-box">
      <h3>${data.impactMessage}</h3>
      <p><strong>${currency(data.amount)}</strong> donated on ${formatDate(data.receiptSummary.donatedAt)} for ${data.receiptSummary.campaignTitle}.</p>
      <p>Tax saving estimate: <strong>${currency(data.taxSavingEstimate)}</strong></p>
      <p>Certificate ID: <strong>${data.certificate.certificateId}</strong> | FY <strong>${data.receiptSummary.financialYear}</strong></p>
      <p>${data.nextStepMessage || "Your donation has been saved successfully."}</p>
      ${
        data.account?.autoCreated
          ? `<div class="helper-box">
              <div>
                <small>Account created for</small>
                <strong>${data.account.email}</strong>
              </div>
              <div>
                <small>Security setup</small>
                <strong>Temporary password + OTP sent by email</strong>
              </div>
            </div>`
          : ""
      }
      ${
        data.subscription
          ? `<p>Monthly plan: <strong>${data.subscription.duration} months</strong> with next debit on <strong>${formatDate(
              data.subscription.nextPaymentDate
            )}</strong></p>
             <div class="schedule-preview">
               ${Array.from({ length: data.subscription.duration }, (_, index) => {
                 const date = new Date();
                 date.setMonth(date.getMonth() + index);
                 return `
                   <div class="schedule-row">
                     <span>Month ${index + 1}</span>
                     <strong>${currency(data.amount)}</strong>
                     <small>${formatDate(date)}</small>
                   </div>
                 `;
               }).join("")}
             </div>`
          : ""
      }
      <div class="action-row">
        <a class="btn btn-secondary" href="${API_BASE}/donation/certificate/download/${data.certificate.certificateId}" target="_blank">
          View Certificate
        </a>
        <a class="btn btn-primary" target="_blank" href="https://wa.me/?text=${encodeURIComponent(data.shareMessage)}">
          Share
        </a>
        <a class="btn btn-secondary" href="${data.auth?.autoLoggedIn ? `${APP_BASE}/dashboard.html` : `${APP_BASE}/login.html`}">
          ${data.auth?.autoLoggedIn ? "Open Dashboard" : "Login to View Dashboard"}
        </a>
      </div>
      ${
        data.campaignCompleted
          ? `<div class="confetti-banner">Campaign Completed. This fundraiser has reached its goal and the celebration state is active.</div>`
          : ""
      }
    </div>
  `;

  if (campaignData && data.campaignSnapshot) {
    campaignData = {
      ...campaignData,
      ...data.campaignSnapshot,
    };
    renderCampaignSupportMeta(campaignData);
  }
};

const launchRazorpay = async (payload) => {
  const submitButton = document.querySelector("#donationForm button[type='submit']");
  submitButton.disabled = true;
  submitButton.textContent = "Preparing payment...";

  try {
    const orderRes = await fetch(`${API_BASE}/donation/create-order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: payload.amount,
        campaignId,
      }),
    });

    const orderData = await orderRes.json();
    if (!orderRes.ok) {
      throw new Error(orderData.message || "Unable to create payment order");
    }

    const options = {
      key: orderData.key,
      amount: orderData.order.amount,
      currency: "INR",
      name: "HopeSpring NGO",
      description: campaignData.title,
      order_id: orderData.order.id,
      handler: async function (response) {
        const verifyRes = await fetch(`${API_BASE}/donation/verify`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: token } : {}),
          },
          body: JSON.stringify({
            campaignId,
            ...payload,
            durationMonths: payload.durationMonths,
            razorpayPaymentId: response.razorpay_payment_id || `pay_dev_${Date.now()}`,
            razorpayOrderId: response.razorpay_order_id || orderData.order.id,
            razorpaySignature: response.razorpay_signature || "dev_signature",
          }),
        });

        const result = await verifyRes.json();
        if (!verifyRes.ok) {
          alert(result.message || "Payment verification failed");
          return;
        }

        persistDonationSession(result.auth);
        renderImpactResult(result);
        showAccountGeneratedPopup(result.account);
      },
      prefill: {
        name: payload.name,
        email: payload.email,
        contact: payload.mobile,
      },
      theme: {
        color: "#0f766e",
      },
      modal: {
        ondismiss: () => {
          submitButton.disabled = false;
          syncDonationMode();
        },
      },
    };

    if (orderData.mode === "development") {
      await options.handler({});
      return;
    }

    const razorpay = new Razorpay(options);
    razorpay.open();
  } finally {
    submitButton.disabled = false;
    syncDonationMode();
  }
};

async function loadCampaign() {
  if (!campaignId) {
    window.location.href = "index.html";
    return;
  }

  const res = await fetch(`${API_BASE}/campaign/${campaignId}`);
  const campaign = await res.json();
  if (!res.ok) {
    throw new Error(campaign.message || "Unable to load campaign");
  }
  campaignData = campaign;
  renderCampaignDetail(campaign);
  if (storedUser) {
    document.getElementById("name").value = storedUser.name || "";
    document.getElementById("email").value = storedUser.email || "";
    document.getElementById("mobile").value = storedUser.mobile || "";
  }
  renderDonationAccessState();
}

document.getElementById("amount").addEventListener("input", updateTaxEstimate);
document.getElementById("showTaxEstimate").addEventListener("change", updateTaxEstimate);
document.getElementById("durationMonths").addEventListener("change", updateTaxEstimate);
document
  .querySelectorAll("input[name='donationType']")
  .forEach((input) => input.addEventListener("change", syncDonationMode));

document.getElementById("donationForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  try {
    const donationType = getDonationType();
    const payload = {
      name: document.getElementById("name").value.trim(),
      email: document.getElementById("email").value.trim(),
      mobile: document.getElementById("mobile").value.trim(),
      amount: Number(document.getElementById("amount").value),
      donationType,
      durationMonths: donationType === "monthly" ? getDurationMonths() : 1,
      isAnonymous: document.getElementById("anonymous").checked,
      receiveUpdates: document.getElementById("receiveUpdates")?.checked || false,
    };

    if (!payload.name || !payload.email || !payload.mobile || !payload.amount) {
      throw new Error("Please fill donor details and amount before paying.");
    }

    await launchRazorpay(payload);
  } catch (error) {
    alert(error.message || "Unable to start donation");
  }
});

loadCampaign().catch((error) => {
  document.getElementById("campaignDetail").innerHTML = `<div class="empty-state">${error.message}</div>`;
});
syncDonationMode();
updateTaxEstimate();
