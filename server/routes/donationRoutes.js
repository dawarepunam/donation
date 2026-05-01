const router = require("express").Router();
const ctrl = require("../controllers/donationController");
const auth = require("../middleware/authMiddleware");

router.post("/create-order", ctrl.createOrder);
router.post("/verify", ctrl.verifyPayment);
router.get("/user", auth, ctrl.getUserDonations);
router.get("/tax-report", auth, ctrl.getTaxReport);
router.get("/certificate/verify/:id", ctrl.verifyCertificate);
router.get("/certificate/download/:id", ctrl.downloadCertificate);
router.get("/certificates", auth, ctrl.downloadCertificatesZip);

module.exports = router;
