const router = require("express").Router();
const ctrl = require("../controllers/marketingController");
const auth = require("../middleware/authMiddleware");
const marketing = require("../middleware/marketingMiddleware");

router.get("/click/:campaignId/:recipientId", ctrl.trackClickAndRedirect);

router.use(auth, marketing);

router.get("/dashboard", ctrl.getDashboard);
router.get("/donors", ctrl.getDonors);
router.get("/audience-preview", ctrl.getAudiencePreview);
router.get("/campaigns", ctrl.getCampaigns);
router.post("/campaigns", ctrl.createCampaign);
router.get("/impact-events", ctrl.getImpactEvents);
router.post("/impact-events", ctrl.createImpactEvent);
router.put("/impact-events/:id", ctrl.updateImpactEvent);
router.delete("/impact-events/:id", ctrl.deleteImpactEvent);
router.get("/impact-events/:id/report", ctrl.downloadImpactReport);
router.get("/templates", ctrl.getTemplates);
router.get("/settings", ctrl.getSettings);
router.get("/activities", ctrl.getActivities);
router.put("/profile", ctrl.updateProfile);
router.put("/profile/password", ctrl.changePassword);
router.get("/security", ctrl.getSecurity);

module.exports = router;
