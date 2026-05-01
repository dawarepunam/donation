const express = require("express");
const cors = require("cors");
const path = require("path");
const http = require("http");
const socketIo = require("socket.io");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const connectDB = require("./config/db");
const { ensureAdminAccount, ensureSuperAdminAccount } = require("./utils/bootstrapAdmin");
const { syncAllUsersDonorRecords } = require("./utils/userDonorSync");
const { startAccountDeletionWorker } = require("./utils/accountDeletion");
const { processScheduledCampaigns } = require("./controllers/marketingController");

const app = express();
const server = http.createServer(app);

const io = socketIo(server, {
  cors: {
    origin: process.env.CLIENT_URL || true,
    methods: ["GET", "POST", "PUT"],
  },
});

connectDB()
  .then(async () => {
    await ensureSuperAdminAccount();
    await ensureAdminAccount();
    const syncResult = await syncAllUsersDonorRecords();
    startAccountDeletionWorker();
    setInterval(() => {
      processScheduledCampaigns().catch((error) => {
        console.error("Marketing scheduler failed:", error.message);
      });
    }, 60 * 1000);
    console.log(`Donor sync completed for ${syncResult.syncedUsers} users`);
  })
  .catch(() => {});

app.use(
  cors({
    origin: process.env.CLIENT_URL || true,
  })
);
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use(express.static(path.join(__dirname, "..", "client")));

io.on("connection", (socket) => {
  console.log("Socket connected:", socket.id);

  socket.on("disconnect", () => {
    console.log("Socket disconnected:", socket.id);
  });
});

app.set("io", io);

app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/campaign", require("./routes/campaignRoutes"));
app.use("/api/donation", require("./routes/donationRoutes"));
app.use("/api/admin", require("./routes/adminRoutes"));
app.use("/api/superadmin", require("./routes/superAdminRoutes"));
app.use("/api/subscription", require("./routes/subscriptionRoutes"));
app.use("/api/marketing", require("./routes/marketingRoutes"));

const superAdminPages = {
  "/superadmin/login": "superadmin-login.html",
  "/superadmin/dashboard": "superadmin-dashboard.html",
  "/superadmin/admins": "superadmin-admins.html",
  "/superadmin/admins/add": "superadmin-admin-form.html",
  "/superadmin/campaigns": "superadmin-campaigns.html",
  "/superadmin/users": "superadmin-users.html",
  "/superadmin/donations": "superadmin-donations.html",
  "/superadmin/subscriptions": "superadmin-subscriptions.html",
  "/superadmin/certificates": "superadmin-certificates.html",
  "/superadmin/analytics": "superadmin-analytics.html",
  "/superadmin/settings": "superadmin-settings.html",
  "/superadmin/settings/profile": "superadmin-profile.html",
  "/superadmin/settings/system": "superadmin-system.html",
  "/superadmin/settings/security": "superadmin-security.html",
  "/superadmin/marketing": "superadmin-marketing.html",
  "/superadmin/marketing/add": "superadmin-marketing-form.html",
  "/superadmin/marketing/activity": "superadmin-marketing-activity.html",
};

const marketingPages = {
  "/marketing/login": "marketing-login.html",
  "/marketing/dashboard": "marketing-dashboard.html",
  "/marketing/donors": "marketing-donors.html",
  "/marketing/campaigns": "marketing-campaigns.html",
  "/marketing/impact": "marketing-impact.html",
  "/marketing/settings": "marketing-settings.html",
  "/marketing/settings/profile": "marketing-profile.html",
  "/marketing/settings/security": "marketing-security.html",
};

const adminPages = {
  "/admin/dashboard": "admin-dashboard.html",
  "/admin/create-campaign": "admin-create-campaign.html",
  "/admin/campaigns": "admin-campaigns.html",
  "/admin/donations": "admin-donations.html",
  "/admin/subscriptions": "admin-subscriptions.html",
  "/admin/reports": "admin-reports.html",
  "/admin/settings": "admin-settings.html",
  "/admin/settings/profile": "admin-profile.html",
  "/admin/settings/security": "admin-security.html",
  "/admin/settings/notifications": "admin-notifications.html",
};

const resolvePanelPage = (requestPath) => {
  if (superAdminPages[requestPath]) {
    return superAdminPages[requestPath];
  }

  if (adminPages[requestPath]) {
    return adminPages[requestPath];
  }

  if (marketingPages[requestPath]) {
    return marketingPages[requestPath];
  }

  if (/^\/superadmin\/admins\/edit\/[^/]+$/.test(requestPath)) {
    return "superadmin-admin-form.html";
  }

  if (/^\/superadmin\/users\/[^/]+$/.test(requestPath)) {
    return "superadmin-user-detail.html";
  }

  if (/^\/superadmin\/marketing\/edit\/[^/]+$/.test(requestPath)) {
    return "superadmin-marketing-form.html";
  }

  return null;
};

Object.entries(superAdminPages).forEach(([routePath, fileName]) => {
  app.get(routePath, (req, res) => {
    res.sendFile(path.join(__dirname, "..", "client", fileName));
  });
});

Object.entries(adminPages).forEach(([routePath, fileName]) => {
  app.get(routePath, (req, res) => {
    res.sendFile(path.join(__dirname, "..", "client", fileName));
  });
});

Object.entries(marketingPages).forEach(([routePath, fileName]) => {
  app.get(routePath, (req, res) => {
    res.sendFile(path.join(__dirname, "..", "client", fileName));
  });
});

app.get("/superadmin/admins/edit/:id", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "client", "superadmin-admin-form.html"));
});

app.get("/superadmin/users/:id", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "client", "superadmin-user-detail.html"));
});

app.get("/superadmin/marketing/edit/:id", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "client", "superadmin-marketing-form.html"));
});

app.get("/api/health", (req, res) => {
  res.json({ ok: true, message: "NGO donation platform is running" });
});

app.use((req, res) => {
  const panelPage = resolvePanelPage(req.path);
  if (panelPage) {
    return res.sendFile(path.join(__dirname, "..", "client", panelPage));
  }

  res.sendFile(path.join(__dirname, "..", "client", "index.html"));
});

const DEFAULT_PORT = Number(process.env.PORT || 5000);
const MAX_PORT_ATTEMPTS = 10;

const startServer = (port, attempt = 0) => {
  server
    .listen(port, () => {
      console.log(`Server running on port ${port}`);
    })
    .on("error", (error) => {
      if (error.code === "EADDRINUSE" && attempt < MAX_PORT_ATTEMPTS) {
        const nextPort = port + 1;
        console.warn(`Port ${port} is busy. Retrying on port ${nextPort}...`);
        server.removeAllListeners("error");
        startServer(nextPort, attempt + 1);
        return;
      }

      throw error;
    });
};

startServer(DEFAULT_PORT);
