import { randomBytes } from "node:crypto";
import { mkdirSync, rmSync } from "node:fs";
import { spawn } from "node:child_process";
import { join } from "node:path";
const data = join(
  process.cwd(),
  ".tmp",
  "e2e-" + randomBytes(6).toString("hex"),
);
mkdirSync(data, { recursive: true });
const child = spawn(process.execPath, ["server/index.js"], {
  stdio: "inherit",
  env: {
    ...process.env,
    HOST: "127.0.0.1",
    PORT: "3100",
    COLLAB_PORT: "3101",
    PUBLIC_ORIGIN: "http://localhost:3100",
    COLLAB_URL: "ws://localhost:3101",
    ADMIN_EMAIL: "owner@example.com",
    ADMIN_PASSWORD: "test-password-only-12345",
    DATA_DIR: data,
  },
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
child.on("exit", (code) => {
  rmSync(data, { recursive: true, force: true });
  process.exit(code ?? 0);
});
