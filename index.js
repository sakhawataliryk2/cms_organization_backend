const express = require("express");
const nodemailer = require("nodemailer");
const bodyParser = require("body-parser");
const cors = require("cors");
require("dotenv").config();
const helmet = require("helmet");
const compression = require("compression");
const path = require("path");


// Check for required environment variables (only in production)
if (process.env.NODE_ENV === 'production') {
  const requiredEnvVars = ['JWT_SECRET', 'DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_DATABASE'];
  const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

  if (missingEnvVars.length > 0) {
    console.error('❌ Missing required environment variables:', missingEnvVars.join(', '));
    console.error('Please ensure all required environment variables are set in your Vercel deployment.');
    // Don't exit in production, just log the error
    console.error('Continuing with deployment but some features may not work properly.');
  }
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
const PlacementController = require("./controllers/placementController");
const TearsheetController = require("./controllers/tearsheetController");
const AdminDocumentController = require("./controllers/adminDocumentController");
const TransferController = require("./controllers/transferController");
const HiringManagerTransferController = require("./controllers/hiringManagerTransferController");
const JobSeekerTransferController = require("./controllers/jobSeekerTransferController");
const DeleteRequestController = require("./controllers/deleteRequestController");
const SharedDocumentController = require("./controllers/sharedDocumentController");
const BroadcastMessageController = require("./controllers/broadcastMessageController");
const HeaderConfigController = require("./controllers/headerConfigController");
const JobXMLController = require("./controllers/jobsXMLController");
// NEW IMPORTS
const OfficeController = require("./controllers/officeController");
const TeamController = require("./controllers/teamController");
const TemplateDocumentController = require("./controllers/templateDocumentController");
//OnBoarding
const OnboardingController = require("./controllers/onboardingController");
const createOnboardingRouter = require("./routes/onboardingRoutes");

const createAuthRouter = require("./routes/authRoutes");
const { createOrganizationRouter, createTransferRouter, createDeleteRequestRouter } = require("./routes/organizationRoutes");
const { createJobRouter, createJobDeleteRequestRouter } = require("./routes/jobRoutes");
const createJobXMLRouter = require("./routes/jobXMLRoutes");
const createJobSeekerRouter = require("./routes/jobSeekerRoutes");
const createHiringManagerRouter = require("./routes/hiringManagerRoutes");
const createHiringManagerTransferRouter = require("./routes/hiringManagerTransferRoutes");
const createJobSeekerTransferRouter = require("./routes/jobSeekerTransferRoutes");
const createCustomFieldRouter = require("./routes/customFieldRoutes");
const createUserRouter = require("./routes/userRoutes");
const { createLeadRouter, createLeadDeleteRequestRouter } = require("./routes/leadRoutes");
const { createTaskRouter, createTaskDeleteRequestRouter } = require("./routes/taskRoutes");
const { createPlacementRouter, createPlacementDeleteRequestRouter } = require("./routes/placementRoutes");
const createTearsheetRouter = require("./routes/tearsheetRoutes");
const createAdminDocumentRouter = require("./routes/adminDocumentRoutes");
const createSharedDocumentRouter = require("./routes/sharedDocumentRoutes");
const createBroadcastMessageRouter = require("./routes/broadcastMessageRoutes");
const createHeaderConfigRouter = require("./routes/headerConfigRoutes");
// NEW ROUTE IMPORTS
const createOfficeRouter = require("./routes/officeRoutes");
const createTeamRouter = require("./routes/teamRoutes");
const createTemplateDocumentsRouter = require("./routes/templateDocumentsRoutes");
const createScrapeRouter = require("./routes/scrapeRoutes");

const packetRoutes = require("./routes/packetRoutes");

// Job Sekker Portal
const jobseekerPortalAuthRoutes = require("./routes/jobseekerPortalAuthRoutes");
const jobseekerPortalDocumentsRoutes = require("./routes/jobseekerPortalDocumentsRoutes");

// Email Template
const EmailTemplateController = require("./controllers/emailTemplateController");

const { notFound, errorHandler } = require("./middleware/errorMiddleware");
const { sanitizeInputs } = require("./middleware/validationMiddleware");
const { verifyToken, checkRole } = require("./middleware/authMiddleware");
const createEmailTemplateRouter = require("./routes/emailTemplateRoutes");


// Create Express app
const app = express();
const port = process.env.PORT || 8080;

// Security headers
app.use(helmet());

// Compression to reduce payload size
app.use(compression());

// Enable CORS with specifi
const allowedOrigins = [
  'http://localhost:3000',  // Local development
  'https://ats-orcin.vercel.app',  // Production frontend
  'https://ats-software-frontend.vercel.app',  // Alternative production frontend
  'https://cms-organization.vercel.app',
  'https://cmsorganization.vercel.app',
  'https://cms-organization-phi.vercel.app'  // Current frontend domain
];

// Use environment variable for additional origins if needed
const additionalOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",")
  : [];

