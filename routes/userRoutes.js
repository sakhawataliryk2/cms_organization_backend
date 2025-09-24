const express = require('express');

function createUserRouter(userController, authMiddleware) {
    const router = express.Router();
    const { verifyToken, checkRole } = authMiddleware;

    // All routes require authentication
    router.use(verifyToken);

    // Get all active users (for dropdowns)
    router.get('/active', userController.getActiveUsers);

    // Get all users (admin only)
    router.get('/', checkRole('admin', 'owner'), userController.getAllUsers);

    // Create new user (any authenticated user can create users)
    router.post('/', userController.createUser);

    // Update user password
    router.put('/:userId/password', checkRole('admin', 'owner'), userController.updatePassword);

    return router;
}

module.exports = createUserRouter;