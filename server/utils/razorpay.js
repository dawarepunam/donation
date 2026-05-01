const crypto = require("crypto");
const Razorpay = require("razorpay");

const razorpayKeyId = process.env.RAZORPAY_KEY_ID || process.env.KEY_ID || "";
const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET || process.env.KEY_SECRET || "";
const mockPayments = String(process.env.MOCK_PAYMENTS || "").toLowerCase() === "true";

const hasRazorpayCredentials =
  !mockPayments && Boolean(razorpayKeyId) && Boolean(razorpayKeySecret);

const instance = hasRazorpayCredentials
  ? new Razorpay({
      key_id: razorpayKeyId,
      key_secret: razorpayKeySecret,
    })
  : null;

const verifySignature = ({ orderId, paymentId, signature }) => {
  if (!hasRazorpayCredentials) {
    return signature === "dev_signature";
  }

  const digest = crypto
    .createHmac("sha256", razorpayKeySecret)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");

  return digest === signature;
};

module.exports = {
  instance,
  hasRazorpayCredentials,
  razorpayKeyId,
  verifySignature,
};
