const Campaign = require("../models/Campaign");
const Donation = require("../models/Donation");
const ImpactEvent = require("../models/ImpactEvent");
const User = require("../models/User");
const { getOperationalEmails, getSuperAdminEmails } = require("../utils/admin");
const { notifyOperation, notifyUsers } = require("../utils/notifications");

const defaultWhereMoneyGoes = [
  {
    title: "Learning kits",
    description: "Books, notebooks and digital content access",
    percentage: 45,
  },
  {
    title: "Teacher support",
    description: "Mentor sessions and local teacher stipends",
    percentage: 35,
  },
  {
    title: "Community outreach",
    description: "Parent engagement, transport and field coordination",
    percentage: 20,
  },
];

const parseCollectionField = (value, fallback = []) => {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string" || !value.trim()) return fallback;

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch (error) {
    return fallback;
  }
};

const parseObjectField = (value, fallback = {}) => {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value !== "string" || !value.trim()) return fallback;

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : fallback;
  } catch (error) {
    return fallback;
  }
};

const normalizeStory = (story = {}) => {
  if (!story || typeof story !== "object") return {};

  return {
    title: story.title || "",
    description: story.description || "",
    imageUrl: story.imageUrl || "",
    impact: story.impact || "",
  };
};

const normalizeNgoDetails = (ngoDetails = {}) => {
  if (!ngoDetails || typeof ngoDetails !== "object") return {};

  return {
    name: ngoDetails.name !== undefined ? String(ngoDetails.name || "").trim() : "",
    pan: ngoDetails.pan !== undefined ? String(ngoDetails.pan || "").trim() : "",
    eightyGNumber:
      ngoDetails.eightyGNumber !== undefined ? String(ngoDetails.eightyGNumber || "").trim() : "",
    address: ngoDetails.address !== undefined ? String(ngoDetails.address || "").trim() : "",
    email: ngoDetails.email !== undefined ? String(ngoDetails.email || "").trim() : "",
    phone: ngoDetails.phone !== undefined ? String(ngoDetails.phone || "").trim() : "",
  };
};

const normalizeCampaignPayload = (body = {}) => {
  const media = parseCollectionField(body.media, []);
  const whereMoneyGoes = parseCollectionField(body.whereMoneyGoes, defaultWhereMoneyGoes);
  const story = normalizeStory(parseObjectField(body.story, {}));
  const ngoDetails = normalizeNgoDetails(parseObjectField(body.ngoDetails, {}));

  return {
    title: body.title !== undefined ? String(body.title || "").trim() : undefined,
    tagline: body.tagline !== undefined ? String(body.tagline || "").trim() : undefined,
    description: body.description !== undefined ? String(body.description || "").trim() : undefined,
    category: body.category !== undefined ? String(body.category || "Community Support").trim() : undefined,
    location: body.location !== undefined ? String(body.location || "").trim() : undefined,
    goalAmount: body.goalAmount !== undefined && body.goalAmount !== "" ? Number(body.goalAmount) : undefined,
    coverImage: body.coverImage !== undefined ? String(body.coverImage || "").trim() : undefined,
    impactPerUnit:
      body.impactPerUnit !== undefined && body.impactPerUnit !== "" ? Number(body.impactPerUnit) : undefined,
    impactLabel: body.impactLabel !== undefined ? String(body.impactLabel || "child supported").trim() : undefined,
    status:
      body.status !== undefined && ["pending", "active", "rejected", "completed"].includes(String(body.status))
        ? String(body.status)
        : undefined,
    featured:
      body.featured !== undefined
        ? body.featured === true || body.featured === "true" || body.featured === "on"
        : undefined,
    media,
    whereMoneyGoes: whereMoneyGoes.length ? whereMoneyGoes : defaultWhereMoneyGoes,
    story,
    ngoDetails,
  };
};

const canManageCampaign = (req, campaign) => {
  if (req.adminUser?.role === "superadmin") return true;
  return String(campaign.ownerAdminId || "") === String(req.user.id);
};

const notifyCampaignOwner = async (campaign, subject, html, contextLabel) => {
  if (!campaign?.ownerAdminId) return;
  const owner = await User.findById(campaign.ownerAdminId).select("name email isDeleted isActive");
  if (!owner || owner.isDeleted || owner.isActive === false || !owner.email) return;

  await notifyUsers({
    recipients: [owner.email],
    subject,
    html,
    contextLabel,
  });
};

