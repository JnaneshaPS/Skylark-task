/**
 * Express server entry point.
 */

import "dotenv/config";
import express from "express";
import cors from "cors";
import apiRouter from "./routes/api.js";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use("/api", apiRouter);

app.listen(PORT, () => {
  console.log(`Skylark BI Agent backend running on http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
});

export default app;
