const Onboarding = require("./onboardingController");
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
      <p>The documents for <b>Job Seeker ${esc(
        jobSeekerName || ""
      )}</b> have been sent for on boarding</p>
      <p><b>Documents:</b></p>
      <ul>${list}</ul>
      <p>These were sent by <b>${esc(sentBy || "")}</b>.</p>
    </div>
  `;
}

function jobSeekerEmailHtml({ portalUrl }) {
  return `
    <div>
      <p>Hello,</p>
      <p>You have documents that are awaiting your submission.</p>
      <p>If you have any questions, please contact your representative.</p>
      <p>
        Please log into <a href="${portalUrl}">WEBSITE</a> to complete your documents.
        Your username is the email address you received this email to.
        If you do not know or have forgotten your password please click the forgot password link.
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
        return res
          .status(400)
          .json({ success: false, message: "job_seeker_id is required" });
      }

      // who is sending
      const senderUserId = req.user?.id || null;

      // Load job seeker
      const client = await this.pool.connect();
      let jobSeeker;
      let senderName = "System";
      try {
        const js = await client.query(
          `SELECT id, name, email FROM job_seekers WHERE id=$1`,
          [Number(job_seeker_id)]
        );
        jobSeeker = js.rows[0];

        if (!jobSeeker?.email) {
          return res
            .status(400)
            .json({ success: false, message: "Job seeker email missing" });
        }

        if (senderUserId) {
          const u = await client.query(
            `SELECT id, name FROM users WHERE id=$1`,
            [senderUserId]
          );
          senderName = u.rows[0]?.name || senderName;
        }
      } finally {
        client.release();
      }

      // Resolve docs from packets + direct docs
      const templateDocIds = await this.onboardingModel.resolveTemplateDocIds({
        packet_ids: Array.isArray(packet_ids) ? packet_ids : [],
        document_ids: Array.isArray(document_ids) ? document_ids : [],
      });

      if (!templateDocIds.length) {
        return res
          .status(400)
          .json({ success: false, message: "No documents found in selection" });
      }

      // Create log in DB
      const sendRow = await this.onboardingModel.createSend({
        job_seeker_id: Number(job_seeker_id),
        recipient_email: jobSeeker.email,
        created_by: senderUserId,
        template_document_ids: templateDocIds,
      });

      const details = await this.onboardingModel.getSendDetails(sendRow.id);
      const docNames = (details?.items || []).map((x) => x.document_name);

      // Portal URL placeholder (portal later)
      const appUrl = process.env.APP_PUBLIC_URL || "http://localhost:3000";
      const portalUrl = `${appUrl}/portal/login`;

      // Internal recipients
      const internalList = (process.env.INTERNAL_ONBOARDING_EMAILS || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      // 1) Send internal email
      if (internalList.length) {
        await sendMail({
          to: internalList.join(","),
          subject: "Document Sent",
          html: internalEmailHtml({
            jobSeekerName: jobSeeker.name || "",
            sentBy: senderName,
            docs: docNames,
          }),
        });
      }

      // 2) Send job seeker email
      await sendMail({
        to: jobSeeker.email,
        subject: "Onboarding Documents",
        html: jobSeekerEmailHtml({ portalUrl }),
      });

      return res.json({
        success: true,
        message: "Onboarding sent",
        send_id: sendRow.id,
        recipient: jobSeeker.email,
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
