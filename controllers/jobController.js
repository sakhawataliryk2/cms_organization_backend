// controllers/jobController.js
const Job = require('../models/job');
const Document = require('../models/document');

class JobController {
    constructor(pool) {
        this.jobModel = new Job(pool);
        this.documentModel = new Document(pool);
        this.create = this.create.bind(this);
        this.getAll = this.getAll.bind(this);
        this.getById = this.getById.bind(this);
        this.update = this.update.bind(this);
        this.delete = this.delete.bind(this);
        this.addNote = this.addNote.bind(this);
        this.getNotes = this.getNotes.bind(this);
        this.getHistory = this.getHistory.bind(this);
        this.exportToXML = this.exportToXML.bind(this);

        // Bind document methods
        this.getDocuments = this.getDocuments.bind(this);
        this.getDocument = this.getDocument.bind(this);
        this.addDocument = this.addDocument.bind(this);
        this.updateDocument = this.updateDocument.bind(this);
        this.deleteDocument = this.deleteDocument.bind(this);
    }

    // Initialize database tables
    async initTables() {
        await this.jobModel.initTable();
        await this.documentModel.initTable();
    }

    // Create a new job
    async create(req, res) {
        // Extract fields explicitly like Organizations (including custom_fields)
        const {
            jobTitle,
            category,
            organizationId,
            organization_id,
            hiringManager,
            status,
            priority,
            employmentType,
            startDate,
            worksiteLocation,
            remoteOption,
            jobDescription,
            salaryType,
            minSalary,
            maxSalary,
            benefits,
            requiredSkills,
            jobBoardStatus,
            owner,
            dateAdded,
            custom_fields, // Extract custom_fields from request
        } = req.body;

        console.log('Jobs Body', req.body);

        // Debug log all received fields
        // console.log("=== CREATE JOB REQUEST ===");
        // console.log("Full request body:", JSON.stringify(req.body, null, 2));
        // console.log("custom_fields in req.body:", req.body.custom_fields);
        // console.log("custom_fields type:", typeof req.body.custom_fields);
        // console.log("custom_fields is array:", Array.isArray(req.body.custom_fields));
        // console.log("custom_fields keys:", req.body.custom_fields ? Object.keys(req.body.custom_fields).length : 'null/undefined');
        // console.log("Extracted custom_fields:", custom_fields);
        // console.log("Extracted custom_fields type:", typeof custom_fields);
        // console.log("Extracted custom_fields keys:", custom_fields ? Object.keys(custom_fields).length : 'null/undefined');
        // console.log("=== END CREATE REQUEST ===");
        console.log("testcustom_fields:", custom_fields);

        try {
            // Get the current user's ID from the auth middleware
            const userId = req.user.id;

            const resolvedOrganizationId =
                organizationId !== undefined && organizationId !== null && organizationId !== ''
                    ? organizationId
                    : organization_id;

            // Build model data with custom_fields (same pattern as Organizations)
            const modelData = {
                jobTitle,
                category,
                organizationId: resolvedOrganizationId,
                hiringManager,
                status,
                priority,
                employmentType,
                startDate,
                worksiteLocation,
                remoteOption,
                jobDescription,
                salaryType,
                minSalary,
                maxSalary,
                benefits,
                requiredSkills,
                jobBoardStatus,
                owner,
                dateAdded,
                userId,
                custom_fields: custom_fields || {}, // ✅ Use snake_case to match model expectation
            };

            console.log("=== PASSING TO MODEL ===");
            console.log("custom_fields being passed:", JSON.stringify(modelData.custom_fields, null, 2));
            console.log("custom_fields type:", typeof modelData.custom_fields);
            console.log("custom_fields keys count:", modelData.custom_fields ? Object.keys(modelData.custom_fields).length : 0);
            console.log("=== END PASSING TO MODEL ===");

            // Create job in database
            console.log("testcustom_fields:", custom_fields);
            const job = await this.jobModel.create(modelData);

            console.log("Job created successfully:", job);

            // Send success response
            res.status(201).json({
                success: true,
                message: 'Job created successfully',
                job
            });
        } catch (error) {
            console.error('Detailed error creating job:', error);
            // Log the full error object to see all properties
            console.error('Error object:', JSON.stringify(error, Object.getOwnPropertyNames(error)));

            res.status(500).json({
                success: false,
                message: 'An error occurred while creating the job',
                error: process.env.NODE_ENV === 'production' ? undefined : error.message
            });
        }
    }

