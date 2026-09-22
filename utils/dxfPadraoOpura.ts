// utils/dxfPadraoOpura.ts
//
// O PADRÃO ÒPURA DE DESENHO para importação (P2.35): o template DXF que se
// entrega ao projetista e a leitura EXATA de um arquivo desenhado nele.
//
// ─── POR QUE UM PADRÃO ───────────────────────────────────────────────────────
//
// Um DXF comum obriga o importador a ADIVINHAR: que par de linhas paralelas é
// parede (grade de vaga e projeção de telhado também são pares), que arco é
// porta, que altura tem a janela. As P2.33/P2.34 levaram esse reconhecimento
// até onde a geometria permite — e o arquivo real da empresa ainda deixa 135
// pontas soltas, porque a ambiguidade está no desenho, não no leitor.
//
// O padrão elimina cada adivinhação com uma convenção pequena:
//
//  - **Parede** = um traço no EIXO, na camada `OPURA-PAREDE-<espessura em mm>`
//    (`OPURA-PAREDE-150`). Não há pareamento: o traço já é a parede, e a
//    espessura vem do nome da camada.
//  - **Esquadria** = bloco `OPURA-PORTA` / `OPURA-JANELA` / `OPURA-CORRER` /
//    `OPURA-VAO`, inserido com o ponto-base SOBRE o eixo da parede, na ponta da
//    dobradiça, girado no sentido da parede (o +X do bloco aponta para a outra
//    ombreira; o +Y, para o lado em que a folha abre — espelhar inverte). Os
//    ATRIBUTOS `LARGURA`, `ALTURA`, `PEITORIL` (mm) e `TIPO` (nome no projeto,
//    "P1") são LIDOS, não supostos; o que faltar cai nas hipóteses do painel.
//  - **Ambiente** = um `TEXT` com o nome, dentro do cômodo, na camada
//    `OPURA-AMBIENTE`.
//  - **Unidade** = milímetro; um arquivo por pavimento; desenho perto da origem.
//
// O template gerado aqui já traz as camadas, os blocos com atributos e um
// cômodo de exemplo; o projetista copia e desenha por cima.

import type { Point } from './blueprintKernel';
import type { LeituraDxf, SegmentoDxf } from './dxfLeitor';
import { acabarJuncoes, paredesDeEixos, type HipotesesDeEsquadrias, type ParedeComAberturas, type ResumoDeEsquadrias } from './dxfParaKernel';
import type { AberturaLida } from './emendaDeParedes';

export const PREFIXO_OPURA = 'OPURA-';
export const CAMADA_PAREDE_OPURA = /^OPURA-PAREDE-(\d{2,3})$/i;
export const BLOCO_OPURA = /^OPURA-(PORTA|JANELA|CORRER|VAO)$/i;
export const CAMADA_AMBIENTE_OPURA = 'OPURA-AMBIENTE';
export const CAMADA_ESQUADRIA_OPURA = 'OPURA-ESQUADRIA';
export const CAMADA_NOTAS_OPURA = 'OPURA-NOTAS';
export const VERSAO_DO_PADRAO = '1.0';

/** Larguras quando o atributo `LARGURA` falta ou não é número. */
const LARGURA_PADRAO_MM: Record<string, number> = { PORTA: 800, JANELA: 1200, CORRER: 1500, VAO: 1000 };

export interface AberturaOpura extends AberturaLida {
  /** `TIPO` do bloco ("P1", "J3") — vira `esquadria.nome`. */
  tipo?: string;
  correr?: boolean;
}

export interface ParedeOpura extends ParedeComAberturas {
  aberturas: AberturaOpura[];
}

export interface AmbienteOpura {
  at: Point;
  nome: string;
}

export interface LeituraOpura {
  paredes: ParedeOpura[];
  ambientes: AmbienteOpura[];
  resumo: ResumoDeEsquadrias & {
    /** Camadas `OPURA-PAREDE-*` encontradas, com a espessura e a contagem. */
    camadas: { camada: string; espessuraMm: number; paredes: number }[];
    correr: number;
    ambientes: number;
    /** Blocos OPURA que não encontraram parede a até meia espessura + 50 mm do ponto-base. */
    esquadriasSemParede: number;
    /** Blocos OPURA cuja largura não coube na parede (relatados, não importados). */
    esquadriasForaDaParede: number;
  };
}

/** O arquivo segue o padrão? Basta uma camada de parede OPURA ou um bloco OPURA. */
export function temPadraoOpura(leitura: Pick<LeituraDxf, 'porCamada' | 'insercoes'>): boolean {
  return leitura.porCamada.some((c) => CAMADA_PAREDE_OPURA.test(c.camada)) || leitura.insercoes.some((i) => BLOCO_OPURA.test(i.nome));
}

