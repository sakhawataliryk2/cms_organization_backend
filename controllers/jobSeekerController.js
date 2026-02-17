const JobSeeker = require("../models/jobseeker");
const Document = require("../models/document");
const { put } = require("@vercel/blob");
const { normalizeCustomFields, normalizeListCustomFields } = require("../utils/exportHelpers");

const jwt = require("jsonwebtoken");

const bcrypt = require("bcrypt");



class JobSeekerController {

  constructor(pool) {

    this.jobSeekerModel = new JobSeeker(pool);

    this.documentModel = new Document(pool);

    this.create = this.create.bind(this);

    this.getAll = this.getAll.bind(this);

    this.getById = this.getById.bind(this);

    this.update = this.update.bind(this);

    this.bulkUpdate = this.bulkUpdate.bind(this);

    this.delete = this.delete.bind(this);

    this.addNote = this.addNote.bind(this);

    this.getNotes = this.getNotes.bind(this);

    this.getHistory = this.getHistory.bind(this);

    this.getReferences = this.getReferences.bind(this);

    this.addReference = this.addReference.bind(this);

    this.deleteReference = this.deleteReference.bind(this);

    this.getApplications = this.getApplications.bind(this);

    this.addApplication = this.addApplication.bind(this);

    this.getDocuments = this.getDocuments.bind(this);

    this.getDocument = this.getDocument.bind(this);

    this.addDocument = this.addDocument.bind(this);

    this.uploadDocument = this.uploadDocument.bind(this);

    this.updateDocument = this.updateDocument.bind(this);

    this.deleteDocument = this.deleteDocument.bind(this);

  }

  async getApplications(req, res) {
    try {
      const { id } = req.params;

      const userId = req.user.id;
      const userRole = req.user.role;

      const jobSeeker = await this.jobSeekerModel.getById(id, null);

      if (!jobSeeker) {
        return res.status(404).json({
          success: false,
          message: "Job seeker not found",
        });
      }

      const customFields =
        typeof jobSeeker.custom_fields === "string"
          ? JSON.parse(jobSeeker.custom_fields || "{}")
          : jobSeeker.custom_fields || {};

      const applications = Array.isArray(customFields.applications)
        ? customFields.applications
        : [];

      return res.status(200).json({
        success: true,
        count: applications.length,
        applications,
      });
    } catch (error) {
      console.error("Error getting job seeker applications:", error);
      return res.status(500).json({
        success: false,
        message: "An error occurred while retrieving applications",
        error: process.env.NODE_ENV === "production" ? undefined : error.message,
      });
    }
  }

