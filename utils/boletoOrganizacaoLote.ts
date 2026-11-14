/**
 * Mudar a organização de boletos — puro, sem React nem Supabase.
 *
 * A regra nasceu no formulário de 1 boleto (24/09/2026, `boletoService.moverParaOrganizacao`):
 * só rascunho/revisão mudam, porque a aprovação cria título e nota com o `organization_id`
 * do boleto — mover depois deixaria o título no caixa da org antiga. 13/11/2026: a Edição em
 * Lote ganhou a mesma ação (pedido "Poder alterar organização ao editar em lote"); a regra
 * mora aqui para o serviço e a janela do lote dizerem a MESMA coisa.
 * Plano: docs/planos/2026-11-13-boletos-a-pagar-dez-pedidos.md (item 2).
 */
import type { Boleto, BoletoStatus } from '../types';

export function podeMudarOrganizacao(status: BoletoStatus): boolean {
    return status === 'rascunho' || status === 'revisao';
}

/** Por que este status não muda de organização — frase para a tela. null = pode. */
export function motivoParaNaoMudarOrganizacao(status: BoletoStatus): string | null {
    if (podeMudarOrganizacao(status)) return null;
    if (status === 'aprovado') return 'Boleto aprovado já tem título no financeiro desta organização. Exclua ou cancele para recapturar em outra.';
    if (status === 'pago') return 'Boleto pago: reverta para rascunho antes de mudar de organização.';
    if (status === 'cancelado') return 'Boleto cancelado fica no histórico da organização em que foi capturado.';
    return 'Só é possível mudar a organização enquanto o boleto está em rascunho.';
}

/** As dimensões que são cadastro da organização — vão a null ao mudar (não existem na outra). */
type ComDimensoes = Pick<Boleto, 'supplier_id' | 'project_id' | 'cost_center_id' | 'plano_de_contas_id' | 'category_id'>;

export function temDimensaoDaOrganizacao(b: Partial<ComDimensoes>): boolean {
    return !!(b.supplier_id || b.project_id || b.cost_center_id || b.plano_de_contas_id || b.category_id);
}

export type PlanoDeOrganizacao = { muda: true } | { muda: false; motivo: string };

export function planoDeOrganizacaoDoBoleto(
    b: Pick<Boleto, 'status' | 'organization_id'>,
    destino: string,
): PlanoDeOrganizacao {
    if (b.organization_id === destino) return { muda: false, motivo: 'Já é desta organização.' };
    const motivo = motivoParaNaoMudarOrganizacao(b.status);
    return motivo ? { muda: false, motivo } : { muda: true };
}

export interface ResumoDeOrganizacaoEmLote {
    porId: Map<string, PlanoDeOrganizacao>;
    mudam: number;
    ficam: number;
    /** Dos que mudam, quantos perdem fornecedor/obra/CC/plano/conta (o aviso só aparece se > 0). */
    perdemDimensoes: number;
}

export function resumoDeOrganizacaoEmLote(
    boletos: Array<Pick<Boleto, 'id' | 'status' | 'organization_id'> & Partial<ComDimensoes>>,
    destino: string,
): ResumoDeOrganizacaoEmLote {
    const porId = new Map<string, PlanoDeOrganizacao>();
    let mudam = 0;
    let perdemDimensoes = 0;
    for (const b of boletos) {
        const plano = planoDeOrganizacaoDoBoleto(b, destino);
        porId.set(b.id, plano);
        if (plano.muda) {
            mudam++;
            if (temDimensaoDaOrganizacao(b)) perdemDimensoes++;
        }
    }
    return { porId, mudam, ficam: boletos.length - mudam, perdemDimensoes };
}