const numero = (v: string | undefined): number | null => {
  if (v === undefined) return null;
  const n = Number(String(v).replace(',', '.').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
};

/**
 * Lê um DXF no Padrão ÒPURA: paredes pelo eixo (espessura pela camada),
 * esquadrias pelos blocos com atributos, ambientes pelos textos. Unidade é
 * milímetro por definição do padrão.
 */
export function lerPadraoOpura(
  leitura: Pick<LeituraDxf, 'segmentos' | 'insercoes' | 'textos' | 'porCamada'>,
  alturaDaParedeMm: number,
  hip: HipotesesDeEsquadrias,
): LeituraOpura {
  const resumo: LeituraOpura['resumo'] = { portas: 0, janelas: 0, vaos: 0, arcosSemParede: 0, tocosDeBatente: 0, encostadas: 0, pontasSoltas: 0, cantosFechados: 0, camadas: [], correr: 0, ambientes: 0, esquadriasSemParede: 0, esquadriasForaDaParede: 0 };

  // ── Paredes: um traço, uma parede; a espessura está no nome da camada ────
  const porCamada = new Map<string, SegmentoDxf[]>();
  for (const s of leitura.segmentos) {
    if (!CAMADA_PAREDE_OPURA.test(s.camada)) continue;
    porCamada.set(s.camada, [...(porCamada.get(s.camada) ?? []), s]);
  }
  const paredes: ParedeOpura[] = [];
  for (const [camada, segs] of porCamada) {
    const espessuraMm = Number(CAMADA_PAREDE_OPURA.exec(camada)![1]);
    const lidas = paredesDeEixos(segs, 1, espessuraMm).map((p) => ({ ...p, aberturas: [] as AberturaOpura[] }));
    resumo.camadas.push({ camada, espessuraMm, paredes: lidas.length });
    paredes.push(...lidas);
  }
  resumo.camadas.sort((a, b) => a.espessuraMm - b.espessuraMm);

  // ── Esquadrias: bloco no eixo, +X para a outra ombreira, +Y para onde abre ──
  for (const ins of leitura.insercoes) {
    const m = BLOCO_OPURA.exec(ins.nome);
    if (!m) continue;
    const familia = m[1].toUpperCase();
    const largura = numero(ins.atributos.LARGURA) ?? LARGURA_PADRAO_MM[familia];
    const rad = (ins.rotacao * Math.PI) / 180;
    // +X do bloco no desenho (com o espelho em X); +Y do bloco (com o espelho em Y).
    const ex = { x: Math.cos(rad) * Math.sign(ins.sx || 1), y: Math.sin(rad) * Math.sign(ins.sx || 1) };
    const ey = { x: -Math.sin(rad) * Math.sign(ins.sy || 1), y: Math.cos(rad) * Math.sign(ins.sy || 1) };
    // A parede hospedeira: a de eixo mais perto do ponto-base, a até meia espessura + 50 mm, com o ponto dentro do trecho.
    let melhor: { p: ParedeOpura; t: number; ux: number; uy: number; L: number; n: number } | null = null;
    for (const p of paredes) {
      const L = Math.hypot(p.b.x - p.a.x, p.b.y - p.a.y) || 1;
      const ux = (p.b.x - p.a.x) / L;
      const uy = (p.b.y - p.a.y) / L;
      const n = (ins.x - p.a.x) * -uy + (ins.y - p.a.y) * ux;
      const t = (ins.x - p.a.x) * ux + (ins.y - p.a.y) * uy;
      if (Math.abs(n) > p.espessuraMm / 2 + 50 || t < -50 || t > L + 50) continue;
      // O bloco tem de estar ao longo desta parede, não da que cruza: |+X · u| perto de 1.
      if (Math.abs(ex.x * ux + ex.y * uy) < 0.9) continue;
      if (!melhor || Math.abs(n) < Math.abs(melhor.n)) melhor = { p, t, ux, uy, L, n };
    }
    if (!melhor) {
      resumo.esquadriasSemParede++;
      continue;
    }
    const { p, t, ux, uy, L } = melhor;
    const noSentido = ex.x * ux + ex.y * uy > 0;
    let offsetMm = Math.round(noSentido ? t : t - largura);
    // Folga de desenho: até 50 mm para fora entra encostado; mais que isso não cabe.
    if (offsetMm < 0 && offsetMm >= -50) offsetMm = 0;
    if (offsetMm + largura > L && offsetMm + largura <= L + 50) offsetMm = Math.round(L) - largura;
    if (offsetMm < 0 || offsetMm + largura > Math.round(L) || largura < 1) {
      resumo.esquadriasForaDaParede++;
      continue;
    }
    const nx = -uy;
    const ny = ux;
    const swingReversed = ey.x * nx + ey.y * ny < 0;
    const tipo = (ins.atributos.TIPO ?? '').trim() || undefined;
    const alturaAtrib = numero(ins.atributos.ALTURA);
    const peitorilAtrib = numero(ins.atributos.PEITORIL);
    let ab: AberturaOpura;
    if (familia === 'JANELA') {
      const sill = Math.min(peitorilAtrib ?? hip.janelaPeitorilMm, Math.max(0, alturaDaParedeMm - 1));
      ab = { kind: 'window', offsetMm, widthMm: largura, heightMm: Math.max(1, Math.min(alturaAtrib ?? hip.janelaAlturaMm, alturaDaParedeMm - sill)), sillMm: sill, tipo };
      resumo.janelas++;
    } else if (familia === 'VAO') {
      ab = { kind: 'passage', offsetMm, widthMm: largura, heightMm: Math.max(1, Math.min(alturaAtrib ?? alturaDaParedeMm, alturaDaParedeMm)), sillMm: 0 };
      resumo.vaos++;
    } else {
      ab = { kind: 'door', offsetMm, widthMm: largura, heightMm: Math.max(1, Math.min(alturaAtrib ?? hip.portaAlturaMm, alturaDaParedeMm)), sillMm: 0, hingeAtStart: noSentido, swingReversed, tipo, ...(familia === 'CORRER' ? { correr: true } : {}) };
      if (familia === 'CORRER') resumo.correr++;
      else resumo.portas++;
    }
    p.aberturas.push(ab);
  }
  for (const p of paredes) {
    p.aberturas.sort((x, y) => x.offsetMm - y.offsetMm);
    // Duas esquadrias no mesmo trecho: fica a primeira; a outra é relatada como fora.
    const semSobreposicao: AberturaOpura[] = [];
    for (const ab of p.aberturas) {
      const ultima = semSobreposicao[semSobreposicao.length - 1];
      if (ultima && ultima.offsetMm + ultima.widthMm > ab.offsetMm) {
        resumo.esquadriasForaDaParede++;
        continue;
      }
      semSobreposicao.push(ab);
    }
    p.aberturas = semSobreposicao;
  }

  // ── Ambientes: o texto dentro do cômodo ──────────────────────────────────
  const ambientes: AmbienteOpura[] = leitura.textos
    .filter((t) => t.camada.toUpperCase() === CAMADA_AMBIENTE_OPURA && t.texto.trim())
    .map((t) => ({ at: { x: Math.round(t.x), y: Math.round(t.y) }, nome: t.texto.trim().slice(0, 60) }));
  resumo.ambientes = ambientes.length;

  // ── Junções: quem desenha no eixo costuma encontrar os eixos; quem não encontrou, encosta ──
  const acabadas = acabarJuncoes(paredes, resumo) as ParedeOpura[];
  return { paredes: acabadas, ambientes, resumo };
}

// ─── O TEMPLATE ─────────────────────────────────────────────────────────────

const par = (codigo: number, valor: string | number): string => `${codigo}\n${valor}\n`;
const num = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(3));

