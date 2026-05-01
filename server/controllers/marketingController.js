const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const AuditLog = require("../models/AuditLog");
const Campaign = require("../models/Campaign");
const Donation = require("../models/Donation");
const ImpactEvent = require("../models/ImpactEvent");
const MarketingCampaign = require("../models/MarketingCampaign");
const Subscription = require("../models/Subscription");
const SystemSetting = require("../models/SystemSetting");
const User = require("../models/User");
const { sendSafeEmail, notifyOperation } = require("../utils/notifications");

const DEFAULT_MARKETING_PERMISSIONS = [
  "donors.read.limited",
  "campaigns.send",
  "campaigns.schedule",
  "templates.use",
  "impact.manage",
];

const DEFAULT_MARKETING_TEMPLATES = {
  thankYou: "Thank you for your continued support, {name}.",
  campaignUpdate: "Support our latest campaign: {campaignTitle}.",
  reminder: "A kind reminder from HopeSpring, {name}.",
};

const formatCurrency = (value = 0) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

const normalizePermissions = (permissions) =>
  Array.isArray(permissions)
    ? permissions.map((item) => String(item || "").trim()).filter(Boolean)
    : DEFAULT_MARKETING_PERMISSIONS;

const sanitizeMarketingUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  mobile: user.mobile || "",
  profilePhoto: user.profilePhoto || "",
  role: user.role,
  isActive: user.isActive !== false,
  permissions: Array.isArray(user.permissions) ? user.permissions : [],
  notifications: user.notifications || {
    email: true,
    reminders: true,
  },
  lastLoginAt: user.lastLoginAt || null,
  createdAt: user.createdAt,
});

const ensureSystemSettings = async () => {
  let settings = await SystemSetting.findOne({ key: "platform" });
  if (!settings) {
    settings = await SystemSetting.create({
      key: "platform",
      emailTemplates: {
        donationThankYou: "Thank you for supporting HopeSpring.",
        campaignApproval: "Your campaign has been approved.",
        accountStatus: "Your account status has changed.",
        marketingThankYou: DEFAULT_MARKETING_TEMPLATES.thankYou,
        marketingCampaignUpdate: DEFAULT_MARKETING_TEMPLATES.campaignUpdate,
        marketingReminder: DEFAULT_MARKETING_TEMPLATES.reminder,
      },
    });
  }
  settings.emailTemplates = {
    marketingThankYou: DEFAULT_MARKETING_TEMPLATES.thankYou,
    marketingCampaignUpdate: DEFAULT_MARKETING_TEMPLATES.campaignUpdate,
    marketingReminder: DEFAULT_MARKETING_TEMPLATES.reminder,
    ...settings.emailTemplates,
  };
  return settings;
};

const getActor = (req) => ({
  name: req.marketingUser?.name || req.marketingUser?.email || "Marketing",
  email: req.marketingUser?.email || "",
  role: req.marketingUser?.role || "marketing",
});

const logMarketingAction = async (req, action, targetType, targetId, targetLabel, details = {}, severity = "info") => {
  try {
    await AuditLog.create({
      actorId: req.user.id,
      actorName: req.marketingUser?.email || "",
      actorRole: req.marketingUser?.role || "marketing",
      action,
      targetType,
      targetId: targetId ? String(targetId) : "",
      targetLabel: targetLabel || "",
      details,
      severity,
    });
  } catch (error) {
    console.error("Marketing audit log failed", error.message);
  }
};

const getDonationRange = (total = 0) => {
  if (total >= 20000) return "INR 20,000+";
  if (total >= 5000) return "INR 5,000 - 19,999";
  if (total >= 1000) return "INR 1,000 - 4,999";
  return "Below INR 1,000";
};

const getEngagementGuidance = (item) => {
  if (item.engagement.segment === "high") {
    return "High engagement: higher giving, recent activity, or frequent support.";
  }
  if (item.engagement.segment === "medium") {
    return "Medium engagement: moderate giving history with some recent support.";
  }
  return "Low engagement: limited or older donation activity.";
};

const getEngagementSnapshot = ({ donationCount = 0, totalDonated = 0, lastDonationAt = null, hasSubscription = false }) => {
  const daysSinceDonation = lastDonationAt ? Math.floor((Date.now() - new Date(lastDonationAt).getTime()) / 86400000) : 999;
  let score = donationCount * 14;
  score += Math.min(Math.round(totalDonated / 500), 40);
  score += hasSubscription ? 15 : 0;
  score += daysSinceDonation <= 45 ? 20 : daysSinceDonation <= 120 ? 10 : 0;
  score = Math.max(0, Math.min(100, score));

  if (score >= 70) {
    return { score, segment: "high", label: "High engagement" };
  }
  if (score >= 35) {
    return { score, segment: "medium", label: "Medium engagement" };
  }
  return { score, segment: "low", label: "Low engagement" };
};

const hasConsentForChannel = (user, channel) => {
  if (!user?.marketingConsent?.receiveUpdates) return false;
  if (channel === "whatsapp") return Boolean(user.marketingConsent?.whatsapp);
  return Boolean(user.marketingConsent?.email);
};

