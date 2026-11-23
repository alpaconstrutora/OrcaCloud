/**
 * Linhas do card de um empreendimento do Credit Room, pelo OBJETIVO dele
 * (docs/planos/2026-11-22-credit-room-cards-por-objetivo.md):
 *
 *  - Vendas (e objetivo vazio/misto/desconhecido): VGV vendido e VGV disponível, como sempre foi.
 *  - Locação: unidades locadas e disponíveis, cada uma com o aluguel; unidade disponível sem
 *    aluguel cadastrado é contada à parte — nunca vira R$ 0.
 *  - Serviço: contrato faturado e a faturar; sem contrato válido, uma frase.
 *
 * Lê SÓ o snapshot congelado. Campo ausente (versão liberada antes deste recurso) é "dado ausente",
 * nunca zero: aparece como `ausente` ("—" na tela, "n/d" no book).
 *
 * Função pura, usada pela tela (interno e portal) e pelo book em PDF.
 */
import { formatMoney } from '../components/ui/Format';
import type { SnapshotEmpreendimentoItem } from './creditRoomSnapshot';

export interface LinhaDoCard {
    rotulo: string;
    valor: string;
    /** `aviso` = vale chamar atenção (frase de ausência), sem ser erro. */
    tom?: 'neutro' | 'aviso';
}

export interface OpcoesDoCard {
    /** Texto de dado ausente. Padrão "—" (tela); o book usa "n/d". */
    ausente?: string;
    /** Formatador de dinheiro (ausente já tratado aqui). Padrão: o da tela. */
    money?: (v: number) => string;
}

export const FRASE_SEM_CONTRATO_DE_SERVICO = 'sem contrato de serviço ativo';

const inteiro = (v: number) => v.toLocaleString('pt-BR');
const unidades = (n: number) => `${inteiro(n)} ${n === 1 ? 'unidade' : 'unidades'}`;

export function linhasDoCardDoEmpreendimento(e: SnapshotEmpreendimentoItem, op: OpcoesDoCard = {}): LinhaDoCard[] {
    const ausente = op.ausente ?? '—';
    const fmt = op.money ?? formatMoney;
    const dinheiro = (v: number | null | undefined) => (v == null ? ausente : fmt(v));
    const mensal = (v: number | null | undefined) => (v == null ? ausente : `${fmt(v)}/mês`);
    const quantidade = (v: number | null | undefined) => (v == null ? ausente : inteiro(v));
    const renda: LinhaDoCard = { rotulo: 'Renda do mês', valor: dinheiro(e.renda_mensal) };

    if (e.objetivo === 'LOCACAO') {
        const linhas: LinhaDoCard[] = [
            { rotulo: 'Unidades locadas', valor: `${quantidade(e.alugadas)} · ${mensal(e.aluguel_locadas)}` },
        ];
        // Etapa da negociação (Reserva/Contrato/Assinatura): só aparece quando há alguma; versão antiga não tem o campo.
        const negociando = e.em_negociacao ?? 0;
        if (negociando > 0) {
            linhas.push({ rotulo: 'Em negociação', valor: `${inteiro(negociando)} · ${mensal(e.aluguel_em_negociacao)}` });
            const etapas = Object.entries(e.em_negociacao_por_etapa ?? {});
            if (etapas.length) {
                linhas.push({ rotulo: 'Etapa da negociação', valor: etapas.map(([r, n]) => `${r}: ${inteiro(n)}`).join(' · ') });
            }
        }
        linhas.push({ rotulo: 'Unidades disponíveis', valor: `${quantidade(e.disponiveis)} · ${mensal(e.aluguel_disponiveis)}` });
        // Só avisa quando há o que contar: versão antiga (campo ausente) e "nenhuma sem valor" (0) não geram linha.
        const semValor = e.disponiveis_sem_aluguel ?? 0;
        if (semValor > 0) linhas.push({ rotulo: 'Sem aluguel cadastrado', valor: unidades(semValor), tom: 'aviso' });
        linhas.push(renda);
        return linhas;
    }

    if (e.objetivo === 'SERVICO') {
        const s = e.servico;
        if (s && s.n_contratos === 0) {
            return [{ rotulo: 'Contratos de serviço', valor: FRASE_SEM_CONTRATO_DE_SERVICO, tom: 'aviso' }, renda];
        }
        return [
            { rotulo: 'Contrato faturado', valor: dinheiro(s?.faturado) },
            { rotulo: 'Contrato a faturar', valor: dinheiro(s?.a_faturar) },
            renda,
        ];
    }

    return [
        { rotulo: 'VGV vendido', valor: dinheiro(e.vgv_vendido) },
        { rotulo: 'VGV disponível', valor: dinheiro(e.vgv_disponivel) },
        renda,
    ];
}