function linha(camada: string, a: Point, b: Point): string {
  return par(0, 'LINE') + par(8, camada) + par(10, num(a.x)) + par(20, num(a.y)) + par(30, 0) + par(11, num(b.x)) + par(21, num(b.y)) + par(31, 0);
}
function arco(camada: string, c: Point, r: number, a0: number, a1: number): string {
  return par(0, 'ARC') + par(8, camada) + par(10, num(c.x)) + par(20, num(c.y)) + par(30, 0) + par(40, num(r)) + par(50, a0) + par(51, a1);
}
function texto(camada: string, p: Point, conteudo: string, alturaMm: number): string {
  return par(0, 'TEXT') + par(8, camada) + par(10, num(p.x)) + par(20, num(p.y)) + par(30, 0) + par(40, num(alturaMm)) + par(1, conteudo);
}
function attdef(tag: string, prompt: string, valor: string, p: Point): string {
  return par(0, 'ATTDEF') + par(8, '0') + par(10, num(p.x)) + par(20, num(p.y)) + par(30, 0) + par(40, 120) + par(1, valor) + par(3, prompt) + par(2, tag) + par(70, 0);
}
function attrib(tag: string, valor: string, p: Point): string {
  return par(0, 'ATTRIB') + par(8, CAMADA_ESQUADRIA_OPURA) + par(10, num(p.x)) + par(20, num(p.y)) + par(30, 0) + par(40, 120) + par(1, valor) + par(2, tag) + par(70, 0);
}
function bloco(nome: string, corpo: string): string {
  return par(0, 'BLOCK') + par(8, '0') + par(2, nome) + par(70, 2) + par(10, 0) + par(20, 0) + par(30, 0) + par(3, nome) + corpo + par(0, 'ENDBLK') + par(8, '0');
}
/** INSERT com atributos: código 66 = 1 e os ATTRIB até o SEQEND. */
function inserir(nome: string, p: Point, rotacao: number, atributos: [string, string][]): string {
  let s = par(0, 'INSERT') + par(8, CAMADA_ESQUADRIA_OPURA) + par(66, 1) + par(2, nome) + par(10, num(p.x)) + par(20, num(p.y)) + par(30, 0) + par(50, rotacao);
  atributos.forEach(([tag, valor], i) => {
    s += attrib(tag, valor, { x: p.x, y: p.y - 300 - i * 160 });
  });
  return s + par(0, 'SEQEND') + par(8, CAMADA_ESQUADRIA_OPURA);
}

