const bcrypt = require("bcryptjs");

const AuditLog = require("../models/AuditLog");
const Campaign = require("../models/Campaign");
const Donation = require("../models/Donation");
const ImpactEvent = require("../models/ImpactEvent");
const Subscription = require("../models/Subscription");
const SystemSetting = require("../models/SystemSetting");
const User = require("../models/User");
const MarketingCampaign = require("../models/MarketingCampaign");
const { getOperationalEmails } = require("../utils/admin");
const { notifyOperation, notifyUsers } = require("../utils/notifications");
const { DEFAULT_MARKETING_PERMISSIONS } = require("./marketingController");

const DEFAULT_ADMIN_PERMISSIONS = [
  "campaigns.read",
  "campaigns.create",
  "campaigns.update",
  "donations.read",
];

const DEFAULT_SYSTEM_SETTINGS = {
  key: "platform",
  taxPercentage: 50,
  platformFeePercentage: 0,
  supportEmail: "support@hopespring.org",
  receiptPrefix: "HSN",
  maintenanceMode: false,
  emailTemplates: {
    donationThankYou: "Thank you for supporting HopeSpring.",
    campaignApproval: "Your campaign has been approved.",
    accountStatus: "Your account status has changed.",
    marketingThankYou: "Thank you for your continued support, {name}.",
    marketingCampaignUpdate: "Support our latest campaign: {campaignTitle}.",
    marketingReminder: "A kind reminder from HopeSpring, {name}.",
  },
};

const normalizePermissions = (permissions) =>
  Array.isArray(permissions)
    ? permissions.map((item) => String(item || "").trim()).filter(Boolean)
    : DEFAULT_ADMIN_PERMISSIONS;

const sanitizeUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  mobile: user.mobile || "",
  profilePhoto: user.profilePhoto || "",
  role: user.role,
  isActive: user.isActive !== false,
  isDeleted: Boolean(user.isDeleted),
  permissions: Array.isArray(user.permissions) ? user.permissions : [],
  totalDonated: user.totalDonated || 0,
  lastDonationAt: user.lastDonationAt,
  lastLoginAt: user.lastLoginAt,
  createdAt: user.createdAt,
});

const ensureSystemSettings = async () => {
  let settings = await SystemSetting.findOne({ key: "platform" });
  if (!settings) {
    settings = await SystemSetting.create(DEFAULT_SYSTEM_SETTINGS);
  }
  return settings;
};

const notifyAdminRecipients = async ({ recipients = [], subject, html, contextLabel }) =>
  notifyUsers({ recipients, subject, html, contextLabel });

const notifyCampaignOwner = async (campaign, subject, html, contextLabel) => {
  if (!campaign?.ownerAdminId) return;
  const owner = await User.findById(campaign.ownerAdminId).select("name email isDeleted isActive");
  if (!owner || owner.isDeleted || owner.isActive === false || !owner.email) return;
  await notifyAdminRecipients({
    recipients: [owner.email],
    subject,
    html,
    contextLabel,
  });
};

const getActor = (req) => ({
  name: req.superAdminUser?.name || req.superAdminUser?.email || "SuperAdmin",
  email: req.superAdminUser?.email || "",
  role: req.superAdminUser?.role || "superadmin",
});

const logAction = async (req, action, targetType, targetId, targetLabel, details = {}, severity = "info") => {
  try {
    await AuditLog.create({
      actorId: req.user.id,
      actorName: req.superAdminUser?.email || "",
      actorRole: req.superAdminUser?.role || "superadmin",
      action,
      targetType,
      targetId: targetId ? String(targetId) : "",
      targetLabel: targetLabel || "",
      details,
      severity,
    });
  } catch (error) {
    console.error("Audit log failed", error.message);
  }
};

const buildUserQuery = ({ role, q }) => {
  const filter = { isDeleted: { $ne: true } };

  if (role && ["user", "admin", "superadmin", "marketing"].includes(role)) {
    filter.role = role;
  }

  if (q) {
    const regex = new RegExp(String(q).trim(), "i");
    filter.$or = [{ name: regex }, { email: regex }, { mobile: regex }];
  }

  return filter;
};

