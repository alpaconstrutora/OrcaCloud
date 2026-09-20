/**
 * FASES DE REFORMA (20/09/2026, roadmap E10.2) — a parte PURA fora do kernel:
 * a cor de cada fase na tela, o FILTRO de vista (tudo / antes / depois / só
 * demolição) traduzido em ids ocultos, o que a seleção tem de fase (para os
 * botões do ribbon), e o resumo em frases do que se demole e do que se constrói.
 *
 * O kernel guarda `fase` (E10.2) e calcula os quantitativos por fase; aqui só
 * mora o que é leitura de tela.
 */
import { faseDe, type BlueprintModel, type FaseDeReforma, type ObjectId, type Quantitativos } from './blueprintKernel';

export type FiltroDeFase = 'TUDO' | 'ANTES' | 'DEPOIS' | 'DEMOLICAO';
export const FILTROS_DE_FASE: readonly FiltroDeFase[] = ['TUDO', 'ANTES', 'DEPOIS', 'DEMOLICAO'];
export const ROTULO_DO_FILTRO_DE_FASE: Record<FiltroDeFase, string> = {
  TUDO: 'Tudo (existente, a demolir e novo)',
  ANTES: 'Antes da reforma (existente + a demolir)',
  DEPOIS: 'Depois da reforma (existente + novo)',
  DEMOLICAO: 'Só o que se demole',
};

/** Que fases cada filtro deixa VISÍVEIS. */
export const FASES_VISIVEIS: Record<FiltroDeFase, readonly FaseDeReforma[]> = {
  TUDO: ['EXISTENTE', 'DEMOLIR', 'NOVO'],
  ANTES: ['EXISTENTE', 'DEMOLIR'],
  DEPOIS: ['EXISTENTE', 'NOVO'],
  DEMOLICAO: ['DEMOLIR'],
};

/** Cores por fase — as convenções de planta de reforma: existente cinza, demolir vermelho tracejado, novo como sempre. */
export const COR_DA_FASE: Record<FaseDeReforma, { traco: string; fundo: string; tracejado: boolean }> = {
  EXISTENTE: { traco: '#94a3b8', fundo: 'rgba(148, 163, 184, 0.25)', tracejado: false },
  DEMOLIR: { traco: '#dc2626', fundo: 'rgba(220, 38, 38, 0.10)', tracejado: true },
  NOVO: { traco: '#334155', fundo: 'rgba(51, 65, 85, 0.10)', tracejado: false },
};

/** As peças que têm fase: paredes, aberturas, estruturas e componentes. */
export function pecasComFase(model: BlueprintModel): { id: ObjectId; fase: FaseDeReforma; familia: 'parede' | 'abertura' | 'estrutura' | 'componente' }[] {
  return [
    ...model.walls.map((w) => ({ id: w.id, fase: faseDe(w), familia: 'parede' as const })),
    ...model.openings.map((o) => ({ id: o.id, fase: faseDe(o), familia: 'abertura' as const })),
    ...(model.structures ?? []).map((s) => ({ id: s.id, fase: faseDe(s), familia: 'estrutura' as const })),
    ...(model.componentes ?? []).map((c) => ({ id: c.id, fase: faseDe(c), familia: 'componente' as const })),
  ];
}

/** Os ids que o filtro ESCONDE. Vazio em `TUDO`. Abertura de parede escondida some junto (o canvas já faz isso pela parede). */
export function idsOcultosPelaFase(model: BlueprintModel, filtro: FiltroDeFase): Set<ObjectId> {
  const visiveis = new Set<FaseDeReforma>(FASES_VISIVEIS[filtro]);
  const out = new Set<ObjectId>();
  if (filtro === 'TUDO') return out;
  for (const p of pecasComFase(model)) if (!visiveis.has(p.fase)) out.add(p.id);
  return out;
}

/** id → fase, para o canvas colorir sem varrer o modelo a cada peça. */
export function fasePorId(model: BlueprintModel): Map<ObjectId, FaseDeReforma> {
  const m = new Map<ObjectId, FaseDeReforma>();
  for (const p of pecasComFase(model)) if (p.fase !== 'NOVO') m.set(p.id, p.fase);
  return m;
}

/** Quantas peças há por fase (para os botões do ribbon). */
export function contagemPorFase(model: BlueprintModel): Record<FaseDeReforma, number> {
  const c: Record<FaseDeReforma, number> = { EXISTENTE: 0, DEMOLIR: 0, NOVO: 0 };
  for (const p of pecasComFase(model)) c[p.fase]++;
  return c;
}

/**
 * Dos ids selecionados, os que TÊM fase (parede, abertura, estrutura,
 * componente) e a fase comum a todos (`null` = misto ou nenhum).
 */
export function faseDaSelecao(model: BlueprintModel, ids: readonly ObjectId[]): { ids: ObjectId[]; fase: FaseDeReforma | null } {
  const conjunto = new Set(ids);
  const pecas = pecasComFase(model).filter((p) => conjunto.has(p.id));
  const fases = new Set(pecas.map((p) => p.fase));
  return { ids: pecas.map((p) => p.id), fase: fases.size === 1 ? [...fases][0] : null };
}

const f2 = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Frases para o resumo da tela Antes/Depois e do ribbon. */
export function resumirFases(quant: Quantitativos): { demolicao: string; existente: string; novo: string } {
  const d = quant.totais.demolicao;
  const e = quant.totais.existente;
  const novo = quant.paredes.filter((p) => p.fase === 'NOVO');
  return {
    demolicao: d.paredes + d.aberturas + d.estruturas === 0 ? 'Nada a demolir.' : `${d.paredes} parede(s) · ${f2(d.areaParedeM2)} m² · ${f2(d.volumeAlvenariaM3)} m³ de alvenaria · ${d.aberturas} esquadria(s) a remover${d.estruturas ? ` · ${d.estruturas} peça(s) estrutural(is), ${f2(d.volumeConcretoM3)} m³` : ''}`,
    existente: e.paredes + e.aberturas + e.estruturas === 0 ? 'Nada marcado como existente: o desenho inteiro é construção nova.' : `${e.paredes} parede(s) existentes ficam (${f2(e.comprimentoParedeM)} m) · ${e.aberturas} esquadria(s)`,
    novo: `${novo.length} parede(s) novas · ${f2(quant.totais.areaParedeDuasFacesM2 / 2)} m² de face · ${f2(quant.totais.volumeAlvenariaM3)} m³ de alvenaria · ${quant.totais.portas + quant.totais.janelas + quant.totais.portasDeCorrer + quant.totais.vaosLivres} esquadria(s)`,
  };
}
