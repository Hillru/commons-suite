import ExcelJS from "exceljs";
import { Document, Packer, Paragraph } from "docx";
import PptxGenJS from "pptxgenjs";
import mammoth from "mammoth";
import sanitize from "sanitize-html";
import { calculate } from "./formulas.js";

export const cleanHtml = (html) =>
  sanitize(html, {
    allowedTags: [
      "p",
      "br",
      "strong",
      "em",
      "s",
      "h1",
      "h2",
      "h3",
      "ul",
      "ol",
      "li",
      "blockquote",
      "pre",
      "code",
      "hr",
      "a",
    ],
    allowedAttributes: { a: ["href", "title"] },
    allowedSchemes: ["http", "https", "mailto"],
  });
export async function exportFile(file, format) {
  if (format === "json")
    return {
      buffer: Buffer.from(
        JSON.stringify(
          {
            schemaVersion: 1,
            kind: file.kind,
            title: file.title,
            content: file.content,
          },
          null,
          2,
        ),
      ),
      type: "application/json",
      extension: "json",
    };
  if (file.kind === "document" && format === "html")
    return {
      buffer: Buffer.from(
        '<!doctype html><meta charset="UTF-8">' + cleanHtml(file.content.html),
      ),
      type: "text/html",
      extension: "html",
    };
  if (file.kind === "document" && format === "docx") {
    // Alpha export preserves paragraph text, not rich layout.
    const text = cleanHtml(file.content.html)
      .replace(/<br\s*\/?\s*>/gi, "\n")
      .replace(/<\/(p|h[1-3]|li|blockquote|pre)>/gi, "\n")
      .replace(/<[^>]*>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
    return {
      buffer: await Packer.toBuffer(
        new Document({
          sections: [
            { children: text.split("\n").map((t) => new Paragraph(t)) },
          ],
        }),
      ),
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      extension: "docx",
    };
  }
  if (file.kind === "sheet" && ["xlsx", "csv"].includes(format)) {
    const workbook = new ExcelJS.Workbook();
    for (const sheet of file.content.sheets) {
      const ws = workbook.addWorksheet(sheet.name);
      for (const [address, value] of Object.entries(sheet.cells)) {
        if (String(value).startsWith("=")) {
          const result = calculate(sheet.cells, address);
          ws.getCell(address).value = {
            formula: String(value).slice(1),
            result: typeof result === "number" ? result : undefined,
          };
        } else
          ws.getCell(address).value =
            value !== "" && Number.isFinite(Number(value))
              ? Number(value)
              : String(value);
      }
    }
    return {
      buffer: Buffer.from(
        format === "xlsx"
          ? await workbook.xlsx.writeBuffer()
          : await workbook.csv.writeBuffer(),
      ),
      type:
        format === "xlsx"
          ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          : "text/csv",
      extension: format,
    };
  }
  if (file.kind === "slides" && format === "pptx") {
    const deck = new PptxGenJS();
    deck.layout = "LAYOUT_WIDE";
    deck.author = "Commons Suite";
    for (const s of file.content.slides) {
      const slide = deck.addSlide();
      slide.background = { color: s.background.replace("#", "") };
      slide.addText(s.title, {
        x: 0.8,
        y: 1,
        w: 11.7,
        h: 1.5,
        fontSize: 36,
        color: "163E37",
        bold: true,
      });
      slide.addText(s.body, {
        x: 0.8,
        y: 3,
        w: 11.7,
        h: 3,
        fontSize: 22,
        color: "163E37",
        breakLine: false,
      });
    }
    return {
      buffer: Buffer.from(await deck.write({ outputType: "nodebuffer" })),
      type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      extension: "pptx",
    };
  }
  throw new Error("Unsupported export format");
}
export async function importFile(name, buffer) {
  if (buffer.length > 5 * 1024 * 1024) throw new Error("Import limit is 5 MB");
  const extension = name.split(".").pop().toLowerCase();
  if (extension === "docx") {
    const result = await mammoth.convertToHtml(
      { buffer },
      { externalFileAccess: false },
    );
    return {
      kind: "document",
      content: { html: cleanHtml(result.value) },
      warnings: [
        "Layout is simplified. Verify imported content.",
        ...result.messages.map((m) => m.message),
      ],
    };
  }
  if (extension === "xlsx") {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const sheets = [];
    let count = 0;
    wb.eachSheet((ws) => {
      const cells = {};
      ws.eachRow((row) =>
        row.eachCell((cell) => {
          if (++count > 10000)
            throw new Error("Import limit is 10,000 populated cells");
          if (cell.formula) cells[cell.address] = "=" + cell.formula;
          else cells[cell.address] = cell.text;
        }),
      );
      sheets.push({ name: ws.name, cells });
    });
    if (!sheets.length) throw new Error("Workbook has no sheets");
    return {
      kind: "sheet",
      content: { sheets },
      warnings: [
        "Only cell values and formulas are imported. Formatting, charts, macros, and other workbook features are not imported. Only the documented formula subset recalculates.",
      ],
    };
  }
  throw new Error("Alpha imports DOCX and XLSX only");
}
