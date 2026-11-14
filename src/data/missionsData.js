// NASA Missions & Exploration Sites for Marswalk Planning

export const MISSIONS = [
  {
    id: 'jezero',
    name: 'Jezero Crater',
    code: 'ARES-M2020',
    subtitle: 'Perseverance Rover & Western Delta System',
    coordinates: { lat: 18.38, lon: 77.58, elevation: -2530 },
    landingDate: 'Feb 18, 2021',
    activeSol: 1240,
    tempRange: { min: -84, max: -14 }, // Celsius
    pressureAvg: 750, // Pa
    dustTau: 0.42, // Optical depth (low/moderate)
    summary: 'Ancient river delta lake basin. Primary target for astrobiological biosignature detection, carbonate minerals, and sample return cache collection.',
    habSite: {
      name: 'Ares Base Alpha (Octavia Landing)',
      x: 180,
      y: 460,
      lat: 18.375,
      lon: 77.572,
      elevation: -2560
    },
    defaultWaypoints: [
      { id: 'wp-0', name: 'Ares Hab Alpha', x: 180, y: 460, elevation: -2560, type: 'hab' },
      { id: 'wp-1', name: 'Cape Nukshak Ridge', x: 260, y: 390, elevation: -2520, type: 'waypoint' },
      { id: 'wp-2', name: 'Skinner Ridge Mudstones', x: 340, y: 310, elevation: -2470, type: 'science', sampleId: 'TUBE-08' },
      { id: 'wp-3', name: 'Kodiak Mesa Lookout', x: 490, y: 250, elevation: -2410, type: 'checkpoint' },
      { id: 'wp-4', name: 'Neretva Breach Outcrop', x: 620, y: 210, elevation: -2380, type: 'science', sampleId: 'TUBE-12' },
      { id: 'wp-5', name: 'Ares Hab Alpha (Return)', x: 180, y: 460, elevation: -2560, type: 'hab' }
    ],
    roverTraverse: [
      { x: 180, y: 460, sol: 0 },
      { x: 200, y: 440, sol: 120 },
      { x: 235, y: 420, sol: 290 },
      { x: 280, y: 370, sol: 480 },
      { x: 340, y: 310, sol: 710 },
      { x: 430, y: 270, sol: 950 },
      { x: 520, y: 240, sol: 1180 },
      { x: 580, y: 220, sol: 1240 }
    ]
  },
  {
    id: 'gale',
    name: 'Gale Crater',
    code: 'ARES-MSL',
    subtitle: 'Curiosity Rover & Aeolis Mons Traverse',
    coordinates: { lat: -4.59, lon: 137.44, elevation: -4450 },
    landingDate: 'Aug 6, 2012',
    activeSol: 482,
    tempRange: { min: -78, max: -8 },
    pressureAvg: 810,
    dustTau: 0.58,
    summary: '154 km diameter impact crater with 5.5 km central mound (Mt. Sharp) exposing hundreds of layered sedimentary strata detailing the drying of ancient Mars.',
    habSite: {
      name: 'Bradbury Outpost',
      x: 210,
      y: 520,
      lat: -4.592,
      lon: 137.435,
      elevation: -4480
    },
    defaultWaypoints: [
      { id: 'wp-0', name: 'Bradbury Outpost', x: 210, y: 520, elevation: -4480, type: 'hab' },
      { id: 'wp-1', name: 'Yellowknife Bay Lacustrine', x: 290, y: 460, elevation: -4450, type: 'science', sampleId: 'JOHN-KLEIN' },
      { id: 'wp-2', name: 'Vera Rubin Hematite Ridge', x: 410, y: 360, elevation: -4250, type: 'science', sampleId: 'VRR-01' },
      { id: 'wp-3', name: 'Sulfate-Bearing Layer Ascend', x: 560, y: 260, elevation: -3980, type: 'checkpoint' },
      { id: 'wp-4', name: 'Gediz Vallis Debris Flow', x: 670, y: 190, elevation: -3820, type: 'science', sampleId: 'GV-FLOOD' }
    ],
    roverTraverse: [
      { x: 210, y: 520, sol: 0 },
      { x: 260, y: 490, sol: 450 },
      { x: 330, y: 430, sol: 1100 },
      { x: 410, y: 360, sol: 1900 },
      { x: 490, y: 310, sol: 2700 },
      { x: 590, y: 240, sol: 3500 },
      { x: 670, y: 190, sol: 4280 }
    ]
  },
  {
    id: 'valles',
    name: 'Valles Marineris (Coprates)',
    code: 'ARES-EXP-03',
    subtitle: 'Chasma Deep Trench Expedition',
    coordinates: { lat: -14.0, lon: 300.8, elevation: -6800 },
    landingDate: 'Proposed 2038',
    activeSol: 45,
    tempRange: { min: -92, max: -22 },
    pressureAvg: 1040, // Deeper trench = higher atmospheric pressure!
    dustTau: 0.65,
    summary: 'The grand canyon of Mars, plunging 7,000 meters below planetary datum. Features layered bedrock exposing 3 billion years of volcanic and aqueous stratigraphy.',
    habSite: {
      name: 'Coprates Floor Habitat',
      x: 160,
      y: 330,
      lat: -13.92,
      lon: 300.75,
      elevation: -6950
    },
    defaultWaypoints: [
      { id: 'wp-0', name: 'Coprates Floor Base', x: 160, y: 330, elevation: -6900, type: 'hab' },
      { id: 'wp-1', name: 'Layered Sulfate Terrace', x: 310, y: 300, elevation: -6900, type: 'science', sampleId: 'VM-SULF' },
      { id: 'wp-2', name: 'Talus Slope Debris Fan', x: 470, y: 280, elevation: -6900, type: 'waypoint' },
      { id: 'wp-3', name: 'Cliff Wall Fault Exposure', x: 630, y: 262, elevation: -6900, type: 'science', sampleId: 'VM-FAULT' }
    ],
    roverTraverse: [
      { x: 160, y: 330, sol: 1 },
      { x: 230, y: 318, sol: 12 },
      { x: 310, y: 300, sol: 24 },
      { x: 410, y: 288, sol: 38 },
      { x: 500, y: 276, sol: 45 }
    ]
  }
];

