variable "render_owner_id" {
  type        = string
  description = "Render team/user owner id (tea-… or usr-…)."
  default     = "tea-da9bsdlg1s2s739u3g7g"
}

variable "repo_url" {
  type        = string
  description = "HTTPS GitHub URL Render already has permission to clone."
  default     = "https://github.com/engineersbay/society-hub"
}

variable "branch" {
  type        = string
  description = "Git branch Render auto-deploys."
  default     = "main"
}

variable "region" {
  type        = string
  description = "Closest free-capable region for India."
  default     = "singapore"
}

variable "api_plan" {
  type        = string
  description = "Web service plan. Keep free for Hobby ($0). starter is paid."
  default     = "free"
}

variable "api_name" {
  type    = string
  default = "societyhub-api"
}

variable "client_name" {
  type    = string
  default = "societyhub-client"
}

variable "manage_name" {
  type    = string
  default = "societyhub-manage"
}

variable "database_url" {
  type        = string
  sensitive   = true
  description = "TiDB Serverless MySQL URL, e.g. mysql://user:pass@host:4000/societyhub"
}

variable "jwt_secret" {
  type        = string
  sensitive   = true
  description = "32+ random characters. Not the local default."
}

variable "superadmin_password" {
  type        = string
  sensitive   = true
  default     = "Test@1234"
  description = "Used if you run db:seed once against the preview DB."
}

variable "superadmin_email" {
  type        = string
  default     = "superadmin@societyhub.local"
  description = "Preview Super Admin email. Set to a Google test user for SSO."
}

variable "superadmin_name" {
  type    = string
  default = "Platform Superadmin"
}

variable "dev_auth" {
  type    = string
  default = "true"
}

variable "dev_otp_code" {
  type    = string
  default = "123456"
}

variable "cors_origin_override" {
  type        = string
  default     = ""
  description = "If Render slugs differ from service names, set the real client,manage origins here."
}

variable "api_public_url" {
  type        = string
  default     = ""
  description = "Real API URL if Render assigned a suffix (e.g. https://societyhub-api-ece6.onrender.com)."
}

variable "google_client_id" {
  type        = string
  default     = ""
  description = "Google OAuth Web client ID (GIS + API audience). Safe to set on static sites."
}

variable "google_client_secret" {
  type        = string
  default     = ""
  sensitive   = true
  description = "Google OAuth Web client secret. API only; never send to Vite."
}