    // Get all jobs
    async getAll(req, res) {
        try {
            // Get the current user's ID from the auth middleware
            const userId = req.user.id;
            const userRole = req.user.role;

            // Only admin/owner can see all jobs, other users only see their own
            const jobs = await this.jobModel.getAll(
                ['admin', 'owner'].includes(userRole) ? null : userId
            );

            res.status(200).json({
                success: true,
                count: jobs.length,
                jobs
            });
        } catch (error) {
            console.error('Error getting jobs:', error);
            res.status(500).json({
                success: false,
                message: 'An error occurred while retrieving jobs',
                error: process.env.NODE_ENV === 'production' ? undefined : error.message
            });
        }
    }

    // Get job by ID
    async getById(req, res) {
        try {
            const { id } = req.params;

            // Get the current user's ID from the auth middleware
            const userId = req.user.id;
            const userRole = req.user.role;

            // Only admin/owner can see any job, other users only see their own
            const job = await this.jobModel.getById(
                id,
                ['admin', 'owner'].includes(userRole) ? null : userId
            );

            if (!job) {
                return res.status(404).json({
                    success: false,
                    message: 'Job not found or you do not have permission to view it'
                });
            }

            res.status(200).json({
                success: true,
                job
            });
        } catch (error) {
            console.error('Error getting job:', error);
            res.status(500).json({
                success: false,
                message: 'An error occurred while retrieving the job',
                error: process.env.NODE_ENV === 'production' ? undefined : error.message
            });
        }
    }

    // ENHANCED: Update job by ID with improved debugging
    async update(req, res) {
        try {
            const { id } = req.params;
            const updateData = req.body;

            console.log(`Update request for job ${id} received`);
            console.log("Request user:", req.user);
            console.log("Update data:", JSON.stringify(updateData, null, 2));

            // Get the current user's ID from the auth middleware
            const userId = req.user.id;
            const userRole = req.user.role;

            console.log(`User role: ${userRole}, User ID: ${userId}`);

            // For admin/owner roles, allow updating any job
            // For other roles, they can only update their own jobs
            const jobOwner = ['admin', 'owner'].includes(userRole) ? null : userId;

            // Try to update the job
            const job = await this.jobModel.update(
                id,
                updateData,
                jobOwner
            );

            if (!job) {
                console.log("Update failed - job not found or no permission");
                return res.status(404).json({
                    success: false,
                    message: 'Job not found or you do not have permission to update it'
                });
            }

            console.log("Job updated successfully:", job);
            res.status(200).json({
                success: true,
                message: 'Job updated successfully',
                job
            });
        } catch (error) {
            console.error('Error updating job:', error);

            // Check for specific error types
            if (error.message && (error.message.includes('permission') || error.message.includes('not found'))) {
                return res.status(403).json({
                    success: false,
                    message: error.message
                });
            }

            res.status(500).json({
                success: false,
                message: 'An error occurred while updating the job',
                error: process.env.NODE_ENV === 'production' ? undefined : error.message
            });
        }
    }

