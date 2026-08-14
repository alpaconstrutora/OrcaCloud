// services/fracaoIdealService.ts
// Transcrição da fração ideal a partir da CONVENÇÃO DE CONDOMÍNIO registrada.
// Plano: docs/planos/2026-08-13-opura-condominios-avaliacao.md
//
// Por que isto não é "mais um campo editável": a fração ideal registrada é o
// que define peso de voto em assembleia e a divisão do rateio. Ela não é
// calculada aqui — é COPIADA de um documento de cartório. Daí três coisas que
// esta camada faz de propósito:
//
//   1. grava a ORIGEM ('CONVENCAO'), que impede o motor de áreas de sobrescrever;
//   2. guarda a FONTE (qual convenção) e a data da transcrição, senão daqui a
//      dois anos ninguém sabe de que documento o número saiu;
//   3. CONFERE A SOMA e devolve o desvio — sem impedir de salvar.
//
// A soma não trava o salvamento porque transcrição é trabalho em etapas: quem
// digita 200 unidades salva no meio do caminho. Travar obrigaria a fazer tudo
// de uma vez ou a inventar número para fechar — que é exatamente o erro que
// esta tela existe para evitar.

import { supabase } from '../lib/supabase';
import type { EmpreendimentoUnit } from '../types/empreendimento';

/** Tolerância da soma: arredondamento de milésimos não é divergência. */
const TOLERANCIA = 0.0001;

export interface ConferenciaSoma {
    soma: number;
    fecha: boolean;
    /** Diferença para 1. Positivo = passou; negativo = falta. */
    desvio: number;
    unidadesComFracao: number;
    unidadesTotal: number;
}

export interface TranscricaoItem {
    unitId: string;
    /** Fração em DECIMAL (0,0833…). A tela recebe em % e converte. */
    fracaoDecimal: number | null;
}

export function conferirSoma(units: Pick<EmpreendimentoUnit, 'fracao_ideal_decimal'>[]): ConferenciaSoma {
    const comFracao = units.filter(u => u.fracao_ideal_decimal != null);
    const soma = comFracao.reduce((s, u) => s + (u.fracao_ideal_decimal || 0), 0);
    const desvio = soma - 1;
    return {
        soma,
        desvio,
        fecha: comFracao.length > 0 && Math.abs(desvio) <= TOLERANCIA,
        unidadesComFracao: comFracao.length,
        unidadesTotal: units.length,
    };
}

export const fracaoIdealService = {
    /**
     * Grava as frações transcritas. Uma a uma: um lote único faria a primeira
     * unidade recusada derrubar as demais, e transcrição parcial perdida é pior
     * que transcrição parcial salva.
     */
    async transcrever(
        itens: TranscricaoItem[],
        fonte: string,
        dataTranscricao: string,
    ): Promise<{ gravadas: number; erros: string[] }> {
        const erros: string[] = [];
        let gravadas = 0;

        for (const item of itens) {
            const temFracao = item.fracaoDecimal != null && item.fracaoDecimal > 0;
            const { error } = await supabase
                .from('empreendimento_units')
                .update({
                    fracao_ideal_decimal: temFracao ? item.fracaoDecimal : null,
                    // Milésimos é como a convenção costuma expressar; guardar os
                    // dois evita reconversão a cada leitura.
                    fracao_ideal_thousandths: temFracao ? (item.fracaoDecimal as number) * 1000 : null,
                    // Limpar a fração limpa a origem: unidade sem fração não tem
                    // origem, e deixar 'CONVENCAO' pendurado travaria o motor
                    // para sempre numa unidade que não tem nada transcrito.
                    fracao_ideal_origem: temFracao ? 'CONVENCAO' : null,
                    fracao_ideal_fonte: temFracao ? (fonte || null) : null,
                    fracao_ideal_transcrita_em: temFracao ? dataTranscricao : null,
                })
                .eq('id', item.unitId);

            if (error) erros.push(error.message);
            else gravadas += 1;
        }

        return { gravadas, erros };
    },
};
