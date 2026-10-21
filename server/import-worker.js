import { importFile } from "./formats.js";
export function inspectZip(buffer) {
  if (buffer.readUInt32LE(0) !== 0x04034b50)
    throw new Error("Expected an OOXML ZIP archive");
  let end = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--)
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      end = i;
      break;
    }
  if (end < 0) throw new Error("Invalid ZIP directory");
  const count = buffer.readUInt16LE(end + 10),
    offset = buffer.readUInt32LE(end + 16);
  if (count > 2000 || count === 65535 || offset >= end)
    throw new Error("ZIP limits exceeded");
  let pos = offset,
    total = 0;
  for (let i = 0; i < count; i++) {
    if (pos + 46 > end || buffer.readUInt32LE(pos) !== 0x02014b50)
      throw new Error("Invalid ZIP entry");
    if (buffer.readUInt16LE(pos + 8) & 1)
      throw new Error("Encrypted files are unsupported");
    const size = buffer.readUInt32LE(pos + 24),
      nameLength = buffer.readUInt16LE(pos + 28),
      extra = buffer.readUInt16LE(pos + 30),
      comment = buffer.readUInt16LE(pos + 32);
    total += size;
    if (total > 30 * 1024 * 1024 || size === 0xffffffff)
      throw new Error("Expanded ZIP exceeds 30 MB");
    const name = buffer.subarray(pos + 46, pos + 46 + nameLength).toString();
    if (
      name.includes("..") ||
      name.startsWith("/") ||
      name.includes("vbaProject.bin")
    )
      throw new Error("Unsafe or macro-enabled archive");
    pos += 46 + nameLength + extra + comment;
  }
  return total;
}
if (process.argv[2] === "--run") {
  let input = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => {
    input += chunk;
    if (input.length > 8 * 1024 * 1024) process.exit(1);
  });
  process.stdin.on("end", async () => {
    try {
      const { name, data } = JSON.parse(input);
      const buffer = Buffer.from(data, "base64");
      inspectZip(buffer);
      const result = await importFile(name, buffer);
      process.stdout.write(JSON.stringify(result));
    } catch {
      process.stderr.write(
        "Import rejected: invalid, unsupported, or oversized file.",
      );
      process.exitCode = 1;
    }
  });
}
