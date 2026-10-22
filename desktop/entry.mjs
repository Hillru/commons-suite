// Private stdin protocol: credentials and capability never appear in arguments or files.
import { createInterface } from "node:readline";
import { createStore } from "../server/store.js";
import { resolve } from "node:path";
import {
  mkdirSync,
  chmodSync,
  existsSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  unlinkSync,
} from "node:fs";
process.umask(0o077);
const lines = createInterface({ input: process.stdin });
const iterator = lines[Symbol.asyncIterator]();
const read = async () => JSON.parse((await iterator.next()).value);
const config = await read();
if (!config.dataDir || !/^[a-f0-9]{64}$/.test(config.token))
  throw Error("Invalid desktop configuration");
mkdirSync(config.dataDir, { recursive: true, mode: 0o700 });
chmodSync(config.dataDir, 0o700);
const store = createStore(config.dataDir);
// Before a version changes, retain up to three consistent SQLite backups.
const version = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url)),
).version;
const marker = resolve(config.dataDir, "desktop-version");
if (existsSync(marker) && readFileSync(marker, "utf8") !== version) {
  const backups = resolve(config.dataDir, "backups");
  mkdirSync(backups, { recursive: true, mode: 0o700 });
  const filename = resolve(backups, `workspace-${Date.now()}.sqlite`);
  store.db.exec(`VACUUM INTO '${filename.replaceAll("'", "''")}'`);
  const files = readdirSync(backups)
    .filter((name) => /^workspace-\d+\.sqlite$/.test(name))
    .sort();
  for (const old of files.slice(0, -3)) unlinkSync(resolve(backups, old));
}
writeFileSync(marker, version, { mode: 0o600 });
const empty = !store.db.prepare("SELECT id FROM users LIMIT 1").get();
store.db.close();
if (empty) {
  console.log(JSON.stringify({ type: "setup" }));
  const account = await read();
  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(account.email) ||
    typeof account.password !== "string" ||
    account.password.length < 12 ||
    account.password.length > 256
  )
    throw Error("Enter a valid email and a password of at least 12 characters");
  process.env.ADMIN_EMAIL = account.email;
  process.env.ADMIN_PASSWORD = account.password;
}
Object.assign(process.env, {
  DATA_DIR: resolve(config.dataDir),
  DESKTOP_MODE: "true",
  DESKTOP_TOKEN: config.token,
  PORT: "0",
  COLLAB_PORT: "0",
  HOST: "127.0.0.1",
  PUBLIC_ORIGIN: "http://127.0.0.1",
});
process.umask(0o077);
await import("../server/index.js");
delete process.env.ADMIN_PASSWORD;
delete process.env.ADMIN_EMAIL;

// The service must not outlive the app that owns its private capability.
lines.on("close", () => process.kill(process.pid, "SIGTERM"));
