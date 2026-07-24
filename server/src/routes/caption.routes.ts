import { Router } from "express";
import multer from "multer";
import { upload, handleCaption, handleDownload } from "../controllers/caption.controller.js";

const router = Router();

// Caption endpoint — accepts video upload, streams progress via SSE
router.post("/caption", (req, res, next) => {
  // Wrap multer to handle its errors gracefully
  upload.single("video")(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
        res.status(413).json({ error: "File too large. Maximum size is 30 MB." });
        return;
      }
      res.status(400).json({ error: err.message });
      return;
    }
    handleCaption(req, res).catch(next);
  });
});

// Download captioned video
router.get("/download/:jobId", handleDownload);

export default router;
