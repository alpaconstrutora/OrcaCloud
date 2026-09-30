/**
 * Resumo da seleção da aba Pendentes da Conciliação: N movimentos do extrato ×
 * M lançamentos internos. Decide se o botão "Conciliar" do dock pode ser usado e
 * quais ajustes de diferença estão disponíveis — cada um com o MOTIVO quando não
 * está (botão desligado sempre diz por quê).
 *
 * Espelha as validações de `fn_reconcile_group` (migration
 * aplicar_20270929000030_fn_reconcile_group.sql). O banco é quem manda; isto só
 * evita oferecer um clique que o banco vai recusar.
 *
 * Plano: docs/planos/2026-09-29-conciliacao-pendentes-conciliar-e-ajustes.md
 */
import type { BankTransaction, InternalTransaction } from '../types/financial';

export type ModoConciliacaoGrupo = 'EXACT' | 'ADJUSTMENT' | 'EXCESS' | 'PARTIAL' | 'ADJUST_VALUE';
export type ModoAjuste = Exclude<ModoConciliacaoGrupo, 'EXACT'>;

export interface Disponibilidade {
    habilitado: boolean;
    /** Por que está desligado. `null` quando habilitado. */
    motivo: string | null;
}

export interface ResumoSelecao {
    qtdExtrato: number;
    qtdLancamentos: number;
    totalExtrato: number;
    totalLancamentos: number;
    /** Σ extrato − Σ lançamentos (valores absolutos, mesma direção). */
    diferenca: number;
    /** Direção comum de tudo que foi selecionado; `null` se vazio ou misturado. */
    direcao: 'CREDIT' | 'DEBIT' | null;
    temDiferenca: boolean;
    conciliar: Disponibilidade;
    ajustes: Record<ModoAjuste, Disponibilidade>;
    /** Títulos que podem ser desmembrados na baixa parcial (valor > diferença). */
    titulosDesmembraveis: InternalTransaction[];
}

/** Diferença abaixo disso é arredondamento — mesma tolerância da RPC. */
export const TOLERANCIA_CONCILIACAO = 0.01;

/**
 * Origens cujo valor não pode ser alterado aqui (baixa parcial / ajustar valor):
 * a sincronização da origem regrava `amount` da linha existente e desfaria o ajuste.
 * Mantida igual à lista da RPC.
 */
export const ORIGENS_VALOR_SINCRONIZADO: readonly string[] = [
    'PROJECT', 'COMMERCIAL', 'PURCHASE_ORDER', 'CONTRACT_PARCELADO', 'CONTRACT_MEASUREMENT',
    'CONTRACT_AVISTA', 'CONTRACT_RECURRING', 'LABOR', 'DEBT_INSTALLMENT', 'BOLETO',
];

const centavos = (v: number | null | undefined) => Math.round(Math.abs(Number(v) || 0) * 100);

const formatarBRL = (v: number) =>
    v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const ok: Disponibilidade = { habilitado: true, motivo: null };
const nao = (motivo: string): Disponibilidade => ({ habilitado: false, motivo });

/** Por que nenhum título serve para a baixa parcial: valor pequeno demais, ou
 *  (o caso comum) todos os grandes o bastante são de origem sincronizada. */
function motivoSemDesmembravel(lancamentos: InternalTransaction[], cDif: number): string {
    const grandes = lancamentos.filter(t => centavos(t.amount) > Math.abs(cDif));
    if (grandes.length === 0) {
        return `Nenhum lançamento selecionado tem valor maior que a diferença de ${formatarBRL(Math.abs(cDif) / 100)}`;
    }
    const origens = [...new Set(grandes.map(t => t.source_system))].join(', ');
    return `O valor de lançamentos de origem ${origens} é regravado pela sincronização — não dá para desmembrar aqui`;
}

export function resumoDaSelecao(
    extrato: Pick<BankTransaction, 'id' | 'amount' | 'direction'>[],
    lancamentos: InternalTransaction[],
): ResumoSelecao {
    const cExtrato = extrato.reduce((s, t) => s + centavos(t.amount), 0);
    const cLanc = lancamentos.reduce((s, t) => s + centavos(t.amount), 0);
    const cDif = cExtrato - cLanc;

    const direcoes = new Set([...extrato, ...lancamentos].map(t => t.direction));
    const direcao = direcoes.size === 1 ? [...direcoes][0] : null;
    const temDiferenca = Math.abs(cDif) >= Math.round(TOLERANCIA_CONCILIACAO * 100);
    const dif = cDif / 100;

    // Bloqueios que valem para qualquer ação do grupo
    let bloqueio: string | null = null;
    if (extrato.length === 0 || lancamentos.length === 0) {
        bloqueio = 'Selecione ao menos 1 movimento do extrato e 1 lançamento';
    } else if (direcoes.size > 1) {
        bloqueio = 'A seleção mistura entradas e saídas — concilie cada direção separadamente';
    }

    const titulosDesmembraveis = lancamentos.filter(
        t => centavos(t.amount) > Math.abs(cDif) && !ORIGENS_VALOR_SINCRONIZADO.includes(t.source_system),
    );

    const semDiferenca = 'Não há diferença a ajustar — use Conciliar';
    const ajustes: Record<ModoAjuste, Disponibilidade> = bloqueio
        ? { ADJUSTMENT: nao(bloqueio), EXCESS: nao(bloqueio), PARTIAL: nao(bloqueio), ADJUST_VALUE: nao(bloqueio) }
        : !temDiferenca
            ? { ADJUSTMENT: nao(semDiferenca), EXCESS: nao(semDiferenca), PARTIAL: nao(semDiferenca), ADJUST_VALUE: nao(semDiferenca) }
            : {
                ADJUSTMENT: ok,
                EXCESS: cDif > 0
                    ? ok
                    : nao('O extrato é menor que os lançamentos — não há excedente para lançar'),
                PARTIAL: cDif < 0
                    ? (titulosDesmembraveis.length > 0
                        ? ok
                        : nao(motivoSemDesmembravel(lancamentos, cDif)))
                    : nao('O extrato é maior que os lançamentos — não há saldo a deixar em aberto'),
                ADJUST_VALUE: lancamentos.length !== 1
                    ? nao('Ajustar valor exige exatamente 1 lançamento selecionado')
                    : ORIGENS_VALOR_SINCRONIZADO.includes(lancamentos[0].source_system)
                        ? nao('O valor deste lançamento vem da origem e seria regravado pela sincronização')
                        : ok,
            };

    return {
        qtdExtrato: extrato.length,
        qtdLancamentos: lancamentos.length,
        totalExtrato: cExtrato / 100,
        totalLancamentos: cLanc / 100,
        diferenca: dif,
        direcao,
        temDiferenca,
        conciliar: bloqueio
            ? nao(bloqueio)
            : temDiferenca
                ? nao(`Diferença de ${formatarBRL(Math.abs(dif))} entre extrato e lançamentos — use Ajustar diferença`)
                : ok,
        ajustes,
        titulosDesmembraveis,
    };
}
