// controllers/onboardingController.js
const Onboarding = require("../models/onboarding");
const { sendMail } = require("../services/emailService");

function esc(s = "") {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function internalEmailHtml({ jobSeekerName, sentBy, docs }) {
  const list = docs.map((d) => `<li>${esc(d)}</li>`).join("");
  return `
    <div>
      <p>Hello</p>
      <p>The documents for <b>Job Seeker ${esc(jobSeekerName || "")}</b> have been sent for onboarding.</p>
      <p><b>Documents:</b></p>
      <ul>${list}</ul>
      <p>These were sent by <b>${esc(sentBy || "")}</b>.</p>
    </div>
  `;
}

function jobSeekerEmailHtmlFirstTime({ portalUrl, username, tempPassword }) {
  return `
    <div>
      <p>Hello,</p>
      <p>You have onboarding documents that are awaiting your submission.</p>
      <p><b>Portal:</b> <a href="${portalUrl}">WEBSITE</a></p>
      <p><b>Username:</b> ${esc(username)}</p>
      <p><b>Temporary Password:</b> ${esc(tempPassword)}</p>
      <p>Please log in and complete your documents.</p>
      <p>
        Best Regards,<br/>
        Complete Staffing Solutions, Inc.<br/><br/>
        <a href="https://www.completestaffingsolutions.com">www.completestaffingsolutions.com</a>
      </p>
    </div>
  `;
}

function jobSeekerEmailHtmlRepeat({ portalUrl }) {
  return `
    <div>
      <p>Hello,</p>
      <p>You have onboarding documents that are awaiting your submission.</p>
      <p>
        Please log into <a href="${portalUrl}">WEBSITE</a> to complete your documents.
        Your username is the email address you received this email to.
        If you forgot your password, please use the forgot password link.
      </p>
      <p>
        Best Regards,<br/>
        Complete Staffing Solutions, Inc.<br/><br/>
        <a href="https://www.completestaffingsolutions.com">www.completestaffingsolutions.com</a>
      </p>
    </div>
  `;
}

class OnboardingController {
  constructor(pool) {
    this.pool = pool;
    this.onboardingModel = new Onboarding(pool);
  }

  async initTables() {
    return this.onboardingModel.initTables();
  }

  // POST /api/onboarding/send
  send = async (req, res, next) => {
    try {
      const { job_seeker_id, packet_ids = [], document_ids = [] } = req.body;

      if (!job_seeker_id) {
        return res.status(400).json({ success: false, message: "job_seeker_id is required" });
      }

      const senderUserId = req.user?.id || null;
      const senderName =
        req.user?.name || req.user?.full_name || req.user?.email || "System";

      // Load job seeker
      const client = await this.pool.connect();
      let jobSeeker;
      try {
        const js = await client.query(
          `SELECT id, email, first_name, last_name FROM job_seekers WHERE id=$1`,
          [Number(job_seeker_id)]
        );
        jobSeeker = js.rows[0];
      } finally {
        client.release();
      }

      if (!jobSeeker?.email) {
        return res.status(400).json({ success: false, message: "Job seeker email missing" });
      }

      const jobSeekerName = `${jobSeeker.first_name || ""} ${jobSeeker.last_name || ""}`.trim();

      // Resolve docs from packets + direct docs
      const templateDocIds = await this.onboardingModel.resolveTemplateDocIds({
        packet_ids: Array.isArray(packet_ids) ? packet_ids : [],
        document_ids: Array.isArray(document_ids) ? document_ids : [],
      });

      if (!templateDocIds.length) {
        return res.status(400).json({ success: false, message: "No documents found in selection" });
      }

      // FIRST TIME?
      const alreadySentBefore = await this.onboardingModel.hasAnySend(Number(job_seeker_id));
      const isFirstTime = !alreadySentBefore;

            // Create portal account ONLY first time
        let tempPassword = null;

      if (isFirstTime) {
        console.log("Creating portal account for job seeker:", job_seeker_id);

        const portal = await this.onboardingModel.getOrCreatePortalAccount({
          job_seeker_id: Number(job_seeker_id),
          email: jobSeeker.email,
          created_by: senderUserId,
        });

        console.log("PORTAL ACCOUNT:", portal);  

        tempPassword = portal.tempPassword;
        console.log("Temporary password received:", tempPassword);
      }



      // Create send log
      const sendRow = await this.onboardingModel.createSend({
        job_seeker_id: Number(job_seeker_id),
        recipient_email: jobSeeker.email,
        created_by: senderUserId,
        template_document_ids: templateDocIds,
      });

      const details = await this.onboardingModel.getSendDetails(sendRow.id);
      const docNames = (details?.items || []).map((x) => x.document_name);

      const portalUrl =
      process.env.PORTAL_LOGIN_URL ||
      `${process.env.APP_PUBLIC_URL}/job-seeker-portal/login`;
      console.log('portalUrl');

      // Internal recipients
      const internalList = (process.env.INTERNAL_ONBOARDING_EMAILS || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      // 1) Internal email
      if (internalList.length) {
        await sendMail({
          to: internalList.join(","),
          subject: "Document Sent",
          html: internalEmailHtml({
            jobSeekerName,
            sentBy: senderName,
            docs: docNames,
          }),
        });
      }

      // 2) Job seeker email
      if (isFirstTime) {
        await sendMail({
          to: jobSeeker.email,
          subject: "Onboarding Documents - Portal Access",
          html: jobSeekerEmailHtmlFirstTime({
            portalUrl,
            username: jobSeeker.email,
            tempPassword: tempPassword || "Use Forgot Password",
          }),
        });
      } else {
        await sendMail({
          to: jobSeeker.email,
          subject: "Onboarding Documents",
          html: jobSeekerEmailHtmlRepeat({ portalUrl }),
        });
      }

      return res.json({
        success: true,
        message: "Onboarding sent",
        send_id: sendRow.id,
        recipient: jobSeeker.email,
        first_time: isFirstTime,
        items: (details?.items || []).map((i) => ({
          id: i.id,
          document_name: i.document_name,
          status: i.status,
        })),
      });
    } catch (err) {
      next(err);
    }
  };

  // GET /api/onboarding/job-seekers/:id
  getForJobSeeker = async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const items = await this.onboardingModel.listForJobSeeker(id);
      return res.json({ success: true, items });
    } catch (err) {
      next(err);
    }
  };
}

module.exports = OnboardingController;
