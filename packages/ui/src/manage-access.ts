/** Who may enter the Manage app (platform Super Admin + society Admin). */
export function canUseManageApp(role: string | undefined): boolean {
  return role === "superadmin" || role === "chairperson" || role === "admin";
}
