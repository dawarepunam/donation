const mongoose = require("mongoose");

const systemSettingSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    taxPercentage: { type: Number, default: 50 },
    platformFeePercentage: { type: Number, default: 0 },
    supportEmail: { type: String, default: "support@hopespring.org" },
    receiptPrefix: { type: String, default: "HSN" },
    maintenanceMode: { type: Boolean, default: false },
    emailTemplates: {
      donationThankYou: { type: String, default: "Thank you for supporting HopeSpring." },
      campaignApproval: { type: String, default: "Your campaign has been approved." },
      accountStatus: { type: String, default: "Your account status has changed." },
      marketingThankYou: { type: String, default: "Thank you for your continued support, {name}." },
      marketingCampaignUpdate: { type: String, default: "Support our latest campaign: {campaignTitle}." },
      marketingReminder: { type: String, default: "A kind reminder from HopeSpring, {name}." },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("SystemSetting", systemSettingSchema);
