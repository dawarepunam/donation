const mongoose = require("mongoose");

const recipientSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    email: { type: String, default: "" },
    variant: { type: String, enum: ["A", "B"], default: "A" },
    channel: { type: String, enum: ["email", "whatsapp"], default: "email" },
    status: {
      type: String,
      enum: ["pending", "sent", "ready", "failed", "clicked"],
      default: "pending",
    },
    sentAt: { type: Date, default: null },
    clickedAt: { type: Date, default: null },
    clickCount: { type: Number, default: 0 },
    shareLink: { type: String, default: "" },
    recipientName: { type: String, default: "" },
    donationRange: { type: String, default: "" },
    messagePreview: { type: String, default: "" },
    subjectPreview: { type: String, default: "" },
  },
  { _id: true }
);

const marketingCampaignSchema = new mongoose.Schema(
  {
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true },
    channel: {
      type: String,
      enum: ["email", "whatsapp"],
      default: "email",
    },
    templateKey: {
      type: String,
      enum: ["thankYou", "campaignUpdate", "reminder", "custom"],
      default: "custom",
    },
    subject: { type: String, default: "" },
    messageA: { type: String, default: "" },
    messageB: { type: String, default: "" },
    targetCampaignId: { type: mongoose.Schema.Types.ObjectId, ref: "Campaign", default: null },
    audience: {
      segment: {
        type: String,
        enum: ["all", "high", "medium", "low"],
        default: "all",
      },
      donorState: {
        type: String,
        enum: ["all", "active", "high-value"],
        default: "all",
      },
    },
    abTest: {
      enabled: { type: Boolean, default: false },
      splitPercentage: { type: Number, default: 50 },
    },
    scheduleAt: { type: Date, default: null },
    status: {
      type: String,
      enum: ["draft", "scheduled", "processing", "completed", "ready", "failed"],
      default: "draft",
    },
    metrics: {
      recipients: { type: Number, default: 0 },
      delivered: { type: Number, default: 0 },
      clicks: { type: Number, default: 0 },
      reach: { type: Number, default: 0 },
    },
    recipients: {
      type: [recipientSchema],
      default: [],
    },
    lastProcessedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("MarketingCampaign", marketingCampaignSchema);
