const JobSeeker = require('../models/jobseeker');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

class JobSeekerController {
    constructor(pool) {
        this.jobSeekerModel = new JobSeeker(pool);
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
        await this.jobSeekerModel.initTable();
    }

    // Create a new job seeker
    async create(req, res) {
        // Extract all fields from the request body
        const jobSeekerData = req.body;

        console.log("Create job seeker request body:", req.body);

        // Basic validation
        if (!jobSeekerData.firstName || !jobSeekerData.lastName) {
            return res.status(400).json({
                success: false,
                message: 'First name and last name are required'
            });
        }

        try {
            // Get the current user's ID from the auth middleware
            const userId = req.user.id;

            // Add userId to the job seeker data
            jobSeekerData.userId = userId;

            console.log("Attempting to create job seeker with data:", jobSeekerData);

            // Create job seeker in database
            const jobSeeker = await this.jobSeekerModel.create(jobSeekerData);

            console.log("Job seeker created successfully:", jobSeeker);

            // Send success response
            res.status(201).json({
                success: true,
                message: 'Job seeker created successfully',
                jobSeeker
            });
        } catch (error) {
            console.error('Detailed error creating job seeker:', error);
            // Log the full error object to see all properties
            console.error('Error object:', JSON.stringify(error, Object.getOwnPropertyNames(error)));

            res.status(500).json({
                success: false,
                message: 'An error occurred while creating the job seeker',
                error: process.env.NODE_ENV === 'production' ? undefined : error.message
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
                ['admin', 'owner'].includes(userRole) ? null : userId
            );

            res.status(200).json({
                success: true,
                count: jobSeekers.length,
                jobSeekers
            });
        } catch (error) {
            console.error('Error getting job seekers:', error);
            res.status(500).json({
                success: false,
                message: 'An error occurred while retrieving job seekers',
                error: process.env.NODE_ENV === 'production' ? undefined : error.message
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
                ['admin', 'owner'].includes(userRole) ? null : userId
            );

            if (!jobSeeker) {
                return res.status(404).json({
                    success: false,
                    message: 'Job seeker not found or you do not have permission to view it'
                });
            }

            res.status(200).json({
                success: true,
                jobSeeker
            });
        } catch (error) {
            console.error('Error getting job seeker:', error);
            res.status(500).json({
                success: false,
                message: 'An error occurred while retrieving the job seeker',
                error: process.env.NODE_ENV === 'production' ? undefined : error.message
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
            const jobSeekerOwner = ['admin', 'owner'].includes(userRole) ? null : userId;

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
                    message: 'Job seeker not found or you do not have permission to update it'
                });
            }

            console.log("Job seeker updated successfully:", jobSeeker);
            res.status(200).json({
                success: true,
                message: 'Job seeker updated successfully',
                jobSeeker
            });
        } catch (error) {
            console.error('Error updating job seeker:', error);

            // Check for specific error types
            if (error.message && (error.message.includes('permission') || error.message.includes('not found'))) {
                return res.status(403).json({
                    success: false,
                    message: error.message
                });
            }

            res.status(500).json({
                success: false,
                message: 'An error occurred while updating the job seeker',
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

            // Only admin/owner can delete any job seeker, others only their own
            const jobSeekerOwner = ['admin', 'owner'].includes(userRole) ? null : userId;

            // Delete the job seeker
            const jobSeeker = await this.jobSeekerModel.delete(
                id,
                jobSeekerOwner
            );

            if (!jobSeeker) {
                console.log("Delete failed - job seeker not found or no permission");
                return res.status(404).json({
                    success: false,
                    message: 'Job seeker not found or you do not have permission to delete it'
                });
            }

            console.log("Job seeker deleted successfully:", jobSeeker.id);
            res.status(200).json({
                success: true,
                message: 'Job seeker deleted successfully'
            });
        } catch (error) {
            console.error('Error deleting job seeker:', error);

            // Check for specific error types
            if (error.message && (error.message.includes('permission') || error.message.includes('not found'))) {
                return res.status(403).json({
                    success: false,
                    message: error.message
                });
            }

            res.status(500).json({
                success: false,
                message: 'An error occurred while deleting the job seeker',
                error: process.env.NODE_ENV === 'production' ? undefined : error.message
            });
        }
    }

    // Add a note to a job seeker and update last contact date
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

            console.log(`Adding note to job seeker ${id} by user ${userId}`);

            // Add the note and update last contact date
            const note = await this.jobSeekerModel.addNoteAndUpdateContact(id, text, userId);

            return res.status(201).json({
                success: true,
                message: 'Note added successfully and last contact date updated',
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

    // Get notes for a job seeker
    async getNotes(req, res) {
        try {
            const { id } = req.params;

            // Get all notes for this job seeker
            const notes = await this.jobSeekerModel.getNotes(id);

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

    // Get history for a job seeker
    async getHistory(req, res) {
        try {
            const { id } = req.params;

            // Get all history entries for this job seeker
            const history = await this.jobSeekerModel.getHistory(id);

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

module.exports = JobSeekerController;