    // Delete job by ID
    async delete(req, res) {
        try {
            const { id } = req.params;
            console.log(`Delete request for job ${id} received`);

            // Get the current user's ID from the auth middleware
            const userId = req.user.id;
            const userRole = req.user.role;

            console.log(`User role: ${userRole}, User ID: ${userId}`);

            // Only admin/owner can delete any job, others only their own
            const jobOwner = ['admin', 'owner'].includes(userRole) ? null : userId;

            // Delete the job
            const job = await this.jobModel.delete(
                id,
                jobOwner
            );

            if (!job) {
                console.log("Delete failed - job not found or no permission");
                return res.status(404).json({
                    success: false,
                    message: 'Job not found or you do not have permission to delete it'
                });
            }

            console.log("Job deleted successfully:", job.id);
            res.status(200).json({
                success: true,
                message: 'Job deleted successfully'
            });
        } catch (error) {
            console.error('Error deleting job:', error);

            // Check for specific error types
            if (error.message && (error.message.includes('permission') || error.message.includes('not found'))) {
                return res.status(403).json({
                    success: false,
                    message: error.message
                });
            }

            res.status(500).json({
                success: false,
                message: 'An error occurred while deleting the job',
                error: process.env.NODE_ENV === 'production' ? undefined : error.message
            });
        }
    }

    // Add a note to a job
    async addNote(req, res) {
        try {
            const { id } = req.params;
            const { text } = req.body;

            if (!text || !text.trim()) {
                return res.status(400).json({
                    success: false,
                    message: 'Note text is required'
                });
            }

            // Get the current user's ID
            const userId = req.user.id;

            // Add the note
            const note = await this.jobModel.addNote(id, text, userId);

            return res.status(201).json({
                success: true,
                message: 'Note added successfully',
                note
            });
        } catch (error) {
            console.error('Error adding note:', error);
            res.status(500).json({
                success: false,
                message: 'An error occurred while adding the note',
                error: process.env.NODE_ENV === 'production' ? undefined : error.message
            });
        }
    }

    // Get notes for a job
    async getNotes(req, res) {
        try {
            const { id } = req.params;

            // Get all notes for this job
            const notes = await this.jobModel.getNotes(id);

            return res.status(200).json({
                success: true,
                count: notes.length,
                notes
            });
        } catch (error) {
            console.error('Error getting notes:', error);
            res.status(500).json({
                success: false,
                message: 'An error occurred while getting notes',
                error: process.env.NODE_ENV === 'production' ? undefined : error.message
            });
        }
    }

    // Get history for a job
    async getHistory(req, res) {
        try {
            const { id } = req.params;

            // Get all history entries for this job
            const history = await this.jobModel.getHistory(id);

            return res.status(200).json({
                success: true,
                count: history.length,
                history
            });
        } catch (error) {
            console.error('Error getting history:', error);
            res.status(500).json({
                success: false,
                message: 'An error occurred while getting history',
                error: process.env.NODE_ENV === 'production' ? undefined : error.message
            });
        }
    }

    // Document methods

