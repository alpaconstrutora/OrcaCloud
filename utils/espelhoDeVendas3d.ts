// utils/espelhoDeVendas3d.ts
//
// ESPELHO DE VENDAS 3D (09/11/2026): a torre do Empreendimento em 3D, cada unidade um prisma colorido pelo status
// da venda, para os Portais do Corretor e do Investidor (o pedido nasceu de um vídeo de quiosque de vendas).
// Plano: docs/planos/2026-11-09-espelho-de-vendas-3d.md.
//
// Aqui mora só o MODELO da cena: de torres + pavimentos + unidades para uma lista de prismas (anel em mm, base e
// topo). Quem desenha é o componente. Nada novo de geometria: os pisos, as elevações e as alturas são os de
// `estruturaDaTorre`, e o andar é fatiado por `arrumarUnidades` + `arranjarAndar` — os mesmos do 3D da Planta, para a
// unidade cair no mesmo lugar nos dois.
//
// O CONTORNO (decisão do usuário: híbrido): o do Bloco da Planta quando a torre o tem; sem ele, um retângulo
// ESQUEMÁTICO com a área do maior andar. Com todas as torres vindas da Planta valem as coordenadas do desenho; com
// alguma esquemática, as torres ficam lado a lado. As folgas do esquemático são hipóteses editáveis
// (`HIPOTESES_PADRAO_DO_ESPELHO`), nunca constante escondida. Puro.
//
// ⚠️ Só `import type` do kernel da Planta: este arquivo entra no pacote dos portais.

import type { Point } from './blueprintKernel';
import { PE_DIREITO_DO_CALCULO_MM, estruturaDaTorre, type PisoDaTorre, type TorreParaEstrutura, type UnidadeDoPiso } from './blueprintEstruturaDaTorre';
import { arranjarAndar, arrumacaoEfetiva, arrumarUnidades, type ReferenciasDaPlanta } from './blueprintUnidadesNoPavimento';
import { distanciaDoPar, type DistanciaEntreTorres } from './empreendimentoDistanciasEntreTorres';
import { saleUnitClassifier, type SaleUnitStatus } from '../lib/salesAnalysis';
import type { EmpreendimentoFloor } from '../types/empreendimento';

/** O contorno da torre como a Planta o desenhou: o anel do Bloco (mm), a frente do lote e o norte do desenho. */
export interface ContornoDaTorre {
  anel: Point[];
  /** Unitária, da frente do lote para a rua; null = o lote não tem frente. */
  frenteParaFora?: Point | null;
  rotacaoNorteDeg?: number | null;
}

export type TorreDoEspelho = TorreParaEstrutura & { units_per_floor?: number | null; contorno?: ContornoDaTorre | null };

/** As folgas do desenho esquemático (torre sem contorno da Planta). */
export interface HipotesesDoEspelho {
  /** Área de uma unidade sem área privativa no cadastro, em m². */
  areaPadraoDaUnidadeM2: number;
  /** Frente ÷ profundidade do retângulo esquemático. */
  proporcaoDoRetangulo: number;
  /** Vão entre duas torres lado a lado sem distância declarada no Empreendimento, em mm. */
  afastamentoEntreTorresMm: number;
}

export const HIPOTESES_PADRAO_DO_ESPELHO: HipotesesDoEspelho = {
  areaPadraoDaUnidadeM2: 70,
  proporcaoDoRetangulo: 2,
  afastamentoEntreTorresMm: 10_000,
};

export interface PrismaDoEspelho {
  chave: string;
  /** null = o andar não tem unidade (térreo de lazer, garagem): o contorno inteiro, sem status. */
  unitId: string | null;
  torreId: string;
  torre: string;
  /** Andar do Empreendimento: 0 = térreo, negativo = abaixo do solo. */
  andar: number;
  nomeDoAndar: string;
  rotulo: string | null;
  /** Em mm, nas coordenadas da cena. */
  anel: Point[];
  baseMm: number;
  topoMm: number;
  status: SaleUnitStatus | null;
  abaixoDoSolo: boolean;
}

