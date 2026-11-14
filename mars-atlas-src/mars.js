export const DEM_IDENTIFY =
  "https://trek.nasa.gov/mars/trekarcgis/rest/services/mola128_mola64_merge_90Nto90S_SimpleC_clon0/ImageServer/identify";

const elevationCache = new Map();

export async function getElevation(lat, lon) {
  if (lat == null || lon == null) return null;
  const key = `${lat.toFixed(3)},${lon.toFixed(3)}`;
  if (elevationCache.has(key)) return elevationCache.get(key);

  const url = new URL(DEM_IDENTIFY);
  url.searchParams.set(
    "geometry",
    JSON.stringify({ x: lon, y: lat, spatialReference: { wkid: 104905 } })
  );
  url.searchParams.set("geometryType", "esriGeometryPoint");
  url.searchParams.set("returnGeometry", "false");
  url.searchParams.set("f", "json");

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
    const json = await res.json();
    const value = Number(json.value);
    const result = Number.isFinite(value) ? value : null;
    elevationCache.set(key, result);
    return result;
  } catch {
    elevationCache.set(key, null);
    return null;
  }
}

export function formatElevation(meters) {
  if (meters == null) return "—";
  const km = meters / 1000;
  const sign = km > 0 ? "+" : "";
  return `${sign}${km.toFixed(2)} km`;
}

export function formatCoord(lat, lon) {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(2)}° ${ns}, ${Math.abs(lon).toFixed(2)}° ${ew}`;
}

export function typeLabel(feature) {
  if (!feature) return "";
  if (feature.category === "mission") return "Landing site";
  const t = (feature.type || "").split(",")[0].trim();
  return t || "Feature";
}

// Normalise the IAU feature type into one of our display categories.
export function categorise(type) {
  const t = (type || "").toLowerCase();
  if (t.startsWith("mons") || t.startsWith("tholus") || t.startsWith("patera")) return "volcano";
  if (
    t.startsWith("vallis") ||
    t.startsWith("chasma") ||
    t.startsWith("fossa") ||
    t.startsWith("labyrinthus") ||
    t.startsWith("cavus") ||
    t.startsWith("rupes")
  )
    return "canyon";
  if (t.startsWith("planitia") || t.startsWith("planum") || t.startsWith("palus")) return "basin";
  if (t.startsWith("crater")) return "crater";
  if (t.startsWith("chaos")) return "chaos";
  if (t.startsWith("terra") || t.startsWith("regio") || t.startsWith("mensa")) return "region";
  return "region";
}

export const DISTANCE_TIERS = [
  { km: 1, label: "1 km" },
  { km: 2, label: "2 km" },
  { km: 5, label: "5 km" },
  { km: 10, label: "10 km" },
  { km: 25, label: "25 km" },
  { km: 50, label: "50 km" },
  { km: 100, label: "100 km" },
  { km: 250, label: "250 km" },
  { km: 500, label: "500 km" },
  { km: 1000, label: "1,000 km" },
  { km: 2000, label: "2,000 km" },
  { km: 5000, label: "5,000 km" },
];
