import { supabase } from '../../lib/supabase';
import { clientService } from '../clientService';
import { supplierService } from '../supplierService';
import { investorService } from '../investorService';
import { laborService } from '../laborService';
import { empreendimentoService } from '../empreendimentoService';
import { organizationService } from '../organizationService';
import type { Organization, OrganizationMember } from '../../types/users';
import type { Company } from '../../types/company';
import type { Contract } from '../../types/contracts';
import type { Empreendimento } from '../../types/empreendimento';
import type { ProjectData } from '../projectService';
import type {
    AnexoDoc, DestinatarioSnapshot, DestinatarioTipo, DocGenDocumentoRascunho, DocGenModelo, SignatarioDoc,
} from '../../types/docGen';
import { resolverCampos, type ContextoDoc, type DadosUsuario } from './catalogoCampos';
import type { FinanceiroContrato } from './financeiroContrato';
import { chavesDoModelo } from './motorRender';
import { hojeIso } from './dataExtenso';
import { colunaNoCadastro, snapshotDe, type LinhaCadastro } from './destinatario';
import { logoComoDataUrl } from './previa';

/**
 * Ponte entre o documento gravado e o ERP: quem são os candidatos a
 * destinatário, o contexto completo para resolver as variáveis, e o
 * "Atualizar cadastro do destinatário".
 */

export interface CandidatoDestinatario {
    id: string;
    nome: string;
    documento: string | null;
    detalhe: string | null;
    linha: LinhaCadastro;
}

const cidadeUf = (c?: unknown, u?: unknown) => [c, u].filter(Boolean).join('/') || null;

/**
 * Candidatos de um tipo, da organização do documento. Consultas LEVES de
 * propósito: `brokerService.listProfiles` grava no banco antes de listar e
 * `laborService.listEmployees` traz as alocações — nenhuma das duas cabe num
 * seletor.
 */
export async function listarCandidatos(
    tipo: DestinatarioTipo,
    orgId: string,
    organizations: Organization[],
): Promise<CandidatoDestinatario[]> {
    switch (tipo) {
        case 'FORNECEDOR': {
            const lista = await supplierService.listSuppliers(orgId);
            return lista.map(f => ({
                id: f.id, nome: f.nickname ? `${f.name} (${f.nickname})` : f.name, documento: f.document ?? null,
                detalhe: cidadeUf(f.city, f.state) ?? f.category ?? null, linha: f as unknown as LinhaCadastro,
            }));
        }
        case 'CLIENTE': {
            const lista = await clientService.listClients(orgId);
            return lista.map(c => ({
                id: c.id, nome: c.name, documento: c.document ?? null,
                detalhe: cidadeUf(c.city, c.state), linha: c as unknown as LinhaCadastro,
            }));
        }
        case 'ORGANIZACAO':
            return organizations.map(o => ({
                id: o.id, nome: o.name, documento: o.cnpj ?? null,
                detalhe: cidadeUf(o.address?.city, o.address?.state), linha: o as unknown as LinhaCadastro,
            }));
        case 'COLABORADOR': {
            // A coluna da organização em employees é `org_id`.
            const { data, error } = await supabase.from('employees')
                .select('id, name, cpf, email, phone, status, address_street, address_number, address_complement, address_neighborhood, address_city, address_uf, address_zip_code')
                .eq('org_id', orgId)
                .order('name');
            if (error) throw error;
            return ((data ?? []) as LinhaCadastro[]).map(e => ({
                id: String(e.id), nome: String(e.name ?? ''), documento: (e.cpf as string) ?? null,
                detalhe: cidadeUf(e.address_city, e.address_uf), linha: e,
            }));
        }
        case 'CORRETOR': {
            const { data, error } = await supabase.from('broker_profiles')
                .select('id, name, cpf, creci, agency_name, email, phone, is_active')
                .eq('organization_id', orgId)
                .order('name');
            if (error) throw error;
            return ((data ?? []) as LinhaCadastro[]).map(b => ({
                id: String(b.id), nome: String(b.name ?? ''), documento: (b.cpf as string) ?? null,
                detalhe: b.creci ? `CRECI ${b.creci}` : (b.agency_name as string) ?? null, linha: b,
            }));
        }
        case 'INVESTIDOR': {
            const lista = await investorService.listInvestors(orgId);
            return lista.map(i => ({
                id: i.id, nome: i.name, documento: i.document ?? null, detalhe: i.email ?? null, linha: i as unknown as LinhaCadastro,
            }));
        }
        default:
            return [];
    }
}

