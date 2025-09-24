const CustomFieldDefinition = require('../models/customFieldDefinition');

class CustomFieldController {
    constructor(pool) {
        this.customFieldModel = new CustomFieldDefinition(pool);
        this.create = this.create.bind(this);
        this.getByEntityType = this.getByEntityType.bind(this);
        this.update = this.update.bind(this);
        this.delete = this.delete.bind(this);
        this.getById = this.getById.bind(this);
        this.getHistory = this.getHistory.bind(this);
    }

    // Initialize database tables
    async initTables() {
        try {
            await this.customFieldModel.initTable();
            console.log('✅ Custom field tables initialized successfully');
        } catch (error) {
            console.error('❌ Error initializing custom field tables:', error);
            throw error;
        }
    }

    // Create a new custom field definition
    async create(req, res) {
        try {
            const {
                entityType,
                fieldName,
                fieldLabel,
                fieldType,
                isRequired,
                isHidden,
                sortOrder,
                options,
                placeholder,
                defaultValue,
                validationRules
            } = req.body;

            console.log("Create custom field request:", req.body);

            // Validation
            if (!entityType || !fieldName || !fieldLabel) {
                return res.status(400).json({
                    success: false,
                    message: 'Entity type, field name, and field label are required'
                });
            }

            // Validate field name format (no spaces, special characters)
            if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(fieldName)) {
                return res.status(400).json({
                    success: false,
                    message: 'Field name must start with a letter and contain only letters, numbers, and underscores'
                });
            }

            // Get user ID from auth middleware
            const userId = req.user.id;

            const fieldData = {
                entityType,
                fieldName,
                fieldLabel,
                fieldType: fieldType || 'text',
                isRequired: Boolean(isRequired),
                isHidden: Boolean(isHidden),
                sortOrder: sortOrder || 0,
                options,
                placeholder,
                defaultValue,
                validationRules,
                userId
            };

            const customField = await this.customFieldModel.create(fieldData);

            res.status(201).json({
                success: true,
                message: 'Custom field created successfully',
                customField
            });
        } catch (error) {
            console.error('Error creating custom field:', error);

            // Handle unique constraint violation
            if (error.code === '23505') {
                return res.status(409).json({
                    success: false,
                    message: 'A field with this name already exists for this entity type'
                });
            }

            res.status(500).json({
                success: false,
                message: 'An error occurred while creating the custom field',
                error: process.env.NODE_ENV === 'production' ? undefined : error.message
            });
        }
    }

    // Get all custom fields for an entity type
    async getByEntityType(req, res) {
        try {
            const { entityType } = req.params;

            console.log(`Getting custom fields for entity type: ${entityType}`);

            if (!entityType) {
                return res.status(400).json({
                    success: false,
                    message: 'Entity type is required'
                });
            }

            const customFields = await this.customFieldModel.getByEntityType(entityType);

            res.status(200).json({
                success: true,
                count: customFields.length,
                customFields
            });
        } catch (error) {
            console.error('Error getting custom fields:', error);
            res.status(500).json({
                success: false,
                message: 'An error occurred while retrieving custom fields',
                error: process.env.NODE_ENV === 'production' ? undefined : error.message
            });
        }
    }

    // Get custom field by ID
    async getById(req, res) {
        try {
            const { id } = req.params;

            if (!id || isNaN(parseInt(id))) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid custom field ID'
                });
            }

            const customField = await this.customFieldModel.getById(id);

            if (!customField) {
                return res.status(404).json({
                    success: false,
                    message: 'Custom field not found'
                });
            }

            res.status(200).json({
                success: true,
                customField
            });
        } catch (error) {
            console.error('Error getting custom field:', error);
            res.status(500).json({
                success: false,
                message: 'An error occurred while retrieving the custom field',
                error: process.env.NODE_ENV === 'production' ? undefined : error.message
            });
        }
    }

    // Update a custom field definition
    async update(req, res) {
        try {
            const { id } = req.params;
            const updateData = req.body;

            console.log(`Update request for custom field ${id}:`, updateData);

            if (!id || isNaN(parseInt(id))) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid custom field ID'
                });
            }

            // Validate field name format if it's being updated
            if (updateData.fieldName && !/^[a-zA-Z][a-zA-Z0-9_]*$/.test(updateData.fieldName)) {
                return res.status(400).json({
                    success: false,
                    message: 'Field name must start with a letter and contain only letters, numbers, and underscores'
                });
            }

            // Convert boolean values properly
            if (updateData.isRequired !== undefined) {
                updateData.isRequired = Boolean(updateData.isRequired);
            }
            if (updateData.isHidden !== undefined) {
                updateData.isHidden = Boolean(updateData.isHidden);
            }

            // Get user ID from auth middleware
            const userId = req.user.id;

            const customField = await this.customFieldModel.update(id, updateData, userId);

            if (!customField) {
                return res.status(404).json({
                    success: false,
                    message: 'Custom field not found'
                });
            }

            res.status(200).json({
                success: true,
                message: 'Custom field updated successfully',
                customField
            });
        } catch (error) {
            console.error('Error updating custom field:', error);

            // Handle unique constraint violation
            if (error.code === '23505') {
                return res.status(409).json({
                    success: false,
                    message: 'A field with this name already exists for this entity type'
                });
            }

            res.status(500).json({
                success: false,
                message: 'An error occurred while updating the custom field',
                error: process.env.NODE_ENV === 'production' ? undefined : error.message
            });
        }
    }

    // Delete a custom field definition
    async delete(req, res) {
        try {
            const { id } = req.params;

            console.log(`Delete request for custom field ${id}`);

            if (!id || isNaN(parseInt(id))) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid custom field ID'
                });
            }

            // Get user ID from auth middleware
            const userId = req.user.id;

            const customField = await this.customFieldModel.delete(id, userId);

            if (!customField) {
                return res.status(404).json({
                    success: false,
                    message: 'Custom field not found'
                });
            }

            res.status(200).json({
                success: true,
                message: 'Custom field deleted successfully'
            });
        } catch (error) {
            console.error('Error deleting custom field:', error);
            res.status(500).json({
                success: false,
                message: 'An error occurred while deleting the custom field',
                error: process.env.NODE_ENV === 'production' ? undefined : error.message
            });
        }
    }

    // Get history for a custom field definition
    async getHistory(req, res) {
        try {
            const { id } = req.params;

            console.log(`Get history request for custom field ${id}`);

            if (!id || isNaN(parseInt(id))) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid custom field ID'
                });
            }

            const history = await this.customFieldModel.getHistory(id);

            res.status(200).json({
                success: true,
                count: history.length,
                history
            });
        } catch (error) {
            console.error('Error getting custom field history:', error);
            res.status(500).json({
                success: false,
                message: 'An error occurred while retrieving the custom field history',
                error: process.env.NODE_ENV === 'production' ? undefined : error.message
            });
        }
    }
}

module.exports = CustomFieldController;