const User = require('../models/user');

class UserController {
    constructor(pool) {
        this.userModel = new User(pool);
        this.getActiveUsers = this.getActiveUsers.bind(this);
        this.createUser = this.createUser.bind(this);
    }

    // Create new user
    async createUser(req, res) {
        try {
            const userData = req.body;
            const user = await this.userModel.create(userData);
            
            res.status(201).json({
                success: true,
                message: 'User created successfully',
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    office_id: user.office_id,
                    team_id: user.team_id,
                    phone: user.phone,
                    phone2: user.phone2,
                    title: user.title,
                    id_number: user.id_number,
                    is_admin: user.is_admin,
                    status: user.status,
                    created_at: user.created_at
                }
            });
        } catch (error) {
            console.error('Error creating user:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to create user',
                error: process.env.NODE_ENV === 'production' ? undefined : error.message
            });
        }
    }

    // Add this method to the UserController class
    async updatePassword(req, res) {
        try {
            const { userId } = req.params;
            const { newPassword, confirmPassword } = req.body;

            // Validate inputs
            if (!newPassword || !confirmPassword) {
                return res.status(400).json({
                    success: false,
                    message: 'Both new password and confirmation are required'
                });
            }

            if (newPassword !== confirmPassword) {
                return res.status(400).json({
                    success: false,
                    message: 'Passwords do not match'
                });
            }

            // Validate password strength
            if (newPassword.length < 8) {
                return res.status(400).json({
                    success: false,
                    message: 'Password must be at least 8 characters long'
                });
            }

            const user = await this.userModel.updatePassword(userId, newPassword);

            res.status(200).json({
                success: true,
                message: 'Password updated successfully',
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    role: user.role
                }
            });
        } catch (error) {
            console.error('Error updating password:', error);
            res.status(500).json({
                success: false,
                message: 'An error occurred while updating password',
                error: process.env.NODE_ENV === 'production' ? undefined : error.message
            });
        }
    }



    // Add this method to the UserController class
    async getAllUsers(req, res) {
        try {
            console.log('Fetching all users with details');

            const users = await this.userModel.getAllDetailed();

            res.status(200).json({
                success: true,
                count: users.length,
                users: users.map(user => ({
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    phone: user.phone,
                    phone2: user.phone2,
                    title: user.title,
                    office_name: user.office_name,
                    team_name: user.team_name,
                    id_number: user.id_number,
                    is_admin: user.is_admin,
                    role: user.role,
                    status: user.status,
                    created_at: user.created_at,
                    updated_at: user.updated_at
                }))
            });
        } catch (error) {
            console.error('Error getting all users:', error);
            res.status(500).json({
                success: false,
                message: 'An error occurred while retrieving users',
                error: process.env.NODE_ENV === 'production' ? undefined : error.message
            });
        }
    }



    // Password validation helper method (if not already present)
    validatePassword(password) {
        // Check length
        if (password.length < 8) {
            return {
                isValid: false,
                message: 'Password must be at least 8 characters long'
            };
        }

        // Check for lowercase letter
        if (!/[a-z]/.test(password)) {
            return {
                isValid: false,
                message: 'Password must contain at least one lowercase letter'
            };
        }

        // Check for uppercase letter
        if (!/[A-Z]/.test(password)) {
            return {
                isValid: false,
                message: 'Password must contain at least one uppercase letter'
            };
        }

        // Check for number
        if (!/[0-9]/.test(password)) {
            return {
                isValid: false,
                message: 'Password must contain at least one number'
            };
        }

        // Check for special character
        if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
            return {
                isValid: false,
                message: 'Password must contain at least one special character'
            };
        }

        return {
            isValid: true,
            message: 'Password is valid'
        };
    }

    // Get all active users
    async getActiveUsers(req, res) {
        try {
            console.log('Fetching active users for dropdown');

            const users = await this.userModel.getActiveUsers();

            res.status(200).json({
                success: true,
                count: users.length,
                users: users.map(user => ({
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    role: user.role
                }))
            });
        } catch (error) {
            console.error('Error getting active users:', error);
            res.status(500).json({
                success: false,
                message: 'An error occurred while retrieving active users',
                error: process.env.NODE_ENV === 'production' ? undefined : error.message
            });
        }
    }
}

module.exports = UserController;