/** Relê o cadastro de um destinatário (para "recarregar do cadastro"). */
export async function lerDestinatario(tipo: DestinatarioTipo, id: string, organizations: Organization[]): Promise<DestinatarioSnapshot | null> {
    switch (tipo) {
        case 'FORNECEDOR': { const f = await supplierService.getById(id); return f ? snapshotDe(tipo, f as unknown as LinhaCadastro) : null; }
        case 'CLIENTE': { const c = await clientService.getById(id); return c ? snapshotDe(tipo, c as unknown as LinhaCadastro) : null; }
        case 'ORGANIZACAO': { const o = organizations.find(x => x.id === id); return o ? snapshotDe(tipo, o as unknown as LinhaCadastro) : null; }
        case 'COLABORADOR': { const e = await laborService.getEmployeeById(id).catch(() => null); return e ? snapshotDe(tipo, e as unknown as LinhaCadastro) : null; }
        case 'CORRETOR': {
            const { data } = await supabase.from('broker_profiles').select('id, name, cpf, creci, agency_name, email, phone').eq('id', id).maybeSingle();
            return data ? snapshotDe(tipo, data as LinhaCadastro) : null;
        }
        case 'INVESTIDOR': {
            const { data } = await supabase.from('investors').select('id, name, document, email, phone').eq('id', id).maybeSingle();
            return data ? snapshotDe(tipo, data as LinhaCadastro) : null;
        }
        default: return null;
    }
}

/**
 * "Atualizar cadastro do destinatário": grava UMA coluna no cadastro de origem.
 * Fornecedor por `updateCamposCadastrais` (o `updateSupplier` zera comissão de
 * corretor), cliente por `saveClient` parcial (que confere CPF/CNPJ duplicado),
 * colaborador por `updateEmployee` parcial. Os outros tipos não gravam.
 */
export async function atualizarCadastroDestinatario(tipo: DestinatarioTipo, id: string, chave: string, valor: string): Promise<void> {
    const coluna = colunaNoCadastro(tipo, chave);
    if (!coluna) throw new Error('Este dado não pode ser gravado no cadastro de origem — use "só neste documento".');
    const v = valor.trim() || null;
    if (tipo === 'FORNECEDOR') {
        await supplierService.updateCamposCadastrais(id, { [coluna]: v } as Parameters<typeof supplierService.updateCamposCadastrais>[1]);
    } else if (tipo === 'CLIENTE') {
        await clientService.saveClient({ id, [coluna]: v } as Parameters<typeof clientService.saveClient>[0]);
    } else if (tipo === 'COLABORADOR') {
        await laborService.updateEmployee(id, { [coluna]: v } as Parameters<typeof laborService.updateEmployee>[1]);
    }
}

// ─── Listas auxiliares do formulário ─────────────────────────────────────────

export interface OpcaoSimples { id: string; nome: string; detalhe?: string | null }

export async function listarEmpreendimentos(orgId: string): Promise<OpcaoSimples[]> {
    const { data, error } = await supabase.from('empreendimentos').select('id, name, code, endereco_city').eq('organization_id', orgId).order('name');
    if (error) throw error;
    return ((data ?? []) as { id: string; name: string; code?: string; endereco_city?: string }[])
        .map(e => ({ id: e.id, nome: e.code ? `${e.code} · ${e.name}` : e.name, detalhe: e.endereco_city ?? null }));
}

export async function listarContratos(orgId: string): Promise<OpcaoSimples[]> {
    // Paginado com .range(): o PostgREST corta em 1.000 linhas por resposta, e um
    // teto silencioso esconderia contrato do seletor (guia §6.7).
    const linhas: { id: string; number?: string; title?: string; status?: string }[] = [];
    for (let de = 0; ; de += 1000) {
        const { data, error } = await supabase.from('contracts')
            .select('id, number, title, status')
            .eq('organization_id', orgId)
            .order('created_at', { ascending: false })
            .order('id')
            .range(de, de + 999);
        if (error) throw error;
        linhas.push(...((data ?? []) as typeof linhas));
        if (!data || data.length < 1000) break;
    }
    return linhas.map(c => ({ id: c.id, nome: [c.number, c.title].filter(Boolean).join(' · ') || 'Contrato sem número', detalhe: c.status ?? null }));
}

/** Obras da organização (o store já traz só OBRA, sem projeto de sistema — REGRAS #2/#3). */
export function obrasDaOrganizacao(projects: ProjectData[], orgId: string): ProjectData[] {
    return projects.filter(p => (p.organization_id ?? p.settings?.organizationId) === orgId);
}

/**
 * Colunas de `contracts` que as variáveis leem — sem `signature_token`
 * (`selectEstrelaSensivel.test.ts` trava `select('*')` em tabela sensível).
 * Mesmo conjunto que `contractService.listContracts` já seleciona.
 */
