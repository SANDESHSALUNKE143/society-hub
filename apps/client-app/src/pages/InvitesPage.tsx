import { Navigate } from "react-router-dom";

/** Legacy route — pending invitations live on Residents. */
export function InvitesPage() {
  return <Navigate to="/residents?tab=invites" replace />;
}
