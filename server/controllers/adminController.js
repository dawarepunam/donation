const Campaign = require("../models/Campaign");
const Donation = require("../models/Donation");
const Subscription = require("../models/Subscription");
const User = require("../models/User");

const sanitizeAdmin = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  mobile: user.mobile || "",
  profilePhoto: user.profilePhoto || "",
  role: user.role,
  isActive: user.isActive !== false,
  notifications: user.notifications || {
    email: true,
    reminders: true,
  },
});

const currencyMonthKey = (value) =>
  new Date(value).toLocaleString("en-IN", {
    month: "short",
    year: "numeric",
  });

const adminCampaignFilter = (req) =>
  req.adminUser?.role === "superadmin" ? {} : { ownerAdminId: req.user.id };

const toCampaignCard = (campaign) => ({
  id: campaign._id,
  title: campaign.title,
  tagline: campaign.tagline || "",
  goalAmount: campaign.goalAmount || 0,
  raisedAmount: campaign.raisedAmount || 0,
  donorCount: campaign.donorCount || 0,
  status: campaign.status,
  isDraft: Boolean(campaign.isDraft),
  isPaused: Boolean(campaign.isPaused),
  category: campaign.category || "",
  location: campaign.location || "",
  ownerAdminName: campaign.ownerAdminName || "",
  viewCount: campaign.viewCount || 0,
  conversionRate: campaign.conversionRate || 0,
  updates: campaign.updates || [],
  createdAt: campaign.createdAt,
  updatedAt: campaign.updatedAt,
});

const getOwnedCampaignIds = async (req) => {
  const campaigns = await Campaign.find(adminCampaignFilter(req)).select("_id");
  return campaigns.map((item) => item._id);
};

