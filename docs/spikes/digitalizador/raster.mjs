/**
 * Spike C — rodada 4: braço CLÁSSICO sobre planta raster.
 *
 * A prancha A0 das rodadas 1–3 era PDF vetorial: dava para ler espessura de
 * traço direto do arquivo. Esta é WebP puro, 1070×1280 — não há vetor nenhum,
 * e é o caso que o PRD chama de "scan/foto" e que seguia sem teste.
 *
 * Sem API e sem modelo treinado: só limiar, componente conexo e preenchimento.
 * O objetivo não é acertar tudo — é medir onde o clássico para, para saber o que
 * sobra para o multimodal fazer.
 *
 *   node docs/spikes/digitalizador/raster.mjs "caminho/da/planta.webp" [limiar]
 */
import sharp from 'sharp';
import { createRequire } from 'node:module';

const caminho = process.argv[2];
const LIMIAR = Number(process.argv[3] ?? 128);
/**
 * Raio da ABERTURA morfologica (erosao seguida de dilatacao), em pixels.
 *
 * E o que separa parede de mobilia sem precisar saber o que e cada coisa: a
 * parede tem ~17 px de espessura nesta escala e sobrevive a erosao; o traco de
 * sofa, cama e bancada tem 2-3 px e desaparece. Dilatar de volta devolve a
 * parede a espessura original, entao a area do comodo nao fica inflada.
 *
 * Sem isso o limiar vira dilema: baixo demais a porta vaza, alto demais a
 * mobilia fragmenta o comodo. A abertura resolve os dois de uma vez.
 */
const ABERTURA = Number(process.argv[4] ?? 0);

const { data, info } = await sharp(caminho)
  .greyscale()
  .raw()
  .toBuffer({ resolveWithObject: true });

const W = info.width;
const H = info.height;

// ── Binarizar ───────────────────────────────────────────────────────────────
// Escuro = traço. Numa planta o fundo é branco e tudo que importa é escuro.
const escuro = new Uint8Array(W * H);
let nEscuro = 0;
for (let i = 0; i < W * H; i++) {
  if (data[i] < LIMIAR) { escuro[i] = 1; nEscuro++; }
}

// ── Abertura morfologica ────────────────────────────────────────────────────
if (ABERTURA > 0) {
  const r = ABERTURA;
  const erodido = new Uint8Array(W * H);
  // Erosao: so continua escuro quem tem escuro em toda a vizinhanca.
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let todos = 1;
      for (let dy = -r; dy <= r && todos; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const X = x + dx, Y = y + dy;
          if (X < 0 || X >= W || Y < 0 || Y >= H) continue;
          if (!escuro[Y * W + X]) { todos = 0; break; }
        }
      }
      erodido[y * W + x] = todos;
    }
  }
  // Dilatacao: devolve a espessura ao que sobreviveu.
  const dilatado = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!erodido[y * W + x]) continue;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const X = x + dx, Y = y + dy;
          if (X >= 0 && X < W && Y >= 0 && Y < H) dilatado[Y * W + X] = 1;
        }
      }
    }
  }
  let sobrou = 0;
  for (let i = 0; i < W * H; i++) { escuro[i] = dilatado[i]; if (dilatado[i]) sobrou++; }
  console.log(`abertura r=${r}: escuros ${nEscuro} -> ${sobrou}`);
  nEscuro = sobrou;
}

console.log(`imagem: ${W} × ${H} px`);
console.log(`pixels escuros (< ${LIMIAR}): ${nEscuro} (${((nEscuro / (W * H)) * 100).toFixed(1)}%)`);

// ── Histograma de intensidade ───────────────────────────────────────────────
// Serve para escolher o limiar com evidência, não com chute: numa planta bem
// escaneada o histograma é bimodal (fundo claro, traço escuro).
const hist = new Array(16).fill(0);
for (let i = 0; i < W * H; i++) hist[data[i] >> 4]++;
console.log('\nhistograma (faixas de 16 níveis):');
hist.forEach((n, i) => {
  if (n > W * H * 0.001) {
    const barra = '#'.repeat(Math.round((n / (W * H)) * 200));
    console.log(`  ${String(i * 16).padStart(3)}-${String(i * 16 + 15).padStart(3)}  ${String(n).padStart(8)}  ${barra}`);
  }
});

// ── Componentes conexos dos pixels CLAROS ───────────────────────────────────
// Cada cômodo fechado é um componente claro cercado por traço escuro. Rodar
// sobre o claro em vez do escuro evita ter que decidir o que é parede: o que
// importa é o VAZIO delimitado.
const comp = new Int32Array(W * H).fill(-1);
const areas = [];
const caixas = [];

