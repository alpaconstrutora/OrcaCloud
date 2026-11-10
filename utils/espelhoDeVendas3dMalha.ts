// utils/espelhoDeVendas3dMalha.ts
//
// ESPELHO DE VENDAS 3D (09/11/2026) — o que a cena e a casca combinam, sem three: os GRUPOS de desenho (um por
// status, mais o dos pisos sem unidade), de qual prisma é cada triângulo tocado, a paleta e a frase que diz os
// números. Plano: docs/planos/2026-11-09-espelho-de-vendas-3d.md. Puro.
//
// Por que grupos: centenas de unidades viram poucas malhas (uma por status), e não uma por unidade. O toque devolve
// o índice do TRIÂNGULO na malha do grupo; `prismaDaFace` acha a unidade pela faixa de triângulos de cada prisma.

import { SALE_STATUS_COLORS, type SaleUnitStatus } from '../lib/salesAnalysis';
import { contagemPorStatus, type PrismaDoEspelho } from './espelhoDeVendas3d';

/** A cor e os nomes de cada status. O corretor e o investidor trazem a sua; esta é a da Análise de Vendas. */
export type PaletaDoEspelho = Record<SaleUnitStatus, { cor: string; rotulo: string; plural: string }>;

export const PALETA_PADRAO_DO_ESPELHO: PaletaDoEspelho = {
  available: { cor: SALE_STATUS_COLORS.available, rotulo: 'Disponível', plural: 'Disponíveis' },
  reserved: { cor: SALE_STATUS_COLORS.reserved, rotulo: 'Em negociação', plural: 'Em negociação' },
  sold: { cor: SALE_STATUS_COLORS.sold, rotulo: 'Vendida', plural: 'Vendidas' },
  exchanged: { cor: SALE_STATUS_COLORS.exchanged, rotulo: 'Permutada', plural: 'Permutadas' },
  other: { cor: SALE_STATUS_COLORS.other, rotulo: 'Outro status', plural: 'Outros status' },
};

/** O que o cadastro diz da unidade, além do que o prisma já traz (torre, andar, nome, status) — a ficha. */
export interface DadosDaUnidade {
  tipologia?: string | null;
  areaPrivativaM2?: number | null;
  dormitorios?: number | null;
  banheiros?: number | null;
  vagas?: number | null;
  /** Preço de tabela; só aparece com `mostrarPreco`. */
  preco?: number | null;
  fotoUrl?: string | null;
  /** A planta baixa da tipologia da unidade (F5); sem ela a ficha não mostra o trecho. */
  plantaUrl?: string | null;
  /**
   * A vista da janela da unidade (F6). `undefined` = o prédio não tem vista cadastrada (a ficha nem fala nisso);
   * `null` = o prédio tem, mas nenhuma cobre o andar/face desta unidade (botão desligado, com o motivo).
   */
  vista?: VistaDaFicha | null;
}

export interface VistaDaFicha {
  url: string;
  legenda: string | null;
  /** O que a foto cobre: "4º ao 12º pavimento · face Norte". */
  cobre: string;
}

/** A ordem da legenda: o que está à venda primeiro. */
export const ORDEM_DOS_STATUS: readonly SaleUnitStatus[] = ['available', 'reserved', 'sold', 'exchanged', 'other'];

/** O piso sem unidade (térreo de lazer, cobertura técnica): volume neutro, sem status. */
export const COR_DO_PISO_SEM_UNIDADE = '#e5e7eb';
/** A unidade que o "Destacar" apagou. */
export const COR_DA_UNIDADE_APAGADA = '#e2e8f0';

export type ChaveDoGrupo = SaleUnitStatus | 'piso';

export interface GrupoDoEspelho {
  chave: ChaveDoGrupo;
  prismas: PrismaDoEspelho[];
}

/**
 * Os prismas ACIMA do solo, um grupo por status e um dos pisos sem unidade; grupo vazio não entra. O subsolo fica
 * fora do desenho (a lista por andar o mostra): debaixo do chão ele não se vê, e à mostra esconderia a torre.
 */
export function gruposDoEspelho(prismas: readonly PrismaDoEspelho[]): GrupoDoEspelho[] {
  const por = new Map<ChaveDoGrupo, PrismaDoEspelho[]>();
  for (const p of prismas) {
    if (p.abaixoDoSolo) continue;
    const chave: ChaveDoGrupo = p.unitId && p.status ? p.status : 'piso';
    const lista = por.get(chave);
    if (lista) lista.push(p);
    else por.set(chave, [p]);
  }
  const ordem: ChaveDoGrupo[] = [...ORDEM_DOS_STATUS, 'piso'];
  return ordem.filter((c) => por.has(c)).map((chave) => ({ chave, prismas: por.get(chave)! }));
}

/** O 1º triângulo de cada prisma na malha do grupo, dado quantos triângulos cada um tem — mais o total no fim. */
export function iniciosDasFaces(triangulosPorPrisma: readonly number[]): number[] {
  const out = [0];
  for (const n of triangulosPorPrisma) out.push(out[out.length - 1] + Math.max(0, Math.floor(n)));
  return out;
}

/** O índice do prisma dono do triângulo `face` (busca binária nos inícios); -1 = fora da malha. */
export function prismaDaFace(inicios: readonly number[], face: number | null | undefined): number {
  if (face == null || !Number.isFinite(face) || face < 0 || inicios.length < 2 || face >= inicios[inicios.length - 1]) return -1;
  let lo = 0;
  let hi = inicios.length - 2;
  while (lo < hi) {
    const meio = (lo + hi + 1) >> 1;
    if (inicios[meio] <= face) lo = meio;
    else hi = meio - 1;
  }
  return lo;
}

/** A frase com os números — o nome acessível do desenho (§28.5: diz os números, não "gráfico"). */
export function resumoDoEspelho(prismas: readonly PrismaDoEspelho[], paleta: PaletaDoEspelho = PALETA_PADRAO_DO_ESPELHO): string {
  const n = contagemPorStatus(prismas);
  const total = ORDEM_DOS_STATUS.reduce((s, k) => s + n[k], 0);
  if (total === 0) return 'Nenhuma unidade para mostrar.';
  const partes = ORDEM_DOS_STATUS.filter((k) => n[k] > 0).map((k) => `${n[k]} ${(n[k] === 1 ? paleta[k].rotulo : paleta[k].plural).toLowerCase()}`);
  return `${total} ${total === 1 ? 'unidade' : 'unidades'}: ${partes.join(', ')}.`;
}
