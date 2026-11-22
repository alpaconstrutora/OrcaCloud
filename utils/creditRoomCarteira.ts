/**
 * Carteira do Credit Room (rent roll + vendas) — a montagem pura.
 *
 * Puro: nada aqui toca banco. `services/creditRoomService.ts` coleta os
 * títulos, as locações vigentes, a unidade e o valor de cada contrato e entrega
 * aqui; este módulo só monta as linhas que vão congeladas no snapshot.
 *
 * Regras:
 *
 *   · Nome de cliente nunca sai como dado. A linha leva só o rótulo mascarado
 *     ("Comprador 01", "Locatário 03"); `partyKey` não entra na saída.
 *
 *   · Ordem: vendas e depois locações, cada uma por `valor_contrato`
 *     decrescente — o rótulo segue essa ordem ("Comprador 01" é o maior).
 *
 *   · Saldo e vencido são medidos contra a DATA-BASE: título aberto com
 *     vencimento até ela (inclusive) é vencido; depois dela, a vencer.
 *
 * Plano: docs/planos/2026-11-21-credit-room-capacidade.md (carteira).
 */

import { round2 } from './financialMath';
import { rotuloMascarado, type LocacaoVigente, type Natureza, type TituloCarteira } from './creditCapacity';
// `import type`: creditRoomSnapshot não importa nada daqui, mas manter só tipo
// evita qualquer ciclo em runtime.
import type { SnapshotContrato } from './creditRoomSnapshot';

const n0 = (v: number | null | undefined): number => (v == null || Number.isNaN(v) ? 0 : v);
const dia = (iso: string): string => iso.slice(0, 10);

/**
 * Uma linha por contrato com título, mais uma por locação vigente ainda sem
 * título. Título sem contrato ou sem natureza (serviço, lançamento avulso) não
 * é linha de carteira — continua na série e no vencido.
 *
 * `valor_contrato`:
 *   · VENDA — o valor do CONTRATO (`contracts.current_value`, senão o `value`
 *     do negócio), que o service passa em `valorDoContrato`. Só sem nenhum dos
 *     dois cai na soma dos títulos gerados: a soma de títulos é o que foi
 *     FATURADO, e venda com parcelas ainda não geradas sairia menor do que é.
 *   · LOCACAO — a soma dos títulos gerados. O `current_value` da locação é o
 *     aluguel MENSAL (vai em `parcela_mensal`), e "aluguel × meses restantes"
 *     não é honesto aqui: parte das locações tem prazo indeterminado (sem fim
 *     ou fim vencido — alerta LOCACAO_PRAZO_INDETERMINADO), e qualquer número
 *     de meses inventado viraria valor de contrato na frente do banco.
 */
export function montarCarteira(
    titulos: TituloCarteira[],
    locacoes: LocacaoVigente[],
    dataBase: string,
    unidadePorContrato: Map<string, string> = new Map(),
    valorDoContrato: Map<string, number> = new Map(),
): SnapshotContrato[] {
    const db = dia(dataBase);
    const soma = (ts: TituloCarteira[]) => round2(ts.reduce((a, t) => a + n0(t.amount), 0));
    const vigente = new Map(locacoes.map(l => [l.contractId, l]));

    const grupos = new Map<string, TituloCarteira[]>();
    for (const t of titulos) {
        if (!t.contractId || !t.natureza) continue;
        const g = grupos.get(t.contractId);
        if (g) g.push(t); else grupos.set(t.contractId, [t]);
    }

    type Linha = Omit<SnapshotContrato, 'rotulo'>;
    const linhas: Linha[] = [];
    for (const [contractId, ts] of grupos) {
        const tipo = ts[0].natureza as Natureza;
        const locacao = vigente.get(contractId);
        const abertos = ts.filter(t => !t.recebido);
        const saldo = soma(abertos);
        const vencido = soma(abertos.filter(t => !!t.dueDate && dia(t.dueDate) <= db));
        const datas = ts.map(t => (t.dueDate ? dia(t.dueDate) : '')).filter(Boolean).sort();
        const proximo = abertos
            .filter(t => !!t.dueDate && dia(t.dueDate) > db)
            .sort((a, b) => (a.dueDate as string).localeCompare(b.dueDate as string))[0];
        const status = saldo === 0
            ? (tipo === 'LOCACAO' ? (locacao ? 'EM_DIA' : 'ENCERRADO') : 'QUITADO')
            : vencido > 0 ? 'EM_ATRASO' : 'EM_DIA';
        const valorVenda = tipo === 'VENDA' ? valorDoContrato.get(contractId) : undefined;
        linhas.push({
            tipo,
            contract_id: contractId,
            organization_id: ts[0].organizationId,
            empreendimento_id: ts.find(t => t.empreendimentoId)?.empreendimentoId ?? locacao?.empreendimentoId ?? null,
            unidade: unidadePorContrato.get(contractId) ?? null,
            valor_contrato: valorVenda != null && valorVenda > 0 ? round2(valorVenda) : soma(ts),
            parcela_mensal: tipo === 'LOCACAO' && locacao ? locacao.aluguelMensal : round2(n0(proximo?.amount)),
            saldo_a_receber: saldo,
            vencido,
            primeiro_vencimento: datas[0] ?? null,
            ultimo_vencimento: datas[datas.length - 1] ?? null,
            status,
            tem_parcelas: true,
        });
    }
    for (const l of locacoes) {
        if (grupos.has(l.contractId)) continue;
        linhas.push({
            tipo: 'LOCACAO',
            contract_id: l.contractId,
            organization_id: l.organizationId,
            empreendimento_id: l.empreendimentoId,
            unidade: unidadePorContrato.get(l.contractId) ?? null,
            valor_contrato: 0,
            parcela_mensal: l.aluguelMensal,
            saldo_a_receber: 0,
            vencido: 0,
            primeiro_vencimento: null,
            ultimo_vencimento: null,
            status: 'SEM_PARCELAS',
            tem_parcelas: false,
        });
    }

    const ordem: Natureza[] = ['VENDA', 'LOCACAO'];
    return ordem.flatMap(tipo => linhas
        .filter(x => x.tipo === tipo)
        .sort((a, b) => b.valor_contrato - a.valor_contrato)
        .map((x, i) => ({ rotulo: rotuloMascarado(tipo, i + 1), ...x })));
}

// ── Situação do contrato (texto) ─────────────────────────────────────────────

const SITUACAO_PT: Record<string, string> = {
    EM_DIA: 'Em dia', EM_ATRASO: 'Em atraso', QUITADO: 'Quitado', ENCERRADO: 'Encerrado',
};

/**
 * Texto da situação de um contrato da carteira congelada — o mesmo na tela
 * (Empreendimentos e contratos) e no book em PDF. Locação sem títulos gerados é
 * normal: o aluguel vem do contrato (não é alerta); venda sem parcelas é furo de cadastro.
 */
export function textoDaSituacao(c: Pick<SnapshotContrato, 'tipo' | 'status' | 'tem_parcelas'>): string {
    if (!c.tem_parcelas) return c.tipo === 'LOCACAO' ? 'aluguel pelo contrato' : 'sem parcelas geradas';
    return SITUACAO_PT[c.status] ?? (c.status ? c.status.toLowerCase().replace(/_/g, ' ') : '—');
}
