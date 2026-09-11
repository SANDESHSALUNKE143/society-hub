import { Navigate } from "react-router-dom";

/** Legacy route — structure lives under Residents → Flats → Layout. */
export function StructurePage() {
  return <Navigate to="/residents?tab=flats&view=layout" replace />;
}
