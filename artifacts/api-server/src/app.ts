import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
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

const allowedOrigins = (process.env.CORS_ORIGINS || "")
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
      if (allowedOrigins.length === 0 || allowedOrigins.includes(origin) || allowedOrigins.includes("*")) {
        callback(null, true);
        return;
      }
      callback(null, true); // permissive for Android WebView origins during rollout
    },
    credentials: true,
  }),
);
app.use(cookieParser());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

app.use("/api", router);

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

  if (isBodySyntaxError) {
    res.status(400).json({ error: "Invalid JSON in request body" });
    return;
  }

  logger.error({ err }, "Unhandled API error");
  res.status(500).json({ error: "Something went wrong. Please try again." });
});

export default app;
