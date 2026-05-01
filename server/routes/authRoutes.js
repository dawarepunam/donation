const router = require("express").Router();
const ctrl = require("../controllers/authController");
const auth = require("../middleware/authMiddleware");

router.post("/register", ctrl.register);
router.post("/login", ctrl.login);
router.get("/me", auth, ctrl.me);
router.put("/profile", auth, ctrl.updateProfile);
router.put("/password", auth, ctrl.changePassword);
router.put("/preferences", auth, ctrl.updatePreferences);
router.post("/setup/send-otp", auth, ctrl.sendSetupOtp);
router.put("/setup/complete", auth, ctrl.completeFirstLoginSetup);
router.post("/validate-password", auth, ctrl.validatePassword);
router.put("/delete-account", auth, ctrl.deleteAccount);
router.put("/delete-account/cancel", auth, ctrl.cancelDeleteAccount);

module.exports = router;