    // Get all documents for a job
    async getDocuments(req, res) {
        try {
            const { id } = req.params;

            const documents = await this.documentModel.getByEntity('job', id);

            return res.status(200).json({
                success: true,
                count: documents.length,
                documents
            });
        } catch (error) {
            console.error('Error getting job documents:', error);
            res.status(500).json({
                success: false,
                message: 'An error occurred while getting documents',
                error: process.env.NODE_ENV === 'production' ? undefined : error.message
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
                    message: 'Document not found'
                });
            }

            return res.status(200).json({
                success: true,
                document
            });
        } catch (error) {
            console.error('Error getting job document:', error);
            res.status(500).json({
                success: false,
                message: 'An error occurred while getting the document',
                error: process.env.NODE_ENV === 'production' ? undefined : error.message
            });
        }
    }

    // Add a new document
    async addDocument(req, res) {
        try {
            const { id } = req.params;
            const { document_name, document_type, content, file_path, file_size, mime_type } = req.body;

            if (!document_name) {
                return res.status(400).json({
                    success: false,
                    message: 'Document name is required'
                });
            }

            const userId = req.user.id;

            const document = await this.documentModel.create({
                entity_type: 'job',
                entity_id: id,
                document_name,
                document_type: document_type || 'General',
                content: content || null,
                file_path: file_path || null,
                file_size: file_size || null,
                mime_type: mime_type || 'text/plain',
                created_by: userId
            });

            // Mirror document to organization if job has an organization_id
            // try {
            //     const userRole = req.user.role;
            //     const job = await this.jobModel.getById(
            //         id,
            //         ['admin', 'owner'].includes(userRole) ? null : userId
            //     );
            //     const organizationId = job?.organization_id;
            //     if (organizationId) {
            //         await this.documentModel.create({
            //             entity_type: 'organization',
            //             entity_id: organizationId,
            //             document_name,
            //             document_type: document_type || 'General',
            //             content: content || null,
            //             file_path: file_path || null,
            //             file_size: file_size || null,
            //             mime_type: mime_type || 'text/plain',
            //             created_by: userId
            //         });
            //     }
            //     console.log("Document mirrored to organization successfully");
            // } catch (mirrorError) {
            //     console.error('Error mirroring job document to organization:', mirrorError);
            // }

            return res.status(201).json({
                success: true,
                message: 'Document added successfully',
                document
            });
        } catch (error) {
            console.error('Error adding job document:', error);
            res.status(500).json({
                success: false,
                message: 'An error occurred while adding the document',
                error: process.env.NODE_ENV === 'production' ? undefined : error.message
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
                    message: 'Document not found'
                });
            }

            return res.status(200).json({
                success: true,
                message: 'Document updated successfully',
                document
            });
        } catch (error) {
            console.error('Error updating job document:', error);
            res.status(500).json({
                success: false,
                message: 'An error occurred while updating the document',
                error: process.env.NODE_ENV === 'production' ? undefined : error.message
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
                    message: 'Document not found'
                });
            }

            return res.status(200).json({
                success: true,
                message: 'Document deleted successfully'
            });
        } catch (error) {
            console.error('Error deleting job document:', error);
            res.status(500).json({
                success: false,
                message: 'An error occurred while deleting the document',
                error: process.env.NODE_ENV === 'production' ? undefined : error.message
            });
        }
    }

    // Export jobs to XML
    async exportToXML(req, res) {
        try {
            const { ids } = req.query; // Comma-separated job IDs
            const userId = req.user.id;
            const userRole = req.user.role;

            // Parse job IDs
            const jobIds = ids ? ids.split(',').map(id => id.trim()) : [];

            if (jobIds.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'No job IDs provided'
                });
            }

            console.log(`Exporting ${jobIds.length} jobs to XML for user ${userId} (${userRole})`);

            // Fetch jobs
            const jobs = await this.jobModel.getByIds(
                jobIds,
                ['admin', 'owner'].includes(userRole) ? null : userId
            );

            if (jobs.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'No jobs found or you do not have permission to export them'
                });
            }

            console.log(`Found ${jobs.length} jobs to export`);

            // Generate XML
            const xml = this.generateJobXML(jobs);

            // Set headers for XML download
            res.setHeader('Content-Type', 'application/xml; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="jobs_export_${Date.now()}.xml"`);
            res.status(200).send(xml);
        } catch (error) {
            console.error('Error exporting jobs to XML:', error);
            res.status(500).json({
                success: false,
                message: 'An error occurred while exporting jobs',
                error: process.env.NODE_ENV === 'production' ? undefined : error.message
            });
        }
    }


    // Helper method to generate XML from jobs
    generateJobXML(jobs) {
        let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
        xml += '<jobs>\n';

        jobs.forEach(job => {
            xml += '  <job>\n';

            // Basic Information
            xml += '    <!-- Basic Information -->\n';
            xml += `    <id>${this.escapeXML(job.id)}</id>\n`;
            xml += `    <title>${this.escapeXML(job.job_title)}</title>\n`;
            xml += `    <category>${this.escapeXML(job.category)}</category>\n`;
            xml += `    <status>${this.escapeXML(job.status)}</status>\n`;
            xml += `    <priority>${this.escapeXML(job.priority)}</priority>\n`;
            xml += `    <employmentType>${this.escapeXML(job.employment_type)}</employmentType>\n`;

            // Organization & People
            xml += '    <!-- Organization & People -->\n';
            xml += `    <organization>${this.escapeXML(job.organization_name)}</organization>\n`;
            xml += `    <organizationId>${this.escapeXML(job.organization_id)}</organizationId>\n`;
            xml += `    <hiringManager>${this.escapeXML(job.hiring_manager)}</hiringManager>\n`;
            xml += `    <owner>${this.escapeXML(job.owner)}</owner>\n`;
            xml += `    <createdBy>${this.escapeXML(job.created_by_name)}</createdBy>\n`;

            // Location & Remote
            xml += '    <!-- Location & Remote -->\n';
            xml += `    <location>${this.escapeXML(job.worksite_location)}</location>\n`;
            xml += `    <remoteOption>${this.escapeXML(job.remote_option)}</remoteOption>\n`;

            // Compensation
            xml += '    <!-- Compensation -->\n';
            xml += `    <salaryType>${this.escapeXML(job.salary_type)}</salaryType>\n`;
            xml += `    <minSalary>${this.escapeXML(job.min_salary)}</minSalary>\n`;
            xml += `    <maxSalary>${this.escapeXML(job.max_salary)}</maxSalary>\n`;
            xml += `    <benefits>${this.escapeXML(job.benefits)}</benefits>\n`;

            // Job Details
            xml += '    <!-- Job Details -->\n';
            xml += `    <description>${this.escapeXML(job.job_description)}</description>\n`;
            xml += `    <requiredSkills>${this.escapeXML(job.required_skills)}</requiredSkills>\n`;
            xml += `    <startDate>${this.escapeXML(job.start_date)}</startDate>\n`;

            // Job Board
            xml += '    <!-- Job Board -->\n';
            xml += `    <jobBoardStatus>${this.escapeXML(job.job_board_status)}</jobBoardStatus>\n`;

            // Dates
            xml += '    <!-- Dates -->\n';
            xml += `    <dateAdded>${this.escapeXML(job.date_added)}</dateAdded>\n`;
            xml += `    <createdAt>${this.escapeXML(job.created_at)}</createdAt>\n`;
            xml += `    <updatedAt>${this.escapeXML(job.updated_at)}</updatedAt>\n`;

            // Include custom fields if present (excluding duplicates of main fields)
            if (job.custom_fields) {
                const customFields = typeof job.custom_fields === 'string'
                    ? JSON.parse(job.custom_fields)
                    : job.custom_fields;

                // List of main field names to exclude from custom fields
                const mainFields = [
                    'job title', 'title', 'category', 'status', 'priority',
                    'employment type', 'organization', 'hiring manager', 'owner',
                    'location', 'worksite location', 'remote option', 'salary type',
                    'min salary', 'max salary', 'benefits', 'description',
                    'job description', 'required skills', 'start date',
                    'job board status', 'date added', 'created at', 'updated at'
                ];

                // Filter out custom fields that duplicate main fields
                const filteredCustomFields = Object.entries(customFields).filter(([key]) => {
                    const normalizedKey = key.toLowerCase().trim();
                    return !mainFields.includes(normalizedKey);
                });

                if (filteredCustomFields.length > 0) {
                    xml += '    <!-- Custom Fields -->\n';
                    xml += '    <customFields>\n';
                    filteredCustomFields.forEach(([key, value]) => {
                        xml += `      <field name="${this.escapeXML(key)}">${this.escapeXML(value)}</field>\n`;
                    });
                    xml += '    </customFields>\n';
                }
            }

            xml += '  </job>\n';
        });

        xml += '</jobs>';
        return xml;
    }

    // Helper to escape XML special characters
    escapeXML(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }
}

module.exports = JobController;