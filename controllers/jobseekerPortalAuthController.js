const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { sendMail } = require("../services/emailService");
const JobseekerPortalAccount = require("../models/jobseekerPortalAccount");

class JobseekerPortalAuthController {
  constructor(pool) {
    this.pool = pool;
    this.accountModel = new JobseekerPortalAccount(pool);

    this.initTables = this.initTables.bind(this);
    this.portalAuth = this.portalAuth.bind(this);

    this.login = this.login.bind(this);
    this.me = this.me.bind(this);
    this.logout = this.logout.bind(this);
    this.forgotPassword = this.forgotPassword.bind(this);
    this.adminSetPassword = this.adminSetPassword.bind(this);
  }

  async initTables() {
    const client = await this.pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS job_seeker_portal_accounts (
          id SERIAL PRIMARY KEY,
          job_seeker_id INTEGER NOT NULL UNIQUE REFERENCES job_seekers(id) ON DELETE CASCADE,
          email VARCHAR(255) NOT NULL,
          password_hash TEXT NOT NULL,
          must_reset_password BOOLEAN NOT NULL DEFAULT TRUE,
          created_by INTEGER REFERENCES users(id),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // optional: index for email lookups
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_job_seeker_portal_accounts_email
        ON job_seeker_portal_accounts (email)
      `);
    } finally {
      client.release();
    }
  }

  // middleware: verify portal jwt
  portalAuth(req, res, next) {
    try {
      const token =
        req.headers.authorization?.startsWith("Bearer ")
          ? req.headers.authorization.split(" ")[1]
          : null;

      if (!token) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }

      const payload = jwt.verify(token, process.env.JWT_SECRET);
      req.portalUser = payload; // { portal_account_id, job_seeker_id, email }
      next();
    } catch (e) {
      return res.status(401).json({ success: false, message: "Invalid token" });
    }
  }

  // POST /login
  async login(req, res) {
    const { email, password } = req.body;

    if (!email || !password) {
      return res
        .status(400)
        .json({ success: false, message: "email and password are required" });
    }

    const client = await this.pool.connect();
    try {
      const q = await client.query(
        `SELECT id, job_seeker_id, email, password_hash, must_reset_password
         FROM job_seeker_portal_accounts
         WHERE LOWER(email) = LOWER($1)
         LIMIT 1`,
        [String(email).trim()]
      );

      const row = q.rows[0];
      if (!row) {
        return res
          .status(401)
          .json({ success: false, message: "Invalid credentials" });
      }

      const ok = await bcrypt.compare(String(password), row.password_hash);
      if (!ok) {
        return res
          .status(401)
          .json({ success: false, message: "Invalid credentials" });
      }

      const token = jwt.sign(
        {
          portal_account_id: row.id,
          job_seeker_id: row.job_seeker_id,
          email: row.email,
          type: "JOBSEEKER_PORTAL",
        },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
      );

      return res.json({
        success: true,
        message: "Logged in",
        token,
        must_reset_password: row.must_reset_password,
      });
    } finally {
      client.release();
    }
  }

  // GET /me
  async me(req, res) {
    const client = await this.pool.connect();
    try {
      const { job_seeker_id } = req.portalUser;

      const js = await client.query(
        `SELECT id, email, first_name, last_name
         FROM job_seekers
         WHERE id=$1`,
        [Number(job_seeker_id)]
      );

      return res.json({ success: true, job_seeker: js.rows[0] || null });
    } finally {
      client.release();
    }
  }

  // POST /logout (client side token delete; server stateless)
  async logout(req, res) {
    return res.json({ success: true, message: "Logged out" });
  }

  // POST /forgot-password
  async forgotPassword(req, res) {
    const { email } = req.body;
    if (!email) {
      return res
        .status(400)
        .json({ success: false, message: "email is required" });
    }

    const client = await this.pool.connect();
    try {
      const q = await client.query(
        `SELECT id, job_seeker_id, email
         FROM job_seeker_portal_accounts
         WHERE LOWER(email) = LOWER($1)
         LIMIT 1`,
        [String(email).trim()]
      );

      const row = q.rows[0];

      // security: always return success (don’t reveal if user exists)
      if (!row) {
        return res.json({
          success: true,
          message: "If the email exists, a new password has been sent.",
        });
      }

      // generate new temp password
      const tempPassword = Math.random().toString(36).slice(-10);
      const hash = await bcrypt.hash(tempPassword, 10);

      await client.query(
        `UPDATE job_seeker_portal_accounts
         SET password_hash=$1, must_reset_password=true, updated_at=NOW()
         WHERE id=$2`,
        [hash, row.id]
      );

      const portalUrl =
  process.env.PORTAL_LOGIN_URL ||
  `${process.env.APP_PUBLIC_URL || "http://localhost:3000"}/job-seeker-portal/login`;



      await sendMail({
        to: row.email,
        subject: "Portal Password Reset",
        html: `
          <div>
            <p>Hello,</p>
            <p>Your portal password has been reset.</p>
            <p><b>Portal:</b> <a href="${portalUrl}">Login Here</a></p>
            <p><b>Username:</b> ${row.email}</p>
            <p><b>Temporary Password:</b> ${tempPassword}</p>
            <p>Please log in and change your password.</p>
          </div>
        `,
      });

      return res.json({
        success: true,
        message: "If the email exists, a new password has been sent.",
      });
    } finally {
      client.release();
    }
  }

  // POST /admin-set-password (CMS admin only: set job seeker portal password)
  async adminSetPassword(req, res) {
    const { email, temporaryPassword, jobSeekerId } = req.body;

    if (!temporaryPassword || (!email && !jobSeekerId)) {
      return res.status(400).json({
        success: false,
        message: "temporaryPassword and (email or jobSeekerId) are required",
      });
    }

    const jsId = jobSeekerId != null ? Number(jobSeekerId) : null;
    if (jsId == null || Number.isNaN(jsId)) {
      return res.status(400).json({
        success: false,
        message: "Valid jobSeekerId is required",
      });
    }

    try {
      const updated = await this.accountModel.setPassword({
        job_seeker_id: jsId,
        newPassword: String(temporaryPassword),
        must_reset_password: true,
      });

      if (!updated) {
        return res.status(404).json({
          success: false,
          message:
            "No job seeker portal account found for this job seeker. Create the portal account first (e.g. via onboarding).",
        });
      }

      return res.json({
        success: true,
        message: "Temporary password has been set.",
      });
    } catch (err) {
      console.error("adminSetPassword error:", err);
      return res.status(500).json({
        success: false,
        message: err.message || "Failed to set password",
      });
    }
  }
}

module.exports = JobseekerPortalAuthController;
