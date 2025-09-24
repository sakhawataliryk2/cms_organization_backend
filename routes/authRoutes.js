const express = require('express');

function createAuthRouter(authController) {
    const router = express.Router();

    // Create initial developer account (public - only works when no users exist)
    router.post('/init-developer', authController.createInitialDeveloper);

    // Signup route (protected - requires authentication)
    router.post('/signup', authController.signup);

    // Login route
    router.post('/login', authController.login);

    // Logout route
    router.post('/logout', authController.logout);

    return router;
}

module.exports = createAuthRouter;