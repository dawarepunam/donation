const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Subscription = require("../models/Subscription");
const { normalizeEmail, syncUserDonorRecords } = require("../utils/userDonorSync");
const { getOperationalEmails, uniqueEmails } = require("../utils/admin");
const { notifyOperation, notifyUsers } = require("../utils/notifications");
const {
  DELETION_GRACE_DAYS,
  getDeleteAfterDate,
  getRemainingDeletionDays,
} = require("../utils/accountDeletion");

const MAX_PROFILE_PHOTO_SIZE = 2_000_000;

const sanitizeProfilePhoto = (value = "") => {
  if (!value || typeof value !== "string") return "";
  const trimmed = value.trim();

  if (!trimmed.startsWith("data:image/")) {
    return "";
  }

  if (Buffer.byteLength(trimmed, "utf8") > MAX_PROFILE_PHOTO_SIZE) {
    throw new Error("Profile photo is too large");
  }

  return trimmed;
};

const signToken = (user) =>
  jwt.sign({ id: user._id, email: user.email, role: user.role }, process.env.JWT_SECRET || "secret", {
    expiresIn: "7d",
  });

const strongPassword = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/;

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
  expiry.setMinutes(expiry.getMinutes() + 15);
  return expiry;
};

const isAccountPermanentlyDeleted = (user) => user.isDeleted || user.accountStatus === "deleted";

const clearScheduledDeletion = (user) => {
  user.isDeleted = false;
  user.accountStatus = "active";
  user.deleteRequestedAt = null;
  user.deleteAfter = null;
  user.deletionCancelledAt = new Date();
};

const getResolvedRole = (user) => {
  if (user.role === "superadmin") return "superadmin";
  if (user.role === "admin") return "admin";
  if (user.role === "marketing") return "marketing";
  return "user";
};

const getSetupState = (user) => {
  const onboarding = user.onboarding || {};
  const requiresOtp = Boolean(onboarding.isAutoCreated) && !onboarding.emailOtpVerifiedAt;
  const requiresPasswordReset = Boolean(onboarding.mustChangePassword);

  return {
    required: requiresOtp || requiresPasswordReset,
    isAutoCreated: Boolean(onboarding.isAutoCreated),
    requiresOtpVerification: requiresOtp,
    requiresPasswordReset,
    otpSentAt: onboarding.emailOtpLastSentAt || null,
    otpExpiresAt: onboarding.emailOtpExpiresAt || null,
    onboardingOrigin: onboarding.origin || "manual",
  };
};

const persistAutoAccountOtp = async (user, plainOtp) => {
  user.onboarding = user.onboarding || {};
  user.onboarding.emailOtpHash = await bcrypt.hash(plainOtp, 10);
  user.onboarding.emailOtpExpiresAt = getOtpExpiry();
  user.onboarding.emailOtpLastSentAt = new Date();
  user.onboarding.emailOtpVerifiedAt = null;
  await user.save();
};

const serializeUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  mobile: user.mobile,
  profilePhoto: user.profilePhoto || "",
  role: getResolvedRole(user),
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
  accountDeletion: {
    status: user.accountStatus || (user.isDeleted ? "deleted" : "active"),
    isScheduled: user.accountStatus === "scheduled",
    deleteRequestedAt: user.deleteRequestedAt || null,
    deleteAfter: user.deleteAfter || null,
    remainingDays: getRemainingDeletionDays(user.deleteAfter),
    graceDays: DELETION_GRACE_DAYS,
  },
});

const getActor = (user) => ({
  name: user.name,
  email: user.email,
  role: getResolvedRole(user),
});

