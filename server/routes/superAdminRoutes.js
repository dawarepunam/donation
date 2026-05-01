const router = require("express").Router();
const ctrl = require("../controllers/superAdminController");
const auth = require("../middleware/authMiddleware");
const superAdmin = require("../middleware/superAdminMiddleware");

router.use(auth, superAdmin);

router.get("/dashboard", ctrl.getDashboard);

router.get("/admins", ctrl.getAdmins);
router.get("/admins/:id", ctrl.getAdminById);
router.post("/admins", ctrl.createAdmin);
router.put("/admins/:id", ctrl.updateAdmin);
router.delete("/admins/:id", ctrl.deleteUser);

router.get("/marketing-users", ctrl.getMarketingUsers);
router.post("/marketing-users", ctrl.createMarketingUser);
router.put("/marketing-users/:id", ctrl.updateMarketingUser);
router.get("/marketing/activity", ctrl.getMarketingActivity);
router.get("/marketing/impact-events", ctrl.getMarketingImpactEvents);
router.put("/marketing/impact-events/:id/review", ctrl.reviewMarketingImpactEvent);

router.get("/users", ctrl.getUsers);
router.get("/users/:id", ctrl.getUserById);
router.get("/users/:id/donations", ctrl.getUserDonations);
router.put("/users/:id/access", ctrl.updateUserAccess);
router.delete("/users/:id", ctrl.deleteUser);

router.get("/campaigns", ctrl.getCampaigns);
router.put("/campaigns/:id/status", ctrl.updateCampaignStatus);

router.get("/donations", ctrl.getDonations);

router.get("/subscriptions", ctrl.getSubscriptions);
router.put("/subscriptions/:id/cancel", ctrl.cancelSubscription);

router.get("/certificates", ctrl.getCertificates);
router.put("/certificates/:id/verify", ctrl.verifyCertificate);

router.get("/analytics", ctrl.getAnalytics);

router.get("/settings/system", ctrl.getSystemSettings);
router.put("/settings/system", ctrl.updateSystemSettings);
router.get("/settings/security", ctrl.getSecurityLogs);

router.put("/profile", ctrl.updateProfile);
router.put("/profile/password", ctrl.changePassword);

module.exports = router;
