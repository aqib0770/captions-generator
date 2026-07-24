import express from "express";
import path from "path";
import apiRoutes from "./routes/index.js";
import { __dirname } from "./utils/path.js";

const app = express();
const PORT = parseInt(process.env.PORT || "8080", 10);

// Trust proxy for correct client IP behind Cloud Run's load balancer
app.set("trust proxy", true);

// Serve the frontend
app.use(express.static(path.join(__dirname, "..", "public")));

// API routes
app.use("/api", apiRoutes);

// ---------- Start ----------

app.listen(PORT, () => {
  console.log(`\n  Caption Generator API`);
  console.log(`  → http://localhost:${PORT}\n`);
});
