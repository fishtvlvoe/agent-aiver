import type { D1Database } from "@cloudflare/workers-types";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { drizzle } from "drizzle-orm/d1";

import * as schema from "./schema/sqlite";

// The D1 binding (`DB` in wrangler.jsonc) only exists inside a request on Workers,
// so the client is created on first use instead of at module load.
const createDb = () => drizzle((getCloudflareContext().env as { DB: D1Database }).DB, { schema });

let cachedDb: ReturnType<typeof createDb> | undefined;

export const db = new Proxy({} as ReturnType<typeof createDb>, {
	get(_, prop) {
		cachedDb ??= createDb();
		return Reflect.get(cachedDb, prop);
	},
});
