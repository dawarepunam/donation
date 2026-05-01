const User = require("../models/User");

const uniqueEmails = (items = []) =>
  [...new Set(items.map((value) => String(value || "").trim().toLowerCase()).filter(Boolean))];

const getUsersByRoles = async (roles = []) => {
  const users = await User.find({
    role: { $in: roles },
    isDeleted: { $ne: true },
    isActive: true,
  }).select("name email role");

  return users;
};

const getAdminUsers = async () => getUsersByRoles(["admin"]);
const getSuperAdminUsers = async () => getUsersByRoles(["superadmin"]);
const getOperationalUsers = async () => getUsersByRoles(["admin", "superadmin"]);

const getAdminEmails = async () => {
  const users = await getAdminUsers();
  return uniqueEmails(users.map((user) => user.email));
};

const getSuperAdminEmails = async () => {
  const users = await getSuperAdminUsers();
  return uniqueEmails(users.map((user) => user.email));
};

const getOperationalEmails = async () => {
  const users = await getOperationalUsers();
  return uniqueEmails(users.map((user) => user.email));
};

const isAdminEmail = async (email = "") => {
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized) return false;
  const users = await getOperationalUsers();
  return users.some((user) => String(user.email || "").trim().toLowerCase() === normalized);
};

module.exports = {
  getAdminUsers,
  getSuperAdminUsers,
  getOperationalUsers,
  getAdminEmails,
  getSuperAdminEmails,
  getOperationalEmails,
  isAdminEmail,
  uniqueEmails,
};
