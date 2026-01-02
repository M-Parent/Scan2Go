require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const db = require("./db"); // db object (has closeConnection attached)
const projectRoutes = require("./routes/projectRoutes");
const sectionsRoutes = require("./routes/sectionsRoutes");
const filesRoutes = require("./routes/filesRoutes");
const logger = require("./logger");

const app = express();
const port = 6301;

// Middleware
// Allow multiple frontend origins via env `FRONTEND_URLS` (comma-separated)
// Fallback to localhost:3000 and localhost:3005 for local dev
const rawFrontends =
  process.env.FRONTEND_URLS ||
  process.env.FRONTEND_URL ||
  "http://localhost:3000,http://10.0.20.11:3005";
const whitelist = rawFrontends
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (e.g., mobile apps, curl)
    if (!origin) return callback(null, true);
    // In non-production allow all origins for local development
    if (process.env.NODE_ENV !== "production") {
      return callback(null, true);
    }
    if (whitelist.indexOf(origin) !== -1) {
      return callback(null, true);
    }
    // Not allowed
    return callback(new Error("CORS: Origin not allowed"), false);
  },
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Routes
app.use("/api/projects", projectRoutes);
app.use("/api/sections", sectionsRoutes);
app.use("/api/uploadFile", filesRoutes);

// Global error handler middleware
app.use((err, req, res, next) => {
  console.error("Global error:", err);
  res.status(500).json({ error: "An error occurred." });
});

// Server shutdown and database connection cleanup
process.on("SIGINT", () => {
  logger.info("Shutting down server...");
  if (typeof db.closeConnection === "function") db.closeConnection();
  process.exit(0);
});

// Démarrage du serveur - Listen on all interfaces (0.0.0.0)
app.listen(port, "0.0.0.0", () => {
  logger.info(`Server running on 0.0.0.0:${port}`);
});
