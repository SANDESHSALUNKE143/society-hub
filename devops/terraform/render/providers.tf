# API key: export RENDER_API_KEY (do not put it in tfvars or git).
# Owner:   export RENDER_OWNER_ID or set render_owner_id (default = societyhub team).
provider "render" {
  owner_id = var.render_owner_id
}