for (let s = 0; s < W * H; s++) {
  if (escuro[s] || comp[s] !== -1) continue;
  const id = areas.length;
  const fila = [s];
  comp[s] = id;
  let n = 0;
  let minX = W, maxX = 0, minY = H, maxY = 0;

  while (fila.length) {
    const k = fila.pop();
    n++;
    const x = k % W;
    const y = (k - x) / W;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;

    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const X = x + dx, Y = y + dy;
      if (X < 0 || X >= W || Y < 0 || Y >= H) continue;
      const kk = Y * W + X;
      if (escuro[kk] || comp[kk] !== -1) continue;
      comp[kk] = id;
      fila.push(kk);
    }
  }
  areas.push(n);
  caixas.push({ minX, maxX, minY, maxY });
}

// Escala: a caixa do edificio equivale as cotas externas declaradas na planta.
// 6,75 m de largura x 7,35 m de altura, lidas do proprio desenho.
let bx0 = W, bx1 = 0, by0 = H, by1 = 0;
for (let k = 0; k < W * H; k++) {
  if (!escuro[k]) continue;
  const x = k % W, y = (k - x) / W;
  // Ignorar a faixa de cotas/legenda: so o miolo do desenho.
  if (x < 150 || x > 950 || y < 180 || y > 1010) continue;
  if (x < bx0) bx0 = x; if (x > bx1) bx1 = x;
  if (y < by0) by0 = y; if (y > by1) by1 = y;
}
const pxPorM = ((bx1 - bx0) / 6.75 + (by1 - by0) / 7.35) / 2;
const m2 = (px) => px / (pxPorM * pxPorM);
console.log(`
caixa do edificio: x[${bx0}..${bx1}] y[${by0}..${by1}]  ->  ${pxPorM.toFixed(1)} px/m`);

const ordem = areas.map((a, i) => ({ i, a })).sort((p, q) => q.a - p.a);
console.log(`\ncomponentes claros: ${areas.length}`);
const comodos = ordem.filter(({ i, a }) => {
  const c = caixas[i];
  if (c.minX === 0 || c.minY === 0 || c.maxX === W - 1 || c.maxY === H - 1) return false;
  return m2(a) >= 1.5; // menor que isso nao e comodo, e simbolo ou letra
});
console.log(`componentes com area de comodo (>= 1,5 m2, sem tocar a borda): ${comodos.length}`);
for (const { i, a } of comodos.slice(0, 12)) {
  const c = caixas[i];
  console.log(`  #${String(i).padStart(4)}  ${m2(a).toFixed(2).padStart(7)} m2   x[${c.minX}..${c.maxX}] y[${c.minY}..${c.maxY}]`);
}

// ── Despejo visual ──────────────────────────────────────────────────────────
// Colorir os maiores componentes para eu VER o que o limiar separou, em vez de
// deduzir dos números.
const paleta = [
  [220, 38, 38], [37, 99, 235], [22, 163, 74], [217, 119, 6],
  [147, 51, 234], [8, 145, 178], [219, 39, 119], [101, 163, 13],
  [244, 63, 94], [6, 182, 212], [168, 85, 247], [234, 179, 8],
];
const interessantes = ordem.filter(({ i }) => {
  const c = caixas[i];
  return !(c.minX === 0 || c.minY === 0 || c.maxX === W - 1 || c.maxY === H - 1);
}).slice(0, 12);
const corDe = new Map(interessantes.map(({ i }, n) => [i, paleta[n % paleta.length]]));

const rgb = Buffer.alloc(W * H * 3);
for (let k = 0; k < W * H; k++) {
  const c = corDe.get(comp[k]);
  if (escuro[k]) { rgb[k * 3] = 30; rgb[k * 3 + 1] = 41; rgb[k * 3 + 2] = 59; }
  else if (c) { rgb[k * 3] = c[0]; rgb[k * 3 + 1] = c[1]; rgb[k * 3 + 2] = c[2]; }
  else { rgb[k * 3] = 245; rgb[k * 3 + 1] = 245; rgb[k * 3 + 2] = 245; }
}
const saida = 'docs/spikes/digitalizador/raster-componentes.png';
await sharp(rgb, { raw: { width: W, height: H, channels: 3 } }).png().toFile(saida);
console.log(`\ndespejo visual em ${saida}`);
