import { BudgetEntry, WBSGroup, WBSPhase } from '../types';

/**
 * Reconstrução da EAP (`settings.wbs`) a partir dos caminhos que os próprios
 * itens do orçamento carregam (`group` / `phase` / `subPhase`).
 *
 * Por que existe: a árvore do Orçamento Analítico só renderiza o que está em
 * `settings.wbs` (BudgetEditor: `phase.subPhases.map`), enquanto os KPIs somam
 * o array `budget` inteiro. Quando a EAP se perde — importação de EAP que troca
 * a estrutura sem remapear itens, restauração de versão que devolve o budget mas
 * não a `wbs`, ou uma ponte que grava itens em grupo não registrado (Planta
 * Inteligente) — o resultado é orçamento com total certo e árvore vazia, e a
 * tela acusa os itens de "fantasmas".
 *
 * Quando *todos* os itens estão fora da EAP, o que se perdeu foi a EAP, não os
 * itens. Esta função devolve a estrutura em vez de apagar o orçamento.
 *
 * Regras:
 * - Os nomes dos nós são preservados **caractere por caractere**. A árvore casa
 *   item↔EAP por igualdade exata de string (`item.phase === phase.name`);
 *   qualquer normalização de nome aqui deixaria o item invisível de novo.
 * - Nível em branco vira `'Geral'` — no nó E no item, para que continuem
 *   casando. É a mesma convenção usada ao criar etapa/subetapa na tela.
 * - `id` é posicional (`01`, `01.01`) e serve só de chave de expandir/recolher.
 *   Não é derivado do nome, porque nome sem prefixo numérico é legítimo.
 */

const NIVEL_VAZIO = 'Geral';

const rotulo = (valor: string | null | undefined): string => {
  const limpo = (valor ?? '').trim();
  return limpo === '' ? NIVEL_VAZIO : limpo;
};

/** Ordena "04. FUNDAÇÕES" depois de "01. SERVIÇOS" — e não "10" antes de "9". */
const porNome = (a: string, b: string) => a.localeCompare(b, 'pt-BR', { numeric: true });

export interface WbsReconstruida {
  wbs: WBSGroup[];
  /** Itens com os níveis em branco preenchidos; os demais voltam intactos. */
  budget: BudgetEntry[];
  /** Quantos itens tiveram algum nível em branco preenchido. */
  itensNormalizados: number;
}

/**
 * Monta uma EAP que cobre 100% dos caminhos presentes no orçamento.
 * Não lê nem preserva a EAP atual: é reconstrução, não fusão.
 */
export const reconstruirWbsAPartirDoOrcamento = (
  budget: BudgetEntry[] | null | undefined,
): WbsReconstruida => {
  const itens = Array.isArray(budget) ? budget : [];

  // grupo -> etapa -> Set(subetapas)
  const arvore = new Map<string, Map<string, Set<string>>>();
  let itensNormalizados = 0;

  const novoBudget = itens.map(item => {
    if (!item) return item;

    const group = rotulo(item.group);
    const phase = rotulo(item.phase);
    const subPhase = rotulo(item.subPhase);

    if (!arvore.has(group)) arvore.set(group, new Map());
    const etapas = arvore.get(group)!;
    if (!etapas.has(phase)) etapas.set(phase, new Set());
    etapas.get(phase)!.add(subPhase);

    if (group === item.group && phase === item.phase && subPhase === item.subPhase) {
      return item;
    }
    itensNormalizados += 1;
    return { ...item, group, phase, subPhase };
  });

  const wbs: WBSGroup[] = [...arvore.keys()].sort(porNome).map((nomeGrupo, gIdx) => {
    const idGrupo = (gIdx + 1).toString().padStart(2, '0');
    const etapas = arvore.get(nomeGrupo)!;

    const phases: WBSPhase[] = [...etapas.keys()].sort(porNome).map((nomeEtapa, pIdx) => ({
      id: `${idGrupo}.${(pIdx + 1).toString().padStart(2, '0')}`,
      name: nomeEtapa,
      subPhases: [...etapas.get(nomeEtapa)!].sort(porNome),
    }));

    return { id: idGrupo, name: nomeGrupo, phases };
  });

  return { wbs, budget: novoBudget, itensNormalizados };
};

/**
 * Fusão: garante que a EAP existente cubra os caminhos dos itens dados, sem
 * mexer no que já está lá. Para quem *acrescenta* itens ao orçamento por fora da
 * tela (ponte Planta Inteligente → orçamento, importações), onde reconstruir a
 * EAP inteira apagaria a estrutura que o usuário montou à mão.
 */
export const garantirCaminhosNaWbs = (
  wbs: WBSGroup[] | null | undefined,
  budget: BudgetEntry[] | null | undefined,
): { wbs: WBSGroup[]; budget: BudgetEntry[]; caminhosAdicionados: number } => {
  const itens = Array.isArray(budget) ? budget : [];
  const novaWbs: WBSGroup[] = JSON.parse(JSON.stringify(wbs || []));
  let caminhosAdicionados = 0;

  const novoBudget = itens.map(item => {
    if (!item) return item;

    const group = rotulo(item.group);
    const phase = rotulo(item.phase);
    const subPhase = rotulo(item.subPhase);

    let grupo = novaWbs.find(g => (g?.name || '').trim() === group);
    if (!grupo) {
      grupo = { id: (novaWbs.length + 1).toString().padStart(2, '0'), name: group, phases: [] };
      novaWbs.push(grupo);
    }
    if (!Array.isArray(grupo.phases)) grupo.phases = [];

    let etapa = grupo.phases.find(p => (p?.name || '').trim() === phase);
    if (!etapa) {
      etapa = { id: `${grupo.id}.${(grupo.phases.length + 1).toString().padStart(2, '0')}`, name: phase, subPhases: [] };
      grupo.phases.push(etapa);
    }
    if (!Array.isArray(etapa.subPhases)) etapa.subPhases = [];

    if (!etapa.subPhases.some(s => (s || '').trim() === subPhase)) {
      etapa.subPhases.push(subPhase);
      caminhosAdicionados += 1;
    }

    if (group === item.group && phase === item.phase && subPhase === item.subPhase) return item;
    return { ...item, group, phase, subPhase };
  });

  return { wbs: novaWbs, budget: novoBudget, caminhosAdicionados };
};

/** Caminho canônico usado para casar item ↔ EAP (mesma normalização dos dois lados). */
export const caminhoDoItem = (item: Pick<BudgetEntry, 'group' | 'phase' | 'subPhase'>): string =>
  `${(item.group || '').trim().toLowerCase()}|${(item.phase || '').trim().toLowerCase()}|${(item.subPhase || '').trim().toLowerCase()}`;

/** Conjunto de caminhos válidos declarados pela EAP. */
export const caminhosDaWbs = (wbs: WBSGroup[] | null | undefined): Set<string> => {
  const paths = new Set<string>();
  (wbs || []).forEach(group => {
    if (!group) return;
    (group.phases || []).forEach(phase => {
      if (!phase) return;
      (phase.subPhases || []).forEach(sub => {
        if (sub === null || sub === undefined) return;
        paths.add(
          `${(group.name || '').trim().toLowerCase()}|${(phase.name || '').trim().toLowerCase()}|${sub.trim().toLowerCase()}`,
        );
      });
    });
  });
  return paths;
};
