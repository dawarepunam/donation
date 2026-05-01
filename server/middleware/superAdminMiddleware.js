const User = require("../models/User");

module.exports = async (req, res, next) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const user = await User.findById(req.user.id).select("email role isActive permissions");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.isActive === false) {
      return res.status(403).json({ message: "Your account is inactive" });
    }

    if (user.role !== "superadmin") {
      return res.status(403).json({ message: "Superadmin access required" });
    }

    // Downstream handlers can trust this document for auditing and guard decisions.
    req.superAdminUser = user;
    next();
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