const COLUNAS_CONTRATO = 'id, organization_id, project_id, supplier_id, client_id, number, client_contract_number, title, description, contract_type, nature, direction, domain, start_date, end_date, is_recurring, billing_cycle, due_day, status, original_value, current_value, reajuste_index, reajuste_data_base, reajuste_proximo, retention_rate, responsible_email, empresa_id, empreendimento_id, payment_method, payment_term_type, payment_days, payment_installments, signature_status, created_at';

// ─── Contexto completo do documento ──────────────────────────────────────────

export interface DepsContexto {
    organization: Organization | null;
    companies: Company[];
    projects: ProjectData[];
    /** Nome do departamento por id (para usuário/assinante). */
    nomeDepartamento: (id: string | null | undefined) => string;
    /** E-mail de quem está redigindo. */
    emailUsuario?: string | null;
    /** F4: texto do "em resposta a" (vínculo RESPONDE), já resolvido. */
    emRespostaA?: string | null;
}

/** Membro da organização → signatário (snapshot). */
export function signatarioDeMembro(m: OrganizationMember, nomeDepartamento: (id: string | null | undefined) => string): SignatarioDoc {
    return {
        memberId: m.id,
        nome: m.name,
        cargo: m.cargo ?? null,
        registroProfissional: m.registroProfissional ?? null,
        departamento: m.departmentId ? nomeDepartamento(m.departmentId) || null : null,
        telefone: m.phone ?? null,
        email: m.email ?? null,
    };
}

/**
 * Monta o contexto real do documento: destinatário (snapshot), empresa
 * emitente, obra, empreendimento, contrato, cliente/fornecedor vinculados,
 * assinantes, usuário e os dados do próprio documento.
 */
export async function montarContexto(doc: DocGenDocumentoRascunho, deps: DepsContexto): Promise<ContextoDoc> {
    const company = deps.companies.find(c => c.id === doc.company_id) ?? null;
    const projeto = doc.project_id ? deps.projects.find(p => p.id === doc.project_id) ?? null : null;

    const clientId = doc.client_id ?? (doc.destinatario_tipo === 'CLIENTE' ? doc.destinatario_id : null);
    const supplierId = doc.supplier_id ?? (doc.destinatario_tipo === 'FORNECEDOR' ? doc.destinatario_id : null);

    const [client, supplier, empreendimento, contract, financeiroContrato] = await Promise.all([
        clientId ? clientService.getById(clientId) : Promise.resolve(null),
        supplierId ? supplierService.getById(supplierId) : Promise.resolve(null),
        doc.empreendimento_id ? empreendimentoService.getById(doc.empreendimento_id).catch(() => null) : Promise.resolve(null),
        doc.contract_id
            ? supabase.from('contracts').select(COLUNAS_CONTRATO).eq('id', doc.contract_id).maybeSingle().then(r => (r.data as Contract | null) ?? null)
            : Promise.resolve(null),
        // F6: parcelas e medições — campos calculados e tabelas dinâmicas. Falha → sem os números, não sem o documento.
        doc.contract_id ? carregarFinanceiroContrato(doc.contract_id).catch(() => null) : Promise.resolve(null),
    ]);

    const membro = deps.organization?.members?.find(m => m.email?.toLowerCase() === (deps.emailUsuario ?? '').toLowerCase()) ?? null;
    const usuario: DadosUsuario | null = membro
        ? { nome: membro.name, email: membro.email, cargo: membro.cargo ?? null, departamento: deps.nomeDepartamento(membro.departmentId) || null, telefone: membro.phone ?? null }
        : deps.emailUsuario ? { nome: deps.emailUsuario, email: deps.emailUsuario } : null;

    return {
        organization: deps.organization,
        company,
        destinatario: doc.destinatario_snapshot,
        client,
        supplier,
        project: projeto ? ({ ...projeto.settings, name: projeto.settings?.name ?? projeto.name } as ContextoDoc['project']) : null,
        empreendimento: (empreendimento as Empreendimento | null) ?? null,
        contract,
        assinantes: doc.signatarios,
        usuario,
        financeiroContrato,
        documento: {
            numero: null,
            assunto: doc.assunto,
            data: doc.data_documento ?? hojeIso(),
            cidade: doc.cidade,
            anexos: doc.anexos.map(a => a.nome),
            emRespostaA: deps.emRespostaA ?? null,
            respostaAte: doc.resposta_esperada_ate,
        },
    };
}

