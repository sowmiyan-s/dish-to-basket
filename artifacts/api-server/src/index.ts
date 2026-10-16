import fs from "node:fs";
import path from "node:path";
import app from "./app";
import { logger } from "./lib/logger";

const envCandidates = [
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), "../../.env"),
  path.resolve(process.cwd(), "../.env"),
];
for (const p of envCandidates) {
  if (fs.existsSync(p)) {
    try {
      process.loadEnvFile(p);
      logger.info({ envPath: p }, "Loaded environment variables from .env");
      break;
    } catch {}
  }
}

const rawPort = process.env["PORT"] || "5000";


const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