const personalizeTemplate = ({ template = "", user, campaignTitle, ctaUrl, impactMessage }) =>
  String(template || "")
    .replaceAll("{name}", user?.privacy?.showName === false ? "Supporter" : user?.name || "Supporter")
    .replaceAll("{campaignTitle}", campaignTitle || "HopeSpring campaign")
    .replaceAll("{ctaLink}", ctaUrl || "")
    .replaceAll("{impact}", impactMessage || "Your support keeps this mission moving.");

const buildTrackingUrl = (campaignDoc, recipientId) =>
  `${process.env.CLIENT_URL || "http://localhost:5000"}/api/marketing/click/${campaignDoc._id}/${recipientId}`;

const buildWhatsappShareLink = (message) => `https://wa.me/?text=${encodeURIComponent(message)}`;

const getCampaignRedirectPath = (campaignDoc) =>
  campaignDoc?.targetCampaignId ? `/campaign.html?id=${campaignDoc.targetCampaignId}` : "/campaigns.html";

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const parseStringList = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }

  if (typeof value !== "string" || !value.trim()) {
    return [];
  }

  return value
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
};

const parseMediaList = (value, type = "image") => {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "string") {
          return { type, url: item.trim(), label: "" };
        }
        if (!item || typeof item !== "object") return null;
        return {
          type: item.type === "video" ? "video" : type,
          url: String(item.url || "").trim(),
          label: String(item.label || "").trim(),
        };
      })
      .filter((item) => item?.url);
  }

  return parseStringList(value).map((url) => ({ type, url, label: "" }));
};

const parseMetricList = (value) => {
  const rows = Array.isArray(value) ? value : parseStringList(value);
  return rows
    .map((entry) => {
      if (entry && typeof entry === "object") {
        return {
          label: String(entry.label || "").trim(),
          value: String(entry.value || "").trim(),
        };
      }

      const raw = String(entry || "").trim();
      if (!raw) return null;
      const [label, ...rest] = raw.split(":");
      return {
        label: String(label || "").trim(),
        value: rest.join(":").trim(),
      };
    })
    .filter((item) => item?.label && item?.value);
};

const formatRecipientName = (user = {}) => (user?.privacy?.showName === false ? "Private donor" : user?.name || "Supporter");

const serializeImpactEvent = (eventDoc, options = {}) => {
  const isPublic = options.publicView === true;

  return {
    id: eventDoc._id,
    campaignId:
      typeof eventDoc.campaignId === "object" && eventDoc.campaignId?._id ? eventDoc.campaignId._id : eventDoc.campaignId,
    campaignTitle: eventDoc.campaignId?.title || "",
    title: eventDoc.title,
    description: eventDoc.description,
    eventDate: eventDoc.eventDate,
    location: eventDoc.location,
    impactNumber: eventDoc.impactNumber || 0,
    impactLabel: eventDoc.impactLabel || "people supported",
    fundUsed: eventDoc.fundUsed || 0,
    progressPercent: eventDoc.progressPercent || 0,
    status: eventDoc.status,
    isLiveUpdate: Boolean(eventDoc.isLiveUpdate),
    liveLabel: eventDoc.liveLabel || "",
    storyTitle: eventDoc.storyTitle || "",
    storyDescription: eventDoc.storyDescription || "",
    mapLink: eventDoc.mapLink || "",
    shareMessage: eventDoc.shareMessage || "",
    reportNotes: eventDoc.reportNotes || "",
    donorTags: isPublic ? [] : eventDoc.donorTags || [],
    metrics: eventDoc.metrics || [],
    photos: eventDoc.photos || [],
    beforePhotos: eventDoc.beforePhotos || [],
    afterPhotos: eventDoc.afterPhotos || [],
    videoUrl: eventDoc.videoUrl || "",
    reviewNotes: isPublic ? "" : eventDoc.reviewNotes || "",
    createdAt: eventDoc.createdAt,
    updatedAt: eventDoc.updatedAt,
    approvedAt: eventDoc.approvedAt || null,
    createdBy: isPublic
      ? null
      : {
          id: eventDoc.createdBy?._id || eventDoc.createdBy || null,
          name: eventDoc.createdBy?.name || "",
          email: eventDoc.createdBy?.email || "",
        },
  };
};

