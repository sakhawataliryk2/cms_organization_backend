const express = require("express");
const Onboarding = require("../models/onboarding");
const JobseekerPortalAuthController = require("../controllers/jobseekerPortalAuthController");

module.exports = function jobseekerPortalDocumentsRoutes(pool) {
  const router = express.Router();

  const onboarding = new Onboarding(pool);
  const portal = new JobseekerPortalAuthController(pool);

  router.get(
    "/documents",
    portal.portalAuth.bind(portal),
    async (req, res) => {
      try {
        // adjust according to your portalAuth
        const jobSeekerId =
          req.portalUser?.job_seeker_id ||
          req.user?.job_seeker_id ||
          req.user?.id;

        if (!jobSeekerId) {
          return res.status(401).json({ success: false, message: "Unauthorized" });
        }

        const docs = await onboarding.listForJobSeeker(jobSeekerId);
        return res.json({ success: true, documents: docs });
      } catch (e) {
        console.error(e);
        return res.status(500).json({ success: false, message: "Server error" });
      }
    }
  );

  return router;
};
