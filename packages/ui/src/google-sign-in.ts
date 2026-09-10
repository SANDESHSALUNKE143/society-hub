export function googleSignInMode(
  clientId: string | undefined,
): "gis" | "dev" {
  return clientId?.trim() ? "gis" : "dev";
}
