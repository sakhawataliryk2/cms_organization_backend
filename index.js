const express = require("express");
const nodemailer = require("nodemailer");
const bodyParser = require("body-parser");
const cors = require("cors");
require("dotenv").config();
const helmet = require("helmet");
const compression = require("compression");

// Check for required environment variables
const requiredEnvVars = ['JWT_SECRET', 'DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_DATABASE'];
const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

if (missingEnvVars.length > 0) {
  console.error('❌ Missing required environment variables:', missingEnvVars.join(', '));
  console.error('Please ensure all required environment variables are set in your Vercel deployment.');
  process.exit(1);
}

// Import custom modules
const { createPool, testDatabaseConnection } = require("./config/database");
const AuthController = require("./controllers/authController");
const OrganizationController = require("./controllers/organizationController");
const JobController = require("./controllers/jobController");
const JobSeekerController = require("./controllers/jobSeekerController");
const HiringManagerController = require("./controllers/hiringManagerController");
const CustomFieldController = require("./controllers/customFieldController");
const UserController = require("./controllers/userController");
const LeadController = require("./controllers/leadController");
const TaskController = require("./controllers/taskController");
// NEW IMPORTS
const OfficeController = require("./controllers/officeController");
const TeamController = require("./controllers/teamController");

const createAuthRouter = require("./routes/authRoutes");
const createOrganizationRouter = require("./routes/organizationRoutes");
const createJobRouter = require("./routes/jobRoutes");
const createJobSeekerRouter = require("./routes/jobSeekerRoutes");
const createHiringManagerRouter = require("./routes/hiringManagerRoutes");
const createCustomFieldRouter = require("./routes/customFieldRoutes");
const createUserRouter = require("./routes/userRoutes");
const createLeadRouter = require("./routes/leadRoutes");
const createTaskRouter = require("./routes/taskRoutes");
// NEW ROUTE IMPORTS
const createOfficeRouter = require("./routes/officeRoutes");
const createTeamRouter = require("./routes/teamRoutes");

const { notFound, errorHandler } = require("./middleware/errorMiddleware");
const { sanitizeInputs } = require("./middleware/validationMiddleware");
const { verifyToken, checkRole } = require("./middleware/authMiddleware");

// Create Express app
const app = express();
const port = process.env.PORT || 8080;

// Security headers
app.use(helmet());

// Compression to reduce payload size
app.use(compression());

// Enable CORS with specific options
const allowedOrigins = [
  'http://localhost:3000',  // Local development
  'https://ats-orcin.vercel.app',  // Production frontend
  'https://ats-software-frontend.vercel.app',  // Alternative production frontend
  'https://cms-organization.vercel.app'  // Current frontend domain
];

// Use environment variable for additional origins if needed
const additionalOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",")
  : [];

const allOrigins = [...allowedOrigins, ...additionalOrigins];

// CORS configuration with error handling
try {
  app.use(
    cors({
      origin: process.env.NODE_ENV === "production" ? allOrigins : true,
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
      credentials: true,
    })
  );
} catch (error) {
  console.error("CORS configuration error:", error);
  // Fallback to basic CORS
  app.use(cors());
}

// Parse request bodies with increased limits
app.use(bodyParser.json({ limit: "1mb" }));
app.use(bodyParser.urlencoded({ extended: false, limit: "1mb" }));

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    console.log(
      `${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`
    );
  });
  next();
});

// Create database pool - lazy initialization for serverless
let pool;
const getPool = () => {
  if (!pool) {
    pool = createPool();
  }
  return pool;
};

// Initialize controllers with lazy DB connection
const getAuthController = () => {
  return new AuthController(getPool());
};

const getHiringManagerController = () => {
  return new HiringManagerController(getPool());
};

const getOrganizationController = () => {
  return new OrganizationController(getPool());
};

const getJobController = () => {
  return new JobController(getPool());
};

const getUserController = () => {
  return new UserController(getPool());
};

const getJobSeekerController = () => {
  return new JobSeekerController(getPool());
};

const getCustomFieldController = () => {
  return new CustomFieldController(getPool());
};

const getLeadController = () => {
  return new LeadController(getPool());
};

const getTaskController = () => {
  return new TaskController(getPool());
};

// NEW CONTROLLER GETTERS
const getOfficeController = () => {
  return new OfficeController(getPool());
};

const getTeamController = () => {
  return new TeamController(getPool());
};

// Setup nodemailer with a connection pool
// const transporter = nodemailer.createTransporter({
//   pool: true,
//   maxConnections: 5, // Reduced for serverless environment
//   maxMessages: 100, // Limit for serverless
//   host: process.env.SMTP_HOST,
//   port: process.env.SMTP_PORT,
//   secure: process.env.SMTP_SECURE === 'true',
//   auth: {
//     user: process.env.SMTP_USER,
//     pass: process.env.SMTP_PASS
//   }
// });

