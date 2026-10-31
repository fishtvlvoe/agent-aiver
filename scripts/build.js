// 建置：把 web/ 靜態檔複製到 dist/（供 Cloudflare Pages 或 wrangler assets 使用）
import { cpSync, rmSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "web");
const dist = join(root, "dist");

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
cpSync(src, dist, { recursive: true });

const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else files.push(p.slice(dist.length + 1));
  }
})(dist);

console.log(`build ok: ${files.length} 個檔案輸出到 dist/`);
for (const f of files) console.log(` - ${f}`);
