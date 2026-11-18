// Chaves PIX cadastradas do favorecido de um título — lado do servidor.
//
// Plano: docs/planos/2026-10-16-asaas-pendencias-e-pix.md (item 3.1).
//
// O navegador nunca manda a chave de um cadastro: manda a REFERÊNCIA da opção
// ("fornecedor:<id da conta>"), e o servidor relê a chave aqui no momento do
// disparo. Só a chave digitada (avulso) vem do navegador — e tem teto próprio.

import type { Quarentena } from '../../../utils/asaasGovernanca.ts';
import { favorecidoDoTitulo, type Favorecido, type TituloParaPix } from "../../../utils/pixDestino.ts";
import { validarChavePix, deduzirTipoChave, mascararChave, type TipoChavePix } from "../../../utils/pixKey.ts";

// deno-lint-ignore no-explicit-any
type Admin = any;

export interface OpcaoChave {
    /** "<origem>:<id>" — o que o navegador devolve para escolher. */
    ref: string;
    rotulo: string;
    tipo: TipoChavePix | null;
    /** Normalizada (como vai para a Asaas). NÃO sai para o navegador. */
    chave: string;
    chaveMascarada: string;
    titular: string | null;
    documento: string | null;
    principal: boolean;
    /** Conta marcada por gestor: o titular da chave pode ser outra pessoa/empresa. */
    titularDiferente: boolean;
    /** Chave criada/alterada há menos de 24 h (preenchido por quem dispara, que sabe quem é). */
    quarentena?: Quarentena | null;
    /** Por que esta chave não serve (formato inválido, tipo ambíguo) — a tela mostra. */
    invalida: string | null;
}

export interface DestinoPix {
    favorecido: Favorecido;
    nome: string | null;
    documento: string | null;
    opcoes: OpcaoChave[];
}

/** Texto vazio do cadastro conta como ausente: `''` passava pelo `??` e o PIX real de
 *  18/10/2026 saiu com favorecido em branco ("PIX enviado para ."). */
const texto = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

function opcao(ref: string, rotulo: string, tipoGuardado: string | null, chaveBruta: string, titular: string | null, documento: string | null, principal: boolean, titularDiferente = false): OpcaoChave {
    const tipo = (tipoGuardado as TipoChavePix | null) || deduzirTipoChave(chaveBruta);
    const r = validarChavePix(tipo, chaveBruta);
    return {
        ref, rotulo, tipo, chave: r.chave,
        chaveMascarada: mascararChave(tipo, r.ok ? r.chave : chaveBruta),
        titular, documento, principal, titularDiferente,
        invalida: r.ok ? null : (tipo ? r.motivo : 'Chave sem tipo e o tipo não pôde ser deduzido — corrija no cadastro.'),
    };
}

/** Título com a organização dele — é contra ela que o favorecido é conferido (F72). */
export type TituloDoPix = TituloParaPix & { organization_id: string };

/**
 * O favorecido é da organização do título, ou foi disponibilizado para ela?
 *
 * Achado F72 (varredura de 15/11/2026): o id do favorecido vem de campo que o membro edita
 * (`supplier_id`, `employee_id`, `reference_id` da folha/pró-labore), e as leituras abaixo
 * usam a chave de serviço. Sem esta conferência, um título da org A apontando para um
 * colaborador/fornecedor/sócio da org B devolvia nome, CPF/CNPJ, titular e chave mascarada
 * dele no `pix_quote`.
 *
 * Disponibilizado = linha em `<tabela de compartilhamento>` com `target_org_id` = org do
 * título. Pela API, essas linhas só são escritas por quem é membro da org DONA e do destino
 * (policies de `employee_org_shares` e `supplier_org_shares`, migration
 * aplicar_20271118911000). Fornecedor ainda ganha compartilhamento por três funções do banco
 * que não exigem a dona (fn_incluir_org_nos_catalogos repassa o que uma org sua recebeu;
 * sindico_portal_salvar_fornecedor acha o fornecedor pelo CNPJ em todo o SaaS;
 * mover_contrato_organizacao leva os fornecedores dos títulos para o destino) — então, para
 * fornecedor, isto vale como "o cadastro é visível para a org do título", e não como "é da
 * org". Erro de leitura = não pertence (falha fechada).
 */