/** As camadas do template, com a cor ACI. */
export const CAMADAS_DO_TEMPLATE: { nome: string; cor: number; para: string }[] = [
  { nome: 'OPURA-PAREDE-100', cor: 7, para: 'eixo de parede de 100 mm' },
  { nome: 'OPURA-PAREDE-150', cor: 7, para: 'eixo de parede de 150 mm' },
  { nome: 'OPURA-PAREDE-200', cor: 7, para: 'eixo de parede de 200 mm' },
  { nome: 'OPURA-PAREDE-250', cor: 7, para: 'eixo de parede de 250 mm' },
  { nome: CAMADA_ESQUADRIA_OPURA, cor: 1, para: 'blocos OPURA-PORTA, OPURA-JANELA, OPURA-CORRER, OPURA-VAO' },
  { nome: CAMADA_AMBIENTE_OPURA, cor: 3, para: 'TEXT com o nome do ambiente, dentro do cômodo' },
  { nome: CAMADA_NOTAS_OPURA, cor: 8, para: 'estas instruções (não é lida)' },
];

/** As regras do padrão, como vão escritas no próprio template e mostradas no painel. */
export const REGRAS_DO_PADRAO: string[] = [
  `PADRÃO ÒPURA DE DESENHO v${VERSAO_DO_PADRAO} — unidade MILÍMETRO, um arquivo por pavimento, desenho perto da origem.`,
  'PAREDE: um traço no EIXO da parede, na camada OPURA-PAREDE-<espessura em mm>. Crie OPURA-PAREDE-120 etc. se precisar de outra espessura.',
  'PORTA / JANELA / CORRER / VÃO: insira o bloco OPURA-PORTA, OPURA-JANELA, OPURA-CORRER ou OPURA-VAO com o ponto-base SOBRE o eixo da parede, na ombreira da dobradiça.',
  'Gire o bloco no sentido da parede: o +X do bloco aponta para a outra ombreira; o +Y, para o lado em que a folha abre (espelhe para inverter).',
  'Preencha os atributos: LARGURA, ALTURA e PEITORIL em mm; TIPO é o nome no projeto (P1, J3). O que faltar usa as hipóteses do painel de importação.',
  'AMBIENTE: um TEXT com o nome, dentro do cômodo, na camada OPURA-AMBIENTE.',
  'Não é preciso desenhar as faces das paredes nem o arco da porta: o símbolo do bloco já é o desenho.',
];

