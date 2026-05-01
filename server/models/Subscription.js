const mongoose = require("mongoose");

const installmentSchema = new mongoose.Schema(
  {
    cycleNumber: { type: Number, default: 1 },
    amount: { type: Number, default: 0 },
    scheduledFor: { type: Date, default: null },
    paidAt: { type: Date, default: null },
    status: {
      type: String,
      enum: ["paid", "scheduled", "cancelled"],
      default: "scheduled",
    },
    donationId: { type: mongoose.Schema.Types.ObjectId, ref: "Donation", default: null },
    paymentId: { type: String, default: "" },
  },
  { _id: false }
);

const subscriptionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    donorName: String,
    donorEmail: String,
    donorMobile: { type: String, default: "" },
    campaignId: { type: mongoose.Schema.Types.ObjectId, ref: "Campaign", required: true },
    amount: Number,
    duration: { type: Number, default: 12 },
    completedCycles: { type: Number, default: 0 },
    startDate: { type: Date, default: Date.now },
    endDate: { type: Date, default: null },
    nextPaymentDate: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    status: {
      type: String,
      enum: ["active", "completed", "cancelled"],
      default: "active",
    },
    razorpaySubscriptionId: { type: String, default: "" },
    history: { type: [installmentSchema], default: [] },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Subscription", subscriptionSchema);
