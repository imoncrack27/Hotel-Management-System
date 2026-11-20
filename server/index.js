import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import { auth, login } from "./auth.js";
import api from "./routes.js";

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(here, ".env") }); // always read server/.env

if (!process.env.JWT_SECRET) {
  console.error("JWT_SECRET is not set. Add it to .env or your host settings.");
  process.exit(1);
}

const app = express();
app.use(cors({ origin: process.env.CLIENT_URL || "http://localhost:5173" }));
app.use(express.json());

app.get("/health", (_, res) => res.json({ ok: true }));
app.post("/api/auth/login", login); // the only public route: staff accounts are created by seed.js
app.use("/api", auth, api); // everything else needs a staff token
app.use("/api", (_, res) => res.status(404).json({ error: "Not found." }));

// In production this one server also serves the built React app (no CORS, one service to host).
const dist = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../client/dist"
);
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get("*", (_, res) => res.sendFile(path.join(dist, "index.html")));
}

await mongoose.connect(
  process.env.MONGO_URI || "mongodb://127.0.0.1:27017/lodgedesk"
);
const port = process.env.PORT || 5000;
app.listen(port, () =>
  console.log("LodgeDesk running on http://localhost:" + port)
);
