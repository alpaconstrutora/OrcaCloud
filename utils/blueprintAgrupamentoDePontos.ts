/**
 * AGRUPAMENTO dos pontos elétricos numa lista (13/09/2026).
 *
 * Pedido: no Quadro de cargas *"aparecem todos os pontos elétricos. agrupe-os
 * por ambiente"* — e, em seguida, *"ofereça ao usuário a forma que ele quer
 * agrupar; sugira agrupar por ambiente e ele decide"*. Então há um CRITÉRIO,
 * escolhido na tela e persistido, com "ambiente" como o sugerido.
 *
 * O pertencimento ao ambiente é a MESMA regra da conferência NBR 5410
 * (`terminaisDoAmbiente`): o ponto cai dentro do contorno de eixo do ambiente
 * e fora dos furos. Uma segunda regra aqui faria a lista e a conferência
 * discordarem sobre em que cômodo uma tomada está.
 */
import {
  pointInPolygon,
  type BlueprintModel,
  type Space,
  type Terminal,
} from './blueprintKernel';
import { GRUPO_DO_PONTO_ELETRICO } from './blueprintRede';

export const CRITERIOS_DE_AGRUPAMENTO = ['ambiente', 'tipo', 'pavimento', 'nenhum'] as const;
export type CriterioDeAgrupamento = (typeof CRITERIOS_DE_AGRUPAMENTO)[number];

export const ROTULO_DO_CRITERIO: Record<CriterioDeAgrupamento, string> = {
  ambiente: 'Ambiente',
  tipo: 'Tipo de ponto',
  pavimento: 'Pavimento',
  nenhum: 'Sem agrupar',
};

/** O que a tela sugere quando ninguém escolheu ainda. */
export const CRITERIO_SUGERIDO: CriterioDeAgrupamento = 'ambiente';

export const FORA_DE_AMBIENTE = 'Fora de ambiente';
const A_CLASSIFICAR = 'A classificar';

/**
 * O ambiente que contém o ponto, com o nome que a tela usa: o da etiqueta,
 * ou "Ambiente N" pela ordem no pavimento. `null` = fora de qualquer contorno
 * fechado (ponto solto no lote, ou planta sem ambiente ainda).
 */
export function ambienteDoPonto(
  model: BlueprintModel,
  t: Pick<Terminal, 'levelId' | 'at'>,
): { space: Space; nome: string } | null {
  const doNivel = model.spaces.filter((s) => s.levelId === t.levelId);
  for (let i = 0; i < doNivel.length; i++) {
    const s = doNivel[i];
    if (pointInPolygon(s.ring, t.at) && !s.holes.some((h) => pointInPolygon(h, t.at))) {
      return { space: s, nome: s.name?.trim() || `Ambiente ${i + 1}` };
    }
  }
  return null;
}

export interface GrupoDePontos<T> {
  chave: string;
  /** Vazio no critério "nenhum" — a lista sai lisa, sem cabeçalho. */
  titulo: string;
  itens: T[];
}

/**
 * Agrupa itens que apontam para terminais. Genérico sobre o item para servir
 * à lista de pontos soltos (que carrega rótulo e id) sem obrigar a converter.
 *
 * A ORDEM dos grupos é a de leitura, não a alfabética: ambientes na ordem do
 * pavimento (e "Fora de ambiente" por último); tipos na ordem da taxonomia
 * (iluminação, tomadas, especiais, interruptores, a classificar); pavimentos
 * na ordem do modelo. Dentro do grupo, a ordem de chegada se mantém.
 */
export function agruparPontos<T extends { terminalId: string }>(
  model: BlueprintModel,
  itens: readonly T[],
  criterio: CriterioDeAgrupamento,
): GrupoDePontos<T>[] {
  if (criterio === 'nenhum') return itens.length ? [{ chave: 'todos', titulo: '', itens: [...itens] }] : [];

  const terminais = new Map((model.terminais ?? []).map((t) => [t.id, t]));
  const grupos = new Map<string, GrupoDePontos<T>>();
  const ordem: string[] = [];
  const por = (chave: string, titulo: string, item: T) => {
    let g = grupos.get(chave);
    if (!g) {
      g = { chave, titulo, itens: [] };
      grupos.set(chave, g);
      ordem.push(chave);
    }
    g.itens.push(item);
  };

  for (const item of itens) {
    const t = terminais.get(item.terminalId);
    if (!t) {
      por('?', '—', item);
      continue;
    }
    if (criterio === 'ambiente') {
      const a = ambienteDoPonto(model, t);
      por(a ? `amb:${a.space.id}` : 'amb:fora', a ? a.nome : FORA_DE_AMBIENTE, item);
    } else if (criterio === 'tipo') {
      const grupo = t.tipoEletrico ? GRUPO_DO_PONTO_ELETRICO[t.tipoEletrico] : null;
      por(grupo ? `tipo:${grupo}` : 'tipo:?', grupo ? grupo.replace(/^Elétrica — /, '') : A_CLASSIFICAR, item);
    } else {
      const nivel = model.levels.find((l) => l.id === t.levelId);
      por(`niv:${t.levelId}`, nivel?.name ?? '—', item);
    }
  }

  // A ordem de leitura, por critério.
  const posicao = (chave: string): number => {
    if (criterio === 'ambiente') {
      if (chave === 'amb:fora') return Number.MAX_SAFE_INTEGER;
      const id = chave.slice(4);
      const i = model.spaces.findIndex((s) => s.id === id);
      return i < 0 ? Number.MAX_SAFE_INTEGER - 1 : i;
    }
    if (criterio === 'tipo') {
      if (chave === 'tipo:?') return Number.MAX_SAFE_INTEGER;
      const titulo = chave.slice(5);
      const i = Object.values(GRUPO_DO_PONTO_ELETRICO).findIndex((g) => g === titulo);
      return i < 0 ? Number.MAX_SAFE_INTEGER - 1 : i;
    }
    const id = chave.slice(4);
    const i = model.levels.findIndex((l) => l.id === id);
    return i < 0 ? Number.MAX_SAFE_INTEGER : i;
  };
  return ordem
    .map((k) => grupos.get(k)!)
    .sort((a, b) => posicao(a.chave) - posicao(b.chave) || ordem.indexOf(a.chave) - ordem.indexOf(b.chave));
}
