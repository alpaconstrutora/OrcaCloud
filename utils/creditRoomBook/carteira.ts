/** Seções 5 e 6: carteira de contratos (só rótulo mascarado) e índice do Data Room. */
import type { CreditRoomVersion } from '../../types/creditRoom';
import { textoDaSituacao } from '../creditRoomCarteira';
import { FRASE_SCHEMA_1, N_D, aviso, data, money, secao, tabela, type Ctx, type ExtrasDoBook } from './base';

export function secaoCarteira(c: Ctx, versao: CreditRoomVersion) {
    const s = versao.snapshot;
    const contratos = s.contratos ?? null;
    secao(c, '5. Carteira de contratos', 'Cada contrato aparece só pelo rótulo (Comprador / Locatário): o nome do cliente não existe nesta versão.');
    if (!contratos) { aviso(c, `Esta seção não consta neste book: ${FRASE_SCHEMA_1}.`); return; }
    if (contratos.length === 0) { aviso(c, 'Nenhum contrato na carteira desta versão.'); return; }
    const empNome = new Map((s.empreendimentos ?? []).map(e => [e.id, e.nome]));
    tabela(c, ['Contrato', 'Empreendimento', 'Unid.', 'Valor do contrato', 'Parcela/aluguel', 'Saldo a receber', 'Vencido', '1º venc.', 'Último venc.', 'Situação'],
        contratos.map(k => [
            { v: k.rotulo, direita: false },
            { v: (k.empreendimento_id && empNome.get(k.empreendimento_id)) || N_D, direita: false },
            { v: k.unidade ?? N_D, direita: false },
            // Sem parcelas geradas a carteira grava 0: aqui é "não calculado", não zero.
            k.tem_parcelas ? money(k.valor_contrato) : N_D,
            k.parcela_mensal > 0 ? money(k.parcela_mensal) : N_D,
            k.tem_parcelas ? money(k.saldo_a_receber) : N_D,
            k.tem_parcelas ? { v: money(k.vencido), vermelho: k.vencido > 0 } : N_D,
            { v: data(k.primeiro_vencimento), direita: false },
            { v: data(k.ultimo_vencimento), direita: false },
            { v: textoDaSituacao(k), direita: false },
        ]), { fonte: 6.3, direitaA: 3 });
}

// ── Seção 6: índice do Data Room ─────────────────────────────────────────────

export function secaoDataRoom(c: Ctx, docs: ExtrasDoBook['documentos']) {
    secao(c, '6. Data Room (índice)', 'Os documentos compartilhados nesta operação. Os arquivos ficam no Data Room, não neste book.');
    if (!docs.length) { aviso(c, 'Nenhum documento compartilhado nesta operação.'); return; }
    const comEmpresa = docs.some(d => d.empresa);
    tabela(c, ['Documento', 'Categoria', ...(comEmpresa ? ['Empresa'] : [])],
        docs.map(d => [d.nome, d.categoria, ...(comEmpresa ? [d.empresa ?? N_D] : [])]), { direitaA: 99 });
}
