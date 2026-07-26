import { Router } from "express";
import captionRoutes from "./caption.routes.js";

const router = Router();

// Caption routes (mount root-level inside /api)
router.use(captionRoutes);

export default router;