const sanitizeImpactPayload = (body = {}) => ({
  campaignId: String(body.campaignId || "").trim(),
  title: String(body.title || "").trim(),
  description: String(body.description || "").trim(),
  eventDate: body.eventDate ? new Date(body.eventDate) : null,
  location: String(body.location || "").trim(),
  impactNumber: toNumber(body.impactNumber, 0),
  impactLabel: String(body.impactLabel || "people supported").trim(),
  fundUsed: toNumber(body.fundUsed, 0),
  progressPercent: Math.max(0, Math.min(100, toNumber(body.progressPercent, 0))),
  isLiveUpdate: body.isLiveUpdate === true || body.isLiveUpdate === "true",
  liveLabel: String(body.liveLabel || "").trim(),
  storyTitle: String(body.storyTitle || "").trim(),
  storyDescription: String(body.storyDescription || "").trim(),
  mapLink: String(body.mapLink || "").trim(),
  shareMessage: String(body.shareMessage || "").trim(),
  reportNotes: String(body.reportNotes || "").trim(),
  donorTags: parseStringList(body.donorTags),
  metrics: parseMetricList(body.metrics),
  photos: parseMediaList(body.photos, "image"),
  beforePhotos: parseMediaList(body.beforePhotos, "image"),
  afterPhotos: parseMediaList(body.afterPhotos, "image"),
  videoUrl: String(body.videoUrl || "").trim(),
});

const buildImpactReportHtml = (eventDoc) => `
  <!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <title>${eventDoc.title} | Impact Report</title>
      <style>
        body { font-family: Segoe UI, Arial, sans-serif; margin: 32px; color: #0f172a; }
        .hero, .card { border: 1px solid #dbe4ea; border-radius: 18px; padding: 20px; margin-bottom: 18px; }
        .hero { background: linear-gradient(135deg, #f0fdfa, #fff7ed); }
        .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
        .metric { background: #f8fafc; border-radius: 14px; padding: 12px; }
        .media { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
        img { width: 100%; border-radius: 14px; object-fit: cover; min-height: 180px; }
        h1, h2, h3, p { margin-top: 0; }
        ul { padding-left: 18px; }
      </style>
    </head>
    <body>
      <section class="hero">
        <h1>${eventDoc.title}</h1>
        <p><strong>Campaign:</strong> ${eventDoc.campaignId?.title || "HopeSpring Campaign"}</p>
        <p><strong>Date:</strong> ${new Date(eventDoc.eventDate).toLocaleDateString("en-IN")}</p>
        <p><strong>Location:</strong> ${eventDoc.location || "Not shared"}</p>
        <p>${eventDoc.description || "Impact update report."}</p>
      </section>
      <section class="grid">
        <div class="metric"><strong>Fund Used</strong><br/>${formatCurrency(eventDoc.fundUsed || 0)}</div>
        <div class="metric"><strong>Impact</strong><br/>${eventDoc.impactNumber || 0} ${eventDoc.impactLabel || "people supported"}</div>
        <div class="metric"><strong>Progress</strong><br/>${eventDoc.progressPercent || 0}% complete</div>
        <div class="metric"><strong>Status</strong><br/>${eventDoc.isLiveUpdate ? eventDoc.liveLabel || "Live update" : "Published update"}</div>
      </section>
      ${
        eventDoc.metrics?.length
          ? `<section class="card"><h2>Impact Numbers</h2><ul>${eventDoc.metrics
              .map((item) => `<li><strong>${item.label}:</strong> ${item.value}</li>`)
              .join("")}</ul></section>`
          : ""
      }
      ${
        eventDoc.storyTitle || eventDoc.storyDescription
          ? `<section class="card"><h2>${eventDoc.storyTitle || "Impact Story"}</h2><p>${eventDoc.storyDescription || ""}</p></section>`
          : ""
      }
      ${
        eventDoc.reportNotes
          ? `<section class="card"><h2>Report Notes</h2><p>${eventDoc.reportNotes}</p></section>`
          : ""
      }
      ${
        [...(eventDoc.beforePhotos || []), ...(eventDoc.afterPhotos || []), ...(eventDoc.photos || [])].length
          ? `<section class="card"><h2>Media Proof</h2><div class="media">${[
              ...(eventDoc.beforePhotos || []),
              ...(eventDoc.afterPhotos || []),
              ...(eventDoc.photos || []),
            ]
              .map((item) => `<img src="${item.url}" alt="${item.label || eventDoc.title}" />`)
              .join("")}</div></section>`
          : ""
      }
      <script>window.onload = () => window.print();</script>
    </body>
  </html>
`;

