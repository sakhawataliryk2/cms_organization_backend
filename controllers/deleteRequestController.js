const DeleteRequest = require("../models/deleteRequest");
const Organization = require("../models/organization");
const HiringManager = require("../models/hiringManager");
const nodemailer = require("nodemailer");

class DeleteRequestController {
  constructor(pool) {
    this.deleteRequestModel = new DeleteRequest(pool);
    this.organizationModel = new Organization(pool);
    this.hiringManagerModel = new HiringManager(pool);
    this.create = this.create.bind(this);
    this.approve = this.approve.bind(this);
    this.deny = this.deny.bind(this);
    this.getByRecord = this.getByRecord.bind(this);
  }

  async initTables() {
    await this.deleteRequestModel.initTable();
  }

  // Email transporter setup
  getEmailTransporter() {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.office365.com",
      port: parseInt(process.env.SMTP_PORT || "587"),
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  async create(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Authentication required",
        });
      }

      const { id } = req.params; // organization ID
      const { reason, record_type, record_number, requested_by, requested_by_email } = req.body;

      if (!reason || !reason.trim()) {
        return res.status(400).json({
          success: false,
          message: "Reason for deletion is required",
        });
      }

      // Check if there's already a pending request
      const existingRequest = await this.deleteRequestModel.getByRecord(id, record_type || "organization");
      if (existingRequest && existingRequest.status === "pending") {
        return res.status(400).json({
          success: false,
          message: "A delete request is already pending for this record",
        });
      }

      // Get user info
      const client = await this.organizationModel.pool.connect();
      let user = {};
      try {
        const userQuery = await client.query(
          "SELECT name, email FROM users WHERE id = $1",
          [userId]
        );
        user = userQuery.rows[0] || {};
      } finally {
        client.release();
      }

      // Create delete request
      const deleteRequest = await this.deleteRequestModel.create({
        record_id: id,
        record_type: record_type || "organization",
        record_number: record_number || null,
        requested_by: userId,
        requested_by_name: requested_by || user.name || "Unknown",
        requested_by_email: requested_by_email || user.email || "",
        reason: reason.trim(),
      });

      // Send email notification to payroll
      try {
        await this.sendDeleteRequestEmail(deleteRequest, {
          name: requested_by || user.name || "Unknown",
          email: requested_by_email || user.email || "",
        });
      } catch (emailError) {
        console.error("Error sending delete request email:", emailError);
        // Don't fail the request if email fails
      }

      return res.status(201).json({
        success: true,
        message: "Delete request created successfully",
        deleteRequest,
      });
    } catch (error) {
      console.error("Error creating delete request:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to create delete request",
        error: process.env.NODE_ENV === "production" ? undefined : error.message,
      });
    }
  }

  async sendDeleteRequestEmail(deleteRequest, requester) {
    const transporter = this.getEmailTransporter();
    const baseUrl = process.env.FRONTEND_URL || "http://localhost:3000";

    // Determine path based on record type
    let recordPath = "organizations";
    if (deleteRequest.record_type === "hiring_manager") {
      recordPath = "hiring-managers";
    }

    const approveUrl = `${baseUrl}/dashboard/${recordPath}/delete/${deleteRequest.id}/approve`;
    const denyUrl = `${baseUrl}/dashboard/${recordPath}/delete/${deleteRequest.id}/deny`;

    const mailOptions = {
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: "payroll@completestaffingsolutions.com",
      subject: `Delete Request: ${deleteRequest.record_type} ${deleteRequest.record_number || deleteRequest.record_id}`,
      html: `
        <h2>Delete Request</h2>
        <p>A delete request has been submitted:</p>
        <ul>
          <li><strong>Requested By:</strong> ${requester.name} (${requester.email})</li>
          <li><strong>Record Type:</strong> ${deleteRequest.record_type}</li>
          <li><strong>Record Number:</strong> ${deleteRequest.record_number || deleteRequest.record_id}</li>
          <li><strong>Reason:</strong> ${deleteRequest.reason}</li>
          <li><strong>Request Date:</strong> ${new Date(deleteRequest.created_at).toLocaleString()}</li>
        </ul>
        <p>Please review and approve or deny this deletion:</p>
        <p>
          <a href="${approveUrl}" style="background-color: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; margin-right: 10px;">Approve Deletion</a>
          <a href="${denyUrl}" style="background-color: #f44336; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Deny Deletion</a>
        </p>
        <p><small>Delete Request ID: ${deleteRequest.id}</small></p>
      `,
    };

    await transporter.sendMail(mailOptions);
  }

  async getByRecord(req, res) {
    try {
      const { id } = req.params;
      const recordType = req.query.record_type || "organization";

      const deleteRequest = await this.deleteRequestModel.getByRecord(id, recordType);

      return res.json({
        success: true,
        deleteRequest,
      });
    } catch (error) {
      console.error("Error fetching delete request:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch delete request",
        error: process.env.NODE_ENV === "production" ? undefined : error.message,
      });
    }
  }

  async approve(req, res) {
    try {
      const userId = req.user?.id;
      const { id } = req.params;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Authentication required",
        });
      }

      const deleteRequest = await this.deleteRequestModel.getById(id);
      if (!deleteRequest) {
        return res.status(404).json({
          success: false,
          message: "Delete request not found",
        });
      }

      if (deleteRequest.status !== "pending") {
        return res.status(400).json({
          success: false,
          message: `Delete request is already ${deleteRequest.status}`,
        });
      }

      // Approve the delete request
      const approvedRequest = await this.deleteRequestModel.approve(id, userId);

      // Execute the deletion (archive the record)
      await this.executeDeletion(approvedRequest);

      // Send approval email to requester
      try {
        await this.sendApprovalEmail(approvedRequest);
      } catch (emailError) {
        console.error("Error sending approval email:", emailError);
      }

      return res.json({
        success: true,
        message: "Delete request approved and record archived successfully",
        deleteRequest: approvedRequest,
      });
    } catch (error) {
      console.error("Error approving delete request:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to approve delete request",
        error: process.env.NODE_ENV === "production" ? undefined : error.message,
      });
    }
  }

  async deny(req, res) {
    try {
      const userId = req.user?.id;
      const { id } = req.params;
      const { denial_reason } = req.body;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Authentication required",
        });
      }

      if (!denial_reason || !denial_reason.trim()) {
        return res.status(400).json({
          success: false,
          message: "Denial reason is required",
        });
      }

      const deleteRequest = await this.deleteRequestModel.getById(id);
      if (!deleteRequest) {
        return res.status(404).json({
          success: false,
          message: "Delete request not found",
        });
      }

      if (deleteRequest.status !== "pending") {
        return res.status(400).json({
          success: false,
          message: `Delete request is already ${deleteRequest.status}`,
        });
      }

      // Deny the delete request
      const deniedRequest = await this.deleteRequestModel.deny(
        id,
        denial_reason.trim(),
        userId
      );

      // Add denial reason as note to the record
      try {
        if (deniedRequest.record_type === "organization") {
          await this.organizationModel.addNote(
            deniedRequest.record_id,
            `Delete denied: ${denial_reason.trim()}`,
            userId
          );
        } else if (deniedRequest.record_type === "hiring_manager") {
          await this.hiringManagerModel.addNote(
            deniedRequest.record_id,
            `Delete denied: ${denial_reason.trim()}`,
            userId
          );
        }
      } catch (noteError) {
        console.error("Error adding denial note:", noteError);
      }

      // Send denial email to requester
      try {
        await this.sendDenialEmail(deniedRequest, denial_reason.trim());
      } catch (emailError) {
        console.error("Error sending denial email:", emailError);
      }

      return res.json({
        success: true,
        message: "Delete request denied successfully",
        deleteRequest: deniedRequest,
      });
    } catch (error) {
      console.error("Error denying delete request:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to deny delete request",
        error: process.env.NODE_ENV === "production" ? undefined : error.message,
      });
    }
  }

  async sendApprovalEmail(deleteRequest) {
    if (!deleteRequest.requested_by_email) return;

    const transporter = this.getEmailTransporter();

    const mailOptions = {
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: deleteRequest.requested_by_email,
      subject: `Delete Request Approved: ${deleteRequest.record_type} ${deleteRequest.record_number || deleteRequest.record_id}`,
      html: `
        <h2>Delete Request Approved</h2>
        <p>Your delete request has been approved:</p>
        <ul>
          <li><strong>Record Type:</strong> ${deleteRequest.record_type}</li>
          <li><strong>Record Number:</strong> ${deleteRequest.record_number || deleteRequest.record_id}</li>
          <li><strong>Reason:</strong> ${deleteRequest.reason}</li>
        </ul>
        <p>The record has been archived and will be permanently deleted after 7 days.</p>
      `,
    };

    await transporter.sendMail(mailOptions);
  }

  async sendDenialEmail(deleteRequest, denialReason) {
    if (!deleteRequest.requested_by_email) return;

    const transporter = this.getEmailTransporter();

    const mailOptions = {
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: deleteRequest.requested_by_email,
      subject: `Delete Request Denied: ${deleteRequest.record_type} ${deleteRequest.record_number || deleteRequest.record_id}`,
      html: `
        <h2>Delete Request Denied</h2>
        <p>Your delete request has been denied:</p>
        <ul>
          <li><strong>Record Type:</strong> ${deleteRequest.record_type}</li>
          <li><strong>Record Number:</strong> ${deleteRequest.record_number || deleteRequest.record_id}</li>
          <li><strong>Denial Reason:</strong> ${denialReason}</li>
        </ul>
        <p>The record remains active and unchanged.</p>
      `,
    };

    await transporter.sendMail(mailOptions);
  }

  async executeDeletion(deleteRequest) {
    const client = await this.organizationModel.pool.connect();
    try {
      await client.query("BEGIN");

      if (deleteRequest.record_type === "organization") {
        // Update organization status to "Archived"
        await client.query(
          `
          UPDATE organizations
          SET status = 'Archived',
              archived_at = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $1
        `,
          [deleteRequest.record_id]
        );

        // Add system note
        await this.organizationModel.addNote(
          deleteRequest.record_id,
          "Record archived following payroll approval",
          deleteRequest.reviewed_by
        );

        // Schedule cleanup job (7 days from now)
        await client.query(
          `
          INSERT INTO scheduled_tasks (
            task_type,
            task_data,
            scheduled_for,
            status
          ) VALUES ($1, $2::jsonb, CURRENT_TIMESTAMP + INTERVAL '7 days', 'pending')
        `,
          [
            "archive_cleanup",
            JSON.stringify({
              organization_id: deleteRequest.record_id,
              delete_request_id: deleteRequest.id,
            }),
          ]
        );
      } else if (deleteRequest.record_type === "hiring_manager") {
        // Update hiring manager status to "Archived"
        await client.query(
          `
          UPDATE hiring_managers
          SET status = 'Archived',
              archived_at = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $1
        `,
          [deleteRequest.record_id]
        );

        // Add system note
        await this.hiringManagerModel.addNote(
          deleteRequest.record_id,
          "Record archived following payroll approval",
          deleteRequest.reviewed_by
        );

        // Schedule cleanup job (7 days from now)
        await client.query(
          `
          INSERT INTO scheduled_tasks (
            task_type,
            task_data,
            scheduled_for,
            status
          ) VALUES ($1, $2::jsonb, CURRENT_TIMESTAMP + INTERVAL '7 days', 'pending')
        `,
          [
            "archive_cleanup",
            JSON.stringify({
              hiring_manager_id: deleteRequest.record_id,
              delete_request_id: deleteRequest.id,
            }),
          ]
        );
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = DeleteRequestController;
