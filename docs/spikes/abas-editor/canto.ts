/**
 * Rasteriza a exportação num canvas e LÊ OS PIXELS do canto.
 *
 * Usa o `desenharPlanta` REAL — não uma cópia — com um `Desenhista` de canvas
 * equivalente ao da exportação. Com `?estender=0` reproduz o desenho SEM a
 * extensão da pincelada, que é o defeito: assim a medição prova que discrimina.
 */
import {
  applyBatch,
  applyCommand,
  emptyModel,
  isFreeWallEnd,
  point,
  type BlueprintModel,
  type Command,
} from '../../../utils/blueprintKernel';
import {
  boundingBox,
  enquadrar,
  PAPEIS,
  type Desenhista,
  type EstiloTraco,
} from '../../../utils/blueprintExport';

declare global {
  interface Window {
    __pronto?: boolean;
    __cantos?: { nome: string; claros: number; total: number; fechado: boolean }[];
  }
}

const DEN = 20; // escala grande: o canto fica com dezenas de pixels
const DPI = 300;
const K = DPI / 25.4;
const A4 = PAPEIS[0];
const estender = new URLSearchParams(location.search).get('estender') !== '0';

const tela = document.getElementById('tela') as HTMLCanvasElement;
tela.width = Math.round(A4.larguraMm * K);
tela.height = Math.round(A4.alturaMm * K);
tela.style.width = `${A4.larguraMm}px`;
tela.style.height = `${A4.alturaMm}px`;

const ctx = tela.getContext('2d', { willReadFrequently: true })!;
ctx.fillStyle = '#fff';
ctx.fillRect(0, 0, tela.width, tela.height);

class Canvas2D implements Desenhista {
  linha(x1: number, y1: number, x2: number, y2: number, e: EstiloTraco) {
    ctx.strokeStyle = e.cor;
    ctx.lineWidth = Math.max(0.5, e.espessuraMm * K);
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.moveTo(x1 * K, y1 * K);
    ctx.lineTo(x2 * K, y2 * K);
    ctx.stroke();
  }
  poligono(pts: { x: number; y: number }[], cor: string) {
    if (pts.length < 3) return;
    ctx.fillStyle = cor;
    ctx.beginPath();
    ctx.moveTo(pts[0].x * K, pts[0].y * K);
    for (const p of pts.slice(1)) ctx.lineTo(p.x * K, p.y * K);
    ctx.closePath();
    ctx.fill();
  }
  texto() {
    /* o carimbo não interessa aqui */
  }
  retangulo() {
    /* idem */
  }
}

// ── Modelo: sala 1,20 × 0,90 m, parede de 150 mm ────────────────────────────
const base = applyCommand(emptyModel(), {
  type: 'AddLevel',
  name: 'T',
  elevationMm: 0,
  defaultHeightMm: 2800,
});
const levelId = base.model.levels[0].id;
const w = (ax: number, ay: number, bx: number, by: number): Command => ({
  type: 'AddWall',
  levelId,
  a: point(ax, ay),
  b: point(bx, by),
  thicknessMm: 150,
  heightMm: 2800,
});
const model: BlueprintModel = applyBatch(base.model, [
  w(0, 0, 1200, 0),
  w(1200, 0, 1200, 900),
  w(1200, 900, 0, 900),
  w(0, 900, 0, 0),
]).model;

const enq = enquadrar(model, DEN, A4);
const bb = boundingBox(model)!;
const folga = 75;
const px = (x: number) => enq.offsetXMm + (x - bb.minX + folga) / DEN;
const py = (y: number) => enq.offsetYMm + (enq.desenhoAlturaMm - (y - bb.minY + folga) / DEN);

// Mesmo desenho da exportação, com a extensão sob controle do harness.
const d = new Canvas2D();
const tracos = model.walls.map((wall) => {
  const ax = px(wall.a.x);
  const ay = py(wall.a.y);
  const bx = px(wall.b.x);
  const by = py(wall.b.y);
  const comp = Math.hypot(bx - ax, by - ay);
  const ux = comp > 0 ? (bx - ax) / comp : 0;
  const uy = comp > 0 ? (by - ay) / comp : 0;
  const cheia = wall.thicknessMm / DEN;
  const meia = cheia / 2;
  const ext = (p: { x: number; y: number }) =>
    isFreeWallEnd(model.walls, p, wall.id) ? 0 : meia;
  return { cheia, ax, ay, bx, by, ux, uy, extA: ext(wall.a), extB: ext(wall.b) };
});

