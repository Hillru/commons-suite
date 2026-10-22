import { createStore } from "./store.js";
import { buildApp } from "./app.js";
import { Server } from "@hocuspocus/server";
import { applyUpdate, encodeStateAsUpdate } from "yjs";
import staticFiles from "@fastify/static";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { initialDocument, persistDocument } from "./documents.js";

const store = createStore(process.env.DATA_DIR ?? "./data");
if (!store.db.prepare("SELECT id FROM users LIMIT 1").get()) {
  if (
    process.env.ADMIN_PASSWORD === "replace-with-a-long-random-password" ||
    !process.env.ADMIN_EMAIL ||
    (process.env.ADMIN_PASSWORD?.length ?? 0) < 12
  )
    throw new Error(
      "Set ADMIN_EMAIL and ADMIN_PASSWORD (12+ characters) before the first start. See .env.example.",
    );
  store.createUser(process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD, true);
}
let origin = process.env.PUBLIC_ORIGIN ?? "http://localhost:3000";
const port = Number(process.env.PORT ?? 3000),
  host = process.env.HOST ?? "127.0.0.1";
const collabPort = Number(process.env.COLLAB_PORT ?? 3001);
const collaboration = new Server({
  port: collabPort,
  address: host,
  quiet: process.env.DESKTOP_MODE === "true",
  debounce: 500,
  maxDebounce: 2000,
  async onAuthenticate({ token, documentName, connectionConfig }) {
    const ticket = app.tickets.get(token),
      user = ticket && store.authenticate(ticket.session);
    if (
      !ticket ||
      ticket.expires < Date.now() ||
      ticket.fileId !== documentName ||
      !user ||
      !store.allowed(documentName, user.id)
    )
      throw new Error("Unauthorized");
    connectionConfig.readOnly = !store.allowed(documentName, user.id, true);
    return { session: ticket.session, userId: user.id };
  },
  async beforeHandleMessage({ context, documentName }) {
    const user = store.authenticate(context.session);
    if (!user || !store.allowed(documentName, user.id))
      throw new Error("Access revoked");
  },
  async onLoadDocument({ documentName, document }) {
    const state = store.db
      .prepare("SELECT state FROM collaboration WHERE file_id=?")
      .get(documentName);
    if (state) applyUpdate(document, new Uint8Array(state.state));
    else {
      const initial = initialDocument(store.file(documentName).content.html);
      applyUpdate(document, encodeStateAsUpdate(initial));
      initial.destroy();
    }
    return document;
  },
  async onChange({ documentName, document }) {
    persistDocument(store, documentName, document);
  },
  async onStoreDocument({ documentName, document }) {
    persistDocument(store, documentName, document);
  },
});
await collaboration.listen();
const collabUrl =
  process.env.COLLAB_URL ??
  (process.env.DESKTOP_MODE === "true"
    ? `ws://${host}:${collaboration.address.port}`
    : origin.replace(/^http/, "ws").replace(/:\d+$/, "") +
      ":" +
      collaboration.address.port);
const app = await buildApp(store, {
  origin: () => origin,
  secure: process.env.COOKIE_SECURE === "true",
  collabUrl,
  desktopToken: process.env.DESKTOP_TOKEN,
  logger: process.env.DESKTOP_MODE !== "true",
});
app.revokeConnections = () => collaboration.hocuspocus.closeConnections();
if (existsSync(resolve("dist/index.html"))) {
  await app.register(staticFiles, { root: resolve("dist"), wildcard: false });
  app.setNotFoundHandler((req, reply) =>
    req.url.startsWith("/api/")
      ? reply.code(404).send({ error: "Not found" })
      : reply.sendFile("index.html"),
  );
} else
  app.get("/", (req, reply) =>
    reply
      .type("text/plain")
      .send("Run npm run build, then restart the server."),
  );
await app.listen({ port, host });
if (process.env.DESKTOP_MODE === "true") {
  origin = `http://${host}:${app.server.address().port}`;
  console.log(JSON.stringify({ type: "ready", url: origin, collabUrl }));
}
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    await collaboration.destroy();
    await app.close();
    store.db.close();
    process.exit(0);
  });
