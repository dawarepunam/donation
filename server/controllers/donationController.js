const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const Donation = require("../models/Donation");
const Campaign = require("../models/Campaign");
const ImpactEvent = require("../models/ImpactEvent");
const MarketingCampaign = require("../models/MarketingCampaign");
const User = require("../models/User");
const Subscription = require("../models/Subscription");
const { generateCertificate, uploadsDir } = require("../utils/certificate");
const { getAdminEmails, getOperationalEmails, getSuperAdminEmails, uniqueEmails } = require("../utils/admin");
const { notifyUsers, sendSafeEmail } = require("../utils/notifications");
const { getFinancialYear, estimateTaxSaving, calculateYearlyDonation, monthlyBreakdown } = require("../utils/tax");
const { instance, hasRazorpayCredentials, razorpayKeyId, verifySignature } = require("../utils/razorpay");
const {
  normalizeEmail,
  normalizeMobile,
  syncUserDonorRecords,
  buildDonorMatchers,
} = require("../utils/userDonorSync");
const { DELETION_GRACE_DAYS, getRemainingDeletionDays } = require("../utils/accountDeletion");

let archiver = null;
try {
  archiver = require("archiver");
} catch (error) {
  archiver = null;
}

const NGO_PAN = process.env.NGO_PAN || "AAATN1234A";
const NGO_80G = process.env.NGO_80G || "80G/NGO/2026/12345";
const NGO_NAME = process.env.NGO_NAME || "HopeSpring NGO";
const NGO_ADDRESS = process.env.NGO_ADDRESS || "Registered NGO office";
const NGO_EMAIL = process.env.NGO_EMAIL || "support@hopespring.org";
const NGO_PHONE = process.env.NGO_PHONE || "+91 00000 00000";
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5000";
const DASHBOARD_RECENT_LIMIT = 20;
const DONOR_EMAIL_HISTORY_LIMIT = 5;
const OTP_WINDOW_MINUTES = 15;

const getBadge = (total) => {
  if (total >= 25000) return "Gold";
  if (total >= 10000) return "Silver";
  return "Bronze";
};

const getProfileInitials = (name, isAnonymous = false) =>
  isAnonymous
    ? "AN"
    : String(name || "Supporter")
        .split(" ")
        .map((part) => part[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();

const formatShortDate = (value) =>
  new Date(value).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

const formatCurrency = (value = 0) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

const generateOneTimePassword = () => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const special = "!@#$%&*";
  let token = "";

  for (let index = 0; index < 9; index += 1) {
    token += alphabet[crypto.randomInt(0, alphabet.length)];
  }

  return `${token}${special[crypto.randomInt(0, special.length)]}9aA`;
};

const generateOtpCode = () => String(crypto.randomInt(100000, 1000000));

const getOtpExpiry = () => {
  const expiry = new Date();
  expiry.setMinutes(expiry.getMinutes() + OTP_WINDOW_MINUTES);
  return expiry;
};

const getSetupState = (user) => {
  const onboarding = user?.onboarding || {};
  const requiresOtp = Boolean(onboarding.isAutoCreated) && !onboarding.emailOtpVerifiedAt;
  const requiresPasswordReset = Boolean(onboarding.mustChangePassword);

  return {
    required: requiresOtp || requiresPasswordReset,
    isAutoCreated: Boolean(onboarding.isAutoCreated),
    requiresOtpVerification: requiresOtp,
    requiresPasswordReset,
    onboardingOrigin: onboarding.origin || "manual",
  };
};

const signDonationToken = (user) =>
  jwt.sign({ id: user._id, email: user.email, role: user.role }, process.env.JWT_SECRET || "secret", {
    expiresIn: "7d",
  });

const serializeDonationUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  mobile: user.mobile,
  profilePhoto: user.profilePhoto || "",
  role: user.role || "user",
  isActive: user.isActive !== false,
  permissions: Array.isArray(user.permissions) ? user.permissions : [],
  privacy: user.privacy || {
    anonymousDefault: false,
    showName: true,
  },
  notifications: user.notifications || {
    email: true,
    reminders: true,
  },
  lastLoginAt: user.lastLoginAt || null,
  setup: getSetupState(user),
});

const buildImpactMessage = (amount, campaign) => {
  const impactUnits = Math.max(1, Math.floor(amount / campaign.impactPerUnit));
  return {
    impactUnits,
    impactMessage: `Your INR ${amount} helped ${impactUnits} ${campaign.impactLabel}${impactUnits > 1 ? "s" : ""}.`,
  };
};

const buildReminderTimeline = ({ donations = [], subscriptions = [] }) => {
  const reminders = [];
  const now = new Date();
  const currentYear = now.getFullYear();
  const taxReminderDate = new Date(currentYear, 2, 31);
  if (taxReminderDate.getTime() < now.getTime()) {
    taxReminderDate.setFullYear(currentYear + 1);
  }

  const activeSubscriptions = subscriptions.filter((item) => item.status === "active");
  activeSubscriptions.forEach((subscription) => {
    if (subscription.nextPaymentDate) {
      reminders.push({
        type: "monthly-donation",
        title: "Next recurring donation",
        date: subscription.nextPaymentDate,
        message: `Your next donation for ${subscription.campaignId?.title || "the campaign"} is scheduled on ${formatShortDate(subscription.nextPaymentDate)}.`,
      });
    }
  });

  reminders.push({
    type: "tax-report",
    title: "Tax report season",
    date: taxReminderDate,
    message: `Your Section 80G tax report for FY ${getFinancialYear(now)} is ready to export any time.`,
  });

  if (donations[0]?.date) {
    const anniversary = new Date(donations[0].date);
    anniversary.setFullYear(now.getFullYear());
    reminders.push({
      type: "anniversary",
      title: "Giving anniversary",
      date: anniversary,
      message: `You donated around this time last year. Revisit the cause whenever you are ready.`,
    });
  }

  return reminders
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(0, 5);
};

const getAuthPayloadFromRequest = (req) => {
  if (req.user?.id) {
    return req.user;
  }

  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;

  if (!token) {
    return null;
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "secret");
    req.user = decoded;
    return decoded;
  } catch (error) {
    return null;
  }
};