const allOrigins = [...allowedOrigins, ...additionalOrigins];

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
app.use(
  "/uploads",
  cors({
    origin: true,
    credentials: true,
  }),
  (req, res, next) => {
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    next();
  },
  express.static(path.join(process.cwd(), "uploads"), {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith(".pdf")) {
        res.setHeader("Content-Type", "application/pdf");
      }
    },
  })
);

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

const getJobXMLController = () => {
  return new JobXMLController(getPool());
};

const getHiringManagerController = () => {
  return new HiringManagerController(getPool());
};

const getOrganizationController = () => {
  return new OrganizationController(getPool());
};

const getTransferController = () => {
  return new TransferController(getPool());
};
const getHiringManagerTransferController = () => {
  return new HiringManagerTransferController(getPool());
};

const getJobSeekerTransferController = () => {
  return new JobSeekerTransferController(getPool());
};

const getDeleteRequestController = () => {
  return new DeleteRequestController(getPool());
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

const getPlacementController = () => {
  return new PlacementController(getPool());
};

const getTearsheetController = () => {
  return new TearsheetController(getPool());
};

const getAdminDocumentController = () => {
  return new AdminDocumentController(getPool());
};

const getSharedDocumentController = () => {
  return new SharedDocumentController(getPool());
};

const getBroadcastMessageController = () => {
  return new BroadcastMessageController(getPool());
};

const getHeaderConfigController = () => {
  return new HeaderConfigController(getPool());
};

// NEW CONTROLLER GETTERS
const getOfficeController = () => {
  return new OfficeController(getPool());
};

const getTeamController = () => {
  return new TeamController(getPool());
};
//OnBooarding
const getOnboardingController = () => {
  return new OnboardingController(getPool());
};
const getEmailTemplateController = () => {
  return new EmailTemplateController(getPool());
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

// Core tables (offices, teams, users) initialized once at startup to avoid connection exhaustion
let coreTablesInitialized = false;
let coreTablesInitPromise = null;

app.use(async (req, res, next) => {
  if (req.path.startsWith("/api/")) {
    try {
      // Initialize core tables once per process (not on every request)
      if (!coreTablesInitialized) {
        if (!coreTablesInitPromise) {
          coreTablesInitPromise = (async () => {
            const officeController = getOfficeController();
            await officeController.initTables();
            const teamController = getTeamController();
            await teamController.initTables();
            const authController = getAuthController();
            await authController.initTables();
            const jobXMLController = getJobXMLController();
            await jobXMLController.initTables();
            coreTablesInitialized = true;
            console.log("Core tables (offices, teams, users) initialized.");
          })();
        }
        await coreTablesInitPromise;
      }

      // Initialize organization tables (path-based, only when needed)
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

      // Initialize placement tables (depends on jobs and job_seekers)
      if (req.path.startsWith("/api/placements")) {
        const placementController = getPlacementController();
        await placementController.initTables();
      }

      // Initialize tearsheet tables
      if (req.path.startsWith("/api/tearsheets")) {
        const tearsheetController = getTearsheetController();
        await tearsheetController.initTables();
      }

      // Initialize transfer tables
      if (req.path.startsWith("/api/organizations/transfer")) {
        const transferController = getTransferController();
        await transferController.initTables();
      }
      // Initialize hiring manager transfer table
      if (req.path.startsWith("/api/hiring-managers/transfer")) {
        const HiringManagerTransfer = require("./models/hiringManagerTransfer");
        const hmTransferModel = new HiringManagerTransfer(getPool());
        await hmTransferModel.initTable();
      }
      // Initialize job seeker transfer table
      if (req.path.startsWith("/api/job-seekers/transfer")) {
        const JobSeekerTransfer = require("./models/jobSeekerTransfer");
        const jsTransferModel = new JobSeekerTransfer(getPool());
        await jsTransferModel.initTable();
      }

      // Initialize delete request tables
      if (req.path.includes("/delete-request") || req.path.match(/\/delete\/\d+\/(approve|deny)/)) {
        const deleteRequestController = getDeleteRequestController();
        await deleteRequestController.initTables();
      }

      // Initialize admin document tables
      if (req.path.startsWith("/api/admin/documents")) {
        const adminDocumentController = getAdminDocumentController();
        await adminDocumentController.initTables();
      }

      // Initialize shared document tables
      if (req.path.startsWith("/api/shared-documents")) {
        const sharedDocumentController = getSharedDocumentController();
        await sharedDocumentController.initTables();
      }

      // Initialize broadcast message tables
      if (req.path.startsWith("/api/broadcast-messages")) {
        const broadcastMessageController = getBroadcastMessageController();
        await broadcastMessageController.initTables();
      }

      // Initialize header config tables
      if (req.path.startsWith("/api/header-config")) {
        const headerConfigController = getHeaderConfigController();
        await headerConfigController.initTables();
      }
      if (req.path.startsWith("/api/template-documents")) {
        const templateController = new TemplateDocumentController(getPool());
        await templateController.initTables();
      }
      if (req.path.startsWith("/api/packets")) {
        const Packet = require("./models/Packet");
        const packetModel = new Packet(getPool());
        await packetModel.initTable();
      }
      // OnBoarding
      if (req.path.startsWith("/api/onboarding")) {
        const onboardingController = getOnboardingController();
        await onboardingController.initTables();
      }
      // Job Seeker Portal (login tables)
      if (req.path.startsWith("/api/jobseeker-portal")) {
        const JobseekerPortalAuthController = require("./controllers/jobseekerPortalAuthController");
        const c = new JobseekerPortalAuthController(getPool());
        await c.initTables();

        const Onboarding = require("./models/onboarding");
        const ob = new Onboarding(getPool());
        await ob.initTables();
      }
      // Initialize email template tables
      if (req.path.startsWith("/api/email-templates")) {
        const emailTemplateController = new EmailTemplateController(getPool());
        await emailTemplateController.initTables();
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

// Setup job XML routes
app.use("/api/jobs/xml", sanitizeInputs, (req, res, next) => {
  const router = createJobXMLRouter(getJobXMLController());
  router(req, res, next);
});

app.use("/api/users", sanitizeInputs, (req, res, next) => {
  const authMiddleware = { verifyToken: verifyToken(getPool()), checkRole };
  const router = createUserRouter(getUserController(), authMiddleware);
  router(req, res, next);
});

// Setup delete request routes FIRST (before main routes to avoid conflicts)
const applyDeleteRequestRoutes = (basePath) => {
  app.use(basePath, sanitizeInputs, (req, res, next) => {
    if (req.path.includes("/delete-request") || req.path.match(/\/delete\/\d+\/(approve|deny)/)) {
      const authMiddleware = { verifyToken: verifyToken(getPool()), checkRole };
      const router = createDeleteRequestRouter(
        getDeleteRequestController(),
        authMiddleware
      );
      router(req, res, next);
    } else {
      next();
    }
  });
};

applyDeleteRequestRoutes("/api/organizations");
applyDeleteRequestRoutes("/api/hiring-managers");
applyDeleteRequestRoutes("/api/job-seekers");
applyDeleteRequestRoutes("/api/jobs");
applyDeleteRequestRoutes("/api/leads");
applyDeleteRequestRoutes("/api/tasks");
applyDeleteRequestRoutes("/api/placements");

// Setup organization routes with authentication
app.use("/api/organizations", sanitizeInputs, (req, res, next) => {
  const authMiddleware = { verifyToken: verifyToken(getPool()), checkRole };
  const router = createOrganizationRouter(
    getOrganizationController(),
    authMiddleware
  );
  router(req, res, next);
});

// Setup transfer routes with authentication
app.use("/api/organizations/transfer", sanitizeInputs, (req, res, next) => {
  const authMiddleware = { verifyToken: verifyToken(getPool()), checkRole };
  const router = createTransferRouter(
    getTransferController(),
    authMiddleware
  );
  router(req, res, next);
});

// Hiring manager transfer routes (must be before /api/hiring-managers so /transfer is matched)
app.use("/api/hiring-managers/transfer", sanitizeInputs, (req, res, next) => {
  const authMiddleware = { verifyToken: verifyToken(getPool()), checkRole };
  const router = createHiringManagerTransferRouter(
    getHiringManagerTransferController(),
    authMiddleware
  );
  router(req, res, next);
});

// Setup delete request routes for jobs FIRST (before main routes to avoid conflicts)
app.use("/api/jobs", sanitizeInputs, (req, res, next) => {
  if (req.path.includes("/delete-request") || req.path.match(/\/delete\/\d+\/(approve|deny)/)) {
    const authMiddleware = { verifyToken: verifyToken(getPool()), checkRole };
    const router = createJobDeleteRequestRouter(
      getDeleteRequestController(),
      authMiddleware
    );
    router(req, res, next);
  } else {
    next();
  }
});

// Setup job routes with authentication
app.use("/api/jobs", sanitizeInputs, (req, res, next) => {
  const authMiddleware = { verifyToken: verifyToken(getPool()), checkRole };
  const router = createJobRouter(getJobController(), authMiddleware);
  router(req, res, next);
});

// Job seeker transfer routes (must be before /api/job-seekers so /transfer is matched)
app.use("/api/job-seekers/transfer", sanitizeInputs, (req, res, next) => {
  const authMiddleware = { verifyToken: verifyToken(getPool()), checkRole };
  const router = createJobSeekerTransferRouter(
    getJobSeekerTransferController(),
    authMiddleware
  );
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

// Setup delete request routes for leads FIRST (before main routes to avoid conflicts)
app.use("/api/leads", sanitizeInputs, (req, res, next) => {
  if (req.path.includes("/delete-request") || req.path.match(/\/delete\/\d+\/(approve|deny)/)) {
    const authMiddleware = { verifyToken: verifyToken(getPool()), checkRole };
    const router = createLeadDeleteRequestRouter(
      getDeleteRequestController(),
      authMiddleware
    );
    router(req, res, next);
  } else {
    next();
  }
});

app.use("/api/leads", sanitizeInputs, (req, res, next) => {
  const authMiddleware = { verifyToken: verifyToken(getPool()), checkRole };
  const router = createLeadRouter(getLeadController(), authMiddleware);
  router(req, res, next);
});

// Setup delete request routes for tasks FIRST (before main routes to avoid conflicts)
app.use("/api/tasks", sanitizeInputs, (req, res, next) => {
  if (req.path.includes("/delete-request") || req.path.match(/\/delete\/\d+\/(approve|deny)/)) {
    const authMiddleware = { verifyToken: verifyToken(getPool()), checkRole };
    const router = createTaskDeleteRequestRouter(
      getDeleteRequestController(),
      authMiddleware
    );
    router(req, res, next);
  } else {
    next();
  }
});

app.use("/api/tasks", sanitizeInputs, (req, res, next) => {
  const authMiddleware = { verifyToken: verifyToken(getPool()), checkRole };
  const router = createTaskRouter(getTaskController(), authMiddleware);
  router(req, res, next);
});

// Setup delete request routes for placements FIRST (before main routes to avoid conflicts)
app.use("/api/placements", sanitizeInputs, (req, res, next) => {
  if (req.path.includes("/delete-request") || req.path.match(/\/delete\/\d+\/(approve|deny)/)) {
    const authMiddleware = { verifyToken: verifyToken(getPool()), checkRole };
    const router = createPlacementDeleteRequestRouter(
      getDeleteRequestController(),
      authMiddleware
    );
    router(req, res, next);
  } else {
    next();
  }
});

app.use("/api/placements", sanitizeInputs, (req, res, next) => {
  const authMiddleware = { verifyToken: verifyToken(getPool()), checkRole };
  const router = createPlacementRouter(getPlacementController(), authMiddleware);
  router(req, res, next);
});

app.use("/api/tearsheets", sanitizeInputs, (req, res, next) => {
  const authMiddleware = { verifyToken: verifyToken(getPool()), checkRole };
  const router = createTearsheetRouter(getTearsheetController(), authMiddleware);
  router(req, res, next);
});

app.use("/api/admin/documents", sanitizeInputs, (req, res, next) => {
  const authMiddleware = { verifyToken: verifyToken(getPool()), checkRole };
  const router = createAdminDocumentRouter(getAdminDocumentController(), authMiddleware);
  router(req, res, next);
});

app.use("/api/shared-documents", sanitizeInputs, (req, res, next) => {
  const authMiddleware = { verifyToken: verifyToken(getPool()), checkRole };
  const router = createSharedDocumentRouter(getSharedDocumentController(), authMiddleware);
  router(req, res, next);
});

app.use("/api/broadcast-messages", sanitizeInputs, (req, res, next) => {
  const authMiddleware = { verifyToken: verifyToken(getPool()), checkRole };
  const router = createBroadcastMessageRouter(getBroadcastMessageController(), authMiddleware);
  router(req, res, next);
});

// Setup header config routes with authentication
app.use("/api/header-config", sanitizeInputs, (req, res, next) => {
  const authMiddleware = { verifyToken: verifyToken(getPool()), checkRole };
  const router = createHeaderConfigRouter(getHeaderConfigController(), authMiddleware);
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
app.use("/api/template-documents", sanitizeInputs, (req, res, next) => {
  const authMiddleware = { verifyToken: verifyToken(getPool()), checkRole };
  const router = createTemplateDocumentsRouter(getPool(), authMiddleware);
  router(req, res, next);
});
app.use("/api/packets", sanitizeInputs, (req, res, next) => {
  const authMiddleware = { verifyToken: verifyToken(getPool()), checkRole };
  const router = packetRoutes(getPool(), authMiddleware);
  router(req, res, next);
});
//ONbOARDING
app.use("/api/onboarding", sanitizeInputs, (req, res, next) => {
  const authMiddleware = { verifyToken: verifyToken(getPool()), checkRole };
  const router = createOnboardingRouter(
    getOnboardingController(),
    authMiddleware
  );
  router(req, res, next);
});
// Jobseeker Portal Auth Routes
app.use("/api/jobseeker-portal/auth", sanitizeInputs, (req, res, next) => {
  const router = jobseekerPortalAuthRoutes(getPool());
  router(req, res, next);
});

app.use("/api/jobseeker-portal", sanitizeInputs, (req, res, next) => {
  const router = jobseekerPortalDocumentsRoutes(getPool());
  router(req, res, next);
});
//Email Template
app.use("/api/email-templates", sanitizeInputs, (req, res, next) => {
  const router = createEmailTemplateRouter(getPool(), getEmailTemplateController());
  router(req, res, next);
});



// Setup scrape routes with authentication
app.use("/api/scrape", sanitizeInputs, (req, res, next) => {
  const authMiddleware = { verifyToken: verifyToken(getPool()), checkRole };
  const router = createScrapeRouter(getPool());
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

// Setup cleanup job scheduler (runs daily)
// Note: This requires node-cron package. Install with: npm install node-cron
try {
  const cron = require("node-cron");
  const { runArchiveCleanup } = require("./jobs/archiveCleanup");
  const TaskController = require("./controllers/taskController");
  const taskController = new TaskController(getPool());

  // Run cleanup job daily at 2 AM
  if (process.env.NODE_ENV !== "production" || process.env.ENABLE_CRON === "true") {
    cron.schedule("0 2 * * *", async () => {
      console.log("Running scheduled archive cleanup job...");
      try {
        await runArchiveCleanup(getPool());
      } catch (error) {
        console.error("Error running archive cleanup job:", error);
      }
    });
    console.log("Archive cleanup scheduler initialized (runs daily at 2 AM)");

    // Run task reminders every 5 minutes for better precision
    // This ensures reminders are sent within 5 minutes of the target time
    cron.schedule("*/5 * * * *", async () => {
      console.log("Running scheduled task reminder check...");
      try {
        // Create a mock request/response object for the controller method
        const mockReq = { user: { id: 1, role: "admin" } };
        const mockRes = {
          status: (code) => ({
            json: (data) => {
              console.log(`Task reminders processed: ${data.message || "completed"}`);
              return mockRes;
            }
          })
        };
        await taskController.processReminders(mockReq, mockRes);
      } catch (error) {
        console.error("Error running task reminder check:", error);
      }
    });
    console.log("Task reminder scheduler initialized (runs every 5 minutes)");
  }
} catch (error) {
  console.log("node-cron not available. Scheduled cleanup jobs will not run automatically.");
  console.log("To enable scheduled cleanup, install node-cron: npm install node-cron");
}

// Export for serverless
module.exports = app;