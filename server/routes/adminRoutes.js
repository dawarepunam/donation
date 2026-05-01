const router = require("express").Router();
const ctrl = require("../controllers/adminController");
const auth = require("../middleware/authMiddleware");
const admin = require("../middleware/adminMiddleware");

router.get("/dashboard", auth, admin, ctrl.getDashboard);
router.get("/me", auth, admin, ctrl.getMe);
router.get("/campaigns", auth, admin, ctrl.getCampaigns);
router.get("/campaigns/:id", auth, admin, ctrl.getCampaignById);
router.get("/donations", auth, admin, ctrl.getDonations);
router.get("/subscriptions", auth, admin, ctrl.getSubscriptions);
router.get("/reports", auth, admin, ctrl.getReports);

module.exports = router;