const applyDonationFilters = (donations = [], filters = {}) =>
  donations.filter((donation) => {
    const date = new Date(donation.date);
    const matchesFinancialYear = filters.financialYear
      ? donation.financialYear === filters.financialYear
      : true;
    const matchesYear = filters.year ? date.getFullYear() === Number(filters.year) : true;
    const matchesMonth = filters.month ? date.getMonth() + 1 === Number(filters.month) : true;

    return matchesFinancialYear && matchesYear && matchesMonth;
  });

const buildDonationTimeline = (donations = []) => {
  const timeline = new Map();

  donations
    .slice()
    .reverse()
    .forEach((donation) => {
      const label = new Date(donation.date).toLocaleString("en-IN", {
        month: "short",
        year: "numeric",
      });

      const current = timeline.get(label) || {
        label,
        amount: 0,
        donationsCount: 0,
      };

      current.amount += donation.amount || 0;
      current.donationsCount += 1;
      timeline.set(label, current);
    });

  return Array.from(timeline.values()).reverse();
};

const buildCampaignSupportList = (donations = []) => {
  const campaigns = new Map();

  donations.forEach((donation) => {
    const campaignId = String(donation.campaignId?._id || donation.campaignId || "");
    const title = donation.campaignId?.title || "Campaign";
    const key = campaignId || title;
    const current = campaigns.get(key) || {
      campaignId,
      title,
      totalDonated: 0,
      donationsCount: 0,
      lastDonatedAt: donation.date,
    };

    current.totalDonated += donation.amount || 0;
    current.donationsCount += 1;
    if (!current.lastDonatedAt || new Date(donation.date) > new Date(current.lastDonatedAt)) {
      current.lastDonatedAt = donation.date;
    }

    campaigns.set(key, current);
  });

  return Array.from(campaigns.values()).sort((a, b) => {
    if (b.totalDonated !== a.totalDonated) {
      return b.totalDonated - a.totalDonated;
    }

    return new Date(b.lastDonatedAt) - new Date(a.lastDonatedAt);
  });
};

const buildMyImpact = ({ campaignsSupported = [], impactEvents = [] }) =>
  campaignsSupported
    .map((campaign) => {
      const relatedEvents = impactEvents
        .filter((eventDoc) => String(eventDoc.campaignId?._id || eventDoc.campaignId || "") === String(campaign.campaignId || ""))
        .sort((a, b) => new Date(b.eventDate || b.createdAt) - new Date(a.eventDate || a.createdAt));

      if (!relatedEvents.length) {
        return null;
      }

      const latestEvent = relatedEvents[0];
      const unitValue = latestEvent.impactNumber > 0 && latestEvent.fundUsed > 0
        ? latestEvent.fundUsed / latestEvent.impactNumber
        : 0;
      const estimatedUnits = unitValue > 0 ? Math.max(1, Math.round(campaign.totalDonated / unitValue)) : 0;

      return {
        campaignId: campaign.campaignId,
        campaignTitle: campaign.title,
        totalDonated: campaign.totalDonated,
        donationsCount: campaign.donationsCount,
        latestImpactTitle: latestEvent.title,
        latestImpactDate: latestEvent.eventDate || latestEvent.createdAt,
        latestImpactStory: latestEvent.storyTitle || latestEvent.storyDescription || latestEvent.description,
        latestImpactLocation: latestEvent.location || "",
        impactLabel: latestEvent.impactLabel || "people supported",
        impactNumber: latestEvent.impactNumber || 0,
        estimatedPersonalImpact: estimatedUnits,
        message:
          estimatedUnits > 0
            ? `Your donation helped ${estimatedUnits} ${latestEvent.impactLabel || "people"}`
            : `Your donation was used in ${campaign.title}`,
        photos: [...(latestEvent.afterPhotos || []), ...(latestEvent.photos || [])].slice(0, 3),
        reportLink: latestEvent._id ? `/campaign.html?id=${campaign.campaignId}` : "",
      };
    })
    .filter(Boolean);

const buildUserMarketingMessage = ({ campaignDoc, recipient, user }) => {
  const safeName = user?.privacy?.showName === false ? "Supporter" : user?.name || "Supporter";
  const campaignTitle = campaignDoc.targetCampaignId?.title || "HopeSpring campaign";
  const template = recipient.variant === "B" && campaignDoc.messageB ? campaignDoc.messageB : campaignDoc.messageA;
  const messageText = String(recipient.messagePreview || template || "")
    .replaceAll("{name}", safeName)
    .replaceAll("{campaignTitle}", campaignTitle)
    .replaceAll("{ctaLink}", recipient.shareLink || "")
    .replaceAll("{impact}", recipient.donationRange ? `Your current giving range is ${recipient.donationRange}.` : "Your support keeps this mission moving.");

  return {
    id: `${campaignDoc._id}-${recipient._id}`,
    campaignId: campaignDoc.targetCampaignId?._id || campaignDoc.targetCampaignId || null,
    campaignTitle,
    marketingTitle: campaignDoc.title,
    channel: campaignDoc.channel,
    status: recipient.status,
    subject: recipient.subjectPreview || campaignDoc.subject || campaignTitle,
    message: messageText,
    sentAt: recipient.sentAt || campaignDoc.lastProcessedAt || campaignDoc.updatedAt || campaignDoc.createdAt,
    clickedAt: recipient.clickedAt || null,
    clickCount: recipient.clickCount || 0,
    shareLink: recipient.shareLink || "",
    variant: recipient.variant || "A",
  };
};

const buildApprovedImpactEventsForUser = ({ impactEvents = [], campaignsSupported = [] }) => {
  const campaignLookup = new Map(campaignsSupported.map((campaign) => [String(campaign.campaignId || ""), campaign]));

  return impactEvents.map((eventDoc) => {
    const campaignId = String(eventDoc.campaignId?._id || eventDoc.campaignId || "");
    const support = campaignLookup.get(campaignId);

    return {
      id: eventDoc._id,
      campaignId,
      campaignTitle: eventDoc.campaignId?.title || support?.title || "Campaign",
      title: eventDoc.title,
      description: eventDoc.description || "",
      eventDate: eventDoc.eventDate || eventDoc.createdAt,
      location: eventDoc.location || "",
      impactNumber: eventDoc.impactNumber || 0,
      impactLabel: eventDoc.impactLabel || "people supported",
      fundUsed: eventDoc.fundUsed || 0,
      progressPercent: eventDoc.progressPercent || 0,
      isLiveUpdate: Boolean(eventDoc.isLiveUpdate),
      liveLabel: eventDoc.liveLabel || "",
      storyTitle: eventDoc.storyTitle || "",
      storyDescription: eventDoc.storyDescription || "",
      shareMessage: eventDoc.shareMessage || "",
      mapLink: eventDoc.mapLink || "",
      metrics: eventDoc.metrics || [],
      photos: [...(eventDoc.afterPhotos || []), ...(eventDoc.photos || []), ...(eventDoc.beforePhotos || [])].slice(0, 4),
      donorContribution: support?.totalDonated || 0,
      donorDonationCount: support?.donationsCount || 0,
    };
  });
};

