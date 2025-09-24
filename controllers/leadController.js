const Lead = require('../models/lead');

class LeadController {
    constructor(pool) {
        this.leadModel = new Lead(pool);
        this.create = this.create.bind(this);
        this.getAll = this.getAll.bind(this);
        this.getById = this.getById.bind(this);
        this.update = this.update.bind(this);
        this.delete = this.delete.bind(this);
        this.addNote = this.addNote.bind(this);
        this.getNotes = this.getNotes.bind(this);
        this.getHistory = this.getHistory.bind(this);
        this.getByOrganization = this.getByOrganization.bind(this);
        this.search = this.search.bind(this);
        this.getStats = this.getStats.bind(this);
    }

    // Initialize database tables
    async initTables() {
        try {
            await this.leadModel.initTable();
            console.log('✅ Lead tables initialized successfully');
        } catch (error) {
            console.error('❌ Error initializing lead tables:', error);
            throw error;
        }
    }

    // Create a new lead
    async create(req, res) {
        const leadData = req.body;

        console.log("Create lead request body:", req.body);

        // Basic validation
        if (!leadData.firstName || !leadData.lastName) {
            return res.status(400).json({
                success: false,
                message: 'First name and last name are required'
            });
        }

        // Email validation if provided
        if (leadData.email) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(leadData.email)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid email format'
                });
            }
        }

        // Validate second email if provided
        if (leadData.email2) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(leadData.email2)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid format for second email'
                });
            }
        }

        try {
            // Get the current user's ID from the auth middleware
            const userId = req.user.id;

            // Add userId to the lead data
            leadData.userId = userId;

            console.log("Attempting to create lead with data:", leadData);

            // Create lead in database
            const lead = await this.leadModel.create(leadData);

            console.log("Lead created successfully:", lead);

            // Send success response
            res.status(201).json({
                success: true,
                message: 'Lead created successfully',
                lead
            });
        } catch (error) {
            console.error('Detailed error creating lead:', error);
            console.error('Error object:', JSON.stringify(error, Object.getOwnPropertyNames(error)));

            // Handle specific database errors
            if (error.code === '23505') { // Unique constraint violation
                return res.status(409).json({
                    success: false,
                    message: 'A lead with this email already exists'
                });
            }

            if (error.code === '23503') { // Foreign key constraint violation
                return res.status(400).json({
                    success: false,
                    message: 'Referenced organization does not exist'
                });
            }

            res.status(500).json({
                success: false,
                message: 'An error occurred while creating the lead',
                error: process.env.NODE_ENV === 'production' ? undefined : error.message
            });
        }
    }

    // Get all leads
    async getAll(req, res) {
        try {
            console.log('Getting all leads...');

            // Get the current user's ID from the auth middleware
            const userId = req.user.id;
            const userRole = req.user.role;

            console.log(`User ID: ${userId}, User Role: ${userRole}`);

            // Only admin/owner can see all leads, other users only see their own
            const leads = await this.leadModel.getAll(
                ['admin', 'owner'].includes(userRole) ? null : userId
            );

            console.log(`Found ${leads.length} leads`);

            res.status(200).json({
                success: true,
                count: leads.length,
                leads
            });
        } catch (error) {
            console.error('Error getting leads:', error);
            res.status(500).json({
                success: false,
                message: 'An error occurred while retrieving leads',
                error: process.env.NODE_ENV === 'production' ? undefined : error.message
            });
        }
    }

    // Get lead by ID
    async getById(req, res) {
        try {
            const { id } = req.params;
            console.log(`Getting lead by ID: ${id}`);

            // Validate ID format
            if (!id || isNaN(parseInt(id))) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid lead ID'
                });
            }

            // Get the current user's ID from the auth middleware
            const userId = req.user.id;
            const userRole = req.user.role;

            console.log(`User ID: ${userId}, User Role: ${userRole}`);

            // Only admin/owner can see any lead, other users only see their own
            const lead = await this.leadModel.getById(
                id,
                ['admin', 'owner'].includes(userRole) ? null : userId
            );

            if (!lead) {
                return res.status(404).json({
                    success: false,
                    message: 'Lead not found or you do not have permission to view it'
                });
            }

            console.log(`Successfully retrieved lead: ${lead.id}`);

            res.status(200).json({
                success: true,
                lead
            });
        } catch (error) {
            console.error('Error getting lead:', error);
            res.status(500).json({
                success: false,
                message: 'An error occurred while retrieving the lead',
                error: process.env.NODE_ENV === 'production' ? undefined : error.message
            });
        }
    }

    // Update lead by ID
    async update(req, res) {
        try {
            const { id } = req.params;
            const updateData = req.body;

            console.log(`Update request for lead ${id} received`);
            console.log("Request user:", req.user);
            console.log("Update data:", JSON.stringify(updateData, null, 2));

            // Validate ID format
            if (!id || isNaN(parseInt(id))) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid lead ID'
                });
            }

            // Validate email format if provided
            if (updateData.email) {
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (!emailRegex.test(updateData.email)) {
                    return res.status(400).json({
                        success: false,
                        message: 'Invalid email format'
                    });
                }
            }

            // Validate second email if provided
            if (updateData.email2) {
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (!emailRegex.test(updateData.email2)) {
                    return res.status(400).json({
                        success: false,
                        message: 'Invalid format for second email'
                    });
                }
            }

            // Get the current user's ID from the auth middleware
            const userId = req.user.id;
            const userRole = req.user.role;

            console.log(`User role: ${userRole}, User ID: ${userId}`);

            // For admin/owner roles, allow updating any lead
            // For other roles, they can only update their own leads
            const leadOwner = ['admin', 'owner'].includes(userRole) ? null : userId;

            // Try to update the lead
            const lead = await this.leadModel.update(
                id,
                updateData,
                leadOwner
            );

            if (!lead) {
                console.log("Update failed - lead not found or no permission");
                return res.status(404).json({
                    success: false,
                    message: 'Lead not found or you do not have permission to update it'
                });
            }

            console.log("Lead updated successfully:", lead);
            res.status(200).json({
                success: true,
                message: 'Lead updated successfully',
                lead
            });
        } catch (error) {
            console.error('Error updating lead:', error);

            // Handle specific database errors
            if (error.code === '23505') { // Unique constraint violation
                return res.status(409).json({
                    success: false,
                    message: 'A lead with this email already exists'
                });
            }

            if (error.code === '23503') { // Foreign key constraint violation
                return res.status(400).json({
                    success: false,
                    message: 'Referenced organization does not exist'
                });
            }

            // Check for specific error types
            if (error.message && (error.message.includes('permission') || error.message.includes('not found'))) {
                return res.status(403).json({
                    success: false,
                    message: error.message
                });
            }

            res.status(500).json({
                success: false,
                message: 'An error occurred while updating the lead',
                error: process.env.NODE_ENV === 'production' ? undefined : error.message
            });
        }
    }

    // Delete lead by ID
    async delete(req, res) {
        try {
            const { id } = req.params;
            console.log(`Delete request for lead ${id} received`);

            // Validate ID format
            if (!id || isNaN(parseInt(id))) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid lead ID'
                });
            }

            // Get the current user's ID from the auth middleware
            const userId = req.user.id;
            const userRole = req.user.role;

            console.log(`User role: ${userRole}, User ID: ${userId}`);

            // Only admin/owner can delete any lead, others only their own
            const leadOwner = ['admin', 'owner'].includes(userRole) ? null : userId;

            // Delete the lead
            const lead = await this.leadModel.delete(
                id,
                leadOwner
            );

            if (!lead) {
                console.log("Delete failed - lead not found or no permission");
                return res.status(404).json({
                    success: false,
                    message: 'Lead not found or you do not have permission to delete it'
                });
            }

            console.log("Lead deleted successfully:", lead.id);
            res.status(200).json({
                success: true,
                message: 'Lead deleted successfully'
            });
        } catch (error) {
            console.error('Error deleting lead:', error);

            // Check for specific error types
            if (error.message && (error.message.includes('permission') || error.message.includes('not found'))) {
                return res.status(403).json({
                    success: false,
                    message: error.message
                });
            }

            // Handle foreign key constraint errors (if lead is referenced elsewhere)
            if (error.code === '23503') {
                return res.status(409).json({
                    success: false,
                    message: 'Cannot delete lead as it is referenced by other records'
                });
            }

            res.status(500).json({
                success: false,
                message: 'An error occurred while deleting the lead',
                error: process.env.NODE_ENV === 'production' ? undefined : error.message
            });
        }
    }

    // Add a note to a lead
    async addNote(req, res) {
        try {
            const { id } = req.params;
            const { text } = req.body;

            console.log(`Adding note to lead ${id}`);

            // Validate ID format
            if (!id || isNaN(parseInt(id))) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid lead ID'
                });
            }

            if (!text || !text.trim()) {
                return res.status(400).json({
                    success: false,
                    message: 'Note text is required'
                });
            }

            // Get the current user's ID
            const userId = req.user.id;

            // Add the note and update last contact date
            const note = await this.leadModel.addNote(id, text, userId);

            console.log("Note added successfully:", note);

            return res.status(201).json({
                success: true,
                message: 'Note added successfully and last contact date updated',
                note
            });
        } catch (error) {
            console.error('Error adding note:', error);

            // Handle case where lead doesn't exist
            if (error.code === '23503') {
                return res.status(404).json({
                    success: false,
                    message: 'Lead not found'
                });
            }

            res.status(500).json({
                success: false,
                message: 'An error occurred while adding the note',
                error: process.env.NODE_ENV === 'production' ? undefined : error.message
            });
        }
    }

    // Get notes for a lead
    async getNotes(req, res) {
        try {
            const { id } = req.params;

            console.log(`Getting notes for lead ${id}`);

            // Validate ID format
            if (!id || isNaN(parseInt(id))) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid lead ID'
                });
            }

            // Get all notes for this lead
            const notes = await this.leadModel.getNotes(id);

            console.log(`Found ${notes.length} notes for lead ${id}`);

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

    // Get history for a lead
    async getHistory(req, res) {
        try {
            const { id } = req.params;

            console.log(`Getting history for lead ${id}`);

            // Validate ID format
            if (!id || isNaN(parseInt(id))) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid lead ID'
                });
            }

            // Get all history entries for this lead
            const history = await this.leadModel.getHistory(id);

            console.log(`Found ${history.length} history entries for lead ${id}`);

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

    // Get leads by organization
    async getByOrganization(req, res) {
        try {
            const { organizationId } = req.params;

            console.log(`Getting leads for organization ${organizationId}`);

            // Validate organization ID format
            if (!organizationId || isNaN(parseInt(organizationId))) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid organization ID'
                });
            }

            // Get the current user's ID from the auth middleware
            const userId = req.user.id;
            const userRole = req.user.role;

            // Get leads for this organization
            const leads = await this.leadModel.getByOrganization(
                organizationId,
                ['admin', 'owner'].includes(userRole) ? null : userId
            );

            console.log(`Found ${leads.length} leads for organization ${organizationId}`);

            res.status(200).json({
                success: true,
                count: leads.length,
                leads
            });
        } catch (error) {
            console.error('Error getting leads by organization:', error);
            res.status(500).json({
                success: false,
                message: 'An error occurred while retrieving leads for the organization',
                error: process.env.NODE_ENV === 'production' ? undefined : error.message
            });
        }
    }

    // Search leads
    async search(req, res) {
        try {
            const { query } = req.query;

            console.log(`Searching leads with query: ${query}`);

            if (!query || query.trim().length < 2) {
                return res.status(400).json({
                    success: false,
                    message: 'Search query must be at least 2 characters long'
                });
            }

            // Get the current user's ID from the auth middleware
            const userId = req.user.id;
            const userRole = req.user.role;

            // Search leads
            const leads = await this.leadModel.search(
                query.trim(),
                ['admin', 'owner'].includes(userRole) ? null : userId
            );

            console.log(`Found ${leads.length} leads matching query: ${query}`);

            res.status(200).json({
                success: true,
                count: leads.length,
                leads,
                query: query.trim()
            });
        } catch (error) {
            console.error('Error searching leads:', error);
            res.status(500).json({
                success: false,
                message: 'An error occurred while searching leads',
                error: process.env.NODE_ENV === 'production' ? undefined : error.message
            });
        }
    }

    // Get lead statistics
    async getStats(req, res) {
        try {
            console.log('Getting lead statistics...');

            // Get the current user's ID from the auth middleware
            const userId = req.user.id;
            const userRole = req.user.role;

            // Get statistics
            const stats = await this.leadModel.getStats(
                ['admin', 'owner'].includes(userRole) ? null : userId
            );

            console.log('Successfully retrieved lead statistics');

            res.status(200).json({
                success: true,
                stats
            });
        } catch (error) {
            console.error('Error getting lead statistics:', error);
            res.status(500).json({
                success: false,
                message: 'An error occurred while retrieving statistics',
                error: process.env.NODE_ENV === 'production' ? undefined : error.message
            });
        }
    }
}

module.exports = LeadController;