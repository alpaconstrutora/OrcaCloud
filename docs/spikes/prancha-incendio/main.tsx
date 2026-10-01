/**
 * HARNESS VISUAL das PRANCHAS DE INCÊNDIO (E8.1, 01/10/2026): o MESMO
 * `desenharConjunto` do PDF, folha a folha, num `Desenhista` de canvas (o do
 * PNG do app). Térreo com bomba, coluna, hidrantes e extintor; 1º com
 * sprinklers e placa. `?folha=0..4`.
 */
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command } from '../../../utils/blueprintKernel';
import { type Desenhista, type EstiloTraco, PAPEIS, orientar } from '../../../utils/blueprintExport';
import { desenharConjunto } from '../../../services/blueprintExportService';
import { TEMPLATE_DE_PRANCHA_PADRAO } from '../../../utils/blueprintPranchas';
import { HIPOTESES_INCENDIO_PADRAO } from '../../../utils/blueprintIncendioClassificacao';

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

function predio(): BlueprintModel {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 3000 }).model;
  m = applyCommand(m, { type: 'AddLevel', name: '1º', elevationMm: 3000, defaultHeightMm: 3000 }).model;
  const [t, s] = m.levels.map((l) => l.id);
  const paredes = (levelId: string): Command[] =>
    [[0, 0, 10000, 0], [10000, 0, 10000, 8000], [10000, 8000, 0, 8000], [0, 8000, 0, 0], [6000, 0, 6000, 8000]].map(([ax, ay, bx, by]) => ({ type: 'AddWall', levelId, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 3000 }) as Command);
  const p = (levelId: string, tipo: string, x: number, y: number, cota: number, extra: Record<string, unknown> = {}): Command => ({ type: 'AddTerminal', levelId, disciplina: 'INCENDIO', tipo, tipoHidraulico: tipo, at: point(x, y), cotaMm: cota, ...extra }) as Command;
  const tr = (levelId: string, ax: number, ay: number, bx: number, by: number, ca: number, cb: number, dn = 65): Command => ({ type: 'AddTrecho', levelId, disciplina: 'INCENDIO', a: point(ax, ay), b: point(bx, by), cotaAMm: ca, cotaBMm: cb, bitolaMm: dn }) as Command;
  return applyBatch(m, [
    ...paredes(t),
    ...paredes(s),
    p(t, 'BOMBA_INCENDIO', 1000, 1000, 300),
    tr(t, 1000, 1000, 1000, 1000, 300, 2600),
    tr(t, 1000, 1000, 9000, 1000, 2600, 2600),
    tr(t, 1000, 1000, 1000, 7000, 2600, 2600),
    p(t, 'HIDRANTE_SIMPLES', 9000, 1000, 2600),
    p(t, 'HIDRANTE_SIMPLES', 1000, 7000, 2600),
    p(t, 'EXTINTOR', 4000, 7500, 1600, { agenteExtintor: 'PQS_ABC' }),
    p(t, 'PLACA', 4000, 7100, 1800, { codigoPlaca: 'E5' }),
    p(t, 'LUMINARIA_EMERGENCIA', 3000, 4000, 2200),
    p(t, 'DETECTOR_FUMACA', 8000, 4000, 2700),
    tr(s, 1000, 1000, 1000, 1000, 0, 2700, 50),
    tr(s, 1000, 1000, 9000, 1000, 2700, 2700, 50),
    ...[3000, 6000, 9000].map((x) => p(s, 'SPRINKLER', x, 1000, 2700)),
    p(s, 'VGA', 1000, 1000, 2700),
    p(s, 'PLACA', 2000, 7500, 2200, { codigoPlaca: 'S12' }),
  ]).model;
}

const folha = Number(new URLSearchParams(location.search).get('folha') ?? 0);
const papel = orientar(PAPEIS.find((x) => x.id === 'A3') ?? PAPEIS[0], true);
const template = { ...TEMPLATE_DE_PRANCHA_PADRAO, papel: 'A3' as const, paisagem: true, incluir: { ...TEMPLATE_DE_PRANCHA_PADRAO.incluir, indice: false, plantas: false, cortes: false, elevacoes: false, ampliacoes: false, tabelas: false, incendio: true } };
const canvases: HTMLCanvasElement[] = [];
desenharConjunto(predio(), { denominador: 50, papel, titulo: 'Prédio de prova', revisao: 1, hash: 'h'.repeat(64), data: new Date('2026-10-01T12:00:00Z'), hipotesesDeIncendio: { ...HIPOTESES_INCENDIO_PADRAO, classificacao: { ...HIPOTESES_INCENDIO_PADRAO.classificacao, divisao: 'A-2' } } }, template, () => {
  const canvas = document.createElement('canvas');
  const dpi = 110;
  canvas.width = Math.round((papel.larguraMm * dpi) / 25.4);
  canvas.height = Math.round((papel.alturaMm * dpi) / 25.4);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  canvases.push(canvas);
  return new DesenhistaCanvas(ctx, dpi) as Desenhista;
});
document.getElementById('raiz')!.appendChild(canvases[Math.min(folha, canvases.length - 1)]);
