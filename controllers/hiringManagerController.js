const HiringManager = require('../models/hiringManager');

class HiringManagerController {
    constructor(pool) {
        this.hiringManagerModel = new HiringManager(pool);
        this.create = this.create.bind(this);
        this.getAll = this.getAll.bind(this);
        this.getById = this.getById.bind(this);
        this.update = this.update.bind(this);
        this.delete = this.delete.bind(this);
        this.addNote = this.addNote.bind(this);
        this.getNotes = this.getNotes.bind(this);
        this.getHistory = this.getHistory.bind(this);
        this.getByOrganization = this.getByOrganization.bind(this);
    }

    // Initialize database tables
    async initTables() {
        try {
            await this.hiringManagerModel.initTable();
            console.log('✅ Hiring manager tables initialized successfully');
        } catch (error) {
            console.error('❌ Error initializing hiring manager tables:', error);
            throw error;
        }
    }

    // Create a new hiring manager
    async create(req, res) {
        const hiringManagerData = req.body;

        console.log("Create hiring manager request body:", req.body);

        // Basic validation
        // if (!hiringManagerData.firstName || !hiringManagerData.lastName) {
        //     return res.status(400).json({
        //         success: false,
        //         message: 'First name and last name are required'
        //     });
        // }

        // Email validation if provided
        if (hiringManagerData.email) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(hiringManagerData.email)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid email format'
                });
            }
        }

        // Validate second email if provided
        if (hiringManagerData.email2) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(hiringManagerData.email2)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid format for second email'
                });
            }
        }

        try {
            // Get the current user's ID from the auth middleware
            const userId = req.user.id;

            // Add userId to the hiring manager data
            hiringManagerData.userId = userId;

            console.log("Attempting to create hiring manager with data:", hiringManagerData);

            // Create hiring manager in database
            const hiringManager = await this.hiringManagerModel.create(hiringManagerData);

            console.log("Hiring manager created successfully:", hiringManager);

            // Send success response
            res.status(201).json({
                success: true,
                message: 'Hiring manager created successfully',
                hiringManager
            });
        } catch (error) {
            console.error('Detailed error creating hiring manager:', error);
            console.error('Error object:', JSON.stringify(error, Object.getOwnPropertyNames(error)));

            // Handle specific database errors
            if (error.code === '23505') { // Unique constraint violation
                return res.status(409).json({
                    success: false,
                    message: 'A hiring manager with this email already exists'
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
                message: 'An error occurred while creating the hiring manager',
                error: process.env.NODE_ENV === 'production' ? undefined : error.message
            });
        }
    }

    // Get all hiring managers
    async getAll(req, res) {
        try {
            console.log('Getting all hiring managers...');

            // Get the current user's ID from the auth middleware
            const userId = req.user.id;
            const userRole = req.user.role;

            console.log(`User ID: ${userId}, User Role: ${userRole}`);

            // Only admin/owner can see all hiring managers, other users only see their own
            const hiringManagers = await this.hiringManagerModel.getAll(
                ['admin', 'owner'].includes(userRole) ? null : userId
            );

            console.log(`Found ${hiringManagers.length} hiring managers`);

            res.status(200).json({
                success: true,
                count: hiringManagers.length,
                hiringManagers
            });
        } catch (error) {
            console.error('Error getting hiring managers:', error);
            res.status(500).json({
                success: false,
                message: 'An error occurred while retrieving hiring managers',
                error: process.env.NODE_ENV === 'production' ? undefined : error.message
            });
        }
    }

    // Get hiring manager by ID
    async getById(req, res) {
        try {
            const { id } = req.params;
            console.log(`Getting hiring manager by ID: ${id}`);

            // Validate ID format
            if (!id || isNaN(parseInt(id))) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid hiring manager ID'
                });
            }

            // Get the current user's ID from the auth middleware
            const userId = req.user.id;
            const userRole = req.user.role;

            console.log(`User ID: ${userId}, User Role: ${userRole}`);

            // Only admin/owner can see any hiring manager, other users only see their own
            const hiringManager = await this.hiringManagerModel.getById(
                id,
                ['admin', 'owner'].includes(userRole) ? null : userId
            );

            if (!hiringManager) {
                return res.status(404).json({
                    success: false,
                    message: 'Hiring manager not found or you do not have permission to view it'
                });
            }

            console.log(`Successfully retrieved hiring manager: ${hiringManager.id}`);

            res.status(200).json({
                success: true,
                hiringManager
            });
        } catch (error) {
            console.error('Error getting hiring manager:', error);
            res.status(500).json({
                success: false,
                message: 'An error occurred while retrieving the hiring manager',
                error: process.env.NODE_ENV === 'production' ? undefined : error.message
            });
        }
    }

    // Update hiring manager by ID
    async update(req, res) {
        try {
            const { id } = req.params;
            const updateData = req.body;

            console.log(`Update request for hiring manager ${id} received`);
            console.log("Request user:", req.user);
            console.log("Update data:", JSON.stringify(updateData, null, 2));

            // Validate ID format
            if (!id || isNaN(parseInt(id))) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid hiring manager ID'
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

            // For admin/owner roles, allow updating any hiring manager
            // For other roles, they can only update their own hiring managers
            const hiringManagerOwner = ['admin', 'owner'].includes(userRole) ? null : userId;

            // Try to update the hiring manager
            const hiringManager = await this.hiringManagerModel.update(
                id,
                updateData,
                hiringManagerOwner
            );

            if (!hiringManager) {
                console.log("Update failed - hiring manager not found or no permission");
                return res.status(404).json({
                    success: false,
                    message: 'Hiring manager not found or you do not have permission to update it'
                });
            }

            console.log("Hiring manager updated successfully:", hiringManager);
            res.status(200).json({
                success: true,
                message: 'Hiring manager updated successfully',
                hiringManager
            });
        } catch (error) {
            console.error('Error updating hiring manager:', error);

            // Handle specific database errors
            if (error.code === '23505') { // Unique constraint violation
                return res.status(409).json({
                    success: false,
                    message: 'A hiring manager with this email already exists'
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
                message: 'An error occurred while updating the hiring manager',
                error: process.env.NODE_ENV === 'production' ? undefined : error.message
            });
        }
    }

    // Delete hiring manager by ID
    async delete(req, res) {
        try {
            const { id } = req.params;
            console.log(`Delete request for hiring manager ${id} received`);

            // Validate ID format
            if (!id || isNaN(parseInt(id))) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid hiring manager ID'
                });
            }

            // Get the current user's ID from the auth middleware
            const userId = req.user.id;
            const userRole = req.user.role;

            console.log(`User role: ${userRole}, User ID: ${userId}`);

            // Only admin/owner can delete any hiring manager, others only their own
            const hiringManagerOwner = ['admin', 'owner'].includes(userRole) ? null : userId;

            // Delete the hiring manager
            const hiringManager = await this.hiringManagerModel.delete(
                id,
                hiringManagerOwner
            );

            if (!hiringManager) {
                console.log("Delete failed - hiring manager not found or no permission");
                return res.status(404).json({
                    success: false,
                    message: 'Hiring manager not found or you do not have permission to delete it'
                });
            }

            console.log("Hiring manager deleted successfully:", hiringManager.id);
            res.status(200).json({
                success: true,
                message: 'Hiring manager deleted successfully'
            });
        } catch (error) {
            console.error('Error deleting hiring manager:', error);

            // Check for specific error types
            if (error.message && (error.message.includes('permission') || error.message.includes('not found'))) {
                return res.status(403).json({
                    success: false,
                    message: error.message
                });
            }

            // Handle foreign key constraint errors (if hiring manager is referenced elsewhere)
            if (error.code === '23503') {
                return res.status(409).json({
                    success: false,
                    message: 'Cannot delete hiring manager as it is referenced by other records'
                });
            }

            res.status(500).json({
                success: false,
                message: 'An error occurred while deleting the hiring manager',
                error: process.env.NODE_ENV === 'production' ? undefined : error.message
            });
        }
    }

    // Add a note to a hiring manager
    async addNote(req, res) {
        try {
            const { id } = req.params;
            const { text } = req.body;

            console.log(`Adding note to hiring manager ${id}`);

            // Validate ID format
            if (!id || isNaN(parseInt(id))) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid hiring manager ID'
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

            // Add the note
            const note = await this.hiringManagerModel.addNote(id, text, userId);

            console.log("Note added successfully:", note);

            return res.status(201).json({
                success: true,
                message: 'Note added successfully',
                note
            });
        } catch (error) {
            console.error('Error adding note:', error);

            // Handle case where hiring manager doesn't exist
            if (error.code === '23503') {
                return res.status(404).json({
                    success: false,
                    message: 'Hiring manager not found'
                });
            }

            res.status(500).json({
                success: false,
                message: 'An error occurred while adding the note',
                error: process.env.NODE_ENV === 'production' ? undefined : error.message
            });
        }
    }

    // Get notes for a hiring manager
    async getNotes(req, res) {
        try {
            const { id } = req.params;

            console.log(`Getting notes for hiring manager ${id}`);

            // Validate ID format
            if (!id || isNaN(parseInt(id))) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid hiring manager ID'
                });
            }

            // Get all notes for this hiring manager
            const notes = await this.hiringManagerModel.getNotes(id);

            console.log(`Found ${notes.length} notes for hiring manager ${id}`);

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

    // Get history for a hiring manager
    async getHistory(req, res) {
        try {
            const { id } = req.params;

            console.log(`Getting history for hiring manager ${id}`);

            // Validate ID format
            if (!id || isNaN(parseInt(id))) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid hiring manager ID'
                });
            }

            // Get all history entries for this hiring manager
            const history = await this.hiringManagerModel.getHistory(id);

            console.log(`Found ${history.length} history entries for hiring manager ${id}`);

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

    // Additional utility method to get hiring managers by organization
    async getByOrganization(req, res) {
        try {
            const { organizationId } = req.params;

            console.log(`Getting hiring managers for organization ${organizationId}`);

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

            // Get hiring managers for this organization
            const hiringManagers = await this.hiringManagerModel.getByOrganization(
                organizationId,
                ['admin', 'owner'].includes(userRole) ? null : userId
            );

            console.log(`Found ${hiringManagers.length} hiring managers for organization ${organizationId}`);

            res.status(200).json({
                success: true,
                count: hiringManagers.length,
                hiringManagers
            });
        } catch (error) {
            console.error('Error getting hiring managers by organization:', error);
            res.status(500).json({
                success: false,
                message: 'An error occurred while retrieving hiring managers for the organization',
                error: process.env.NODE_ENV === 'production' ? undefined : error.message
            });
        }
    }

    // Search hiring managers
    async search(req, res) {
        try {
            const { query } = req.query;

            console.log(`Searching hiring managers with query: ${query}`);

            if (!query || query.trim().length < 2) {
                return res.status(400).json({
                    success: false,
                    message: 'Search query must be at least 2 characters long'
                });
            }

            // Get the current user's ID from the auth middleware
            const userId = req.user.id;
            const userRole = req.user.role;

            // Search hiring managers
            const hiringManagers = await this.hiringManagerModel.search(
                query.trim(),
                ['admin', 'owner'].includes(userRole) ? null : userId
            );

            console.log(`Found ${hiringManagers.length} hiring managers matching query: ${query}`);

            res.status(200).json({
                success: true,
                count: hiringManagers.length,
                hiringManagers,
                query: query.trim()
            });
        } catch (error) {
            console.error('Error searching hiring managers:', error);
            res.status(500).json({
                success: false,
                message: 'An error occurred while searching hiring managers',
                error: process.env.NODE_ENV === 'production' ? undefined : error.message
            });
        }
    }

    // Get hiring manager statistics
    async getStats(req, res) {
        try {
            console.log('Getting hiring manager statistics...');

            // Get the current user's ID from the auth middleware
            const userId = req.user.id;
            const userRole = req.user.role;

            // Get statistics
            const stats = await this.hiringManagerModel.getStats(
                ['admin', 'owner'].includes(userRole) ? null : userId
            );

            console.log('Successfully retrieved hiring manager statistics');

            res.status(200).json({
                success: true,
                stats
            });
        } catch (error) {
            console.error('Error getting hiring manager statistics:', error);
            res.status(500).json({
                success: false,
                message: 'An error occurred while retrieving statistics',
                error: process.env.NODE_ENV === 'production' ? undefined : error.message
            });
        }
    }
}

module.exports = HiringManagerController;