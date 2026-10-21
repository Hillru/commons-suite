import {
  readFileSync,
  readdirSync,
  writeFileSync,
  mkdirSync,
  copyFileSync,
  existsSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
mkdirSync("docs/licenses", { recursive: true });
for (const file of readdirSync("docs/licenses"))
  rmSync(join("docs/licenses", file));
const inventory = [],
  identifiers = new Set();
const allowed = new Set([
  "MIT",
  "ISC",
  "Apache-2.0",
  "BSD",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "0BSD",
  "BlueOak-1.0.0",
  "(MIT AND Zlib)",
  "(MIT OR GPL-3.0-or-later)",
  "Unlicense",
  "MIT/X11",
]);
for (const [path, metadata] of Object.entries(lock.packages)) {
  if (!path || !existsSync(join(path, "package.json"))) continue;
  const pkg = JSON.parse(readFileSync(join(path, "package.json"), "utf8"));
  const name = pkg.name,
    version = pkg.version,
    license = pkg.license ?? metadata.license ?? "UNKNOWN";
  identifiers.add(license);
  const texts = readdirSync(path).filter((n) =>
    /^(licen[cs]e|copying|notice)(\.|$)/i.test(n),
  );
  let sources = texts.map((t) => join(path, t));
  if (!sources.length) {
    const fallback = name.startsWith("@hocuspocus/")
      ? "docs/upstream-licenses/hocuspocus-3.4.4.txt"
      : name.startsWith("@esbuild/")
        ? "node_modules/esbuild/LICENSE.md"
        : name.startsWith("@rollup/rollup-")
          ? "node_modules/rollup/LICENSE.md"
          : name === "saxes"
            ? "docs/upstream-licenses/saxes-5.0.1.txt"
            : name === "abstract-logging"
              ? "docs/upstream-licenses/abstract-logging-2.0.1.html"
              : null;
    const readme = readdirSync(path).find((n) => /^readme/i.test(n));
    sources =
      fallback && existsSync(fallback)
        ? [fallback]
        : [join(path, "package.json"), ...(readme ? [join(path, readme)] : [])];
  }
  const licenses = [];
  for (const source of sources) {
    const destination =
      name.replaceAll("/", "_").replaceAll("@", "") +
      "-" +
      version +
      "-" +
      source.split("/").pop();
    copyFileSync(source, join("docs/licenses", destination));
    licenses.push("docs/licenses/" + destination);
  }
  inventory.push({
    name,
    version,
    license,
    dev: !!metadata.dev,
    integrity: metadata.integrity ?? null,
    licenses,
  });
}
inventory.sort(
  (a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version),
);
writeFileSync(
  "docs/dependency-inventory.json",
  JSON.stringify(
    {
      generatedFrom: "package-lock.json",
      lockfileSha256: createHash("sha256")
        .update(readFileSync("package-lock.json"))
        .digest("hex"),
      packages: inventory,
    },
    null,
    2,
  ) + "\n",
);
writeFileSync(
  "THIRD_PARTY_NOTICES.md",
  "# Third-party notices\n\nGenerated from installed locked dependencies, including development tools. Upstream license texts are authoritative. Some packages embed notices in README or metadata. See docs/LICENSING.md.\n\n" +
    inventory
      .map(
        (p) =>
          "## " +
          p.name +
          " " +
          p.version +
          "\n\nLicense declaration: " +
          p.license +
          "\n\n" +
          p.licenses
            .map((l) => "[" + l.split("/").pop() + "](" + l + ")")
            .join(", ") +
          "\n",
      )
      .join("\n"),
);
const rejected = inventory.filter((p) => !allowed.has(p.license));
if (rejected.length)
  throw new Error(
    "License review required: " +
      rejected.map((p) => p.name + ": " + p.license).join(", "),
  );
// Use names for legacy ambiguous identifiers rather than inventing SPDX IDs.
const legacy = new Set(["BSD", "MIT/X11"]);
writeFileSync(
  "docs/sbom.cdx.json",
  JSON.stringify(
    {
      bomFormat: "CycloneDX",
      specVersion: "1.5",
      version: 1,
      metadata: {
        component: {
          type: "application",
          name: "commons-suite",
          version: lock.version,
        },
      },
      components: inventory.map((p) => ({
        type: "library",
        name: p.name,
        version: p.version,
        purl: "pkg:npm/" + p.name.replace("@", "%40") + "@" + p.version,
        licenses: legacy.has(p.license)
          ? [{ license: { name: p.license } }]
          : [{ expression: p.license }],
      })),
    },
    null,
    2,
  ) + "\n",
);
console.log(
  "Inventoried " +
    inventory.length +
    " packages; license identifiers: " +
    [...identifiers].sort().join(", "),
);