const buildInstallmentPlan = ({ amount, duration, donationDate, donationId, paymentId }) => {
  return Array.from({ length: duration }, (_, index) => {
    const scheduledFor = new Date(donationDate);
    scheduledFor.setMonth(scheduledFor.getMonth() + index);

    return {
      cycleNumber: index + 1,
      amount,
      scheduledFor,
      paidAt: index === 0 ? donationDate : null,
      status: index === 0 ? "paid" : "scheduled",
      donationId: index === 0 ? donationId : null,
      paymentId: index === 0 ? paymentId : "",
    };
  });
};

const buildDonationHistoryEmailMarkup = (donations = []) => {
  if (!donations.length) {
    return "<p>No previous donation history found yet.</p>";
  }

  const rows = donations
    .map(
      (item) => `
        <tr>
          <td style="padding:8px;border:1px solid #d7d7d7;">${formatShortDate(item.date)}</td>
          <td style="padding:8px;border:1px solid #d7d7d7;">${item.campaignId?.title || item.certificate?.campaignTitle || "Campaign"}</td>
          <td style="padding:8px;border:1px solid #d7d7d7;">${formatCurrency(item.amount)}</td>
          <td style="padding:8px;border:1px solid #d7d7d7;">${item.payment?.paymentId || "-"}</td>
        </tr>
      `
    )
    .join("");

  return `
    <table style="border-collapse:collapse;width:100%;margin-top:12px;">
      <thead>
        <tr>
          <th style="padding:8px;border:1px solid #d7d7d7;text-align:left;">Date</th>
          <th style="padding:8px;border:1px solid #d7d7d7;text-align:left;">Campaign</th>
          <th style="padding:8px;border:1px solid #d7d7d7;text-align:left;">Amount</th>
          <th style="padding:8px;border:1px solid #d7d7d7;text-align:left;">Payment ID</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
};

const sendDonationEmails = async ({
  donation,
  campaign,
  certificate,
  donorName,
  recipientEmail,
  recipientEmails = [],
  impactMessage,
  taxSavingEstimate,
  donationHistory,
  totalDonated,
  user,
}) => {
  // Use every known donor email source so the receipt reaches the donor even if one source is missing.
  const safeRecipientEmails = [...new Set(
    [recipientEmail, ...recipientEmails, user?.email, donation.donorEmail]
      .map((value) => normalizeEmail(value))
      .filter(Boolean)
  )];
  const safeRecipientEmail = safeRecipientEmails[0] || "";
  const ownerAdmin = campaign?.ownerAdminId
    ? await User.findById(campaign.ownerAdminId).select("email isDeleted isActive")
    : null;
  const dbAdminRecipients = await getAdminEmails();
  const dbSuperAdminRecipients = await getSuperAdminEmails();
  const adminRecipients = uniqueEmails([
    ...dbAdminRecipients,
    ...dbSuperAdminRecipients,
    ownerAdmin?.isDeleted || ownerAdmin?.isActive === false ? "" : ownerAdmin?.email,
    process.env.SUPERADMIN_EMAIL || "",
  ]);
  const historyMarkup = buildDonationHistoryEmailMarkup(donationHistory);
  const recurringText =
    donation.donationType === "monthly" && donation.recurring?.totalCycles
      ? `${donation.recurring.totalCycles} month plan`
      : "One-time donation";

  if (safeRecipientEmails.length) {
    await sendSafeEmail(
      {
        to: safeRecipientEmails.join(","),
        subject: "Donation receipt, certificate and payment summary",
        html: `
          <h2>Thank you for your donation</h2>
          <p>Hi ${donorName},</p>
          <p>Your payment for <strong>${campaign.title}</strong> has been received successfully.</p>
          <p><strong>Amount:</strong> ${formatCurrency(donation.amount)}</p>
          <p><strong>Payment date:</strong> ${formatShortDate(donation.date)}</p>
          <p><strong>Payment ID:</strong> ${donation.payment?.paymentId || "-"}</p>
          <p><strong>Donation type:</strong> ${recurringText}</p>
          <p><strong>Impact:</strong> ${impactMessage}</p>
          <p><strong>Estimated 80G tax benefit:</strong> ${formatCurrency(taxSavingEstimate)}</p>
          <p><strong>Certificate ID:</strong> ${certificate.certificateId}</p>
          <p><strong>Total donated from this account:</strong> ${formatCurrency(totalDonated)}</p>
          <p><strong>Registered email:</strong> ${safeRecipientEmails.join(", ")}</p>
          <h3>Your recent donation history</h3>
          ${historyMarkup}
          <p style="margin-top:16px;">Your 80G certificate is attached with this email.</p>
          <p>You can also verify/download it later from your dashboard.</p>
        `,
        attachments: [
          {
            filename: certificate.fileName,
            path: certificate.filePath,
          },
        ],
      },
      "donor"
    );
  }

  if (adminRecipients.length) {
    console.log("Donation notification DB admins:", dbAdminRecipients.join(", ") || "(none)");
    console.log("Donation notification DB superadmins:", dbSuperAdminRecipients.join(", ") || "(none)");
    console.log("Donation notification recipients:", adminRecipients.join(", "));
    await notifyUsers({
      recipients: adminRecipients,
      subject: `New donation received for ${campaign.title}`,
      html: `
        <h2>New donation alert</h2>
        <p>A verified payment has been completed on the platform.</p>
        <p><strong>Campaign:</strong> ${campaign.title}</p>
        <p><strong>Donor name:</strong> ${donation.isAnonymous ? "Anonymous supporter" : donorName}</p>
        <p><strong>Registered user email:</strong> ${safeRecipientEmail || user?.email || donation.donorEmail || "-"}</p>
        <p><strong>Mobile:</strong> ${user?.mobile || donation.donorMobile || "-"}</p>
        <p><strong>Amount:</strong> ${formatCurrency(donation.amount)}</p>
        <p><strong>Donation type:</strong> ${recurringText}</p>
        <p><strong>Payment date:</strong> ${formatShortDate(donation.date)}</p>
        <p><strong>Payment ID:</strong> ${donation.payment?.paymentId || "-"}</p>
        <p><strong>Order ID:</strong> ${donation.payment?.orderId || "-"}</p>
        <p><strong>Certificate ID:</strong> ${certificate.certificateId}</p>
        <p><strong>Donor total contribution:</strong> ${formatCurrency(totalDonated)}</p>
        <p><strong>Campaign total raised:</strong> ${formatCurrency(campaign.raisedAmount)}</p>
        <p><strong>Campaign donors:</strong> ${campaign.donorCount}</p>
      `,
      contextLabel: "donation-admin-alert",
    });
  }
};

const buildDonationEmailContext = async ({ user, email, mobile, fallbackDonation }) => {
  const donorScope = buildDonorScope({
    userId: user?._id || null,
    email,
    mobile,
  });

  if (!donorScope) {
    return {
      donationHistory: fallbackDonation ? [fallbackDonation] : [],
      totalDonated: fallbackDonation?.amount || 0,
    };
  }

  const donationHistory = await Donation.find(donorScope)
    .populate("campaignId", "title")
    .sort({ date: -1, createdAt: -1 })
    .limit(DONOR_EMAIL_HISTORY_LIMIT);
  const aggregateResult = await Donation.aggregate([
    { $match: donorScope },
    { $group: { _id: null, totalAmount: { $sum: "$amount" } } },
  ]);

  return {
    donationHistory,
    totalDonated: aggregateResult[0]?.totalAmount || fallbackDonation?.amount || 0,
  };
};

const resolveCampaignNgoDetails = (campaign = {}) => ({
  ngoName: campaign.ngoDetails?.name || campaign.title || NGO_NAME,
  pan: campaign.ngoDetails?.pan || NGO_PAN,
  eightyGNumber: campaign.ngoDetails?.eightyGNumber || NGO_80G,
  ngoAddress: campaign.ngoDetails?.address || campaign.location || NGO_ADDRESS,
  ngoEmail: campaign.ngoDetails?.email || NGO_EMAIL,
  ngoPhone: campaign.ngoDetails?.phone || NGO_PHONE,
});

const createCertificateForDonation = ({
  donorName,
  amount,
  donationDate,
  campaignTitle,
  ngoDetails,
  certificateId,
}) =>
  generateCertificate({
    donorName,
    amount,
    donationDate,
    campaignTitle,
    ngoName: ngoDetails.ngoName,
    pan: ngoDetails.pan,
    eightyGNumber: ngoDetails.eightyGNumber,
    ngoAddress: ngoDetails.ngoAddress,
    ngoEmail: ngoDetails.ngoEmail,
    ngoPhone: ngoDetails.ngoPhone,
    certificateId,
  });

const processDueSubscriptions = async (subscriptionQuery = {}) => {
  const subscriptions = await Subscription.find({
    status: "active",
    ...subscriptionQuery,
  }).populate("campaignId");

  const createdDonations = [];

  for (const subscription of subscriptions) {
    const campaign = subscription.campaignId;
    if (!campaign) continue;

    let changed = false;
    let dueEntry = subscription.history.find(
      (entry) =>
        entry.status === "scheduled" &&
        entry.scheduledFor &&
        new Date(entry.scheduledFor).getTime() <= Date.now()
    );

    while (dueEntry) {
      const paidAt = new Date(dueEntry.scheduledFor);
      const financialYear = getFinancialYear(paidAt);
      const { impactUnits, impactMessage } = buildImpactMessage(subscription.amount, campaign);
      const ngoDetails = resolveCampaignNgoDetails(campaign);
      const certificate = createCertificateForDonation({
        donorName: subscription.donorName,
        amount: subscription.amount,
        donationDate: paidAt,
        campaignTitle: campaign.title,
        ngoDetails,
      });

      const donation = await Donation.create({
        userId: subscription.userId || null,
        donorName: subscription.donorName,
        donorEmail: subscription.donorEmail,
        donorMobile: subscription.donorMobile || "",
        amount: subscription.amount,
        donationType: "monthly",
        isAnonymous: false,
        taxSavingEstimate: estimateTaxSaving(subscription.amount),
        campaignId: campaign._id,
        date: paidAt,
        timestamp: paidAt.getTime(),
        financialYear,
        impactUnits,
        impactMessage,
        recurring: {
          subscriptionId: subscription._id,
          cycleNumber: dueEntry.cycleNumber,
          totalCycles: subscription.duration,
        },
        payment: {
          orderId: `sub_order_${subscription._id}_${dueEntry.cycleNumber}`,
          paymentId: `sub_auto_${subscription._id}_${dueEntry.cycleNumber}`,
          signature: "auto_recurring",
          status: "paid",
          provider: "subscription-scheduler",
        },
        certificate: {
          certificateId: certificate.certificateId,
          fileUrl: certificate.fileUrl,
          fileName: certificate.fileName,
          donorName: certificate.donorName,
          campaignTitle: certificate.campaignTitle,
          amount: certificate.amount,
          issuedOn: certificate.issuedOn,
          ngoName: certificate.ngoName,
          pan: certificate.pan,
          eightyGNumber: certificate.eightyGNumber,
          ngoAddress: certificate.ngoAddress,
          ngoEmail: certificate.ngoEmail,
          ngoPhone: certificate.ngoPhone,
          eligible80G: true,
        },
      });

      dueEntry.status = "paid";
      dueEntry.paidAt = paidAt;
      dueEntry.donationId = donation._id;
      dueEntry.paymentId = donation.payment.paymentId;

      subscription.completedCycles += 1;
      changed = true;
      createdDonations.push(donation);

      campaign.raisedAmount += subscription.amount;
      campaign.donorCount += 1;
      if (campaign.raisedAmount >= campaign.goalAmount) {
        campaign.status = "completed";
      }
      await campaign.save();

      if (subscription.userId) {
        await User.findByIdAndUpdate(subscription.userId, {
          $inc: { totalDonated: subscription.amount },
          $set: { lastDonationAt: paidAt },
        });
      }

      const subscriptionUser = subscription.userId ? await User.findById(subscription.userId) : null;
      const recipientEmail = subscriptionUser?.email || subscription.donorEmail;
      const { donationHistory, totalDonated } = await buildDonationEmailContext({
        user: subscriptionUser,
        email: recipientEmail,
        mobile: subscriptionUser?.mobile || subscription.donorMobile,
        fallbackDonation: donation,
      });

      // Send the same summary/certificate flow for scheduler-created recurring payments.
      await sendDonationEmails({
        donation,
        campaign,
        certificate,
        donorName: subscription.donorName,
        recipientEmail,
        recipientEmails: [subscription.donorEmail],
        impactMessage,
        taxSavingEstimate: donation.taxSavingEstimate,
        donationHistory,
        totalDonated,
        user: subscriptionUser,
      });

      if (subscription.completedCycles >= subscription.duration) {
        subscription.status = "completed";
        subscription.nextPaymentDate = null;
      } else {
        const nextScheduled = subscription.history.find((entry) => entry.status === "scheduled");
        subscription.nextPaymentDate = nextScheduled?.scheduledFor || null;
      }

      dueEntry = subscription.history.find(
        (entry) =>
          entry.status === "scheduled" &&
          entry.scheduledFor &&
          new Date(entry.scheduledFor).getTime() <= Date.now()
      );
    }

    if (changed) {
      await subscription.save();
    }
  }

  return createdDonations;
};

const parseUserFromToken = async (req) => {
  const authPayload = getAuthPayloadFromRequest(req);
  if (!authPayload?.id) return null;
  return User.findById(authPayload.id);
};

const resolveDonationUser = async (req, email, mobile) => {
  const tokenUser = await parseUserFromToken(req);
  if (tokenUser) {
    return tokenUser;
  }

  const normalizedEmail = normalizeEmail(email);
  if (normalizedEmail) {
    const userByEmail = await User.findOne({ email: normalizedEmail });
    if (userByEmail) {
      return userByEmail;
    }
  }

  const normalizedMobile = normalizeMobile(mobile);
  if (normalizedMobile) {
    return User.findOne({ mobile: normalizedMobile });
  }

  return null;
};

const createAutoAccountForDonation = async ({ name, email, mobile, donationAmount, campaignTitle }) => {
  const plainPassword = generateOneTimePassword();
  const plainOtp = generateOtpCode();
  const hashedPassword = await bcrypt.hash(plainPassword, 10);
  const hashedOtp = await bcrypt.hash(plainOtp, 10);

  const user = await User.create({
    name: String(name || "Supporter").trim() || "Supporter",
    email: normalizeEmail(email),
    mobile: normalizeMobile(mobile),
    password: hashedPassword,
    role: "user",
    onboarding: {
      origin: "guest-donation",
      isAutoCreated: true,
      mustChangePassword: true,
      emailOtpHash: hashedOtp,
      emailOtpExpiresAt: getOtpExpiry(),
      emailOtpLastSentAt: new Date(),
      emailOtpVerifiedAt: null,
    },
  });

  await notifyUsers({
    recipients: [user.email],
    subject: "Your HopeSpring donor account has been created",
    html: `
      <h2>Donation received successfully</h2>
      <p>We created your donor account automatically after your donation so you can access certificates, subscriptions, and tax reports later.</p>
      <p><strong>Campaign:</strong> ${campaignTitle}</p>
      <p><strong>Donation amount:</strong> ${formatCurrency(donationAmount)}</p>
      <p><strong>Login email:</strong> ${user.email}</p>
      <p><strong>Temporary password:</strong> ${plainPassword}</p>
      <p><strong>Email OTP:</strong> ${plainOtp}</p>
      <p>Login with the temporary password, then verify the OTP and create a new password before entering your dashboard.</p>
    `,
    contextLabel: "guest-donation-auto-account-user",
  });

  return {
    user,
    plainPassword,
  };
};

const buildDonorScope = ({ userId, email, mobile }) => {
  const conditions = [];
  if (userId) {
    conditions.push({ userId });
  }

  const { donationOrClauses } = buildDonorMatchers({ email, mobile });
  if (donationOrClauses.length) {
    conditions.push(...donationOrClauses);
  }

  if (!conditions.length) {
    return null;
  }

  return conditions.length === 1 ? conditions[0] : { $or: conditions };
};

exports.createOrder = async (req, res) => {
  try {
    const { amount, campaignId } = req.body;
    const campaign = await Campaign.findById(campaignId);

    if (!campaign) {
      return res.status(404).json({ message: "Campaign not found" });
    }

    const normalizedAmount = Number(amount);
    if (!normalizedAmount || normalizedAmount < 1) {
      return res.status(400).json({ message: "Valid amount is required" });
    }

    if (!instance) {
      return res.json({
        mode: "development",
        key: razorpayKeyId || "rzp_test_demo",
        order: {
          id: `order_dev_${Date.now()}`,
          amount: normalizedAmount * 100,
          currency: "INR",
        },
      });
    }

    const order = await instance.orders.create({
      amount: normalizedAmount * 100,
      currency: "INR",
      receipt: `receipt_${Date.now()}`,
      notes: {
        campaignId: String(campaignId),
      },
    });

    res.json({
      mode: "live",
      key: razorpayKeyId,
      order,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.verifyPayment = async (req, res) => {
  try {
    const {
      razorpayPaymentId,
      razorpayOrderId,
      razorpaySignature,
      amount,
      campaignId,
      name,
      email,
      mobile,
      donationType,
      isAnonymous,
      durationMonths,
      receiveUpdates,
    } = req.body;

    const campaign = await Campaign.findById(campaignId);
    if (!campaign) {
      return res.status(404).json({ message: "Campaign not found" });
    }

    const isVerified = verifySignature({
      orderId: razorpayOrderId,
      paymentId: razorpayPaymentId,
      signature: razorpaySignature,
    });

    if (!isVerified) {
      return res.status(400).json({ message: "Payment verification failed" });
    }

    const numericAmount = Number(amount);
    if (!numericAmount || numericAmount < 1) {
      return res.status(400).json({ message: "Valid amount is required" });
    }

    const normalizedEmail = normalizeEmail(email);
    const normalizedMobile = normalizeMobile(mobile);
    const nameFromForm = String(name || "").trim();
    if (!nameFromForm || !normalizedEmail || !normalizedMobile) {
      return res.status(400).json({ message: "Name, email, and mobile are required" });
    }

    let user = await resolveDonationUser(req, normalizedEmail, normalizedMobile);
    let autoAccountMeta = null;

    if (user && (user.isDeleted || user.isActive === false)) {
      return res.status(403).json({ message: "This donor account is not available for new donations" });
    }

    if (!user) {
      autoAccountMeta = await createAutoAccountForDonation({
        name: nameFromForm,
        email: normalizedEmail,
        mobile: normalizedMobile,
        donationAmount: numericAmount,
        campaignTitle: campaign.title,
      });
      user = autoAccountMeta.user;
    }

    const { impactUnits, impactMessage } = buildImpactMessage(numericAmount, campaign);
    const donationDate = new Date();
    const financialYear = getFinancialYear(donationDate);
    const taxSavingEstimate = estimateTaxSaving(numericAmount);
    const donorName = user?.name || nameFromForm;
    const recipientEmail = user?.email || normalizedEmail;
    const ngoDetails = resolveCampaignNgoDetails(campaign);

    // Save the exact rendered certificate details so every donor has a stable certificate record.
    const certificate = createCertificateForDonation({
      donorName,
      amount: numericAmount,
      donationDate,
      campaignTitle: campaign.title,
      ngoDetails,
    });

    const donation = await Donation.create({
      userId: user._id,
      donorName,
      donorEmail: normalizedEmail,
      donorMobile: normalizedMobile,
      amount: numericAmount,
      donationType: donationType || "one-time",
      isAnonymous: Boolean(isAnonymous),
      taxSavingEstimate,
      campaignId,
      date: donationDate,
      timestamp: donationDate.getTime(),
      financialYear,
      impactUnits,
      impactMessage,
      recurring: null,
      payment: {
        orderId: razorpayOrderId,
        paymentId: razorpayPaymentId,
        signature: razorpaySignature,
        status: "paid",
      },
      certificate: {
        certificateId: certificate.certificateId,
        fileUrl: certificate.fileUrl,
        fileName: certificate.fileName,
        donorName: certificate.donorName,
        campaignTitle: certificate.campaignTitle,
        amount: certificate.amount,
        issuedOn: certificate.issuedOn,
        ngoName: certificate.ngoName,
        pan: certificate.pan,
        eightyGNumber: certificate.eightyGNumber,
        ngoAddress: certificate.ngoAddress,
        ngoEmail: certificate.ngoEmail,
        ngoPhone: certificate.ngoPhone,
        eligible80G: true,
      },
    });

    campaign.raisedAmount += numericAmount;
    campaign.donorCount += 1;
    if (campaign.raisedAmount >= campaign.goalAmount) {
      campaign.status = "completed";
    }
    await campaign.save();

    if (user) {
      user.totalDonated += numericAmount;
      user.lastDonationAt = donationDate;
      if (autoAccountMeta) {
        user.lastLoginAt = donationDate;
      }
      if (!user.mobile && normalizedMobile) {
        user.mobile = normalizedMobile;
      }
      if (!user.name && nameFromForm) {
        user.name = nameFromForm;
      }
      if (Boolean(receiveUpdates)) {
        user.marketingConsent = {
          receiveUpdates: true,
          email: true,
          whatsapp: Boolean(user.marketingConsent?.whatsapp),
          consentAt: donationDate,
          source: "donation",
        };
      }
      await user.save();
      await syncUserDonorRecords(user);
    }

    if ((donationType || "one-time") === "monthly") {
      const duration = Math.max(2, Number(durationMonths || 12));
      const nextPaymentDate = new Date(donationDate);
      nextPaymentDate.setMonth(nextPaymentDate.getMonth() + 1);
      const endDate = new Date(donationDate);
      endDate.setMonth(endDate.getMonth() + Math.max(duration - 1, 0));

      const subscription = await Subscription.create({
        userId: user._id,
        donorName,
        donorEmail: normalizedEmail,
        donorMobile: normalizedMobile,
        campaignId,
        amount: numericAmount,
        duration,
        completedCycles: 1,
        endDate,
        nextPaymentDate,
        history: buildInstallmentPlan({
          amount: numericAmount,
          duration,
          donationDate,
          donationId: donation._id,
          paymentId: razorpayPaymentId,
        }),
      });

      donation.recurring = {
        subscriptionId: subscription._id,
        cycleNumber: 1,
        totalCycles: duration,
      };
      await donation.save();
    }

    // Build the donor's latest giving summary from saved records so the email always reflects actual history.
    const { donationHistory, totalDonated: donorTotalFromHistory } = await buildDonationEmailContext({
      user,
      email: recipientEmail,
      mobile: normalizedMobile,
      fallbackDonation: donation,
    });

    await sendDonationEmails({
      donation,
      campaign,
      certificate,
      donorName,
      recipientEmail,
      recipientEmails: [normalizedEmail, donation.donorEmail],
      impactMessage,
      taxSavingEstimate,
      donationHistory,
      totalDonated: donorTotalFromHistory,
      user,
    });

    const io = req.app.get("io");
    const liveDonation = {
      id: donation._id,
      donorName: donation.isAnonymous ? "Anonymous supporter" : donorName,
      amount: numericAmount,
      campaignId,
      createdAt: donation.createdAt,
      campaignTitle: campaign.title,
      profilePhoto: donation.isAnonymous ? "" : user?.profilePhoto || "",
      profileInitials: getProfileInitials(donorName, donation.isAnonymous),
    };

    io.emit("donation:new", liveDonation);
    io.emit("campaign:updated", {
      campaignId: String(campaign._id),
      raisedAmount: campaign.raisedAmount,
      donorCount: campaign.donorCount,
      status: campaign.status,
    });

    res.json({
      success: true,
      donationId: donation._id,
      amount: numericAmount,
      impactUnits,
      impactMessage,
      campaignCompleted: campaign.status === "completed",
      account: {
        autoCreated: Boolean(autoAccountMeta),
        exists: true,
        email: user.email,
        generatedPassword: autoAccountMeta?.plainPassword || "",
        popupMessage: autoAccountMeta
          ? `Account generated successfully for ${user.email}. Temporary password: ${autoAccountMeta.plainPassword}`
          : "",
        setupRequired: getSetupState(user).required,
        onboardingOrigin: getSetupState(user).onboardingOrigin,
      },
      auth: autoAccountMeta
        ? {
            autoLoggedIn: true,
            token: signDonationToken(user),
            user: serializeDonationUser(user),
          }
        : null,
      certificate: donation.certificate,
      taxSavingEstimate,
      receiptSummary: {
        donorName: donation.isAnonymous ? "Anonymous supporter" : donorName,
        donatedAt: donationDate,
        financialYear,
        campaignTitle: campaign.title,
      },
      campaignSnapshot: {
        raisedAmount: campaign.raisedAmount,
        goalAmount: campaign.goalAmount,
        donorCount: campaign.donorCount,
        status: campaign.status,
      },
      subscription:
        donation.recurring?.subscriptionId
          ? {
              duration: donation.recurring.totalCycles,
              nextPaymentDate:
                (await Subscription.findById(donation.recurring.subscriptionId))?.nextPaymentDate || null,
            }
          : null,
      shareMessage: `I just donated INR ${numericAmount} to support ${campaign.title}. Join me: ${CLIENT_URL}/campaign.html?id=${campaign._id}`,
      providerMode: hasRazorpayCredentials ? "live" : "development",
      nextStepMessage: autoAccountMeta
        ? "Your donation is complete and a donor account has been created automatically. Check your email for the temporary password and OTP."
        : "Your donation is complete. You can log in to view it on your dashboard any time.",
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getUserDonations = async (req, res) => {
  try {
    const user = await parseUserFromToken(req);
    if (user) {
      await syncUserDonorRecords(user);
    }

    const donorScope = buildDonorScope({
      userId: req.user?.id || user?._id,
      email: user?.email || req.query.email,
      mobile: user?.mobile || req.query.mobile,
    });

    if (!donorScope) {
      return res.status(400).json({ message: "User context required" });
    }

    await processDueSubscriptions(donorScope);

    const donations = await Donation.find(donorScope)
      .populate("campaignId", "title")
      .sort({ date: -1 })
      .lean();

    const filteredDonations = applyDonationFilters(donations, req.query);
    const totalDonated = donations.reduce((sum, donation) => sum + donation.amount, 0);
    const lastDonation = donations[0] || null;
    const timeline = buildDonationTimeline(filteredDonations);
    const yearly = calculateYearlyDonation(filteredDonations);
    const monthly = monthlyBreakdown(filteredDonations);
    const totalImpactUnits = donations.reduce((sum, donation) => sum + (donation.impactUnits || 0), 0);
    const recurringTotal = donations
      .filter((donation) => donation.donationType === "monthly")
      .reduce((sum, donation) => sum + donation.amount, 0);

    const subscriptions = await Subscription.find(
      donorScope
    )
      .populate("campaignId", "title coverImage status")
      .sort({ createdAt: -1 })
      .lean();

    const campaignsSupported = buildCampaignSupportList(donations);
    const supportedCampaignIds = campaignsSupported.map((item) => item.campaignId).filter(Boolean);
    const impactEvents = supportedCampaignIds.length
      ? await ImpactEvent.find({
          campaignId: { $in: supportedCampaignIds },
          status: "approved",
        })
          .populate("campaignId", "title")
          .sort({ eventDate: -1, createdAt: -1 })
          .lean()
      : [];
    const marketingMessages = user?._id
      ? await MarketingCampaign.find({ "recipients.userId": user._id })
          .populate("targetCampaignId", "title")
          .sort({ updatedAt: -1, createdAt: -1 })
          .lean()
      : [];
    const availableFinancialYears = [...new Set(donations.map((item) => item.financialYear).filter(Boolean))].sort().reverse();
    const eventUpdates = buildApprovedImpactEventsForUser({
      impactEvents,
      campaignsSupported,
    });
    const userMarketingMessages = marketingMessages
      .map((campaignDoc) => {
        const recipient = (campaignDoc.recipients || []).find(
          (item) => String(item.userId || "") === String(user?._id || "")
        );
        if (!recipient) return null;
        return buildUserMarketingMessage({ campaignDoc, recipient, user });
      })
      .filter(Boolean)
      .sort((a, b) => new Date(b.sentAt || 0) - new Date(a.sentAt || 0));

    res.json({
      profile: {
        name: user?.name || donations[0]?.donorName || "Supporter",
        email: user?.email || donations[0]?.donorEmail || "",
        mobile: user?.mobile || donations[0]?.donorMobile || "",
        profilePhoto: user?.profilePhoto || "",
        totalCampaignsSupported: campaignsSupported.length,
        privacy: user?.privacy || {
          anonymousDefault: false,
          showName: true,
        },
        notifications: user?.notifications || {
          email: true,
          reminders: true,
        },
        lastLoginAt: user?.lastLoginAt || null,
        accountDeletion: {
          status: user?.accountStatus || (user?.isDeleted ? "deleted" : "active"),
          isScheduled: user?.accountStatus === "scheduled",
          deleteRequestedAt: user?.deleteRequestedAt || null,
          deleteAfter: user?.deleteAfter || null,
          remainingDays: getRemainingDeletionDays(user?.deleteAfter),
          graceDays: DELETION_GRACE_DAYS,
        },
      },
      summary: {
        totalDonated,
        lastDonation,
        badge: getBadge(totalDonated),
        totalDonations: donations.length,
        totalImpactUnits,
        recurringTotal,
        activeSubscriptions: subscriptions.filter((item) => item.status === "active").length,
      },
      filters: {
        availableFinancialYears,
      },
      donations: filteredDonations,
      recentActivity: donations.slice(0, DASHBOARD_RECENT_LIMIT).map((donation) => ({
        id: donation._id,
        campaignTitle: donation.campaignId?.title || "Campaign",
        amount: donation.amount,
        paymentId: donation.payment?.paymentId || "-",
        paymentStatus: donation.payment?.status || "paid",
        donationType: donation.donationType,
        cycleNumber: donation.recurring?.cycleNumber || null,
        date: donation.date,
      })),
      timeline,
      tax: {
        yearly,
        monthly,
      },
      subscriptions,
      myImpact: buildMyImpact({
        campaignsSupported,
        impactEvents,
      }),
      reminders: buildReminderTimeline({
        donations,
        subscriptions,
      }),
      campaignsSupported,
      eventUpdates,
      marketingMessages: userMarketingMessages,
      receipts: donations.map((item) => ({
        donationId: item._id,
        amount: item.amount,
        date: item.date,
        financialYear: item.financialYear,
        campaignTitle: item.campaignId?.title || "Campaign",
        paymentId: item.payment?.paymentId || "",
        certificateId: item.certificate?.certificateId || "",
      })),
      certificates: donations
        .filter((item) => item.certificate?.certificateId)
        .map((item) => ({
          donationId: item._id,
          amount: item.amount,
          date: item.date,
          campaignTitle: item.campaignId?.title || "Campaign",
          ...item.certificate,
        })),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getTaxReport = async (req, res) => {
  try {
    const user = await parseUserFromToken(req);
    if (user) {
      await syncUserDonorRecords(user);
    }
    const query = buildDonorScope({
      userId: req.user?.id,
      email: user?.email || req.query.email,
      mobile: user?.mobile,
    });

    if (!query) {
      return res.status(400).json({ message: "User context required" });
    }

    const donations = await Donation.find(query).populate("campaignId", "title").sort({ date: -1 });

    const report = {
      generatedAt: new Date(),
      totalDonation: donations.reduce((sum, item) => sum + item.amount, 0),
      financialYears: calculateYearlyDonation(donations),
      monthlyBreakdown: monthlyBreakdown(donations),
      receipts: donations.map((donation) => ({
        amount: donation.amount,
        date: donation.date,
        financialYear: donation.financialYear,
        campaignTitle: donation.campaignId?.title || "Campaign",
        certificateId: donation.certificate?.certificateId || "",
      })),
    };

    res.json(report);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.verifyCertificate = async (req, res) => {
  try {
    const donation = await Donation.findOne({
      "certificate.certificateId": req.params.id,
    }).populate("campaignId", "title");

    if (!donation) {
      return res.status(404).json({ valid: false, message: "Certificate not found" });
    }

    res.json({
      valid: true,
      donorName: donation.isAnonymous ? "Anonymous supporter" : donation.donorName,
      amount: donation.amount,
      date: donation.date,
      campaignTitle: donation.campaignId?.title || "Campaign",
      financialYear: donation.financialYear,
      eligible80G: donation.certificate?.eligible80G,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.downloadCertificate = async (req, res) => {
  try {
    const donation = await Donation.findOne({
      "certificate.certificateId": req.params.id,
    }).populate("campaignId", "title location ngoDetails");

    if (!donation?.certificate?.certificateId) {
      return res.status(404).json({ message: "Certificate not found" });
    }

    const ngoDetails = donation.campaignId
      ? resolveCampaignNgoDetails(donation.campaignId)
      : {
          ngoName: donation.certificate.ngoName || NGO_NAME,
          pan: donation.certificate.pan || NGO_PAN,
          eightyGNumber: donation.certificate.eightyGNumber || NGO_80G,
          ngoAddress: donation.certificate.ngoAddress || NGO_ADDRESS,
          ngoEmail: donation.certificate.ngoEmail || NGO_EMAIL,
          ngoPhone: donation.certificate.ngoPhone || NGO_PHONE,
        };

    const refreshedCertificate = createCertificateForDonation({
      donorName: donation.certificate.donorName || donation.donorName,
      amount: donation.amount,
      donationDate: donation.date,
      campaignTitle: donation.campaignId?.title || donation.certificate.campaignTitle || "Campaign",
      ngoDetails,
      certificateId: donation.certificate.certificateId,
    });

    donation.certificate = {
      ...donation.certificate,
      certificateId: refreshedCertificate.certificateId,
      fileUrl: refreshedCertificate.fileUrl,
      fileName: refreshedCertificate.fileName,
      donorName: refreshedCertificate.donorName,
      campaignTitle: refreshedCertificate.campaignTitle,
      amount: refreshedCertificate.amount,
      issuedOn: refreshedCertificate.issuedOn,
      ngoName: refreshedCertificate.ngoName,
      pan: refreshedCertificate.pan,
      eightyGNumber: refreshedCertificate.eightyGNumber,
      ngoAddress: refreshedCertificate.ngoAddress,
      ngoEmail: refreshedCertificate.ngoEmail,
      ngoPhone: refreshedCertificate.ngoPhone,
      eligible80G: true,
    };
    await donation.save();

    const filePath = path.join(uploadsDir, "certificates", refreshedCertificate.fileName);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${refreshedCertificate.fileName}"`);
    return res.sendFile(filePath);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.downloadCertificatesZip = async (req, res) => {
  try {
    const user = await parseUserFromToken(req);
    if (user) {
      await syncUserDonorRecords(user);
    }
    const query = buildDonorScope({
      userId: req.user?.id,
      email: user?.email || req.query.email,
      mobile: user?.mobile,
    });

    if (!query) {
      return res.status(400).json({ message: "User context required" });
    }

    const donations = await Donation.find(query);

    if (!archiver) {
      return res.status(501).json({
        message: "ZIP export requires the archiver package. Install dependencies and try again.",
      });
    }

    res.attachment("donation-certificates.zip");
    const archive = archiver("zip", { zlib: { level: 9 } });

    archive.pipe(res);

    for (const donation of donations) {
      if (!donation.certificate?.certificateId) continue;

      const refreshedCertificate = createCertificateForDonation({
        donorName: donation.certificate.donorName || donation.donorName,
        amount: donation.amount,
        donationDate: donation.date,
        campaignTitle: donation.certificate.campaignTitle || "Campaign",
        ngoDetails: {
          ngoName: donation.certificate.ngoName || NGO_NAME,
          pan: donation.certificate.pan || NGO_PAN,
          eightyGNumber: donation.certificate.eightyGNumber || NGO_80G,
          ngoAddress: donation.certificate.ngoAddress || NGO_ADDRESS,
          ngoEmail: donation.certificate.ngoEmail || NGO_EMAIL,
          ngoPhone: donation.certificate.ngoPhone || NGO_PHONE,
        },
        certificateId: donation.certificate.certificateId,
      });

      donation.certificate.fileName = refreshedCertificate.fileName;
      donation.certificate.fileUrl = refreshedCertificate.fileUrl;
      const filePath = path.join(uploadsDir, "certificates", refreshedCertificate.fileName);
      if (fs.existsSync(filePath)) {
        archive.file(filePath, { name: refreshedCertificate.fileName });
      }
    }

    await archive.finalize();
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
