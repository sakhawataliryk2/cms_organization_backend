const Organization = require('../models/organization');
const Office = require('../models/office');
const Team = require('../models/team');
const User = require('../models/user');
const Document = require('../models/document');

class OrganizationController {
    constructor(pool) {
        this.organizationModel = new Organization(pool);
        this.officeModel = new Office(pool);
        this.teamModel = new Team(pool);
        this.userModel = new User(pool);
        this.documentModel = new Document(pool);
        this.create = this.create.bind(this);
        this.getAll = this.getAll.bind(this);
        this.getById = this.getById.bind(this);
        this.update = this.update.bind(this);
        this.delete = this.delete.bind(this);
        // Bind existing methods
        this.addNote = this.addNote.bind(this);
        this.getNotes = this.getNotes.bind(this);
        this.getHistory = this.getHistory.bind(this);
        // Bind document methods
        this.getDocuments = this.getDocuments.bind(this);
        this.getDocument = this.getDocument.bind(this);
        this.addDocument = this.addDocument.bind(this);
        this.updateDocument = this.updateDocument.bind(this);
        this.deleteDocument = this.deleteDocument.bind(this);
    }


    // Initialize database tables
    async initTables() {
        await this.organizationModel.initTable();
        await this.documentModel.initTable();
    }

    // Update the create method to properly handle all fields
    // Now let's fix the backend controller - controllers/organizationController.js

    async create(req, res) {
        // IMPORTANT: Ensure we're extracting ALL fields from the request body
        const {
            name,
            nicknames,
            parent_organization, // Use exact snake_case names as received
            website,
            status,
            contract_on_file, // Use exact snake_case names as received
            contract_signed_by, // Use exact snake_case names as received
            date_contract_signed, // Use exact snake_case names as received
            year_founded, // Use exact snake_case names as received
            overview,
            perm_fee, // Use exact snake_case names as received
            num_employees, // Use exact snake_case names as received
            num_offices, // Use exact snake_case names as received
            contact_phone, // Use exact snake_case names as received
            address,
            custom_fields, // ADDED: Extract custom fields from request
            // New fields for office, team, and user creation
            offices,
            teams,
            users
        } = req.body;

        // Debug log all received fields
        console.log("=== CREATE ORGANIZATION REQUEST ===");
        console.log("Full request body:", JSON.stringify(req.body, null, 2));
        console.log("custom_fields in req.body:", req.body.custom_fields);
        console.log("custom_fields type:", typeof req.body.custom_fields);
        console.log("custom_fields is array:", Array.isArray(req.body.custom_fields));
        console.log("custom_fields keys:", req.body.custom_fields ? Object.keys(req.body.custom_fields).length : 'null/undefined');
        console.log("Extracted custom_fields:", custom_fields);
        console.log("Extracted custom_fields type:", typeof custom_fields);
        console.log("Extracted custom_fields keys:", custom_fields ? Object.keys(custom_fields).length : 'null/undefined');
        console.log("=== END CREATE REQUEST ===");

        // Basic validation - only name is required
        if (!name || !name.trim()) {
            return res.status(400).json({
                success: false,
                message: 'Organization name is required'
            });
        }

        try {
            // Get the current user's ID from the auth middleware
            const userId = req.user.id;

            // Create organization in database - PASS ALL FIELDS DIRECTLY
            // CRITICAL: Log what we're passing to the model
            const modelData = {
                name,
                nicknames,
                parent_organization,
                website,
                status,
                contract_on_file,
                contract_signed_by,
                date_contract_signed,
                year_founded,
                overview,
                perm_fee,
                num_employees,
                num_offices,
                contact_phone,
                address,
                userId,
                custom_fields: custom_fields || {}, // FIXED: Use snake_case to match model expectation
            };
            console.log("=== PASSING TO MODEL ===");
            console.log("custom_fields being passed:", JSON.stringify(modelData.custom_fields, null, 2));
            console.log("custom_fields type:", typeof modelData.custom_fields);
            console.log("custom_fields keys count:", modelData.custom_fields ? Object.keys(modelData.custom_fields).length : 0);
            
            console.log("=== END PASSING TO MODEL ===");
            
            const organization = await this.organizationModel.create(modelData);

            // Log the created organization for debugging
            console.log("Organization created successfully:", organization);

            // Auto-create default welcome document for the organization
            let defaultDocument = null;
            try {
                defaultDocument = await this.documentModel.createDefaultOrganizationDocument(
                    organization.id,
                    organization.name,
                    userId
                );
                console.log("Default document created:", defaultDocument);
            } catch (docError) {
                console.error('Error creating default document:', docError);
                // Don't fail organization creation if document creation fails
            }

            const createdEntities = {
                organization,
                offices: [],
                teams: [],
                users: [],
                defaultDocument
            };

            // Create offices if provided
            if (offices && Array.isArray(offices) && offices.length > 0) {
                for (const officeData of offices) {
                    try {
                        const office = await this.officeModel.create({
                            ...officeData,
                            organization_id: organization.id,
                            created_by: userId
                        });
                        createdEntities.offices.push(office);
                        console.log("Office created:", office);
                    } catch (officeError) {
                        console.error('Error creating office:', officeError);
                        // Continue with other offices even if one fails
                    }
                }
            }

            // Create teams if provided
            if (teams && Array.isArray(teams) && teams.length > 0) {
                for (const teamData of teams) {
                    try {
                        const team = await this.teamModel.create({
                            ...teamData,
                            organization_id: organization.id,
                            created_by: userId
                        });
                        createdEntities.teams.push(team);
                        console.log("Team created:", team);
                    } catch (teamError) {
                        console.error('Error creating team:', teamError);
                        // Continue with other teams even if one fails
                    }
                }
            }

            // Create users if provided
            if (users && Array.isArray(users) && users.length > 0) {
                for (const userData of users) {
                    try {
                        const user = await this.userModel.create({
                            ...userData,
                            organization_id: organization.id,
                            created_by: userId
                        });
                        createdEntities.users.push(user);
                        console.log("User created:", user);
                    } catch (userError) {
                        console.error('Error creating user:', userError);
                        // Continue with other users even if one fails
                    }
                }
            }

            // Send success response with all created entities
            res.status(201).json({
                success: true,
                message: 'Organization and related entities created successfully',
                organization: createdEntities.organization, // Frontend expects this
                data: createdEntities // Keep full data for backward compatibility
            });
        } catch (error) {
            console.error('Error creating organization:', error);
            res.status(500).json({
                success: false,
                message: 'An error occurred while creating the organization',
                error: process.env.NODE_ENV === 'production' ? undefined : error.message
            });
        }
    }

