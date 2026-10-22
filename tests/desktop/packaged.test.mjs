import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  mkdtempSync,
  cpSync,
  rmSync,
  writeFileSync,
  readdirSync,
  statSync,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { once } from "node:events";
import { DatabaseSync } from "node:sqlite";
import { HocuspocusProvider } from "@hocuspocus/provider";
import WebSocket from "ws";
import { Doc, applyUpdate, encodeStateAsUpdate } from "yjs";
import { initialDocument } from "../../server/documents.js";
const source = resolve(".tmp/desktop-build", process.arch, "Commons Suite.app");
const token = "a".repeat(64);
const password = "synthetic-test-password-12345";
async function launch(bundle, dataDir, first) {
  const resources = join(bundle, "Contents/Resources");
  const child = spawn(
    join(resources, "runtime/bin/node"),
    [join(resources, "app/desktop/entry.mjs")],
    {
      cwd: join(resources, "app"),
      env: { PATH: "/usr/bin:/bin", HOME: tmpdir(), TMPDIR: tmpdir() },
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  let stderr = "";
  child.stderr.on("data", (chunk) => (stderr += chunk));
  const send = (object) => child.stdin.write(JSON.stringify(object) + "\n");
  send({ dataDir, token });
  let setup = false;
  const ready = new Promise((resolveReady, reject) => {
    child.once("exit", (code) =>
      reject(Error(`Backend exited ${code}: ${stderr}`)),
    );
    const lines = createInterface({ input: child.stdout });
    lines.on("line", (line) => {
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        return;
      }
      if (message.type === "setup") {
        setup = true;
        send({ email: "desktop@example.com", password });
      }
      if (message.type === "ready") resolveReady(message);
    });
  });
  try {
    const message = await Promise.race([
      ready,
      new Promise((_, reject) =>
        setTimeout(() => reject(Error("Startup timed out")), 20000).unref(),
      ),
    ]);
    assert.equal(setup, first, "first-run setup appears exactly once");
    assert.equal(message.apiAddress, "127.0.0.1");
    assert.equal(
      message.collabAddress,
      "127.0.0.1",
      "collaboration must bind loopback, never all interfaces",
    );
    assert.match(message.url, /^http:\/\/127\.0\.0\.1:\d+$/);
    assert.match(message.collabUrl, /^ws:\/\/127\.0\.0\.1:\d+$/);
    let session = "";
    const request = async (
      path,
      method = "GET",
      body,
      capability = true,
      origin = message.url,
    ) => {
      const result = await fetch(message.url + "/api" + path, {
        method,
        headers: {
          origin,
          cookie: `${capability ? `desktop=${token}; ` : ""}${session}`,
          "content-type": "application/json",
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      return result;
    };
    assert.equal(
      (await request("/health", "GET", undefined, false)).status,
      200,
    );
    assert.equal(
      (
        await request(
          "/login",
          "POST",
          { email: "desktop@example.com", password },
          false,
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await request(
          "/login",
          "POST",
          { email: "desktop@example.com", password },
          true,
          "https://evil.example",
        )
      ).status,
      403,
    );
    const login = await request("/login", "POST", {
      email: "desktop@example.com",
      password,
    });
    assert.equal(login.status, 200);
    session = login.headers.get("set-cookie").split(";")[0];
    assert.equal((await request("/me")).status, 200);
    const headers = (await request("/health")).headers;
    assert.equal(
      headers
        .get("content-security-policy")
        .includes("upgrade-insecure-requests"),
      false,
    );
    assert.equal(headers.has("strict-transport-security"), false);
    return {
      child,
      request,
      url: message.url,
      collabUrl: message.collabUrl,
      stderr: () => stderr,
    };
  } catch (error) {
    child.kill("SIGTERM");
    throw error;
  }
}
async function stop(child) {
  const exit = once(child, "exit");
  child.kill("SIGTERM");
  await exit;
}
test(
  "relocated, self-contained Mac backend: setup, isolation, edit, export/import, reopen, update backup",
  { timeout: 90000 },
  async () => {
    const temp = mkdtempSync(join(tmpdir(), "commons-desktop-test-"));
    let running;
    try {
      // Spaces and a different path deliberately catch development-machine dependencies.
      const bundle = join(temp, "Relocated App", "Commons Suite.app");
      cpSync(source, bundle, { recursive: true });
      const data = join(temp, "Private Workspace");
      running = await launch(bundle, data, true);
      const ids = [];
      for (const [kind, content, format] of [
        ["document", { html: "<p>Desktop persistence proof</p>" }, "docx"],
        [
          "sheet",
          {
            sheets: [
              {
                name: "Budget",
                cells: { A1: "12", A2: "13", B1: "=SUM(A1:A2)" },
              },
            ],
          },
          "xlsx",
        ],
        [
          "slides",
          {
            slides: [
              {
                title: "Desktop presentation",
                body: "Saved locally",
                background: "#ffffff",
              },
            ],
          },
          "pptx",
        ],
      ]) {
        const created = await running.request("/files", "POST", {
          title: "Desktop " + kind,
          kind,
        });
        assert.equal(created.status, 201);
        const file = await created.json();
        ids.push(file.id);
        if (kind === "document") {
          const ticket = await (
            await running.request(`/files/${file.id}/collaboration`, "POST", {})
          ).json();
          const document = new Doc();
          const provider = new HocuspocusProvider({
            url: running.collabUrl,
            name: file.id,
            document,
            token: ticket.token,
            WebSocketPolyfill: WebSocket,
          });
          try {
            await new Promise((resolveSync, reject) => {
              const timer = setTimeout(
                () => reject(Error("Document sync timed out")),
                10000,
              );
              provider.on("synced", ({ state }) => {
                if (state) {
                  clearTimeout(timer);
                  resolveSync();
                }
              });
            });
            const fragment = document.getXmlFragment("default");
            fragment.delete(0, fragment.length);
            const seeded = initialDocument(content.html);
            applyUpdate(document, encodeStateAsUpdate(seeded));
            seeded.destroy();
            let persisted = false;
            for (let attempt = 0; attempt < 100; attempt++) {
              const html = await (
                await running.request(`/files/${file.id}/export/html`)
              ).text();
              if (html.includes("Desktop persistence proof")) {
                persisted = true;
                break;
              }
              await new Promise((resolveDelay) => setTimeout(resolveDelay, 50));
            }
            assert.equal(
              persisted,
              true,
              "live document edits persist in the packaged service",
            );
          } finally {
            provider.destroy();
            document.destroy();
          }
        }
        if (kind !== "document")
          assert.equal(
            (await running.request(`/files/${file.id}/lease`, "POST", {}))
              .status,
            200,
          );
        const saved = await running.request(`/files/${file.id}`, "PUT", {
          content,
          revision: file.revision,
        });
        assert.equal(saved.status, 200);
        const exported = await running.request(
          `/files/${file.id}/export/${format}`,
        );
        assert.equal(exported.status, 200);
        const bytes = Buffer.from(await exported.arrayBuffer());
        assert.equal(bytes.subarray(0, 2).toString(), "PK");
        assert.match(
          exported.headers.get("content-disposition"),
          new RegExp(`\\.${format}`),
        );
        if (kind !== "slides") {
          const imported = await running.request("/import", "POST", {
            name: `Roundtrip.${format}`,
            data: bytes.toString("base64"),
          });
          assert.equal(imported.status, 201);
          const roundtrip = await imported.json();
          if (kind === "document")
            assert.match(
              roundtrip.file.content.html,
              /Desktop persistence proof/,
            );
          else
            assert.equal(
              roundtrip.file.content.sheets[0].cells.B1,
              "=SUM(A1:A2)",
            );
        }
      }
      assert.equal(statSync(data).mode & 0o777, 0o700);
      await stop(running.child);
      running = null;
      // Simulate an older installed version; next launch must make a consistent backup.
      writeFileSync(join(data, "desktop-version"), "0.0.0-test");
      running = await launch(bundle, data, false);
      for (const id of ids) {
        const response = await running.request(`/files/${id}`);
        assert.equal(response.status, 200);
        assert.equal((await response.json()).revision, 2);
      }
      const backups = readdirSync(join(data, "backups"));
      assert.equal(backups.length, 1);
      const backup = new DatabaseSync(join(data, "backups", backups[0]), {
        readOnly: true,
      });
      assert.equal(
        backup.prepare("PRAGMA integrity_check").get().integrity_check,
        "ok",
      );
      assert.equal(backup.prepare("SELECT count(*) n FROM files").get().n, 5);
      backup.close();
      const db = new DatabaseSync(join(data, "commons.sqlite"), {
        readOnly: true,
      });
      assert.equal(
        db
          .prepare("SELECT password FROM users")
          .get()
          .password.includes(password),
        false,
      );
      db.close();
      await stop(running.child);
      running = null;
      console.log(
        "Verified bundled Node, fresh account, local capability, CSRF, DOCX/XLSX/PPTX export, DOCX/XLSX import, restart persistence, and pre-update SQLite backup.",
      );
    } finally {
      if (running) await stop(running.child);
      rmSync(temp, { recursive: true, force: true });
    }
  },
);
