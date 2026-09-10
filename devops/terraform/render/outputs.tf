output "api_url" {
  value       = render_web_service.api.url
  description = "Public API URL (health at /health)."
}

output "client_url" {
  value       = render_static_site.client_app.url
  description = "Resident web app."
}

output "manage_url" {
  value       = render_static_site.manage.url
  description = "Admin / Super Admin web app."
}

output "predicted_urls" {
  value = {
    api    = local.api_url
    client = local.client_url
    manage = local.manage_url
  }
  description = "Hostnames used for CORS and Vite env. Compare to real outputs after apply."
}