    // Get all organizations
    async getAll(req, res) {
        try {
            // Get the current user's ID from the auth middleware
            const userId = req.user.id;
            const userRole = req.user.role;

            // Only admin/owner can see all organizations, other users only see their own
            const organizations = await this.organizationModel.getAll(
                ['admin', 'owner'].includes(userRole) ? null : userId
            );
           

            res.status(200).json({
                success: true,
                count: organizations.length,
                organizations
            });
        } catch (error) {
            console.error('Error getting organizations:', error);
            res.status(500).json({
                success: false,
                message: 'An error occurred while retrieving organizations',
                error: process.env.NODE_ENV === 'production' ? undefined : error.message
            });
        }
    }

    // Get organization by ID
    async getById(req, res) {
        try {
            const { id } = req.params;

            // Get the current user's ID from the auth middleware
            const userId = req.user.id;
            const userRole = req.user.role;

            // Only admin/owner can see any organization, other users only see their own
            const organization = await this.organizationModel.getById(
                id,
                ['admin', 'owner'].includes(userRole) ? null : userId
            );
            
            if (!organization) {
                return res.status(404).json({
                    success: false,
                    message: 'Organization not found or you do not have permission to view it'
                });
            }

            res.status(200).json({
                success: true,
                organization
            });
        } catch (error) {
            console.error('Error getting organization:', error);
            res.status(500).json({
                success: false,
                message: 'An error occurred while retrieving the organization',
                error: process.env.NODE_ENV === 'production' ? undefined : error.message
            });
        }
    }

