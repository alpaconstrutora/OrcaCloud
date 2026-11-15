/**
 * Casamento das tarefas de um cronograma importado com os itens do orçamento (importação em
 * Engenharia › Planejamento, item 2 de docs/planos/2026-11-14-planejamento-lista-critica.md).
 * Função pura: só PROPÕE; quem decide as tarefas sem par é o usuário, na prévia ("Usuário decide
 * na prévia" — decisão de 14/11/2026).
 *
 * Regras, nesta ordem (a primeira que achar vale; cada item casa uma vez só):
 *  1. EAP — o número da tarefa no arquivo é o número do item no app. O app numera pelo PREFIXO do
 *     nome da subetapa ("04.02.01. Estaca…") + a posição do item dentro dela ("04.02.01.02"); a
 *     subetapa com um item só também responde pelo número dela ("04.02.01").
 *  2. Nome — sem acento, sem caixa, espaços colapsados: o nome da subetapa (sem o número), o
 *     começo da descrição SINAPI (até a 1ª vírgula/ponto) ou a descrição inteira.
 * Tarefa-resumo nunca casa (as datas dela vêm das filhas).
 */
import type { CronogramaImportado, TarefaImportada } from './cronogramaLeitura';

export interface ItemDoOrcamento {
    id: string;
    group?: string;
    phase?: string;
    subPhase?: string;
    quantity?: number;
    sinapiItem?: { code?: string; description?: string; unit?: string; price?: number };
}

export type MotivoDoCasamento = 'eap' | 'nome';

export interface CasamentoProposto {
    tarefa: TarefaImportada;
    /** Item do orçamento proposto; null = sem par (o usuário decide). */
    itemId: string | null;
    motivo: MotivoDoCasamento | null;
}

export interface ResultadoDoCasamento {
    /** Só tarefas que não são resumo, na ordem do arquivo. */
    casamentos: CasamentoProposto[];
    /** Itens do orçamento que nenhuma tarefa casou (ao atualizar, ficam como estão). */
    itensSemTarefa: string[];
}

export const normalizarNome = (s: string | null | undefined): string =>
    (s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** "04.02.01. Estaca…" → "04.02.01" (o número da EAP vem do prefixo do nome). */
export const numeroDaEap = (nome: string | null | undefined): string => ((nome ?? '').match(/^([\d.]+?)\.?\s/) || [])[1] || '';
/** "04.02.01. Estaca…" → "Estaca…". */
export const nomeSemNumero = (nome: string | null | undefined): string => (nome ?? '').replace(/^[\d.]+\.?\s+/, '').trim();
/** EAP comparável: sem zeros à esquerda em cada nível ("04.02.01" = "4.2.1"). */
const eapComparavel = (eap: string) => eap.split('.').filter(Boolean).map(n => String(Number(n))).join('.');

/** Chaves de EAP e de nome de cada item, na ordem do orçamento. */
export function chavesDosItens(orcamento: ItemDoOrcamento[]): Map<string, { eaps: string[]; nomes: string[] }> {
    const porSub = new Map<string, ItemDoOrcamento[]>();
    for (const it of orcamento) {
        const k = it.subPhase ?? '';
        if (!porSub.has(k)) porSub.set(k, []);
        porSub.get(k)!.push(it);
    }
    const saida = new Map<string, { eaps: string[]; nomes: string[] }>();
    for (const [sub, itens] of porSub) {
        const num = numeroDaEap(sub);
        itens.forEach((it, i) => {
            const eaps: string[] = [];
            if (num) {
                eaps.push(eapComparavel(`${num}.${i + 1}`));
                if (itens.length === 1) eaps.push(eapComparavel(num));
            }
            const desc = it.sinapiItem?.description ?? '';
            const nomes = [
                itens.length === 1 ? normalizarNome(nomeSemNumero(sub)) : '',
                normalizarNome(desc.split(/[,.]/)[0]),
                normalizarNome(desc),
            ].filter(Boolean);
            saida.set(it.id, { eaps, nomes });
        });
    }
    return saida;
}

/** Tarefa que já existe no planejamento e não é item do orçamento (nó `activity` — tarefa sem custo).
 *  Ao ATUALIZAR, casa pelo nome depois dos itens: reimportar o arquivo não duplica a "Mobilização". */
export interface TarefaAvulsaExistente { id: string; nome: string }

export function casarComOrcamento(
    cronograma: CronogramaImportado,
    orcamento: ItemDoOrcamento[],
    avulsasExistentes: TarefaAvulsaExistente[] = [],
): ResultadoDoCasamento {
    const chaves = chavesDosItens(orcamento);
    const porEap = new Map<string, string>();
    const porNome = new Map<string, string[]>();
    for (const it of orcamento) {
        const c = chaves.get(it.id)!;
        for (const e of c.eaps) if (!porEap.has(e)) porEap.set(e, it.id);
        for (const n of c.nomes) {
            if (!porNome.has(n)) porNome.set(n, []);
            porNome.get(n)!.push(it.id);
        }
    }
    const usados = new Set<string>();
    const folhas = cronograma.tarefas.filter(t => !t.resumo);
    const casamentos: CasamentoProposto[] = folhas.map(t => ({ tarefa: t, itemId: null, motivo: null }));

    // 1ª passada: EAP (a mais segura) — feita para todas antes do nome, para o nome não "roubar"
    // o item que a EAP de outra tarefa aponta.
    for (const c of casamentos) {
        const id = c.tarefa.eap ? porEap.get(eapComparavel(c.tarefa.eap)) : undefined;
        if (id && !usados.has(id)) { c.itemId = id; c.motivo = 'eap'; usados.add(id); }
    }
    // 2ª passada: nome — o primeiro item ainda livre com esse nome (homônimos casam na ordem).
    for (const c of casamentos) {
        if (c.itemId) continue;
        const id = (porNome.get(normalizarNome(c.tarefa.nome)) ?? []).find(x => !usados.has(x));
        if (id) { c.itemId = id; c.motivo = 'nome'; usados.add(id); }
    }
    // 3ª passada: tarefas sem custo que já existem no planejamento (só ao atualizar), pelo nome.
    if (avulsasExistentes.length) {
        const porNomeAvulsa = new Map<string, string[]>();
        for (const a of avulsasExistentes) {
            const n = normalizarNome(a.nome);
            if (!porNomeAvulsa.has(n)) porNomeAvulsa.set(n, []);
            porNomeAvulsa.get(n)!.push(a.id);
        }
        for (const c of casamentos) {
            if (c.itemId) continue;
            const id = (porNomeAvulsa.get(normalizarNome(c.tarefa.nome)) ?? []).find(x => !usados.has(x));
            if (id) { c.itemId = id; c.motivo = 'nome'; usados.add(id); }
        }
    }
    return { casamentos, itensSemTarefa: orcamento.map(i => i.id).filter(id => !usados.has(id)) };
}
