// controllers/placementController.js
const Placement = require('../models/placement');
const Document = require('../models/document');

class PlacementController {
    constructor(pool) {
        this.placementModel = new Placement(pool);
        this.documentModel = new Document(pool);
        this.create = this.create.bind(this);
        this.getAll = this.getAll.bind(this);
        this.getById = this.getById.bind(this);
        this.update = this.update.bind(this);
        this.delete = this.delete.bind(this);
        this.getByJobId = this.getByJobId.bind(this);
        this.getByJobSeekerId = this.getByJobSeekerId.bind(this);

        this.getDocuments = this.getDocuments.bind(this);
        this.getDocument = this.getDocument.bind(this);
        this.addDocument = this.addDocument.bind(this);
        this.updateDocument = this.updateDocument.bind(this);
        this.deleteDocument = this.deleteDocument.bind(this);
    }

    // Initialize database tables
    async initTables() {
        await this.placementModel.initTable();
        await this.documentModel.initTable();
    }

    // Validate date range (end_date must not be earlier than start_date)
    validateDateRange(startDate, endDate) {
        if (!startDate) {
            return { valid: false, message: 'Start date is required' };
        }

        if (endDate) {
            const start = new Date(startDate);
            const end = new Date(endDate);

            // Check if dates are valid
            if (isNaN(start.getTime())) {
                return { valid: false, message: 'Invalid start date format' };
            }
            if (isNaN(end.getTime())) {
                return { valid: false, message: 'Invalid end date format' };
            }

            // Check if end_date is earlier than start_date
            if (end < start) {
                return { 
                    valid: false, 
                    message: 'End date cannot be earlier than start date' 
                };
            }
        }

        return { valid: true };
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

        // Validate date range
        const dateValidation = this.validateDateRange(
            placementData.start_date,
            placementData.end_date
        );
        if (!dateValidation.valid) {
            return res.status(400).json({
                success: false,
                message: dateValidation.message
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

            // Validate date range if dates are being updated
            // Use provided dates or existing dates from the placement
            const startDate = placementData.start_date || existingPlacement.startDate;
            // end_date might not exist in database, so check both provided value and existing placement
            const endDate = placementData.end_date !== undefined 
                ? placementData.end_date 
                : (existingPlacement.endDate || null);

            const dateValidation = this.validateDateRange(startDate, endDate);
            if (!dateValidation.valid) {
                return res.status(400).json({
                    success: false,
                    message: dateValidation.message
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

    async getDocuments(req, res) {
        try {
            const { id } = req.params;

            const documents = await this.documentModel.getByEntity('placement', id);

            return res.status(200).json({
                success: true,
                count: documents.length,
                documents
            });
        } catch (error) {
            console.error('Error getting placement documents:', error);
            res.status(500).json({
                success: false,
                message: 'An error occurred while getting documents',
                error: process.env.NODE_ENV === 'production' ? undefined : error.message
            });
        }
    }

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
            console.error('Error getting placement document:', error);
            res.status(500).json({
                success: false,
                message: 'An error occurred while getting the document',
                error: process.env.NODE_ENV === 'production' ? undefined : error.message
            });
        }
    }

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
                entity_type: 'placement',
                entity_id: id,
                document_name,
                document_type: document_type || 'General',
                content: content || null,
                file_path: file_path || null,
                file_size: file_size || null,
                mime_type: mime_type || 'text/plain',
                created_by: userId
            });

            return res.status(201).json({
                success: true,
                message: 'Document added successfully',
                document
            });
        } catch (error) {
            console.error('Error adding placement document:', error);
            res.status(500).json({
                success: false,
                message: 'An error occurred while adding the document',
                error: process.env.NODE_ENV === 'production' ? undefined : error.message
            });
        }
    }

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
            console.error('Error updating placement document:', error);
            res.status(500).json({
                success: false,
                message: 'An error occurred while updating the document',
                error: process.env.NODE_ENV === 'production' ? undefined : error.message
            });
        }
    }

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
            console.error('Error deleting placement document:', error);
            res.status(500).json({
                success: false,
                message: 'An error occurred while deleting the document',
                error: process.env.NODE_ENV === 'production' ? undefined : error.message
            });
        }
    }
}

module.exports = PlacementController;

