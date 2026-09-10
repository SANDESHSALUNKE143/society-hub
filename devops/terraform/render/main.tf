locals {
  api_url     = var.api_public_url != "" ? var.api_public_url : "https://${var.api_name}.onrender.com"
  client_url  = "https://${var.client_name}.onrender.com"
  manage_url  = "https://${var.manage_name}.onrender.com"
  cors_origin = var.cors_origin_override != "" ? var.cors_origin_override : "${local.client_url},${local.manage_url}"

  # Render static builders are Node. Install Bun, then turbo-build one app.
  # Render already runs bun install. Only the Vite/turbo build belongs here.
  client_build = "bunx turbo run build --filter=@society-hub/client-app"
  manage_build = "bunx turbo run build --filter=@society-hub/manage"
}

resource "render_web_service" "api" {
  name              = var.api_name
  plan              = var.api_plan
  region            = var.region
  health_check_path = "/health"

  runtime_source = {
    docker = {
      repo_url        = var.repo_url
      branch          = var.branch
      auto_deploy     = true
      dockerfile_path = "./devops/docker/api.Dockerfile"
      context         = "."
    }
  }

  env_vars = {
    DATABASE_URL         = { value = var.database_url }
    JWT_SECRET           = { value = var.jwt_secret }
    CORS_ORIGIN          = { value = local.cors_origin }
    PUBLIC_API_URL       = { value = local.api_url }
    PUBLIC_APP_URL       = { value = local.client_url }
    DEV_AUTH             = { value = var.dev_auth }
    DEV_OTP_CODE         = { value = var.dev_otp_code }
    SUPERADMIN_PASSWORD  = { value = var.superadmin_password }
    SUPERADMIN_EMAIL     = { value = var.superadmin_email }
    SUPERADMIN_NAME      = { value = var.superadmin_name }
    UPLOAD_DIR           = { value = "/tmp/uploads" }
    NODE_ENV             = { value = "production" }
    GOOGLE_CLIENT_ID     = { value = var.google_client_id }
    GOOGLE_CLIENT_SECRET = { value = var.google_client_secret }
  }
}

resource "render_static_site" "client_app" {
  name          = var.client_name
  repo_url      = var.repo_url
  branch        = var.branch
  auto_deploy   = true
  build_command = local.client_build
  publish_path  = "apps/client-app/dist"

  env_vars = {
    VITE_API_URL          = { value = local.api_url }
    VITE_MANAGE_URL       = { value = local.manage_url }
    VITE_APP_ORIGIN       = { value = local.client_url }
    VITE_GOOGLE_CLIENT_ID = { value = var.google_client_id }
  }

  routes = [
    {
      source      = "/*"
      destination = "/index.html"
      type        = "rewrite"
    },
  ]
}

resource "render_static_site" "manage" {
  name          = var.manage_name
  repo_url      = var.repo_url
  branch        = var.branch
  auto_deploy   = true
  build_command = local.manage_build
  publish_path  = "apps/manage/dist"

  env_vars = {
    VITE_API_URL          = { value = local.api_url }
    VITE_WEB_URL          = { value = local.client_url }
    VITE_APP_ORIGIN       = { value = local.client_url }
    VITE_MANAGE_ORIGIN    = { value = local.manage_url }
    VITE_GOOGLE_CLIENT_ID = { value = var.google_client_id }
  }

  routes = [
    {
      source      = "/*"
      destination = "/index.html"
      type        = "rewrite"
    },
  ]
}
