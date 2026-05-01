const mongoose = require("mongoose");

const mediaItemSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["image", "video"],
      default: "image",
    },
    url: { type: String, default: "" },
    label: { type: String, default: "" },
  },
  { _id: false }
);

const metricSchema = new mongoose.Schema(
  {
    label: { type: String, default: "" },
    value: { type: String, default: "" },
  },
  { _id: false }
);

const impactEventSchema = new mongoose.Schema(
  {
    campaignId: { type: mongoose.Schema.Types.ObjectId, ref: "Campaign", required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    eventDate: { type: Date, required: true },
    location: { type: String, default: "" },
    impactNumber: { type: Number, default: 0 },
    impactLabel: { type: String, default: "people supported" },
    fundUsed: { type: Number, default: 0 },
    progressPercent: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    isLiveUpdate: { type: Boolean, default: false },
    liveLabel: { type: String, default: "" },
    storyTitle: { type: String, default: "" },
    storyDescription: { type: String, default: "" },
    mapLink: { type: String, default: "" },
    shareMessage: { type: String, default: "" },
    reportNotes: { type: String, default: "" },
    donorTags: { type: [String], default: [] },
    metrics: { type: [metricSchema], default: [] },
    photos: { type: [mediaItemSchema], default: [] },
    beforePhotos: { type: [mediaItemSchema], default: [] },
    afterPhotos: { type: [mediaItemSchema], default: [] },
    videoUrl: { type: String, default: "" },
    reviewNotes: { type: String, default: "" },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    approvedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ImpactEvent", impactEventSchema);
