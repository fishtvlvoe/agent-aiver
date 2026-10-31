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

// 語法檢查：抽出所有 .html 內的 module script，node --check 驗證（防止引號炸掉整頁）
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
let checked = 0;
for (const f of files.filter((x) => x.endsWith(".html"))) {
  const html = readFileSync(join(dist, f), "utf8");
  const blocks = [...html.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)];
  blocks.forEach((b, i) => {
    const tmp = join(dist, `.syntax-check-${i}.mjs`);
    writeFileSync(tmp, b[1]);
    try {
      execFileSync(process.execPath, ["--check", tmp], { stdio: "pipe" });
    } catch (e) {
      console.error(`✘ ${f} 第 ${i + 1} 個 module script 語法錯誤：\n${e.stderr}`);
      process.exit(1);
    } finally {
      rmSync(tmp, { force: true });
    }
    checked++;
  });
}
console.log(`syntax check ok: ${checked} 個 inline module 通過`);

console.log(`build ok: ${files.length} 個檔案輸出到 dist/`);
for (const f of files) console.log(` - ${f}`);
