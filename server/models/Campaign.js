const mongoose = require("mongoose");

const mediaSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["image", "video"],
      default: "image",
    },
    url: { type: String, required: true },
  },
  { _id: false }
);

const allocationSchema = new mongoose.Schema(
  {
    title: String,
    description: String,
    percentage: Number,
  },
  { _id: false }
);

const storySchema = new mongoose.Schema(
  {
    title: String,
    description: String,
    imageUrl: String,
    impact: String,
  },
  { _id: false }
);

const campaignUpdateSchema = new mongoose.Schema(
  {
    title: { type: String, default: "" },
    description: { type: String, default: "" },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const ngoDetailsSchema = new mongoose.Schema(
  {
    name: { type: String, default: "" },
    pan: { type: String, default: "" },
    eightyGNumber: { type: String, default: "" },
    address: { type: String, default: "" },
    email: { type: String, default: "" },
    phone: { type: String, default: "" },
  },
  { _id: false }
);

const campaignSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    tagline: { type: String, default: "" },
    description: { type: String, default: "" },
    category: { type: String, default: "Community Support" },
    location: { type: String, default: "" },
    goalAmount: { type: Number, required: true },
    raisedAmount: { type: Number, default: 0 },
    donorCount: { type: Number, default: 0 },
    impactPerUnit: { type: Number, default: 250 },
    impactLabel: { type: String, default: "child supported" },
    coverImage: {
      type: String,
      default:
        "https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?auto=format&fit=crop&w=1200&q=80",
    },
    media: { type: [mediaSchema], default: [] },
    whereMoneyGoes: { type: [allocationSchema], default: [] },
    story: { type: storySchema, default: () => ({}) },
    ngoDetails: { type: ngoDetailsSchema, default: () => ({}) },
    status: {
      type: String,
      enum: ["pending", "active", "rejected", "completed"],
      default: "pending",
    },
    featured: { type: Boolean, default: false },
    ownerAdminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    ownerAdminName: { type: String, default: "" },
    approvalNotes: { type: String, default: "" },
    isDraft: { type: Boolean, default: false },
    isPaused: { type: Boolean, default: false },
    viewCount: { type: Number, default: 0 },
    conversionRate: { type: Number, default: 0 },
    updates: { type: [campaignUpdateSchema], default: [] },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Campaign", campaignSchema);
