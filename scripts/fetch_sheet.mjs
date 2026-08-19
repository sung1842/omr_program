import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const objectPath = process.argv[3];
const outFile = process.argv[4];
if (!objectPath || !outFile) {
  throw new Error(
    "usage: OMR_EMAIL=... OMR_PASSWORD=... node fetch_sheet.mjs <projectRoot> <objectPath> <outFile>",
  );
}

const envText = fs.readFileSync(path.join(root, ".env.local"), "utf8");
const env = Object.fromEntries(
  envText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const index = line.indexOf("=");
      const key = line.slice(0, index).trim();
      let value = line.slice(index + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      return [key, value];
    }),
);

const base = env.NEXT_PUBLIC_SUPABASE_URL;
const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const email = process.env.OMR_EMAIL;
const password = process.env.OMR_PASSWORD;
if (!email || !password) {
  throw new Error("set OMR_EMAIL and OMR_PASSWORD to the account that owns the sheet");
}

const auth = await fetch(`${base}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { apikey: anon, "Content-Type": "application/json" },
  body: JSON.stringify({ email, password }),
});
if (!auth.ok) {
  throw new Error(`sign-in failed: ${auth.status} ${await auth.text()}`);
}
const { access_token: token } = await auth.json();

const download = await fetch(`${base}/storage/v1/object/scan-sheets/${objectPath}`, {
  headers: { apikey: anon, Authorization: `Bearer ${token}` },
});
if (!download.ok) {
  throw new Error(`download failed: ${download.status} ${await download.text()}`);
}
const bytes = Buffer.from(await download.arrayBuffer());
fs.writeFileSync(outFile, bytes);
console.log("saved", outFile, bytes.length, "bytes");
