const Donation = require("../models/Donation");
const Subscription = require("../models/Subscription");
const User = require("../models/User");

const normalizeEmail = (value = "") => String(value || "").trim().toLowerCase();
const normalizeMobile = (value = "") => String(value || "").replace(/\D/g, "");
const escapeRegex = (value = "") => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const emailMatcher = (email = "") => {
  const normalized = normalizeEmail(email);
  return normalized ? new RegExp(`^${escapeRegex(normalized)}$`, "i") : null;
};

const mobileMatcher = (mobile = "") => {
  const normalized = normalizeMobile(mobile);
  return normalized ? new RegExp(`^${escapeRegex(normalized)}$`) : null;
};

const buildDonorMatchers = ({ email = "", mobile = "" }) => {
  const emailRegex = emailMatcher(email);
  const mobileRegex = mobileMatcher(mobile);

  return {
    donationOrClauses: [
      ...(emailRegex ? [{ donorEmail: emailRegex }] : []),
      ...(mobileRegex ? [{ donorMobile: mobileRegex }] : []),
    ],
    subscriptionOrClauses: [
      ...(emailRegex ? [{ donorEmail: emailRegex }] : []),
      ...(mobileRegex ? [{ donorMobile: mobileRegex }] : []),
    ],
  };
};

const syncUserDonorRecords = async (user) => {
  if (!user?._id || (!user?.email && !user?.mobile)) {
    return null;
  }

  const { donationOrClauses, subscriptionOrClauses } = buildDonorMatchers({
    email: user.email,
    mobile: user.mobile,
  });

  if (!donationOrClauses.length && !subscriptionOrClauses.length) {
    return null;
  }

  await Promise.all([
    Donation.updateMany(
      {
        $and: [
          { $or: donationOrClauses },
          { $or: [{ userId: null }, { userId: { $exists: false } }] },
        ],
      },
      {
        $set: { userId: user._id },
      }
    ),
    Subscription.updateMany(
      {
        $and: [
          { $or: subscriptionOrClauses },
          { $or: [{ userId: null }, { userId: { $exists: false } }] },
        ],
      },
      {
        $set: { userId: user._id },
      }
    ),
  ]);

  const donations = await Donation.find({
    $or: [{ userId: user._id }, ...donationOrClauses],
  }).sort({ date: -1 });

  const totalDonated = donations.reduce((sum, donation) => sum + (donation.amount || 0), 0);
  const lastDonationAt = donations[0]?.date || null;

  user.totalDonated = totalDonated;
  user.lastDonationAt = lastDonationAt;
  await user.save();

  return {
    totalDonated,
    lastDonationAt,
    donationsCount: donations.length,
  };
};

const syncAllUsersDonorRecords = async () => {
  const users = await User.find({}, "_id email mobile totalDonated lastDonationAt");
  let syncedUsers = 0;

  for (const user of users) {
    const result = await syncUserDonorRecords(user);
    if (result) {
      syncedUsers += 1;
    }
  }

  return { syncedUsers };
};

module.exports = {
  normalizeEmail,
  normalizeMobile,
  emailMatcher,
  mobileMatcher,
  buildDonorMatchers,
  syncUserDonorRecords,
  syncAllUsersDonorRecords,
};
