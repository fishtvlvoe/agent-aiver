import { defineConfig } from "drizzle-kit";

// D1 is applied with `wrangler d1 migrations apply`, so drizzle-kit only generates SQL files here.
export default defineConfig({
	dialect: "sqlite",
	schema: "./drizzle/schema/sqlite.ts",
	out: "./drizzle/migrations",
});
