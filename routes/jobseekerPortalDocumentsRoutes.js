const express = require("express");
const Onboarding = require("../models/onboarding");
const JobseekerPortalAuthController = require("../controllers/jobseekerPortalAuthController");

module.exports = function jobseekerPortalDocumentsRoutes(pool) {
  const router = express.Router();

  const onboarding = new Onboarding(pool);
  const portal = new JobseekerPortalAuthController(pool);

  // Route to fetch documents
  router.get("/documents", portal.portalAuth.bind(portal), async (req, res) => {
    try {
      const jobSeekerId = req.portalUser?.job_seeker_id || req.user?.job_seeker_id || req.user?.id;
      if (!jobSeekerId) return res.status(401).json({ success: false, message: "Unauthorized" });

      const docs = await onboarding.listForJobSeeker(jobSeekerId);

      const docsWithData = await Promise.all(docs.map(async (doc) => {
        const data = await onboarding.getJobseekerData(jobSeekerId, doc.template_document_id);
        return { ...doc, jobseekerData: data };
      }));

      return res.json({ success: true, documents: docsWithData });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ success: false, message: "Server error" });
    }
  });

  // In your backend routes file
router.get("/profile", portal.portalAuth.bind(portal), async (req, res) => {
    // DEBUG: See what the middleware attached to the request
    console.log("Portal User:", req.portalUser);
    console.log("User:", req.user);

    try {
      // Check if your middleware uses a different property name
      const jobSeekerId = req.portalUser?.job_seeker_id || 
                         req.user?.job_seeker_id || 
                         req.user?.id ||
                         req.portalUser?.id; // Try adding this

      if (!jobSeekerId) {
        return res.status(401).json({ 
          success: false, 
          message: "Unauthorized - No Jobseeker ID found in request" 
        });
      }

      const profile = await onboarding.getJobseekerProfile(jobSeekerId);
      return res.json({ success: true, profile });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ success: false, message: "Server error" });
    }
});


  return router;
};