async function daOrgDoTitulo(
    admin: Admin,
    compartilhamento: 'supplier_org_shares' | 'employee_org_shares',
    coluna: 'supplier_id' | 'employee_id',
    id: string,
    orgDoFavorecido: string | null | undefined,
    orgDoTitulo: string,
): Promise<boolean> {
    if (!orgDoTitulo) return false;
    if (orgDoFavorecido && orgDoFavorecido === orgDoTitulo) return true;
    const { data, error } = await admin.from(compartilhamento).select('id')
        .eq(coluna, id).eq('target_org_id', orgDoTitulo).limit(1);
    return !error && Array.isArray(data) && data.length > 0;
}

/**
 * Organizações cujas contas bancárias do favorecido valem: a dona dele e a do título.
 *
 * A linha da conta tem organização própria (supplier_bank_accounts.organization_id,
 * employee_bank_accounts.org_id), e a RLS dessas tabelas deixa um gestor gravar conta para
 * favorecido que só enxerga (fornecedor de outra org pelo id; colaborador disponibilizado),
 * com a org dele na linha. Sem este filtro a chave dele aparecia como "Cadastro do …" no PIX
 * da org dona (revisão de 18/11). Dados de 18/11: todas as 7 contas na org do dono.
 */
const orgsDasContas = (orgDoFavorecido: string | null | undefined, orgDoTitulo: string): string[] =>
    [...new Set([orgDoFavorecido, orgDoTitulo].filter((o): o is string => !!o))];

/** A empresa (companies) é da organização do título? Sócio e conta do sócio (F72). */
async function empresaDaOrg(admin: Admin, companyId: string | null | undefined, orgDoTitulo: string): Promise<boolean> {
    if (!companyId || !orgDoTitulo) return false;
    const { data, error } = await admin.from('companies').select('org_id').eq('id', companyId).maybeSingle();
    return !error && !!data?.org_id && data.org_id === orgDoTitulo;
}