  async addApplication(req, res) {
    try {
      const { id } = req.params;

      const userId = req.user.id;

      const application = req.body || {};

      const allowedTypes = [
        "web_submissions",
        "submissions",
        "client_submissions",
      ];

      if (!application.type || !allowedTypes.includes(application.type)) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid application type. Allowed: web_submissions, submissions, client_submissions",
        });
      }

      const jobSeeker = await this.jobSeekerModel.getById(id, null);

      if (!jobSeeker) {
        return res.status(404).json({
          success: false,
          message: "Job seeker not found",
        });
      }

      const customFields =
        typeof jobSeeker.custom_fields === "string"
          ? JSON.parse(jobSeeker.custom_fields || "{}")
          : jobSeeker.custom_fields || {};

      const existing = Array.isArray(customFields.applications)
        ? customFields.applications
        : [];

      const newApplication = {
        id:
          application.id ||
          `app_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
        type: application.type,
        job_id: application.job_id || null,
        job_title: application.job_title || "",
        organization_id: application.organization_id || null,
        organization_name: application.organization_name || "",
        client_id: application.client_id || null,
        client_name: application.client_name || "",
        created_at: new Date().toISOString(),
        created_by: application.created_by || userId,
        notes: application.notes || "",
        status: application.status || "",
      };

      const updatedApplications = [...existing, newApplication];

      await this.jobSeekerModel.update(
        id,
        { custom_fields: { ...customFields, applications: updatedApplications } },
        null
      );

      return res.status(201).json({
        success: true,
        application: newApplication,
        applications: updatedApplications,
      });
    } catch (error) {
      console.error("Error adding job seeker application:", error);
      return res.status(500).json({
        success: false,
        message: "An error occurred while adding the application",
        error: process.env.NODE_ENV === "production" ? undefined : error.message,
      });
    }
  }



  // Initialize database tables

  async initTables() {

    await this.jobSeekerModel.initTable();

  }



  // Create a new job seeker

  async create(req, res) {

    // ✅ Extract fields explicitly like Organizations (including custom_fields)

    const {

      firstName,

      lastName,

      email,

      phone,

      mobilePhone,

      address,

      city,

      state,

      zip,

      status,

      currentOrganization,

      title,

      resumeText,

      skills,

      desiredSalary,

      owner,

      dateAdded,

      lastContactDate,

      custom_fields, // ✅ Extract custom_fields from request

    } = req.body;



    console.log("Create job seeker request body:", req.body);

    console.log("custom_fields in req.body:", req.body.custom_fields);

    console.log("custom_fields type:", typeof req.body.custom_fields);

    console.log("custom_fields keys:", req.body.custom_fields ? Object.keys(req.body.custom_fields).length : 'null/undefined');



    // Basic validation

    // if (!jobSeekerData.firstName || !jobSeekerData.lastName) {

    //     return res.status(400).json({

    //         success: false,

    //         message: 'First name and last name are required'

    //     });

    // }



    try {

      // Get the current user's ID from the auth middleware

      const userId = req.user.id;



      // ✅ Build model data with custom_fields (same pattern as Organizations)

      const modelData = {

        firstName,

        lastName,

        email,

        phone,

        mobilePhone,

        address,

        city,

        state,

        zip,

        status,

        currentOrganization,

        title,

        resumeText,

        skills,

        desiredSalary,

        owner,

        dateAdded,

        lastContactDate,

        userId,

        custom_fields: custom_fields || {}, // ✅ Use snake_case to match model expectation

      };



      console.log("=== PASSING TO MODEL ===");

      console.log("custom_fields being passed:", JSON.stringify(modelData.custom_fields, null, 2));

      console.log("custom_fields type:", typeof modelData.custom_fields);

      console.log("custom_fields keys count:", modelData.custom_fields ? Object.keys(modelData.custom_fields).length : 0);

      console.log("=== END PASSING TO MODEL ===");



      // Create job seeker in database

      const jobSeeker = await this.jobSeekerModel.create(modelData);



      console.log("Job seeker created successfully:", jobSeeker);



      // Send success response

      res.status(201).json({

        success: true,

        message: "Job seeker created successfully",

        jobSeeker,

      });

    } catch (error) {

      console.error("Detailed error creating job seeker:", error);

      // Log the full error object to see all properties

      console.error(

        "Error object:",

        JSON.stringify(error, Object.getOwnPropertyNames(error))

      );



      res.status(500).json({

        success: false,

        message: "An error occurred while creating the job seeker",

        error:

          process.env.NODE_ENV === "production" ? undefined : error.message,

      });

    }

  }



  // Get all job seekers (archived param: 'true' = only archived, 'false' = exclude archived, omit = all - like jobs)

  async getAll(req, res) {

    try {

      const archivedParam = req.query?.archived;
      const archivedFilter = archivedParam === 'true' ? true : archivedParam === 'false' ? false : null;
      const jobSeekers = await this.jobSeekerModel.getAll(null, archivedFilter);
      const normalized = normalizeListCustomFields(jobSeekers);

      res.status(200).json({
        success: true,
        count: normalized.length,
        jobSeekers: normalized,
      });

    } catch (error) {

      console.error("Error getting job seekers:", error);

      res.status(500).json({

        success: false,

        message: "An error occurred while retrieving job seekers",

        error:

          process.env.NODE_ENV === "production" ? undefined : error.message,

      });

    }

  }



  // Get job seeker by ID

  async getById(req, res) {

    try {

      const { id } = req.params;



      // Get the current user's ID from the auth middleware

      const userId = req.user.id;

      const userRole = req.user.role;



      const jobSeeker = await this.jobSeekerModel.getById(id, null);

      if (!jobSeeker) {

        return res.status(404).json({

          success: false,

          message: "Job seeker not found",

        });

      }



      const normalizedJobSeeker = normalizeCustomFields(jobSeeker);
      res.status(200).json({
        success: true,
        jobSeeker: normalizedJobSeeker,
      });

    } catch (error) {

      console.error("Error getting job seeker:", error);

      res.status(500).json({

        success: false,

        message: "An error occurred while retrieving the job seeker",

        error:

          process.env.NODE_ENV === "production" ? undefined : error.message,

      });

    }

  }



  // Update job seeker by ID

  async update(req, res) {

    try {

      const { id } = req.params;

      const updateData = req.body;



      console.log(`Update request for job seeker ${id} received`);

      console.log("Request user:", req.user);

      console.log("Update data:", JSON.stringify(updateData, null, 2));



      // Get the current user's ID from the auth middleware

      const userId = req.user.id;

      const userRole = req.user.role;



      console.log(`User role: ${userRole}, User ID: ${userId}`);



      const jobSeeker = await this.jobSeekerModel.update(id, updateData, null);



      if (!jobSeeker) {

        console.log("Update failed - job seeker not found or no permission");

        return res.status(404).json({

          success: false,

          message:

            "Job seeker not found or you do not have permission to update it",

        });

      }



      console.log("Job seeker updated successfully:", jobSeeker);

      res.status(200).json({

        success: true,

        message: "Job seeker updated successfully",

        jobSeeker,

      });

    } catch (error) {

      console.error("Error updating job seeker:", error);



      // Check for specific error types

      if (

        error.message &&

        (error.message.includes("permission") ||

          error.message.includes("not found"))

      ) {

        return res.status(403).json({

          success: false,

          message: error.message,

        });

      }



      res.status(500).json({

        success: false,

        message: "An error occurred while updating the job seeker",

        error:

          process.env.NODE_ENV === "production" ? undefined : error.message,

      });

    }

  }

  // Bulk update job seekers
  async bulkUpdate(req, res) {
    try {
      console.log('=== BULK UPDATE REQUEST START ===');
      console.log('Request body:', JSON.stringify(req.body, null, 2));
      console.log('User ID:', req.user?.id);
      console.log('User:', req.user);

      const { ids, updates } = req.body;

      // Validate input
      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        console.error('Validation failed: IDs array is required and must not be empty');
        return res.status(400).json({
          success: false,
          message: 'IDs array is required and must not be empty'
        });
      }

      if (!updates || typeof updates !== 'object') {
        console.error('Validation failed: Updates object is required');
        return res.status(400).json({
          success: false,
          message: 'Updates object is required'
        });
      }

      const userId = req.user.id;
      const userRole = req.user.role;
      console.log('Processing bulk update for user:', userId, 'role:', userRole);
      console.log('Job Seeker IDs to update:', ids);
      console.log('Updates to apply:', JSON.stringify(updates, null, 2));

      const results = {
        successful: [],
        failed: [],
        errors: []
      };

      // Update each job seeker
      for (const id of ids) {
        try {
          console.log(`\n--- Processing job seeker ${id} ---`);
          const updateData = JSON.parse(JSON.stringify(updates));
          console.log(`Calling jobSeekerModel.update(${id}, updates, null)`);

          const jobSeeker = await this.jobSeekerModel.update(id, updateData, null);

          if (jobSeeker) {
            results.successful.push(id);
            console.log(`✅ Successfully updated job seeker ${id}`);
          } else {
            results.failed.push(id);
            results.errors.push({ id, error: 'Job seeker not found or permission denied' });
            console.error(`❌ Failed to update job seeker ${id}: not found or permission denied`);
          }
        } catch (error) {
          results.failed.push(id);
          const errorMsg = error.message || 'Unknown error';
          results.errors.push({ id, error: errorMsg });
          console.error(`❌ Error updating job seeker ${id}:`, errorMsg);
        }
      }

      console.log('\n=== BULK UPDATE RESULTS ===');
      console.log(`Successful: ${results.successful.length}/${ids.length}`);
      console.log(`Failed: ${results.failed.length}/${ids.length}`);
      console.log('=== BULK UPDATE REQUEST END ===\n');

      res.status(200).json({
        success: true,
        message: `Updated ${results.successful.length} of ${ids.length} job seekers`,
        results
      });
    } catch (error) {
      console.error('=== BULK UPDATE FATAL ERROR ===');
      console.error('Error:', error);
      res.status(500).json({
        success: false,
        message: 'An error occurred while bulk updating job seekers',
        error: process.env.NODE_ENV === 'production' ? undefined : error.message
      });
    }
  }

  // Delete job seeker by ID

  async delete(req, res) {

    try {

      const { id } = req.params;

      console.log(`Delete request for job seeker ${id} received`);



      // Get the current user's ID from the auth middleware

      const userId = req.user.id;

      const userRole = req.user.role;



      console.log(`User role: ${userRole}, User ID: ${userId}`);



      const jobSeeker = await this.jobSeekerModel.delete(id, null);



      if (!jobSeeker) {

        console.log("Delete failed - job seeker not found or no permission");

        return res.status(404).json({

          success: false,

          message:

            "Job seeker not found or you do not have permission to delete it",

        });

      }



      console.log("Job seeker deleted successfully:", jobSeeker.id);

      res.status(200).json({

        success: true,

        message: "Job seeker deleted successfully",

      });

    } catch (error) {

      console.error("Error deleting job seeker:", error);



      // Check for specific error types

      if (

        error.message &&

        (error.message.includes("permission") ||

          error.message.includes("not found"))

      ) {

        return res.status(403).json({

          success: false,

          message: error.message,

        });

      }



      res.status(500).json({

        success: false,

        message: "An error occurred while deleting the job seeker",

        error:

          process.env.NODE_ENV === "production" ? undefined : error.message,

      });

    }

  }



  // Add a note to a job seeker and update last contact date

  async addNote(req, res) {

    try {

      const { id } = req.params;

      const { text, note_type, action, about_references, aboutReferences, email_notification } = req.body;



      if (!text || !text.trim()) {

        return res.status(400).json({

          success: false,

          message: "Note text is required",

        });

      }



      // Get the current user's ID

      const userId = req.user.id;

      // Use about_references or aboutReferences (handle both naming conventions)
      const finalAboutReferences = about_references || aboutReferences;

      console.log(`Adding note to job seeker ${id} by user ${userId}`);



      // Add the note and update last contact date

      const note = await this.jobSeekerModel.addNoteAndUpdateContact(

        id,

        text,

        userId,

        note_type || 'General Note',

        action,

        finalAboutReferences

      );



      // Send email notifications if provided (non-blocking - don't fail note creation if email fails)
      if (email_notification && Array.isArray(email_notification) && email_notification.length > 0) {
        try {
          const emailService = require('../services/emailService');
          const jobSeeker = await this.jobSeekerModel.getById(id);
          const User = require('../models/user');
          const userModel = new User(this.jobSeekerModel.pool);
          const currentUser = await userModel.findById(userId);
          const userName = currentUser?.name || 'System User';

          const recipients = email_notification.filter(Boolean);

          if (recipients.length > 0) {
            const seekerName = jobSeeker?.fullName || `Job Seeker #${id}`;
            const subject = `New Note Added: ${seekerName}`;
            const htmlContent = `
              <html>
                <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                  <h2 style="color: #2563eb;">New Note Added</h2>
                  <p><strong>Job Seeker:</strong> ${seekerName}</p>
                  ${note_type ? `<p><strong>Note Type:</strong> ${note_type}</p>` : ''}
                  <p><strong>Added by:</strong> ${userName}</p>
                  <p><strong>Date:</strong> ${new Date().toLocaleString()}</p>
                  <hr style="border: 1px solid #e5e7eb; margin: 20px 0;">
                  <h3 style="color: #374151;">Note Text:</h3>
                  <div style="background-color: #f9fafb; padding: 15px; border-radius: 5px; white-space: pre-wrap;">${text}</div>
                  <p style="margin-top: 25px;">
                    <a href="${process.env.FRONTEND_URL ? `${process.env.FRONTEND_URL}/dashboard/job-seekers/view?id=${id}&tab=notes` : `${process.env.NEXT_PUBLIC_BASE_URL}/dashboard/job-seekers/view?id=${id}&tab=notes`}"
                      style="color: #2563eb; text-decoration: underline;"
                      target="_blank"
                    >View This Note Online</a>
                  </p>
                </body>
              </html>
            `;

            await emailService.sendMail({
              to: recipients,
              subject: subject,
              html: htmlContent
            });

            console.log(`Email notifications sent to ${recipients.length} recipient(s) for job seeker note ${note.id}`);
          }
        } catch (emailError) {
          console.error('Error sending email notifications:', emailError);
        }
      }



      return res.status(201).json({

        success: true,

        message: "Note added successfully and last contact date updated",

        note,

      });

    } catch (error) {

      console.error("Error adding note:", error);

      res.status(500).json({

        success: false,

        message: "An error occurred while adding the note",

        error:

          process.env.NODE_ENV === "production" ? undefined : error.message,

      });

    }

  }



  // Get notes for a job seeker

  async getNotes(req, res) {

    try {

      const { id } = req.params;



      // Get all notes for this job seeker

      const notes = await this.jobSeekerModel.getNotes(id);



      return res.status(200).json({

        success: true,

        count: notes.length,

        notes,

      });

    } catch (error) {

      console.error("Error getting notes:", error);

      res.status(500).json({

        success: false,

        message: "An error occurred while getting notes",

        error:

          process.env.NODE_ENV === "production" ? undefined : error.message,

      });

    }

  }



  // Get history for a job seeker

  async getHistory(req, res) {

    try {

      const { id } = req.params;



      // Get all history entries for this job seeker

      const history = await this.jobSeekerModel.getHistory(id);



      return res.status(200).json({

        success: true,

        count: history.length,

        history,

      });

    } catch (error) {

      console.error("Error getting history:", error);

      res.status(500).json({

        success: false,

        message: "An error occurred while getting history",


        error:

          process.env.NODE_ENV === "production" ? undefined : error.message,

      });

    }

  }



  // Get all documents for a job seeker

  async getDocuments(req, res) {

    try {

      const { id } = req.params;

      const documents = await this.documentModel.getByEntity("job_seeker", id);

      return res.status(200).json({

        success: true,

        count: documents.length,

        documents,

      });

    } catch (error) {

      console.error("Error getting documents:", error);

      return res.status(500).json({

        success: false,

        message: "An error occurred while getting documents",

        error: process.env.NODE_ENV === "production" ? undefined : error.message,

      });

    }

  }



  // Get a specific document

  async getDocument(req, res) {

    try {

      const { documentId } = req.params;

      const document = await this.documentModel.getById(documentId);

      if (!document) {

        return res.status(404).json({

          success: false,

          message: "Document not found",

        });

      }

      return res.status(200).json({

        success: true,

        document,

      });

    } catch (error) {

      console.error("Error getting document:", error);

      return res.status(500).json({

        success: false,

        message: "An error occurred while getting the document",

        error: process.env.NODE_ENV === "production" ? undefined : error.message,

      });

    }

  }



  // Add a new document

  async addDocument(req, res) {

    try {

      const { id } = req.params;

      const { document_name, document_type, content, file_path, file_size, mime_type } =

        req.body;

      if (!document_name) {

        return res.status(400).json({

          success: false,

          message: "Document name is required",

        });

      }

      const userId = req.user.id;

      const document = await this.documentModel.create({

        entity_type: "job_seeker",

        entity_id: id,

        document_name,

        document_type: document_type || "General",

        content: content || null,

        file_path: file_path || null,

        file_size: file_size || null,

        mime_type: mime_type || "text/plain",

        created_by: userId,

      });

      return res.status(201).json({

        success: true,

        message: "Document added successfully",

        document,

      });

    } catch (error) {

      console.error("Error adding document:", error);

      return res.status(500).json({

        success: false,

        message: "An error occurred while adding the document",

        error: process.env.NODE_ENV === "production" ? undefined : error.message,

      });

    }

  }

  // Upload document with file to Vercel Blob
  async uploadDocument(req, res) {
    try {
      const { id } = req.params;
      const { document_name, document_type, file } = req.body || {};

      if (!file) {
        return res.status(400).json({ success: false, message: "File is required" });
      }
      if (!document_name) {
        return res.status(400).json({ success: false, message: "Document name is required" });
      }

      const base64Data = typeof file === "string" ? file : file.data;
      const mimeType = typeof file === "string" ? (req.body.mime_type || "application/octet-stream") : file.type;
      const originalName = typeof file === "string" ? (req.body.file_name || "document") : file.name;

      if (!base64Data) {
        return res.status(400).json({ success: false, message: "File data is missing" });
      }

      const buffer = Buffer.from(base64Data, "base64");
      const userId = req.user.id;
      const timestamp = Date.now();
      const sanitizedName = originalName.replace(/[^a-zA-Z0-9.-]/g, "_");
      const fileName = `job_seekers/${id}/${timestamp}_${sanitizedName}`;

      const blob = await put(fileName, buffer, { access: "public", contentType: mimeType });

      const document = await this.documentModel.create({
        entity_type: "job_seeker",
        entity_id: id,
        document_name,
        document_type: document_type || "General",
        content: null,
        file_path: blob.url,
        file_size: buffer.length,
        mime_type: mimeType,
        created_by: userId,
      });

      return res.status(201).json({
        success: true,
        message: "Document uploaded successfully",
        document,
      });
    } catch (error) {
      console.error("Error uploading job seeker document:", error);
      return res.status(500).json({
        success: false,
        message: "An error occurred while uploading the document",
        error: process.env.NODE_ENV === "production" ? undefined : error.message,
      });
    }
  }

  // Update a document

  async updateDocument(req, res) {

    try {

      const { documentId } = req.params;

      const updateData = req.body;

      const document = await this.documentModel.update(documentId, updateData);

      if (!document) {

        return res.status(404).json({

          success: false,

          message: "Document not found",

        });

      }

      return res.status(200).json({

        success: true,

        message: "Document updated successfully",

        document,

      });

    } catch (error) {

      console.error("Error updating document:", error);

      return res.status(500).json({

        success: false,

        message: "An error occurred while updating the document",

        error: process.env.NODE_ENV === "production" ? undefined : error.message,

      });

    }

  }



  // Delete a document

  async deleteDocument(req, res) {

    try {

      const { documentId } = req.params;

      const document = await this.documentModel.delete(documentId);

      if (!document) {

        return res.status(404).json({

          success: false,

          message: "Document not found",

        });

      }

      return res.status(200).json({

        success: true,

        message: "Document deleted successfully",

      });

    } catch (error) {

      console.error("Error deleting document:", error);

      return res.status(500).json({

        success: false,

        message: "An error occurred while deleting the document",

        error: process.env.NODE_ENV === "production" ? undefined : error.message,

      });

    }

  }



  async getReferences(req, res) {

    try {

      const { id } = req.params;

      const userId = req.user.id;

      const userRole = req.user.role;

      const jobSeeker = await this.jobSeekerModel.getById(id, null);

      if (!jobSeeker) {

        return res.status(404).json({

          success: false,

          message: "Job seeker not found",

        });

      }

      const customFields =

        typeof jobSeeker.custom_fields === "string"

          ? JSON.parse(jobSeeker.custom_fields || "{}")

          : jobSeeker.custom_fields || {};

      const references = Array.isArray(customFields.references)

        ? customFields.references

        : [];

      return res.status(200).json({ success: true, references });

    } catch (error) {

      console.error("Error getting job seeker references:", error);

      return res.status(500).json({

        success: false,

        message: "An error occurred while retrieving references",

        error: process.env.NODE_ENV === "production" ? undefined : error.message,

      });

    }

  }



  async addReference(req, res) {

    try {

      const { id } = req.params;

      const userId = req.user.id;

      const reference = req.body || {};

      const jobSeeker = await this.jobSeekerModel.getById(id, null);

      if (!jobSeeker) {

        return res.status(404).json({

          success: false,

          message: "Job seeker not found",

        });

      }

      const customFields =

        typeof jobSeeker.custom_fields === "string"

          ? JSON.parse(jobSeeker.custom_fields || "{}")

          : jobSeeker.custom_fields || {};

      const existing = Array.isArray(customFields.references)

        ? customFields.references

        : [];

      const newReference = {

        id:

          reference.id ||

          `ref_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,

        name: reference.name || "",

        role: reference.role || "",

        company: reference.company || "",

        email: reference.email || "",

        phone: reference.phone || "",

        relationship: reference.relationship || "",

        created_at: new Date().toISOString(),

        created_by: userId,

      };

      const updatedReferences = [...existing, newReference];

      await this.jobSeekerModel.update(

        id,

        { custom_fields: { ...customFields, references: updatedReferences } },

        null

      );

      return res.status(201).json({

        success: true,

        reference: newReference,

        references: updatedReferences,

      });

    } catch (error) {

      console.error("Error adding job seeker reference:", error);

      return res.status(500).json({

        success: false,

        message: "An error occurred while adding the reference",

        error: process.env.NODE_ENV === "production" ? undefined : error.message,

      });

    }

  }



  async deleteReference(req, res) {

    try {

      const { id, referenceId } = req.params;

      const userId = req.user.id;

      const jobSeeker = await this.jobSeekerModel.getById(id, null);

      if (!jobSeeker) {

        return res.status(404).json({

          success: false,

          message: "Job seeker not found",

        });

      }

      const customFields =

        typeof jobSeeker.custom_fields === "string"

          ? JSON.parse(jobSeeker.custom_fields || "{}")

          : jobSeeker.custom_fields || {};

      const existing = Array.isArray(customFields.references)

        ? customFields.references

        : [];

      const updatedReferences = existing.filter(

        (r) => String(r?.id) !== String(referenceId)

      );

      await this.jobSeekerModel.update(

        id,

        { custom_fields: { ...customFields, references: updatedReferences } },

        null

      );

      return res.status(200).json({ success: true, references: updatedReferences });

    } catch (error) {

      console.error("Error deleting job seeker reference:", error);

      return res.status(500).json({

        success: false,

        message: "An error occurred while deleting the reference",

        error: process.env.NODE_ENV === "production" ? undefined : error.message,

      });

    }

  }

}



module.exports = JobSeekerController;

