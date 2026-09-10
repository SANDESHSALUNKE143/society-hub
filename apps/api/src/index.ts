import { env } from "./config";
import { createApp } from "./app";
import { applyMigrations } from "./db/migrate";

async function main() {
  // Bind immediately so Render's /health check can pass while TiDB migrate runs.
  const app = createApp().listen({
    port: env.port,
    hostname: "0.0.0.0",
  });
  console.log(
    `SocietyHub API listening on http://0.0.0.0:${app.server?.port} (OpenAPI /docs)`,
  );
  await applyMigrations();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

export type { App } from "./app";
