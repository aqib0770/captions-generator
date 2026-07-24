import { Router } from "express";
import captionRoutes from "./caption.routes.js";

const router = Router();

// Health check (Cloud Run uses this)
router.get("/status", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Caption routes
router.use(captionRoutes);

export default router;
