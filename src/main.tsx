import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Collaboration from "@tiptap/extension-collaboration";
import { HocuspocusProvider } from "@hocuspocus/provider";
import * as Y from "yjs";
import { calculate, columnName } from "../server/formulas.js";
import "./style.css";

type Member = { id: string; email: string; admin?: number };
type Sheet = { name: string; cells: Record<string, string> };
type Slide = { title: string; body: string; background: string };
type FileRecord = {
  id: string;
  title: string;
  kind: "document" | "sheet" | "slides" | "folder";
  parent: string | null;
  revision: number;
  role: string;
  updated: string;
  content: any;
};
async function api(path: string, method = "GET", body?: unknown) {
  const res = await fetch("/api" + path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Request failed");
  return data;
}
const icons = { document: "D", sheet: "S", slides: "P", folder: "↳" };
const labels = {
  document: "Document",
  sheet: "Spreadsheet",
  slides: "Presentation",
  folder: "Folder",
};
function App() {
  const [user, setUser] = useState<Member | null>(null),
    [loading, setLoading] = useState(true),
    [files, setFiles] = useState<FileRecord[]>([]),
    [active, setActive] = useState<FileRecord | null>(null);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [folder, setFolder] = useState<string | null>(null),
    [dialog, setDialog] = useState("");
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false);
  const [members, setMembers] = useState<Member[]>([]),
    [grants, setGrants] = useState<any[]>([]),
    [versions, setVersions] = useState<any[]>([]),
    [trash, setTrash] = useState<any[]>([]);
  const [newTitle, setNewTitle] = useState(""),
    [newKind, setNewKind] = useState<FileRecord["kind"]>("document"),
    [memberEmail, setMemberEmail] = useState(""),
    [memberPassword, setMemberPassword] = useState("");
  const [unsaved, setUnsaved] = useState(false);
  const [editorEpoch, setEditorEpoch] = useState(0);
  const upload = useRef<HTMLInputElement>(null);
  const allowLeave = () =>
    !unsaved ||
    window.confirm("You have unsaved changes. Leave without saving?");
  const act = async (fn: () => Promise<void>) => {
    setError("");
    try {
      await fn();
    } catch (e: any) {
      setError(e.message);
    }
  };
  const refresh = async () => setFiles(await api("/files"));
  useEffect(() => {
    api("/me")
      .then((u) => {
        setUser(u);
        return refresh();
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  async function open(file: FileRecord) {
    setActive(await api("/files/" + file.id));
  }
  async function showShare() {
    if (!active) return;
    setMembers(await api("/users"));
    setGrants(await api("/files/" + active.id + "/permissions"));
    setDialog("share");
  }
  async function showHistory() {
    if (!active) return;
    setVersions(await api("/files/" + active.id + "/versions"));
    setDialog("history");
  }
  async function create() {
    const f = await api("/files", "POST", {
      title: newTitle,
      kind: newKind,
      parent: folder,
    });
    setDialog("");
    setNewTitle("");
    await refresh();
    if (f.kind === "folder") setFolder(f.id);
    else setActive(f);
  }
  if (loading) return <div className="loading">Opening your workspace…</div>;
  if (!user)
    return (
      <main className="login">
        <div className="login-story">
          <span className="brand">
            <b className="brandmark">c</b> commons
          </span>
          <h1>
            Good work.
            <br />
            Shared freely.
          </h1>
          <p>
            Your documents, numbers, and ideas.
            <br />
            One open workspace, on your own terms.
          </p>
          <span className="alpha">OPEN SOURCE · EARLY ALPHA</span>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setBusy(true);
            act(async () => {
              setUser(await api("/login", "POST", { email, password }));
              setPassword("");
              await refresh();
            }).finally(() => setBusy(false));
          }}
        >
          <span className="eyebrow">YOUR WORKSPACE</span>
          <h2>Welcome back.</h2>
          <p>Sign in with the account your administrator created.</p>
          <label>
            Email
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <button className="primary" disabled={busy}>
            {busy ? "Signing in…" : "Enter workspace →"}
          </button>
          <small>Self-hosted. No advertising. No required cloud account.</small>
        </form>
      </main>
    );
  const visible = files.filter(
    (f) =>
      (query
        ? f.title.toLowerCase().includes(query.toLowerCase())
        : f.parent === folder) &&
      (filter === "all" || f.kind === filter),
  );
  return (
    <div className="shell">
      <aside
        onClickCapture={(e) => {
          const button = (e.target as HTMLElement).closest("button");
          if (
            button &&
            (button.classList.contains("brand") ||
              button.classList.contains("account") ||
              (button.closest("nav") &&
                !button.textContent?.includes("Trash"))) &&
            !allowLeave()
          ) {
            e.stopPropagation();
            e.preventDefault();
          }
        }}
      >
        <button
          className="brand"
          onClick={() => {
            setActive(null);
            setFolder(null);
          }}
        >
          <b className="brandmark">c</b> commons
        </button>
        <div className="workspace-label">YOUR WORKSPACE</div>
        <nav>
          {[
            ["all", "◫", "All files"],
            ["document", "D", "Documents"],
            ["sheet", "S", "Spreadsheets"],
            ["slides", "P", "Presentations"],
          ].map(([id, icon, label]) => (
            <button
              key={id}
              className={filter === id && !active ? "selected" : ""}
              onClick={() => {
                setFilter(id);
                setActive(null);
                setFolder(null);
              }}
            >
              <span>{icon}</span>
              {label}
            </button>
          ))}
          <button
            onClick={() =>
              act(async () => {
                setTrash(await api("/trash"));
                setDialog("trash");
              })
            }
          >
            <span>♲</span>Trash
          </button>
        </nav>
        <div className="aside-bottom">
          <span className="alpha">EARLY ALPHA · 0.1</span>
          <p>
            Built for the work
            <br />
            you do together.
          </p>
          {user.admin === 1 && (
            <button onClick={() => setDialog("member")}>＋ Add member</button>
          )}
          <button onClick={() => setDialog("password")}>Change password</button>
          <button
            className="account"
            onClick={() =>
              act(async () => {
                await api("/logout", "POST", {});
                setUser(null);
                setActive(null);
              })
            }
          >
            <b>{user.email[0].toUpperCase()}</b>
            <span>
              {user.email}
              <small>Sign out</small>
            </span>
          </button>
        </div>
      </aside>
      <main className="main">
        <header>
          <span>
            {active ? labels[active.kind] : "Workspace"}{" "}
            <span className="header-muted">
              /{" "}
              {active
                ? active.title
                : folder
                  ? files.find((f) => f.id === folder)?.title
                  : "All files"}
            </span>
          </span>
          <span className="private">
            <i /> Self-hosted workspace
          </span>
        </header>
        {error && (
          <div role="alert" className="banner error">
            {error}
            <button onClick={() => setError("")}>Dismiss</button>
          </div>
        )}
        {notice && (
          <div role="status" className="banner">
            {notice}
            <button onClick={() => setNotice("")}>Dismiss</button>
          </div>
        )}
        {active ? (
          <section className="editor-area">
            <div className="editor-heading">
              <div>
                <button
                  className="back"
                  onClick={() => {
                    if (allowLeave())
                      act(async () => {
                        setActive(null);
                        await refresh();
                      });
                  }}
                >
                  ← Back to files
                </button>
                <h1>{active.title}</h1>
                <span className="muted">
                  {labels[active.kind]} · {active.role} · revision{" "}
                  {active.revision}
                </span>
              </div>
              <div className="actions">
                <button onClick={() => act(showHistory)}>History</button>
                {active.role === "owner" && (
                  <button onClick={() => act(showShare)}>Share</button>
                )}
                <select
                  aria-label="Export format"
                  defaultValue=""
                  onChange={(e) => {
                    const format = e.target.value;
                    if (format) {
                      if (unsaved)
                        setError("Save your changes before exporting.");
                      else
                        window.location.href =
                          "/api/files/" + active.id + "/export/" + format;
                    }
                    e.target.value = "";
                  }}
                >
                  <option value="">Export ↓</option>
                  <option value="json">Native JSON</option>
                  {active.kind === "document" ? (
                    <>
                      <option value="html">HTML</option>
                      <option value="docx">DOCX (plain text)</option>
                    </>
                  ) : active.kind === "sheet" ? (
                    <>
                      <option value="xlsx">XLSX</option>
                      <option value="csv">CSV (first sheet)</option>
                    </>
                  ) : (
                    <option value="pptx">PPTX</option>
                  )}
                </select>
                {active.role === "owner" && (
                  <button onClick={() => setDialog("rename")}>Rename</button>
                )}
                {active.role === "owner" && (
                  <button
                    className="danger"
                    onClick={() => setDialog("delete")}
                  >
                    Trash
                  </button>
                )}
              </div>
            </div>
            {active.kind === "document" ? (
              <DocumentEditor
                key={active.id}
                file={active}
                onSaved={setActive}
                onError={setError}
              />
            ) : (
              <StructuredEditor
                key={active.id + ":" + editorEpoch}
                file={active}
                onSaved={setActive}
                onError={setError}
                onDirty={setUnsaved}
              />
            )}
          </section>
        ) : (
          <section className="library">
            <div className="library-heading">
              <div>
                <span className="eyebrow">A LITTLE SPACE FOR BIG IDEAS</span>
                <h1>Make room for good work.</h1>
                <p>Start something new. Pick up where you left off.</p>
              </div>
              <button
                className="primary"
                onClick={() => {
                  setNewKind("document");
                  setNewTitle("");
                  setDialog("create");
                }}
              >
                ＋ Create new
              </button>
            </div>
            <div className="quick-create">
              {(["document", "sheet", "slides", "folder"] as const).map(
                (kind) => (
                  <button
                    key={kind}
                    onClick={() => {
                      setNewKind(kind);
                      setNewTitle("");
                      setDialog("create");
                    }}
                  >
                    <span className={"file-icon " + kind}>{icons[kind]}</span>
                    <strong>{labels[kind]}</strong>
                    <small>
                      {kind === "document"
                        ? "Put ideas into words"
                        : kind === "sheet"
                          ? "Find the story in numbers"
                          : kind === "slides"
                            ? "Give your ideas a stage"
                            : "Keep everything together"}
                    </small>
                    <span className="quick-arrow">↗</span>
                  </button>
                ),
              )}
            </div>
            <div className="file-heading">
              <div>
                <h2>
                  {folder
                    ? files.find((f) => f.id === folder)?.title
                    : "Your files"}{" "}
                  <span>{visible.length}</span>
                </h2>
                {folder && (
                  <button
                    onClick={() =>
                      setFolder(
                        files.find((f) => f.id === folder)?.parent ?? null,
                      )
                    }
                  >
                    ← Parent folder
                  </button>
                )}
              </div>
              <div className="actions">
                <input
                  aria-label="Search files"
                  placeholder="Search your files…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <button onClick={() => upload.current?.click()}>Import</button>
                <input
                  ref={upload}
                  hidden
                  type="file"
                  accept=".docx,.xlsx"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    if (f.size > 5 * 1024 * 1024) {
                      setError("Import limit is 5 MB");
                      return;
                    }
                    const reader = new FileReader();
                    reader.onload = () =>
                      act(async () => {
                        setNotice("Importing…");
                        const result = await api("/import", "POST", {
                          name: f.name,
                          data: String(reader.result).split(",")[1],
                          parent: folder,
                        });
                        await refresh();
                        setNotice(result.warnings.join(" "));
                        setActive(result.file);
                      });
                    reader.readAsDataURL(f);
                    e.target.value = "";
                  }}
                />
              </div>
            </div>
            <div className="file-list">
              <div className="file-row table-head">
                <span>Name</span>
                <span>Type</span>
                <span>Last updated</span>
                <span>Access</span>
              </div>
              {visible.map((f) => (
                <button
                  className="file-row"
                  key={f.id}
                  onClick={() =>
                    act(async () => {
                      if (f.kind === "folder") setFolder(f.id);
                      else await open(f);
                    })
                  }
                >
                  <span>
                    <b className={"file-icon small " + f.kind}>
                      {icons[f.kind]}
                    </b>
                    <strong>{f.title}</strong>
                  </span>
                  <span>{labels[f.kind]}</span>
                  <span>
                    {new Date(f.updated).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                  <span className="role">{f.role}</span>
                </button>
              ))}
              {!visible.length && (
                <div className="empty">
                  <span>✧</span>
                  <h3>Your next idea starts here.</h3>
                  <p>
                    Create a document, spreadsheet, presentation, or folder.
                  </p>
                </div>
              )}
            </div>
            <p className="library-foot">
              Your workspace. Your files. Your infrastructure.
            </p>
          </section>
        )}
      </main>
      {dialog && (
        <div className="modal-backdrop">
          <section
            role="dialog"
            aria-modal="true"
            aria-label={dialog}
            className="modal"
          >
            <button
              className="close"
              aria-label="Close dialog"
              onClick={() => setDialog("")}
            >
              ×
            </button>
            {dialog === "create" && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  act(create);
                }}
              >
                <h2>Create {labels[newKind].toLowerCase()}</h2>
                <label>
                  Name
                  <input
                    autoFocus
                    required
                    maxLength={200}
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                  />
                </label>
                <button className="primary">Create</button>
              </form>
            )}
            {dialog === "rename" && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  act(async () => {
                    if (!active) return;
                    const form = new FormData(e.currentTarget);
                    setActive(
                      await api("/files/" + active.id, "PATCH", {
                        title: form.get("title"),
                      }),
                    );
                    setDialog("");
                    await refresh();
                  });
                }}
              >
                <h2>Rename file</h2>
                <label>
                  Name
                  <input name="title" required defaultValue={active?.title} />
                </label>
                <button className="primary">Save name</button>
              </form>
            )}
            {dialog === "delete" && (
              <>
                <h2>Move to trash?</h2>
                <p>You can restore this file from the trash.</p>
                <button
                  className="primary"
                  onClick={() =>
                    act(async () => {
                      await api("/files/" + active?.id, "DELETE");
                      setActive(null);
                      setDialog("");
                      await refresh();
                    })
                  }
                >
                  Move to trash
                </button>
              </>
            )}
            {dialog === "password" && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const data = new FormData(e.currentTarget);
                  act(async () => {
                    await api("/password", "POST", {
                      currentPassword: data.get("current"),
                      newPassword: data.get("next"),
                    });
                    setDialog("");
                    setUser(null);
                    setActive(null);
                    setNotice("Password changed. Sign in again.");
                  });
                }}
              >
                <h2>Change your password</h2>
                <label>
                  Current password
                  <input
                    name="current"
                    type="password"
                    required
                    autoComplete="current-password"
                  />
                </label>
                <label>
                  New password
                  <input
                    name="next"
                    type="password"
                    required
                    minLength={12}
                    autoComplete="new-password"
                  />
                </label>
                <button className="primary">Change password</button>
              </form>
            )}
            {dialog === "member" && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  act(async () => {
                    await api("/users", "POST", {
                      email: memberEmail,
                      password: memberPassword,
                    });
                    setMemberPassword("");
                    setMemberEmail("");
                    setDialog("");
                    setNotice(
                      "Member created. Share their temporary password through a secure channel.",
                    );
                  });
                }}
              >
                <h2>Add workspace member</h2>
                <p>Accounts are created by administrators in this alpha.</p>
                <label>
                  Email
                  <input
                    type="email"
                    required
                    value={memberEmail}
                    onChange={(e) => setMemberEmail(e.target.value)}
                  />
                </label>
                <label>
                  Initial password
                  <input
                    type="password"
                    required
                    minLength={12}
                    value={memberPassword}
                    onChange={(e) => setMemberPassword(e.target.value)}
                  />
                </label>
                <button className="primary">Create member</button>
              </form>
            )}
            {dialog === "share" && (
              <>
                <h2>Share “{active?.title}”</h2>
                <p>
                  Access is limited to workspace members. Folder permissions are
                  inherited.
                </p>
                {members
                  .filter((m) => m.id !== user.id)
                  .map((m) => (
                    <div className="share-row" key={m.id}>
                      <span>{m.email}</span>
                      <select
                        aria-label={"Access for " + m.email}
                        value={
                          grants.find((g) => g.user_id === m.id)?.role ?? ""
                        }
                        onChange={(e) =>
                          act(async () => {
                            await api(
                              "/files/" + active?.id + "/permissions",
                              "PUT",
                              { userId: m.id, role: e.target.value || null },
                            );
                            setGrants(
                              await api(
                                "/files/" + active?.id + "/permissions",
                              ),
                            );
                          })
                        }
                      >
                        <option value="">No direct access</option>
                        <option value="viewer">Viewer</option>
                        <option value="editor">Editor</option>
                      </select>
                    </div>
                  ))}
                {members.length < 2 && (
                  <p>Add a member from the sidebar first.</p>
                )}
              </>
            )}
            {dialog === "history" && (
              <>
                <h2>Version history</h2>
                <p>
                  {active?.kind === "document"
                    ? "Document snapshots are listed; atomic restore is planned."
                    : "Restoring requires an active editing lease and replaces current content."}
                </p>
                {versions.map((v) => (
                  <div className="share-row" key={v.id}>
                    <span>
                      Revision {v.revision}
                      <small>{new Date(v.created).toLocaleString()}</small>
                    </span>
                    {active?.kind !== "document" &&
                      ["owner", "editor"].includes(active?.role ?? "") && (
                        <button
                          onClick={() =>
                            act(async () => {
                              if (!active) return;
                              await api(
                                "/files/" + active.id + "/lease",
                                "POST",
                                {},
                              );
                              setActive(
                                await api(
                                  "/files/" + active.id + "/restore/" + v.id,
                                  "POST",
                                  { revision: active.revision },
                                ),
                              );
                              setEditorEpoch((n) => n + 1);
                              setDialog("");
                              setNotice("Version restored.");
                            })
                          }
                        >
                          Restore
                        </button>
                      )}
                  </div>
                ))}
                {!versions.length && <p>No saved revisions yet.</p>}
              </>
            )}
            {dialog === "trash" && (
              <>
                <h2>Trash</h2>
                {trash.map((f) => (
                  <div className="share-row" key={f.id}>
                    <span>{f.title}</span>
                    <button
                      onClick={() =>
                        act(async () => {
                          await api("/files/" + f.id + "/untrash", "POST", {});
                          setTrash(await api("/trash"));
                          await refresh();
                        })
                      }
                    >
                      Restore
                    </button>
                  </div>
                ))}
                {!trash.length && <p>Your trash is empty.</p>}
              </>
            )}
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function DocumentEditor({
  file,
  onSaved,
  onError,
}: {
  file: FileRecord;
  onSaved: (f: FileRecord) => void;
  onError: (s: string) => void;
}) {
  const [provider, setProvider] = useState<HocuspocusProvider | null>(null),
    [status, setStatus] = useState("Connecting…");
  useEffect(() => {
    let disposed = false,
      p: HocuspocusProvider | undefined;
    const doc = new Y.Doc();
    Promise.all([
      api("/config"),
      api("/files/" + file.id + "/collaboration", "POST", {}),
    ])
      .then(([config, ticket]) => {
        if (disposed) return;
        p = new HocuspocusProvider({
          url: config.collabUrl,
          name: file.id,
          document: doc,
          token: ticket.token,
          onStatus: ({ status }) =>
            setStatus(
              status === "connected" ? "Live connection" : "Reconnecting…",
            ),
          onAuthenticationFailed: () => {
            setStatus("Access expired. Reopen this document.");
            onError("Collaboration authentication failed. Reopen the file.");
          },
        });
        setProvider(p);
      })
      .catch((e) => onError(e.message));
    return () => {
      disposed = true;
      p?.destroy();
      doc.destroy();
    };
  }, [file.id]);
  return provider ? (
    <LiveDocument
      file={file}
      provider={provider}
      status={status}
      onSaved={onSaved}
      onError={onError}
    />
  ) : (
    <div className="paper">Connecting to the document…</div>
  );
}
function LiveDocument({
  file,
  provider,
  status,
  onSaved,
  onError,
}: {
  file: FileRecord;
  provider: HocuspocusProvider;
  status: string;
  onSaved: (f: FileRecord) => void;
  onError: (s: string) => void;
}) {
  const canEdit = ["owner", "editor"].includes(file.role),
    [saveStatus, setSaveStatus] = useState(
      "Live edits synchronize automatically",
    );
  const revision = useRef(file.revision),
    saving = useRef(false);
  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({ undoRedo: false }),
        Collaboration.configure({ document: provider.document }),
      ],
      editable: canEdit,
      editorProps: { attributes: { "aria-label": "Document content" } },
    },
    [provider],
  );
  async function snapshot() {
    if (!editor || saving.current || !canEdit) return;
    saving.current = true;
    try {
      const current = await api("/files/" + file.id);
      const saved = await api("/files/" + file.id, "PUT", {
        revision: current.revision,
        content: { html: editor.getHTML() },
      });
      revision.current = saved.revision;
      onSaved(saved);
      setSaveStatus("Export snapshot saved");
    } catch (e: any) {
      onError(e.message);
      setSaveStatus("Snapshot failed");
    } finally {
      saving.current = false;
    }
  }
  useEffect(() => {
    if (!editor || !canEdit) return;
    const timer = setInterval(() => {
      if (editor.isFocused) void snapshot();
    }, 15000);
    return () => clearInterval(timer);
  }, [editor]);
  return (
    <>
      <div className="toolbar">
        <button
          disabled={!canEdit}
          onClick={() => editor?.chain().focus().toggleBold().run()}
        >
          <b>B</b>
        </button>
        <button
          disabled={!canEdit}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
        >
          <i>I</i>
        </button>
        <button
          disabled={!canEdit}
          onClick={() =>
            editor?.chain().focus().toggleHeading({ level: 1 }).run()
          }
        >
          Heading
        </button>
        <button
          disabled={!canEdit}
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
        >
          • List
        </button>
        <button
          disabled={!canEdit}
          onClick={() => editor?.chain().focus().toggleBlockquote().run()}
        >
          Quote
        </button>
        <span className="toolbar-spacer" />
        <span className="muted">{status}</span>
        <button disabled={!canEdit} onClick={snapshot}>
          Save export snapshot
        </button>
      </div>
      <p className="editor-note">
        {saveStatus}. Exports use the latest server-persisted document;
        snapshots create history checkpoints. Alpha supports text, headings,
        lists, and quotes.
      </p>
      <div className="paper">
        <EditorContent editor={editor} />
      </div>
    </>
  );
}
function StructuredEditor({
  file,
  onSaved,
  onError,
  onDirty,
}: {
  file: FileRecord;
  onSaved: (f: FileRecord) => void;
  onError: (s: string) => void;
  onDirty: (b: boolean) => void;
}) {
  const [content, setContent] = useState(file.content),
    [lease, setLease] = useState(false),
    [dirty, setDirty] = useState(false),
    [status, setStatus] = useState("Read only"),
    [tab, setTab] = useState(0),
    [present, setPresent] = useState(false);
  const revision = useRef(file.revision),
    canEdit = ["owner", "editor"].includes(file.role);
  useEffect(() => {
    onDirty(dirty);
    return () => onDirty(false);
  }, [dirty]);
  useEffect(() => {
    if (!canEdit) return;
    let disposed = false;
    const renew = () =>
      api("/files/" + file.id + "/lease", "POST", {})
        .then(() => {
          if (!disposed) {
            setLease(true);
            setStatus("Editing lease active");
          }
        })
        .catch((e) => {
          if (!disposed) {
            setLease(false);
            setStatus(e.message);
          }
        });
    void renew();
    const timer = setInterval(renew, 20000);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, [file.id]);
  function change(next: any) {
    setContent(next);
    setDirty(true);
  }
  async function save() {
    try {
      const f = await api("/files/" + file.id, "PUT", {
        revision: revision.current,
        content,
      });
      revision.current = f.revision;
      onSaved(f);
      setDirty(false);
      setStatus("Saved");
    } catch (e: any) {
      onError(e.message);
      setStatus("Not saved");
    }
  }
  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", before);
    return () => window.removeEventListener("beforeunload", before);
  }, [dirty]);
  const editable = canEdit && lease;
  return (
    <>
      <div className="toolbar">
        <span className="muted">
          {status}
          {dirty ? " · Unsaved changes" : ""}
        </span>
        <span className="toolbar-spacer" />
        {file.kind === "slides" && (
          <button onClick={() => setPresent(!present)}>
            {present ? "Exit slideshow" : "Present"}
          </button>
        )}
        <button
          className="primary"
          disabled={!editable || !dirty}
          onClick={save}
        >
          Save changes
        </button>
      </div>
      {file.kind === "sheet" ? (
        <>
          <p className="editor-note">
            Double-click a cell to edit. Formula support: arithmetic, cell
            references, and SUM(A1:B10). Grid view: 26 columns × 100 rows.
          </p>
          <div className="tabs">
            {content.sheets.map((s: Sheet, i: number) => (
              <button
                className={tab === i ? "selected" : ""}
                key={i}
                onClick={() => setTab(i)}
              >
                {s.name}
              </button>
            ))}
            <button
              disabled={!editable || content.sheets.length >= 10}
              onClick={() => {
                change({
                  ...content,
                  sheets: [
                    ...content.sheets,
                    { name: "Sheet " + (content.sheets.length + 1), cells: {} },
                  ],
                });
                setTab(content.sheets.length);
              }}
            >
              ＋ Sheet
            </button>
          </div>
          <div className="spreadsheet">
            <table>
              <thead>
                <tr>
                  <th />
                  <>
                    {Array.from({ length: 26 }, (_, i) => (
                      <th key={i}>{columnName(i + 1)}</th>
                    ))}
                  </>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 100 }, (_, r) => (
                  <tr key={r}>
                    <th>{r + 1}</th>
                    {Array.from({ length: 26 }, (_, c) => {
                      const address = columnName(c + 1) + (r + 1);
                      return (
                        <td key={c}>
                          <Cell
                            address={address}
                            value={content.sheets[tab].cells[address] ?? ""}
                            display={String(
                              calculate(content.sheets[tab].cells, address),
                            )}
                            disabled={!editable}
                            onChange={(value) => {
                              const sheets = structuredClone(content.sheets);
                              sheets[tab].cells[address] = value;
                              change({ sheets });
                            }}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className={"slides-workspace " + (present ? "presenting" : "")}>
          <div className="slide-strip">
            {content.slides.map((s: Slide, i: number) => (
              <button
                className={tab === i ? "selected" : ""}
                key={i}
                onClick={() => setTab(i)}
              >
                <span>{i + 1}</span>
                {s.title || "Untitled slide"}
              </button>
            ))}
            <button
              disabled={!editable || content.slides.length >= 100}
              onClick={() => {
                change({
                  slides: [
                    ...content.slides,
                    { title: "New slide", body: "", background: "#f7f4ed" },
                  ],
                });
                setTab(content.slides.length);
              }}
            >
              ＋ Add slide
            </button>
          </div>
          <div className="slide-stage">
            <div
              className="slide"
              style={{ background: content.slides[tab].background }}
            >
              <textarea
                aria-label="Slide title"
                className="slide-title"
                disabled={!editable || present}
                value={content.slides[tab].title}
                onChange={(e) => {
                  const slides = structuredClone(content.slides);
                  slides[tab].title = e.target.value;
                  change({ slides });
                }}
              />
              <textarea
                aria-label="Slide body"
                className="slide-body"
                disabled={!editable || present}
                value={content.slides[tab].body}
                onChange={(e) => {
                  const slides = structuredClone(content.slides);
                  slides[tab].body = e.target.value;
                  change({ slides });
                }}
              />
              <span className="slide-number">
                {String(tab + 1).padStart(2, "0")}
              </span>
            </div>
            {!present && (
              <div className="slide-controls">
                <label>
                  Background
                  <input
                    aria-label="Slide background"
                    type="color"
                    disabled={!editable}
                    value={content.slides[tab].background}
                    onChange={(e) => {
                      const slides = structuredClone(content.slides);
                      slides[tab].background = e.target.value;
                      change({ slides });
                    }}
                  />
                </label>
                <button
                  disabled={!editable || content.slides.length === 1}
                  onClick={() => {
                    change({
                      slides: content.slides.filter(
                        (_: Slide, i: number) => i !== tab,
                      ),
                    });
                    setTab(Math.max(0, tab - 1));
                  }}
                >
                  Remove slide
                </button>
              </div>
            )}
            <div className="slide-controls">
              <button disabled={tab === 0} onClick={() => setTab(tab - 1)}>
                ← Previous
              </button>
              <span>
                {tab + 1} / {content.slides.length}
              </span>
              <button
                disabled={tab === content.slides.length - 1}
                onClick={() => setTab(tab + 1)}
              >
                Next →
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
function Cell({
  address,
  value,
  display,
  disabled,
  onChange,
}: {
  address: string;
  value: string;
  display: string;
  disabled: boolean;
  onChange: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <input
      aria-label={address}
      readOnly={disabled}
      value={editing ? value : display}
      onFocus={() => setEditing(true)}
      onBlur={() => setEditing(false)}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
    />
  );
}
createRoot(document.getElementById("root")!).render(<App />);