// ─── F6: financeiro do contrato (campos calculados e tabelas dinâmicas) ────────
// Lido uma vez por contrato a cada minuto: a tela refaz o contexto a cada pausa de
// digitação, e o financeiro não muda nesse ritmo.
const cacheFinanceiro = new Map<string, { em: number; p: Promise<FinanceiroContrato> }>();
const VALIDADE_MS = 60_000;

async function buscarFinanceiro(contractId: string): Promise<FinanceiroContrato> {
    const [lanc, med] = await Promise.all([
        supabase.from('internal_transactions')
            .select('due_date, transaction_date, description, amount, status')
            .eq('contract_id', contractId)
            .neq('status', 'CANCELLED')
            .order('due_date', { ascending: true, nullsFirst: false })
            .limit(500),
        supabase.from('contract_measurements')
            .select('number, period_start, period_end, measurement_date, status, total_value')
            .eq('contract_id', contractId)
            .order('measurement_date', { ascending: true, nullsFirst: false })
            .limit(200),
    ]);
    if (lanc.error) throw lanc.error;
    if (med.error) throw med.error;
    return {
        parcelas: ((lanc.data ?? []) as Record<string, unknown>[]).map(l => ({
            vencimento: (l.due_date as string | null) ?? (l.transaction_date as string | null) ?? null,
            descricao: String(l.description ?? ''),
            valor: Number(l.amount) || 0,
            quitada: l.status !== 'PENDING',
        })),
        medicoes: ((med.data ?? []) as Record<string, unknown>[]).map(m => ({
            numero: String(m.number ?? ''),
            inicio: (m.period_start as string | null) ?? null,
            fim: (m.period_end as string | null) ?? null,
            data: (m.measurement_date as string | null) ?? null,
            situacao: String(m.status ?? ''),
            valor: Number(m.total_value) || 0,
        })),
    };
}

export function carregarFinanceiroContrato(contractId: string): Promise<FinanceiroContrato> {
    const agora = Date.now();
    const c = cacheFinanceiro.get(contractId);
    if (c && agora - c.em < VALIDADE_MS) return c.p;
    const p = buscarFinanceiro(contractId).catch(e => { cacheFinanceiro.delete(contractId); throw e; });
    cacheFinanceiro.set(contractId, { em: agora, p });
    return p;
}


const CHAVES_DA_TELA = ['empresa.cidade', 'documento.local_e_data'];

/**
 * Valores finais das variáveis do modelo: o resolvido do cadastro, com os
 * overrides "só neste documento" por cima (override vazio não apaga o cadastro).
 */
export function valoresDoDocumento(
    modelo: Pick<DocGenModelo, 'conteudo' | 'layout'>,
    ctx: ContextoDoc,
    overrides: Record<string, string>,
): Record<string, string> {
    // + as chaves que a TELA mostra fora do texto (a dica "Cidade (local e data)"),
    // que o modelo pode não usar.
    const chaves = [...new Set([...chavesDoModelo(modelo.conteudo, modelo.layout), ...CHAVES_DA_TELA])];
    const valores = resolverCampos(chaves, ctx);
    for (const [k, v] of Object.entries(overrides)) if (v && v.trim()) valores[k] = v;
    return valores;
}

/** Imagens de assinatura (bucket privado) → data URL para o PDF; sem imagem segue sem. */
export async function imagensDasAssinaturas(signatarios: SignatarioDoc[], organization: Organization | null): Promise<(string | null)[]> {
    return Promise.all(signatarios.map(async s => {
        const membro = organization?.members?.find(m => m.id === s.memberId);
        if (!membro?.assinaturaPath) return null;
        const url = await organizationService.urlAssinaturaMembro(membro.assinaturaPath);
        return url ? logoComoDataUrl(url) : null;
    }));
}

export type { AnexoDoc };

// ─── Anexos do GED ──────────────────────────────────────────────────────────

export interface DocumentoGedResumo { id: string; nome: string; categoria: string; tipo_documento: string | null; created_at: string }

/**
 * Busca no GED da organização pelo nome, no servidor. É uma BUSCA (os 50
 * primeiros que casam, mais recentes primeiro) — não uma listagem: quem não
 * achou refina o termo. `documentService.listDocuments` filtra no navegador
 * e mistura integrações; aqui só interessa documento real do GED.
 */
export async function buscarDocumentosGed(orgId: string, termo: string): Promise<DocumentoGedResumo[]> {
    let q = supabase.from('opura_documents')
        .select('id, nome, categoria, tipo_documento, created_at')
        .eq('organization_id', orgId)
        .neq('status', 'arquivado')
        .order('created_at', { ascending: false })
        .limit(50);
    const t = termo.trim();
    if (t) q = q.ilike('nome', `%${t.replace(/[%_]/g, '')}%`);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as DocumentoGedResumo[];
}
