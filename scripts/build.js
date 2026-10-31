// 建置：①（問題 5）從 src/lib/format.js 抽出 fmt 三函數產生 web/fmt.js（單一來源）
//        ② 把 web/ 靜態檔複製到 dist/（供 Cloudflare Pages 或 wrangler assets 使用）
import { cpSync, rmSync, mkdirSync, readdirSync, statSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "web");
const dist = join(root, "dist");

// --- 步驟 ①：產生 web/fmt.js ---
const formatSrc = readFileSync(join(root, "src/lib/format.js"), "utf8");
const FNS = ["fmtMoney", "fmtDate", "fmtTime"];
let out = "// 本檔由 scripts/build.js 自動產生（來源 src/lib/format.js），請勿手改；問題 5 單一來源\n";
for (const name of FNS) {
  const re = new RegExp(`export function ${name}[\\s\\S]*?\\n}`, "m");
  const m = formatSrc.match(re);
  if (!m) throw new Error(`src/lib/format.js 找不到 ${name}，無法產生 web/fmt.js`);
  out += m[0].replace(/^export function/, "export function") + "\n\n";
}
writeFileSync(join(src, "fmt.js"), out);
console.log("web/fmt.js 已從 src/lib/format.js 產生");

// --- 步驟 ②：複製 web/ → dist/ ---
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
