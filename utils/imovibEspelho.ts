// utils/imovibEspelho.ts
//
// Espelho de vendas do estudo de viabilidade (imovib_unit_instances): o que a
// geração a partir das tipologias produz, e como REGENERAR sem perder trabalho.
//
// Antes, "Regenerar espelho" apagava todas as unidades e criava de novo: perdia
// preço e status ajustados à mão, não era atômico (apagou e a geração falhou =
// espelho vazio) e trocava os IDs — as unidades do empreendimento com
// imovib_instance_id ficavam órfãs e o sync seguinte criava a torre inteira de
// novo. Plano docs/planos/2026-10-12-imovib-viabilidade-correcoes.md, item 4.4.

import type { ImovibStudy, ImovibUnitInstance, ImovibUnitInstanceInsert } from '../types';

/** Nome de uma unidade gerada: tipologia + pavimento + letra (A, B, C…). */
export const nomeDaUnidade = (tipologia: string, pavimento: number, posicao: number) =>
    `${tipologia} ${pavimento}${String.fromCharCode(64 + posicao)}`;

/** Unidades que as tipologias VENDÁVEIS do estudo produzem (sem preço, disponíveis). */
export function montarEspelho(study: ImovibStudy): ImovibUnitInstanceInsert[] {
    const out: ImovibUnitInstanceInsert[] = [];
    for (const block of study.blocks || []) {
        for (const unit of block.units || []) {
            if (unit.is_vendavel === false) continue;
            const pavimentos = unit.pavimentos || 1;
            const quantidade = unit.quantity || 1;
            for (let floor = 1; floor <= pavimentos; floor++) {
                for (let q = 1; q <= quantidade; q++) {
                    out.push({
                        study_id: study.id,
                        block_id: block.id,
                        unit_id: unit.id,
                        name: nomeDaUnidade(unit.name, floor, q),
                        floor,
                        private_area: unit.private_area || 0,
                        position_type: 'LATERAL',
                        sun_orientation: 'NORTE',
                        price: 0,
                        status: 'DISPONÍVEL',
                    });
                }
            }
        }
    }
    return out;
}

export interface PlanoRegeneracao {
    /** Unidades que as tipologias pedem e o espelho não tem. */
    criar: ImovibUnitInstanceInsert[];
    /** Unidades existentes cuja ESTRUTURA mudou (pavimento, área, tipologia). Preço, status, posição e sol ficam. */
    atualizar: { id: string; campos: Partial<ImovibUnitInstanceInsert> }[];
    /** Unidades do espelho que as tipologias não produzem mais. Só saem com confirmação. */
    sobrando: ImovibUnitInstance[];
    /** Unidades existentes que continuam iguais. */
    mantidas: number;
}

/** Casa espelho atual × esperado por (bloco, nome) — a chave que a geração produz. */
export function planejarRegeneracao(study: ImovibStudy, atuais: ImovibUnitInstance[]): PlanoRegeneracao {
    const chave = (blockId: string, nome: string) => `${blockId}|${nome}`;
    const atualPorChave = new Map(atuais.map(i => [chave(i.block_id, i.name), i]));
    const esperado = montarEspelho(study);
    const chavesEsperadas = new Set<string>();

    const plano: PlanoRegeneracao = { criar: [], atualizar: [], sobrando: [], mantidas: 0 };
    for (const e of esperado) {
        const k = chave(e.block_id, e.name);
        chavesEsperadas.add(k);
        const atual = atualPorChave.get(k);
        if (!atual) { plano.criar.push(e); continue; }
        const campos: Partial<ImovibUnitInstanceInsert> = {};
        if (atual.floor !== e.floor) campos.floor = e.floor;
        if ((atual.private_area || 0) !== (e.private_area || 0)) campos.private_area = e.private_area;
        if ((atual.unit_id ?? null) !== (e.unit_id ?? null)) campos.unit_id = e.unit_id;
        if (Object.keys(campos).length) plano.atualizar.push({ id: atual.id, campos });
        else plano.mantidas++;
    }
    plano.sobrando = atuais.filter(i => !chavesEsperadas.has(chave(i.block_id, i.name)));
    return plano;
}