export async function destinoDoTitulo(admin: Admin, titulo: TituloDoPix): Promise<DestinoPix> {
    const favorecido = favorecidoDoTitulo(titulo);
    const vazio: DestinoPix = { favorecido, nome: null, documento: null, opcoes: [] };
    const orgDoTitulo = titulo.organization_id;

    // Favorecido de fora da organização do título = como se a linha dele não existisse:
    // a mesma resposta vazia de antes (não vira 'avulso'), sem dizer que o id existe noutra org.

    if (favorecido.origem === 'fornecedor') {
        const { data: s } = await admin.from('suppliers').select('organization_id,name,nickname,document').eq('id', favorecido.id).maybeSingle();
        if (!s || !(await daOrgDoTitulo(admin, 'supplier_org_shares', 'supplier_id', favorecido.id!, s.organization_id, orgDoTitulo))) {
            return vazio;
        }
        const { data: contas } = await admin.from('supplier_bank_accounts')
            .select('id,bank_name,pix_key,pix_key_type,beneficiary_name,beneficiary_document,is_pix_primary,titular_diferente_autorizado')
            .eq('supplier_id', favorecido.id).eq('status', 'ativo').not('pix_key', 'is', null)
            .in('organization_id', orgsDasContas(s.organization_id, orgDoTitulo));
        return {
            favorecido, nome: s?.name ?? null, documento: s?.document ?? null,
            opcoes: (contas ?? []).map((c: Record<string, unknown>) => opcao(
                `fornecedor:${c.id}`, `Cadastro do fornecedor${c.bank_name ? ` · ${c.bank_name}` : ''}`,
                c.pix_key_type as string | null, String(c.pix_key),
                texto(c.beneficiary_name) ?? texto(s?.name), texto(c.beneficiary_document) ?? texto(s?.document),
                !!c.is_pix_primary, !!c.titular_diferente_autorizado,
            )),
        };
    }

    if (favorecido.origem === 'colaborador') {
        const { data: e } = await admin.from('employees').select('org_id,name,cpf').eq('id', favorecido.id).maybeSingle();
        if (!e || !(await daOrgDoTitulo(admin, 'employee_org_shares', 'employee_id', favorecido.id!, e.org_id, orgDoTitulo))) {
            return vazio;
        }
        const { data: contas } = await admin.from('employee_bank_accounts')
            .select('id,bank_name,pix_key,pix_key_type,holder_name,is_primary,titular_diferente_autorizado')
            .eq('employee_id', favorecido.id).not('pix_key', 'is', null)
            .in('org_id', orgsDasContas(e.org_id, orgDoTitulo));
        return {
            favorecido, nome: e?.name ?? null, documento: e?.cpf ?? null,
            opcoes: (contas ?? []).map((c: Record<string, unknown>) => opcao(
                `colaborador:${c.id}`, `Cadastro do colaborador${c.bank_name ? ` · ${c.bank_name}` : ''}`,
                c.pix_key_type as string | null, String(c.pix_key),
                texto(c.holder_name) ?? texto(e?.name), texto(e?.cpf), !!c.is_primary, !!c.titular_diferente_autorizado,
            )),
        };
    }

    if (favorecido.origem === 'socio') {
        const { data: item } = await admin.from('prolabore_payroll_items').select('partner_id,payroll_id').eq('id', favorecido.id).maybeSingle();
        // O item do pró-labore vale só se a folha societária dele é da org do título; de outra
        // org responde como item inexistente (a mesma resposta de antes para id que não existe).
        const { data: folha } = item?.payroll_id
            ? await admin.from('prolabore_payrolls').select('organization_id').eq('id', item.payroll_id).maybeSingle()
            : { data: null };
        if (!item?.partner_id || !folha?.organization_id || folha.organization_id !== orgDoTitulo) {
            return { ...vazio, favorecido: { origem: 'avulso', id: null, motivo: 'Item do pró-labore não encontrado — digite a chave PIX.' } };
        }
        // O sócio (partner_id do item) e a conta dele (bank_account_id do sócio) também vêm de
        // campos editáveis: valem só se a empresa deles é da org do título. Sócio de fora =
        // a mesma resposta de antes para sócio que não existe.
        const { data: socioLido } = await admin.from('company_partners')
            .select('id,company_id,nome,documento,pix_chave,pix_tipo,bank_account_id').eq('id', item.partner_id).maybeSingle();
        const p = socioLido && (await empresaDaOrg(admin, socioLido.company_id, orgDoTitulo)) ? socioLido : null;
        const opcoes: OpcaoChave[] = [];
        if (p?.pix_chave) {
            opcoes.push(opcao(`socio:${p.id}`, 'Cadastro do sócio', p.pix_tipo, p.pix_chave, p.nome, p.documento, true));
        }
        if (p?.bank_account_id) {
            const { data: cba } = await admin.from('company_bank_accounts')
                .select('id,company_id,banco_nome,pix_chave,pix_tipo,favorecido').eq('id', p.bank_account_id).maybeSingle();
            if (cba?.pix_chave && (await empresaDaOrg(admin, cba.company_id, orgDoTitulo))) {
                opcoes.push(opcao(`socio-conta:${cba.id}`, `Conta do sócio${cba.banco_nome ? ` · ${cba.banco_nome}` : ''}`,
                    cba.pix_tipo, cba.pix_chave, texto(cba.favorecido) ?? texto(p?.nome), texto(p?.documento), !p?.pix_chave));
            }
        }
        return { favorecido: { ...favorecido, id: p?.id ?? favorecido.id }, nome: p?.nome ?? null, documento: p?.documento ?? null, opcoes };
    }

    return vazio;
}

/** A opção escolhida, relida do cadastro. null = referência que não é deste favorecido. */
export function opcaoEscolhida(destino: DestinoPix, ref: string | null | undefined): OpcaoChave | null {
    if (!ref) return null;
    return destino.opcoes.find(o => o.ref === ref) ?? null;
}

/** O que pode ir para o navegador (sem a chave crua). */
export function opcoesPublicas(destino: DestinoPix) {
    return destino.opcoes.map(({ chave: _c, ...resto }) => resto);
}

/** Id da conta bancária auditada por trás da opção (fornecedor/colaborador), ou null. */
export function contaDaOpcao(ref: string): string | null {
    const [origem, id] = ref.split(':');
    return (origem === 'fornecedor' || origem === 'colaborador') && id ? id : null;
}
