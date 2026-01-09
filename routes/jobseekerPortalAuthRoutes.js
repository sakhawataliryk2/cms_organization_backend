const express = require("express");
const JobseekerPortalAuthController = require("../controllers/jobseekerPortalAuthController");

module.exports = function jobseekerPortalAuthRoutes(pool) {
  const router = express.Router();
  const controller = new JobseekerPortalAuthController(pool);

  router.post("/login", controller.login.bind(controller));
  router.post("/forgot-password", controller.forgotPassword.bind(controller));

  router.get("/me", controller.portalAuth.bind(controller), controller.me.bind(controller));
  router.post("/logout", controller.portalAuth.bind(controller), controller.logout.bind(controller));

  return router;
};
