// Prova com DADO REAL do leitor de COG (plano 2026-10-11, item 1.7).
//
// Lê o Copernicus GLO-30 direto do AWS Open Data pelo MESMO bundle que vai na
// Edge Function e compara com três fontes que não são o nosso código:
//   - a cota escrita nas curvas de um KML do Contour Map Creator (SRTM via
//     Terrarium) — passe o caminho do KML como 1º argumento;
//   - Open-Meteo (Copernicus GLO-90, a reamostragem de 90 m do mesmo DEM);
//   - OpenTopoData SRTM 30 m.
//
//     node docs/spikes/topografia/medir-copernicus.mjs "C:/Users/.../contours (1).kml"
//
// O que esperar: GLO-30 × GLO-90 próximos (mesmo levantamento, células
// diferentes); × SRTM com diferença sistemática de alguns metros (outro
// satélite, outra época, outro geoide — EGM96 × EGM2008).
import { readFileSync } from 'node:fs';
import { AmostradorCog } from '../../../supabase/functions/topografia-copernicus/cog.bundle.mjs';

const kml = process.argv[2];
let pontos = [];
if (kml) {
  const texto = readFileSync(kml, 'utf8');
  for (const pm of texto.match(/<Placemark[\s\S]*?<\/Placemark>/g) ?? []) {
    const coords = pm.match(/<coordinates>([\s\S]*?)<\/coordinates>/)?.[1].trim().split(/\s+/) ?? [];
    // Um vértice do meio de cada curva.
    const c = coords[Math.floor(coords.length / 2)]?.split(',').map(Number);
    if (c && c.length >= 3) pontos.push({ lat: c[1], lon: c[0], curva: c[2] });
  }
  pontos = pontos.filter((_, i) => i % 3 === 0).slice(0, 15);
} else {
  pontos = [{ lat: -22.6153, lon: -46.0426, curva: null }];
}

let pedidos = 0;
let bytes = 0;
const lerFaixa = async (url, inicio, fim) => {
  pedidos++;
  const r = await fetch(url, { headers: { Range: `bytes=${inicio}-${fim}` } });
  if (r.status === 404 || r.status === 403) return null;
  if (!r.ok) throw new Error(`HTTP ${r.status} em ${url}`);
  const b = new Uint8Array(await r.arrayBuffer());
  bytes += b.length;
  return b;
};

const t0 = performance.now();
const glo30 = await new AmostradorCog(lerFaixa).cotas(pontos);
const ms = performance.now() - t0;

const lat = pontos.map((p) => p.lat.toFixed(6)).join(',');
const lon = pontos.map((p) => p.lon.toFixed(6)).join(',');
const glo90 = (await (await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lon}`)).json()).elevation;
const loc = pontos.map((p) => `${p.lat.toFixed(6)},${p.lon.toFixed(6)}`).join('|');
const srtm = ((await (await fetch(`https://api.opentopodata.org/v1/srtm30m?locations=${loc}&interpolation=bilinear`)).json()).results ?? []).map((r) => r.elevation);

const f = (v) => (v == null ? '   —  ' : v.toFixed(1).padStart(6));
console.log('lat        lon         curva KML  GLO-30  GLO-90  SRTM   | 30−90  30−SRTM');
const d90 = [];
const dS = [];
pontos.forEach((p, i) => {
  const a = glo30[i];
  if (a != null && glo90?.[i] != null) d90.push(a - glo90[i]);
  if (a != null && srtm[i] != null) dS.push(a - srtm[i]);
  console.log(
    `${p.lat.toFixed(5)}  ${p.lon.toFixed(5)}  ${f(p.curva)}    ${f(a)}  ${f(glo90?.[i])}  ${f(srtm[i])} | ${f(a != null && glo90?.[i] != null ? a - glo90[i] : null)}  ${f(a != null && srtm[i] != null ? a - srtm[i] : null)}`,
  );
});
const media = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN);
const absMax = (xs) => (xs.length ? Math.max(...xs.map(Math.abs)) : NaN);
console.log(`\nGLO-30 × GLO-90: média ${media(d90).toFixed(2)} m, |máx| ${absMax(d90).toFixed(2)} m (n=${d90.length})`);
console.log(`GLO-30 × SRTM:   média ${media(dS).toFixed(2)} m, |máx| ${absMax(dS).toFixed(2)} m (n=${dS.length})`);
console.log(`Leitura: ${pedidos} pedidos Range, ${(bytes / 1e6).toFixed(2)} MB, ${ms.toFixed(0)} ms`);
console.log(`Nenhum nulo: ${glo30.every((v) => v != null)}`);
