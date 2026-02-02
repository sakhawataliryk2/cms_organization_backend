// controllers/transferController.js
const Transfer = require("../models/transfer");
const Organization = require("../models/organization");
const EmailTemplateModel = require("../models/emailTemplateModel");
const { renderTemplate } = require("../utils/templateRenderer");
const { sendMail } = require("../services/emailService");

// const PAYROLL_EMAIL = process.env.PAYROLL_EMAIL || "payroll@completestaffingsolutions.com";
const PAYROLL_EMAIL = "nt50616849@gmail.com";

class TransferController {
  constructor(pool) {
    this.transferModel = new Transfer(pool);
    this.organizationModel = new Organization(pool);
    this.emailTemplateModel = new EmailTemplateModel(pool);
    this.create = this.create.bind(this);
    this.approve = this.approve.bind(this);
    this.deny = this.deny.bind(this);
  }

  async initTables() {
    await this.transferModel.initTable();
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

      const {
        source_organization_id,
        target_organization_id,
        requested_by,
        requested_by_email,
        source_record_number,
        target_record_number,
        context,
      } = req.body;

      if (!source_organization_id || !target_organization_id) {
        return res.status(400).json({
          success: false,
          message: "Source and target organization IDs are required",
        });
      }

      if (source_organization_id === target_organization_id) {
        return res.status(400).json({
          success: false,
          message: "Cannot transfer to the same organization",
        });
      }

      // Get user info
      const client = await this.transferModel.pool.connect();
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

      const requester = {
        name: requested_by || user.name || "Unknown",
        email: requested_by_email || user.email || "",
      };

      // Create transfer request
      const transfer = await this.transferModel.create({
        source_organization_id,
        target_organization_id,
        requested_by: userId,
        requested_by_name: requester.name,
        requested_by_email: requester.email,
        source_record_number,
        target_record_number,
      });

      try {
        await this.sendTransferRequestEmail(transfer, requester, context);
      } catch (emailError) {
        console.error("Error sending transfer request email:", emailError);
      }

      return res.status(201).json({
        success: true,
        message: "Transfer request created successfully",
        transfer,
      });
    } catch (error) {
      console.error("Error creating transfer request:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to create transfer request",
        error: process.env.NODE_ENV === "production" ? undefined : error.message,
      });
    }
  }

  async sendTransferRequestEmail(transfer, requester, context) {
    const baseUrl = process.env.FRONTEND_URL || "http://localhost:3000";
    const approvalUrl = `${baseUrl}/dashboard/organizations/transfer/${transfer.id}/approve`;
    const denyUrl = `${baseUrl}/dashboard/organizations/transfer/${transfer.id}/deny`;

    const templateType =
      context === "hiring_manager" ? "HIRING_MANAGER_TRANSFER_REQUEST" : "ORGANIZATION_TRANSFER_REQUEST";
    const tpl = await this.emailTemplateModel.getTemplateByType(templateType);

    const requestDate = new Date(transfer.created_at).toLocaleString();
    const vars = {
      requestedBy: requester.name || "Unknown",
      requestedByEmail: requester.email || "",
      sourceRecordNumber: transfer.source_record_number || "",
      targetRecordNumber: transfer.target_record_number || "",
      requestDate,
      approvalUrl,
      denyUrl,
    };
    const safeKeys = ["approvalUrl", "denyUrl"];

    if (tpl) {
      const subject = renderTemplate(tpl.subject, vars, safeKeys);
      let html = renderTemplate(tpl.body, vars, safeKeys);
      html = html.replace(/\r\n/g, "\n").replace(/\n/g, "<br/>");
      await sendMail({
        to: PAYROLL_EMAIL,
        subject,
        html,
      });
    } else {
      await sendMail({
        to: PAYROLL_EMAIL,
        subject: `Transfer Request: ${transfer.source_record_number} → ${transfer.target_record_number}`,
        html: `
          <h2>Organization Transfer Request</h2>
          <p>A transfer request has been submitted:</p>
          <ul>
            <li><strong>Requested By:</strong> ${vars.requestedBy} (${vars.requestedByEmail})</li>
            <li><strong>Source Organization:</strong> ${vars.sourceRecordNumber}</li>
            <li><strong>Target Organization:</strong> ${vars.targetRecordNumber}</li>
            <li><strong>Request Date:</strong> ${requestDate}</li>
          </ul>
          <p>Please review and approve or deny this transfer:</p>
          <p>
            <a href="${approvalUrl}" style="background-color: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; margin-right: 10px;">Approve Transfer</a>
            <a href="${denyUrl}" style="background-color: #f44336; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Deny Transfer</a>
          </p>
          <p><small>Transfer ID: ${transfer.id}</small></p>
        `,
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

      const transfer = await this.transferModel.getById(id);
      if (!transfer) {
        return res.status(404).json({
          success: false,
          message: "Transfer request not found",
        });
      }

      if (transfer.status !== "pending") {
        return res.status(400).json({
          success: false,
          message: `Transfer request is already ${transfer.status}`,
        });
      }

      // Approve the transfer
      const approvedTransfer = await this.transferModel.approve(id, userId);

      // Execute the transfer
      await this.executeTransfer(approvedTransfer);

      return res.json({
        success: true,
        message: "Transfer approved and executed successfully",
        transfer: approvedTransfer,
      });
    } catch (error) {
      console.error("Error approving transfer:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to approve transfer",
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

      const transfer = await this.transferModel.getById(id);
      if (!transfer) {
        return res.status(404).json({
          success: false,
          message: "Transfer request not found",
        });
      }

      if (transfer.status !== "pending") {
        return res.status(400).json({
          success: false,
          message: `Transfer request is already ${transfer.status}`,
        });
      }

      // Deny the transfer
      const deniedTransfer = await this.transferModel.deny(
        id,
        denial_reason.trim(),
        userId
      );

      // Add denial reason as note to both organizations
      try {
        await this.organizationModel.addNote(
          transfer.source_organization_id,
          `Transfer denied: ${denial_reason.trim()}`,
          userId
        );
        await this.organizationModel.addNote(
          transfer.target_organization_id,
          `Transfer denied: ${denial_reason.trim()}`,
          userId
        );
      } catch (noteError) {
        console.error("Error adding denial notes:", noteError);
      }

      // Send denial email to requester
      try {
        await this.sendDenialEmail(deniedTransfer, denial_reason.trim());
      } catch (emailError) {
        console.error("Error sending denial email:", emailError);
      }

      return res.json({
        success: true,
        message: "Transfer denied successfully",
        transfer: deniedTransfer,
      });
    } catch (error) {
      console.error("Error denying transfer:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to deny transfer",
        error: process.env.NODE_ENV === "production" ? undefined : error.message,
      });
    }
  }

  async sendDenialEmail(transfer, denialReason) {
    if (!transfer.requested_by_email) return;
    await sendMail({
      to: transfer.requested_by_email,
      subject: `Transfer Request Denied: ${transfer.source_record_number} → ${transfer.target_record_number}`,
      html: `
        <h2>Transfer Request Denied</h2>
        <p>Your transfer request has been denied:</p>
        <ul>
          <li><strong>Source Organization:</strong> ${transfer.source_record_number}</li>
          <li><strong>Target Organization:</strong> ${transfer.target_record_number}</li>
          <li><strong>Denial Reason:</strong> ${denialReason}</li>
        </ul>
        <p>If you have questions, please contact payroll.</p>
      `,
    });
  }

  async executeTransfer(transfer) {
    const client = await this.organizationModel.pool.connect();
    try {
      await client.query("BEGIN");

      const sourceOrgId = transfer.source_organization_id;
      const targetOrgId = transfer.target_organization_id;

      // Get source and target organizations
      const sourceOrgResult = await client.query(
        "SELECT * FROM organizations WHERE id = $1",
        [sourceOrgId]
      );
      const targetOrgResult = await client.query(
        "SELECT * FROM organizations WHERE id = $1",
        [targetOrgId]
      );

      if (sourceOrgResult.rows.length === 0 || targetOrgResult.rows.length === 0) {
        throw new Error("Source or target organization not found");
      }

      const sourceOrg = sourceOrgResult.rows[0];
      const targetOrg = targetOrgResult.rows[0];

      // 1. Move missing data ("data holes") from source to target
      await this.transferDataHoles(client, sourceOrg, targetOrg);

      // 2. Move all affiliated contacts (hiring managers) from source to target
      await client.query(
        "UPDATE hiring_managers SET organization_id = $1 WHERE organization_id = $2",
        [targetOrgId, sourceOrgId]
      );

      // 3. Update jobs to point to target organization
      await client.query(
        "UPDATE jobs SET organization_id = $1 WHERE organization_id = $2",
        [targetOrgId, sourceOrgId]
      );

      // 4. Update leads to point to target organization
      await client.query(
        "UPDATE leads SET organization_id = $1 WHERE organization_id = $2",
        [targetOrgId, sourceOrgId]
      );

      // 5. Change source organization status to "Archived"
      await client.query(
        "UPDATE organizations SET status = 'Archived', updated_at = CURRENT_TIMESTAMP WHERE id = $1",
        [sourceOrgId]
      );

      // 6. Add notes to both organizations
      await this.organizationModel.addNote(
        sourceOrgId,
        `Transfer approved: Data moved to ${transfer.target_record_number}. Status changed to Archived.`,
        transfer.approved_by
      );
      await this.organizationModel.addNote(
        targetOrgId,
        `Transfer approved: Data received from ${transfer.source_record_number}.`,
        transfer.approved_by
      );

      // 7. Schedule cleanup job (7 days from now)
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
          JSON.stringify({ organization_id: sourceOrgId }),
        ]
      );

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async transferDataHoles(client, sourceOrg, targetOrg) {
    // Transfer missing data fields from source to target
    const fieldsToTransfer = [
      "contact_phone",
      "address",
      "website",
      "nicknames",
      "overview",
    ];

    const updates = [];
    const values = [];
    let paramIndex = 1;

    for (const field of fieldsToTransfer) {
      // If target is empty/null and source has a value, transfer it
      if (
        (!targetOrg[field] || targetOrg[field] === "") &&
        sourceOrg[field] &&
        sourceOrg[field] !== ""
      ) {
        updates.push(`${field} = $${paramIndex}`);
        values.push(sourceOrg[field]);
        paramIndex++;
      }
    }

    // Transfer custom fields
    if (sourceOrg.custom_fields) {
      const sourceCustomFields =
        typeof sourceOrg.custom_fields === "string"
          ? JSON.parse(sourceOrg.custom_fields)
          : sourceOrg.custom_fields;
      const targetCustomFields =
        targetOrg.custom_fields &&
        (typeof targetOrg.custom_fields === "string"
          ? JSON.parse(targetOrg.custom_fields)
          : targetOrg.custom_fields);

      const mergedCustomFields = { ...targetCustomFields };
      for (const [key, value] of Object.entries(sourceCustomFields)) {
        if (!mergedCustomFields[key] || mergedCustomFields[key] === "") {
          mergedCustomFields[key] = value;
        }
      }

      updates.push(`custom_fields = $${paramIndex}`);
      values.push(JSON.stringify(mergedCustomFields));
      paramIndex++;
    }

    if (updates.length > 0) {
      values.push(targetOrg.id);
      await client.query(
        `UPDATE organizations SET ${updates.join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE id = $${paramIndex}`,
        values
      );
    }
  }
}

module.exports = TransferController;