const getConsentedDonors = async () => {
  const [users, subscriptions] = await Promise.all([
    User.find({
      role: "user",
      isDeleted: { $ne: true },
      isActive: true,
      "marketingConsent.receiveUpdates": true,
    }).lean(),
    Subscription.find({ status: "active" }).select("userId").lean(),
  ]);

  const userIds = users.map((user) => user._id);
  const donations = await Donation.find({ userId: { $in: userIds } })
    .populate("campaignId", "title")
    .select("userId amount date campaignId")
    .sort({ date: -1, createdAt: -1 })
    .lean();

  const subscriptionSet = new Set(subscriptions.map((item) => String(item.userId)));
  const donationMap = new Map();

  donations.forEach((donation) => {
    const key = String(donation.userId || "");
    const current = donationMap.get(key) || {
      donationCount: 0,
      totalDonated: 0,
      lastDonationAt: null,
      campaignStats: new Map(),
    };
    current.donationCount += 1;
    current.totalDonated += donation.amount || 0;
    if (!current.lastDonationAt || new Date(donation.date) > new Date(current.lastDonationAt)) {
      current.lastDonationAt = donation.date;
    }

    const campaignId = String(donation.campaignId?._id || donation.campaignId || "");
    const campaignKey = campaignId || "unknown";
    const existingCampaign = current.campaignStats.get(campaignKey) || {
      campaignId,
      title: donation.campaignId?.title || "Campaign",
      totalDonated: 0,
      donationCount: 0,
      lastDonationAt: donation.date,
    };
    existingCampaign.totalDonated += donation.amount || 0;
    existingCampaign.donationCount += 1;
    if (!existingCampaign.lastDonationAt || new Date(donation.date) > new Date(existingCampaign.lastDonationAt)) {
      existingCampaign.lastDonationAt = donation.date;
    }
    current.campaignStats.set(campaignKey, existingCampaign);
    donationMap.set(key, current);
  });

  return users.map((user) => {
    const donationSummary = donationMap.get(String(user._id)) || {
      donationCount: 0,
      totalDonated: 0,
      lastDonationAt: null,
      campaignStats: new Map(),
    };
    const engagement = getEngagementSnapshot({
      ...donationSummary,
      hasSubscription: subscriptionSet.has(String(user._id)),
    });
    const campaignsSupported = Array.from(donationSummary.campaignStats.values())
      .sort((a, b) => {
        if (b.totalDonated !== a.totalDonated) return b.totalDonated - a.totalDonated;
        return new Date(b.lastDonationAt || 0) - new Date(a.lastDonationAt || 0);
      });

    return {
      user,
      donationSummary,
      campaignsSupported,
      engagement,
      isActiveDonor: Boolean(donationSummary.lastDonationAt) &&
        Math.floor((Date.now() - new Date(donationSummary.lastDonationAt).getTime()) / 86400000) <= 120,
      isHighValueDonor: donationSummary.totalDonated >= 20000,
    };
  });
};

const filterAudience = (donors, audience = {}) =>
  donors.filter((item) => {
    if (audience.segment && audience.segment !== "all" && item.engagement.segment !== audience.segment) {
      return false;
    }

    if (audience.donorState === "active" && !item.isActiveDonor) {
      return false;
    }

    if (audience.donorState === "high-value" && !item.isHighValueDonor) {
      return false;
    }

    return true;
  });

const dispatchMarketingCampaign = async (campaignDoc) => {
  const targetCampaign = campaignDoc.targetCampaignId
    ? await Campaign.findById(campaignDoc.targetCampaignId).select("title")
    : null;
  const donors = filterAudience(await getConsentedDonors(), campaignDoc.audience || {}).filter(({ user }) =>
    hasConsentForChannel(user, campaignDoc.channel)
  );

  campaignDoc.status = "processing";
  campaignDoc.recipients = [];
  campaignDoc.metrics = {
    recipients: donors.length,
    delivered: 0,
    clicks: campaignDoc.metrics?.clicks || 0,
    reach: donors.length,
  };
  await campaignDoc.save();

  let delivered = 0;
  const recipientRecords = [];

  // Precompute recipient records so delivery, A/B split, and click tracking stay tied to saved IDs.
  for (let index = 0; index < donors.length; index += 1) {
    const donor = donors[index];
    const variant = campaignDoc.abTest?.enabled && index % 2 === 1 ? "B" : "A";
    const recipientId = new mongoose.Types.ObjectId();
    const trackingUrl = buildTrackingUrl(campaignDoc, recipientId);
    const bodyTemplate = variant === "B" && campaignDoc.messageB ? campaignDoc.messageB : campaignDoc.messageA;
    const campaignTitle = targetCampaign?.title || "HopeSpring campaign";
    const message = personalizeTemplate({
      template: bodyTemplate,
      user: donor.user,
      campaignTitle,
      ctaUrl: trackingUrl,
      impactMessage: `Your current giving range is ${getDonationRange(donor.donationSummary.totalDonated)}.`,
    });

    const recipientRecord = {
      _id: recipientId,
      userId: donor.user._id,
      email: donor.user.email,
      variant,
      channel: campaignDoc.channel,
      status: "pending",
      sentAt: null,
      clickedAt: null,
      clickCount: 0,
      shareLink: "",
    };

    if (campaignDoc.channel === "email") {
      const subject = personalizeTemplate({
        template: campaignDoc.subject || campaignTitle,
        user: donor.user,
        campaignTitle,
        ctaUrl: trackingUrl,
      });

      const result = await sendSafeEmail(
        {
          to: donor.user.email,
          subject,
          html: `
            <div style="font-family:Segoe UI,Tahoma,sans-serif;padding:16px;">
              <h2>${subject}</h2>
              <p>${message.replaceAll("\n", "<br/>")}</p>
              <p style="margin-top:16px;">
                <a href="${trackingUrl}" style="display:inline-block;padding:12px 18px;border-radius:999px;background:#0f766e;color:#ffffff;text-decoration:none;">
                  Open campaign
                </a>
              </p>
            </div>
          `,
        },
        "marketing-campaign-email"
      );

      recipientRecord.status = result?.failed ? "failed" : "sent";
      recipientRecord.sentAt = new Date();
      recipientRecord.recipientName = formatRecipientName(donor.user);
      recipientRecord.donationRange = getDonationRange(donor.donationSummary.totalDonated);
      recipientRecord.messagePreview = message;
      recipientRecord.subjectPreview = subject;
      if (!result?.failed) {
        delivered += 1;
      }
    } else {
      recipientRecord.status = "ready";
      recipientRecord.sentAt = new Date();
      recipientRecord.shareLink = buildWhatsappShareLink(`${message}\n${trackingUrl}`);
      recipientRecord.recipientName = formatRecipientName(donor.user);
      recipientRecord.donationRange = getDonationRange(donor.donationSummary.totalDonated);
      recipientRecord.messagePreview = message;
      recipientRecord.subjectPreview = campaignTitle;
      delivered += 1;
    }

    recipientRecords.push(recipientRecord);
  }

  campaignDoc.recipients = recipientRecords;
  campaignDoc.lastProcessedAt = new Date();
  campaignDoc.metrics.delivered = delivered;
  campaignDoc.status = campaignDoc.channel === "whatsapp" ? "ready" : "completed";
  await campaignDoc.save();

  return campaignDoc;
};

