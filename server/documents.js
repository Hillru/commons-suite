import { getSchema } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { generateJSON, generateHTML } from "@tiptap/html/server";
import { prosemirrorJSONToYDoc, yDocToProsemirrorJSON } from "@tiptap/y-tiptap";
import { Doc, applyUpdate, encodeStateAsUpdate } from "yjs";
import { cleanHtml } from "./formats.js";

const extensions = [StarterKit.configure({ undoRedo: false })];
const schema = getSchema(extensions);
export function initialDocument(html) {
  return prosemirrorJSONToYDoc(
    schema,
    generateJSON(cleanHtml(html), extensions),
    "default",
  );
}
export function documentContent(store, file) {
  const row = store.db
    .prepare("SELECT state FROM collaboration WHERE file_id=?")
    .get(file.id);
  if (!row) return file.content;
  const doc = new Doc();
  try {
    applyUpdate(doc, new Uint8Array(row.state));
    return {
      html: cleanHtml(
        generateHTML(yDocToProsemirrorJSON(doc, "default"), extensions),
      ),
    };
  } finally {
    doc.destroy();
  }
}
export function persistDocument(store, id, document) {
  store.db
    .prepare(
      "INSERT INTO collaboration VALUES(?,?) ON CONFLICT(file_id) DO UPDATE SET state=excluded.state",
    )
    .run(id, Buffer.from(encodeStateAsUpdate(document)));
}
