const bcrypt = require("bcryptjs");

const User = require("../models/User");
// Keeps bootstrap logic shared so admin and superadmin accounts stay predictable across restarts.
const ensureRoleAccount = async ({ email, password, name, role }) => {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const safePassword = String(password || "");
  const safeName = String(name || "").trim();

  if (!normalizedEmail || !safePassword) {
    return;
  }

  const existing = await User.findOne({ email: normalizedEmail });
  const hashedPassword = await bcrypt.hash(safePassword, 10);

  if (!existing) {
    await User.create({
      name: safeName || `${role} account`,
      email: normalizedEmail,
      password: hashedPassword,
      role,
      isActive: true,
    });
    console.log(`${role} account created for ${normalizedEmail}`);
    return;
  }

  existing.password = hashedPassword;
  if (!existing.name || existing.name === "HopeSpring Admin" || existing.name === "superadmin account") {
    existing.name = safeName || existing.name;
  }
  existing.role = role;
  existing.isActive = true;
  await existing.save();
  console.log(`${role} account refreshed for ${normalizedEmail}`);
};

const ensureAdminAccount = async () => {
  const adminEmail = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const superAdminEmail = String(process.env.SUPERADMIN_EMAIL || "").trim().toLowerCase();

  if (!adminEmail || !process.env.ADMIN_PASSWORD) {
    return null;
  }

  // Avoid overwriting the superadmin account when both env vars point to the same inbox for testing.
  if (adminEmail === superAdminEmail) {
    console.log("Admin bootstrap skipped because ADMIN_EMAIL matches SUPERADMIN_EMAIL");
    return null;
  }

  await ensureRoleAccount({
    email: adminEmail,
    password: process.env.ADMIN_PASSWORD,
    name: process.env.ADMIN_NAME || "HopeSpring Admin",
    role: "admin",
  });

  return null;
};

const ensureSuperAdminAccount = async () => {
  await ensureRoleAccount({
    email: process.env.SUPERADMIN_EMAIL,
    password: process.env.SUPERADMIN_PASSWORD,
    name: process.env.SUPERADMIN_NAME || "HopeSpring SuperAdmin",
    role: "superadmin",
  });
};

module.exports = { ensureAdminAccount, ensureSuperAdminAccount };