/** O template DXF (R12, ASCII) com camadas, blocos com atributos, um cômodo de exemplo e as regras. */
export function gerarTemplateOpura(): string {
  let dxf = par(999, `Padrão ÒPURA de desenho v${VERSAO_DO_PADRAO} - template para importação na Planta Inteligente - mm`);
  dxf += par(0, 'SECTION') + par(2, 'HEADER') + par(9, '$ACADVER') + par(1, 'AC1009') + par(9, '$INSUNITS') + par(70, 4) + par(9, '$MEASUREMENT') + par(70, 1) + par(0, 'ENDSEC');
  dxf += par(0, 'SECTION') + par(2, 'TABLES') + par(0, 'TABLE') + par(2, 'LAYER') + par(70, CAMADAS_DO_TEMPLATE.length);
  for (const c of CAMADAS_DO_TEMPLATE) dxf += par(0, 'LAYER') + par(2, c.nome) + par(70, 0) + par(62, c.cor) + par(6, 'CONTINUOUS');
  dxf += par(0, 'ENDTAB') + par(0, 'ENDSEC');

  // ── Blocos ───────────────────────────────────────────────────────────────
  dxf += par(0, 'SECTION') + par(2, 'BLOCKS');
  // Porta: ombreiras, folha aberta a 90° e o arco — no referencial do bloco (dobradiça na origem, vão ao longo de +X).
  dxf += bloco('OPURA-PORTA',
    linha('0', { x: 0, y: -75 }, { x: 0, y: 75 }) + linha('0', { x: 800, y: -75 }, { x: 800, y: 75 }) +
    linha('0', { x: 0, y: 0 }, { x: 0, y: 800 }) + arco('0', { x: 0, y: 0 }, 800, 0, 90) +
    attdef('LARGURA', 'Largura do vão (mm)', '800', { x: 0, y: -300 }) + attdef('ALTURA', 'Altura do vão (mm)', '2100', { x: 0, y: -460 }) + attdef('TIPO', 'Nome no projeto', 'P1', { x: 0, y: -620 }));
  dxf += bloco('OPURA-JANELA',
    linha('0', { x: 0, y: -75 }, { x: 0, y: 75 }) + linha('0', { x: 1200, y: -75 }, { x: 1200, y: 75 }) +
    linha('0', { x: 0, y: -25 }, { x: 1200, y: -25 }) + linha('0', { x: 0, y: 25 }, { x: 1200, y: 25 }) +
    attdef('LARGURA', 'Largura do vão (mm)', '1200', { x: 0, y: -300 }) + attdef('ALTURA', 'Altura da janela (mm)', '1200', { x: 0, y: -460 }) + attdef('PEITORIL', 'Peitoril (mm)', '1000', { x: 0, y: -620 }) + attdef('TIPO', 'Nome no projeto', 'J1', { x: 0, y: -780 }));
  dxf += bloco('OPURA-CORRER',
    linha('0', { x: 0, y: -75 }, { x: 0, y: 75 }) + linha('0', { x: 1500, y: -75 }, { x: 1500, y: 75 }) +
    linha('0', { x: 0, y: 120 }, { x: 750, y: 120 }) + linha('0', { x: 750, y: 40 }, { x: 1500, y: 40 }) +
    attdef('LARGURA', 'Largura do vão (mm)', '1500', { x: 0, y: -300 }) + attdef('ALTURA', 'Altura do vão (mm)', '2100', { x: 0, y: -460 }) + attdef('TIPO', 'Nome no projeto', 'PC1', { x: 0, y: -620 }));
  dxf += bloco('OPURA-VAO',
    linha('0', { x: 0, y: -75 }, { x: 0, y: 75 }) + linha('0', { x: 1000, y: -75 }, { x: 1000, y: 75 }) +
    attdef('LARGURA', 'Largura do vão (mm)', '1000', { x: 0, y: -300 }) + attdef('ALTURA', 'Altura do vão (mm; vazio = pé-direito)', '', { x: 0, y: -460 }));
  dxf += par(0, 'ENDSEC');

  // ── Exemplo: um cômodo de 4 × 3 m com porta, janela e nome ───────────────
  dxf += par(0, 'SECTION') + par(2, 'ENTITIES');
  const P = 'OPURA-PAREDE-150';
  dxf += linha(P, { x: 0, y: 0 }, { x: 4000, y: 0 }) + linha(P, { x: 4000, y: 0 }, { x: 4000, y: 3000 }) + linha(P, { x: 4000, y: 3000 }, { x: 0, y: 3000 }) + linha(P, { x: 0, y: 3000 }, { x: 0, y: 0 });
  dxf += inserir('OPURA-PORTA', { x: 1000, y: 0 }, 0, [['LARGURA', '800'], ['ALTURA', '2100'], ['TIPO', 'P1']]);
  dxf += inserir('OPURA-JANELA', { x: 1400, y: 3000 }, 0, [['LARGURA', '1200'], ['ALTURA', '1200'], ['PEITORIL', '1000'], ['TIPO', 'J1']]);
  dxf += texto(CAMADA_AMBIENTE_OPURA, { x: 1700, y: 1500 }, 'SALA', 200);
  REGRAS_DO_PADRAO.forEach((r, i) => {
    dxf += texto(CAMADA_NOTAS_OPURA, { x: 0, y: -1500 - i * 300 }, r, 150);
  });
  dxf += par(0, 'ENDSEC') + par(0, 'EOF');
  return dxf;
}
