const router = require("express").Router();
const ctrl = require("../controllers/subscriptionController");
const auth = require("../middleware/authMiddleware");

router.post("/", auth, ctrl.createSubscription);
router.get("/", auth, ctrl.getSubscriptions);
router.put("/:id/cancel", auth, ctrl.cancelSubscription);

module.exports = router;