exports.getDashboard = async (req, res) => {
  try {
    const [users, admins, marketingUsers, campaigns, donations, subscriptions, marketingCampaigns, latestUsers, logs] = await Promise.all([
      User.countDocuments({ role: "user", isDeleted: { $ne: true } }),
      User.countDocuments({ role: { $in: ["admin", "superadmin"] }, isDeleted: { $ne: true } }),
      User.countDocuments({ role: "marketing", isDeleted: { $ne: true } }),
      Campaign.find().sort({ updatedAt: -1 }),
      Donation.find().populate("campaignId", "title").populate("userId", "name email").sort({ createdAt: -1 }),
      Subscription.find().populate("userId", "name email").populate("campaignId", "title").sort({ createdAt: -1 }),
      MarketingCampaign.find().sort({ createdAt: -1 }),
      User.find({ isDeleted: { $ne: true } }).select("name email role isActive createdAt").sort({ createdAt: -1 }).limit(8),
      AuditLog.find().sort({ createdAt: -1 }).limit(10),
    ]);

    const totalDonationAmount = donations.reduce((sum, donation) => sum + (donation.amount || 0), 0);
    const monthlyRevenueMap = donations.reduce((acc, donation) => {
      const key = new Date(donation.date || donation.createdAt).toLocaleString("en-IN", {
        month: "short",
        year: "numeric",
      });
      acc[key] = (acc[key] || 0) + (donation.amount || 0);
      return acc;
    }, {});

    const activeUsers = await User.countDocuments({
      $or: [{ totalDonated: { $gt: 0 } }, { role: { $in: ["admin", "superadmin"] } }],
      isActive: true,
      isDeleted: { $ne: true },
    });

    res.json({
      totals: {
        totalUsers: users,
        totalAdmins: admins,
        totalMarketingUsers: marketingUsers,
        totalCampaigns: campaigns.length,
        totalDonations: donations.length,
        totalDonationAmount,
        activeCampaigns: campaigns.filter((campaign) => campaign.status === "active").length,
        pendingCampaigns: campaigns.filter((campaign) => campaign.status === "pending").length,
        activeUsers,
        activeSubscriptions: subscriptions.filter((item) => item.status === "active").length,
        marketingEmailsSent: marketingCampaigns.reduce((sum, item) => sum + (item.metrics?.delivered || 0), 0),
        marketingCampaignReach: marketingCampaigns.reduce((sum, item) => sum + (item.metrics?.reach || 0), 0),
      },
      monthlyRevenue: Object.entries(monthlyRevenueMap).map(([month, amount]) => ({ month, amount })),
      topCampaigns: campaigns
        .map((campaign) => ({
          id: campaign._id,
          title: campaign.title,
          status: campaign.status,
          raisedAmount: campaign.raisedAmount || 0,
          donorCount: campaign.donorCount || 0,
          goalAmount: campaign.goalAmount || 0,
        }))
        .sort((a, b) => b.raisedAmount - a.raisedAmount)
        .slice(0, 6),
      latestUsers: latestUsers.map(sanitizeUser),
      recentDonations: donations.slice(0, 10).map((donation) => ({
        id: donation._id,
        donorName: donation.isAnonymous ? "Anonymous supporter" : donation.donorName,
        amount: donation.amount,
        campaignTitle: donation.campaignId?.title || "Campaign",
        userName: donation.userId?.name || "",
        userEmail: donation.userId?.email || "",
        createdAt: donation.createdAt,
      })),
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

exports.getAdmins = async (req, res) => {
  try {
    const admins = await User.find(buildUserQuery({ role: "admin", q: req.query.q })).sort({ createdAt: -1 });
    res.json(admins.map(sanitizeUser));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getMarketingUsers = async (req, res) => {
  try {
    const marketingUsers = await User.find(buildUserQuery({ role: "marketing", q: req.query.q })).sort({ createdAt: -1 });
    res.json(marketingUsers.map(sanitizeUser));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getAdminById = async (req, res) => {
  try {
    const admin = await User.findOne({
      _id: req.params.id,
      role: { $in: ["admin", "superadmin"] },
      isDeleted: { $ne: true },
    });

    if (!admin) {
      return res.status(404).json({ message: "Admin not found" });
    }

    res.json(sanitizeUser(admin));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getUsers = async (req, res) => {
  try {
    const users = await User.find(buildUserQuery({ role: req.query.role, q: req.query.q })).sort({ createdAt: -1 });
    res.json(users.map(sanitizeUser));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getUserById = async (req, res) => {
  try {
    const user = await User.findOne({ _id: req.params.id, isDeleted: { $ne: true } });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const [donations, subscriptions] = await Promise.all([
      Donation.find({ userId: user._id }).populate("campaignId", "title").sort({ createdAt: -1 }),
      Subscription.find({ userId: user._id }).populate("campaignId", "title").sort({ createdAt: -1 }),
    ]);

    res.json({
      profile: sanitizeUser(user),
      donations: donations.map((donation) => ({
        id: donation._id,
        amount: donation.amount,
        donationType: donation.donationType,
        financialYear: donation.financialYear,
        campaignTitle: donation.campaignId?.title || "Campaign",
        date: donation.date || donation.createdAt,
      })),
      subscriptions: subscriptions.map((subscription) => ({
        id: subscription._id,
        amount: subscription.amount,
        status: subscription.status,
        nextPaymentDate: subscription.nextPaymentDate,
        campaignTitle: subscription.campaignId?.title || "Campaign",
      })),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getUserDonations = async (req, res) => {
  try {
    const donations = await Donation.find({ userId: req.params.id }).populate("campaignId", "title").sort({ createdAt: -1 });

    res.json(
      donations.map((donation) => ({
        id: donation._id,
        amount: donation.amount,
        date: donation.date,
        donationType: donation.donationType,
        financialYear: donation.financialYear,
        campaignTitle: donation.campaignId?.title || "Campaign",
      }))
    );
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.createAdmin = async (req, res) => {
  try {
    const { name, email, password, mobile, permissions } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: "Name, email and password are required" });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      return res.status(409).json({ message: "User already exists with this email" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const admin = await User.create({
      name: String(name).trim(),
      email: normalizedEmail,
      mobile: String(mobile || "").trim(),
      password: hashedPassword,
      role: "admin",
      isActive: true,
      permissions: normalizePermissions(permissions),
    });

    await logAction(req, "admin.created", "user", admin._id, admin.email, { permissions: admin.permissions });
    await notifyAdminRecipients({
      recipients: [admin.email],
      subject: "Your admin account has been created",
      html: `
        <h2>Admin access granted</h2>
        <p>Hello ${admin.name},</p>
        <p>Your HopeSpring admin account has been created by the SuperAdmin team.</p>
        <p><strong>Email:</strong> ${admin.email}</p>
        <p><strong>Status:</strong> Active</p>
        <p>You can now log in and manage campaigns assigned to your account.</p>
      `,
      contextLabel: "admin-created-notification",
    });
    await notifyOperation({
      actor: getActor(req),
      recipients: await getOperationalEmails(),
      subject: `Admin created: ${admin.email}`,
      operationTitle: "Admin account created",
      operationDetails: [
        `Admin: <strong>${admin.name}</strong> (${admin.email})`,
        `Permissions: <strong>${admin.permissions.join(", ")}</strong>`,
      ],
      contextLabel: "admin-created-ops",
    });

    res.status(201).json({
      message: "Admin created successfully",
      admin: sanitizeUser(admin),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.updateAdmin = async (req, res) => {
  try {
    const admin = await User.findOne({ _id: req.params.id, role: "admin", isDeleted: { $ne: true } });
    if (!admin) {
      return res.status(404).json({ message: "Admin not found" });
    }

    const { name, email, mobile, permissions, isActive, password } = req.body;

    if (typeof name === "string" && name.trim()) {
      admin.name = name.trim();
    }

    if (typeof email === "string" && email.trim()) {
      const normalizedEmail = email.trim().toLowerCase();
      const existing = await User.findOne({ email: normalizedEmail, _id: { $ne: admin._id } });
      if (existing) {
        return res.status(409).json({ message: "Email already in use" });
      }
      admin.email = normalizedEmail;
    }

    if (typeof mobile === "string") {
      admin.mobile = mobile.trim();
    }

    if (typeof isActive === "boolean") {
      admin.isActive = isActive;
    }

    if (Array.isArray(permissions)) {
      admin.permissions = normalizePermissions(permissions);
    }

    if (typeof password === "string" && password.trim()) {
      admin.password = await bcrypt.hash(password.trim(), 10);
    }

    await admin.save();
    await logAction(req, "admin.updated", "user", admin._id, admin.email, { isActive: admin.isActive });
    await notifyAdminRecipients({
      recipients: [admin.email],
      subject: "Your admin account has been updated",
      html: `
        <h2>Admin account updated</h2>
        <p>Hello ${admin.name},</p>
        <p>The SuperAdmin team updated your admin access.</p>
        <p><strong>Status:</strong> ${admin.isActive ? "Active" : "Blocked"}</p>
        <p><strong>Permissions:</strong> ${(admin.permissions || []).join(", ") || "No explicit permissions"}</p>
      `,
      contextLabel: "admin-updated-notification",
    });
    await notifyOperation({
      actor: getActor(req),
      recipients: await getOperationalEmails(),
      subject: `Admin updated: ${admin.email}`,
      operationTitle: "Admin account updated",
      operationDetails: [
        `Admin: <strong>${admin.name}</strong> (${admin.email})`,
        `Status: <strong>${admin.isActive ? "Active" : "Blocked"}</strong>`,
      ],
      contextLabel: "admin-updated-ops",
    });

    res.json({
      message: "Admin updated successfully",
      admin: sanitizeUser(admin),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.updateUserAccess = async (req, res) => {
  try {
    const { role, isActive, permissions, name, mobile } = req.body;
    const user = await User.findById(req.params.id);

    if (!user || user.isDeleted) {
      return res.status(404).json({ message: "User not found" });
    }

    if (String(user._id) === String(req.user.id) && role && role !== user.role) {
      return res.status(400).json({ message: "Superadmin cannot change their own role" });
    }

    if (typeof name === "string" && name.trim()) {
      user.name = name.trim();
    }

    if (typeof mobile === "string") {
      user.mobile = mobile.trim();
    }

    if (typeof isActive === "boolean") {
      user.isActive = isActive;
    }

    if (role && ["user", "admin", "superadmin"].includes(role)) {
      user.role = role;
    }

    if (role && role === "marketing") {
      user.role = role;
    }

    if (Array.isArray(permissions)) {
      user.permissions = normalizePermissions(permissions);
    }

    await user.save();
    await logAction(req, "user.access.updated", "user", user._id, user.email, { role: user.role, isActive: user.isActive });
    if (user.role === "admin" || user.role === "superadmin" || user.role === "marketing") {
      await notifyAdminRecipients({
        recipients: [user.email],
        subject: "Your platform access has changed",
        html: `
          <h2>Access updated</h2>
          <p>Hello ${user.name},</p>
          <p>The SuperAdmin team updated your account access.</p>
          <p><strong>Role:</strong> ${user.role}</p>
          <p><strong>Status:</strong> ${user.isActive ? "Active" : "Blocked"}</p>
        `,
        contextLabel: "access-updated-notification",
      });
    }
    await notifyOperation({
      actor: getActor(req),
      recipients: await getOperationalEmails(),
      subject: `Access updated: ${user.email}`,
      operationTitle: "User access updated",
      operationDetails: [
        `User: <strong>${user.name}</strong> (${user.email})`,
        `Role: <strong>${user.role}</strong>`,
        `Status: <strong>${user.isActive ? "Active" : "Blocked"}</strong>`,
      ],
      contextLabel: "access-updated-ops",
    });

    res.json({
      message: "Access updated successfully",
      user: sanitizeUser(user),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.createMarketingUser = async (req, res) => {
  try {
    const { name, email, password, mobile, permissions, isActive } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: "Name, email and password are required" });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      return res.status(409).json({ message: "User already exists with this email" });
    }

    const marketingUser = await User.create({
      name: String(name).trim(),
      email: normalizedEmail,
      mobile: String(mobile || "").trim(),
      password: await bcrypt.hash(password, 10),
      role: "marketing",
      isActive: typeof isActive === "boolean" ? isActive : true,
      permissions: Array.isArray(permissions) && permissions.length ? normalizePermissions(permissions) : DEFAULT_MARKETING_PERMISSIONS,
    });

    await logAction(req, "marketing.created", "user", marketingUser._id, marketingUser.email, {
      permissions: marketingUser.permissions,
    });
    await notifyAdminRecipients({
      recipients: [marketingUser.email],
      subject: "Your marketing account has been created",
      html: `
        <h2>Marketing access granted</h2>
        <p>Hello ${marketingUser.name},</p>
        <p>Your HopeSpring marketing account has been created by the SuperAdmin team.</p>
        <p><strong>Email:</strong> ${marketingUser.email}</p>
        <p><strong>Status:</strong> ${marketingUser.isActive ? "Active" : "Blocked"}</p>
        <p><strong>Permissions:</strong> ${(marketingUser.permissions || []).join(", ") || "Default marketing access"}</p>
      `,
      contextLabel: "marketing-created-notification",
    });
    res.status(201).json({
      message: "Marketing user created successfully",
      user: sanitizeUser(marketingUser),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.updateMarketingUser = async (req, res) => {
  try {
    const marketingUser = await User.findOne({ _id: req.params.id, role: "marketing", isDeleted: { $ne: true } });
    if (!marketingUser) {
      return res.status(404).json({ message: "Marketing user not found" });
    }

    const { name, email, mobile, permissions, isActive, password } = req.body;
    if (typeof name === "string" && name.trim()) marketingUser.name = name.trim();
    if (typeof email === "string" && email.trim()) {
      const normalizedEmail = email.trim().toLowerCase();
      const existing = await User.findOne({ email: normalizedEmail, _id: { $ne: marketingUser._id } });
      if (existing) {
        return res.status(409).json({ message: "Email already in use" });
      }
      marketingUser.email = normalizedEmail;
    }
    if (typeof mobile === "string") marketingUser.mobile = mobile.trim();
    if (typeof isActive === "boolean") marketingUser.isActive = isActive;
    if (Array.isArray(permissions)) marketingUser.permissions = normalizePermissions(permissions);
    if (typeof password === "string" && password.trim()) {
      marketingUser.password = await bcrypt.hash(password.trim(), 10);
    }

    await marketingUser.save();
    await logAction(req, "marketing.updated", "user", marketingUser._id, marketingUser.email, {
      isActive: marketingUser.isActive,
    });
    await notifyAdminRecipients({
      recipients: [marketingUser.email],
      subject: "Your marketing account has been updated",
      html: `
        <h2>Marketing account updated</h2>
        <p>Hello ${marketingUser.name},</p>
        <p>Your HopeSpring marketing access was updated by the SuperAdmin team.</p>
        <p><strong>Status:</strong> ${marketingUser.isActive ? "Active" : "Blocked"}</p>
        <p><strong>Permissions:</strong> ${(marketingUser.permissions || []).join(", ") || "Default marketing access"}</p>
      `,
      contextLabel: "marketing-updated-notification",
    });
    res.json({
      message: "Marketing user updated successfully",
      user: sanitizeUser(marketingUser),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getMarketingActivity = async (req, res) => {
  try {
    const [campaigns, logs, impactEvents] = await Promise.all([
      MarketingCampaign.find().populate("createdBy", "name email").sort({ createdAt: -1 }).limit(30),
      AuditLog.find({ actorRole: "marketing" }).sort({ createdAt: -1 }).limit(30),
      ImpactEvent.find().populate("campaignId", "title").populate("createdBy", "name email").sort({ createdAt: -1 }).limit(20),
    ]);

    res.json({
      campaigns: campaigns.map((item) => ({
        id: item._id,
        title: item.title,
        channel: item.channel,
        status: item.status,
        createdBy: item.createdBy?.name || item.createdBy?.email || "Marketing",
        recipients: item.metrics?.recipients || 0,
        delivered: item.metrics?.delivered || 0,
        clicks: item.metrics?.clicks || 0,
        reach: item.metrics?.reach || 0,
        createdAt: item.createdAt,
      })),
      logs: logs.map((log) => ({
        id: log._id,
        action: log.action,
        targetLabel: log.targetLabel,
        severity: log.severity,
        createdAt: log.createdAt,
      })),
      impactEvents: impactEvents.map((item) => ({
        id: item._id,
        title: item.title,
        campaignTitle: item.campaignId?.title || "Campaign",
        createdBy: item.createdBy?.name || item.createdBy?.email || "Marketing",
        status: item.status,
        fundUsed: item.fundUsed || 0,
        impactNumber: item.impactNumber || 0,
        impactLabel: item.impactLabel || "people supported",
        reviewNotes: item.reviewNotes || "",
        eventDate: item.eventDate,
        createdAt: item.createdAt,
      })),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getMarketingImpactEvents = async (req, res) => {
  try {
    const impactEvents = await ImpactEvent.find()
      .populate("campaignId", "title")
      .populate("createdBy", "name email")
      .sort({ createdAt: -1 });

    res.json(
      impactEvents.map((item) => ({
        id: item._id,
        title: item.title,
        campaignTitle: item.campaignId?.title || "Campaign",
        createdBy: item.createdBy?.name || item.createdBy?.email || "Marketing",
        status: item.status,
        location: item.location || "",
        fundUsed: item.fundUsed || 0,
        impactNumber: item.impactNumber || 0,
        impactLabel: item.impactLabel || "people supported",
        reviewNotes: item.reviewNotes || "",
        eventDate: item.eventDate,
        createdAt: item.createdAt,
      }))
    );
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.reviewMarketingImpactEvent = async (req, res) => {
  try {
    const eventDoc = await ImpactEvent.findById(req.params.id).populate("campaignId", "title");
    if (!eventDoc) {
      return res.status(404).json({ message: "Impact update not found" });
    }

    const status = String(req.body.status || "").trim();
    if (!["approved", "rejected"].includes(status)) {
      return res.status(400).json({ message: "Valid review status is required" });
    }

    eventDoc.status = status;
    eventDoc.reviewNotes = String(req.body.reviewNotes || "").trim();
    eventDoc.approvedBy = req.user.id;
    eventDoc.approvedAt = status === "approved" ? new Date() : null;
    await eventDoc.save();

    await logAction(req, `marketing.impact.${status}`, "impact-event", eventDoc._id, eventDoc.title, {
      campaignId: eventDoc.campaignId?._id || null,
      reviewNotes: eventDoc.reviewNotes,
    });

    res.json({
      message: `Impact update ${status} successfully`,
      event: {
        id: eventDoc._id,
        title: eventDoc.title,
        status: eventDoc.status,
        reviewNotes: eventDoc.reviewNotes,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user || user.isDeleted) {
      return res.status(404).json({ message: "User not found" });
    }

    if (String(user._id) === String(req.user.id)) {
      return res.status(400).json({ message: "Superadmin cannot delete their own account" });
    }

    user.isDeleted = true;
    user.isActive = false;
    user.email = `deleted_${user._id}_${Date.now()}@deleted.local`;
    await user.save();

    await logAction(req, "user.deleted", "user", user._id, user.name, {}, "warning");
    await notifyOperation({
      actor: getActor(req),
      recipients: await getOperationalEmails(),
      subject: `User deleted: ${user.name}`,
      operationTitle: "User account deleted",
      operationDetails: [
        `User: <strong>${user.name}</strong>`,
        `Original email: <strong>${user.email}</strong>`,
      ],
      contextLabel: "user-deleted-ops",
    });
    res.json({ message: "User deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getCampaigns = async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    const status = String(req.query.status || "").trim();
    const filter = {};

    if (status) {
      filter.status = status;
    }

    if (q) {
      const regex = new RegExp(q, "i");
      filter.$or = [{ title: regex }, { category: regex }, { location: regex }];
    }

    const campaigns = await Campaign.find(filter).sort({ createdAt: -1 });
    res.json(
      campaigns.map((campaign) => ({
        id: campaign._id,
        title: campaign.title,
        tagline: campaign.tagline,
        goalAmount: campaign.goalAmount,
        raisedAmount: campaign.raisedAmount,
        donorCount: campaign.donorCount,
        status: campaign.status,
        category: campaign.category,
        location: campaign.location,
        createdAt: campaign.createdAt,
      }))
    );
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.updateCampaignStatus = async (req, res) => {
  try {
    const { status } = req.body;
    if (!["pending", "active", "rejected", "completed"].includes(status)) {
      return res.status(400).json({ message: "Invalid campaign status" });
    }

    const campaign = await Campaign.findById(req.params.id);
    if (!campaign) {
      return res.status(404).json({ message: "Campaign not found" });
    }

    campaign.status = status;
    if (status === "active" || status === "completed") {
      campaign.isDraft = false;
      campaign.isPaused = false;
    }
    await campaign.save();
    await logAction(req, "campaign.status.updated", "campaign", campaign._id, campaign.title, { status });
    await notifyCampaignOwner(
      campaign,
      `Campaign ${status}: ${campaign.title}`,
      `
        <h2>Campaign status updated</h2>
        <p>Your campaign <strong>${campaign.title}</strong> was marked as <strong>${status}</strong> by SuperAdmin.</p>
        <p>${status === "active" ? "The campaign is now visible to donors." : "Please review the campaign in your admin panel."}</p>
      `,
      "campaign-status-notification"
    );
    await notifyOperation({
      actor: getActor(req),
      recipients: await getOperationalEmails(),
      subject: `Campaign ${status}: ${campaign.title}`,
      operationTitle: "Campaign status changed",
      operationDetails: [
        `Campaign: <strong>${campaign.title}</strong>`,
        `New status: <strong>${status}</strong>`,
      ],
      contextLabel: "campaign-status-ops",
    });

    res.json({ message: "Campaign status updated successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getDonations = async (req, res) => {
  try {
    const filter = {};
    const q = String(req.query.q || "").trim();
    const campaignId = String(req.query.campaignId || "").trim();
    const from = String(req.query.from || "").trim();
    const to = String(req.query.to || "").trim();

    if (campaignId) {
      filter.campaignId = campaignId;
    }

    if (from || to) {
      filter.date = {};
      if (from) filter.date.$gte = new Date(from);
      if (to) filter.date.$lte = new Date(`${to}T23:59:59.999Z`);
    }

    const donations = await Donation.find(filter)
      .populate("campaignId", "title")
      .populate("userId", "name email")
      .sort({ createdAt: -1 });

    const filtered = q
      ? donations.filter((donation) => {
          const regex = new RegExp(q, "i");
          return (
            regex.test(donation.donorName || "") ||
            regex.test(donation.donorEmail || "") ||
            regex.test(donation.campaignId?.title || "") ||
            regex.test(donation.userId?.name || "")
          );
        })
      : donations;

    res.json(
      filtered.map((donation) => ({
        id: donation._id,
        donorName: donation.isAnonymous ? "Anonymous supporter" : donation.donorName,
        donorEmail: donation.donorEmail,
        amount: donation.amount,
        date: donation.date || donation.createdAt,
        campaignTitle: donation.campaignId?.title || "Campaign",
        userName: donation.userId?.name || "",
        donationType: donation.donationType,
        financialYear: donation.financialYear,
      }))
    );
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getSubscriptions = async (req, res) => {
  try {
    const subscriptions = await Subscription.find()
      .populate("userId", "name email")
      .populate("campaignId", "title")
      .sort({ createdAt: -1 });

    res.json(
      subscriptions.map((subscription) => ({
        id: subscription._id,
        userName: subscription.userId?.name || subscription.donorName,
        userEmail: subscription.userId?.email || subscription.donorEmail,
        campaignTitle: subscription.campaignId?.title || "Campaign",
        amount: subscription.amount,
        nextPaymentDate: subscription.nextPaymentDate,
        status: subscription.status,
        completedCycles: subscription.completedCycles,
        duration: subscription.duration,
      }))
    );
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.cancelSubscription = async (req, res) => {
  try {
    const subscription = await Subscription.findById(req.params.id).populate("campaignId", "title");
    if (!subscription) {
      return res.status(404).json({ message: "Subscription not found" });
    }

    subscription.status = "cancelled";
    subscription.cancelledAt = new Date();
    subscription.nextPaymentDate = null;
    await subscription.save();

    await logAction(
      req,
      "subscription.cancelled",
      "subscription",
      subscription._id,
      subscription.campaignId?.title || "Subscription",
      { amount: subscription.amount },
      "warning"
    );
    const ownedCampaign = subscription.campaignId?._id
      ? await Campaign.findById(subscription.campaignId._id).select("title ownerAdminId")
      : null;
    await notifyCampaignOwner(
      ownedCampaign,
      `Subscription cancelled for ${subscription.campaignId?.title || "campaign"}`,
      `
        <h2>Subscription cancelled</h2>
        <p>A recurring donation linked to <strong>${subscription.campaignId?.title || "your campaign"}</strong> was cancelled by SuperAdmin.</p>
        <p><strong>Amount:</strong> INR ${subscription.amount}</p>
      `,
      "subscription-cancel-notification"
    );
    await notifyOperation({
      actor: getActor(req),
      recipients: await getOperationalEmails(),
      subject: `Subscription cancelled: ${subscription.campaignId?.title || subscription._id}`,
      operationTitle: "Subscription cancelled",
      operationDetails: [
        `Campaign: <strong>${subscription.campaignId?.title || "Campaign"}</strong>`,
        `Amount: <strong>INR ${subscription.amount}</strong>`,
      ],
      contextLabel: "subscription-cancelled-ops",
    });

    res.json({ message: "Subscription cancelled successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getCertificates = async (req, res) => {
  try {
    const donations = await Donation.find({ "certificate.certificateId": { $exists: true, $ne: "" } })
      .populate("campaignId", "title")
      .sort({ createdAt: -1 });

    res.json(
      donations.map((donation) => ({
        id: donation._id,
        donorName: donation.donorName,
        amount: donation.amount,
        campaignTitle: donation.campaignId?.title || donation.certificate?.campaignTitle || "Campaign",
        certificateId: donation.certificate?.certificateId || "",
        fileUrl: donation.certificate?.fileUrl || "",
        verified: Boolean(donation.certificate?.verified),
        issuedOn: donation.certificate?.issuedOn || donation.createdAt,
      }))
    );
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.verifyCertificate = async (req, res) => {
  try {
    const donation = await Donation.findById(req.params.id);
    if (!donation || !donation.certificate?.certificateId) {
      return res.status(404).json({ message: "Certificate not found" });
    }

    donation.certificate.verified = true;
    donation.certificate.verifiedAt = new Date();
    donation.markModified("certificate");
    await donation.save();

    await logAction(req, "certificate.verified", "donation", donation._id, donation.certificate.certificateId);
    const campaign = await Campaign.findById(donation.campaignId).select("title ownerAdminId");
    await notifyCampaignOwner(
      campaign,
      `Certificate verified: ${donation.certificate.certificateId}`,
      `
        <h2>Donation certificate verified</h2>
        <p>The certificate <strong>${donation.certificate.certificateId}</strong> for campaign <strong>${campaign?.title || "Campaign"}</strong> was verified by SuperAdmin.</p>
      `,
      "certificate-verified-notification"
    );
    await notifyOperation({
      actor: getActor(req),
      recipients: await getOperationalEmails(),
      subject: `Certificate verified: ${donation.certificate.certificateId}`,
      operationTitle: "Donation certificate verified",
      operationDetails: [
        `Certificate ID: <strong>${donation.certificate.certificateId}</strong>`,
        `Campaign: <strong>${campaign?.title || "Campaign"}</strong>`,
      ],
      contextLabel: "certificate-verified-ops",
    });
    res.json({ message: "Certificate verified successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getAnalytics = async (req, res) => {
  try {
    const [campaigns, donations, users] = await Promise.all([
      Campaign.find(),
      Donation.find().sort({ createdAt: 1 }),
      User.find({ isDeleted: { $ne: true } }).sort({ createdAt: 1 }),
    ]);

    const monthlyDonations = donations.reduce((acc, donation) => {
      const key = new Date(donation.date || donation.createdAt).toLocaleString("en-IN", {
        month: "short",
        year: "numeric",
      });
      acc[key] = (acc[key] || 0) + (donation.amount || 0);
      return acc;
    }, {});

    const monthlyUsers = users.reduce((acc, user) => {
      const key = new Date(user.createdAt).toLocaleString("en-IN", {
        month: "short",
        year: "numeric",
      });
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    res.json({
      monthlyDonations: Object.entries(monthlyDonations).map(([month, amount]) => ({ month, amount })),
      userGrowth: Object.entries(monthlyUsers).map(([month, count]) => ({ month, count })),
      topCampaigns: campaigns
        .map((campaign) => ({
          id: campaign._id,
          title: campaign.title,
          raisedAmount: campaign.raisedAmount || 0,
          donorCount: campaign.donorCount || 0,
        }))
        .sort((a, b) => b.raisedAmount - a.raisedAmount)
        .slice(0, 8),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getSystemSettings = async (req, res) => {
  try {
    const settings = await ensureSystemSettings();
    res.json(settings);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.updateSystemSettings = async (req, res) => {
  try {
    const settings = await ensureSystemSettings();
    const { taxPercentage, platformFeePercentage, supportEmail, receiptPrefix, maintenanceMode, emailTemplates } = req.body;

    if (taxPercentage !== undefined) settings.taxPercentage = Number(taxPercentage);
    if (platformFeePercentage !== undefined) settings.platformFeePercentage = Number(platformFeePercentage);
    if (typeof supportEmail === "string") settings.supportEmail = supportEmail.trim();
    if (typeof receiptPrefix === "string") settings.receiptPrefix = receiptPrefix.trim();
    if (typeof maintenanceMode === "boolean") settings.maintenanceMode = maintenanceMode;
    if (emailTemplates && typeof emailTemplates === "object") {
      settings.emailTemplates = {
        ...settings.emailTemplates,
        ...emailTemplates,
      };
    }

    await settings.save();
    await logAction(req, "settings.system.updated", "system", settings._id, "platform");
    const superAdmins = await getOperationalEmails();
    await notifyAdminRecipients({
      recipients: superAdmins,
      subject: "System settings updated",
      html: `
        <h2>Platform settings changed</h2>
        <p>SuperAdmin updated the platform settings.</p>
        <p><strong>Tax percentage:</strong> ${settings.taxPercentage}%</p>
        <p><strong>Maintenance mode:</strong> ${settings.maintenanceMode ? "Enabled" : "Disabled"}</p>
      `,
      contextLabel: "system-settings-notification",
    });
    await notifyOperation({
      actor: getActor(req),
      recipients: superAdmins,
      subject: "System settings updated",
      operationTitle: "System settings updated",
      operationDetails: [
        `Tax percentage: <strong>${settings.taxPercentage}%</strong>`,
        `Maintenance mode: <strong>${settings.maintenanceMode ? "Enabled" : "Disabled"}</strong>`,
      ],
      contextLabel: "system-settings-ops",
    });
    res.json({ message: "System settings updated successfully", settings });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getSecurityLogs = async (req, res) => {
  try {
    const logs = await AuditLog.find().sort({ createdAt: -1 }).limit(50);
    const suspiciousActions = logs.filter((log) => ["warning", "critical"].includes(log.severity));

    res.json({
      logs: logs.map((log) => ({
        id: log._id,
        action: log.action,
        targetType: log.targetType,
        targetLabel: log.targetLabel,
        severity: log.severity,
        createdAt: log.createdAt,
      })),
      suspiciousActions: suspiciousActions.map((log) => ({
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

exports.updateProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user || user.isDeleted) {
      return res.status(404).json({ message: "User not found" });
    }

    const { name, email, mobile, profilePhoto } = req.body;

    if (typeof name === "string" && name.trim()) {
      user.name = name.trim();
    }

    if (typeof email === "string" && email.trim()) {
      const normalizedEmail = email.trim().toLowerCase();
      const existing = await User.findOne({ email: normalizedEmail, _id: { $ne: user._id } });
      if (existing) {
        return res.status(409).json({ message: "Email already in use" });
      }
      user.email = normalizedEmail;
    }

    if (typeof mobile === "string") {
      user.mobile = mobile.trim();
    }

    if (typeof profilePhoto === "string") {
      user.profilePhoto = profilePhoto.trim();
    }

    await user.save();
    await logAction(req, "profile.updated", "user", user._id, user.email);
    await notifyOperation({
      actor: getActor(req),
      recipients: await getOperationalEmails(),
      subject: `SuperAdmin profile updated: ${user.email}`,
      operationTitle: "SuperAdmin profile updated",
      operationDetails: [`Profile email: <strong>${user.email}</strong>`],
      contextLabel: "superadmin-profile-updated-ops",
    });
    res.json({ message: "Profile updated successfully", user: sanitizeUser(user) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.changePassword = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user || user.isDeleted) {
      return res.status(404).json({ message: "User not found" });
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
    await logAction(req, "profile.password.updated", "user", user._id, user.email, {}, "warning");
    await notifyOperation({
      actor: getActor(req),
      recipients: await getOperationalEmails(),
      subject: `SuperAdmin password changed: ${user.email}`,
      operationTitle: "SuperAdmin password changed",
      operationDetails: [`Account: <strong>${user.email}</strong>`],
      contextLabel: "superadmin-password-updated-ops",
    });
    res.json({ message: "Password updated successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
