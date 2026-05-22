import "dotenv/config";
import http from "http";
import https from "https";
import Anthropic from "@anthropic-ai/sdk";
import cors from "cors";
import express from "express";
import { createClassifyRouter } from "./classify";
import { loadPolicy } from "./policy";

async function main(): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY is required. Copy .env.example to .env.");
    process.exit(1);
  }

  const port = Number(process.env.PORT ?? 4000);
  const useHttp = process.env.USE_HTTP === "true";
  const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "https://localhost:3000")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const sharedAuthToken = process.env.SHARED_AUTH_TOKEN || undefined;

  await loadPolicy();

  const anthropic = new Anthropic({
    apiKey,
    maxRetries: 3,
  });

  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use(
    cors({
      origin: allowedOrigins,
      methods: ["POST", "GET", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
    })
  );

  app.use(createClassifyRouter(anthropic, { sharedAuthToken }));

  if (useHttp) {
    const server = http.createServer(app);
    server.listen(port, () => {
      console.log(`[server] HTTP listening on http://localhost:${port}`);
      console.log(`[server] CORS allowed origins: ${allowedOrigins.join(", ")}`);
      if (!sharedAuthToken) {
        console.warn("[server] SHARED_AUTH_TOKEN not set — endpoint is unauthenticated.");
      }
    });
  } else {
    const devCerts = await import("office-addin-dev-certs");
    const certs = await devCerts.getHttpsServerOptions();
    const server = https.createServer({ key: certs.key, cert: certs.cert }, app);
    server.listen(port, () => {
      console.log(`[server] HTTPS listening on https://localhost:${port}`);
      console.log(`[server] CORS allowed origins: ${allowedOrigins.join(", ")}`);
      if (!sharedAuthToken) {
        console.warn("[server] SHARED_AUTH_TOKEN not set — endpoint is unauthenticated.");
      }
    });
  }
}

main().catch((err) => {
  console.error("[server] Fatal startup error:", err);
  process.exit(1);
});
