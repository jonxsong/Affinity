import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const staticRoot = path.join(root, "out");
const distRoot = path.join(root, "dist");
const workerSourcePath = path.join(root, "hosting", "worker", "index.js");

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(absolute)));
    else if (entry.isFile()) files.push(absolute);
  }
  return files;
}

const assets = {};
for (const file of await walk(staticRoot)) {
  const pathname = `/${path.relative(staticRoot, file).split(path.sep).join("/")}`;
  const body = await readFile(file);
  assets[pathname] = {
    body: body.toString("base64"),
    type:
      contentTypes[path.extname(file).toLowerCase()] ||
      "application/octet-stream",
  };
}

const marker = "const ASSETS = /*__AFFINITY_ASSETS__*/ {};";
const source = await readFile(workerSourcePath, "utf8");
if (!source.includes(marker))
  throw new Error("Affinity Worker asset marker is missing");
const compiled = source.replace(
  marker,
  `const ASSETS = ${JSON.stringify(assets)};`,
);
if (Buffer.byteLength(compiled) > 8_000_000)
  throw new Error("Affinity Worker exceeds the 8 MB source budget");

await rm(distRoot, { recursive: true, force: true });
await mkdir(path.join(distRoot, "server"), { recursive: true });
await mkdir(path.join(distRoot, ".openai"), { recursive: true });
await writeFile(path.join(distRoot, "server", "index.js"), compiled);
await cp(
  path.join(root, ".openai", "hosting.json"),
  path.join(distRoot, ".openai", "hosting.json"),
);

const syntax = spawnSync(process.execPath, ["--input-type=module", "--check"], {
  input: compiled,
  encoding: "utf8",
});
if (syntax.status !== 0)
  throw new Error(syntax.stderr || "Generated Worker failed syntax validation");
console.log(
  `Built Worker with ${Object.keys(assets).length} assets (${Buffer.byteLength(compiled)} bytes)`,
);
