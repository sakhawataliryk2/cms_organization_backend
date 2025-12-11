// controllers/placementController.js
const Placement = require('../models/placement');

class PlacementController {
    constructor(pool) {
        this.placementModel = new Placement(pool);
        this.create = this.create.bind(this);
        this.getAll = this.getAll.bind(this);
        this.getById = this.getById.bind(this);
        this.update = this.update.bind(this);
        this.delete = this.delete.bind(this);
        this.getByJobId = this.getByJobId.bind(this);
        this.getByJobSeekerId = this.getByJobSeekerId.bind(this);
    }

    // Initialize database tables
    async initTables() {
        await this.placementModel.initTable();
    }

    // Create a new placement
    async create(req, res) {
        const placementData = req.body;

        // Basic validation
        if (!placementData.job_id || !placementData.job_seeker_id || !placementData.start_date) {
            return res.status(400).json({
                success: false,
                message: 'Job ID, Job Seeker ID, and Start Date are required'
            });
        }

        try {
            // Get the current user's ID from the auth middleware
            const userId = req.user.id;

            // Add userId to the placement data
            placementData.created_by = userId;

            console.log("Attempting to create placement with data:", placementData);

            // Create placement in database
            const placement = await this.placementModel.create(placementData);

            console.log("Placement created successfully:", placement);

            // Send success response
            res.status(201).json({
                success: true,
                message: 'Placement created successfully',
                placement
            });
        } catch (error) {
            console.error('Detailed error creating placement:', error);
            res.status(500).json({
                success: false,
                message: 'An error occurred while creating the placement',
                error: process.env.NODE_ENV === 'production' ? undefined : error.message
            });
        }
    }

    // Get all placements
    async getAll(req, res) {
        try {
            // Get the current user's ID from the auth middleware
            const userId = req.user.id;
            const userRole = req.user.role;

            // Only admin/owner can see all placements, other users only see their own
            const placements = await this.placementModel.getAll(
                ['admin', 'owner', 'developer'].includes(userRole) ? null : userId
            );

            res.status(200).json({
                success: true,
                count: placements.length,
                placements
            });
        } catch (error) {
            console.error('Error getting placements:', error);
            res.status(500).json({
                success: false,
                message: 'An error occurred while retrieving placements',
                error: process.env.NODE_ENV === 'production' ? undefined : error.message
            });
        }
    }

    // Get placement by ID
    async getById(req, res) {
        try {
            const { id } = req.params;
            const userId = req.user.id;
            const userRole = req.user.role;

            const placement = await this.placementModel.findById(id);

            if (!placement) {
                return res.status(404).json({
                    success: false,
                    message: 'Placement not found'
                });
            }

            // Check if user has permission to view this placement
            if (!['admin', 'owner', 'developer'].includes(userRole) && placement.createdBy !== userId) {
                return res.status(403).json({
                    success: false,
                    message: 'You do not have permission to view this placement'
                });
            }

            res.status(200).json({
                success: true,
                placement
            });
        } catch (error) {
            console.error('Error getting placement:', error);
            res.status(500).json({
                success: false,
                message: 'An error occurred while retrieving the placement',
                error: process.env.NODE_ENV === 'production' ? undefined : error.message
            });
        }
    }

    // Get placements by job ID
    async getByJobId(req, res) {
        try {
            const { jobId } = req.params;
            const userId = req.user.id;
            const userRole = req.user.role;

            const placements = await this.placementModel.findByJobId(jobId);

            // Filter placements based on user role
            let filteredPlacements = placements;
            if (!['admin', 'owner', 'developer'].includes(userRole)) {
                filteredPlacements = placements.filter(p => p.createdBy === userId);
            }

            res.status(200).json({
                success: true,
                count: filteredPlacements.length,
                placements: filteredPlacements
            });
        } catch (error) {
            console.error('Error getting placements by job ID:', error);
            res.status(500).json({
                success: false,
                message: 'An error occurred while retrieving placements',
                error: process.env.NODE_ENV === 'production' ? undefined : error.message
            });
        }
    }

    // Get placements by job seeker ID
    async getByJobSeekerId(req, res) {
        try {
            const { jobSeekerId } = req.params;
            const userId = req.user.id;
            const userRole = req.user.role;

            const placements = await this.placementModel.findByJobSeekerId(jobSeekerId);

            // Filter placements based on user role
            let filteredPlacements = placements;
            if (!['admin', 'owner', 'developer'].includes(userRole)) {
                filteredPlacements = placements.filter(p => p.createdBy === userId);
            }

            res.status(200).json({
                success: true,
                count: filteredPlacements.length,
                placements: filteredPlacements
            });
        } catch (error) {
            console.error('Error getting placements by job seeker ID:', error);
            res.status(500).json({
                success: false,
                message: 'An error occurred while retrieving placements',
                error: process.env.NODE_ENV === 'production' ? undefined : error.message
            });
        }
    }

    // Update placement
    async update(req, res) {
        try {
            const { id } = req.params;
            const placementData = req.body;
            const userId = req.user.id;
            const userRole = req.user.role;

            // Check if placement exists
            const existingPlacement = await this.placementModel.findById(id);

            if (!existingPlacement) {
                return res.status(404).json({
                    success: false,
                    message: 'Placement not found'
                });
            }

            // Check if user has permission to update this placement
            if (!['admin', 'owner', 'developer'].includes(userRole) && existingPlacement.createdBy !== userId) {
                return res.status(403).json({
                    success: false,
                    message: 'You do not have permission to update this placement'
                });
            }

            // Update placement
            const updatedPlacement = await this.placementModel.update(id, placementData);

            res.status(200).json({
                success: true,
                message: 'Placement updated successfully',
                placement: updatedPlacement
            });
        } catch (error) {
            console.error('Error updating placement:', error);
            res.status(500).json({
                success: false,
                message: 'An error occurred while updating the placement',
                error: process.env.NODE_ENV === 'production' ? undefined : error.message
            });
        }
    }

    // Delete placement
    async delete(req, res) {
        try {
            const { id } = req.params;
            const userId = req.user.id;
            const userRole = req.user.role;

            // Check if placement exists
            const existingPlacement = await this.placementModel.findById(id);

            if (!existingPlacement) {
                return res.status(404).json({
                    success: false,
                    message: 'Placement not found'
                });
            }

            // Check if user has permission to delete this placement
            if (!['admin', 'owner', 'developer'].includes(userRole) && existingPlacement.createdBy !== userId) {
                return res.status(403).json({
                    success: false,
                    message: 'You do not have permission to delete this placement'
                });
            }

            // Delete placement
            await this.placementModel.delete(id);

            res.status(200).json({
                success: true,
                message: 'Placement deleted successfully'
            });
        } catch (error) {
            console.error('Error deleting placement:', error);
            res.status(500).json({
                success: false,
                message: 'An error occurred while deleting the placement',
                error: process.env.NODE_ENV === 'production' ? undefined : error.message
            });
        }
    }
}

module.exports = PlacementController;