export interface CaixaNoChao {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface TorreNaCena {
  torreId: string;
  nome: string;
  /** De onde veio o contorno: do Bloco da Planta ou do retângulo esquemático. */
  origem: 'PLANTA' | 'ESQUEMATICA';
  caixa: CaixaNoChao;
  baseMm: number;
  topoMm: number;
  pisos: number;
  unidades: number;
}

export interface CenaDoEspelho {
  prismas: PrismaDoEspelho[];
  torres: TorreNaCena[];
  caixa: CaixaNoChao & { baseMm: number; topoMm: number };
  avisos: string[];
}

export interface EntradaDaCena {
  torres: readonly TorreDoEspelho[];
  pavimentosPorTorre?: ReadonlyMap<string, EmpreendimentoFloor[]>;
  /** O status de cada unidade (pelo id) quando quem chama já o resolveu pela negociação; sem ele, o do cadastro. */
  statusPorUnidade?: ReadonlyMap<string, SaleUnitStatus>;
  /** `empreendimentos.distancias_entre_torres`, já lido por `lerDistancias`. */
  distancias?: readonly DistanciaEntreTorres[];
  hipoteses?: Partial<HipotesesDoEspelho>;
}

const caixaDe = (anel: readonly Point[]): CaixaNoChao => ({
  minX: Math.min(...anel.map((p) => p.x)),
  minY: Math.min(...anel.map((p) => p.y)),
  maxX: Math.max(...anel.map((p) => p.x)),
  maxY: Math.max(...anel.map((p) => p.y)),
});

function areaMm2(anel: readonly Point[]): number {
  let s = 0;
  for (let i = 0; i < anel.length; i++) {
    const p = anel[i];
    const q = anel[(i + 1) % anel.length];
    s += p.x * q.y - q.x * p.y;
  }
  return Math.abs(s) / 2;
}

const contornoValido = (c: ContornoDaTorre | null | undefined): c is ContornoDaTorre =>
  !!c && Array.isArray(c.anel) && c.anel.length >= 3 && c.anel.every((p) => Number.isFinite(p?.x) && Number.isFinite(p?.y)) && areaMm2(c.anel) > 0;

/** A frente do retângulo esquemático: o lado de baixo (−Y), virado para quem olha. */
const FRENTE_DO_ESQUEMATICO: Point = { x: 0, y: -1 };

/** O retângulo esquemático: a área do andar mais cheio (a soma das privativas), com a frente no lado maior. */
function retanguloEsquematico(t: TorreDoEspelho, pisos: readonly PisoDaTorre[], h: HipotesesDoEspelho): Point[] {
  const doAndar = (p: PisoDaTorre) => p.unidades.reduce((s, u) => s + (u.areaPrivativaM2 ?? h.areaPadraoDaUnidadeM2), 0);
  const maior = Math.max(0, ...pisos.map(doAndar));
  const m2 = maior > 0 ? maior : h.areaPadraoDaUnidadeM2 * Math.max(1, Math.round(t.units_per_floor ?? 1));
  const largura = Math.round(Math.sqrt(m2 * h.proporcaoDoRetangulo) * 1000);
  const profundidade = Math.round((m2 * 1e6) / largura);
  return [{ x: 0, y: 0 }, { x: largura, y: 0 }, { x: largura, y: profundidade }, { x: 0, y: profundidade }];
}

interface UnidadeNaFatia {
  nome: string;
  posicao: string | null;
  orientacao: string | null;
  vaga: number | null;
  u: UnidadeDoPiso;
}

interface TorreMontada {
  t: TorreDoEspelho;
  nome: string;
  origem: TorreNaCena['origem'];
  /** O contorno, ainda nas coordenadas de origem (as da Planta, ou o retângulo a partir de 0,0). */
  anel: Point[];
  ref: ReferenciasDaPlanta;
  pisos: PisoDaTorre[];
  ordem: ReturnType<typeof arrumacaoEfetiva>;
}

/** Os prismas de um piso: uma fatia por unidade, ou o contorno inteiro quando o andar não tem unidade. */
function prismasDoPiso(m: TorreMontada, piso: PisoDaTorre, anel: Point[], statusDe: (u: UnidadeDoPiso) => SaleUnitStatus, avisos: Set<string>): PrismaDoEspelho[] {
  const comum = {
    torreId: m.t.id,
    torre: m.nome,
    andar: piso.numero,
    nomeDoAndar: piso.nome,
    baseMm: piso.elevacaoMm,
    topoMm: piso.elevacaoMm + (piso.alturaMm ?? PE_DIREITO_DO_CALCULO_MM),
    abaixoDoSolo: piso.numero < 0,
  };
  const inteiro = (): PrismaDoEspelho[] => [{ ...comum, chave: `${m.t.id}:${piso.numero}:piso`, unitId: null, rotulo: null, anel, status: null }];
  if (piso.unidades.length === 0) return inteiro();

  // No esquemático não há norte: o sol do cadastro não diz nada sobre o retângulo, só a Posição (Frente/Fundos/Lateral).
  const naFatia: UnidadeNaFatia[] = piso.unidades.map((u) => ({ nome: u.nome, posicao: u.posicao, orientacao: m.origem === 'PLANTA' ? u.orientacao : null, vaga: u.vaga ?? null, u }));
  const arrumadas = arrumarUnidades(naFatia, m.ordem, m.ref);
  for (const a of arrumadas.avisos ?? []) avisos.add(`Torre "${m.nome}": ${a}`);
  const { fatias } = arranjarAndar(anel, arrumadas.unidades.map((x) => x.u.areaPrivativaM2), arrumadas);
  if (fatias.length !== arrumadas.unidades.length || fatias.some((f) => !f || f.length < 3)) {
    avisos.add(`Torre "${m.nome}": o ${piso.nome} não pôde ser dividido nas ${piso.unidades.length} unidades — aparece inteiro, sem status.`);
    return inteiro();
  }
  return fatias.map((fatia, k) => {
    const { u } = arrumadas.unidades[k];
    return { ...comum, chave: `${m.t.id}:${piso.numero}:${u.id ?? `u${k}`}`, unitId: u.id, rotulo: u.nome, anel: fatia, status: statusDe(u) };
  });
}

/**
 * A cena do espelho: as torres que são edifício (quadra de loteamento fica fora), na ordem da aba Torres e Unidades,
 * cada piso em prismas. Torre sem pavimento nem unidade não entra — o aviso diz por quê.
 */
export function montarCenaDoEspelho(entrada: EntradaDaCena): CenaDoEspelho {
  const h: HipotesesDoEspelho = { ...HIPOTESES_PADRAO_DO_ESPELHO, ...entrada.hipoteses };
  const avisos = new Set<string>();
  const doCadastro = saleUnitClassifier([]);
  const statusDe = (u: UnidadeDoPiso): SaleUnitStatus => (u.id ? entrada.statusPorUnidade?.get(u.id) : undefined) ?? doCadastro.statusOf({ id: u.id ?? '', status: u.status });

  const montadas: TorreMontada[] = [];
  const torres = entrada.torres
    .filter((t) => !t.blueprint_quadra_uid)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name, 'pt-BR', { numeric: true }));
  for (const t of torres) {
    const e = estruturaDaTorre(t, entrada.pavimentosPorTorre?.get(t.id) ?? []);
    for (const a of e.avisos) avisos.add(a);
    const pisos = [...e.garagens, ...e.acima];
    if (pisos.length === 0) continue;
    const daPlanta = contornoValido(t.contorno);
    if (t.contorno && !daPlanta) avisos.add(`Torre "${e.nome}": o contorno vindo da Planta não é um polígono — a torre aparece esquemática.`);
    montadas.push({
      t,
      nome: e.nome,
      origem: daPlanta ? 'PLANTA' : 'ESQUEMATICA',
      anel: daPlanta ? t.contorno!.anel.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) })) : retanguloEsquematico(t, pisos, h),
      ref: daPlanta ? { frenteParaFora: t.contorno!.frenteParaFora ?? null, rotacaoNorteDeg: t.contorno!.rotacaoNorteDeg ?? null } : { frenteParaFora: FRENTE_DO_ESQUEMATICO, rotacaoNorteDeg: null },
      pisos,
      ordem: arrumacaoEfetiva('DO_EMPREENDIMENTO', e.ordemDasUnidades),
    });
  }

  // Todas da Planta: as coordenadas do desenho (as torres já estão onde o projeto as pôs). Senão, lado a lado.
  const ladoALado = montadas.some((m) => m.origem === 'ESQUEMATICA');
  const prismas: PrismaDoEspelho[] = [];
  const naCena: TorreNaCena[] = [];
  let cursor = 0;
  let anterior: TorreMontada | null = null;
  for (const m of montadas) {
    let anel = m.anel;
    if (ladoALado) {
      const c = caixaDe(anel);
      if (anterior) {
        const declarada = distanciaDoPar(entrada.distancias ?? [], anterior.t.id, m.t.id);
        cursor += declarada != null ? Math.round(declarada * 1000) : h.afastamentoEntreTorresMm;
      }
      const dx = cursor - c.minX;
      const dy = -c.minY;
      anel = anel.map((p) => ({ x: p.x + dx, y: p.y + dy }));
      cursor += c.maxX - c.minX;
    }
    const daTorre = m.pisos.flatMap((piso) => prismasDoPiso(m, piso, anel, statusDe, avisos));
    prismas.push(...daTorre);
    naCena.push({
      torreId: m.t.id,
      nome: m.nome,
      origem: m.origem,
      caixa: caixaDe(anel),
      baseMm: Math.min(...daTorre.map((p) => p.baseMm)),
      topoMm: Math.max(...daTorre.map((p) => p.topoMm)),
      pisos: m.pisos.length,
      unidades: daTorre.filter((p) => p.unitId).length,
    });
    anterior = m;
  }

  const caixa =
    naCena.length === 0
      ? { minX: 0, minY: 0, maxX: 0, maxY: 0, baseMm: 0, topoMm: 0 }
      : {
          minX: Math.min(...naCena.map((t) => t.caixa.minX)),
          minY: Math.min(...naCena.map((t) => t.caixa.minY)),
          maxX: Math.max(...naCena.map((t) => t.caixa.maxX)),
          maxY: Math.max(...naCena.map((t) => t.caixa.maxY)),
          baseMm: Math.min(...naCena.map((t) => t.baseMm)),
          topoMm: Math.max(...naCena.map((t) => t.topoMm)),
        };
  return { prismas, torres: naCena, caixa, avisos: [...avisos] };
}

/** Quantas unidades em cada status — os números da legenda. Piso sem unidade não conta. */
export function contagemPorStatus(prismas: readonly PrismaDoEspelho[]): Record<SaleUnitStatus, number> {
  const out: Record<SaleUnitStatus, number> = { sold: 0, reserved: 0, available: 0, exchanged: 0, other: 0 };
  for (const p of prismas) if (p.unitId && p.status) out[p.status] += 1;
  return out;
}
