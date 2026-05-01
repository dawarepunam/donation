const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    mobile: { type: String, default: "" },
    profilePhoto: { type: String, default: "" },
    role: {
      type: String,
      enum: ["user", "admin", "superadmin", "marketing"],
      default: "user",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    permissions: {
      type: [String],
      default: [],
    },
    password: { type: String, required: true },
    privacy: {
      anonymousDefault: { type: Boolean, default: false },
      showName: { type: Boolean, default: true },
    },
    notifications: {
      email: { type: Boolean, default: true },
      reminders: { type: Boolean, default: true },
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    accountStatus: {
      type: String,
      enum: ["active", "scheduled", "deleted"],
      default: "active",
    },
    deleteRequestedAt: {
      type: Date,
      default: null,
    },
    deleteAfter: {
      type: Date,
      default: null,
    },
    deletionCancelledAt: {
      type: Date,
      default: null,
    },
    lastLoginAt: {
      type: Date,
      default: null,
    },
    totalDonated: { type: Number, default: 0 },
    lastDonationAt: { type: Date, default: null },
    reminderPreferences: {
      monthlyDonation: { type: Boolean, default: true },
      yearEndTax: { type: Boolean, default: true },
      anniversary: { type: Boolean, default: true },
    },
    marketingConsent: {
      receiveUpdates: { type: Boolean, default: false },
      email: { type: Boolean, default: false },
      whatsapp: { type: Boolean, default: false },
      consentAt: { type: Date, default: null },
      source: { type: String, default: "none" },
    },
    onboarding: {
      origin: {
        type: String,
        enum: ["manual", "guest-donation"],
        default: "manual",
      },
      isAutoCreated: {
        type: Boolean,
        default: false,
      },
      mustChangePassword: {
        type: Boolean,
        default: false,
      },
      emailOtpHash: {
        type: String,
        default: "",
      },
      emailOtpExpiresAt: {
        type: Date,
        default: null,
      },
      emailOtpVerifiedAt: {
        type: Date,
        default: null,
      },
      emailOtpLastSentAt: {
        type: Date,
        default: null,
      },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
