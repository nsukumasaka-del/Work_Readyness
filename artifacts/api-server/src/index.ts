import app from "./app";
import { logger } from "./lib/logger";
import { ensurePrimaryAdmin } from "./lib/admin-auth";
import { isEmailDeliveryConfigured } from "./lib/email";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

await ensurePrimaryAdmin();
logger.info("Primary admin account ready");

if (!isEmailDeliveryConfigured()) {
  logger.warn(
    "Signup email OTP is not configured. Set SMTP_HOST/SMTP_USER/SMTP_PASS (or RESEND_API_KEY) in .env so verification codes are emailed.",
  );
} else {
  logger.info("Signup email delivery is configured");
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
