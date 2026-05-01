const mongoose = require("mongoose");

const certificateSchema = new mongoose.Schema(
  {
    certificateId: String,
    fileUrl: String,
    fileName: String,
    donorName: String,
    campaignTitle: String,
    amount: Number,
    issuedOn: Date,
    ngoName: String,
    pan: String,
    eightyGNumber: String,
    ngoAddress: String,
    ngoEmail: String,
    ngoPhone: String,
    eligible80G: { type: Boolean, default: true },
    verified: { type: Boolean, default: false },
    verifiedAt: { type: Date, default: null },
  },
  { _id: false },
);

const paymentSchema = new mongoose.Schema(
  {
    orderId: String,
    paymentId: String,
    signature: String,
    status: { type: String, default: "paid" },
    provider: { type: String, default: "razorpay" },
  },
  { _id: false },
);

const donationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    donorName: { type: String, required: true },
    donorEmail: { type: String, required: true },
    donorMobile: { type: String, required: true },
    amount: { type: Number, required: true },
    donationType: {
      type: String,
      enum: ["one-time", "monthly"],
      default: "one-time",
    },
    isAnonymous: { type: Boolean, default: false },
    taxSavingEstimate: { type: Number, default: 0 },
    campaignId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Campaign",
      required: true,
    },
    date: { type: Date, default: Date.now },
    timestamp: { type: Number, default: () => Date.now() },
    financialYear: { type: String, required: true },
    impactUnits: { type: Number, default: 0 },
    impactMessage: { type: String, default: "" },
    recurring: {
      subscriptionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Subscription",
        default: null,
      },
      cycleNumber: { type: Number, default: null },
      totalCycles: { type: Number, default: null },
    },
    payment: paymentSchema,
    certificate: certificateSchema,
  },
  { timestamps: true },
);

module.exports = mongoose.model("Donation", donationSchema);