app.use(async (req, res, next) => {
  if (req.path.startsWith("/api/")) {
    try {
      // Initialize core tables first (offices and teams before users)
      const officeController = getOfficeController();
      await officeController.initTables();

      const teamController = getTeamController();
      await teamController.initTables();

      // Initialize user tables (depends on offices and teams)
      const authController = getAuthController();
      await authController.initTables();

      // Initialize organization tables
      if (req.path.startsWith("/api/organizations")) {
        const organizationController = getOrganizationController();
        await organizationController.initTables();
      }

      // Initialize hiring manager tables
      if (req.path.startsWith("/api/hiring-managers")) {
        const hiringManagerController = getHiringManagerController();
        await hiringManagerController.initTables();
      }

      // Initialize job tables
      if (req.path.startsWith("/api/jobs")) {
        const jobController = getJobController();
        await jobController.initTables();
      }

      // Initialize job seeker tables
      if (req.path.startsWith("/api/job-seekers")) {
        const jobSeekerController = getJobSeekerController();
        await jobSeekerController.initTables();
      }

      // Initialize custom field tables
      if (req.path.startsWith("/api/custom-fields")) {
        const customFieldController = getCustomFieldController();
        await customFieldController.initTables();
      }

      // Initialize lead tables
      if (req.path.startsWith("/api/leads")) {
        const leadController = getLeadController();
        await leadController.initTables();
      }

      // Initialize task tables
      if (req.path.startsWith("/api/tasks")) {
        const taskController = getTaskController();
        await taskController.initTables();
      }
    } catch (error) {
      console.error("Failed to initialize tables:", error.message);
      // Continue anyway - tables might already exist
    }
  }
  next();
});

// Setup routes with lazy controller initialization
app.use("/api/auth", sanitizeInputs, (req, res, next) => {
  const router = createAuthRouter(getAuthController());
  router(req, res, next);
});

app.use("/api/users", sanitizeInputs, (req, res, next) => {
  const authMiddleware = { verifyToken: verifyToken(getPool()), checkRole };
  const router = createUserRouter(getUserController(), authMiddleware);
  router(req, res, next);
});

// Setup organization routes with authentication
app.use("/api/organizations", sanitizeInputs, (req, res, next) => {
  const authMiddleware = { verifyToken: verifyToken(getPool()), checkRole };
  const router = createOrganizationRouter(
    getOrganizationController(),
    authMiddleware
  );
  router(req, res, next);
});

// Setup job routes with authentication
app.use("/api/jobs", sanitizeInputs, (req, res, next) => {
  const authMiddleware = { verifyToken: verifyToken(getPool()), checkRole };
  const router = createJobRouter(getJobController(), authMiddleware);
  router(req, res, next);
});

// Setup job seeker routes with authentication
app.use("/api/job-seekers", sanitizeInputs, (req, res, next) => {
  const authMiddleware = { verifyToken: verifyToken(getPool()), checkRole };
  const router = createJobSeekerRouter(
    getJobSeekerController(),
    authMiddleware
  );
  router(req, res, next);
});

// Setup hiring manager routes with authentication
app.use("/api/hiring-managers", sanitizeInputs, (req, res, next) => {
  const authMiddleware = { verifyToken: verifyToken(getPool()), checkRole };
  const router = createHiringManagerRouter(
    getHiringManagerController(),
    authMiddleware
  );
  router(req, res, next);
});

// Setup custom field routes with authentication
app.use("/api/custom-fields", sanitizeInputs, (req, res, next) => {
  const authMiddleware = { verifyToken: verifyToken(getPool()), checkRole };
  const router = createCustomFieldRouter(
    getCustomFieldController(),
    authMiddleware
  );
  router(req, res, next);
});

app.use("/api/leads", sanitizeInputs, (req, res, next) => {
  const authMiddleware = { verifyToken: verifyToken(getPool()), checkRole };
  const router = createLeadRouter(getLeadController(), authMiddleware);
  router(req, res, next);
});

app.use("/api/tasks", sanitizeInputs, (req, res, next) => {
  const authMiddleware = { verifyToken: verifyToken(getPool()), checkRole };
  const router = createTaskRouter(getTaskController(), authMiddleware);
  router(req, res, next);
});

// NEW ROUTE SETUPS
app.use("/api/offices", sanitizeInputs, (req, res, next) => {
  const authMiddleware = { verifyToken: verifyToken(getPool()), checkRole };
  const router = createOfficeRouter(getOfficeController(), authMiddleware);
  router(req, res, next);
});

app.use("/api/teams", sanitizeInputs, (req, res, next) => {
  const authMiddleware = { verifyToken: verifyToken(getPool()), checkRole };
  const router = createTeamRouter(getTeamController(), authMiddleware);
  router(req, res, next);
});

// Database connection test
app.get("/test-db", async (req, res) => {
  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const result = await client.query("SELECT NOW()");
      res.json({ success: true, time: result.rows[0].now });
    } finally {
      client.release(); // Always release the client back to the pool
    }
  } catch (err) {
    console.error("Database query error:", err);
    res.status(500).json({ success: false, error: "Database error" });
  }
});

// app.get("/test", async (req, res) => {
//   try {
//     const pool = getPool();
//     const client = await pool.connect();
//     try {
//       const result = await client.query("SELECT NOW()");
//       res.json({ success: true, time: result.rows[0].now });
//     } finally {
//       client.release();
//     }
//   } catch (err) {
//     console.error("Database query error:", err);
//     res.status(500).json({ success: false, error: "Database error" });
//   }
// });

// Add 404 middleware
app.use(notFound);

// Error handling middleware
app.use(errorHandler);

// For local development
if (process.env.NODE_ENV !== "production") {
  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
}

// Export for serverless
module.exports = app;
