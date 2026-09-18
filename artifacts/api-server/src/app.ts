import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import path from "node:path";
import fs from "node:fs";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

const allowedOrigins = (process.env.CORS_ORIGINS || "https://www.bonlist.site,https://bonlist.site")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow non-browser / same-origin / Capacitor WebView requests
      if (!origin) {
        callback(null, true);
        return;
      }
      if (allowedOrigins.includes(origin) || allowedOrigins.includes("*")) {
        callback(null, true);
        return;
      }
      // Do not emit CORS headers for origins that are not explicitly trusted.
      // Capacitor WebViews do not send an Origin header and are handled above.
      callback(null, false);
    },
    credentials: true,
  }),
);
app.use(cookieParser());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

app.use("/api", router);

// Production all-in-one: serve the built SPA from the same Node process as /api.
const staticDir = process.env.STATIC_DIR?.trim();
if (staticDir) {
  const resolved = path.resolve(staticDir);
  if (fs.existsSync(resolved)) {
    app.use(express.static(resolved, { index: false, maxAge: "1h" }));
    app.get(/.*/, (req, res, next) => {
      if (req.path.startsWith("/api")) {
        next();
        return;
      }
      res.sendFile(path.join(resolved, "index.html"), (err) => {
        if (err) next(err);
      });
    });
    logger.info({ staticDir: resolved }, "Serving BonList web UI from STATIC_DIR");
  } else {
    logger.warn({ staticDir: resolved }, "STATIC_DIR does not exist — API-only mode");
  }
}

app.use((err: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (res.headersSent) {
    next(err);
    return;
  }

  const isBodySyntaxError =
    err instanceof SyntaxError &&
    typeof err === "object" &&
    err !== null &&
    "body" in err;

  if (
    err &&
    typeof err === "object" &&
    "type" in err &&
    (err as { type?: string }).type === "entity.too.large"
  ) {
    res.status(413).json({
      error: "The uploaded request is too large. Please upload a CV under 20MB or paste the text directly.",
    });
    return;
  }

  if (isBodySyntaxError) {
    res.status(400).json({ error: "Invalid JSON in request body" });
    return;
  }

  logger.error({ err }, "Unhandled API error");
  res.status(500).json({ error: "Something went wrong. Please try again." });
});

export default app;
