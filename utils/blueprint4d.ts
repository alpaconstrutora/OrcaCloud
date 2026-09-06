// utils/blueprint4d.ts
//
// O 4D: em que pé está, numa data, cada peça desenhada.
//
// ─── A PONTE É DERIVADA, NÃO CADASTRADA ──────────────────────────────────────
//
//   elemento da planta (uid)
//     → linha de orçamento   bp:<estudo>:<mapeamento>:<uid>
//       → tarefa do cronograma (o MESMO id)
//
// Não há tabela de vínculo, e não deve haver: o vínculo é consequência dos ids,
// e uma tabela seria uma segunda verdade sobre o mesmo fato. Os dois elos estão
// travados por teste — `blueprintOrcamentoIdentidade` de um lado,
// `scheduleIdDaLinha` do outro.
//
// ─── ⚠️ ISTO PINTA O PLANEJADO, E TEM DE DIZER ISSO ──────────────────────────
//
// Medido no banco em 06/09/2026: das 265 tarefas com cronograma, 265 têm data
// planejada e apenas 4 têm percentual real informado. Colorir por "executado"
// seria pintar de verde, com aparência de fato, aquilo que ninguém mediu —
// exatamente o tipo de número plausível e errado que este projeto combate.
//
// Então o status sai das DATAS PLANEJADAS, e `realConhecido` diz, tarefa a
// tarefa, se alguém informou execução. Quem desenha usa isso para rotular a
// tela; esconder a diferença seria transformar previsão em relatório.

import { refDoElemento } from './blueprintBudget';

export type Status4d = 'NAO_INICIADA' | 'EM_ANDAMENTO' | 'CONCLUIDA';

/** O mínimo que este módulo precisa saber de uma tarefa de cronograma. */
export interface TarefaDoCronograma {
  id: string;
  startDate?: string;
  endDate?: string;
  manualRealPct?: number;
}

export interface Situacao4d {
  status: Status4d;
  /** `true` quando alguém informou execução — e não quando a data já passou. */
  realConhecido: boolean;
}

/**
 * Em que pé a tarefa está NUMA data, pelo que foi planejado.
 *
 * Sem data de início não há o que afirmar: fica `NAO_INICIADA`, e não
 * "concluída porque a data de hoje já passou de um campo vazio".
 *
 * A comparação é por string ISO (`YYYY-MM-DD`), que ordena igual à data — e
 * evita construir `Date`, que introduziria fuso onde não há hora nenhuma. Já
 * mordeu neste projeto antes, no Gantt.
 */
export function statusNaData(tarefa: TarefaDoCronograma, data: string): Status4d {
  const inicio = (tarefa.startDate ?? '').slice(0, 10);
  const fim = (tarefa.endDate ?? '').slice(0, 10);
  if (!inicio) return 'NAO_INICIADA';
  if (data < inicio) return 'NAO_INICIADA';
  if (fim && data > fim) return 'CONCLUIDA';
  return 'EM_ANDAMENTO';
}

/**
 * A situação de cada ELEMENTO numa data, atravessando a cadeia inteira.
 *
 * Uma peça pode ter mais de uma tarefa (duas medidas mapeadas da mesma parede).
 * Nesse caso vale a MENOS avançada: uma parede cuja alvenaria terminou mas cujo
 * reboco não começou não está pronta, e dizer que está seria a leitura otimista
 * que faz o 3D mentir.
 */
export function situacaoPorElemento(
  tarefas: TarefaDoCronograma[],
  data: string,
): Map<string, Situacao4d> {
  const ordem: Record<Status4d, number> = {
    NAO_INICIADA: 0,
    EM_ANDAMENTO: 1,
    CONCLUIDA: 2,
  };
  const mapa = new Map<string, Situacao4d>();

  for (const t of tarefas) {
    const uid = refDoElemento(t.id);
    if (!uid) continue;
    const status = statusNaData(t, data);
    const real = typeof t.manualRealPct === 'number';
    const atual = mapa.get(uid);
    if (!atual) {
      mapa.set(uid, { status, realConhecido: real });
      continue;
    }
    mapa.set(uid, {
      status: ordem[status] < ordem[atual.status] ? status : atual.status,
      // Basta UMA tarefa sem execução informada para o conjunto não ser
      // conhecido: dizer "medido" com metade medida seria pior que não dizer.
      realConhecido: atual.realConhecido && real,
    });
  }
  return mapa;
}

/** Cor de cada status no 3D. Fora do componente para o teste poder afirmá-la. */
export const COR_DO_STATUS: Record<Status4d, string> = {
  NAO_INICIADA: '#cbd5e1',
  EM_ANDAMENTO: '#f59e0b',
  CONCLUIDA: '#10b981',
};
