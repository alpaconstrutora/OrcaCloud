/**
 * HARNESS VISUAL da PRANCHA ELÉTRICA (F8, 13/09/2026).
 *
 * A exportação em PDF não se olha em teste; aqui o MESMO `desenharPlanta` (com
 * `eletrica: true`) e a MESMA folha do quadro de cargas passam por um
 * `Desenhista` de canvas idêntico ao do PNG do app (mm → px pelo DPI), numa
 * A3 paisagem a 1:50. Dois canvases: a planta elétrica e a folha do quadro.
 *
 *   npx vite --port 3146 → http://localhost:3146/docs/spikes/prancha-eletrica/index.html
 */
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command } from '../../../utils/blueprintKernel';
import {
  PAPEIS,
  desenharFolhaDoQuadroDeCargas,
  desenharPlanta,
  enquadrar,
  orientar,
  type Desenhista,
  type EstiloTraco,
  type OpcoesExportacao,
} from '../../../utils/blueprintExport';
import { HIPOTESES_PADRAO } from '../../../utils/blueprintEletricaDimensionamento';

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

/** Sala 6 × 4 e quarto 3 × 4; QDC, dois circuitos, tomadas nas três alturas, luz + interruptor, eletrodutos. */
function casa(): BlueprintModel {
  const base = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const t = base.levels[0].id;
  const p = (ax: number, ay: number, bx: number, by: number): Command => ({
    type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800,
  });
  let m = applyBatch(base, [p(0, 0, 9000, 0), p(9000, 0, 9000, 4000), p(9000, 4000, 0, 4000), p(0, 4000, 0, 0), p(6000, 0, 6000, 4000)]).model;
  m = applyCommand(m, { type: 'NameSpace', spaceId: m.spaces[0].id, name: 'Sala', tipoDeAmbiente: 'SALA_DORMITORIO' }).model;
  m = applyCommand(m, { type: 'NameSpace', spaceId: m.spaces[1].id, name: 'Quarto', tipoDeAmbiente: 'SALA_DORMITORIO' }).model;
  m = applyCommand(m, { type: 'AddQuadro', levelId: t, nome: 'QDC', at: point(75, 1000), cotaMm: 1600, ligacao: 'FN', tensaoV: 127, alimentadorM: 10 }).model;
  const quadroId = m.quadros[0].id;
  m = applyCommand(m, { type: 'AddCircuito', quadroId, nome: 'C1', tensaoV: 127, secaoMm2: 1.5, disjuntorA: 10, protecaoDR: false }).model;
  m = applyCommand(m, { type: 'AddCircuito', quadroId, nome: 'C2', tensaoV: 127, secaoMm2: 2.5, disjuntorA: 16 }).model;
  const [c1, c2] = m.circuitos.map((c) => c.id);
  const ponto = (x: number, y: number, tipoEletrico: 'TUG' | 'TUE' | 'ILUMINACAO_TETO' | 'INTERRUPTOR' | 'LIGACAO_DIRETA' | 'DADOS_TV', potenciaW: number | null, cotaMm: number, circuitoId: string, comando: string | null = null, interruptor: 'UMA_SECAO' | 'DUAS_SECOES' | null = null) => {
    m = applyCommand(m, { type: 'AddTerminal', levelId: t, disciplina: 'ELETRICA', tipo: tipoEletrico, at: point(x, y), cotaMm, tipoEletrico, potenciaW: potenciaW ?? undefined, comando, interruptor }).model;
    const id = m.terminais[m.terminais.length - 1].id;
    m = applyCommand(m, { type: 'SetTerminalProps', terminalId: id, circuitoId }).model;
  };
  ponto(3000, 2000, 'ILUMINACAO_TETO', 160, 2800, c1, 'a');
  ponto(7500, 2000, 'ILUMINACAO_TETO', 100, 2800, c1, 'b');
  ponto(1000, 75, 'INTERRUPTOR', null, 1100, c1, 'ab', 'DUAS_SECOES');
  ponto(2000, 75, 'TUG', 600, 300, c2);
  ponto(4000, 75, 'TUG', 600, 1300, c2);
  ponto(5925, 2000, 'TUG', 100, 2000, c2);
  ponto(7000, 3925, 'TUG', 100, 0, c2);
  ponto(8925, 1000, 'DADOS_TV', 0, 300, c2);
  ponto(8925, 3000, 'LIGACAO_DIRETA', 5500, 2200, c2);
  const trecho = (a: [number, number], b: [number, number], ca: number, cb: number, circuitoId: string) => {
    m = applyCommand(m, { type: 'AddTrecho', levelId: t, disciplina: 'ELETRICA', a: point(a[0], a[1]), b: point(b[0], b[1]), cotaAMm: ca, cotaBMm: cb, bitolaMm: 25 }).model;
    m = applyCommand(m, { type: 'SetTrechoProps', trechoId: m.trechos[m.trechos.length - 1].id, circuitoId, condutores: 3 }).model;
  };
  trecho([75, 1000], [2000, 75], 1600, 300, c2); // parede
  trecho([2000, 75], [4000, 75], 300, 1300, c2);
  trecho([75, 1000], [3000, 2000], 1600, 2800, c1); // teto
  trecho([3000, 2000], [7500, 2000], 2800, 2800, c1);
  trecho([4000, 75], [7000, 3925], 0, 0, c2); // piso: tracejado
  return m;
}

const modelo = casa();
const papel = orientar(PAPEIS.find((p) => p.id === 'A3') ?? PAPEIS[0], true);
const o: OpcoesExportacao = {
  denominador: 50,
  papel,
  titulo: 'Casa de prova',
  revisao: 3,
  hash: 'f8'.repeat(32),
  data: new Date('2026-09-13T12:00:00Z'),
  eletrica: true,
  hipotesesEletricas: HIPOTESES_PADRAO,
};
const enq = enquadrar(modelo, o.denominador, o.papel, false);
const DPI = 110; // cabe na tela; o PNG do app usa 300
const raiz = document.getElementById('raiz')!;
for (const [id, desenhar] of [
  ['planta', (d: Desenhista) => desenharPlanta(d, modelo, { ...o, titulo: `${o.titulo} — Planta elétrica` }, enq)],
  ['quadro', (d: Desenhista) => desenharFolhaDoQuadroDeCargas(d, modelo, { ...o, titulo: `${o.titulo} — Quadro de cargas` }, enq)],
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
