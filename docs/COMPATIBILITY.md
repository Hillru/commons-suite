# Compatibility contract

All imports preserve the original bytes in the database. Download originals via GET /api/files/:id/original. This endpoint checks the same permissions as content access.

| Format | Import | Export | Losses/limits |
| --- | --- | --- | --- |
| DOCX | Mammoth semantic HTML | Paragraph text using docx | Complex layout, rich export styling, images, tables, comments, headers, footers, footnotes may be lost |
| XLSX | Cells/formula strings using ExcelJS | Cells/formulas using ExcelJS | Import drops formatting, charts, merged-cell semantics, named ranges, connections; only implemented formulas recalculate |
| PPTX | Not implemented | Title/body/background using PptxGenJS | No arbitrary layouts, images, tables, charts, transitions, animation |
| CSV | Not implemented | First worksheet | Does not retain workbook metadata or formatting |
| HTML | Not implemented | Sanitized document HTML | No application scripts, unsafe URLs, or external assets |
| Native JSON | Not implemented | Versioned envelope with title/kind/content | Export is not a substitute for a complete database backup |
| PDF/ODF/legacy Office | Not implemented | Not implemented | Planned |

Spreadsheet formula grammar: numbers, unary +/-, parentheses, + - * /, A1 references, and SUM(A1:B10). Unsupported functions display #UNSUPPORTED!, cycles #CYCLE!, division by zero #DIV/0!. Formula and range limits bound work. Numeric semantics are JavaScript floating point, not full Excel semantics. Locale-specific separators and financial/date functions are unsupported.

Do not open exported spreadsheets from untrusted authors without reviewing their formulas. Formulas are intentionally preserved in XLSX/CSV and other spreadsheet applications can evaluate functions this suite does not implement.

Import limits: 5 MB compressed input, 30 MB declared expanded ZIP content, 2,000 ZIP entries, 10,000 populated cells, 10-second conversion timeout, two concurrent workers. Macro-enabled archives and encrypted ZIP entries are rejected. Workers have a 128 MB JavaScript heap ceiling; this is not a total OS memory limit.

The generated conversion fixtures prove basic structural output and simple values. They do not prove broad Office round-trip fidelity. Next release gate: curate user-provided, redistributable fixtures, compare rendering in independent consumers, and publish feature-by-feature results.