exports.register = async (req, res) => {
  try {
    const { name, email, password, mobile, profilePhoto } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: "Name, email and password are required" });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(409).json({ message: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({
      name,
      email: normalizeEmail(email),
      mobile: mobile || "",
      profilePhoto: sanitizeProfilePhoto(profilePhoto),
      password: hashedPassword,
      role: "user",
      onboarding: {
        origin: "manual",
        isAutoCreated: false,
        mustChangePassword: false,
      },
    });

    await syncUserDonorRecords(user);
    await notifyOperation({
      actor: getActor(user),
      recipients: uniqueEmails([user.email, ...(await getOperationalEmails())]),
      subject: `New account registered: ${user.email}`,
      operationTitle: "New donor account created",
      operationDetails: [`Account: <strong>${user.name}</strong> (${user.email})`],
      contextLabel: "user-registered-ops",
    });

    res.status(201).json({
      token: signToken(user),
      user: serializeUser(user),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: normalizeEmail(email) });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (isAccountPermanentlyDeleted(user)) {
      return res.status(403).json({ message: "This account is no longer available" });
    }

    if (user.isActive === false) {
      return res.status(403).json({ message: "Your account is inactive. Please contact support." });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    user.lastLoginAt = new Date();
    await user.save();
    await syncUserDonorRecords(user);
    await notifyUsers({
      recipients: [user.email],
      subject: "Profile updated successfully",
      html: `<h2>Profile updated</h2><p>Your HopeSpring profile details were updated successfully.</p>`,
      contextLabel: "profile-updated-user",
    });

    res.json({
      token: signToken(user),
      user: serializeUser(user),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.me = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user || isAccountPermanentlyDeleted(user)) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({ user: serializeUser(user) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user || isAccountPermanentlyDeleted(user)) {
      return res.status(404).json({ message: "User not found" });
    }

    const { name, mobile, profilePhoto } = req.body;

    if (typeof name === "string" && name.trim()) {
      user.name = name.trim();
    }

    if (typeof mobile === "string") {
      user.mobile = mobile.trim();
    }

    if (profilePhoto !== undefined) {
      user.profilePhoto = sanitizeProfilePhoto(profilePhoto);
    }

    await user.save();
    await syncUserDonorRecords(user);

    res.json({
      message: "Profile updated successfully",
      user: serializeUser(user),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.changePassword = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user || isAccountPermanentlyDeleted(user)) {
      return res.status(404).json({ message: "User not found" });
    }

    const { currentPassword, newPassword, confirmPassword } = req.body;
    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ message: "All password fields are required" });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ message: "New password and confirm password must match" });
    }

    if (!strongPassword.test(newPassword)) {
      return res.status(400).json({
        message: "Password must be 8+ chars with uppercase, lowercase, number, and special character",
      });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Current password is incorrect" });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();
    await notifyUsers({
      recipients: [user.email],
      subject: "Password changed successfully",
      html: `<h2>Password updated</h2><p>Your HopeSpring account password was changed successfully. Use the new password for your next login.</p>`,
      contextLabel: "password-updated-user",
    });

    res.json({ message: "Password updated successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.updatePreferences = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user || isAccountPermanentlyDeleted(user)) {
      return res.status(404).json({ message: "User not found" });
    }

    const { privacy, notifications } = req.body;

    if (privacy && typeof privacy === "object") {
      if (typeof privacy.anonymousDefault === "boolean") {
        user.privacy.anonymousDefault = privacy.anonymousDefault;
      }
      if (typeof privacy.showName === "boolean") {
        user.privacy.showName = privacy.showName;
      }
    }

    if (notifications && typeof notifications === "object") {
      if (typeof notifications.email === "boolean") {
        user.notifications.email = notifications.email;
      }
      if (typeof notifications.reminders === "boolean") {
        user.notifications.reminders = notifications.reminders;
      }
    }

    await user.save();
    await notifyUsers({
      recipients: [user.email],
      subject: "Preferences updated",
      html: `<h2>Preferences updated</h2><p>Your privacy or notification preferences were updated successfully.</p>`,
      contextLabel: "preferences-updated-user",
    });

    res.json({
      message: "Preferences updated successfully",
      user: serializeUser(user),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.sendSetupOtp = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user || isAccountPermanentlyDeleted(user)) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!getSetupState(user).required || !user.onboarding?.isAutoCreated) {
      return res.status(400).json({ message: "OTP setup is not required for this account" });
    }

    const plainOtp = generateOtpCode();
    await persistAutoAccountOtp(user, plainOtp);

    await notifyUsers({
      recipients: [user.email],
      subject: "Your HopeSpring verification OTP",
      html: `
        <h2>Verification OTP</h2>
        <p>Your new verification code is <strong>${plainOtp}</strong>.</p>
        <p>This code expires in 15 minutes. Enter it on the first-login setup screen to continue.</p>
      `,
      contextLabel: "auto-account-otp-user",
    });

    res.json({
      message: "OTP sent successfully",
      user: serializeUser(user),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.completeFirstLoginSetup = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user || isAccountPermanentlyDeleted(user)) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!getSetupState(user).required || !user.onboarding?.isAutoCreated) {
      return res.status(400).json({ message: "This account does not require first login setup" });
    }

    const { otp, newPassword, confirmPassword } = req.body;
    if (!otp || !newPassword || !confirmPassword) {
      return res.status(400).json({ message: "OTP and both password fields are required" });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ message: "New password and confirm password must match" });
    }

    if (!strongPassword.test(newPassword)) {
      return res.status(400).json({
        message: "Password must be 8+ chars with uppercase, lowercase, number, and special character",
      });
    }

    if (!user.onboarding?.emailOtpHash || !user.onboarding?.emailOtpExpiresAt) {
      return res.status(400).json({ message: "OTP not available. Please request a new code." });
    }

    if (new Date(user.onboarding.emailOtpExpiresAt).getTime() < Date.now()) {
      return res.status(400).json({ message: "OTP has expired. Please request a new code." });
    }

    const otpMatches = await bcrypt.compare(String(otp).trim(), user.onboarding.emailOtpHash);
    if (!otpMatches) {
      return res.status(400).json({ message: "OTP is incorrect" });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    user.onboarding.isAutoCreated = false;
    user.onboarding.mustChangePassword = false;
    user.onboarding.emailOtpHash = "";
    user.onboarding.emailOtpExpiresAt = null;
    user.onboarding.emailOtpLastSentAt = null;
    user.onboarding.emailOtpVerifiedAt = new Date();
    await user.save();

    await notifyUsers({
      recipients: [user.email],
      subject: "Your donor account is now secured",
      html: `
        <h2>Account setup complete</h2>
        <p>Your HopeSpring donor account has been verified successfully. You can now access your dashboard with the new password.</p>
      `,
      contextLabel: "auto-account-setup-complete-user",
    });

    res.json({
      message: "Account setup completed successfully",
      token: signToken(user),
      user: serializeUser(user),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.validatePassword = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user || isAccountPermanentlyDeleted(user)) {
      return res.status(404).json({ message: "User not found" });
    }

    const { password } = req.body;
    if (!password) {
      return res.status(400).json({ message: "Password is required" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    res.json({
      valid: isMatch,
      message: isMatch ? "Password confirmed" : "Password is incorrect",
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.deleteAccount = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user || isAccountPermanentlyDeleted(user)) {
      return res.status(404).json({ message: "User not found" });
    }

    const { password } = req.body;
    if (!password) {
      return res.status(400).json({ message: "Password is required to delete account" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Password is incorrect" });
    }

    if (user.accountStatus === "scheduled" && user.deleteAfter) {
      return res.json({
        message: "Account deletion is already scheduled",
        user: serializeUser(user),
      });
    }

    // Schedule deletion instead of removing donor data immediately so the grace-period UX stays recoverable.
    const requestedAt = new Date();
    user.accountStatus = "scheduled";
    user.deleteRequestedAt = requestedAt;
    user.deleteAfter = getDeleteAfterDate(requestedAt);
    user.deletionCancelledAt = null;
    await user.save();

    await Subscription.updateMany(
      { userId: user._id, status: "active" },
      {
        $set: {
          status: "cancelled",
          cancelledAt: new Date(),
          nextPaymentDate: null,
        },
      }
    );
    await notifyUsers({
      recipients: [user.email],
      subject: "Account deletion scheduled",
      html: `
        <h2>Account deletion requested</h2>
        <p>Your HopeSpring account is scheduled for deletion in ${DELETION_GRACE_DAYS} days.</p>
        <p>You can still log in during this period and cancel the request from Privacy settings.</p>
      `,
      contextLabel: "account-delete-request-user",
    });
    await notifyOperation({
      actor: getActor(user),
      recipients: await getOperationalEmails(),
      subject: `Account deletion scheduled: ${user._id}`,
      operationTitle: "User account deletion scheduled",
      operationDetails: [
        `User id: <strong>${user._id}</strong>`,
        `Delete after: <strong>${user.deleteAfter.toISOString()}</strong>`,
      ],
      contextLabel: "user-delete-scheduled-ops",
    });

    res.json({
      message: "Account deletion scheduled successfully",
      user: serializeUser(user),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.cancelDeleteAccount = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user || isAccountPermanentlyDeleted(user)) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.accountStatus !== "scheduled") {
      return res.status(400).json({ message: "No scheduled deletion found for this account" });
    }

    clearScheduledDeletion(user);
    await user.save();

    await notifyUsers({
      recipients: [user.email],
      subject: "Account deletion cancelled",
      html: `
        <h2>Deletion cancelled</h2>
        <p>Your HopeSpring account has been fully restored and the scheduled deletion request was cancelled.</p>
      `,
      contextLabel: "account-delete-cancel-user",
    });

    res.json({
      message: "Scheduled deletion cancelled successfully",
      user: serializeUser(user),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
