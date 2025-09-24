// controllers/jobController.js
const Job = require('../models/job');

class JobController {
    constructor(pool) {
        this.jobModel = new Job(pool);
        this.create = this.create.bind(this);
        this.getAll = this.getAll.bind(this);
        this.getById = this.getById.bind(this);
        this.update = this.update.bind(this);
        this.delete = this.delete.bind(this);
        this.addNote = this.addNote.bind(this);
        this.getNotes = this.getNotes.bind(this);
        this.getHistory = this.getHistory.bind(this);
    }

    // Initialize database tables
    async initTables() {
        await this.jobModel.initTable();
    }

    // Create a new job
    async create(req, res) {
        // Extract all fields from the request body
        const jobData = req.body;

        console.log("Create job request body:", req.body);

        // Basic validation
        if (!jobData.jobTitle) {
            return res.status(400).json({
                success: false,
                message: 'Job title is required'
            });
        }

        try {
            // Get the current user's ID from the auth middleware
            const userId = req.user.id;

            // Add userId to the job data
            jobData.userId = userId;

            console.log("Attempting to create job with data:", jobData);

            // Create job in database
            const job = await this.jobModel.create(jobData);

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
}

module.exports = JobController;