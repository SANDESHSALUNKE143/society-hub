import { Navigate, useSearchParams } from "react-router-dom";

/** Legacy route — flats live under Residents → Flats. */
export function FlatsPage() {
  const [params] = useSearchParams();
  const next = new URLSearchParams();
  next.set("tab", "flats");
  const view = params.get("tab") === "layout" ? "layout" : params.get("view");
  if (view === "layout") next.set("view", "layout");
  const occupancy = params.get("occupancy");
  if (occupancy) next.set("occupancy", occupancy);
  const search = params.get("search");
  if (search) next.set("search", search);
  const buildingId = params.get("buildingId");
  if (buildingId) next.set("buildingId", buildingId);
  const qs = next.toString();
  return <Navigate to={`/residents?${qs}`} replace />;
}