const notifySuperAdmins = async (subject, html, contextLabel) => {
  const superAdminEmails = await getSuperAdminEmails();
  if (!superAdminEmails.length) return;

  await notifyUsers({
    recipients: superAdminEmails,
    subject,
    html,
    contextLabel,
  });
};

const getActor = (req, fallbackUser = null) => ({
  name: fallbackUser?.name || req.adminUserDocument?.name || req.superAdminUser?.name || "",
  email: fallbackUser?.email || req.adminUserDocument?.email || req.superAdminUser?.email || "",
  role: fallbackUser?.role || req.adminUserDocument?.role || req.superAdminUser?.role || "admin",
});

exports.createCampaign = async (req, res) => {
  try {
    const payload = normalizeCampaignPayload(req.body);

    if (!payload.title || !payload.goalAmount) {
      return res.status(400).json({ message: "Title and goal amount are required" });
    }

    const adminUser = await User.findById(req.user.id).select("name role");
    const requestedStatus = payload.status;
    const isDraft = req.body.isDraft === true || req.body.isDraft === "true";
    const status =
      adminUser?.role === "superadmin"
        ? requestedStatus || (isDraft ? "pending" : "active")
        : isDraft
          ? "pending"
          : "pending";

    const campaign = await Campaign.create({
      ...payload,
      status,
      isDraft,
      ownerAdminId: req.user.id,
      ownerAdminName: adminUser?.name || "Admin",
    });

    if (adminUser?.role === "admin") {
      await notifySuperAdmins(
        `New campaign submitted: ${campaign.title}`,
        `
          <h2>New campaign needs review</h2>
          <p><strong>${adminUser.name || "Admin"}</strong> created a new campaign.</p>
          <p><strong>Title:</strong> ${campaign.title}</p>
          <p><strong>Status:</strong> ${campaign.status}</p>
          <p><strong>Goal:</strong> INR ${campaign.goalAmount}</p>
          <p>Please open the SuperAdmin panel and approve or reject this campaign.</p>
        `,
        "campaign-submitted-to-superadmin"
      );
    }
    await notifyOperation({
      actor: getActor(req, adminUser),
      recipients: await getOperationalEmails(),
      subject: `Campaign created: ${campaign.title}`,
      operationTitle: "Campaign created",
      operationDetails: [
        `Campaign: <strong>${campaign.title}</strong>`,
        `Status: <strong>${campaign.status}</strong>`,
        `Goal amount: <strong>INR ${campaign.goalAmount}</strong>`,
      ],
      contextLabel: "campaign-created-ops",
    });

    res.status(201).json(campaign);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.updateCampaign = async (req, res) => {
  try {
    const payload = normalizeCampaignPayload(req.body);
    const updates = Object.fromEntries(
      Object.entries(payload).filter(([key, value]) => {
        if (value === undefined) return false;
        if (typeof value === "number" && Number.isNaN(value)) return false;
        if (value === "" && !["tagline", "description", "location", "coverImage"].includes(key)) return false;
        return true;
      })
    );

    const campaign = await Campaign.findById(req.params.id);

    if (!campaign) {
      return res.status(404).json({ message: "Campaign not found" });
    }

    if (!canManageCampaign(req, campaign)) {
      return res.status(403).json({ message: "You can only manage your own campaigns" });
    }

    const isDraft = req.body.isDraft === true || req.body.isDraft === "true";
    const isPaused = req.body.isPaused === true || req.body.isPaused === "true";
    const requestedStatus = String(req.body.status || "").trim();

    Object.assign(campaign, updates);
    if (req.adminUser?.role === "superadmin") {
      if (requestedStatus && ["pending", "active", "rejected", "completed"].includes(requestedStatus)) {
        campaign.status = requestedStatus;
      }
    } else {
      campaign.status = isDraft ? "pending" : campaign.status === "rejected" ? "pending" : campaign.status;
    }
    campaign.isDraft = isDraft;
    campaign.isPaused = isPaused;

    if (typeof req.body.updateTitle === "string" && req.body.updateTitle.trim()) {
      campaign.updates.push({
        title: req.body.updateTitle.trim(),
        description: String(req.body.updateDescription || "").trim(),
      });
    }

    await campaign.save();
    if (req.adminUser?.role === "superadmin") {
      await notifyCampaignOwner(
        campaign,
        `Campaign updated by SuperAdmin: ${campaign.title}`,
        `
          <h2>Campaign updated</h2>
          <p>Your campaign <strong>${campaign.title}</strong> was updated by SuperAdmin.</p>
          <p><strong>Status:</strong> ${campaign.status}</p>
          <p><strong>Paused:</strong> ${campaign.isPaused ? "Yes" : "No"}</p>
          <p><strong>Draft:</strong> ${campaign.isDraft ? "Yes" : "No"}</p>
          <p>Please review the latest changes in your admin panel.</p>
        `,
        "campaign-updated-owner-notification"
      );
    } else {
      await notifySuperAdmins(
        `Campaign updated by Admin: ${campaign.title}`,
        `
          <h2>Campaign updated by admin</h2>
          <p><strong>${req.adminUserDocument?.name || "Admin"}</strong> updated a campaign.</p>
          <p><strong>Title:</strong> ${campaign.title}</p>
          <p><strong>Status:</strong> ${campaign.status}</p>
          <p><strong>Paused:</strong> ${campaign.isPaused ? "Yes" : "No"}</p>
          <p><strong>Draft:</strong> ${campaign.isDraft ? "Yes" : "No"}</p>
          <p>Please review the latest campaign changes in the SuperAdmin panel.</p>
        `,
        "campaign-updated-by-admin-notification"
      );
    }
    await notifyOperation({
      actor: getActor(req),
      recipients: await getOperationalEmails(),
      subject: `Campaign updated: ${campaign.title}`,
      operationTitle: "Campaign updated",
      operationDetails: [
        `Campaign: <strong>${campaign.title}</strong>`,
        `Status: <strong>${campaign.status}</strong>`,
        `Paused: <strong>${campaign.isPaused ? "Yes" : "No"}</strong>`,
        `Draft: <strong>${campaign.isDraft ? "Yes" : "No"}</strong>`,
      ],
      contextLabel: "campaign-updated-ops",
    });

    res.json(campaign);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getCampaigns = async (req, res) => {
  try {
    const campaigns = await Campaign.find({
      status: { $in: ["active", "completed"] },
      isPaused: false,
    }).sort({ updatedAt: -1, createdAt: -1 });
    res.json(campaigns);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getCampaignById = async (req, res) => {
  try {
    const campaign = await Campaign.findById(req.params.id).lean();

    if (!campaign) {
      return res.status(404).json({ message: "Campaign not found" });
    }

    // Donors should only be able to open campaigns after superadmin approval.
    const isPubliclyVisible = ["active", "completed"].includes(campaign.status) && !campaign.isPaused;
    if (!isPubliclyVisible) {
      return res.status(404).json({ message: "Campaign is not public yet" });
    }

    const impactEvents = await ImpactEvent.find({
      campaignId: campaign._id,
      status: "approved",
    })
      .sort({ eventDate: -1, createdAt: -1 })
      .lean();

    res.json({
      ...campaign,
      impactEvents: impactEvents.map((eventDoc) => ({
        id: eventDoc._id,
        title: eventDoc.title,
        description: eventDoc.description,
        eventDate: eventDoc.eventDate,
        location: eventDoc.location,
        impactNumber: eventDoc.impactNumber || 0,
        impactLabel: eventDoc.impactLabel || "people supported",
        fundUsed: eventDoc.fundUsed || 0,
        progressPercent: eventDoc.progressPercent || 0,
        isLiveUpdate: Boolean(eventDoc.isLiveUpdate),
        liveLabel: eventDoc.liveLabel || "",
        storyTitle: eventDoc.storyTitle || "",
        storyDescription: eventDoc.storyDescription || "",
        mapLink: eventDoc.mapLink || "",
        shareMessage: eventDoc.shareMessage || "",
        metrics: eventDoc.metrics || [],
        photos: eventDoc.photos || [],
        beforePhotos: eventDoc.beforePhotos || [],
        afterPhotos: eventDoc.afterPhotos || [],
        videoUrl: eventDoc.videoUrl || "",
        approvedAt: eventDoc.approvedAt || null,
      })),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.deleteCampaign = async (req, res) => {
  try {
    const campaign = await Campaign.findById(req.params.id);

    if (!campaign) {
      return res.status(404).json({ message: "Campaign not found" });
    }

    if (!canManageCampaign(req, campaign)) {
      return res.status(403).json({ message: "You can only delete your own campaigns" });
    }

    await campaign.deleteOne();
    if (req.adminUser?.role === "superadmin") {
      await notifyCampaignOwner(
        campaign,
        `Campaign deleted by SuperAdmin: ${campaign.title}`,
        `
          <h2>Campaign deleted</h2>
          <p>Your campaign <strong>${campaign.title}</strong> was deleted by SuperAdmin.</p>
          <p><strong>Previous status:</strong> ${campaign.status}</p>
          <p>Please contact SuperAdmin if you need more details.</p>
        `,
        "campaign-deleted-owner-notification"
      );
    } else {
      await notifySuperAdmins(
        `Campaign deleted by Admin: ${campaign.title}`,
        `
          <h2>Campaign deleted by admin</h2>
          <p><strong>${req.adminUserDocument?.name || "Admin"}</strong> deleted a campaign.</p>
          <p><strong>Title:</strong> ${campaign.title}</p>
          <p><strong>Previous status:</strong> ${campaign.status}</p>
          <p>Please review the deletion in the SuperAdmin panel.</p>
        `,
        "campaign-deleted-by-admin-notification"
      );
    }
    await notifyOperation({
      actor: getActor(req),
      recipients: await getOperationalEmails(),
      subject: `Campaign deleted: ${campaign.title}`,
      operationTitle: "Campaign deleted",
      operationDetails: [
        `Campaign: <strong>${campaign.title}</strong>`,
        `Previous status: <strong>${campaign.status}</strong>`,
      ],
      contextLabel: "campaign-deleted-ops",
    });
    res.json({ message: "Campaign deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getHomeData = async (req, res) => {
  try {
    // Homepage should list only approved campaigns visible to donors.
    const campaigns = await Campaign.find({
      status: { $in: ["active", "completed"] },
      isPaused: false,
    })
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(6);
    const [liveDonations, allDonations] = await Promise.all([
      Donation.find()
        .populate("campaignId", "title")
        .populate("userId", "name profilePhoto")
        .sort({ createdAt: -1 })
        .limit(12),
      Donation.find(),
    ]);

    const totalDonated = allDonations.reduce((sum, item) => sum + item.amount, 0);
    const livesImpacted = allDonations.reduce((sum, item) => sum + item.impactUnits, 0);

    res.json({
      campaigns,
      stats: {
        campaigns: await Campaign.countDocuments({
          status: { $in: ["active", "completed"] },
          isPaused: false,
        }),
        donated: totalDonated,
        livesImpacted,
        donors: await Donation.countDocuments(),
      },
      leaderboard: liveDonations.slice(0, 5).map((donation) => ({
        id: donation._id,
        donorName: donation.isAnonymous
          ? "Anonymous supporter"
          : donation.userId?.name || donation.donorName,
        amount: donation.amount,
        campaignTitle: donation.campaignId?.title || "Campaign",
        isAnonymous: donation.isAnonymous,
      })),
      liveFeed: liveDonations.map((donation) => ({
        id: donation._id,
        donorName: donation.isAnonymous
          ? "Anonymous supporter"
          : donation.userId?.name || donation.donorName,
        amount: donation.amount,
        campaignId: donation.campaignId,
        campaignTitle: donation.campaignId?.title || "Campaign",
        createdAt: donation.createdAt,
        profilePhoto: donation.isAnonymous ? "" : donation.userId?.profilePhoto || "",
        profileInitials: donation.isAnonymous
          ? "AN"
          : String(donation.userId?.name || donation.donorName || "Supporter")
              .split(" ")
              .map((part) => part[0])
              .join("")
              .slice(0, 2)
              .toUpperCase(),
      })),
      recentDonors: liveDonations.slice(0, 6).map((donation) => ({
        id: donation._id,
        donorName: donation.isAnonymous
          ? "Anonymous supporter"
          : donation.userId?.name || donation.donorName,
        amount: donation.amount,
        campaignTitle: donation.campaignId?.title || "Campaign",
        createdAt: donation.createdAt,
        profilePhoto: donation.isAnonymous ? "" : donation.userId?.profilePhoto || "",
        profileInitials: donation.isAnonymous
          ? "AN"
          : String(donation.userId?.name || donation.donorName || "Supporter")
              .split(" ")
              .map((part) => part[0])
              .join("")
              .slice(0, 2)
              .toUpperCase(),
      })),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getSuccessStories = async (req, res) => {
  try {
    const campaigns = await Campaign.find({
      status: "completed",
      "story.title": { $exists: true, $ne: "" },
    }).sort({ updatedAt: -1 });

    res.json(campaigns.map((campaign) => campaign.story));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
