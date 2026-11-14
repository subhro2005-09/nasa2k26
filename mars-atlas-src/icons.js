const S = 64;
const cache = new Map();

function glyph(ctx, kind, color) {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 3.2;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  switch (kind) {
    case "volcano":
      ctx.moveTo(12, 44);
      ctx.lineTo(25, 23);
      ctx.lineTo(30, 23);
      ctx.lineTo(40, 36);
      ctx.lineTo(44, 30);
      ctx.lineTo(52, 44);
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(27, 27);
      ctx.lineTo(33, 27);
      ctx.stroke();
      break;
    case "canyon":
      ctx.moveTo(18, 24);
      ctx.lineTo(30, 32);
      ctx.lineTo(18, 40);
      ctx.moveTo(32, 24);
      ctx.lineTo(44, 32);
      ctx.lineTo(32, 40);
      ctx.stroke();
      break;
    case "basin":
      ctx.arc(32, 32, 15, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(32, 32, 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(32, 32, 2.4, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "crater":
      ctx.arc(32, 32, 15, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(24, 40);
      ctx.quadraticCurveTo(32, 26, 41, 37);
      ctx.stroke();
      break;
    case "polar":
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i - Math.PI / 2;
        const x = 32 + Math.cos(a) * 15;
        const y = 32 + Math.sin(a) * 15;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(32, 32, 4, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "region":
      ctx.moveTo(32, 16);
      ctx.lineTo(48, 32);
      ctx.lineTo(32, 48);
      ctx.lineTo(16, 32);
      ctx.closePath();
      ctx.stroke();
      break;
    case "chaos":
      ctx.strokeRect(18, 18, 12, 12);
      ctx.strokeRect(34, 21, 12, 9);
      ctx.strokeRect(22, 34, 10, 12);
      ctx.strokeRect(36, 36, 10, 10);
      break;
    case "mission":
      ctx.arc(32, 28, 10, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(19, 42);
      ctx.lineTo(32, 50);
      ctx.lineTo(45, 42);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(32, 38);
      ctx.lineTo(32, 50);
      ctx.stroke();
      break;
    default:
      ctx.arc(32, 32, 12, 0, Math.PI * 2);
      ctx.stroke();
  }
}

export function makeIcon(kind, color) {
  const key = `${kind}:${color}`;
  if (cache.has(key)) return cache.get(key);

  const canvas = document.createElement("canvas");
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext("2d");

  const halo = ctx.createRadialGradient(32, 32, 6, 32, 32, 30);
  halo.addColorStop(0, `${color}44`);
  halo.addColorStop(1, `${color}00`);
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, S, S);

  ctx.beginPath();
  ctx.arc(32, 32, 21, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(12, 10, 16, 0.88)";
  ctx.fill();
  ctx.strokeStyle = `${color}aa`;
  ctx.lineWidth = 1.6;
  ctx.stroke();

  glyph(ctx, kind, color);

  const url = canvas.toDataURL("image/png");
  cache.set(key, url);
  return url;
}
