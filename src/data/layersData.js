// NASA Science Mission Layers & GIS Visualizers

export const SCIENCE_LAYERS = [
  {
    id: 'viking',
    name: 'Viking MDIM 2.1 Basemap',
    mission: 'Viking Orbiter 1 & 2 (NASA JPL)',
    type: 'basemap',
    resolution: '232 m/pixel',
    spectralBand: 'True-Color Visible (RGB)',
    description: 'Orthorectified true-color surface albedo composite covering the Martian global surface.',
    defaultActive: true,
    opacity: 0.9,
    blendMode: 'normal',
    tileEndpoint: 'https://trek.nasa.gov/tiles/Mars/EQ/Mars_Viking_MDIM21_ClrMosaic_global_232m/1.0.0/default/default028mm'
  },
  {
    id: 'mola',
    name: 'MOLA Topographic Relief',
    mission: 'Mars Global Surveyor (MGS / NASA GSFC)',
    type: 'elevation',
    resolution: '463 m/pixel',
    spectralBand: 'Laser Altimetry (1064 nm Nd:YAG)',
    description: 'Digital Elevation Model (DEM) false-color gradient mapping absolute surface altitude relative to the Martian Datum (aeroid).',
    defaultActive: true,
    opacity: 0.65,
    blendMode: 'screen',
    colorScale: [
      { elevation: -3000, color: '#313695', label: 'Basin Floor (-3000m)' },
      { elevation: -2600, color: '#4575b4', label: 'Delta Plain (-2600m)' },
      { elevation: -2400, color: '#74add1', label: 'Lower Terraces (-2400m)' },
      { elevation: -2200, color: '#fee090', label: 'Upper Terraces (-2200m)' },
      { elevation: -1800, color: '#f46d43', label: 'Crater Rim (-1800m)' },
      { elevation: -1200, color: '#a50026', label: 'Highland Massif (-1200m)' }
    ]
  },
  {
    id: 'ctx',
    name: 'MRO CTX / HiRISE High-Res',
    mission: 'Mars Reconnaissance Orbiter (MRO / Malin & UArizona)',
    type: 'highres',
    resolution: '6.0 m/px (CTX) & 0.25 m/px (HiRISE)',
    spectralBand: 'Panchromatic (500–800 nm)',
    description: 'Ultra-high-definition orbital imaging resolving meter-scale boulders, sand ripples, impact fissures, and bedrock stratification.',
    defaultActive: false,
    opacity: 0.8,
    blendMode: 'overlay'
  },
  {
    id: 'slopes',
    name: 'Slope & Trafficability Hazards',
    mission: 'MOLA / HiRISE Derived Safety Engine',
    type: 'hazard',
    resolution: 'Derived 5m grid',
    spectralBand: 'Gradient Vector Field (Degrees)',
    description: 'Identifies slope inclines critical for EVA Marswalk and rover safety. >15° poses extreme slippage and roll-over risks for astronauts.',
    defaultActive: true,
    opacity: 0.7,
    blendMode: 'source-over',
    legend: [
      { range: '< 5°', color: '#00e676', label: 'Nominal EVA Walking Terrain' },
      { range: '5° – 15°', color: '#ffab00', label: 'Moderate Incline (High O2 Exertion)' },
      { range: '> 15°', color: '#ff1744', label: 'Critical Hazard (Slip / Rollover Danger)' }
    ]
  },
  {
    id: 'crism',
    name: 'CRISM Spectral Mineralogy',
    mission: 'Mars Reconnaissance Orbiter (CRISM / JHU APL)',
    type: 'mineralogy',
    resolution: '18 m/pixel',
    spectralBand: 'VNIR & IR (362 to 3920 nm)',
    description: 'Identifies aqueous mineral signatures including smectite clays, magnesium-iron carbonates, and olivine-bearing bedrock indicative of past habitable water.',
    defaultActive: true,
    opacity: 0.75,
    blendMode: 'color-dodge',
    minerals: [
      { name: 'Mg/Fe Carbonates', color: '#ffd54f', formula: '(Mg,Fe)CO3', bioSignificance: 'Aqueous precipitate; captures ancient Martian atmosphere and biosignatures' },
      { name: 'Fe/Mg Phyllosilicates (Clays)', color: '#00e5ff', formula: 'Smectites', bioSignificance: 'Formed in benign neutral pH water; excellent organic preservation' },
      { name: 'Olivine-rich Cumulate', color: '#69f0ae', formula: '(Mg,Fe)2SiO4', bioSignificance: 'Igneous basement rock providing radiometric age constraint of crater' },
      { name: 'Hydrated Silica / Chert', color: '#e040fb', formula: 'SiO2·nH2O', bioSignificance: 'Microbial bio-encapsulation analog to Earth Archean fossils' }
    ]
  },
  {
    id: 'waterIce',
    name: 'Subsurface Water-Ice Indicators',
    mission: 'MRO SHARAD Radar & Mars Odyssey GRS',
    type: 'resources',
    resolution: '100m radar swath',
    spectralBand: 'High Frequency Radar (15–25 MHz)',
    description: 'Dielectric permittivity anomalies indicating shallow subsurface ice deposits suitable for In-Situ Resource Utilization (ISRU) drinking water and rocket fuel propellant.',
    defaultActive: false,
    opacity: 0.7,
    blendMode: 'screen',
    color: '#00b0ff'
  },
  {
    id: 'roverTrack',
    name: 'NASA Rover Traverse History',
    mission: 'Perseverance (M2020) & Curiosity (MSL)',
    type: 'telemetry',
    resolution: 'Decimeter rover odometry',
    spectralBand: 'Hazcam / Navcam / DSN Telemetry',
    description: 'Actual drive path traveled on the surface, including sol stops, drill sample core extraction points, and scientific investigation waypoints.',
    defaultActive: true,
    opacity: 1.0,
    color: '#ff9100'
  }
];

