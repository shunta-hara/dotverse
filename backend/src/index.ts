import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { createServer } from "http";
import { createSocketServer } from "./socket";
import authRouter from "./routes/auth";
import usersRouter from "./routes/users";
import landsRouter from "./routes/lands";
import signsRouter from "./routes/signs";

const app = express();
const httpServer = createServer(app);

app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL,
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

app.use("/auth", authRouter);
app.use("/users", usersRouter);
app.use("/lands", landsRouter);
app.use("/signs", signsRouter);

app.get("/health", (_req, res) => res.json({ status: "ok" }));

// エラーハンドラ
app.use((err: Error & { statusCode?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const code = err.message;
  const status = err.statusCode ?? 500;
  const messages: Record<string, string> = {
    LIMIT_EXCEEDED: "保有数が上限に達しています",
    LAND_OVERLAP: "指定エリアには既に土地が存在します",
  };
  res.status(status).json({
    error: code,
    message: messages[code] ?? "サーバーエラーが発生しました",
  });
});

const PORT = Number(process.env.PORT ?? 4000);

createSocketServer(httpServer).then(() => {
  httpServer.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}).catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
