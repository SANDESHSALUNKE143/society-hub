import { Navigate } from "react-router-dom";

/** Legacy route — Add resident lives on Residents. */
export function OnboardPage() {
  return <Navigate to="/residents?add=1" replace />;
}