const serializeCampaign = (campaignDoc) => ({
  id: campaignDoc._id,
  title: campaignDoc.title,
  channel: campaignDoc.channel,
  templateKey: campaignDoc.templateKey,
  subject: campaignDoc.subject,
  status: campaignDoc.status,
  targetCampaignId: campaignDoc.targetCampaignId || null,
  targetCampaignTitle: campaignDoc.targetCampaignId?.title || "",
  scheduleAt: campaignDoc.scheduleAt,
  createdAt: campaignDoc.createdAt,
  updatedAt: campaignDoc.updatedAt,
  audience: campaignDoc.audience,
  abTest: campaignDoc.abTest,
  metrics: campaignDoc.metrics || {
    recipients: 0,
    delivered: 0,
    clicks: 0,
    reach: 0,
  },
  recipientPreview: (campaignDoc.recipients || []).slice(0, 8).map((recipient) => ({
    id: recipient._id,
    name: formatRecipientName(recipient.userId),
    email: recipient.email,
    recipientName: recipient.recipientName || formatRecipientName(recipient.userId),
    variant: recipient.variant,
    channel: recipient.channel,
    status: recipient.status,
    shareLink: recipient.shareLink || "",
    clickCount: recipient.clickCount || 0,
    totalDonated: recipient.userId?.totalDonated || 0,
    lastDonationAt: recipient.userId?.lastDonationAt || null,
    donationRange: recipient.donationRange || "",
    messagePreview: recipient.messagePreview || "",
    subjectPreview: recipient.subjectPreview || "",
  })),
});

exports.processScheduledCampaigns = async () => {
  const dueCampaigns = await MarketingCampaign.find({
    status: "scheduled",
    scheduleAt: { $lte: new Date() },
  });

  for (const campaignDoc of dueCampaigns) {
    await dispatchMarketingCampaign(campaignDoc);
  }
};

