/**
 * Propagar a edição de um cliente (Meus Clientes) para as CÓPIAS do cadastro
 * espalhadas pelo app — funções puras. Pedido do usuário em 13/11/2026:
 * "ao alterar algo e salvar, perguntar se deseja propagar pelo app (financeiro,
 * suprimentos etc). apenas como exemplo ao alterar o nome".
 *
 * Por que existe: várias tabelas guardam o nome (e às vezes o e-mail) do
 * cliente como TEXTO, gravado no momento do lançamento, além do id. Renomear o
 * cliente não mexia nelas — medido no banco em 13/11: "Filtrelec Comercio e
 * Importação" seguia "Filtrelec" em 36 títulos do Financeiro.
 *
 * Onde mora a cópia (e o vínculo pelo id que diz de QUEM é a cópia):
 *
 * | destino            | tabela                         | vínculo            | campos copiados                   |
 * |--------------------|--------------------------------|--------------------|-----------------------------------|
 * | Financeiro         | internal_transactions          | party_id           | party_name, entity_name, party_email |
 * | Cobranças (Asaas)  | client_charges                 | client_id          | party_name, party_email           |
 * | Garantia           | warranty_claims                | client_id          | client_name                       |
 * | Obras              | projects.settings.client       | settings.clientId  | (só o nome)                       |
 *
 * Fora, de propósito: documento JÁ EMITIDO guarda o nome da data da emissão e
 * não se reescreve — recibos numerados (`financial_receipts.payer_name`), NF-e
 * (`nfe_invoices.recipient_name`) e o histórico da régua de cobrança
 * (`dunning_events`). Suprimentos não guarda cópia de cliente (credor lá é
 * sempre fornecedor). Vendas/Locações/Contratos leem o nome pelo id, na hora.
 */

/** Campos do cadastro que têm cópia em outras tabelas. */
export interface CamposPropagaveis {
    name?: string;
    email?: string;
}

const limpo = (v: string | null | undefined): string => (v ?? '').trim();

/**
 * O que mudou NESTE salvamento entre os campos que têm cópia. Só o que mudou
 * vai para a pergunta: salvar o telefone não pode oferecer "propagar o nome".
 * Nome vazio nunca propaga (apagaria o rótulo de centenas de títulos).
 */
export function camposAlterados(
    antes: { name?: string | null; email?: string | null } | null | undefined,
    depois: { name?: string | null; email?: string | null },
): CamposPropagaveis | null {
    if (!antes) return null;
    const out: CamposPropagaveis = {};
    const nomeNovo = limpo(depois.name);
    if (nomeNovo && nomeNovo !== limpo(antes.name)) out.name = nomeNovo;
    const emailNovo = limpo(depois.email);
    if (emailNovo && emailNovo.toLowerCase() !== limpo(antes.email).toLowerCase()) out.email = emailNovo;
    return out.name || out.email ? out : null;
}

/** Linha de `internal_transactions` / `client_charges` com as colunas copiadas. */
export interface LinhaComCopia {
    party_name?: string | null;
    party_email?: string | null;
    /** Só `internal_transactions` tem. */
    entity_name?: string | null;
}

/**
 * Patch de UMA linha de título/cobrança, ou `null` se ela já está em dia.
 *
 * - `party_name`: toda cópia diferente do nome novo é atualizada — inclusive a
 *   que já estava defasada ANTES desta edição (o caso Filtrelec): o objetivo é
 *   o app inteiro mostrar o nome do cadastro.
 * - `entity_name`: só quando era espelho do `party_name` da linha. Em título de
 *   origem BOLETO ele guarda o beneficiário lido do código (outro dado).
 * - `party_email`: só onde a linha tinha e-mail — cópia vazia continua vazia
 *   (não se inventa destinatário de cobrança).
 */
export function patchDaLinha(
    linha: LinhaComCopia,
    novo: CamposPropagaveis,
    temEntityName: boolean,
): Record<string, string> | null {
    const patch: Record<string, string> = {};
    if (novo.name) {
        if (limpo(linha.party_name) !== novo.name) patch.party_name = novo.name;
        if (temEntityName && linha.entity_name != null && limpo(linha.entity_name) !== novo.name
            && limpo(linha.entity_name) === limpo(linha.party_name)) {
            patch.entity_name = novo.name;
        }
    }
    if (novo.email && limpo(linha.party_email) && limpo(linha.party_email).toLowerCase() !== novo.email.toLowerCase()) {
        patch.party_email = novo.email;
    }
    return Object.keys(patch).length ? patch : null;
}

/**
 * Conta a pagar em RASCUNHO que o UPDATE mandaria para a aprovação: o gatilho
 * `trg_titulo_volta_a_alcada` (fn_titulo_nasce_na_alcada) põe em PENDENTE
 * qualquer título DEBIT/PENDING/RASCUNHO alterado, seja qual for a coluna.
 * Trocar o nome não pode submeter um rascunho, então ele fica como está.
 */
export function mandariaParaAlcada(l: { direction?: string | null; status?: string | null; approval_status?: string | null }): boolean {
    return l.direction === 'DEBIT'
        && (l.status ?? 'PENDING') === 'PENDING'
        && (l.approval_status ?? 'RASCUNHO') === 'RASCUNHO';
}

export type DestinoPropagacao = 'financeiro' | 'cobrancas' | 'garantia' | 'obras';

export const ROTULO_DESTINO: Record<DestinoPropagacao, { um: string; varios: string; onde: string }> = {
    financeiro: { um: 'lançamento', varios: 'lançamentos', onde: 'Financeiro (contas a receber/pagar)' },
    cobrancas: { um: 'cobrança', varios: 'cobranças', onde: 'Cobranças (boleto/PIX)' },
    garantia: { um: 'chamado', varios: 'chamados', onde: 'Assistência técnica (garantia)' },
    obras: { um: 'obra', varios: 'obras', onde: 'Obras e planejamentos' },
};

/** "Financeiro (contas a receber/pagar): 36 lançamentos" — uma linha por destino com cópia. */
export function linhasDoResumo(contagem: Partial<Record<DestinoPropagacao, number>>): string[] {
    return (Object.keys(ROTULO_DESTINO) as DestinoPropagacao[])
        .filter(d => (contagem[d] ?? 0) > 0)
        .map(d => {
            const n = contagem[d] ?? 0;
            const r = ROTULO_DESTINO[d];
            return `${r.onde}: ${n} ${n === 1 ? r.um : r.varios}`;
        });
}

/** "o nome" / "o e-mail" / "o nome e o e-mail" — para o título da pergunta. */
export function descreverCampos(c: CamposPropagaveis): string {
    if (c.name && c.email) return 'o nome e o e-mail';
    return c.name ? 'o nome' : 'o e-mail';
}

/** O mesmo, contraído com "de": "cópia do nome" (não "cópia de o nome"). */
export function descreverCamposComDe(c: CamposPropagaveis): string {
    if (c.name && c.email) return 'do nome e do e-mail';
    return c.name ? 'do nome' : 'do e-mail';
}
