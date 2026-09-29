/**
 * HARNESS VISUAL da PRANCHA HIDROSSANITÁRIA (E2.1 plantas, E2.2 isométricos, E2.3
 * esquema vertical — 28/09/2026). `?cena=sobrado&nivel=1` mostra o superior.
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
  desenharFolhaDoEsquemaVertical,
  desenharElevacao,
  enquadrarElevacao,
  desenharPlanta,
  enquadrar,
  orientar,
  type Desenhista,
  type EstiloTraco,
  type OpcoesExportacao,
} from '../../../utils/blueprintExport';
import { planejarEsgoto } from '../../../utils/blueprintEsgotoAutomatico';
import { modeloDoPavimento } from '../../../utils/blueprintPranchas';
import { projetarCorte } from '../../../utils/blueprintCorte';
import { nomesDasColunas } from '../../../utils/blueprintEsquemaVertical';
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

/**
 * Banheiro + área de serviço no térreo. `?cena=sobrado` (E2.3): o mesmo
 * banheiro no pavimento superior e a caixa d'água no teto dele — sai o TQ, a
 * ventilação e as colunas de água atravessando o piso.
 */
function casa(sobrado: boolean): BlueprintModel {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  if (sobrado) m = applyCommand(m, { type: 'AddLevel', name: 'Superior', elevationMm: 2900, defaultHeightMm: 2800 }).model;
  const [t, s] = m.levels.map((l) => l.id);
  const topo = sobrado ? s : t;
  const paredes = (levelId: string): Command[] =>
    [[0, 0, 4500, 0], [4500, 0, 4500, 3000], [4500, 3000, 0, 3000], [0, 3000, 0, 0], [2000, 0, 2000, 3000]].map(([ax, ay, bx, by]) => ({
      type: 'AddWall', levelId, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800,
    }) as Command);
  const ponto = (levelId: string, disciplina: 'AGUA_FRIA' | 'ESGOTO', tipo: TipoDePontoHidraulico, x: number, y: number, cota: number): Command =>
    ({ type: 'AddTerminal', levelId, disciplina, tipo, at: point(x, y), cotaMm: cota, tipoHidraulico: tipo } as Command);
  const banheiro = (levelId: string): Command[] => [
    ponto(levelId, 'AGUA_FRIA', 'LAVATORIO', 75, 2500, 600),
    ponto(levelId, 'AGUA_FRIA', 'CHUVEIRO', 1500, 2925, 2100),
    ponto(levelId, 'AGUA_FRIA', 'VASO_SANITARIO', 75, 800, 300),
    ponto(levelId, 'ESGOTO', 'VASO_SANITARIO', 600, 800, 0),
    ponto(levelId, 'ESGOTO', 'LAVATORIO', 600, 2500, 500),
    ponto(levelId, 'ESGOTO', 'CHUVEIRO', 1500, 2500, 0),
    ponto(levelId, 'ESGOTO', 'CAIXA_SIFONADA', 1200, 2100, 0),
  ];
  m = applyBatch(m, [
    ...paredes(t),
    ...(sobrado ? paredes(s) : []),
    { type: 'AddTerminal', levelId: topo, disciplina: 'AGUA_FRIA', tipo: "Caixa d'água", at: point(4500, 0), cotaMm: 2800, tipoHidraulico: 'RESERVATORIO' } as Command,
    ...banheiro(t),
    ...(sobrado ? banheiro(s) : []),
    ponto(t, 'AGUA_FRIA', 'TANQUE', 3500, 2925, 1100),
    ponto(t, 'ESGOTO', 'TANQUE', 3500, 2600, 500),
    ponto(t, 'ESGOTO', 'CAIXA_INSPECAO', 6000, -1500, -700),
  ]).model;
  m = applyCommand(m, { type: 'SetTerminalProps', terminalId: m.terminais![0].id, larguraMm: 1200, profundidadeMm: 1200, alturaMm: 800 } as Command).model;
  m = recomputeSpaces(m);
  for (const e of m.spaces) {
    const esquerda = e.ring.every((p) => p.x <= 2000);
    m = applyCommand(m, { type: 'NameSpace', spaceId: e.id, name: esquerda ? 'Banheiro' : e.levelId === t ? 'Área de serviço' : 'Quarto', tipoDeAmbiente: esquerda ? 'BANHEIRO' : 'COZINHA_SERVICO' } as Command).model;
  }
  m = applyBatch(m, planejarAgua(m, m.terminais![0]).comandos).model;
  m = applyBatch(m, planejarEsgoto(m).comandos).model;
  return m;
}

const params = new URLSearchParams(location.search);
const modelo = casa(params.get('cena') === 'sobrado');
// A planta é a do pavimento `?nivel=` (0 = térreo), com os nomes das colunas do desenho inteiro.
const pavimento = modeloDoPavimento(modelo, modelo.levels[Number(params.get('nivel') ?? 0)].id);
const nomes = nomesDasColunas(modelo);
const papel = orientar(PAPEIS.find((p) => p.id === (params.get('papel') ?? 'A3')) ?? PAPEIS[0], true);
const denominador = Number(params.get('escala') ?? 50);
const o: OpcoesExportacao = { denominador, papel, titulo: 'Casa de prova', revisao: 1, hash: 'e2'.repeat(32), data: new Date('2026-09-28T12:00:00Z') };
const enq = enquadrar(pavimento, o.denominador, o.papel, false);
const comCorte = applyCommand(modelo, { type: 'AddCorte', a: point(-800, 1500), b: point(7000, 1500) } as Command).model;
const projCorte = projetarCorte(comCorte, { corte: comCorte.sections[0] });
const enqCorte = enquadrarElevacao(projCorte, 50, papel);
const DPI = 110;
const raiz = document.getElementById('raiz')!;
for (const [id, desenhar] of [
  ['agua', (d: Desenhista) => desenharPlanta(d, pavimento, { ...o, titulo: `${o.titulo} — Hidráulica`, hidrossanitaria: 'AGUA', nomesDasColunas: nomes }, enq)],
  ['esgoto', (d: Desenhista) => desenharPlanta(d, pavimento, { ...o, titulo: `${o.titulo} — Esgoto`, hidrossanitaria: 'ESGOTO', nomesDasColunas: nomes }, enq)],
  ['legenda', (d: Desenhista) => desenharFolhaDeDetalhesHidro(d, modelo, { ...o, denominador: 0, titulo: `${o.titulo} — Legenda` }, enq)],
  ['esquema', (d: Desenhista) => desenharFolhaDoEsquemaVertical(d, modelo, { ...o, denominador: 0, titulo: `${o.titulo} — Esquema vertical` }, enq, ['AGUA', 'ESGOTO'])],
  // E2.4: um corte em y = 1500 atravessando o banheiro, com a rede (`instalacoesNoCorte`).
  ['corte', (d: Desenhista) => desenharElevacao(d, projCorte, { ...o, titulo: `${o.titulo} — Corte AA`, instalacoesNoCorte: params.get('semRede') !== '1' }, enqCorte)],
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