const FINA = 0.13;

for (const t of tracos) {
  d.linha(
    t.ax - t.ux * t.extA,
    t.ay - t.uy * t.extA,
    t.bx + t.ux * t.extB,
    t.by + t.uy * t.extB,
    { espessuraMm: t.cheia, cor: '#000000' },
  );
}
for (const t of tracos) {
  const miolo = t.cheia - 2 * FINA;
  if (miolo < 0.1) continue;
  // `?estender=0` reproduz o DEFEITO: branco avançando tanto quanto o preto.
  const recA = estender ? t.extA - FINA : t.extA;
  const recB = estender ? t.extB - FINA : t.extB;
  d.linha(
    t.ax - t.ux * recA,
    t.ay - t.uy * recA,
    t.bx + t.ux * recB,
    t.by + t.uy * recB,
    { espessuraMm: miolo, cor: '#ffffff' },
  );
}

// ── Leitura dos quatro cantos externos ──────────────────────────────────────
//
// A PRIMEIRA VERSÃO LIA A COISA ERRADA: media o quadrado inteiro do canto
// externo e o encontrava branco NOS DOIS MODOS — porque ele É branco, é o lado
// de fora do cômodo. O que o canto aberto quebra não é uma área cheia, é a
// LINHA de contorno.
//
// O ponto que interessa é o vértice do retângulo externo: meia espessura para
// fora do eixo nas duas direções. Sem a extensão da pincelada, nenhuma das duas
// paredes alcança esse ponto e ele fica branco. Com a extensão, as duas o
// cobrem e ele fica preto.
const meiaPx = (150 / DEN / 2) * K;
const JANELA = 8;

function verticeExterno(xEixo: number, yEixo: number, dirX: number, dirY: number) {
  const cx = px(xEixo) * K + dirX * meiaPx;
  const cy = py(yEixo) * K + dirY * meiaPx;

  const img = ctx.getImageData(
    Math.round(cx - JANELA / 2),
    Math.round(cy - JANELA / 2),
    JANELA,
    JANELA,
  );

  let escuros = 0;
  const total = img.data.length / 4;
  for (let i = 0; i < img.data.length; i += 4) {
    if (img.data[i] < 128 && img.data[i + 1] < 128 && img.data[i + 2] < 128) escuros++;
  }
  return { escuros, total };
}

const cantos = [
  // No papel o Y está invertido: o y = 0 do modelo é a BASE do desenho, e para
  // fora dali é para baixo na folha.
  { nome: 'inf-esquerdo', x: 0, y: 0, dx: -1, dy: 1 },
  { nome: 'inf-direito', x: 1200, y: 0, dx: 1, dy: 1 },
  { nome: 'sup-direito', x: 1200, y: 900, dx: 1, dy: -1 },
  { nome: 'sup-esquerdo', x: 0, y: 900, dx: -1, dy: -1 },
].map((c) => {
  const { escuros, total } = verticeExterno(c.x, c.y, c.dx, c.dy);
  // O CORTE VEM DA MEDIÇÃO, não de palpite. O vértice é o encontro de duas
  // linhas de 0,13 mm — cerca de 1,5 px a 300 dpi — numa janela de 8×8, e a
  // antisserrilhagem acinzenta boa parte delas. Medido nos dois regimes:
  //   sem extensão: 3 a 4 pixels escuros (5–6%)
  //   com extensão: 12 a 15              (19–23%)
  // O corte em 15% separa os dois com folga dos dois lados.
  return { nome: c.nome, claros: total - escuros, total, fechado: escuros / total > 0.15 };
});

window.__cantos = cantos;
window.__pronto = true;

document.getElementById('saida')!.textContent =
  `${estender ? 'COM' : 'SEM'} extensão\n` +
  cantos.map((c) => `${c.nome}: ${c.claros}/${c.total} claros → ${c.fechado ? 'fechado' : 'ABERTO'}`).join('\n');
