const express = require("express");

function createOnboardingRouter(onboardingController, authMiddleware) {
  const router = express.Router();
  const { verifyToken } = authMiddleware;

  router.use(verifyToken);

  router.post("/send", onboardingController.send);
  router.get("/job-seekers/:id", onboardingController.getForJobSeeker);

  return router;
}

module.exports = createOnboardingRouter;
