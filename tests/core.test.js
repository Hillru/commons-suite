import test from "node:test";
import assert from "node:assert/strict";
import { createStore, passwordHash, passwordMatches } from "../server/store.js";
import { calculate } from "../server/formulas.js";
import { exportFile, importFile, cleanHtml } from "../server/formats.js";
import { inspectZip } from "../server/import-worker.js";
import { isolatedImport } from "../server/import.js";
import { buildApp } from "../server/app.js";

test("password hashes are salted and verify correctly", () => {
  const a = passwordHash("long enough password"),
    b = passwordHash("long enough password");
  assert.notEqual(a, b);
  assert.equal(passwordMatches("long enough password", a), true);
  assert.equal(passwordMatches("wrong", a), false);
});
test("formula precedence, references, ranges, errors, and injection resistance", () => {
  const cells = {
    A1: "2",
    A2: "3",
    B1: "=A1+A2*4",
    B2: "=SUM(A1:A2)",
    C1: "=C2",
    C2: "=C1",
    D1: "=1/0",
    E1: "=process.exit()",
    F1: "=-(2+3)*4",
    G1: "=SUM(A1:A999999)",
  };
  assert.equal(calculate(cells, "B1"), 14);
  assert.equal(calculate(cells, "B2"), 5);
  assert.equal(calculate(cells, "C1"), "#CYCLE!");
  assert.equal(calculate(cells, "D1"), "#DIV/0!");
  assert.equal(calculate(cells, "E1"), "#UNSUPPORTED!");
  assert.equal(calculate(cells, "F1"), -20);
  assert.equal(calculate(cells, "G1"), "#RANGE!");
  assert.equal(calculate({ A1: "=1E3+2" }, "A1"), 1002);
  const dependencies = { A80: "1" };
  for (let i = 79; i >= 1; i--)
    dependencies["A" + i] = "=A" + (i + 1) + "+A" + (i + 1);
  assert.equal(calculate(dependencies, "A1"), 2 ** 79);
  assert.equal(
    calculate({ A1: "=SUM(A2:A100)" }, "A1", new Set(), {
      remaining: 10,
      memo: new Map(),
    }),
    "#LIMIT!",
  );
});
test("folder inheritance, editing leases, conflicts, and snapshots", () => {
  const s = createStore(":memory:");
  try {
    const a = s.createUser("a@example.com", "long enough password"),
      b = s.createUser("b@example.com", "long enough password"),
      c = s.createUser("c@example.com", "long enough password");
    const folder = s.createFile(a.id, "Team", "folder"),
      sheet = s.createFile(a.id, "Budget", "sheet", folder.id);
    assert.equal(s.allowed(sheet.id, b.id), false);
    s.db
      .prepare("INSERT INTO permissions VALUES(?,?,?)")
      .run(folder.id, b.id, "editor");
    assert.equal(s.allowed(sheet.id, b.id, true), true);
    assert.equal(s.allowed(sheet.id, c.id), false);
    assert.equal(s.acquireLease(sheet.id, "session-a"), true);
    assert.equal(s.acquireLease(sheet.id, "session-b"), false);
    assert.equal(
      s.save(sheet.id, b.id, sheet.content, 1, "session-b").status,
      423,
    );
    const next = s.save(
      sheet.id,
      b.id,
      { sheets: [{ name: "Sheet 1", cells: { A1: "100" } }] },
      1,
      "session-a",
    );
    assert.equal(next.revision, 2);
    assert.equal(
      s.save(sheet.id, a.id, sheet.content, 1, "session-a").status,
      409,
    );
    assert.equal(s.db.prepare("SELECT count(*) n FROM versions").get().n, 1);
    s.db.prepare("DELETE FROM permissions WHERE file_id=?").run(folder.id);
    assert.equal(s.allowed(sheet.id, b.id), false);
  } finally {
    s.db.close();
  }
});
test("DOCX and XLSX conversion, PPTX generation, and sanitization", async () => {
  assert.equal(
    cleanHtml(
      '<p>Hello<script>alert(1)</script><a href="javascript:alert(1)">link</a></p>',
    ),
    "<p>Hello<a>link</a></p>",
  );
  const doc = await exportFile(
    { kind: "document", content: { html: "<h1>Hello</h1><p>Shared work</p>" } },
    "docx",
  );
  assert.ok(doc.buffer.length > 100);
  inspectZip(doc.buffer);
  const imported = await importFile("sample.docx", doc.buffer);
  assert.match(imported.content.html, /Shared work/);
  const sheet = await exportFile(
    {
      kind: "sheet",
      content: {
        sheets: [
          { name: "Budget", cells: { A1: "12", A2: "13", B1: "=SUM(A1:A2)" } },
        ],
      },
    },
    "xlsx",
  );
  const back = await isolatedImport(
    "sample.xlsx",
    sheet.buffer.toString("base64"),
  );
  assert.equal(back.content.sheets[0].cells.B1, "=SUM(A1:A2)");
  const slide = await exportFile(
    {
      kind: "slides",
      content: {
        slides: [{ title: "Hello", body: "World", background: "#ffffff" }],
      },
    },
    "pptx",
  );
  assert.ok(slide.buffer.length > 100);
  inspectZip(slide.buffer);
  await assert.rejects(
    isolatedImport("bad.xlsx", Buffer.from("not a zip").toString("base64")),
  );
});
test("API enforces session, origin, ownership, roles, export, revocation, and leases", async () => {
  const s = createStore(":memory:");
  const owner = s.createUser("owner@example.com", "a long test password", true),
    viewer = s.createUser("viewer@example.com", "a long test password");
  const app = await buildApp(s);
  await app.ready();
  const request = (url, method = "GET", payload, token) =>
    app.inject({
      url: "/api" + url,
      method,
      payload,
      headers: {
        origin: "http://localhost:3000",
        ...(token ? { cookie: "session=" + token } : {}),
      },
    });
  try {
    assert.equal((await request("/files")).statusCode, 401);
    assert.equal(
      (
        await app.inject({
          url: "/api/login",
          method: "POST",
          payload: { email: owner.email, password: "a long test password" },
          headers: { origin: "https://evil.example" },
        })
      ).statusCode,
      403,
    );
    const login = await request("/login", "POST", {
      email: owner.email,
      password: "a long test password",
    });
    assert.equal(login.statusCode, 200);
    assert.match(login.headers["set-cookie"], /HttpOnly/);
    const token = login.cookies[0].value,
      readToken = s.session(viewer.id);
    const created = await request(
      "/files",
      "POST",
      { title: "Budget", kind: "sheet" },
      token,
    );
    assert.equal(created.statusCode, 201);
    const file = created.json();
    assert.equal(
      (await request("/files/" + file.id, "GET", undefined, readToken))
        .statusCode,
      404,
    );
    assert.equal(
      (
        await request(
          "/files/" + file.id + "/permissions",
          "PUT",
          { userId: viewer.id, role: "viewer" },
          token,
        )
      ).statusCode,
      200,
    );
    assert.equal(
      (await request("/files/" + file.id, "GET", undefined, readToken))
        .statusCode,
      200,
    );
    assert.equal(
      (
        await request(
          "/files/" + file.id,
          "PUT",
          { content: file.content, revision: 1 },
          readToken,
        )
      ).statusCode,
      404,
    );
    assert.equal(
      (
        await request(
          "/files/" + file.id + "/export/xlsx",
          "GET",
          undefined,
          readToken,
        )
      ).statusCode,
      200,
    );
    assert.equal(
      (
        await request(
          "/files/" + file.id,
          "PUT",
          { content: file.content, revision: 1 },
          token,
        )
      ).statusCode,
      423,
    );
    await request("/files/" + file.id + "/lease", "POST", {}, token);
    assert.equal(
      (
        await request(
          "/files/" + file.id,
          "PUT",
          { content: file.content, revision: 1 },
          token,
        )
      ).statusCode,
      200,
    );
    assert.equal(
      (
        await request(
          "/files/" + file.id,
          "PUT",
          { content: file.content, revision: 1 },
          token,
        )
      ).statusCode,
      409,
    );
    assert.equal(
      (
        await request(
          "/files/" + file.id + "/versions",
          "GET",
          undefined,
          readToken,
        )
      ).json().length,
      1,
    );
    await request(
      "/files/" + file.id + "/permissions",
      "PUT",
      { userId: viewer.id, role: null },
      token,
    );
    assert.equal(
      (
        await request(
          "/files/" + file.id + "/export/xlsx",
          "GET",
          undefined,
          readToken,
        )
      ).statusCode,
      404,
    );
    await request("/logout", "POST", {}, token);
    assert.equal(
      (await request("/files", "GET", undefined, token)).statusCode,
      401,
    );
  } finally {
    await app.close();
    s.db.close();
  }
});

test("local HTTP works in WebKit while HTTPS keeps upgrade and HSTS policies", async () => {
  for (const secure of [false, true]) {
    const store = createStore(":memory:");
    const app = await buildApp(store, {
      secure,
      origin: secure ? "https://office.example.com" : "http://localhost:3000",
    });
    try {
      const response = await app.inject({ url: "/api/health" });
      assert.equal(response.statusCode, 200);
      assert.equal(
        response.headers["content-security-policy"].includes(
          "upgrade-insecure-requests",
        ),
        secure,
      );
      assert.equal(
        Boolean(response.headers["strict-transport-security"]),
        secure,
      );
    } finally {
      await app.close();
      store.db.close();
    }
  }
});
