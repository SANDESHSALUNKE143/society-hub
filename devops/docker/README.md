# Docker strategy

## Goals

- Reproducible builds for **staging** and **production**
- One artifact per app: `societyhub-api`, `societyhub-client-app`, `societyhub-manage`
- Promote by **image digest / git SHA tag**, not rebuild-per-env

## Images

| Image | Source | Runtime role |
|-------|--------|----------------|
| `societyhub-api` | `apps/api` | Bun + Elysia API (Render preview + later Azure) |
| `societyhub-client-app` | `apps/client-app` build → nginx (or Azure Static Web Apps) |
| `societyhub-manage` | `apps/manage` build → nginx (or Azure Static Web Apps) |

## Local development

```bash
# MySQL only (host port 3307 → container 3306; avoids clashing with a local MySQL on 3306)
docker compose -f devops/docker/docker-compose.yml up mysql -d

# Full stack (API + web + manage images)
docker compose -f devops/docker/docker-compose.yml --profile app up --build
```

Local MySQL credentials:
- **User:** `root`
- **Password:** `1900Summer@`
- **Database:** `societyhub`
- **Host port:** `3307`

App `DATABASE_URL` (URL-encode `@` as `%40`):

`mysql://root:1900Summer%40@127.0.0.1:3307/societyhub`

> Root password is applied only on first volume init. To recreate from scratch:  
> `docker compose -f devops/docker/docker-compose.yml down -v && docker compose -f devops/docker/docker-compose.yml up mysql -d`

## Build examples

```bash
docker build -f devops/docker/api.Dockerfile -t societyhub-api:local .
docker build -f devops/docker/client-app.Dockerfile -t societyhub-client-app:local .
```

## Healthchecks

- API: `GET /health`
- Web nginx: `GET /health`

## Security

- Never bake secrets into images; inject via Container Apps env / Key Vault
- Run as non-root where base images allow

## Deployment timing

Azure deploy happens after Phase 1 feature development is ready for staging UAT — see [../README.md](../README.md).
