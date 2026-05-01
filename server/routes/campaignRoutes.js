const router = require("express").Router();
const ctrl = require("../controllers/campaignController");
const auth = require("../middleware/authMiddleware");
const admin = require("../middleware/adminMiddleware");

router.get("/home", ctrl.getHomeData);
router.get("/stories", ctrl.getSuccessStories);
router.get("/", ctrl.getCampaigns);
router.get("/:id", ctrl.getCampaignById);
router.post("/create", auth, admin, ctrl.createCampaign);
router.put("/:id", auth, admin, ctrl.updateCampaign);
router.delete("/:id", auth, admin, ctrl.deleteCampaign);

module.exports = router;
