import path from "node:path";

import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";

// 測試帳號密碼放在 git 忽略的 .env.e2e.local
dotenv.config({ path: path.resolve(__dirname, ".env.e2e.local") });

// LINE 後台本機驗收：指向已用 opennextjs-cloudflare preview 啟動的 3100 埠，不自動 build
export default defineConfig({
	testDir: "./tests/line-admin",
	fullyParallel: false,
	workers: 1,
	retries: 0,
	reporter: [["list"]],
	use: {
		baseURL: "http://localhost:3100",
		trace: "off",
	},
	projects: [
		{
			name: "chromium",
			use: {
				...devices["Desktop Chrome"],
			},
		},
	],
});
