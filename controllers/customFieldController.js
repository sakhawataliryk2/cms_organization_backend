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


            // 1. Validate ID parameter
            if (!id || !Number.isInteger(Number(id)) || Number(id) <= 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid custom field ID. ID must be a positive integer.'
                });
            }

            // 2. Validate request body
            if (!updateData || Object.keys(updateData).length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'No update data provided'
                });
            }

            // 3. Validate field name format if it's being updated
            if (updateData.fieldName !== undefined) {
                if (!updateData.fieldName || typeof updateData.fieldName !== 'string') {
                    return res.status(400).json({
                        success: false,
                        message: 'Field name must be a non-empty string'
                    });
                }
                if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(updateData.fieldName)) {
                    return res.status(400).json({
                        success: false,
                        message: 'Field name must start with a letter and contain only letters, numbers, and underscores'
                    });
                }
            }

            // 4. Validate field label if it's being updated
            if (updateData.fieldLabel !== undefined) {
                if (!updateData.fieldLabel || typeof updateData.fieldLabel !== 'string' || updateData.fieldLabel.trim().length === 0) {
                    return res.status(400).json({
                        success: false,
                        message: 'Field label must be a non-empty string'
                    });
                }
            }

            // 5. Validate field type if it's being updated
            const validFieldTypes = ['text', 'email', 'phone', 'number', 'date', 'textarea', 'select', 'checkbox', 'radio', 'url', 'file'];
            if (updateData.fieldType !== undefined) {
                if (!validFieldTypes.includes(updateData.fieldType)) {
                    return res.status(400).json({
                        success: false,
                        message: `Invalid field type. Must be one of: ${validFieldTypes.join(', ')}`
                    });
                }
            }

            // 6. Validate sort order if it's being updated
            if (updateData.sortOrder !== undefined) {
                if (!Number.isInteger(Number(updateData.sortOrder)) || Number(updateData.sortOrder) < 0) {
                    return res.status(400).json({
                        success: false,
                        message: 'Sort order must be a non-negative integer'
                    });
                }
            }

            // 7. Validate options for select/radio fields
            if (updateData.options !== undefined && updateData.options !== null) {
                if (!Array.isArray(updateData.options)) {
                    return res.status(400).json({
                        success: false,
                        message: 'Options must be an array'
                    });
                }
                if (updateData.options.some(option => typeof option !== 'string' || option.trim().length === 0)) {
                    return res.status(400).json({
                        success: false,
                        message: 'All options must be non-empty strings'
                    });
                }
            }

            // 8. Sanitize and convert boolean values properly
            const sanitizedData = { ...updateData };
            
            if (sanitizedData.isRequired !== undefined) {
                sanitizedData.isRequired = Boolean(sanitizedData.isRequired);
            }
            if (sanitizedData.isHidden !== undefined) {
                sanitizedData.isHidden = Boolean(sanitizedData.isHidden);
            }

            // 9. Sanitize string fields
            if (sanitizedData.fieldLabel !== undefined) {
                sanitizedData.fieldLabel = sanitizedData.fieldLabel.trim();
            }
            if (sanitizedData.placeholder !== undefined && sanitizedData.placeholder !== null) {
                sanitizedData.placeholder = sanitizedData.placeholder.trim() || null;
            }
            if (sanitizedData.defaultValue !== undefined && sanitizedData.defaultValue !== null) {
                sanitizedData.defaultValue = sanitizedData.defaultValue.trim() || null;
            }

            // 10. Get user ID from auth middleware
            const userId = req.user?.id;
            if (!userId) {
                return res.status(401).json({
                    success: false,
                    message: 'User authentication required'
                });
            }

            // 11. Perform the update
            const customField = await this.customFieldModel.update(id, sanitizedData, userId);

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

            // Handle specific database errors
            if (error.code === '23505') {
                return res.status(409).json({
                    success: false,
                    message: 'A field with this name already exists for this entity type'
                });
            }

            if (error.code === '23503') {
                return res.status(400).json({
                    success: false,
                    message: 'Referenced user or entity does not exist'
                });
            }

            if (error.code === '23514') {
                return res.status(400).json({
                    success: false,
                    message: 'Data validation constraint violation'
                });
            }

            // Handle custom field not found error from model
            if (error.message === 'Custom field definition not found') {
                return res.status(404).json({
                    success: false,
                    message: 'Custom field not found'
                });
            }

            // Generic error response
            res.status(500).json({
                success: false,
                message: 'An error occurred while updating the custom field',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
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