import * as Cesium from 'cesium';
import { flyTo, MARS } from './globe.js';
import { publishNav, readNav, subscribeNav } from './navSync.js';

const CHANNEL = 'ares';
const embedded = window.parent && window.parent !== window;

function send(type, payload) {
  if (!embedded) return;
  window.parent.postMessage({ channel: CHANNEL, type, payload }, '*');
}

function hazardMeta(p) {
  if (!p?.hazardName) return null;
  const hot = !!(p.hazard || p.isHazard || p.band === 'hazard');
  const kind = p.hazardCategory === 'canyon' ? 'canyon wall / chasma'
    : p.hazardCategory === 'volcano' ? 'volcanic escarpment'
    : p.hazardCategory === 'chaos' ? 'collapsed chaos terrain'
    : 'mapped hazard terrain';
  return {
    name: p.hazardName,
    category: p.hazardCategory,
    lat: p.lat,
    lon: p.lon,
    level: hot ? 'fail' : 'warn',
    label: hot ? `Hazard: ${p.hazardName}` : `Caution: ${p.hazardName}`,
    detail: hot
      ? `Route transits ${kind} at ${p.hazardName}. Slow the traverse, check slope, and keep a return margin.`
      : `${p.hazardName} lies near this traverse. Expect rough terrain.`
  };
}

function degrees(p) {
  return Cesium.Cartesian3.fromDegrees(p.lon, p.lat, p.height || 8);
}

/**
 * LithoSphere-style Walk / Observe / Home / Locate controls, adapted onto
 * the existing Cesium Mars globe. Standalone atlas visits ignore these messages.
 */
