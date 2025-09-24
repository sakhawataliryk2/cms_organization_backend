const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

class User {
    constructor(pool) {
        this.pool = pool;
    }

    // Initialize the users table if it doesn't exist
    async initTable() {
        let client;
        try {
            console.log('Initializing users table if needed...');
            client = await this.pool.connect();

            await client.query(`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          email VARCHAR(255) UNIQUE NOT NULL,
          password VARCHAR(255) NOT NULL,
          role VARCHAR(50) NOT NULL CHECK (role IN ('candidate', 'recruiter', 'developer', 'admin', 'owner')),
          office_id INTEGER REFERENCES offices(id),
          team_id INTEGER REFERENCES teams(id),
          phone VARCHAR(20),
          phone2 VARCHAR(20),
          title VARCHAR(100),
          id_number VARCHAR(50),
          is_admin BOOLEAN DEFAULT false,
          token VARCHAR(500),
          status BOOLEAN DEFAULT true,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
            console.log('✅ Users table initialized successfully');
            return true;
        } catch (error) {
            console.error('❌ Error initializing users table:', error.message);
            throw error;
        } finally {
            if (client) {
                client.release();
            }
        }
    }

    // Create a new user
    async create(userData) {
        const { name, email, password, userType, officeId, teamId, phone, phone2, title, idNumber, isAdmin } = userData;
        const client = await this.pool.connect();

        try {
            // Check if user with this email already exists
            const checkUserQuery = 'SELECT * FROM users WHERE email = $1';
            const checkResult = await client.query(checkUserQuery, [email]);

            if (checkResult.rows.length > 0) {
                throw new Error('User with this email already exists');
            }

            // Hash the password
            const saltRounds = 10;
            const hashedPassword = await bcrypt.hash(password, saltRounds);

            // Generate a JWT token
            const token = jwt.sign(
                { email, userType },
                process.env.JWT_SECRET || 'default_secret_key',
                { expiresIn: '7d' }
            );

            // Begin transaction
            await client.query('BEGIN');

            // Insert user into database
            const insertUserQuery = `
        INSERT INTO users (name, email, password, role, office_id, team_id, phone, phone2, title, id_number, is_admin, token, status, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW())
        RETURNING id, name, email, role, office_id, team_id, phone, phone2, title, id_number, is_admin, token, status, created_at
      `;

            const values = [name, email, hashedPassword, userType, officeId, teamId, phone, phone2, title, idNumber, isAdmin || false, token, true];
            const result = await client.query(insertUserQuery, values);

            // If user is being added to a team, also add them to team_members table
            if (teamId) {
                await client.query(
                    'INSERT INTO team_members (team_id, user_id, role, added_at) VALUES ($1, $2, $3, NOW()) ON CONFLICT DO NOTHING',
                    [teamId, result.rows[0].id, 'member']
                );
            }

            // Commit transaction
            await client.query('COMMIT');

            return {
                id: result.rows[0].id,
                name: result.rows[0].name,
                email: result.rows[0].email,
                role: result.rows[0].role,
                officeId: result.rows[0].office_id,
                teamId: result.rows[0].team_id,
                phone: result.rows[0].phone,
                phone2: result.rows[0].phone2,
                title: result.rows[0].title,
                idNumber: result.rows[0].id_number,
                isAdmin: result.rows[0].is_admin,
                token: result.rows[0].token,
                status: result.rows[0].status,
                createdAt: result.rows[0].created_at
            };
        } catch (error) {
            // Rollback transaction in case of error
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    // Find user by email
    async findByEmail(email) {
        const client = await this.pool.connect();
        try {
            const query = `
                SELECT u.*, o.building_name as office_name, t.name as team_name
                FROM users u
                LEFT JOIN offices o ON u.office_id = o.id
                LEFT JOIN teams t ON u.team_id = t.id
                WHERE u.email = $1
            `;
            const result = await client.query(query, [email]);
            return result.rows[0] || null;
        } catch (error) {
            throw error;
        } finally {
            client.release();
        }
    }

    // Find user by token
    async findByToken(token) {
        const client = await this.pool.connect();
        try {
            const query = `
                SELECT u.*, o.building_name as office_name, t.name as team_name
                FROM users u
                LEFT JOIN offices o ON u.office_id = o.id
                LEFT JOIN teams t ON u.team_id = t.id
                WHERE u.token = $1
            `;
            const result = await client.query(query, [token]);
            return result.rows[0] || null;
        } catch (error) {
            throw error;
        } finally {
            client.release();
        }
    }

    // Find user by ID
    async findById(id) {
        const client = await this.pool.connect();
        try {
            const query = `
                SELECT u.*, o.building_name as office_name, t.name as team_name
                FROM users u
                LEFT JOIN offices o ON u.office_id = o.id
                LEFT JOIN teams t ON u.team_id = t.id
                WHERE u.id = $1
            `;
            const result = await client.query(query, [id]);
            return result.rows[0] || null;
        } catch (error) {
            throw error;
        } finally {
            client.release();
        }
    }

    // Update user token
    async updateToken(userId, token) {
        const client = await this.pool.connect();
        try {
            const query = 'UPDATE users SET token = $1, updated_at = NOW() WHERE id = $2 RETURNING *';
            const result = await client.query(query, [token, userId]);
            return result.rows[0];
        } catch (error) {
            throw error;
        } finally {
            client.release();
        }
    }

    // Update user status
    async updateStatus(userId, status) {
        const client = await this.pool.connect();
        try {
            const query = 'UPDATE users SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *';
            const result = await client.query(query, [status, userId]);
            return result.rows[0];
        } catch (error) {
            throw error;
        } finally {
            client.release();
        }
    }

    // Get all active users with office and team info
    async getActiveUsers() {
        const client = await this.pool.connect();
        try {
            const query = `
                SELECT u.id, u.name, u.email, u.role, u.phone, u.phone2, u.title, 
                       u.id_number, u.is_admin, u.office_id, u.team_id,
                       o.building_name as office_name, t.name as team_name
                FROM users u 
                LEFT JOIN offices o ON u.office_id = o.id
                LEFT JOIN teams t ON u.team_id = t.id
                WHERE u.status = true 
                ORDER BY u.name ASC
            `;
            const result = await client.query(query);
            return result.rows;
        } catch (error) {
            throw error;
        } finally {
            client.release();
        }
    }

    // Get users by team
    async getUsersByTeam(teamId) {
        const client = await this.pool.connect();
        try {
            const query = `
                SELECT u.id, u.name, u.email, u.role, u.phone, u.title
                FROM users u
                WHERE u.team_id = $1 AND u.status = true
                ORDER BY u.name ASC
            `;
            const result = await client.query(query, [teamId]);
            return result.rows;
        } catch (error) {
            throw error;
        } finally {
            client.release();
        }
    }

    // Get users by office
    async getUsersByOffice(officeId) {
        const client = await this.pool.connect();
        try {
            const query = `
                SELECT u.id, u.name, u.email, u.role, u.phone, u.title, t.name as team_name
                FROM users u
                LEFT JOIN teams t ON u.team_id = t.id
                WHERE u.office_id = $1 AND u.status = true
                ORDER BY u.name ASC
            `;
            const result = await client.query(query, [officeId]);
            return result.rows;
        } catch (error) {
            throw error;
        } finally {
            client.release();
        }
    }

    // Update user's office and team
    async updateOfficeAndTeam(userId, officeId, teamId) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');

            // Update user's office and team
            const updateUserQuery = `
                UPDATE users 
                SET office_id = $1, team_id = $2, updated_at = NOW() 
                WHERE id = $3 
                RETURNING *
            `;
            const result = await client.query(updateUserQuery, [officeId, teamId, userId]);

            // Update team_members table
            if (teamId) {
                // Remove from old team if any
                await client.query('DELETE FROM team_members WHERE user_id = $1', [userId]);

                // Add to new team
                await client.query(
                    'INSERT INTO team_members (team_id, user_id, role, added_at) VALUES ($1, $2, $3, NOW())',
                    [teamId, userId, 'member']
                );
            }

            await client.query('COMMIT');
            return result.rows[0];
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    // Update user profile
    async updateProfile(userId, userData) {
        const { name, email, phone, phone2, title, idNumber, officeId, teamId } = userData;
        const client = await this.pool.connect();

        try {
            await client.query('BEGIN');

            // Check if email is already taken by another user
            if (email) {
                const checkEmailQuery = 'SELECT id FROM users WHERE email = $1 AND id != $2';
                const emailCheck = await client.query(checkEmailQuery, [email, userId]);
                if (emailCheck.rows.length > 0) {
                    throw new Error('Email address is already in use by another user');
                }
            }

            // Update user information
            const updateQuery = `
                UPDATE users 
                SET name = COALESCE($1, name),
                    email = COALESCE($2, email),
                    phone = COALESCE($3, phone),
                    phone2 = COALESCE($4, phone2),
                    title = COALESCE($5, title),
                    id_number = COALESCE($6, id_number),
                    office_id = COALESCE($7, office_id),
                    team_id = COALESCE($8, team_id),
                    updated_at = NOW()
                WHERE id = $9
                RETURNING *
            `;

            const values = [name, email, phone, phone2, title, idNumber, officeId, teamId, userId];
            const result = await client.query(updateQuery, values);

            // Update team_members table if team changed
            if (teamId) {
                // Remove from old team
                await client.query('DELETE FROM team_members WHERE user_id = $1', [userId]);

                // Add to new team
                await client.query(
                    'INSERT INTO team_members (team_id, user_id, role, added_at) VALUES ($1, $2, $3, NOW()) ON CONFLICT DO NOTHING',
                    [teamId, userId, 'member']
                );
            }

            await client.query('COMMIT');
            return result.rows[0];
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    // Add this method to the User class
    async updatePassword(userId, newPassword) {
        const client = await this.pool.connect();
        try {
            // Hash the new password
            const saltRounds = 10;
            const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

            const query = `
            UPDATE users 
            SET password = $1, updated_at = NOW() 
            WHERE id = $2 
            RETURNING id, name, email, role
        `;
            const result = await client.query(query, [hashedPassword, userId]);
            return result.rows[0];
        } catch (error) {
            throw error;
        } finally {
            client.release();
        }
    }

    // Get user statistics
    async getUserStats() {
        const client = await this.pool.connect();
        try {
            const query = `
                SELECT 
                    COUNT(*) as total_users,
                    COUNT(CASE WHEN status = true THEN 1 END) as active_users,
                    COUNT(CASE WHEN status = false THEN 1 END) as inactive_users,
                    COUNT(CASE WHEN is_admin = true THEN 1 END) as admin_users,
                    COUNT(CASE WHEN role = 'recruiter' THEN 1 END) as recruiters,
                    COUNT(CASE WHEN role = 'candidate' THEN 1 END) as candidates,
                    COUNT(CASE WHEN role = 'admin' THEN 1 END) as admins,
                    COUNT(CASE WHEN role = 'owner' THEN 1 END) as owners,
                    COUNT(CASE WHEN role = 'developer' THEN 1 END) as developers
                FROM users
            `;
            const result = await client.query(query);
            return result.rows[0];
        } catch (error) {
            throw error;
        } finally {
            client.release();
        }
    }

    // Delete user (soft delete by setting status to false)
    async delete(userId) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');

            // Remove from team_members
            await client.query('DELETE FROM team_members WHERE user_id = $1', [userId]);

            // Soft delete user
            const query = 'UPDATE users SET status = false, updated_at = NOW() WHERE id = $1 RETURNING *';
            const result = await client.query(query, [userId]);

            await client.query('COMMIT');
            return result.rows[0];
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    // Hard delete user (permanent deletion)
    async hardDelete(userId) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');

            // Remove from team_members first (foreign key constraint)
            await client.query('DELETE FROM team_members WHERE user_id = $1', [userId]);

            // Delete user permanently
            const query = 'DELETE FROM users WHERE id = $1 RETURNING *';
            const result = await client.query(query, [userId]);

            await client.query('COMMIT');
            return result.rows[0];
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    // Search users
    async search(searchTerm, filters = {}) {
        const client = await this.pool.connect();
        try {
            let query = `
                SELECT u.id, u.name, u.email, u.role, u.phone, u.phone2, u.title, 
                       u.id_number, u.is_admin, u.status, u.office_id, u.team_id,
                       o.building_name as office_name, t.name as team_name
                FROM users u 
                LEFT JOIN offices o ON u.office_id = o.id
                LEFT JOIN teams t ON u.team_id = t.id
                WHERE 1=1
            `;

            const params = [];
            let paramIndex = 1;

            // Add search term filter
            if (searchTerm) {
                query += ` AND (
                    u.name ILIKE $${paramIndex} OR 
                    u.email ILIKE $${paramIndex} OR 
                    u.phone ILIKE $${paramIndex} OR 
                    u.title ILIKE $${paramIndex} OR
                    o.building_name ILIKE $${paramIndex} OR
                    t.name ILIKE $${paramIndex}
                )`;
                params.push(`%${searchTerm}%`);
                paramIndex++;
            }

            // Add filters
            if (filters.role) {
                query += ` AND u.role = $${paramIndex}`;
                params.push(filters.role);
                paramIndex++;
            }

            if (filters.officeId) {
                query += ` AND u.office_id = $${paramIndex}`;
                params.push(filters.officeId);
                paramIndex++;
            }

            if (filters.teamId) {
                query += ` AND u.team_id = $${paramIndex}`;
                params.push(filters.teamId);
                paramIndex++;
            }

            if (filters.status !== undefined) {
                query += ` AND u.status = $${paramIndex}`;
                params.push(filters.status);
                paramIndex++;
            }

            if (filters.isAdmin !== undefined) {
                query += ` AND u.is_admin = $${paramIndex}`;
                params.push(filters.isAdmin);
                paramIndex++;
            }

            query += ' ORDER BY u.name ASC';

            // Add pagination if specified
            if (filters.limit) {
                query += ` LIMIT $${paramIndex}`;
                params.push(filters.limit);
                paramIndex++;
            }

            if (filters.offset) {
                query += ` OFFSET $${paramIndex}`;
                params.push(filters.offset);
                paramIndex++;
            }

            const result = await client.query(query, params);
            return result.rows;
        } catch (error) {
            throw error;
        } finally {
            client.release();
        }
    }

    // Get all users with detailed information (for admin purposes)
    async getAllDetailed(filters = {}) {
        const client = await this.pool.connect();
        try {
            let query = `
                SELECT u.id, u.name, u.email, u.role, u.phone, u.phone2, u.title, 
                       u.id_number, u.is_admin, u.status, u.office_id, u.team_id,
                       u.created_at, u.updated_at,
                       o.building_name as office_name, 
                       t.name as team_name,
                       COUNT(tm.user_id) as team_count
                FROM users u 
                LEFT JOIN offices o ON u.office_id = o.id
                LEFT JOIN teams t ON u.team_id = t.id
                LEFT JOIN team_members tm ON u.id = tm.user_id
                WHERE 1=1
            `;

            const params = [];
            let paramIndex = 1;

            // Add status filter
            if (filters.status !== undefined) {
                query += ` AND u.status = $${paramIndex}`;
                params.push(filters.status);
                paramIndex++;
            }

            query += ` GROUP BY u.id, o.building_name, t.name ORDER BY u.name ASC`;

            const result = await client.query(query, params);
            return result.rows;
        } catch (error) {
            throw error;
        } finally {
            client.release();
        }
    }
}

module.exports = User;