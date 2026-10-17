// Chaves PIX cadastradas do favorecido de um título — lado do servidor.
//
// Plano: docs/planos/2026-10-16-asaas-pendencias-e-pix.md (item 3.1).
//
// O navegador nunca manda a chave de um cadastro: manda a REFERÊNCIA da opção
// ("fornecedor:<id da conta>"), e o servidor relê a chave aqui no momento do
// disparo. Só a chave digitada (avulso) vem do navegador — e tem teto próprio.

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
    /** Por que esta chave não serve (formato inválido, tipo ambíguo) — a tela mostra. */
    invalida: string | null;
}

export interface DestinoPix {
    favorecido: Favorecido;
    nome: string | null;
    documento: string | null;
    opcoes: OpcaoChave[];
}

function opcao(ref: string, rotulo: string, tipoGuardado: string | null, chaveBruta: string, titular: string | null, documento: string | null, principal: boolean): OpcaoChave {
    const tipo = (tipoGuardado as TipoChavePix | null) || deduzirTipoChave(chaveBruta);
    const r = validarChavePix(tipo, chaveBruta);
    return {
        ref, rotulo, tipo, chave: r.chave,
        chaveMascarada: mascararChave(tipo, r.ok ? r.chave : chaveBruta),
        titular, documento, principal,
        invalida: r.ok ? null : (tipo ? r.motivo : 'Chave sem tipo e o tipo não pôde ser deduzido — corrija no cadastro.'),
    };
}

export async function destinoDoTitulo(admin: Admin, titulo: TituloParaPix): Promise<DestinoPix> {
    const favorecido = favorecidoDoTitulo(titulo);
    const vazio: DestinoPix = { favorecido, nome: null, documento: null, opcoes: [] };

    if (favorecido.origem === 'fornecedor') {
        const { data: s } = await admin.from('suppliers').select('name,nickname,document').eq('id', favorecido.id).maybeSingle();
        const { data: contas } = await admin.from('supplier_bank_accounts')
            .select('id,bank_name,pix_key,pix_key_type,beneficiary_name,beneficiary_document,is_pix_primary')
            .eq('supplier_id', favorecido.id).eq('status', 'ativo').not('pix_key', 'is', null);
        return {
            favorecido, nome: s?.name ?? null, documento: s?.document ?? null,
            opcoes: (contas ?? []).map((c: Record<string, unknown>) => opcao(
                `fornecedor:${c.id}`, `Cadastro do fornecedor${c.bank_name ? ` · ${c.bank_name}` : ''}`,
                c.pix_key_type as string | null, String(c.pix_key),
                (c.beneficiary_name as string) ?? s?.name ?? null, (c.beneficiary_document as string) ?? s?.document ?? null,
                !!c.is_pix_primary,
            )),
        };
    }

    if (favorecido.origem === 'colaborador') {
        const { data: e } = await admin.from('employees').select('name,cpf').eq('id', favorecido.id).maybeSingle();
        const { data: contas } = await admin.from('employee_bank_accounts')
            .select('id,bank_name,pix_key,pix_key_type,holder_name,is_primary')
            .eq('employee_id', favorecido.id).not('pix_key', 'is', null);
        return {
            favorecido, nome: e?.name ?? null, documento: e?.cpf ?? null,
            opcoes: (contas ?? []).map((c: Record<string, unknown>) => opcao(
                `colaborador:${c.id}`, `Cadastro do colaborador${c.bank_name ? ` · ${c.bank_name}` : ''}`,
                c.pix_key_type as string | null, String(c.pix_key),
                (c.holder_name as string) ?? e?.name ?? null, e?.cpf ?? null, !!c.is_primary,
            )),
        };
    }

    if (favorecido.origem === 'socio') {
        const { data: item } = await admin.from('prolabore_payroll_items').select('partner_id').eq('id', favorecido.id).maybeSingle();
        if (!item?.partner_id) {
            return { ...vazio, favorecido: { origem: 'avulso', id: null, motivo: 'Item do pró-labore não encontrado — digite a chave PIX.' } };
        }
        const { data: p } = await admin.from('company_partners')
            .select('id,nome,documento,pix_chave,pix_tipo,bank_account_id').eq('id', item.partner_id).maybeSingle();
        const opcoes: OpcaoChave[] = [];
        if (p?.pix_chave) {
            opcoes.push(opcao(`socio:${p.id}`, 'Cadastro do sócio', p.pix_tipo, p.pix_chave, p.nome, p.documento, true));
        }
        if (p?.bank_account_id) {
            const { data: cba } = await admin.from('company_bank_accounts')
                .select('id,banco_nome,pix_chave,pix_tipo,favorecido').eq('id', p.bank_account_id).maybeSingle();
            if (cba?.pix_chave) {
                opcoes.push(opcao(`socio-conta:${cba.id}`, `Conta do sócio${cba.banco_nome ? ` · ${cba.banco_nome}` : ''}`,
                    cba.pix_tipo, cba.pix_chave, cba.favorecido ?? p?.nome ?? null, p?.documento ?? null, !p?.pix_chave));
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
