/**
 * Regra da linha digitável aplicada À MÃO (ou lida do código de barras pelo botão)
 * num boleto já cadastrado — `boletoService.aplicarLinhaDigitavelManual`.
 *
 * Por que existe (18/10/2026, plano docs/planos/2026-10-18-boleto-linha-pelo-codigo-de-barras.md):
 * a entrada manual regravava valor/vencimento/multa de boleto APROVADO sem mexer no
 * título de Contas a Pagar (linha errada = a Asaas paga outra conta), aceitava linha
 * com DV errado e apagava beneficiário/CNPJ/multa já lidos (gravava null no que a
 * linha não traz).
 *
 * Puro: sem Supabase, testável.
 */

import type { BoletoStatus } from '../types/boletos.ts';
import { STATUS_LABELS } from './boletoStatus';

export type DecisaoLinhaManual =
    | { modo: 'completar' }          // rascunho/revisão: a linha preenche o que trouxer
    | { modo: 'so_linha' }           // aprovado: só as colunas da própria linha
    | { recusa: string };

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function decidirLinhaManual(p: {
    status: BoletoStatus;
    valorBoleto: number | null;
    /** Valor embutido na linha (undefined = linha sem valor, ex.: bancário de valor livre). */
    valorDaLinha: number | undefined;
    errosDaLinha: string[];
}): DecisaoLinhaManual {
    if (p.status === 'programado') return { recusa: 'Boleto em pagamento: a linha digitável não muda.' };
    if (p.status === 'pago') return { recusa: 'Boleto pago: a linha digitável não muda.' };
    if (p.status === 'cancelado') return { recusa: 'Boleto cancelado: a linha digitável não muda.' };
    if (p.errosDaLinha.length) return { recusa: `Linha digitável inválida: ${p.errosDaLinha.join('; ')}.` };
    if (p.status === 'aprovado') {
        if (p.valorDaLinha != null && p.valorBoleto != null && Math.abs(p.valorDaLinha - p.valorBoleto) >= 0.005) {
            return {
                recusa: `A linha é de ${brl(p.valorDaLinha)} e o boleto aprovado está em ${brl(p.valorBoleto)}. ` +
                    'Confira se é o documento certo; para mudar o valor, volte o boleto para rascunho.',
            };
        }
        return { modo: 'so_linha' };
    }
    return { modo: 'completar' };
}

/** Colunas que são da própria linha — as únicas que mudam num boleto aprovado. */
export const COLUNAS_DA_LINHA = [
    'linha_digitavel', 'codigo_barras', 'banco_codigo', 'banco_nome',
    'metodo_extracao', 'confidence_score', 'engine_versao', 'extracao_em',
    'checksum_valido', 'erros_validacao',
] as const;

/**
 * O que gravar. `so_linha`: só `COLUNAS_DA_LINHA`. `completar`: essas mais os campos
 * que a linha TROUXE (valor, vencimento…) — nunca apaga com null o que já estava lido.
 * `extracao_raw` fica de fora sempre: guarda a leitura original do documento.
 */
export function colunasParaGravar(
    colunas: Record<string, unknown>,
    decisao: { modo: 'completar' | 'so_linha' },
): Record<string, unknown> {
    const saida: Record<string, unknown> = {};
    for (const c of COLUNAS_DA_LINHA) if (c in colunas) saida[c] = colunas[c];
    if (decisao.modo === 'completar') {
        for (const [c, v] of Object.entries(colunas)) {
            if (c === 'extracao_raw' || c in saida) continue;
            if (v !== null && v !== undefined) saida[c] = v;
        }
    }
    return saida;
}

/** O boleto que já tem a linha — o que o aviso precisa para nomeá-lo. */
export interface BoletoComMesmaLinha {
    id: string;
    numero: number | null;
    status: BoletoStatus;
    valor: number | null;
    vencimento: string | null;
}

/** `#0377` — o número como a lista e o cabeçalho mostram; sem número, o começo do id. */
export function rotuloDoBoleto(b: Pick<BoletoComMesmaLinha, 'id' | 'numero'>): string {
    return b.numero != null ? `#${String(b.numero).padStart(4, '0')}` : `${b.id.slice(0, 8)}…`;
}

/**
 * Aviso de linha repetida (29/10/2026, plano docs/planos/2026-10-29-boleto-linha-duplicada.md):
 * a recusa antiga dizia só "outro boleto", e o usuário não tinha como achar qual era.
 * Mesmo texto no aviso da tela (logo ao ler o código de barras) e na recusa do service.
 */
export function mensagemLinhaDuplicada(outro: BoletoComMesmaLinha): string {
    const rotulo = rotuloDoBoleto(outro);
    const partes = [STATUS_LABELS[outro.status] ?? outro.status];
    if (outro.valor != null) partes.push(brl(outro.valor));
    if (outro.vencimento) partes.push(`vence ${outro.vencimento.split('-').reverse().join('/')}`);
    return `Essa linha digitável já é do boleto ${rotulo} (${partes.join(' · ')}). ` +
        'Dois boletos com a mesma linha são o mesmo boleto — confira se este não é uma cópia daquele.';
}