exports.getDashboard = async (req, res) => {
  try {
    await exports.processScheduledCampaigns();
    const [donors, campaigns, logs] = await Promise.all([
      getConsentedDonors(),
      MarketingCampaign.find({ createdBy: req.user.id }).sort({ createdAt: -1 }),
      AuditLog.find({ actorId: req.user.id }).sort({ createdAt: -1 }).limit(12),
    ]);

    const totalDonors = donors.length;
    const activeDonors = donors.filter((item) => item.isActiveDonor).length;
    const highValueDonors = donors.filter((item) => item.isHighValueDonor).length;
    const averageEngagementScore = totalDonors
      ? Math.round(donors.reduce((sum, item) => sum + item.engagement.score, 0) / totalDonors)
      : 0;

    res.json({
      totals: {
        totalDonors,
        activeDonors,
        highValueDonors,
        engagementRate: `${averageEngagementScore}%`,
        scheduledCampaigns: campaigns.filter((item) => item.status === "scheduled").length,
        emailsSent: campaigns.reduce((sum, item) => sum + (item.metrics?.delivered || 0), 0),
      },
      topSegments: ["high", "medium", "low"].map((segment) => ({
        segment,
        count: donors.filter((item) => item.engagement.segment === segment).length,
      })),
      recentCampaigns: campaigns.slice(0, 8).map(serializeCampaign),
      liveActivity: logs.map((log) => ({
        id: log._id,
        action: log.action,
        targetLabel: log.targetLabel,
        severity: log.severity,
        createdAt: log.createdAt,
      })),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getDonors = async (req, res) => {
  try {
    const q = String(req.query.q || "").trim().toLowerCase();
    const segment = String(req.query.segment || "all").trim();
    const donors = filterAudience(await getConsentedDonors(), { segment });
    const filtered = donors.filter((item) => {
      if (!q) return true;
      return (
        String(item.user.name || "").toLowerCase().includes(q) ||
        String(item.user.email || "").toLowerCase().includes(q) ||
        getDonationRange(item.donationSummary.totalDonated).toLowerCase().includes(q)
      );
    });

    res.json(
      filtered.map((item) => ({
        id: item.user._id,
        name: formatRecipientName(item.user),
        email: item.user.marketingConsent?.email ? item.user.email : "Consent required",
        donationRange: getDonationRange(item.donationSummary.totalDonated),
        totalDonated: item.donationSummary.totalDonated,
        donationCount: item.donationSummary.donationCount,
        lastDonationAt: item.donationSummary.lastDonationAt,
        engagementScore: item.engagement.score,
        engagementLabel: item.engagement.label,
        engagementGuide: getEngagementGuidance(item),
        segment: item.engagement.segment,
        receiveUpdates: Boolean(item.user.marketingConsent?.receiveUpdates),
        whatsappAllowed: Boolean(item.user.marketingConsent?.whatsapp),
        isActiveDonor: item.isActiveDonor,
        campaignsSupported: item.campaignsSupported.slice(0, 3).map((campaign) => ({
          campaignId: campaign.campaignId,
          title: campaign.title,
          totalDonated: campaign.totalDonated,
          donationCount: campaign.donationCount,
          lastDonationAt: campaign.lastDonationAt,
        })),
      }))
    );
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getAudiencePreview = async (req, res) => {
  try {
    const segment = String(req.query.segment || "all").trim();
    const donorState = String(req.query.donorState || "all").trim();
    const targetCampaignId = String(req.query.targetCampaignId || "").trim();
    const channel = req.query.channel === "whatsapp" ? "whatsapp" : "email";

    const donors = filterAudience(await getConsentedDonors(), { segment, donorState }).filter(({ user }) =>
      hasConsentForChannel(user, channel)
    );

    const matchedCampaignDonors = targetCampaignId
      ? donors.filter((item) => item.campaignsSupported.some((campaign) => String(campaign.campaignId) === targetCampaignId))
      : donors;

    const segmentCounts = {
      high: matchedCampaignDonors.filter((item) => item.engagement.segment === "high").length,
      medium: matchedCampaignDonors.filter((item) => item.engagement.segment === "medium").length,
      low: matchedCampaignDonors.filter((item) => item.engagement.segment === "low").length,
    };

    res.json({
      totalMatchingDonors: matchedCampaignDonors.length,
      activeDonors: matchedCampaignDonors.filter((item) => item.isActiveDonor).length,
      highValueDonors: matchedCampaignDonors.filter((item) => item.isHighValueDonor).length,
      segmentCounts,
      donors: matchedCampaignDonors.slice(0, 8).map((item) => ({
        id: item.user._id,
        name: formatRecipientName(item.user),
        email: item.user.marketingConsent?.email ? item.user.email : "Consent required",
        totalDonated: item.donationSummary.totalDonated,
        donationCount: item.donationSummary.donationCount,
        lastDonationAt: item.donationSummary.lastDonationAt,
        donationRange: getDonationRange(item.donationSummary.totalDonated),
        segment: item.engagement.segment,
        engagementScore: item.engagement.score,
        engagementGuide: getEngagementGuidance(item),
        campaignsSupported: item.campaignsSupported.slice(0, 3).map((campaign) => campaign.title),
      })),
      emptyReason: matchedCampaignDonors.length
        ? ""
        : `No ${channel} audience found for segment "${segment}" and donor state "${donorState}". Only donors who opted in during donation are eligible here.`,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getCampaigns = async (req, res) => {
  try {
    await exports.processScheduledCampaigns();
    const campaigns = await MarketingCampaign.find({ createdBy: req.user.id })
      .populate("targetCampaignId", "title")
      .populate("recipients.userId", "name privacy totalDonated lastDonationAt")
      .sort({ createdAt: -1 });
    res.json(campaigns.map(serializeCampaign));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getImpactEvents = async (req, res) => {
  try {
    const events = await ImpactEvent.find({ createdBy: req.user.id })
      .populate("campaignId", "title")
      .sort({ eventDate: -1, createdAt: -1 });

    res.json(events.map((eventDoc) => serializeImpactEvent(eventDoc)));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.createImpactEvent = async (req, res) => {
  try {
    const payload = sanitizeImpactPayload(req.body);
    if (!payload.campaignId || !payload.title || !payload.eventDate) {
      return res.status(400).json({ message: "Campaign, title, and date are required" });
    }

    const campaign = await Campaign.findById(payload.campaignId).select("title");
    if (!campaign) {
      return res.status(404).json({ message: "Linked campaign not found" });
    }

    const eventDoc = await ImpactEvent.create({
      ...payload,
      createdBy: req.user.id,
      status: "pending",
    });

    await logMarketingAction(req, "marketing.impact.created", "impact-event", eventDoc._id, eventDoc.title, {
      campaignId: payload.campaignId,
      fundUsed: payload.fundUsed,
      impactNumber: payload.impactNumber,
    });

    res.status(201).json({
      message: "Impact update saved and sent for SuperAdmin review",
      event: serializeImpactEvent(await ImpactEvent.findById(eventDoc._id).populate("campaignId", "title")),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.updateImpactEvent = async (req, res) => {
  try {
    const payload = sanitizeImpactPayload(req.body);
    const eventDoc = await ImpactEvent.findOne({ _id: req.params.id, createdBy: req.user.id }).populate("campaignId", "title");
    if (!eventDoc) {
      return res.status(404).json({ message: "Impact update not found" });
    }

    if (payload.campaignId) {
      const campaign = await Campaign.findById(payload.campaignId).select("title");
      if (!campaign) {
        return res.status(404).json({ message: "Linked campaign not found" });
      }
      eventDoc.campaignId = payload.campaignId;
    }

    Object.entries(payload).forEach(([key, value]) => {
      if (key === "campaignId") return;
      if (value !== null && value !== undefined) {
        eventDoc[key] = value;
      }
    });

    // Force a fresh review when marketing edits public impact data.
    eventDoc.status = "pending";
    eventDoc.reviewNotes = "";
    eventDoc.approvedBy = null;
    eventDoc.approvedAt = null;
    await eventDoc.save();

    await logMarketingAction(req, "marketing.impact.updated", "impact-event", eventDoc._id, eventDoc.title);
    res.json({
      message: "Impact update refreshed and sent back for review",
      event: serializeImpactEvent(await ImpactEvent.findById(eventDoc._id).populate("campaignId", "title")),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.deleteImpactEvent = async (req, res) => {
  try {
    const eventDoc = await ImpactEvent.findOne({ _id: req.params.id, createdBy: req.user.id });
    if (!eventDoc) {
      return res.status(404).json({ message: "Impact update not found" });
    }

    await eventDoc.deleteOne();
    await logMarketingAction(req, "marketing.impact.deleted", "impact-event", eventDoc._id, eventDoc.title, {}, "warning");
    res.json({ message: "Impact update deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.downloadImpactReport = async (req, res) => {
  try {
    const eventDoc = await ImpactEvent.findOne({ _id: req.params.id, createdBy: req.user.id }).populate("campaignId", "title");
    if (!eventDoc) {
      return res.status(404).json({ message: "Impact update not found" });
    }

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Content-Disposition", `inline; filename="impact-report-${eventDoc._id}.html"`);
    res.send(buildImpactReportHtml(eventDoc));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.createCampaign = async (req, res) => {
  try {
    const {
      title,
      channel,
      templateKey,
      subject,
      messageA,
      messageB,
      scheduleAt,
      audience,
      targetCampaignId,
      abTest,
      sendNow,
    } = req.body;

    if (!title || !messageA) {
      return res.status(400).json({ message: "Title and primary message are required" });
    }

    const campaignDoc = await MarketingCampaign.create({
      createdBy: req.user.id,
      title: String(title).trim(),
      channel: channel === "whatsapp" ? "whatsapp" : "email",
      templateKey: templateKey || "custom",
      subject: String(subject || "").trim(),
      messageA: String(messageA || "").trim(),
      messageB: String(messageB || "").trim(),
      scheduleAt: scheduleAt ? new Date(scheduleAt) : null,
      targetCampaignId: targetCampaignId || null,
      audience: {
        segment: audience?.segment || "all",
        donorState: audience?.donorState || "all",
      },
      abTest: {
        enabled: Boolean(abTest?.enabled),
        splitPercentage: Number(abTest?.splitPercentage || 50),
      },
      status: sendNow ? "processing" : scheduleAt ? "scheduled" : "draft",
    });

    if (sendNow) {
      await dispatchMarketingCampaign(campaignDoc);
    }

    await logMarketingAction(
      req,
      sendNow ? "marketing.campaign.sent" : "marketing.campaign.created",
      "marketing-campaign",
      campaignDoc._id,
      campaignDoc.title,
      { channel: campaignDoc.channel, scheduleAt: campaignDoc.scheduleAt }
    );

    res.status(201).json({
      message: sendNow
        ? "Marketing campaign sent successfully"
        : campaignDoc.status === "scheduled"
          ? "Marketing campaign scheduled successfully"
          : "Marketing draft saved successfully",
      campaign: serializeCampaign(await MarketingCampaign.findById(campaignDoc._id)),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getTemplates = async (req, res) => {
  try {
    const settings = await ensureSystemSettings();
    res.json({
      templates: {
        thankYou: settings.emailTemplates?.marketingThankYou || DEFAULT_MARKETING_TEMPLATES.thankYou,
        campaignUpdate: settings.emailTemplates?.marketingCampaignUpdate || DEFAULT_MARKETING_TEMPLATES.campaignUpdate,
        reminder: settings.emailTemplates?.marketingReminder || DEFAULT_MARKETING_TEMPLATES.reminder,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getSettings = async (req, res) => {
  try {
    const settings = await ensureSystemSettings();
    res.json({
      user: sanitizeMarketingUser(req.marketingUser),
      templates: {
        thankYou: settings.emailTemplates?.marketingThankYou || DEFAULT_MARKETING_TEMPLATES.thankYou,
        campaignUpdate: settings.emailTemplates?.marketingCampaignUpdate || DEFAULT_MARKETING_TEMPLATES.campaignUpdate,
        reminder: settings.emailTemplates?.marketingReminder || DEFAULT_MARKETING_TEMPLATES.reminder,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user || user.isDeleted || user.role !== "marketing") {
      return res.status(404).json({ message: "Marketing user not found" });
    }

    const { name, email, mobile, profilePhoto, notifications } = req.body;
    if (typeof name === "string" && name.trim()) user.name = name.trim();
    if (typeof email === "string" && email.trim()) {
      const normalizedEmail = email.trim().toLowerCase();
      const existing = await User.findOne({ email: normalizedEmail, _id: { $ne: user._id } });
      if (existing) {
        return res.status(409).json({ message: "Email already in use" });
      }
      user.email = normalizedEmail;
    }
    if (typeof mobile === "string") user.mobile = mobile.trim();
    if (typeof profilePhoto === "string") user.profilePhoto = profilePhoto.trim();
    if (notifications && typeof notifications === "object") {
      if (typeof notifications.email === "boolean") user.notifications.email = notifications.email;
      if (typeof notifications.reminders === "boolean") user.notifications.reminders = notifications.reminders;
    }

    await user.save();
    await logMarketingAction(req, "marketing.profile.updated", "user", user._id, user.email);
    res.json({ message: "Marketing profile updated successfully", user: sanitizeMarketingUser(user) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.changePassword = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user || user.isDeleted || user.role !== "marketing") {
      return res.status(404).json({ message: "Marketing user not found" });
    }

    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: "Current and new password are required" });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Current password is incorrect" });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();
    await logMarketingAction(req, "marketing.password.updated", "user", user._id, user.email, {}, "warning");
    res.json({ message: "Marketing password updated successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getSecurity = async (req, res) => {
  try {
    const logs = await AuditLog.find({ actorId: req.user.id }).sort({ createdAt: -1 }).limit(50);
    res.json({
      logs: logs.map((log) => ({
        id: log._id,
        action: log.action,
        targetLabel: log.targetLabel,
        severity: log.severity,
        createdAt: log.createdAt,
      })),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getActivities = async (req, res) => {
  try {
    const [campaigns, impactEvents] = await Promise.all([
      MarketingCampaign.find({ createdBy: req.user.id }).sort({ createdAt: -1 }),
      ImpactEvent.find({ createdBy: req.user.id }).populate("campaignId", "title").sort({ createdAt: -1 }).limit(20),
    ]);
    res.json(
      {
        campaigns: campaigns.map((campaignDoc) => ({
          id: campaignDoc._id,
          title: campaignDoc.title,
          channel: campaignDoc.channel,
          status: campaignDoc.status,
          recipients: campaignDoc.metrics?.recipients || 0,
          delivered: campaignDoc.metrics?.delivered || 0,
          clicks: campaignDoc.metrics?.clicks || 0,
          reach: campaignDoc.metrics?.reach || 0,
          createdAt: campaignDoc.createdAt,
        })),
        impactEvents: impactEvents.map((eventDoc) => serializeImpactEvent(eventDoc)),
      }
    );
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.trackClickAndRedirect = async (req, res) => {
  try {
    const campaignDoc = await MarketingCampaign.findById(req.params.campaignId);
    if (!campaignDoc) {
      return res.redirect("/campaigns.html");
    }

    const recipient = campaignDoc.recipients.id(req.params.recipientId);
    if (recipient) {
      recipient.clickCount = (recipient.clickCount || 0) + 1;
      recipient.clickedAt = new Date();
      recipient.status = "clicked";
      campaignDoc.metrics.clicks = (campaignDoc.metrics?.clicks || 0) + 1;
      campaignDoc.markModified("recipients");
      await campaignDoc.save();
    }

    res.redirect(getCampaignRedirectPath(campaignDoc));
  } catch (error) {
    res.redirect("/campaigns.html");
  }
};

exports.notifyMarketingCreation = async ({ actor, marketingUser }) => {
  await notifyOperation({
    actor,
    recipients: [marketingUser.email],
    subject: `Marketing access granted: ${marketingUser.email}`,
    operationTitle: "Marketing account created",
    operationDetails: [
      `Account: <strong>${marketingUser.name}</strong> (${marketingUser.email})`,
      `Permissions: <strong>${(marketingUser.permissions || []).join(", ") || "Default marketing access"}</strong>`,
    ],
    contextLabel: "marketing-user-created",
  });
};

exports.DEFAULT_MARKETING_PERMISSIONS = DEFAULT_MARKETING_PERMISSIONS;
exports.serializeImpactEvent = serializeImpactEvent;
