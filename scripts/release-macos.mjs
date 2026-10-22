import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  cpSync,
  rmSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
if (process.platform !== "darwin") throw Error("Release on macOS.");
const identity = process.env.COMMONS_SIGN_IDENTITY;
const profile = process.env.COMMONS_NOTARY_PROFILE;
if (!identity?.startsWith("Developer ID Application:") || !profile)
  throw Error(
    "Provide a Developer ID Application identity and a stored notarytool Keychain profile. No credentials belong in source or arguments.",
  );
const app = resolve(
  process.argv[2] ?? `.tmp/desktop-build/${process.arch}/Commons Suite.app`,
);
if (!existsSync(join(app, "Contents/MacOS/CommonsSuite")))
  throw Error("Build and test the app before releasing.");
const out = resolve(".tmp/release");
mkdirSync(out, { recursive: true });
const run = (cmd, args) => execFileSync(cmd, args, { stdio: "inherit" });
run("/usr/bin/codesign", [
  "--force",
  "--options",
  "runtime",
  "--timestamp",
  "--sign",
  identity,
  "--entitlements",
  "desktop/node-entitlements.plist",
  join(app, "Contents/Resources/runtime/bin/node"),
]);
run("/usr/bin/codesign", [
  "--force",
  "--options",
  "runtime",
  "--timestamp",
  "--sign",
  identity,
  app,
]);
run("/usr/bin/codesign", [
  "--verify",
  "--deep",
  "--strict",
  "--verbose=2",
  app,
]);
const zip = join(out, "Commons-Suite-notarization.zip");
rmSync(zip, { force: true });
run("/usr/bin/ditto", ["-c", "-k", "--keepParent", app, zip]);
run("/usr/bin/xcrun", [
  "notarytool",
  "submit",
  zip,
  "--keychain-profile",
  profile,
  "--wait",
]);
run("/usr/bin/xcrun", ["stapler", "staple", app]);
run("/usr/bin/xcrun", ["stapler", "validate", app]);
run("/usr/sbin/spctl", ["--assess", "--type", "execute", "--verbose=2", app]);
const staging = join(out, "image");
rmSync(staging, { recursive: true, force: true });
mkdirSync(staging);
cpSync(app, join(staging, "Commons Suite.app"), { recursive: true });
const dmg = join(
  out,
  `Commons-Suite-${JSON.parse(readFileSync("package.json")).version}-${process.arch}.dmg`,
);
run("/usr/bin/hdiutil", [
  "create",
  "-ov",
  "-format",
  "UDZO",
  "-volname",
  "Commons Suite",
  "-srcfolder",
  staging,
  dmg,
]);
run("/usr/bin/codesign", ["--timestamp", "--sign", identity, dmg]);
run("/usr/bin/xcrun", [
  "notarytool",
  "submit",
  dmg,
  "--keychain-profile",
  profile,
  "--wait",
]);
run("/usr/bin/xcrun", ["stapler", "staple", dmg]);
run("/usr/bin/xcrun", ["stapler", "validate", dmg]);
run("/usr/sbin/spctl", [
  "--assess",
  "--type",
  "open",
  "--context",
  "context:primary-signature",
  "--verbose=2",
  dmg,
]);
run("/usr/bin/hdiutil", ["verify", dmg]);
writeFileSync(
  dmg + ".sha256",
  createHash("sha256").update(readFileSync(dmg)).digest("hex") +
    "  " +
    dmg.split("/").pop() +
    "\n",
);
console.log(
  "Notarized candidate created. Test installation on a clean Mac before publishing.",
);
