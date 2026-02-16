const DeleteRequest = require("../models/deleteRequest");
const Organization = require("../models/organization");
const HiringManager = require("../models/hiringManager");
const JobSeeker = require("../models/jobseeker");
const Job = require("../models/job");
const Lead = require("../models/lead");
const Task = require("../models/task");
const Placement = require("../models/placement");
const EmailTemplateModel = require("../models/emailTemplateModel");
const { renderTemplate } = require("../utils/templateRenderer");
const { sendMail } = require("../services/emailService");

const PAYROLL_EMAIL = process.env.PAYROLL_EMAIL || "payroll@completestaffingsolutions.com";
// const PAYROLL_EMAIL = "yasirrehman274@gmail.com";

// Optional escalation: when retry_count >= threshold, notify escalation email and add [ESCALATED] to subject
const ESCALATION_ENABLED = process.env.DELETE_REQUEST_ESCALATION_ENABLED === "true";
const ESCALATION_EMAIL = process.env.DELETE_REQUEST_ESCALATION_EMAIL || null;
const ESCALATION_AFTER_RETRIES = parseInt(process.env.DELETE_REQUEST_ESCALATION_AFTER_RETRIES || "3", 10);

class DeleteRequestController {
  constructor(pool) {
    this.pool = pool;
    this.deleteRequestModel = new DeleteRequest(pool);
    this.organizationModel = new Organization(pool);
    this.hiringManagerModel = new HiringManager(pool);
    this.jobSeekerModel = new JobSeeker(pool);
    this.jobModel = new Job(pool);
    this.leadModel = new Lead(pool);
    this.taskModel = new Task(pool);
    this.placementModel = new Placement(pool);
    this.emailTemplateModel = new EmailTemplateModel(pool);
    this.create = this.create.bind(this);
    this.approve = this.approve.bind(this);
    this.deny = this.deny.bind(this);
    this.getByRecord = this.getByRecord.bind(this);
    this.getById = this.getById.bind(this);
  }

  async initTables() {
    try {
      console.log('Initializing delete request tables...');
      await this.deleteRequestModel.initTable();
      console.log('✅ Delete request tables initialized');
    } catch (error) {
      console.error('❌ Error initializing delete request tables:', error);
      throw error;
    }
  }

