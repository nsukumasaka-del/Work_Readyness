import { Router, type IRouter } from "express";
import { sendTransactionalEmail } from "../lib/email";
import { logger } from "../lib/logger";

const router: IRouter = Router();

/**
 * Worker → Render SMTP bridge.
 * Auth: Authorization: Bearer <INTERNAL_EMAIL_SECRET>
 */
router.post("/internal/send-email", async (req, res) => {
  const expected = String(process.env.INTERNAL_EMAIL_SECRET || "").trim();
  if (!expected) {
    res.status(503).json({ error: "Internal email bridge is not configured on this API host." });
    return;
  }

  const auth = String(req.headers.authorization || "");
  const match = /^Bearer\s+(.+)$/i.exec(auth.trim());
  const provided = match?.[1]?.trim() || "";
  if (!provided || provided !== expected) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const to = String(req.body?.to || "").trim();
  const subject = String(req.body?.subject || "").trim();
  const text = String(req.body?.text || "");
  const html = String(req.body?.html || "");

  if (!to || !to.includes("@") || !subject || (!text && !html)) {
    res.status(400).json({ error: "to, subject, and text or html are required." });
    return;
  }

  try {
    const result = await sendTransactionalEmail({
      to,
      subject,
      text: text || html.replace(/<[^>]+>/g, " "),
      html: html || `<pre>${text}</pre>`,
    });
    if (!result.sent) {
      res.status(503).json({
        error:
          "Email delivery is not configured on the API host. Set SMTP_HOST/SMTP_USER/SMTP_PASS or RESEND_API_KEY.",
      });
      return;
    }
    res.json({ ok: true, provider: result.provider });
  } catch (err) {
    logger.error({ err }, "internal send-email failed");
    res.status(502).json({
      error: err instanceof Error ? err.message : "Could not send email.",
    });
  }
});

export default router;
