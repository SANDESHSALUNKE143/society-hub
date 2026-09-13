/** Who may enter the Manage app — SocietyHub platform employees only (Spec). */
export function canUseManageApp(role: string | undefined): boolean {
  return role === "superadmin";
}