  async create(req, res) {
    try {
      // Ensure table is initialized before creating delete request
      await this.initTables();
      
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Authentication required",
        });
      }

      const { id } = req.params; // organization ID
      const { 
        reason, 
        record_type, 
        record_number, 
        requested_by, 
        requested_by_email,
        action_type = 'standard',
        dependencies_summary = null,
        user_consent = false
      } = req.body;

      if (!reason || !reason.trim()) {
        return res.status(400).json({
          success: false,
          message: "Reason for deletion is required",
        });
      }

      // Validate action_type
      if (action_type !== 'standard' && action_type !== 'cascade') {
        return res.status(400).json({
          success: false,
          message: "action_type must be either 'standard' or 'cascade'",
        });
      }

      // If cascade deletion, validate dependencies_summary and user_consent
      if (action_type === 'cascade') {
        if (!dependencies_summary || typeof dependencies_summary !== 'object') {
          return res.status(400).json({
            success: false,
            message: "dependencies_summary is required for cascade deletion",
          });
        }
        if (!user_consent) {
          return res.status(400).json({
            success: false,
            message: "User consent is required for cascade deletion",
          });
        }
      }

      // For standard deletion, check if dependencies exist and force cascade if they do
      if (action_type === 'standard' && record_type === 'organization') {
        const dependencyCounts = await this.organizationModel.getDependencyCounts(id);
        const hasDependencies = (
          (dependencyCounts.hiring_managers > 0) ||
          (dependencyCounts.jobs > 0) ||
          (dependencyCounts.placements > 0) ||
          (dependencyCounts.child_organizations > 0)
        );
        
        if (hasDependencies) {
          return res.status(400).json({
            success: false,
            message: "This organization has linked records. Please use cascade deletion or transfer records first.",
            dependencyCounts,
          });
        }
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
        action_type,
        dependencies_summary,
        user_consent,
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

  async sendDeleteRequestEmail(deleteRequest, requester, options = {}) {
    const baseUrl = process.env.FRONTEND_URL || "https://cms-organization.vercel.app";
    let recordPath = "organizations";
    if (deleteRequest.record_type === "hiring_manager") {
      recordPath = "hiring-managers";
    } else if (deleteRequest.record_type === "job_seeker") {
      recordPath = "job-seekers";
    } else if (deleteRequest.record_type === "job") {
      recordPath = "jobs";
    } else if (deleteRequest.record_type === "lead") {
      recordPath = "leads";
    } else if (deleteRequest.record_type === "task") {
      recordPath = "tasks";
    } else if (deleteRequest.record_type === "placement") {
      recordPath = "placements";
    }
    const approvalUrl = `${baseUrl}/dashboard/${recordPath}/delete/${deleteRequest.id}/approve`;
    const denyUrl = `${baseUrl}/dashboard/${recordPath}/delete/${deleteRequest.id}/deny`;

    let templateType = "ORGANIZATION_DELETE_REQUEST";
    if (deleteRequest.record_type === "hiring_manager") {
      templateType = "HIRING_MANAGER_DELETE_REQUEST";
    } else if (deleteRequest.record_type === "job_seeker") {
      templateType = "JOB_SEEKER_DELETE_REQUEST";
    } else if (deleteRequest.record_type === "job") {
      templateType = "JOB_DELETE_REQUEST";
    } else if (deleteRequest.record_type === "lead") {
      templateType = "LEAD_DELETE_REQUEST";
    } else if (deleteRequest.record_type === "task") {
      templateType = "TASK_DELETE_REQUEST";
    } else if (deleteRequest.record_type === "placement") {
      templateType = "PLACEMENT_DELETE_REQUEST";
    }
    const tpl = await this.emailTemplateModel.getTemplateByType(templateType);

    const requestDate = new Date(deleteRequest.created_at).toLocaleString();
    const approvalButtonHtml =
      `<a href="${approvalUrl}" style="display:inline-block;background-color:#4CAF50;color:white;padding:10px 20px;text-decoration:none;border-radius:5px;margin-right:10px;">Approve Deletion</a>`;
    const denyButtonHtml =
      `<a href="${denyUrl}" style="display:inline-block;background-color:#f44336;color:white;padding:10px 20px;text-decoration:none;border-radius:5px;">Deny Deletion</a>`;

    const recordDisplay = String(deleteRequest.record_number || deleteRequest.record_id);
    const isCascade = deleteRequest.action_type === 'cascade';
    const dependencies = deleteRequest.dependencies_summary || {};
    const retryCount = deleteRequest.retry_count ?? options.retryCount ?? 0;
    const isEscalation = options.isEscalation ?? (ESCALATION_ENABLED && ESCALATION_EMAIL && retryCount >= ESCALATION_AFTER_RETRIES);
    const escalationPrefix = isEscalation ? "[ESCALATED] " : "";
    
    const vars = {
      requestedBy: requester.name || "Unknown",
      requestedByEmail: requester.email || "",
      recordType: deleteRequest.record_type,
      recordNumber: recordDisplay,
      requestId: String(deleteRequest.id),
      reason: deleteRequest.reason || "",
      requestDate,
      approvalUrl,
      denyUrl,
      isCascade: isCascade ? 'true' : 'false',
      cascadeWarning: isCascade ? '⚠️ CASCADE DELETION REQUEST - This will delete the organization AND all linked records.' : '',
      dependenciesList: isCascade ? this.formatDependenciesList(dependencies) : '',
    };
    const bodyVars = {
      ...vars,
      approvalUrl: approvalButtonHtml,
      denyUrl: denyButtonHtml,
    };
    const safeKeys = ["approvalUrl", "denyUrl"];

    const recipients = isEscalation && ESCALATION_EMAIL
      ? [PAYROLL_EMAIL, ESCALATION_EMAIL].filter(Boolean).join(", ")
      : PAYROLL_EMAIL;

    if (tpl) {
      const subject = escalationPrefix + renderTemplate(tpl.subject, vars, safeKeys);
      let html = renderTemplate(tpl.body, bodyVars, safeKeys);
      html = html.replace(/\r\n/g, "\n").replace(/\n/g, "<br/>");
      if (isEscalation) {
        html = `<div style="background:#fff3cd;border:2px solid #ffc107;padding:10px;margin-bottom:15px;border-radius:5px;"><strong>⚠️ ESCALATED</strong> - This request has been pending through ${retryCount} retry cycle(s) and requires urgent attention.</div>${html}`;
      }
      await sendMail({
        to: recipients,
        subject,
        html,
      });
    } else {
      const subjectPrefix = escalationPrefix + (isCascade ? '⚠️ Cascade Deletion Request: ' : 'Delete Request: ');
      const cascadeSection = isCascade ? `
        <div style="background-color: #fee; border: 2px solid #f44; padding: 15px; margin: 15px 0; border-radius: 5px;">
          <h3 style="color: #c00; margin-top: 0;">⚠️ CASCADE DELETION WARNING</h3>
          <p style="color: #800; font-weight: bold;">This request will delete the organization AND the following linked records:</p>
          <ul style="color: #800;">
            ${dependencies.hiring_managers > 0 ? `<li><strong>${dependencies.hiring_managers}</strong> Hiring Managers</li>` : ''}
            ${dependencies.jobs > 0 ? `<li><strong>${dependencies.jobs}</strong> Jobs</li>` : ''}
            ${dependencies.placements > 0 ? `<li><strong>${dependencies.placements}</strong> Placements</li>` : ''}
            ${dependencies.child_organizations > 0 ? `<li><strong>${dependencies.child_organizations}</strong> Child Organizations</li>` : ''}
          </ul>
          <p style="color: #800; font-weight: bold;">User has explicitly consented to this cascade deletion.</p>
        </div>
      ` : '';

      let fallbackHtml = `
        <h2>${isCascade ? '⚠️ Cascade ' : ''}Delete Request</h2>
        <p>A new ${deleteRequest.record_type} delete request has been submitted and requires your review.</p>
        ${cascadeSection}
        <p><strong>Request Details:</strong></p>
        <ul>
          <li><strong>Request ID:</strong> ${vars.requestId} (this ID is used in the approval link)</li>
          <li><strong>Record (${deleteRequest.record_type}):</strong> ${recordDisplay}</li>
          <li><strong>Request Type:</strong> ${isCascade ? 'Cascade Deletion' : 'Standard Deletion'}</li>
          <li><strong>Requested By:</strong> ${vars.requestedBy} (${vars.requestedByEmail})</li>
          <li><strong>Request Date:</strong> ${requestDate}</li>
          <li><strong>Reason:</strong> ${vars.reason}</li>
        </ul>
        <p>Please review the request and take the appropriate action using the links below:</p>
        <p>
          <a href="${approvalUrl}" style="background-color: ${isCascade ? '#c00' : '#4CAF50'}; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; margin-right: 10px;">${isCascade ? 'Approve Cascade Deletion' : 'Approve Deletion'}</a>
          <a href="${denyUrl}" style="background-color: #f44336; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Deny Deletion</a>
        </p>
      `;
      if (isEscalation) {
        fallbackHtml = `<div style="background:#fff3cd;border:2px solid #ffc107;padding:10px;margin-bottom:15px;border-radius:5px;"><strong>⚠️ ESCALATED</strong> - This request has been pending through ${retryCount} retry cycle(s) and requires urgent attention.</div>${fallbackHtml}`;
      }
      await sendMail({
        to: recipients,
        subject: `${subjectPrefix}${deleteRequest.record_type} ${recordDisplay}`,
        html: fallbackHtml,
      });
    }
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

  async getById(req, res) {
    try {
      const { id } = req.params;

      const deleteRequest = await this.deleteRequestModel.getById(id);
      if (!deleteRequest) {
        return res.status(404).json({
          success: false,
          message: "Delete request not found",
        });
      }

      const payload = { success: true, deleteRequest };
      if (deleteRequest.status === "expired") {
        payload.message = "This delete request session has expired.";
      }
      return res.json(payload);
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
      // Ensure all tables are initialized before processing deletion
      await this.initTables();
      await this.leadModel.initTable();
      await this.taskModel.initTable();
      await this.placementModel.initTable();
      await this.jobModel.initTable();
      
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
        const recordDisplay = deleteRequest.record_number || deleteRequest.record_id;
        const message =
          deleteRequest.status === "expired"
            ? "This delete request session has expired."
            : `Delete request for ${deleteRequest.record_type} ${recordDisplay} has already been ${deleteRequest.status}. The record may already be archived.`;
        return res.status(400).json({
          success: false,
          message,
        });
      }

      // Execute the deletion (archive the record) FIRST, then mark as approved.
      // This way if executeDeletion fails (e.g. timeout), the request stays pending and can be retried.
      const requestWithReviewer = { ...deleteRequest, reviewed_by: userId };
      await this.executeDeletion(requestWithReviewer);

      // Now mark the delete request as approved
      const approvedRequest = await this.deleteRequestModel.approve(id, userId);

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
        const message =
          deleteRequest.status === "expired"
            ? "This delete request session has expired."
            : `Delete request is already ${deleteRequest.status}`;
        return res.status(400).json({
          success: false,
          message,
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
        } else if (deniedRequest.record_type === "job_seeker") {
          await this.jobSeekerModel.addNote(
            deniedRequest.record_id,
            `Delete denied: ${denial_reason.trim()}`,
            userId
          );
        } else if (deniedRequest.record_type === "job") {
          await this.jobModel.addNote(
            deniedRequest.record_id,
            `Delete denied: ${denial_reason.trim()}`,
            userId
          );
        } else if (deniedRequest.record_type === "lead") {
          await this.leadModel.addNote(
            deniedRequest.record_id,
            `Delete denied: ${denial_reason.trim()}`,
            userId
          );
        } else if (deniedRequest.record_type === "task") {
          await this.taskModel.addNote(
            deniedRequest.record_id,
            `Delete denied: ${denial_reason.trim()}`,
            userId
          );
        } else if (deniedRequest.record_type === "placement") {
          await this.placementModel.addNote(
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
    await sendMail({
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
    });
  }

  async sendDenialEmail(deleteRequest, denialReason) {
    if (!deleteRequest.requested_by_email) return;
    await sendMail({
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
    });
  }

  formatDependenciesList(dependencies) {
    const items = [];
    if (dependencies.hiring_managers > 0) {
      items.push(`${dependencies.hiring_managers} Hiring Managers`);
    }
    if (dependencies.jobs > 0) {
      items.push(`${dependencies.jobs} Jobs`);
    }
    if (dependencies.placements > 0) {
      items.push(`${dependencies.placements} Placements`);
    }
    if (dependencies.child_organizations > 0) {
      items.push(`${dependencies.child_organizations} Child Organizations`);
    }
    return items.length > 0 ? items.join(', ') : 'None';
  }

  async executeDeletion(deleteRequest) {
    // Ensure all tables are initialized before executing deletion
    await this.leadModel.initTable();
    await this.taskModel.initTable();
    await this.placementModel.initTable();
    await this.jobModel.initTable();
    
    const client = await this.organizationModel.pool.connect();
    try {
      await client.query("BEGIN");

      if (deleteRequest.record_type === "organization") {
        // Check if this is a cascade deletion
        const isCascade = deleteRequest.action_type === 'cascade';
        
        if (isCascade) {
          // Get child organizations before archiving
          // parent_organization is VARCHAR(255), so compare as text
          // id is INTEGER, so compare as integer
          const recordId = typeof deleteRequest.record_id === 'string' ? parseInt(deleteRequest.record_id, 10) : deleteRequest.record_id;
          const recordIdStr = String(recordId);
          const childOrgsQuery = await client.query(
            `
            SELECT id FROM organizations 
            WHERE parent_organization = $1 
            AND status != 'Archived' 
            AND id != $2
            `,
            [recordIdStr, recordId]
          );
          const childOrgIds = childOrgsQuery.rows.map(row => row.id);

          // Use archiveCascade method to archive org and all dependencies
          await this.organizationModel.archiveCascade(
            deleteRequest.record_id,
            deleteRequest.reviewed_by,
            'Cascade Deletion'
          );

          // Add system note
          await this.organizationModel.addNote(
            deleteRequest.record_id,
            "Organization and all linked records archived following payroll approval (Cascade Deletion)",
            deleteRequest.reviewed_by
          );

          // Auto-approve pending delete requests for child organizations
          if (childOrgIds.length > 0) {
            for (const childOrgId of childOrgIds) {
              try {
                const childDeleteRequest = await this.deleteRequestModel.getByRecord(
                  childOrgId,
                  'organization'
                );
                
                if (childDeleteRequest && childDeleteRequest.status === 'pending') {
                  console.log(`Auto-approving child organization delete request: ${childDeleteRequest.id}`);
                  
                  // Approve the child delete request
                  const approvedChildRequest = await this.deleteRequestModel.approve(
                    childDeleteRequest.id,
                    deleteRequest.reviewed_by
                  );

                  // Execute deletion for child (standard archive since parent cascade handles dependencies)
                  await client.query(
                    `
                    UPDATE organizations
                    SET status = 'Archived',
                        archived_at = CURRENT_TIMESTAMP,
                        archive_reason = 'Deletion',
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = $1
                  `,
                    [childOrgId]
                  );

                  // Add system note to child org
                  await this.organizationModel.addNote(
                    childOrgId,
                    `Record archived following auto-approval (parent organization cascade deletion approved)`,
                    deleteRequest.reviewed_by
                  );

                  // Schedule cleanup job for child org
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
                        organization_id: childOrgId,
                        delete_request_id: approvedChildRequest.id,
                      }),
                    ]
                  );

                  // Send approval email for child org deletion
                  try {
                    await this.sendApprovalEmail(approvedChildRequest);
                  } catch (emailError) {
                    console.error(`Error sending approval email for child org ${childOrgId}:`, emailError);
                  }
                }
              } catch (childError) {
                console.error(`Error auto-approving child organization ${childOrgId}:`, childError);
                // Continue with other child orgs even if one fails
              }
            }
          }
        } else {
          // Standard deletion - only archive the organization
          await client.query(
            `
            UPDATE organizations
            SET status = 'Archived',
                archived_at = CURRENT_TIMESTAMP,
                archive_reason = 'Deletion',
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
        }

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
        // Update hiring manager status to "Archived" and set archive_reason for Deletion
        await client.query(
          `
          UPDATE hiring_managers
          SET status = 'Archived',
              archived_at = CURRENT_TIMESTAMP,
              archive_reason = 'Deletion',
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
      } else if (deleteRequest.record_type === "job_seeker") {
        await client.query(
          `
          UPDATE job_seekers
          SET status = 'Archived',
              archived_at = CURRENT_TIMESTAMP,
              archive_reason = 'Deletion',
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $1
        `,
          [deleteRequest.record_id]
        );

        await this.jobSeekerModel.addNote(
          deleteRequest.record_id,
          "Record archived following payroll approval",
          deleteRequest.reviewed_by
        );

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
              job_seeker_id: deleteRequest.record_id,
              delete_request_id: deleteRequest.id,
            }),
          ]
        );
      } else if (deleteRequest.record_type === "job") {
        // Update job status to "Archived" and set archived_at timestamp
        await client.query(
          `
          UPDATE jobs
          SET status = 'Archived',
              archived_at = CURRENT_TIMESTAMP,
              archive_reason = 'Deletion',
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $1
        `,
          [deleteRequest.record_id]
        );

        // Add note within the same transaction to avoid deadlock
        await client.query(
          `
          INSERT INTO job_notes (job_id, text, created_by)
          VALUES ($1, $2, $3)
        `,
          [
            deleteRequest.record_id,
            "Record archived following payroll approval",
            deleteRequest.reviewed_by
          ]
        );

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
              job_id: deleteRequest.record_id,
              delete_request_id: deleteRequest.id,
            }),
          ]
        );
      } else if (deleteRequest.record_type === "lead") {
        // Update lead status to "Archived" and set archived_at timestamp
        await client.query(
          `
          UPDATE leads
          SET status = 'Archived',
              archived_at = CURRENT_TIMESTAMP,
              archive_reason = 'Deletion',
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $1
        `,
          [deleteRequest.record_id]
        );

        // Add note within the same transaction to avoid deadlock
        await client.query(
          `
          INSERT INTO lead_notes (lead_id, text, created_by)
          VALUES ($1, $2, $3)
        `,
          [
            deleteRequest.record_id,
            "Record archived following payroll approval",
            deleteRequest.reviewed_by
          ]
        );

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
              lead_id: deleteRequest.record_id,
              delete_request_id: deleteRequest.id,
            }),
          ]
        );
      } else if (deleteRequest.record_type === "task") {
        // Update task status to "Archived" and set archived_at timestamp
        await client.query(
          `
          UPDATE tasks
          SET status = 'Archived',
              archived_at = CURRENT_TIMESTAMP,
              archive_reason = 'Deletion',
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $1
        `,
          [deleteRequest.record_id]
        );

        // Add note within the same transaction to avoid deadlock
        await client.query(
          `
          INSERT INTO task_notes (task_id, text, created_by)
          VALUES ($1, $2, $3)
        `,
          [
            deleteRequest.record_id,
            "Record archived following payroll approval",
            deleteRequest.reviewed_by
          ]
        );

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
              task_id: deleteRequest.record_id,
              delete_request_id: deleteRequest.id,
            }),
          ]
        );
      } else if (deleteRequest.record_type === "placement") {
        // Update placement status to "Archived" and set archived_at timestamp
        await client.query(
          `
          UPDATE placements
          SET status = 'Archived',
              archived_at = CURRENT_TIMESTAMP,
              archive_reason = 'Deletion',
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $1
        `,
          [deleteRequest.record_id]
        );

        // Add note within the same transaction to avoid deadlock
        await client.query(
          `
          INSERT INTO placement_notes (placement_id, text, action, about_references, created_by)
          VALUES ($1, $2, $3, $4, $5)
        `,
          [
            deleteRequest.record_id,
            "Record archived following payroll approval",
            null, // action
            null, // about_references
            deleteRequest.reviewed_by
          ]
        );

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
              placement_id: deleteRequest.record_id,
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
