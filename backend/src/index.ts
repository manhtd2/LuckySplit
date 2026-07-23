import express from "express";
import cors from "cors";
// Must be imported before any router that defines async handlers -- patches
// Express 4 to forward rejected promises to the error middleware, which it
// does not do natively (that's an Express 5-only behavior).
import "express-async-errors";
import { env } from "./env.js";
import { authRouter } from "./routes/auth.js";
import { organizersRouter } from "./routes/organizers.js";
import { eventsRouter } from "./routes/events.js";
import { publicRouter } from "./routes/public.js";
import { startWatcher } from "./services/watcher.js";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/api/auth", authRouter);
app.use("/api/organizers", organizersRouter);
app.use("/api/events", eventsRouter);
app.use("/api/public", publicRouter);

// Centralized error handler -- every route above is async and can throw;
// without this Express 4 would hang the request instead of responding.
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: err instanceof Error ? err.message : "Internal error" });
});

const port = Number(env.PORT);
app.listen(port, () => {
  console.log(`[luckysplit-backend] listening on :${port}`);
  startWatcher();
});
