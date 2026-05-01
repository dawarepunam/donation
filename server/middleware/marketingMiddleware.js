const User = require("../models/User");

module.exports = async (req, res, next) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const user = await User.findById(req.user.id).select(
      "name email mobile profilePhoto role isActive notifications permissions"
    );

    if (!user || user.isDeleted) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.isActive === false) {
      return res.status(403).json({ message: "Your account is inactive" });
    }

    if (user.role !== "marketing") {
      return res.status(403).json({ message: "Marketing access required" });
    }

    req.marketingUser = user;
    next();
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
