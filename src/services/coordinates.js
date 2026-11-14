// Coordinate Transformations: Canvas (x, y) to Martian Aerocentric (Lat, Lon, Elevation)

export function canvasToMarsCoords(mission, x, y) {
  const { coordinates } = mission;
  // Span across our tactical 800x600 map grid
  // Width: approx 0.08 degrees lon (~4.7 km at 18° latitude)
  // Height: approx 0.06 degrees lat (~3.5 km)
  const lonSpan = 0.08;
  const latSpan = 0.06;

  const minLon = coordinates.lon - lonSpan / 2;
  const maxLat = coordinates.lat + latSpan / 2;

  const lon = minLon + (x / 800) * lonSpan;
  const lat = maxLat - (y / 600) * latSpan;

  return {
    lat,
    lon,
    latStr: `${Math.abs(lat).toFixed(5)}° ${lat >= 0 ? 'N' : 'S'}`,
    lonStr: `${Math.abs(lon).toFixed(5)}° ${lon >= 0 ? 'E' : 'W'}`
  };
}

export function marsToCanvasCoords(mission, lat, lon) {
  const { coordinates } = mission;
  const lonSpan = 0.08;
  const latSpan = 0.06;

  const minLon = coordinates.lon - lonSpan / 2;
  const maxLat = coordinates.lat + latSpan / 2;

  const x = ((lon - minLon) / lonSpan) * 800;
  const y = ((maxLat - lat) / latSpan) * 600;

  return { x: Math.round(x), y: Math.round(y) };
}

// Convert distance in canvas pixels to Martian meters / kilometers
// Scale: 800 px = ~4,700 meters (approx 5.875 meters per pixel)
export const METERS_PER_PIXEL = 5.875;

export function pixelsToMeters(pixels) {
  return pixels * METERS_PER_PIXEL;
}

export function pixelsToKm(pixels) {
  return (pixels * METERS_PER_PIXEL) / 1000;
}

