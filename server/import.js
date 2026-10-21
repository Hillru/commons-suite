import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
let running = 0;
export async function isolatedImport(name, data) {
  if (running >= 2) throw new Error("Import workers busy. Try again shortly.");
  running++;
  try {
    return await new Promise((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [
          "--max-old-space-size=128",
          fileURLToPath(new URL("./import-worker.js", import.meta.url)),
          "--run",
        ],
        { stdio: ["pipe", "pipe", "pipe"], env: { PATH: process.env.PATH } },
      );
      let output = "",
        error = "";
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        reject(new Error("Import timed out"));
      }, 10000);
      child.stdout.on("data", (chunk) => {
        output += chunk;
        if (output.length > 8 * 1024 * 1024) {
          child.kill("SIGKILL");
          reject(new Error("Import output limit exceeded"));
        }
      });
      child.stderr.on("data", (chunk) => {
        error += chunk;
      });
      child.on("error", (e) => {
        clearTimeout(timer);
        reject(e);
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (code !== 0)
          reject(
            new Error("Import rejected. Use a basic DOCX or XLSX under 5 MB."),
          );
        else
          try {
            resolve(JSON.parse(output));
          } catch {
            reject(new Error("Invalid import result"));
          }
      });
      child.stdin.on("error", () => {});
      child.stdin.end(JSON.stringify({ name, data }));
    });
  } finally {
    running--;
  }
}
