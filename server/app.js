import Fastify from "fastify";
import { readFileSync } from "node:fs";
const appVersion = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url)),
).version;
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { hash, passwordMatches, passwordHash } from "./store.js";
import { exportFile, cleanHtml } from "./formats.js";
import { isolatedImport } from "./import.js";
import { documentContent } from "./documents.js";

const cell = z.record(
  z.string().regex(/^[A-Z]{1,3}[1-9]\d{0,5}$/),
  z.string().max(10000),
);
const schemas = {
  document: z.object({ html: z.string().max(1000000) }),
  sheet: z.object({
    sheets: z
      .array(
        z.object({
          name: z
            .string()
            .min(1)
            .max(31)
            .regex(/^[^\\/*?:\[\]]+$/),
          cells: cell,
        }),
      )
      .min(1)
      .max(10),
  }),
  slides: z.object({
    slides: z
      .array(
        z.object({
          title: z.string().max(2000),
          body: z.string().max(10000),
          background: z.string().regex(/^#[0-9a-fA-F]{6}$/),
        }),
      )
      .min(1)
      .max(100),
  }),
  folder: z.object({}),
};
export async function buildApp(
  store,
  {
    origin = "http://localhost:3000",
    secure = false,
    collabUrl = "ws://localhost:3001",
    logger = false,
    desktopToken,
  } = {},
) {
  const app = Fastify({ logger, bodyLimit: 2 * 1024 * 1024 });
  await app.register(cookie);
  await app.register(helmet, {
    strictTransportSecurity: secure ? undefined : false,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        upgradeInsecureRequests: secure ? [] : null,
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'", collabUrl],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
  });
  await app.register(rateLimit, { max: 200, timeWindow: "1 minute" });
  const tickets = new Map();
  app.decorate("tickets", tickets);
  app.decorate("revokeConnections", () => {});
  app.addHook("onRequest", async (req, reply) => {
    if (
      desktopToken &&
      req.url.startsWith("/api/") &&
      req.url.split("?")[0] !== "/api/health" &&
      (typeof req.cookies.desktop !== "string" ||
        hash(req.cookies.desktop) !== hash(desktopToken))
    )
      return reply
        .code(403)
        .send({ error: "Open this workspace in the desktop app" });
    if (
      req.url.startsWith("/api/") &&
      !["GET", "HEAD"].includes(req.method) &&
      req.headers.origin !== (typeof origin === "function" ? origin() : origin)
    )
      return reply.code(403).send({ error: "Invalid request origin" });
    req.user = store.authenticate(req.cookies.session);
    if (
      req.url.startsWith("/api/") &&
      !["/api/login", "/api/health"].includes(req.url.split("?")[0]) &&
      !req.user
    )
      return reply.code(401).send({ error: "Sign in required" });
  });
  app.setErrorHandler((err, req, reply) => {
    if (err instanceof z.ZodError)
      return reply.code(400).send({
        error: "Invalid input",
        details: err.issues.map((i) => i.message),
      });
    req.log.error(err);
    reply
      .code(err.statusCode && err.statusCode < 500 ? err.statusCode : 500)
      .send({
        error:
          err.statusCode && err.statusCode < 500
            ? err.message
            : "Request failed",
      });
  });
  function requireFile(req, reply, write = false) {
    const f = store.file(req.params.id);
    if (!f || !store.allowed(f.id, req.user.id, write)) {
      reply.code(404).send({ error: "File unavailable" });
      return null;
    }
    return f;
  }
  const publicFile = (f, uid) => ({ ...f, role: store.role(f.id, uid) });
  app.get("/api/health", () => ({ status: "ok", version: appVersion }));
  app.post(
    "/api/login",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const body = z
        .object({ email: z.string().email(), password: z.string().max(256) })
        .parse(req.body);
      const u = store.db
        .prepare("SELECT * FROM users WHERE email=?")
        .get(body.email.toLowerCase());
      // Always perform a password comparison to reduce account enumeration timing.
      const ok = passwordMatches(
        body.password,
        u?.password ??
          store.db.prepare("SELECT password FROM users LIMIT 1").get()
            ?.password ??
          "0:" + "00".repeat(64),
      );
      if (!u || !ok)
        return reply
          .code(401)
          .send({ error: "Email or password is incorrect" });
      const token = store.session(u.id);
      reply.setCookie("session", token, {
        httpOnly: true,
        secure,
        sameSite: "strict",
        path: "/",
        maxAge: 8 * 3600,
      });
      store.audit(u.id, "session.created", null);
      return store.user(u.id);
    },
  );
  app.post("/api/logout", async (req, reply) => {
    store.db
      .prepare("DELETE FROM sessions WHERE token=?")
      .run(hash(req.cookies.session));
    app.revokeConnections();
    reply.clearCookie("session", { path: "/" });
    return { ok: true };
  });
  app.get("/api/me", (req) => req.user);
  app.post(
    "/api/password",
    { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const b = z
        .object({
          currentPassword: z.string().max(256),
          newPassword: z.string().min(12).max(256),
        })
        .parse(req.body);
      const current = store.db
        .prepare("SELECT password FROM users WHERE id=?")
        .get(req.user.id);
      if (!passwordMatches(b.currentPassword, current.password))
        return reply.code(403).send({ error: "Current password is incorrect" });
      store.db
        .prepare("UPDATE users SET password=? WHERE id=?")
        .run(passwordHash(b.newPassword), req.user.id);
      store.db.prepare("DELETE FROM sessions WHERE user_id=?").run(req.user.id);
      app.revokeConnections();
      reply.clearCookie("session", { path: "/" });
      store.audit(req.user.id, "password.changed", null);
      return { ok: true };
    },
  );
  app.get("/api/config", () => ({ collabUrl }));
  app.get("/api/users", (req) =>
    store.db.prepare("SELECT id,email FROM users ORDER BY email").all(),
  );
  app.post("/api/users", async (req, reply) => {
    if (!req.user.admin)
      return reply.code(403).send({ error: "Administrator required" });
    const body = z
      .object({
        email: z.string().email(),
        password: z.string().min(12).max(256),
      })
      .parse(req.body);
    if (
      store.db
        .prepare("SELECT id FROM users WHERE email=?")
        .get(body.email.toLowerCase())
    )
      return reply.code(409).send({ error: "User exists" });
    const result = store.createUser(body.email, body.password);
    store.audit(req.user.id, "user.created", null);
    return reply.code(201).send(result);
  });
  app.get("/api/files", (req) =>
    store.db
      .prepare("SELECT id FROM files WHERE trashed=0 ORDER BY updated DESC")
      .all()
      .map((r) => store.file(r.id))
      .filter((f) => store.allowed(f.id, req.user.id))
      .map((f) => {
        const { content, ...metadata } = publicFile(f, req.user.id);
        return metadata;
      }),
  );
  app.post(
    "/api/import",
    {
      bodyLimit: 8 * 1024 * 1024,
      config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
    },
    async (req, reply) => {
      const b = z
        .object({
          name: z.string().min(1).max(200),
          data: z
            .string()
            .max(7 * 1024 * 1024)
            .regex(/^[A-Za-z0-9+/]*={0,2}$/),
          parent: z.string().uuid().nullable().optional(),
        })
        .parse(req.body);
      if (
        b.parent &&
        (!store.allowed(b.parent, req.user.id, true) ||
          store.file(b.parent).kind !== "folder")
      )
        return reply.code(403).send({ error: "Folder unavailable" });
      try {
        const parsed = await isolatedImport(b.name, b.data);
        const content = schemas[parsed.kind].parse(parsed.content);
        const f = store.createFile(
          req.user.id,
          b.name.replace(/\.[^.]+$/, ""),
          parsed.kind,
          b.parent,
          content,
        );
        store.db
          .prepare("INSERT INTO originals VALUES(?,?,?)")
          .run(f.id, b.name, Buffer.from(b.data, "base64"));
        return reply.code(201).send({
          file: publicFile(f, req.user.id),
          warnings: parsed.warnings,
        });
      } catch {
        return reply.code(400).send({
          error: "Import rejected. Use a basic DOCX or XLSX under 5 MB.",
        });
      }
    },
  );
  app.get("/api/files/:id/original", async (req, reply) => {
    const f = requireFile(req, reply);
    if (!f) return;
    const original = store.db
      .prepare("SELECT * FROM originals WHERE file_id=?")
      .get(f.id);
    if (!original)
      return reply.code(404).send({ error: "No imported original" });
    return reply
      .header(
        "Content-Disposition",
        'attachment; filename="original-' + f.id + '.bin"',
      )
      .type("application/octet-stream")
      .send(Buffer.from(original.data));
  });
  app.post("/api/files", async (req, reply) => {
    const b = z
      .object({
        title: z.string().trim().min(1).max(200),
        kind: z.enum(["document", "sheet", "slides", "folder"]),
        parent: z.string().uuid().nullable().optional(),
      })
      .parse(req.body);
    if (
      b.parent &&
      (!store.allowed(b.parent, req.user.id, true) ||
        store.file(b.parent).kind !== "folder")
    )
      return reply.code(403).send({ error: "Folder unavailable" });
    return reply
      .code(201)
      .send(
        publicFile(
          store.createFile(req.user.id, b.title, b.kind, b.parent),
          req.user.id,
        ),
      );
  });
  app.get("/api/files/:id", async (req, reply) => {
    const f = requireFile(req, reply);
    if (f) return publicFile(f, req.user.id);
  });
  app.put("/api/files/:id", async (req, reply) => {
    const f = requireFile(req, reply, true);
    if (!f) return;
    const b = z
      .object({ content: z.unknown(), revision: z.number().int().positive() })
      .parse(req.body);
    const content = schemas[f.kind].parse(
      f.kind === "document" ? documentContent(store, f) : b.content,
    );
    if (f.kind === "document") content.html = cleanHtml(content.html);
    const result = store.save(
      f.id,
      req.user.id,
      content,
      b.revision,
      hash(req.cookies.session),
    );
    if (result.error)
      return reply.code(result.status).send({ error: result.error });
    return publicFile(result, req.user.id);
  });
  app.post("/api/files/:id/lease", async (req, reply) => {
    const f = requireFile(req, reply, true);
    if (!f) return;
    if (!store.acquireLease(f.id, hash(req.cookies.session)))
      return reply.code(423).send({
        error: "Another session is editing. Try again in 45 seconds.",
      });
    return { ok: true, expiresIn: 45 };
  });
  app.patch("/api/files/:id", async (req, reply) => {
    const f = requireFile(req, reply, true);
    if (!f) return;
    const b = z
      .object({ title: z.string().trim().min(1).max(200) })
      .parse(req.body);
    store.db
      .prepare("UPDATE files SET title=?,updated=? WHERE id=?")
      .run(b.title, new Date().toISOString(), f.id);
    store.audit(req.user.id, "file.renamed", f.id);
    return publicFile(store.file(f.id), req.user.id);
  });
  app.delete("/api/files/:id", async (req, reply) => {
    const f = requireFile(req, reply);
    if (!f) return;
    if (f.owner !== req.user.id)
      return reply.code(403).send({ error: "Owner required" });
    store.db.prepare("UPDATE files SET trashed=1 WHERE id=?").run(f.id);
    app.revokeConnections(f.id);
    store.audit(req.user.id, "file.trashed", f.id);
    return { ok: true };
  });
  app.get("/api/trash", (req) =>
    store.db
      .prepare("SELECT id,title,kind FROM files WHERE owner=? AND trashed=1")
      .all(req.user.id),
  );
  app.post("/api/files/:id/untrash", async (req, reply) => {
    const f = store.file(req.params.id);
    if (!f || f.owner !== req.user.id)
      return reply.code(404).send({ error: "File unavailable" });
    store.db.prepare("UPDATE files SET trashed=0 WHERE id=?").run(f.id);
    store.audit(req.user.id, "file.untrashed", f.id);
    return { ok: true };
  });
  app.get("/api/files/:id/permissions", async (req, reply) => {
    const f = requireFile(req, reply);
    if (!f) return;
    if (f.owner !== req.user.id)
      return reply.code(403).send({ error: "Owner required" });
    return store.db
      .prepare(
        "SELECT p.user_id,p.role,u.email FROM permissions p JOIN users u ON u.id=p.user_id WHERE file_id=?",
      )
      .all(f.id);
  });
  app.put("/api/files/:id/permissions", async (req, reply) => {
    const f = requireFile(req, reply);
    if (!f) return;
    if (f.owner !== req.user.id)
      return reply.code(403).send({ error: "Owner required" });
    const b = z
      .object({
        userId: z.string().uuid(),
        role: z.enum(["editor", "viewer", "commenter"]).nullable(),
      })
      .parse(req.body);
    if (!store.user(b.userId) || b.userId === f.owner)
      return reply.code(400).send({ error: "Select another member" });
    if (b.role)
      store.db
        .prepare(
          "INSERT INTO permissions VALUES(?,?,?) ON CONFLICT(file_id,user_id) DO UPDATE SET role=excluded.role",
        )
        .run(f.id, b.userId, b.role);
    else
      store.db
        .prepare("DELETE FROM permissions WHERE file_id=? AND user_id=?")
        .run(f.id, b.userId);
    app.revokeConnections();
    store.audit(req.user.id, "permission.changed", f.id);
    return { ok: true };
  });
  app.get("/api/files/:id/versions", async (req, reply) => {
    const f = requireFile(req, reply);
    if (f)
      return store.db
        .prepare(
          "SELECT id,revision,actor,created FROM versions WHERE file_id=? ORDER BY id DESC LIMIT 50",
        )
        .all(f.id);
  });
  app.post("/api/files/:id/restore/:version", async (req, reply) => {
    const f = requireFile(req, reply, true);
    if (!f) return;
    if (f.kind === "document")
      return reply.code(409).send({
        error:
          "Document restore is deferred until collaboration snapshots can be restored atomically.",
      });
    const v = store.db
      .prepare("SELECT content FROM versions WHERE id=? AND file_id=?")
      .get(req.params.version, f.id);
    if (!v) return reply.code(404).send({ error: "Version unavailable" });
    const b = z.object({ revision: z.number().int() }).parse(req.body);
    const result = store.save(
      f.id,
      req.user.id,
      JSON.parse(v.content),
      b.revision,
      hash(req.cookies.session),
    );
    if (result.error)
      return reply.code(result.status).send({ error: result.error });
    return publicFile(result, req.user.id);
  });
  app.get("/api/files/:id/export/:format", async (req, reply) => {
    const f = requireFile(req, reply);
    if (!f) return;
    try {
      const result = await exportFile(
        f.kind === "document"
          ? { ...f, content: documentContent(store, f) }
          : f,
        req.params.format,
      );
      store.audit(req.user.id, "file.exported", f.id);
      return reply
        .header(
          "Content-Disposition",
          `attachment; filename="commons-${f.id}.${result.extension}"`,
        )
        .type(result.type)
        .send(result.buffer);
    } catch (e) {
      return reply.code(400).send({ error: "Unsupported export" });
    }
  });
  app.post("/api/files/:id/collaboration", async (req, reply) => {
    const f = requireFile(req, reply);
    if (!f) return;
    if (f.kind !== "document")
      return reply.code(400).send({ error: "Documents only" });
    for (const [key, value] of tickets)
      if (value.expires < Date.now()) tickets.delete(key);
    const token = randomBytes(32).toString("hex");
    tickets.set(token, {
      fileId: f.id,
      session: req.cookies.session,
      expires: Date.now() + 60000,
    });
    return { token };
  });
  app.get("/api/audit", async (req, reply) => {
    if (!req.user.admin)
      return reply.code(403).send({ error: "Administrator required" });
    return store.db
      .prepare("SELECT * FROM audit ORDER BY id DESC LIMIT 200")
      .all();
  });
  return app;
}