exports.getDashboard = async (req, res) => {
  try {
    const campaigns = await Campaign.find(adminCampaignFilter(req)).sort({ updatedAt: -1 });
    const campaignIds = campaigns.map((item) => item._id);

    const [donations, subscriptions] = await Promise.all([
      Donation.find({ campaignId: { $in: campaignIds } })
        .populate("campaignId", "title")
        .populate("userId", "name email")
        .sort({ createdAt: -1 }),
      Subscription.find({ campaignId: { $in: campaignIds } })
        .populate("campaignId", "title")
        .populate("userId", "name email")
        .sort({ createdAt: -1 }),
    ]);

    const totalAmount = donations.reduce((sum, donation) => sum + (donation.amount || 0), 0);
    const monthlyMap = donations.reduce((acc, donation) => {
      const key = currencyMonthKey(donation.date || donation.createdAt);
      acc[key] = (acc[key] || 0) + (donation.amount || 0);
      return acc;
    }, {});

    res.json({
      admin: sanitizeAdmin(req.adminUserDocument),
      totals: {
        myCampaigns: campaigns.length,
        totalRaised: totalAmount,
        activeCampaigns: campaigns.filter((campaign) => campaign.status === "active").length,
        pendingCampaigns: campaigns.filter((campaign) => campaign.status === "pending").length,
        draftCampaigns: campaigns.filter((campaign) => campaign.isDraft).length,
        activeSubscriptions: subscriptions.filter((item) => item.status === "active").length,
      },
      campaigns: campaigns.map(toCampaignCard),
      recentDonations: donations.slice(0, 8).map((donation) => ({
        id: donation._id,
        donorName: donation.isAnonymous ? "Anonymous supporter" : donation.donorName,
        amount: donation.amount,
        date: donation.date || donation.createdAt,
        campaignTitle: donation.campaignId?.title || "Campaign",
      })),
      monthlyDonations: Object.entries(monthlyMap).map(([month, amount]) => ({ month, amount })),
      topDonors: donations
        .slice()
        .sort((a, b) => (b.amount || 0) - (a.amount || 0))
        .slice(0, 5)
        .map((donation) => ({
          id: donation._id,
          donorName: donation.isAnonymous ? "Anonymous supporter" : donation.donorName,
          amount: donation.amount,
          campaignTitle: donation.campaignId?.title || "Campaign",
        })),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getCampaigns = async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    const status = String(req.query.status || "").trim();
    const campaigns = await Campaign.find(adminCampaignFilter(req)).sort({ createdAt: -1 });

    const filtered = campaigns.filter((campaign) => {
      const statusMatch = status
        ? status === "draft"
          ? campaign.isDraft
          : campaign.status === status
        : true;
      const queryMatch = q
        ? new RegExp(q, "i").test(campaign.title || "") ||
          new RegExp(q, "i").test(campaign.category || "") ||
          new RegExp(q, "i").test(campaign.location || "")
        : true;
      return statusMatch && queryMatch;
    });

    res.json(filtered.map(toCampaignCard));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getCampaignById = async (req, res) => {
  try {
    const campaign = await Campaign.findOne({
      _id: req.params.id,
      ...adminCampaignFilter(req),
    });

    if (!campaign) {
      return res.status(404).json({ message: "Campaign not found" });
    }

    res.json(campaign);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getDonations = async (req, res) => {
  try {
    const campaignIds = await getOwnedCampaignIds(req);
    const donations = await Donation.find({ campaignId: { $in: campaignIds } })
      .populate("campaignId", "title")
      .populate("userId", "name email")
      .sort({ createdAt: -1 });

    res.json(
      donations.map((donation) => ({
        id: donation._id,
        donorName: donation.isAnonymous ? "Anonymous supporter" : donation.donorName,
        donorEmail: donation.donorEmail,
        amount: donation.amount,
        date: donation.date || donation.createdAt,
        campaignTitle: donation.campaignId?.title || "Campaign",
        userName: donation.userId?.name || "",
        financialYear: donation.financialYear,
      }))
    );
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getSubscriptions = async (req, res) => {
  try {
    const campaignIds = await getOwnedCampaignIds(req);
    const subscriptions = await Subscription.find({ campaignId: { $in: campaignIds } })
      .populate("campaignId", "title")
      .populate("userId", "name email")
      .sort({ createdAt: -1 });

    res.json(
      subscriptions.map((subscription) => ({
        id: subscription._id,
        userName: subscription.userId?.name || subscription.donorName,
        userEmail: subscription.userId?.email || subscription.donorEmail,
        amount: subscription.amount,
        status: subscription.status,
        nextPaymentDate: subscription.nextPaymentDate,
        campaignTitle: subscription.campaignId?.title || "Campaign",
      }))
    );
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getReports = async (req, res) => {
  try {
    const campaignIds = await getOwnedCampaignIds(req);
    const [campaigns, donations] = await Promise.all([
      Campaign.find({ _id: { $in: campaignIds } }).sort({ createdAt: -1 }),
      Donation.find({ campaignId: { $in: campaignIds } }).populate("campaignId", "title").sort({ createdAt: -1 }),
    ]);

    const monthlyMap = donations.reduce((acc, donation) => {
      const key = currencyMonthKey(donation.date || donation.createdAt);
      acc[key] = (acc[key] || 0) + (donation.amount || 0);
      return acc;
    }, {});

    const report = {
      generatedAt: new Date().toISOString(),
      admin: sanitizeAdmin(req.adminUserDocument),
      summary: {
        totalDonationAmount: donations.reduce((sum, item) => sum + (item.amount || 0), 0),
        totalDonations: donations.length,
        totalCampaigns: campaigns.length,
      },
      monthlyReport: Object.entries(monthlyMap).map(([month, amount]) => ({ month, amount })),
      campaignReport: campaigns.map((campaign) => ({
        id: campaign._id,
        title: campaign.title,
        status: campaign.status,
        raisedAmount: campaign.raisedAmount || 0,
        goalAmount: campaign.goalAmount || 0,
        donorCount: campaign.donorCount || 0,
      })),
    };

    res.json(report);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getMe = async (req, res) => {
  res.json({ user: sanitizeAdmin(req.adminUserDocument) });
};
