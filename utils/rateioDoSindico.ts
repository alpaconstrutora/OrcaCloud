// utils/rateioDoSindico.ts
//
// Portal do Síndico › Prestação de contas — o síndico monta, fecha e cobra o
// rateio (G1, 24/10/2026). A parte pura (sem React, sem Supabase).
// Plano: docs/planos/2026-10-24-portal-sindico-gestao-completa.md
//
// O banco decide (RPCs `sindico_portal_rateio_*`, migration
// aplicar_20271024910000); isto existe para o botão desligado dizer o motivo
// ANTES do clique, com as mesmas mensagens que o banco devolveria.
import { rotuloDeDespesa } from './despesaCondominio';

export type CriterioDoRateio = 'FRACAO_IDEAL' | 'IGUAL' | 'AREA_PRIVATIVA' | 'GRUPO' | 'FIXO';
export type TipoDoRateio = 'ORDINARIO' | 'EXTRAORDINARIO';
/** De quem cobrar: rateio extraordinário (obra, benfeitoria) é do proprietário por lei. */
export type PagadorDaCota = 'RESPONSAVEL' | 'PROPRIETARIO';

/** O que `sindico_portal_rateio_previa` devolve (porta de `condominioRateioService.previa`). */
export interface PreviaDoRateio {
    despesas: { transaction_id: string; descricao: string | null; parte: string | null; fornecedor: string | null; valor: number; data: string }[];
    totalDespesas: number;
    itens: { unitId: string; unitLabel: string; peso: number; valor: number; clientId: string | null; clientNome: string; aviso: string | null }[];
    totalRateado: number;
    semDado: number;
    semResponsavel: number;
    jaRateadas: number;
}

/** Uma cota de rateio fechado, como `sindico_portal_rateio_cotas` devolve. */
export interface CotaParaGerar {
    itemId: string;
    unitLabel: string;
    valor: number;
    clientNome: string;
    gerada: boolean;
    bloqueio: string | null;
}

/** O mínimo do rateio do payload do portal que as regras leem. */
export interface RateioDoPortal {
    status: 'RASCUNHO' | 'FECHADO';
    cotas: { tituloStatus: string | null }[];
}

export type SituacaoDoRateio = 'RASCUNHO' | 'FECHADO' | 'COTAS_PARCIAIS' | 'COTAS_GERADAS';

export const ROTULO_SITUACAO_DO_RATEIO: Record<SituacaoDoRateio, string> = {
    RASCUNHO: 'Rascunho', FECHADO: 'Fechado', COTAS_PARCIAIS: 'Cotas em parte', COTAS_GERADAS: 'Cotas geradas',
};

export const CRITERIOS_DO_RATEIO: { id: CriterioDoRateio; label: string }[] = [
    { id: 'IGUAL', label: 'Valor igual por unidade' },
    { id: 'FRACAO_IDEAL', label: 'Fração ideal' },
    { id: 'AREA_PRIVATIVA', label: 'Área privativa' },
    { id: 'GRUPO', label: 'Grupo de unidades' },
    { id: 'FIXO', label: 'Valor fixo por unidade' },
];

/** Cota com recebível = `tituloStatus` preenchido no payload (o item tem `transaction_id`). */
const geradas = (r: RateioDoPortal) => r.cotas.filter(c => !!c.tituloStatus).length;

export function situacaoDoRateio(r: RateioDoPortal): SituacaoDoRateio {
    if (r.status === 'RASCUNHO') return 'RASCUNHO';
    const n = geradas(r);
    if (n === 0) return 'FECHADO';
    return n < r.cotas.length ? 'COTAS_PARCIAIS' : 'COTAS_GERADAS';
}

/** `base` = o motivo de não operar (link sem senha, prévia, condomínio sem org própria). */
export function motivoNaoFechaRateio(r: RateioDoPortal, base: string | null): string | null {
    if (base) return base;
    return r.status === 'RASCUNHO' ? null : 'Só rateio em rascunho pode ser fechado.';
}

export function motivoNaoGeraCotas(r: RateioDoPortal, base: string | null): string | null {
    if (base) return base;
    if (r.status !== 'FECHADO') return 'Feche o rateio antes de gerar as cotas.';
    return geradas(r) >= r.cotas.length ? 'Todas as cotas deste rateio já foram geradas.' : null;
}

export function motivoNaoCancelaRateio(r: RateioDoPortal, base: string | null): string | null {
    if (base) return base;
    return geradas(r) > 0
        ? 'As cotas deste rateio já viraram cobrança. Para refazer, peça à administradora o cancelamento das cotas.'
        : null;
}

export function motivoNaoSalvaRateio(
    form: { criterio: CriterioDoRateio; grupo: string[]; valorFixo: number | null },
    previa: { totalRateado: number; despesas: unknown[] } | null,
    base: string | null,
): string | null {
    if (base) return base;
    if (form.criterio === 'GRUPO' && form.grupo.length === 0) return 'Escolha as unidades do grupo.';
    if (form.criterio === 'FIXO' && !(Number(form.valorFixo) > 0)) return 'Informe o valor fixo por unidade.';
    if (!previa) return 'Aguarde a prévia do rateio.';
    if (previa.despesas.length === 0 && form.criterio !== 'FIXO') return 'Não há despesa nesta competência para ratear.';
    if (!(previa.totalRateado > 0)) return 'Nenhuma unidade ficou com cota — confira o critério.';
    return null;
}

/**
 * O texto que vai para o snapshot do rateio: a MESMA poda do admin
 * (`rotuloDeDespesa(descrição, parte)` em `condominioRateioService.previa`).
 * Sem rótulo possível, a despesa fica fora do mapa e o banco usa a descrição.
 */
export function rotulosDasDespesas(
    despesas: Pick<PreviaDoRateio['despesas'][number], 'transaction_id' | 'descricao' | 'parte'>[],
): Record<string, string> {
    const out: Record<string, string> = {};
    for (const d of despesas) {
        const r = rotuloDeDespesa(d.descricao, d.parte);
        if (r) out[d.transaction_id] = r;
    }
    return out;
}
