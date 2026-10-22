import { execFileSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  chmodSync,
  rmSync,
} from "node:fs";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
if (process.platform !== "darwin")
  throw Error("Build on macOS with Apple Command Line Tools.");
const arch = process.env.COMMONS_ARCH ?? process.arch;
if (!["arm64", "x64"].includes(arch)) throw Error("Unsupported architecture");
const version = "24.22.0";
const root = resolve(".");
const cache = join(root, ".tmp", "desktop-cache");
const output = join(root, ".tmp", "desktop-build", arch);
const bundle = join(output, "Commons Suite.app");
const resources = join(bundle, "Contents", "Resources");
mkdirSync(cache, { recursive: true });
const run = (cmd, args, options = {}) =>
  execFileSync(cmd, args, { stdio: "inherit", ...options });
const archive = `node-v${version}-darwin-${arch}.tar.gz`;
for (const name of [archive, "SHASUMS256.txt"]) {
  const target = join(cache, name);
  if (!existsSync(target))
    run("/usr/bin/curl", [
      "--fail",
      "--location",
      "--silent",
      "--show-error",
      `https://nodejs.org/dist/v${version}/${name}`,
      "-o",
      target,
    ]);
}
const expected = readFileSync(join(cache, "SHASUMS256.txt"), "utf8")
  .split("\n")
  .find((line) => line.endsWith(`  ${archive}`))
  ?.split(" ")[0];
const actual = createHash("sha256")
  .update(readFileSync(join(cache, archive)))
  .digest("hex");
if (!expected || actual !== expected)
  throw Error("Node.js archive checksum mismatch");
run(process.execPath, ["node_modules/vite/bin/vite.js", "build"]);
rmSync(output, { recursive: true, force: true });
mkdirSync(join(bundle, "Contents", "MacOS"), { recursive: true });
mkdirSync(resources, { recursive: true });
const runtimeSource = join(cache, `node-v${version}-darwin-${arch}`);
if (!existsSync(runtimeSource))
  run("/usr/bin/tar", ["-xzf", join(cache, archive), "-C", cache]);
mkdirSync(join(resources, "runtime", "bin"), { recursive: true });
cpSync(
  join(runtimeSource, "bin", "node"),
  join(resources, "runtime", "bin", "node"),
);
chmodSync(join(resources, "runtime", "bin", "node"), 0o755);
const app = join(resources, "app");
mkdirSync(app, { recursive: true });
for (const path of [
  "package.json",
  "package-lock.json",
  "server",
  "dist",
  "desktop/entry.mjs",
])
  cpSync(join(root, path), join(app, path), { recursive: true });
run(
  "npm",
  ["ci", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund"],
  { cwd: app },
);
const licenses = join(resources, "licenses");
mkdirSync(licenses, { recursive: true });
for (const file of ["LICENSE", "NOTICE", "THIRD_PARTY_NOTICES.md"])
  cpSync(join(root, file), join(licenses, file));
cpSync(join(root, "docs", "licenses"), join(licenses, "dependencies"), {
  recursive: true,
});
cpSync(join(runtimeSource, "LICENSE"), join(licenses, "Node.js-LICENSE.txt"));
cpSync(
  join(root, "desktop", "Info.plist"),
  join(bundle, "Contents", "Info.plist"),
);
if (existsSync(join(root, "desktop", "CommonsSuite.icns")))
  cpSync(
    join(root, "desktop", "CommonsSuite.icns"),
    join(resources, "CommonsSuite.icns"),
  );
run("/usr/bin/swiftc", [
  "-parse-as-library",
  "-module-cache-path",
  join(root, ".tmp", "swift-cache"),
  "-target",
  `${arch === "x64" ? "x86_64" : "arm64"}-apple-macosx14.0`,
  "-O",
  join(root, "desktop", "CommonsSuite.swift"),
  "-o",
  join(bundle, "Contents", "MacOS", "CommonsSuite"),
  "-framework",
  "AppKit",
  "-framework",
  "WebKit",
  "-framework",
  "Security",
]);
// Local development signature only. A public release requires Developer ID + notarization.
for (const target of [join(resources, "runtime", "bin", "node"), bundle])
  run("/usr/bin/codesign", ["--force", "--sign", "-", target]);
run("/usr/bin/codesign", [
  "--verify",
  "--deep",
  "--strict",
  "--verbose=2",
  bundle,
]);
writeFileSync(
  join(output, "build-info.json"),
  JSON.stringify(
    {
      version: JSON.parse(readFileSync("package.json")).version,
      arch,
      node: version,
      nodeArchiveSha256: actual,
      signing: "ad-hoc; local development only",
      notarized: false,
    },
    null,
    2,
  ),
);
console.log(
  `Built ${bundle}. Run npm run test:desktop before using it. Not a public release.`,
);
