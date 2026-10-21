import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, rmSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createStore } from "../server/store.js";
import {
  initialDocument,
  persistDocument,
  documentContent,
} from "../server/documents.js";
test("file data, permissions, sessions, revisions, and CRDT survive a database reopen", () => {
  const directory = ".tmp/durability-" + randomUUID();
  mkdirSync(directory, { recursive: true });
  let s = createStore(directory);
  try {
    const owner = s.createUser(
        "persist@example.com",
        "long persistence password",
      ),
      reader = s.createUser("reader@example.com", "long reader password");
    const f = s.createFile(owner.id, "Persistent document", "document", null, {
      html: "<h1>Remember this</h1><p>After restart</p>",
    });
    const doc = initialDocument(f.content.html);
    persistDocument(s, f.id, doc);
    doc.destroy();
    s.db
      .prepare("INSERT INTO permissions VALUES(?,?,?)")
      .run(f.id, reader.id, "viewer");
    const token = s.session(owner.id);
    s.save(f.id, owner.id, documentContent(s, f), 1, "unused");
    s.db.close();
    s = createStore(directory);
    assert.equal(s.authenticate(token).id, owner.id);
    assert.equal(s.allowed(f.id, reader.id), true);
    assert.equal(s.allowed(f.id, reader.id, true), false);
    assert.match(documentContent(s, s.file(f.id)).html, /Remember this/);
    assert.match(documentContent(s, s.file(f.id)).html, /After restart/);
    assert.equal(s.file(f.id).revision, 2);
    assert.equal(s.db.prepare("SELECT count(*) n FROM versions").get().n, 1);
  } finally {
    s.db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