export function attachAresBridge({ viewer }) {
  if (embedded) document.documentElement.classList.add('ares-embedded');
  const dock = document.getElementById('dock');
  const ds = new Cesium.CustomDataSource('ares');
  const routeDs = new Cesium.CustomDataSource('ares-route');
  viewer.dataSources.add(ds);
  viewer.dataSources.add(routeDs);
  const closeDock = () => dock?.classList.remove('open');
  const H = 28000;
  let lastYou = null;
  viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#5a3228');

  function chevronIcon() {
    const c = document.createElement('canvas');
    c.width = 72; c.height = 72;
    const g = c.getContext('2d');
    g.translate(36, 36);
    g.beginPath();
    g.moveTo(0, -26);
    g.lineTo(22, 24);
    g.lineTo(0, 12);
    g.lineTo(-22, 24);
    g.closePath();
    g.fillStyle = '#e4613a';
    g.strokeStyle = '#ffffff';
    g.lineWidth = 4;
    g.fill();
    g.stroke();
    return c.toDataURL();
  }
  const YOU_ICON = chevronIcon();

  const you = ds.entities.add({
    id: 'ares-you',
    name: 'YOU',
    position: degrees({ lat: 18.38, lon: 77.58, height: 12 }),
    billboard: {
      image: YOU_ICON,
      width: 44,
      height: 44,
      alignedAxis: Cesium.Cartesian3.UNIT_Z,
      rotation: new Cesium.CallbackProperty(() => -Cesium.Math.toRadians(lastYou?.heading || 0), false),
      disableDepthTestDistance: Number.POSITIVE_INFINITY
    },
    point: {
      pixelSize: 10,
      color: Cesium.Color.fromCssColorString('#e4613a'),
      outlineColor: Cesium.Color.WHITE,
      outlineWidth: 2,
      disableDepthTestDistance: Number.POSITIVE_INFINITY
    },
    ellipse: {
      semiMajorAxis: 18,
      semiMinorAxis: 18,
      material: Cesium.Color.fromCssColorString('#e4613a').withAlpha(0.28),
      outline: true,
      outlineColor: Cesium.Color.fromCssColorString('#e4613a').withAlpha(0.9),
      height: 8
    },
    label: {
      text: 'YOU',
      font: '700 13px Inter, sans-serif',
      fillColor: Cesium.Color.WHITE,
      showBackground: true,
      backgroundColor: Cesium.Color.fromCssColorString('#0d0a10').withAlpha(0.88),
      pixelOffset: new Cesium.Cartesian2(0, -32),
      disableDepthTestDistance: Number.POSITIVE_INFINITY
    }
  });

  const headingLine = ds.entities.add({
    id: 'ares-heading',
    polyline: {
      positions: [],
      width: 14,
      material: new Cesium.PolylineArrowMaterialProperty(Cesium.Color.fromCssColorString('#f4efe9')),
      clampToGround: false,
      arcType: Cesium.ArcType.NONE
    }
  });
  const headingGlow = ds.entities.add({
    id: 'ares-heading-glow',
    polyline: {
      positions: [],
      width: 6,
      material: Cesium.Color.fromCssColorString('#e4613a').withAlpha(0.55),
      clampToGround: false,
      arcType: Cesium.ArcType.NONE
    }
  });

  const dest = ds.entities.add({
    id: 'ares-dest',
    point: {
      pixelSize: 11,
      color: Cesium.Color.fromCssColorString('#7fc8cc'),
      outlineColor: Cesium.Color.WHITE,
      outlineWidth: 2,
      disableDepthTestDistance: Number.POSITIVE_INFINITY
    },
    label: {
      text: 'DEST',
      font: '600 10px Inter, sans-serif',
      fillColor: Cesium.Color.fromCssColorString('#7fc8cc'),
      showBackground: true,
      backgroundColor: Cesium.Color.fromCssColorString('#0d0a10').withAlpha(0.8),
      pixelOffset: new Cesium.Cartesian2(0, -20),
      disableDepthTestDistance: Number.POSITIVE_INFINITY
    }
  });

  const home = ds.entities.add({
    id: 'ares-home',
    point: {
      pixelSize: 12,
      color: Cesium.Color.fromCssColorString('#6fd6a3'),
      outlineColor: Cesium.Color.WHITE,
      outlineWidth: 2,
      disableDepthTestDistance: Number.POSITIVE_INFINITY
    },
    label: {
      text: 'HAB',
      font: '700 10px Inter, sans-serif',
      fillColor: Cesium.Color.fromCssColorString('#6fd6a3'),
      showBackground: true,
      backgroundColor: Cesium.Color.fromCssColorString('#0d0a10').withAlpha(0.8),
      pixelOffset: new Cesium.Cartesian2(0, -20),
      disableDepthTestDistance: Number.POSITIVE_INFINITY
    }
  });

  const route = ds.entities.add({
    id: 'ares-route',
    show: false,
    polyline: { positions: [], width: 5, material: Cesium.Color.fromCssColorString('#e4613a'), clampToGround: false, arcType: Cesium.ArcType.NONE }
  });
  const returnPath = ds.entities.add({
    id: 'ares-return',
    polyline: {
      positions: [],
      width: 2.4,
      material: new Cesium.PolylineDashMaterialProperty({ color: Cesium.Color.fromCssColorString('#7fc8cc'), dashLength: 14 }),
      clampToGround: false,
      arcType: Cesium.ArcType.NONE
    }
  });
  const envelope = ds.entities.add({
    id: 'ares-envelope',
    polygon: {
      hierarchy: new Cesium.PolygonHierarchy([]),
      material: Cesium.Color.fromCssColorString('#6fd6a3').withAlpha(0.12),
      outline: true,
      outlineColor: Cesium.Color.fromCssColorString('#6fd6a3').withAlpha(0.45)
    }
  });

  const extras = [];
  let cameraMode = 'orbit';
  let lastRoute = [];
  let framed = false;
  let is2D = false;
  let followOn = false;
  let lastPaintKey = '';
  const smooth = { lat: 18.44, lon: 77.45, heading: 0, range: 720 };

  const traveled = ds.entities.add({
    id: 'ares-traveled',
    polyline: {
      positions: [],
      width: 3.5,
      material: Cesium.Color.fromCssColorString('#8a7f90').withAlpha(0.85),
      clampToGround: false,
      arcType: Cesium.ArcType.NONE
    }
  });
  const remaining = ds.entities.add({
    id: 'ares-remaining',
    polyline: {
      positions: [],
      width: 7,
      material: new Cesium.PolylineGlowMaterialProperty({
        glowPower: 0.28,
        taperPower: 0.85,
        color: Cesium.Color.fromCssColorString('#7fc8cc')
      }),
      clampToGround: false,
      arcType: Cesium.ArcType.NONE
    }
  });
  const nextHz = ds.entities.add({
    id: 'ares-next-hazard',
    show: false,
    position: degrees({ lat: 18.44, lon: 77.45, height: H + 200 }),
    point: {
      pixelSize: 16,
      color: Cesium.Color.fromCssColorString('#ff6b6b'),
      outlineColor: Cesium.Color.WHITE,
      outlineWidth: 2,
      disableDepthTestDistance: Number.POSITIVE_INFINITY
    },
    label: {
      text: 'HAZARD',
      font: '700 11px Inter, sans-serif',
      fillColor: Cesium.Color.fromCssColorString('#ffd0d0'),
      showBackground: true,
      backgroundColor: Cesium.Color.fromCssColorString('#2a1010').withAlpha(0.9),
      pixelOffset: new Cesium.Cartesian2(0, -22),
      disableDepthTestDistance: Number.POSITIVE_INFINITY
    }
  });

  const BAND_COLOR = {
    safe: '#6fd6a3',
    caution: '#e8a53d',
    hazard: '#ff6b6b'
  };

  function surfaceHeight(lon, lat, extra = 18) {
    const carto = Cesium.Cartographic.fromDegrees(lon, lat);
    const sampled = viewer.scene.globe.getHeight(carto);
    return (Number.isFinite(sampled) ? sampled : 0) + extra;
  }

  function cartAt(lat, lon, extra = 16) {
    return Cesium.Cartesian3.fromDegrees(lon, lat, surfaceHeight(lon, lat, extra));
  }

  let cachedCarts = [];
  let chevronBucket = -1;

  function linePositions(pts, extra) {
    if (!pts?.length) return [];
    const off = extra ?? (followOn ? 14 : 22);
    return pts
      .filter((p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lon))
      .map((p) => Cesium.Cartesian3.fromDegrees(p.lon, p.lat, surfaceHeight(p.lon, p.lat, off)));
  }

  function cacheRouteCarts(pts) {
    cachedCarts = linePositions(pts, followOn ? 14 : 22);
  }

  function offset(lat, lon, heading, meters) {
    const rad = (heading * Math.PI) / 180;
    const dLat = (Math.cos(rad) * meters) / 111320;
    const dLon = (Math.sin(rad) * meters) / (111320 * Math.cos((lat * Math.PI) / 180));
    return { lat: lat + dLat, lon: lon + dLon };
  }

  function altPoints(alt) {
    if (!alt) return [];
    return Array.isArray(alt) ? alt : (alt.points || []);
  }

  function routeKey(s) {
    const pts = s?.route || s || [];
    if (!pts.length && !s?.routeMode) return '';
    const altSig = (id) => {
      const a = s?.alts?.[id];
      const p = altPoints(a);
      return `${p.length}:${a?.km ?? ''}:${a?.min ?? ''}`;
    };
    if (s?.route) {
      const a = s.route[0], b = s.route[s.route.length - 1];
      return `${s.routeMode}:${s.route.length}:${a?.lat}:${b?.lat}:${altSig('safe')}:${altSig('direct')}:${altSig('science')}:${s.proposed?.length || 0}:${s.blocked?.length || 0}`;
    }
    const a = pts[0], b = pts[pts.length - 1];
    return `${pts.length}:${a?.lat}:${a?.lon}:${b?.lat}:${b?.lon}`;
  }

  const chevrons = [];
  function paintChevrons(pts) {
    chevrons.forEach((e) => { try { ds.entities.remove(e); } catch { /* empty */ } });
    chevrons.length = 0;
    if (!pts || pts.length < 3) return;
    const step = Math.max(3, Math.floor(pts.length / 9));
    for (let i = 0; i < pts.length - 2 && chevrons.length < 10; i += step) {
      const a = pts[i], b = pts[Math.min(pts.length - 1, i + 2)];
      chevrons.push(ds.entities.add({
        polyline: {
          positions: linePositions([a, b]),
          width: followOn ? 12 : 9,
          material: new Cesium.PolylineArrowMaterialProperty(Cesium.Color.fromCssColorString('#f4efe9')),
          clampToGround: false,
          arcType: Cesium.ArcType.NONE
        }
      }));
    }
  }

  function splitProgress(progress) {
    if (!lastRoute.length) {
      traveled.polyline.positions = [];
      remaining.polyline.positions = [];
      paintChevrons([]);
      chevronBucket = -1;
      return;
    }
    if (cachedCarts.length !== lastRoute.length) cacheRouteCarts(lastRoute);
    const cut = Math.max(1, Math.min(cachedCarts.length - 1, Math.round((progress || 0) * (cachedCarts.length - 1))));
    traveled.polyline.positions = cachedCarts.slice(0, cut + 1);
    remaining.polyline.positions = cachedCarts.slice(Math.max(0, cut - 1));
    const bucket = Math.floor((progress || 0) * 10);
    if (bucket !== chevronBucket) {
      chevronBucket = bucket;
      paintChevrons(lastRoute.slice(Math.max(0, cut - 1)));
    }
  }

  function setFollow(on) {
    if (followOn === on) return;
    followOn = on;
    if (on) {
      try { viewer.camera.cancelFlight(); } catch { /* empty */ }
      viewer.scene.screenSpaceCameraController.enableRotate = false;
      viewer.scene.screenSpaceCameraController.enableTranslate = false;
      viewer.scene.screenSpaceCameraController.enableZoom = false;
      viewer.scene.screenSpaceCameraController.minimumZoomDistance = 10;
      if (lastYou) {
        smooth.lat = lastYou.lat;
        smooth.lon = lastYou.lon;
        smooth.heading = lastYou.heading || 0;
      }
      if (lastRoute.length) cacheRouteCarts(lastRoute);
    } else {
      viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
      viewer.scene.screenSpaceCameraController.enableRotate = true;
      viewer.scene.screenSpaceCameraController.enableTranslate = true;
      viewer.scene.screenSpaceCameraController.enableZoom = true;
    }
  }

  function followCamera() {
    if (!followOn || !lastYou) return;
    const chase = lastYou.cameraMode !== 'orbit';
    const a = 0.28;
    const look = offset(lastYou.lat, lastYou.lon, lastYou.heading || 0, chase ? 28 : 6);
    smooth.lat += (look.lat - smooth.lat) * a;
    smooth.lon += (look.lon - smooth.lon) * a;
    let dh = (lastYou.heading || 0) - smooth.heading;
    while (dh > 180) dh -= 360;
    while (dh < -180) dh += 360;
    smooth.heading += dh * a;
    const wantRange = chase
      ? Math.min(340, Math.max(130, (lastYou.remainingKm || 0.3) * 70 + 150))
      : Math.min(480, Math.max(200, (lastYou.remainingKm || 0.3) * 90 + 180));
    smooth.range += (wantRange - smooth.range) * 0.18;
    const target = cartAt(smooth.lat, smooth.lon, 10);
    viewer.camera.lookAt(
      target,
      new Cesium.HeadingPitchRange(
        Cesium.Math.toRadians(smooth.heading),
        Cesium.Math.toRadians(chase ? -26 : -58),
        smooth.range
      )
    );
  }

  viewer.scene.preRender.addEventListener(followCamera);

  function applyYou(youState) {
    if (!youState) return;
    lastYou = youState;
    if (youState.cameraMode) cameraMode = youState.cameraMode;
    const longHaul = !!(youState.planetary && (youState.remainingKm || 0) > 12);
    setFollow(!!youState.following && !longHaul);
    if (followOn) {
      try { viewer.camera.cancelFlight(); } catch { /* empty */ }
    }
    const carto = Cesium.Cartographic.fromDegrees(youState.lon, youState.lat);
    const sampled = viewer.scene.globe.getHeight(carto);
    const alt = (Number.isFinite(sampled) ? sampled : 0) + 16;
    const pos = Cesium.Cartesian3.fromDegrees(youState.lon, youState.lat, alt);
    you.position = pos;
    const near = offset(youState.lat, youState.lon, youState.heading || 0, 12);
    const tip = offset(youState.lat, youState.lon, youState.heading || 0, followOn ? 55 : 90);
    const glowTip = offset(youState.lat, youState.lon, youState.heading || 0, followOn ? 32 : 55);
    headingLine.polyline.positions = [
      Cesium.Cartesian3.fromDegrees(near.lon, near.lat, alt),
      Cesium.Cartesian3.fromDegrees(tip.lon, tip.lat, surfaceHeight(tip.lon, tip.lat, 16))
    ];
    headingGlow.polyline.positions = [
      Cesium.Cartesian3.fromDegrees(youState.lon, youState.lat, alt),
      Cesium.Cartesian3.fromDegrees(glowTip.lon, glowTip.lat, surfaceHeight(glowTip.lon, glowTip.lat, 16))
    ];
    if (youState.progress != null) splitProgress(youState.progress);
    if (youState.upcoming?.lat != null && youState.upcoming?.lon != null) {
      nextHz.show = true;
      nextHz.position = Cesium.Cartesian3.fromDegrees(youState.upcoming.lon, youState.upcoming.lat, H + 240);
      nextHz.label.text = `${youState.upcoming.name || 'Hazard'} · ${youState.upcoming.meters} m`;
    } else nextHz.show = false;
  }

  function addLine(pts, color, width, glow, meta, planetary) {
    if (!pts || pts.length < 2) return;
    const positions = linePositions(pts);
    if (positions.length < 2) return;
    const local = !planetary || pts.length > 6;
    const ent = routeDs.entities.add({
      polyline: {
        positions,
        width,
        material: glow
          ? new Cesium.PolylineGlowMaterialProperty({ glowPower: 0.22, taperPower: 0.8, color: Cesium.Color.fromCssColorString(color) })
          : Cesium.Color.fromCssColorString(color).withAlpha(0.85),
        clampToGround: false,
        arcType: local ? Cesium.ArcType.NONE : Cesium.ArcType.GEODESIC,
        depthFailMaterial: Cesium.Color.fromCssColorString(color).withAlpha(0.35)
      }
    });
    if (meta) ent.aresHazard = meta;
    return ent;
  }

  const MODE_COL = { safe: '#6fd6a3', direct: '#5b9cff', science: '#c084fc' };
  const MODE_NAME = { safe: 'Safest', direct: 'Fastest', science: 'Science' };

  function addRouteLabel(pts, text, color) {
    const mid = pts[Math.max(1, Math.floor(pts.length * 0.42))];
    if (!mid || mid.lat == null || mid.lon == null) return;
    routeDs.entities.add({
      position: cartAt(mid.lat, mid.lon, 48),
      point: {
        pixelSize: 9,
        color: Cesium.Color.fromCssColorString(color),
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 1.5,
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      },
      label: {
        text,
        font: 'bold 12px sans-serif',
        fillColor: Cesium.Color.fromCssColorString('#f4efe9'),
        outlineColor: Cesium.Color.fromCssColorString('#120e16'),
        outlineWidth: 4,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        showBackground: true,
        backgroundColor: Cesium.Color.fromCssColorString('#15121ad9'),
        backgroundPadding: new Cesium.Cartesian2(8, 5),
        pixelOffset: new Cesium.Cartesian2(0, -18),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        scaleByDistance: new Cesium.NearFarScalar(1.5e3, 1.05, 9e6, 0.5)
      }
    });
  }

  function formatAltLabel(id, alt) {
    const km = Number(alt.km);
    const mins = Math.max(0, Math.round(Number(alt.min) || 0));
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    const time = h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m} min`;
    const kmTxt = Number.isFinite(km) ? `${km.toFixed(2)} km` : '—';
    return `${MODE_NAME[id] || id}\n${kmTxt} · ${time}`;
  }

  function paintRoute(pts, s = {}) {
    routeDs.entities.removeAll();
    route.show = false;
    route.polyline.positions = [];
    if (!pts?.length) return;
    const planetary = !!s.planetary;
    if (s.alts) {
      ['safe', 'direct', 'science'].forEach((id) => {
        const alt = s.alts[id];
        const ap = altPoints(alt);
        if (ap.length < 2) return;
        const selected = id === s.routeMode;
        addLine(ap, MODE_COL[id], selected ? 5.5 : 4.4, false, null, planetary);
        if (alt && !Array.isArray(alt) && alt.km != null) addRouteLabel(ap, formatAltLabel(id, alt), MODE_COL[id]);
      });
    }
    addLine(pts, '#1a0c0a', 16, false, null, planetary);
    addLine(pts, MODE_COL[s.routeMode] || '#e4613a', 8, true, null, planetary);
    pts.forEach((p) => {
      if (!p.turn || p.lat == null) return;
      routeDs.entities.add({
        position: cartAt(p.lat, p.lon, 20),
        point: {
          pixelSize: 11,
          color: Cesium.Color.fromCssColorString('#f4efe9'),
          outlineColor: Cesium.Color.fromCssColorString('#1a0c0a'),
          outlineWidth: 2,
          disableDepthTestDistance: Number.POSITIVE_INFINITY
        }
      });
    });
    if (s.proposed?.length > 1) addLine(s.proposed, '#6fd6a3', 5.5, true, null, planetary);
    if (s.blocked?.length > 1) addLine(s.blocked, '#ff6b6b', 12, true, null, planetary);
    let run = [pts[0]];
    let band = pts[0].band || (pts[0].hazard ? 'hazard' : 'safe');
    const flush = () => {
      if (run.length < 2) return;
      const meta = (band === 'hazard' || band === 'caution') ? hazardMeta(run.find((p) => p.hazardName) || run[0]) : null;
      addLine(run, BAND_COLOR[band] || BAND_COLOR.safe, band === 'hazard' ? 10 : 5.5, band === 'hazard', meta, planetary);
      if (meta) {
        const pick = routeDs.entities.add({
          polyline: {
            positions: linePositions(run),
            width: 22,
            material: Cesium.Color.fromCssColorString(BAND_COLOR[band] || '#ff6b6b').withAlpha(0.12),
            clampToGround: false,
            arcType: Cesium.ArcType.GEODESIC
          }
        });
        pick.aresHazard = meta;
      }
    };
    for (let i = 1; i < pts.length; i++) {
      const next = pts[i].band || (pts[i].hazard ? 'hazard' : 'safe');
      if (next !== band) {
        run.push(pts[i]);
        flush();
        run = [pts[i]];
        band = next;
      } else run.push(pts[i]);
    }
    flush();
  }

  function flyRoute(pts) {
    if (!pts?.length || followOn) return;
    if (embedded) closeDock();
    const valid = pts.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
    if (valid.length < 2) return;
    const lats = valid.map((p) => p.lat);
    const lons = valid.map((p) => {
      let lon = p.lon;
      const d = lon - valid[0].lon;
      if (d > 180) lon -= 360;
      if (d < -180) lon += 360;
      return lon;
    });
    const mid = { lat: (Math.min(...lats) + Math.max(...lats)) / 2, lon: (Math.min(...lons) + Math.max(...lons)) / 2 };
    const kmLat = (Math.max(...lats) - Math.min(...lats)) * 111.2;
    const kmLon = (Math.max(...lons) - Math.min(...lons)) * 111.2 * Math.max(0.2, Math.cos((mid.lat * Math.PI) / 180));
    const a = valid[0], b = valid[valid.length - 1];
    const dLat = ((a.lat - b.lat) * Math.PI) / 180;
    const dLon = ((b.lon - a.lon) * Math.PI) / 180;
    const hav = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
    const chordKm = 2 * 3389.5 * Math.asin(Math.min(1, Math.sqrt(hav)));
    const km = Math.max(chordKm, Math.hypot(kmLat, kmLon), 0.5);
    const local = km < 25;
    flyTo(viewer, mid.lat, ((mid.lon + 540) % 360) - 180, local ? Math.max(km * 1.7, 1.8) : Math.max(km * 0.72, is2D ? km * 0.9 : 90), 1.6);
  }

  function applyState(s) {
    if (!s) return;
    cameraMode = s.cameraMode || 'orbit';
    const tracking = !!s.following && !(s.planetary && (s.remainingKm || 0) > 12);
    viewer.scene.screenSpaceCameraController.minimumZoomDistance = tracking || cameraMode === 'astronaut' ? 10 : 1200;
    applyYou({ ...(s.astronaut || {}), following: s.following, progress: s.progress, remainingKm: s.remainingKm, planetary: s.planetary, upcoming: s.upcoming, cameraMode });
    if (s.home) {
      home.position = cartAt(s.home.lat, s.home.lon, 16);
      home.show = true;
    }
    if (s.destination) {
      dest.position = cartAt(s.destination.lat, s.destination.lon, 18);
      dest.label.text = (s.destination.name || 'DEST').slice(0, 18);
      dest.show = true;
    } else dest.show = false;

    const routed = (s.route || []).slice();
    if (routed.length > 1 && s.destination?.lat != null && s.destination?.lon != null) {
      routed[routed.length - 1] = { ...routed[routed.length - 1], lat: s.destination.lat, lon: s.destination.lon };
    }
    lastRoute = routed;
    if (routed.length) cacheRouteCarts(routed);
    const nextKey = routeKey(s);
    const retPts = s.following ? [] : linePositions(s.returnRoute || []);
    returnPath.polyline.positions = retPts;
    returnPath.polyline.clampToGround = false;
    returnPath.show = retPts.length > 1 && !s.following;
    const env = s.envelope || [];
    if (env.length > 3 && !s.following) {
      envelope.polygon.hierarchy = new Cesium.PolygonHierarchy(linePositions(env));
      envelope.show = true;
    } else envelope.show = false;

    const shouldPaint = nextKey !== lastPaintKey;
    if (shouldPaint) {
      extras.forEach((e) => ds.entities.remove(e));
      extras.length = 0;
      paintRoute(lastRoute, s);
      lastPaintKey = nextKey;
    }
    splitProgress(s.progress || 0);
    if (shouldPaint) {
      const labeled = new Set();
      lastRoute.forEach((p) => {
        if (!p.hazardName || labeled.has(p.hazardName)) return;
        if (!p.hazard && p.band === 'safe') return;
        labeled.add(p.hazardName);
        const hot = p.hazard || p.band === 'hazard';
        const meta = hazardMeta(p);
        const mark = routeDs.entities.add({
          position: Cesium.Cartesian3.fromDegrees(p.lon, p.lat, H + 400),
          ellipse: {
            semiMajorAxis: hot ? 160000 : 90000,
            semiMinorAxis: hot ? 160000 : 90000,
            material: Cesium.Color.fromCssColorString(hot ? '#ff6b6b' : '#e8a53d').withAlpha(0.22),
            outline: true,
            outlineColor: Cesium.Color.fromCssColorString(hot ? '#ff6b6b' : '#e8a53d').withAlpha(0.85),
            height: H
          },
          point: {
            pixelSize: hot ? 18 : 14,
            color: Cesium.Color.fromCssColorString(hot ? '#ff6b6b' : '#e8a53d'),
            outlineColor: Cesium.Color.WHITE,
            outlineWidth: 2,
            disableDepthTestDistance: Number.POSITIVE_INFINITY
          },
          label: {
            text: `${hot ? '⚠ ' : ''}${p.hazardName}`,
            font: '700 12px Inter, sans-serif',
            fillColor: Cesium.Color.fromCssColorString(hot ? '#ffd0d0' : '#ffe3b0'),
            showBackground: true,
            backgroundColor: Cesium.Color.fromCssColorString(hot ? '#2a1010' : '#24180a').withAlpha(0.88),
            pixelOffset: new Cesium.Cartesian2(0, -22),
            disableDepthTestDistance: Number.POSITIVE_INFINITY
          }
        });
        mark.aresHazard = meta;
      });
      if (!s.planetary) {
        (s.hazards || []).forEach((h) => {
          extras.push(ds.entities.add({
            position: Cesium.Cartesian3.fromDegrees(h.lon, h.lat, H),
            ellipse: {
              semiMajorAxis: h.rMeters || 80,
              semiMinorAxis: h.rMeters || 80,
              material: Cesium.Color.fromCssColorString('#ff6b6b').withAlpha(0.28),
              outline: true,
              outlineColor: Cesium.Color.fromCssColorString('#ff6b6b')
            }
          }));
        });
        (s.pois || []).forEach((p) => {
          extras.push(ds.entities.add({
            position: Cesium.Cartesian3.fromDegrees(p.lon, p.lat, H),
            point: { pixelSize: 8, color: Cesium.Color.fromCssColorString('#7fc8cc'), outlineColor: Cesium.Color.WHITE, outlineWidth: 1, disableDepthTestDistance: Number.POSITIVE_INFINITY },
            label: { text: p.name, font: '600 10px Inter, sans-serif', fillColor: Cesium.Color.fromCssColorString('#cfe9ea'), pixelOffset: new Cesium.Cartesian2(0, -16), disableDepthTestDistance: Number.POSITIVE_INFINITY, show: cameraMode === 'orbit' }
          }));
        });
      }
    }

    if (lastRoute.length > 1 && shouldPaint && !followOn && !s.following) {
      framed = true;
      closeDock();
      flyRoute(lastRoute);
    } else if (!framed && s.astronaut && !followOn) {
      framed = true;
      flyTo(viewer, s.astronaut.lat, s.astronaut.lon, 6, 2.4);
    }
  }

  let readyTick = null;
  if (embedded) readyTick = setInterval(() => send('ares:ready', {}), 400);

  window.addEventListener('message', (event) => {
    const data = event.data;
    if (!data || data.channel !== CHANNEL) return;
    if (data.type === 'ares:state') {
      if (readyTick) clearInterval(readyTick);
      applyState(data.payload);
    }
    if (data.type === 'ares:you') applyYou(data.payload);
    if (data.type === 'ares:locate' && lastYou) {
      if (followOn) return;
      flyTo(viewer, lastYou.lat, lastYou.lon, 4, 1.4);
    }
    if (data.type === 'ares:home' && lastYou && !followOn) flyTo(viewer, lastYou.lat, lastYou.lon, 8, 1.6);
    if (data.type === 'ares:fit' && !followOn) flyRoute(lastRoute);
    if (data.type === 'ares:morph') {
      const want2D = !!data.payload?.flat;
      if (want2D !== is2D) {
        is2D = want2D;
        if (is2D) viewer.scene.morphTo2D(1.2);
        else viewer.scene.morphTo3D(1.2);
      }
      if (lastRoute.length > 1) setTimeout(() => flyRoute(lastRoute), 1300);
    }
  });

  function atlasToast(h) {
    document.querySelectorAll('.toast.toast-hazard').forEach((n) => n.remove());
    const el = document.createElement('div');
    el.className = 'toast toast-hazard';
    el.setAttribute('role', 'alert');
    el.innerHTML = `<strong>${h.label}</strong><span>${h.detail || ''}</span>`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 5200);
  }

  function showAtlasAlert(h) {
    const card = document.getElementById('ares-alert');
    if (card) {
      card.hidden = false;
      card.classList.toggle('fail', h.level === 'fail');
      const title = card.querySelector('.ares-alert-title');
      const body = card.querySelector('.ares-alert-body');
      if (title) title.textContent = h.label;
      if (body) body.textContent = h.detail || '';
    }
    atlasToast(h);
  }

  function raiseHazard(h) {
    if (!h) return true;
    showAtlasAlert(h);
    send('ares:hazard', h);
    return true;
  }

  window.__aresPick = (click) => {
    const picked = viewer.scene.pick(click.position);
    const ent = picked && (picked.id || picked.primitive?.id);
    if (ent?.aresHazard) return raiseHazard(ent.aresHazard);
    return false;
  };

  window.__aresClick = (click, cartesian) => {
    if (window.__aresPick(click)) return true;
    if (!cartesian || !embedded) return false;
    const carto = Cesium.Cartographic.fromCartesian(cartesian, MARS);
    send('ares:click', {
      lat: Cesium.Math.toDegrees(carto.latitude),
      lon: Cesium.Math.toDegrees(carto.longitude)
    });
    return false;
  };

  window.__aresApplyRoute = (s, { publish = false } = {}) => {
    applyState(s);
    if (publish) publishNav(s);
  };

  subscribeNav((s) => {
    if (s?.route?.length) applyState(s);
  });
  const stored = readNav();
  if (stored?.route?.length) applyState(stored);

  document.getElementById('ares-alert-dismiss')?.addEventListener('click', () => {
    const card = document.getElementById('ares-alert');
    if (card) card.hidden = true;
  });

  if (embedded) {
    send('ares:ready', {});
  }
  return { embedded, ds };
}