    // Update the update method to properly handle all fields
    async update(req, res) {
        try {
            const { id } = req.params;
            const updateData = req.body;

            console.log(`Update request for organization ${id} received`);
            console.log("Request user:", req.user);
            console.log("Update data:", updateData);

            // Get the current user's ID from the auth middleware
            const userId = req.user.id;
            const userRole = req.user.role;

            console.log(`User role: ${userRole}, User ID: ${userId}`);

            // For admin/owner roles, allow updating any organization
            // For other roles, they can only update their own organizations
            const organizationOwner = ['admin', 'owner'].includes(userRole) ? null : userId;

            // Try to update the organization
            const organization = await this.organizationModel.update(
                id,
                updateData,
                organizationOwner
            );

            if (!organization) {
                console.log("Update failed - organization not found or no permission");
                return res.status(404).json({
                    success: false,
                    message: 'Organization not found or you do not have permission to update it'
                });
            }

            console.log("Organization updated successfully:", organization);
            res.status(200).json({
                success: true,
                message: 'Organization updated successfully',
                organization
            });
        } catch (error) {
            console.error('Error updating organization:', error);

            // Check for specific error types
            if (error.message.includes('permission') || error.message.includes('not found')) {
                return res.status(403).json({
                    success: false,
                    message: error.message
                });
            }

            res.status(500).json({
                success: false,
                message: 'An error occurred while updating the organization',
                error: process.env.NODE_ENV === 'production' ? undefined : error.message
            });
        }
    }

    // New method for adding notes
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
            const note = await this.organizationModel.addNote(id, text, userId);

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

    // New method for getting notes
    async getNotes(req, res) {
        try {
            const { id } = req.params;

            // Get all notes for this organization
            const notes = await this.organizationModel.getNotes(id);

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

    // New method for getting history
    async getHistory(req, res) {
        try {
            const { id } = req.params;

            // Get all history entries for this organization
            const history = await this.organizationModel.getHistory(id);

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

    // Fixed delete method to handle permissions correctly
    async delete(req, res) {
        try {
            const { id } = req.params;
            console.log(`Delete request for organization ${id} received`);

            // Get the current user's ID from the auth middleware
            const userId = req.user.id;
            const userRole = req.user.role;

            console.log(`User role: ${userRole}, User ID: ${userId}`);

            // Only admin/owner can delete any organization, others only their own
            // Pass null for userId if admin/owner to skip permission check
            const organizationOwner = ['admin', 'owner'].includes(userRole) ? null : userId;

            // Delete the organization
            const organization = await this.organizationModel.delete(
                id,
                organizationOwner
            );

            if (!organization) {
                console.log("Delete failed - organization not found or no permission");
                return res.status(404).json({
                    success: false,
                    message: 'Organization not found or you do not have permission to delete it'
                });
            }

            console.log("Organization deleted successfully:", organization.id);
            res.status(200).json({
                success: true,
                message: 'Organization deleted successfully'
            });
        } catch (error) {
            console.error('Error deleting organization:', error);

            // Check for specific error types
            if (error.message.includes('permission') || error.message.includes('not found')) {
                return res.status(403).json({
                    success: false,
                    message: error.message
                });
            }

            res.status(500).json({
                success: false,
                message: 'An error occurred while deleting the organization',
                error: process.env.NODE_ENV === 'production' ? undefined : error.message
            });
        }
    }

    // Document methods

    // Get all documents for an organization
    async getDocuments(req, res) {
        try {
            const { id } = req.params;

            // Get all documents for this organization
            const documents = await this.documentModel.getByEntity('organization', id);

            return res.status(200).json({
                success: true,
                count: documents.length,
                documents
            });
        } catch (error) {
            console.error('Error getting documents:', error);
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
            console.error('Error getting document:', error);
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
            const { document_name, document_type, content } = req.body;

            if (!document_name) {
                return res.status(400).json({
                    success: false,
                    message: 'Document name is required'
                });
            }

            // Get the current user's ID
            const userId = req.user.id;

            // Create the document
            const document = await this.documentModel.create({
                entity_type: 'organization',
                entity_id: id,
                document_name,
                document_type: document_type || 'General',
                content,
                created_by: userId
            });

            return res.status(201).json({
                success: true,
                message: 'Document added successfully',
                document
            });
        } catch (error) {
            console.error('Error adding document:', error);
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
            console.error('Error updating document:', error);
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
            console.error('Error deleting document:', error);
            res.status(500).json({
                success: false,
                message: 'An error occurred while deleting the document',
                error: process.env.NODE_ENV === 'production' ? undefined : error.message
            });
        }
    }
}

module.exports = OrganizationController;