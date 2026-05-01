const Subscription = require("../models/Subscription");
const {
  normalizeEmail,
  normalizeMobile,
  buildDonorMatchers,
  syncUserDonorRecords,
} = require("../utils/userDonorSync");

const buildSubscriptionScope = ({ userId, email, mobile }) => {
  const conditions = [];
  if (userId) {
    conditions.push({ userId });
  }

  const { subscriptionOrClauses } = buildDonorMatchers({ email, mobile });
  if (subscriptionOrClauses.length) {
    conditions.push(...subscriptionOrClauses);
  }

  if (!conditions.length) return null;
  return conditions.length === 1 ? conditions[0] : { $or: conditions };
};

exports.createSubscription = async (req, res) => {
  try {
    const { campaignId, amount, duration } = req.body;
    const nextPaymentDate = new Date();
    nextPaymentDate.setMonth(nextPaymentDate.getMonth() + 1);
    const parsedDuration = Number(duration || 12);
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + Math.max(parsedDuration - 1, 0));

    const subscription = await Subscription.create({
      userId: req.user?.id || null,
      donorName: req.body.donorName,
      donorEmail: normalizeEmail(req.body.donorEmail),
      donorMobile: normalizeMobile(req.body.donorMobile),
      campaignId,
      amount: Number(amount),
      duration: parsedDuration,
      endDate,
      nextPaymentDate,
      razorpaySubscriptionId: req.body.razorpaySubscriptionId || "",
    });

    res.status(201).json(subscription);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getSubscriptions = async (req, res) => {
  try {
    if (req.user?.id) {
      const User = require("../models/User");
      const user = await User.findById(req.user.id);
      if (user) {
        await syncUserDonorRecords(user);
      }
    }

    const query = buildSubscriptionScope({
      userId: req.user?.id,
      email: req.user?.email || req.query.email,
      mobile: req.user?.mobile || req.query.mobile,
    });

    if (!query) {
      return res.status(400).json({ message: "User context required" });
    }

    const subscriptions = await Subscription.find(query).populate("campaignId", "title");
    res.json(subscriptions);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.cancelSubscription = async (req, res) => {
  try {
    const scope = buildSubscriptionScope({
      userId: req.user?.id,
      email: req.user?.email || req.query.email,
      mobile: req.user?.mobile || req.query.mobile,
    });

    if (!scope) {
      return res.status(400).json({ message: "User context required" });
    }

    const query = {
      _id: req.params.id,
      ...(scope.$or ? { $or: scope.$or } : scope),
    };

    const subscription = await Subscription.findOne(query);

    if (!subscription) {
      return res.status(404).json({ message: "Subscription not found" });
    }

    if (subscription.status !== "active") {
      return res.status(400).json({ message: "Subscription is already inactive" });
    }

    subscription.status = "cancelled";
    subscription.cancelledAt = new Date();
    subscription.nextPaymentDate = null;
    subscription.history = subscription.history.map((entry) => ({
      ...entry.toObject(),
      status: entry.status === "scheduled" ? "cancelled" : entry.status,
    }));
    await subscription.save();

    res.json({ message: "Subscription cancelled", subscription });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
