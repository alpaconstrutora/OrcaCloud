/**
 * HARNESS VISUAL das PRANCHAS DE CLIMATIZAÇÃO (E8.1/E8.2, 07/10/2026): o MESMO
 * `desenharConjunto` do PDF, folha a folha, num `Desenhista` de canvas (o do
 * PNG do app). O desenho é montado pela CADEIA da climatização, não à mão:
 * Térreo com Sala e Quarto — a carga escolhe o split (E4), a linha e o dreno
 * são lançados (E5); Superior com uma evaporadora dutada e quatro difusores — a
 * espinha de dutos é lançada (E7).
 * `?folha=0..3` (0 = Térreo, 1 = Superior, 2 = quadro-resumo e legenda, 3 = isométrico e detalhes).
 */
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command } from '../../../utils/blueprintKernel';
import { type Desenhista, type EstiloTraco, PAPEIS, orientar } from '../../../utils/blueprintExport';
import { desenharConjunto } from '../../../services/blueprintExportService';
import { TEMPLATE_DE_PRANCHA_PADRAO } from '../../../utils/blueprintPranchas';
import { HIPOTESES_CLIMATIZACAO_PADRAO, HIPOTESES_DE_SELECAO_PADRAO, type HipotesesClimatizacao } from '../../../utils/blueprintClimatizacao';
import { cargaTermicaDoNivel } from '../../../utils/blueprintCargaTermica';
import { SEMENTES_DE_TIPOS } from '../../../utils/blueprintCatalogoDeTipos';
import { modelosDoCatalogo, selecaoDoNivel } from '../../../utils/blueprintSelecaoClimatizacao';
import { planejarEquipamentosSplit } from '../../../utils/blueprintPosicaoSplit';
import { planejarLinhasFrigorigenas } from '../../../utils/blueprintLinhaFrigorigena';
import { planejarRedeDeAr, vazoesDosTerminais } from '../../../utils/blueprintRedeDeAr';

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

const hip: HipotesesClimatizacao = { ...HIPOTESES_CLIMATIZACAO_PADRAO, clima: { cidade: null, tbsExternaC: 34, tbuExternaC: 25, altitudeM: 0 } };
const catalogo = modelosDoCatalogo(SEMENTES_DE_TIPOS.map((s, i) => ({ id: `t${i}`, nome: s.nome, familia: s.propriedades.familia, active: true, propriedades: s.propriedades })));

function casa(): BlueprintModel {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  m = applyCommand(m, { type: 'AddLevel', name: 'Superior', elevationMm: 2900, defaultHeightMm: 2800 }).model;
  const [t, s] = m.levels.map((l) => l.id);
  const paredes = (levelId: string, divisa: boolean): Command[] =>
    [[0, 0, 10000, 0], [10000, 0, 10000, 6000], [10000, 6000, 0, 6000], [0, 6000, 0, 0], ...(divisa ? [[5000, 0, 5000, 6000]] : [])].map(([ax, ay, bx, by]) => ({ type: 'AddWall', levelId, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800 }) as Command);
  m = applyBatch(m, [...paredes(t, true), ...paredes(s, false)]).model;
  const doTerreo = m.spaces.filter((x) => x.levelId === t);
  const sala = doTerreo.find((x) => x.ring.every((p) => p.x <= 5100))!;
  const quarto = doTerreo.find((x) => x.id !== sala.id)!;
  const salao = m.spaces.find((x) => x.levelId === s)!;
  const sul = m.walls.filter((x) => x.levelId === t && x.a.y === 0 && x.b.y === 0)[0];
  m = applyBatch(m, [
    { type: 'NameSpace', spaceId: sala.id, name: 'Sala' },
    { type: 'NameSpace', spaceId: quarto.id, name: 'Quarto' },
    { type: 'NameSpace', spaceId: salao.id, name: 'Salão' },
    { type: 'AddOpening', wallId: sul.id, kind: 'window', offsetMm: 1500, widthMm: 2000, heightMm: 1200, sillMm: 1000 } as never,
  ]).model;
  // Térreo: a carga escolhe o split (E4); a linha e o dreno são lançados (E5).
  const carga = cargaTermicaDoNivel(m, hip, t);
  m = applyBatch(m, planejarEquipamentosSplit(m, selecaoDoNivel(m, carga, HIPOTESES_DE_SELECAO_PADRAO, catalogo), carga, HIPOTESES_DE_SELECAO_PADRAO).comandos).model;
  m = applyBatch(m, planejarLinhasFrigorigenas(m, t, hip.linha).comandos).model;
  // Superior: dutada + 4 difusores; a espinha de dutos é lançada (E7).
  m = applyBatch(m, [
    { type: 'AddTerminal', levelId: s, disciplina: 'MECANICA', tipo: 'Dutada', tipoHidraulico: 'EVAPORADORA_DUTADA', at: point(300, 3000), cotaMm: 2600, capacidadeBtuH: 36000 } as Command,
    ...[[3000, 1500], [3000, 4500], [7500, 1500], [7500, 4500]].map(([x, y]) => ({ type: 'AddTerminal', levelId: s, disciplina: 'MECANICA', tipo: 'Difusor', tipoHidraulico: 'DIFUSOR', at: point(x, y), cotaMm: 2600, vazaoM3h: 400 }) as Command),
  ]).model;
  const cargaS = cargaTermicaDoNivel(m, hip, s);
  m = applyBatch(m, planejarRedeDeAr(m, s, vazoesDosTerminais(m, cargaS, hip.ar), hip.ar).comandos).model;
  return m;
}

const folha = Number(new URLSearchParams(location.search).get('folha') ?? 0);
const papel = orientar(PAPEIS.find((x) => x.id === 'A3') ?? PAPEIS[0], true);
const template = { ...TEMPLATE_DE_PRANCHA_PADRAO, papel: 'A3' as const, paisagem: true, incluir: { ...TEMPLATE_DE_PRANCHA_PADRAO.incluir, indice: false, plantas: false, cortes: false, elevacoes: false, ampliacoes: false, tabelas: false, climatizacao: true } };
const canvases: HTMLCanvasElement[] = [];
desenharConjunto(casa(), { denominador: 50, papel, titulo: 'Casa de prova', revisao: 1, hash: 'h'.repeat(64), data: new Date('2026-10-07T12:00:00Z') }, template, () => {
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
document.title = `folhas=${canvases.length}`;
