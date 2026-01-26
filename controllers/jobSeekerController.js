const JobSeeker = require("../models/jobseeker");
const Document = require("../models/document");

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

    this.delete = this.delete.bind(this);

    this.addNote = this.addNote.bind(this);

    this.getNotes = this.getNotes.bind(this);

    this.getHistory = this.getHistory.bind(this);

    this.getReferences = this.getReferences.bind(this);

    this.addReference = this.addReference.bind(this);

    this.deleteReference = this.deleteReference.bind(this);

     this.getDocuments = this.getDocuments.bind(this);

     this.getDocument = this.getDocument.bind(this);

     this.addDocument = this.addDocument.bind(this);

     this.updateDocument = this.updateDocument.bind(this);

     this.deleteDocument = this.deleteDocument.bind(this);

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



  // Get all job seekers

  async getAll(req, res) {

    try {

      // Get the current user's ID from the auth middleware

      const userId = req.user.id;

      const userRole = req.user.role;



      // Only admin/owner can see all job seekers, other users only see their own

      const jobSeekers = await this.jobSeekerModel.getAll(

        ["admin", "owner"].includes(userRole) ? null : userId

      );



      res.status(200).json({

        success: true,

        count: jobSeekers.length,

        jobSeekers,

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



      // Only admin/owner can see any job seeker, other users only see their own

      const jobSeeker = await this.jobSeekerModel.getById(

        id,

        ["admin", "owner"].includes(userRole) ? null : userId

      );



      if (!jobSeeker) {

        return res.status(404).json({

          success: false,

          message:

            "Job seeker not found or you do not have permission to view it",

        });

      }



      res.status(200).json({

        success: true,

        jobSeeker,

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



      // For admin/owner roles, allow updating any job seeker

      // For other roles, they can only update their own job seekers

      const jobSeekerOwner = ["admin", "owner"].includes(userRole)

        ? null

        : userId;



      // Try to update the job seeker

      const jobSeeker = await this.jobSeekerModel.update(

        id,

        updateData,

        jobSeekerOwner

      );



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



  // Delete job seeker by ID

  async delete(req, res) {

    try {

      const { id } = req.params;

      console.log(`Delete request for job seeker ${id} received`);



      // Get the current user's ID from the auth middleware

      const userId = req.user.id;

      const userRole = req.user.role;



      console.log(`User role: ${userRole}, User ID: ${userId}`);



      // Only admin/owner can delete any job seeker, others only their own

      const jobSeekerOwner = ["admin", "owner"].includes(userRole)

        ? null

        : userId;



      // Delete the job seeker

      const jobSeeker = await this.jobSeekerModel.delete(id, jobSeekerOwner);



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

      const { text, note_type } = req.body;



      if (!text || !text.trim()) {

        return res.status(400).json({

          success: false,

          message: "Note text is required",

        });

      }



      // Get the current user's ID

      const userId = req.user.id;



      console.log(`Adding note to job seeker ${id} by user ${userId}`);



      // Add the note and update last contact date

      const note = await this.jobSeekerModel.addNoteAndUpdateContact(

        id,

        text,

        userId,

        note_type || 'General Note'

      );



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

      const jobSeeker = await this.jobSeekerModel.getById(

        id,

        ["admin", "owner"].includes(userRole) ? null : userId

      );

      if (!jobSeeker) {

        return res.status(404).json({

          success: false,

          message:

            "Job seeker not found or you do not have permission to view it",

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

      const userRole = req.user.role;

      const jobSeekerOwner = ["admin", "owner"].includes(userRole)

        ? null

        : userId;

      const reference = req.body || {};

      const jobSeeker = await this.jobSeekerModel.getById(id, jobSeekerOwner);

      if (!jobSeeker) {

        return res.status(404).json({

          success: false,

          message:

            "Job seeker not found or you do not have permission to update it",

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

        jobSeekerOwner

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

      const userRole = req.user.role;

      const jobSeekerOwner = ["admin", "owner"].includes(userRole)

        ? null

        : userId;

      const jobSeeker = await this.jobSeekerModel.getById(id, jobSeekerOwner);

      if (!jobSeeker) {

        return res.status(404).json({

          success: false,

          message:

            "Job seeker not found or you do not have permission to update it",

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

        jobSeekerOwner

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

