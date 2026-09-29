/**
 * HARNESS VISUAL da PRANCHA HIDROSSANITÁRIA (E2.1, 28/09/2026).
 *
 * O MESMO `desenharPlanta` (com `hidrossanitaria`) e a MESMA folha de legenda
 * do conjunto, num `Desenhista` de canvas igual ao do PNG do app. Banheiro +
 * cozinha com caixa d'água, água pelo `planejarAgua` e esgoto pelo
 * `planejarEsgoto` — a rede é a automática, não desenhada à mão.
 *
 *   npx vite --port 3147 → http://localhost:3147/docs/spikes/prancha-hidro/index.html
 */
import { applyBatch, applyCommand, emptyModel, point, recomputeSpaces, type BlueprintModel, type Command, type TipoDePontoHidraulico } from '../../../utils/blueprintKernel';
import {
  PAPEIS,
  desenharFolhaDeDetalhesHidro,
  desenharPlanta,
  enquadrar,
  orientar,
  type Desenhista,
  type EstiloTraco,
  type OpcoesExportacao,
} from '../../../utils/blueprintExport';
import { planejarEsgoto } from '../../../utils/blueprintEsgotoAutomatico';
import { planejarAgua } from '../../../utils/blueprintAguaAutomatica';

/** O desenhista de canvas — cópia do `DesenhistaCanvas` do serviço (mm → px). */
class DesenhistaCanvas implements Desenhista {
  private readonly k: number;
  constructor(private readonly ctx: CanvasRenderingContext2D, dpi: number) {
    this.k = dpi / 25.4;
  }
  linha(x1: number, y1: number, x2: number, y2: number, estilo: EstiloTraco): void {
    const { ctx, k } = this;
    ctx.strokeStyle = estilo.cor;
    ctx.lineWidth = Math.max(1, estilo.espessuraMm * k);
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.moveTo(x1 * k, y1 * k);
    ctx.lineTo(x2 * k, y2 * k);
    ctx.stroke();
  }
  poligono(pontos: { x: number; y: number }[], preenchimento: string): void {
    const { ctx, k } = this;
    if (pontos.length < 3) return;
    ctx.fillStyle = preenchimento;
    ctx.beginPath();
    ctx.moveTo(pontos[0].x * k, pontos[0].y * k);
    for (const p of pontos.slice(1)) ctx.lineTo(p.x * k, p.y * k);
    ctx.closePath();
    ctx.fill();
  }
  texto(x: number, y: number, texto: string, alturaMm: number, cor = '#000000'): void {
    const { ctx, k } = this;
    ctx.fillStyle = cor;
    ctx.font = `${alturaMm * k}px Helvetica, Arial, sans-serif`;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(texto, x * k, y * k);
  }
  retangulo(x: number, y: number, w: number, h: number, estilo: EstiloTraco): void {
    const { ctx, k } = this;
    ctx.strokeStyle = estilo.cor;
    ctx.lineWidth = Math.max(1, estilo.espessuraMm * k);
    ctx.strokeRect(x * k, y * k, w * k, h * k);
  }
}

function casa(): BlueprintModel {
  const base = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const t = base.levels[0].id;
  const w = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800 });
  const ponto = (disciplina: 'AGUA_FRIA' | 'ESGOTO', tipo: TipoDePontoHidraulico, x: number, y: number, cota: number): Command =>
    ({ type: 'AddTerminal', levelId: t, disciplina, tipo, at: point(x, y), cotaMm: cota, tipoHidraulico: tipo } as Command);
  let m = applyBatch(base, [
    w(0, 0, 4500, 0), w(4500, 0, 4500, 3000), w(4500, 3000, 0, 3000), w(0, 3000, 0, 0), w(2000, 0, 2000, 3000),
    { type: 'AddTerminal', levelId: t, disciplina: 'AGUA_FRIA', tipo: "Caixa d'água", at: point(4500, 0), cotaMm: 2800, tipoHidraulico: 'RESERVATORIO' } as Command,
    ponto('AGUA_FRIA', 'LAVATORIO', 75, 2500, 600),
    ponto('AGUA_FRIA', 'CHUVEIRO', 1500, 2925, 2100),
    ponto('AGUA_FRIA', 'VASO_SANITARIO', 75, 800, 300),
    ponto('AGUA_FRIA', 'TANQUE', 3500, 2925, 1100),
    ponto('ESGOTO', 'VASO_SANITARIO', 600, 800, 0),
    ponto('ESGOTO', 'LAVATORIO', 600, 2500, 500),
    ponto('ESGOTO', 'CHUVEIRO', 1500, 2500, 0),
    ponto('ESGOTO', 'CAIXA_SIFONADA', 1200, 2100, 0),
    ponto('ESGOTO', 'TANQUE', 3500, 2600, 500),
    ponto('ESGOTO', 'CAIXA_INSPECAO', 6000, -1500, -700),
  ]).model;
  m = applyCommand(m, { type: 'SetTerminalProps', terminalId: m.terminais![0].id, larguraMm: 1200, profundidadeMm: 1200, alturaMm: 800 } as Command).model;
  m = recomputeSpaces(m);
  m = applyBatch(m, planejarAgua(m, m.terminais![0]).comandos).model;
  m = applyBatch(m, planejarEsgoto(m).comandos).model;
  return m;
}

const modelo = casa();
const params = new URLSearchParams(location.search);
const papel = orientar(PAPEIS.find((p) => p.id === (params.get('papel') ?? 'A3')) ?? PAPEIS[0], true);
const denominador = Number(params.get('escala') ?? 50);
const o: OpcoesExportacao = { denominador, papel, titulo: 'Casa de prova', revisao: 1, hash: 'e2'.repeat(32), data: new Date('2026-09-28T12:00:00Z') };
const enq = enquadrar(modelo, o.denominador, o.papel, false);
const DPI = 110;
const raiz = document.getElementById('raiz')!;
for (const [id, desenhar] of [
  ['agua', (d: Desenhista) => desenharPlanta(d, modelo, { ...o, titulo: `${o.titulo} — Hidráulica`, hidrossanitaria: 'AGUA' }, enq)],
  ['esgoto', (d: Desenhista) => desenharPlanta(d, modelo, { ...o, titulo: `${o.titulo} — Esgoto`, hidrossanitaria: 'ESGOTO' }, enq)],
  ['legenda', (d: Desenhista) => desenharFolhaDeDetalhesHidro(d, modelo, { ...o, denominador: 0, titulo: `${o.titulo} — Legenda` }, enq)],
] as const) {
  const canvas = document.createElement('canvas');
  canvas.id = id;
  const k = DPI / 25.4;
  canvas.width = Math.round(papel.larguraMm * k);
  canvas.height = Math.round(papel.alturaMm * k);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  desenhar(new DesenhistaCanvas(ctx, DPI));
  raiz.appendChild(canvas);
}
