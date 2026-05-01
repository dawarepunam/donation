const crypto = require("crypto");
const bcrypt = require("bcryptjs");

const User = require("../models/User");
const Donation = require("../models/Donation");
const Subscription = require("../models/Subscription");

const DELETION_GRACE_DAYS = 30;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const getDeleteAfterDate = (requestedAt = new Date()) => {
  const deleteAfter = new Date(requestedAt);
  deleteAfter.setDate(deleteAfter.getDate() + DELETION_GRACE_DAYS);
  return deleteAfter;
};

const getRemainingDeletionDays = (deleteAfter) => {
  if (!deleteAfter) return null;
  return Math.max(0, Math.ceil((new Date(deleteAfter).getTime() - Date.now()) / ONE_DAY_MS));
};

const finalizeUserDeletion = async (user) => {
  const deletedAt = new Date();
  const randomPassword = crypto.randomBytes(24).toString("hex");

  user.name = "Anonymous User";
  user.email = `deleted_${user._id}_${deletedAt.getTime()}@deleted.local`;
  user.mobile = "";
  user.profilePhoto = "";
  user.password = await bcrypt.hash(randomPassword, 10);
  user.isDeleted = true;
  user.isActive = false;
  user.accountStatus = "deleted";
  user.deleteRequestedAt = user.deleteRequestedAt || deletedAt;
  user.deleteAfter = deletedAt;
  user.deletionCancelledAt = null;

  await user.save();

  // Preserve donation records while removing personally identifying donor fields.
  await Promise.all([
    Donation.updateMany(
      { userId: user._id },
      {
        $set: {
          donorName: "Anonymous User",
          donorEmail: "",
          donorMobile: "",
        },
      }
    ),
    Subscription.updateMany(
      { userId: user._id },
      {
        $set: {
          donorName: "Anonymous User",
          donorEmail: "",
          donorMobile: "",
          status: "cancelled",
          cancelledAt: deletedAt,
          nextPaymentDate: null,
        },
      }
    ),
  ]);
};

const processScheduledAccountDeletions = async () => {
  const dueUsers = await User.find({
    accountStatus: "scheduled",
    isDeleted: { $ne: true },
    deleteAfter: { $lte: new Date() },
  });

  for (const user of dueUsers) {
    await finalizeUserDeletion(user);
  }

  return dueUsers.length;
};

const startAccountDeletionWorker = () => {
  const run = async () => {
    try {
      const count = await processScheduledAccountDeletions();
      if (count) {
        console.log(`Processed ${count} scheduled account deletion(s)`);
      }
    } catch (error) {
      console.error("Scheduled account deletion worker failed", error.message);
    }
  };

  run();
  return setInterval(run, ONE_DAY_MS);
};

module.exports = {
  DELETION_GRACE_DAYS,
  getDeleteAfterDate,
  getRemainingDeletionDays,
  processScheduledAccountDeletions,
  startAccountDeletionWorker,
};
