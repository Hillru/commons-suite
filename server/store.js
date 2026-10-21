import { DatabaseSync } from "node:sqlite";
import {
  randomUUID,
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

export const hash = (value) => createHash("sha256").update(value).digest("hex");
export function passwordHash(password) {
  const salt = randomBytes(16).toString("hex");
  return salt + ":" + scryptSync(password, salt, 64).toString("hex");
}
export function passwordMatches(password, stored) {
  const [salt, digest] = stored.split(":");
  return timingSafeEqual(
    scryptSync(password, salt, 64),
    Buffer.from(digest, "hex"),
  );
}
export function createStore(directory = "./data") {
  if (directory !== ":memory:") mkdirSync(directory, { recursive: true });
  const db = new DatabaseSync(
    directory === ":memory:" ? directory : join(directory, "commons.sqlite"),
  );
  db.exec(`
    PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,password TEXT NOT NULL,admin INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS files(id TEXT PRIMARY KEY,title TEXT NOT NULL,kind TEXT NOT NULL,owner TEXT REFERENCES users(id),parent TEXT,content TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1,trashed INTEGER NOT NULL DEFAULT 0,updated TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS permissions(file_id TEXT REFERENCES files(id),user_id TEXT REFERENCES users(id),role TEXT NOT NULL,PRIMARY KEY(file_id,user_id));
    CREATE TABLE IF NOT EXISTS versions(id INTEGER PRIMARY KEY AUTOINCREMENT,file_id TEXT REFERENCES files(id),revision INTEGER,content TEXT,actor TEXT,created TEXT);
    CREATE TABLE IF NOT EXISTS leases(file_id TEXT PRIMARY KEY,holder TEXT,expires INTEGER);
    CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY AUTOINCREMENT,actor TEXT,event TEXT,file_id TEXT,created TEXT);
    CREATE TABLE IF NOT EXISTS originals(file_id TEXT PRIMARY KEY, name TEXT, data BLOB);
    CREATE TABLE IF NOT EXISTS collaboration(file_id TEXT PRIMARY KEY,state BLOB);
    PRAGMA user_version=1;
  `);
  const audit = (actor, event, file) =>
    db
      .prepare("INSERT INTO audit(actor,event,file_id,created) VALUES(?,?,?,?)")
      .run(actor, event, file, new Date().toISOString());
  function user(id) {
    return db.prepare("SELECT id,email,admin FROM users WHERE id=?").get(id);
  }
  function createUser(email, password, admin = false) {
    const id = randomUUID();
    db.prepare("INSERT INTO users VALUES(?,?,?,?)").run(
      id,
      email.toLowerCase(),
      passwordHash(password),
      Number(admin),
    );
    return user(id);
  }
  function session(id) {
    const token = randomBytes(32).toString("hex");
    db.prepare("INSERT INTO sessions VALUES(?,?,?)").run(
      hash(token),
      id,
      Date.now() + 8 * 3600000,
    );
    return token;
  }
  function authenticate(token) {
    if (!token) return null;
    const row = db
      .prepare("SELECT user_id FROM sessions WHERE token=? AND expires>?")
      .get(hash(token), Date.now());
    return row ? user(row.user_id) : null;
  }
  function file(id) {
    const f = db.prepare("SELECT * FROM files WHERE id=?").get(id);
    return f ? { ...f, content: JSON.parse(f.content) } : null;
  }
  function role(id, uid) {
    const f = file(id);
    if (!f) return null;
    if (f.owner === uid) return "owner";
    // Folder membership is inherited; explicit file grants take precedence.
    const direct = db
      .prepare("SELECT role FROM permissions WHERE file_id=? AND user_id=?")
      .get(id, uid);
    return direct?.role ?? (f.parent ? role(f.parent, uid) : null);
  }
  function allowed(id, uid, write = false) {
    const f = file(id);
    return (
      !!f &&
      !f.trashed &&
      (!f.parent || allowed(f.parent, uid)) &&
      (write ? ["owner", "editor"].includes(role(id, uid)) : !!role(id, uid))
    );
  }
  function createFile(uid, title, kind, parent = null, content = null) {
    if (
      parent &&
      (!allowed(parent, uid, true) || file(parent).kind !== "folder")
    )
      throw new Error("Invalid parent");
    const id = randomUUID(),
      now = new Date().toISOString();
    const initial =
      content ??
      (kind === "document"
        ? { html: "<p></p>" }
        : kind === "sheet"
          ? { sheets: [{ name: "Sheet 1", cells: {} }] }
          : kind === "slides"
            ? {
                slides: [
                  {
                    title: "Your next big idea",
                    body: "Start a conversation.",
                    background: "#f7f4ed",
                  },
                ],
              }
            : {});
    db.prepare("INSERT INTO files VALUES(?,?,?,?,?,?,1,0,?)").run(
      id,
      title,
      kind,
      uid,
      parent,
      JSON.stringify(initial),
      now,
    );
    audit(uid, "file.created", id);
    return file(id);
  }
  function acquireLease(id, holder) {
    const current = db.prepare("SELECT * FROM leases WHERE file_id=?").get(id);
    if (current && current.expires > Date.now() && current.holder !== holder)
      return false;
    db.prepare(
      "INSERT INTO leases VALUES(?,?,?) ON CONFLICT(file_id) DO UPDATE SET holder=excluded.holder,expires=excluded.expires",
    ).run(id, holder, Date.now() + 45000);
    return true;
  }
  function save(id, uid, content, revision, holder) {
    const f = file(id);
    if (!allowed(id, uid, true)) return { error: "Forbidden", status: 403 };
    if (f.revision !== revision)
      return {
        error: "A newer version exists. Reload before saving.",
        status: 409,
      };
    if (f.kind !== "document" && f.kind !== "folder") {
      const lease = db
        .prepare(
          "SELECT * FROM leases WHERE file_id=? AND holder=? AND expires>?",
        )
        .get(id, holder, Date.now());
      if (!lease) return { error: "Editing lease required", status: 423 };
    }
    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare(
        "INSERT INTO versions(file_id,revision,content,actor,created) VALUES(?,?,?,?,?)",
      ).run(
        id,
        f.revision,
        JSON.stringify(f.content),
        uid,
        new Date().toISOString(),
      );
      db.prepare(
        "UPDATE files SET content=?,revision=revision+1,updated=? WHERE id=?",
      ).run(JSON.stringify(content), new Date().toISOString(), id);
      audit(uid, "file.saved", id);
      db.exec("COMMIT");
      return file(id);
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  }
  return {
    db,
    user,
    createUser,
    session,
    authenticate,
    file,
    role,
    allowed,
    createFile,
    acquireLease,
    save,
    audit,
  };
}
