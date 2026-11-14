// Martian Terrain Topography and Elevation Model

// Mathematical representation of Martian Crater / Canyon topography
export function getElevationAtPoint(missionId, x, y) {
  // Normalized coordinates (0 to 1)
  const nx = x / 800;
  const ny = y / 600;

  if (missionId === 'jezero') {
    // Jezero: Basin floor at (-2560m), Delta fan rising to NW (-2400m to -2350m), Crater rim at (-1800m)
    // Distance from crater center (approx at x: 420, y: 350)
    const dx = (x - 420) / 400;
    const dy = (y - 350) / 300;
    const r = Math.sqrt(dx * dx + dy * dy);

    // Delta fan elevated terrace in upper-right quadrant
    const deltaDist = Math.hypot(nx - 0.55, ny - 0.35);
    const deltaElev = Math.exp(-Math.pow(deltaDist / 0.28, 2)) * 180;

    // Kodiak butte feature
    const kodiakDist = Math.hypot(nx - 0.61, ny - 0.42);
    const kodiakElev = Math.exp(-Math.pow(kodiakDist / 0.05, 2)) * 140;

    // Belva crater depression
    const belvaDist = Math.hypot(nx - 0.52, ny - 0.28);
    const belvaDip = Math.exp(-Math.pow(belvaDist / 0.06, 2)) * -90;

    // Rim steepening with distance
    const rimElev = Math.pow(Math.max(0, r - 0.65) / 0.35, 2.5) * 650;

    // Surface micro-undulation (dunes, ripple fields)
    const ripples = Math.sin(nx * 42) * Math.cos(ny * 36) * 12;

    return Math.round(-2560 + deltaElev + kodiakElev + belvaDip + rimElev + ripples);
  }

  if (missionId === 'gale') {
    // Gale: Northern moat (-4500m), Mount Sharp rising towards south/SE to (-3400m)
    const mtSharpFactor = (1 - ny) * 850 + nx * 400;
    const ridgeDist = Math.hypot(nx - 0.51, ny - 0.6);
    const ridgeElev = Math.exp(-Math.pow(ridgeDist / 0.12, 2)) * 190;
    const dunes = Math.sin(nx * 30 + ny * 20) * 15;
    return Math.round(-4500 + mtSharpFactor + ridgeElev + dunes);
  }

  // Valles Marineris: Steep canyon floor (-6900m) with massive 3000m cliff walls at top and bottom
  const wallDist = Math.min(ny, 1 - ny);
  const wallElev = Math.pow(Math.max(0, 0.4 - wallDist) / 0.4, 2) * 2200;
  const canyonRipples = Math.sin(nx * 20) * 35;
  return Math.round(-6900 + wallElev + canyonRipples);
}

// Compute terrain slope gradient (in degrees) at coordinate (x, y)
export function getSlopeAtPoint(missionId, x, y) {
  const step = 6;
  const eCenter = getElevationAtPoint(missionId, x, y);
  const eRight = getElevationAtPoint(missionId, Math.min(799, x + step), y);
  const eDown = getElevationAtPoint(missionId, x, Math.min(599, y + step));

  // Meter distance per canvas pixel (approx 12.5 meters/pixel in tactical zoom)
  const metersPerPixel = 12.5;
  const dxMeters = step * metersPerPixel;
  const dyMeters = step * metersPerPixel;

  const dzDx = (eRight - eCenter) / dxMeters;
  const dzDy = (eDown - eCenter) / dyMeters;

  const gradient = Math.sqrt(dzDx * dzDx + dzDy * dzDy);
  const angleRad = Math.atan(gradient);
  const angleDeg = (angleRad * 180) / Math.PI;

  return Math.min(45, Math.max(0, Math.round(angleDeg * 10) / 10));
}

// Predefined polygon zones for hazards (boulder fields, steep scarps, sand traps)
export const HAZARD_ZONES = {
  jezero: [
    {
      id: 'haz-1',
      name: 'Kodiak Scarp Cliff Wall',
      type: 'steep-scarp',
      slope: 24.5,
      points: [
        { x: 460, y: 230 }, { x: 515, y: 220 }, { x: 530, y: 270 }, { x: 480, y: 280 }
      ],
      warning: 'Impassable 24° boulder cliff. Astronaut climbing equipment required.'
    },
    {
      id: 'haz-2',
      name: 'Neretva Sand Ripple Trap',
      type: 'dune-field',
      slope: 16.2,
      points: [
        { x: 580, y: 180 }, { x: 660, y: 170 }, { x: 670, y: 240 }, { x: 600, y: 250 }
      ],
      warning: 'Active megaripple fields. High rover wheel entrapment and astronaut boots sinking risk.'
    },
    {
      id: 'haz-3',
      name: 'Belva Impact Ejecta Boulder Field',
      type: 'boulder-roughness',
      slope: 18.0,
      points: [
        { x: 390, y: 150 }, { x: 450, y: 140 }, { x: 460, y: 190 }, { x: 400, y: 200 }
      ],
      warning: 'Dense 2-3 meter basaltic boulders. Low walking trafficability.'
    }
  ],
  gale: [
    {
      id: 'haz-gale-1',
      name: 'Bagnold Dune Field',
      type: 'dune-field',
      slope: 17.5,
      points: [
        { x: 340, y: 400 }, { x: 440, y: 390 }, { x: 450, y: 450 }, { x: 350, y: 460 }
      ],
      warning: 'Active basaltic sand dunes with steep slip faces.'
    }
  ],
  valles: [
    {
      id: 'haz-valles-1',
      name: 'Coprates Chasma North Wall Scarp',
      type: 'steep-scarp',
      slope: 38.0,
      points: [
        { x: 100, y: 80 }, { x: 700, y: 80 }, { x: 700, y: 180 }, { x: 100, y: 180 }
      ],
      warning: 'Near vertical 38° precipice. Fatal falling hazard.'
    }
  ]
};

