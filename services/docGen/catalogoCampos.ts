import { FIELD_GROUPS, ResolveContext, valorPorExtenso } from '../docxFieldCatalog';
import type { Supplier } from '../../types/users';
import type { Company } from '../../types/company';
import type { Empreendimento } from '../../types/empreendimento';
import type { DestinatarioSnapshot, SignatarioDoc } from '../../types/docGen';
import { dataCurta, dataPorExtenso, localEData } from './dataExtenso';

/**
 * Catálogo de variáveis `{{grupo.campo}}` dos documentos gerados.
 *
 * Nasce EM CIMA de `docxFieldCatalog.FIELD_GROUPS` (os 12 grupos do motor .docx),
 * nunca o substitui: as chaves novas são rótulos em português para o que já
 * existe (`empresa.razao_social` → `organization.name`), mais os grupos que o
 * .docx não tinha (destinatário, empreendimento, assinante, usuário, documento).
 * Toda chave legada `source.field` continua aceita por `resolverCampos`.
 *
 * Puro: nada aqui fala com o Supabase. Quem carrega as entidades é
 * `resolverContexto.ts` (F2); aqui só se lê o contexto já montado.
 */

export interface DadosUsuario {
    nome: string;
    email?: string | null;
    cargo?: string | null;
    departamento?: string | null;
    telefone?: string | null;
}

export interface DadosDocumento {
    numero?: string | null;
    assunto?: string | null;
    /** `YYYY-MM-DD` — data do documento (automática ou manual). */
    data?: string | null;
    /** Cidade que abre o "Local e data"; sem ela, usa a da empresa emitente. */
    cidade?: string | null;
    /** Nomes dos anexos, na ordem. */
    anexos?: string[] | null;
}

export interface ContextoDoc extends ResolveContext {
    /** Empresa do grupo emitente (quando a organização tem empresas). Sem ela, a organização. */
    company?: Company | null;
    destinatario?: DestinatarioSnapshot | null;
    supplier?: Supplier | null;
    empreendimento?: Empreendimento | null;
    assinante?: SignatarioDoc | null;
    assinantes?: SignatarioDoc[] | null;
    usuario?: DadosUsuario | null;
    documento?: DadosDocumento | null;
}

export interface CampoDoc {
    chave: string;
    rotulo: string;
    get: (ctx: ContextoDoc) => string;
}

export interface GrupoDoc {
    id: string;
    rotulo: string;
    campos: CampoDoc[];
}

// ─── Helpers ───────────────────────────────────────────────────────────────────
const s = (v: unknown): string => (v == null ? '' : String(v)).trim();

const juntar = (partes: Array<string | null | undefined>, sep: string) => partes.map(s).filter(Boolean).join(sep);

const cidadeUf = (cidade?: string | null, uf?: string | null) => {
    const c = s(cidade), u = s(uf);
    return c && u ? `${c}/${u}` : c || u;
};

function enderecoCompleto(p: {
    logradouro?: string | null; numero?: string | null; complemento?: string | null;
    bairro?: string | null; cidade?: string | null; uf?: string | null; cep?: string | null;
}): string {
    return juntar([
        juntar([p.logradouro, p.numero], ', '),
        s(p.complemento),
        s(p.bairro),
        cidadeUf(p.cidade, p.uf),
        s(p.cep) ? `CEP ${s(p.cep)}` : '',
    ], ' - ');
}

function enderecoCurto(p: { logradouro?: string | null; numero?: string | null; complemento?: string | null }): string {
    return juntar([juntar([p.logradouro, p.numero], ', '), s(p.complemento)], ' - ');
}

/** Endereço normalizado da empresa emitente (empresa do grupo ou organização). */
function enderecoEmitente(c: ContextoDoc) {
    const f = c.company?.endereco_fiscal;
    if (c.company && f) {
        return { logradouro: f.logradouro, numero: f.numero, complemento: f.complemento, bairro: f.bairro, cidade: f.cidade, uf: f.uf, cep: f.cep };
    }
    const a = c.organization?.address;
    return { logradouro: a?.street, numero: a?.number, complemento: undefined, bairro: a?.neighborhood, cidade: a?.city, uf: a?.state, cep: a?.zipCode };
}

const emitenteNome = (c: ContextoDoc) => s(c.company?.razao_social) || s(c.organization?.name);

function campoLegado(source: string, field: string): (c: ContextoDoc) => string {
    const grupo = FIELD_GROUPS.find(g => g.source === source);
    const def = grupo?.fields.find(f => f.field === field);
    return def ? c => def.get(c) : () => '';
}

const fmtMoeda = (n?: number | null) =>
    typeof n === 'number' && !isNaN(n) ? n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '';

const primeiroAssinante = (c: ContextoDoc): SignatarioDoc | null =>
    c.assinante ?? (c.assinantes && c.assinantes.length ? c.assinantes[0] : null);

const dataDoDocumento = (c: ContextoDoc) => c.documento?.data || null;

// ─── Grupos ────────────────────────────────────────────────────────────────────
export const GRUPOS_DOC: GrupoDoc[] = [
    {
        id: 'empresa',
        rotulo: 'Empresa emitente',
        campos: [
            { chave: 'empresa.razao_social', rotulo: 'Razão social', get: emitenteNome },
            { chave: 'empresa.nome_fantasia', rotulo: 'Nome fantasia', get: c => s(c.company?.nome_fantasia) || emitenteNome(c) },
            { chave: 'empresa.cnpj', rotulo: 'CNPJ', get: c => s(c.company?.cnpj) || s(c.organization?.cnpj) },
            { chave: 'empresa.endereco', rotulo: 'Endereço (logradouro e número)', get: c => enderecoCurto(enderecoEmitente(c)) },
            { chave: 'empresa.bairro', rotulo: 'Bairro', get: c => s(enderecoEmitente(c).bairro) },
            { chave: 'empresa.cidade', rotulo: 'Cidade', get: c => s(enderecoEmitente(c).cidade) },
            { chave: 'empresa.uf', rotulo: 'UF', get: c => s(enderecoEmitente(c).uf) },
            { chave: 'empresa.cidade_uf', rotulo: 'Cidade/UF', get: c => { const e = enderecoEmitente(c); return cidadeUf(e.cidade, e.uf); } },
            { chave: 'empresa.cep', rotulo: 'CEP', get: c => s(enderecoEmitente(c).cep) },
            { chave: 'empresa.endereco_completo', rotulo: 'Endereço completo', get: c => enderecoCompleto(enderecoEmitente(c)) },
            { chave: 'empresa.telefone', rotulo: 'Telefone', get: c => s(c.company?.telefone) || s(c.organization?.phone) },
            { chave: 'empresa.email', rotulo: 'E-mail', get: c => s(c.company?.email_comercial) || s(c.organization?.email) },
            { chave: 'empresa.site', rotulo: 'Site', get: c => s(c.organization?.website) },
        ],
    },
    {
        id: 'destinatario',
        rotulo: 'Destinatário',
        campos: [
            { chave: 'destinatario.razao_social', rotulo: 'Razão social / nome', get: c => s(c.destinatario?.razao_social) },
            { chave: 'destinatario.nome_fantasia', rotulo: 'Nome fantasia', get: c => s(c.destinatario?.nome_fantasia) || s(c.destinatario?.razao_social) },
            { chave: 'destinatario.cpf_cnpj', rotulo: 'CPF / CNPJ', get: c => s(c.destinatario?.cpf_cnpj) },
            { chave: 'destinatario.endereco', rotulo: 'Endereço (logradouro e número)', get: c => c.destinatario ? enderecoCurto(c.destinatario) : '' },
            { chave: 'destinatario.bairro', rotulo: 'Bairro', get: c => s(c.destinatario?.bairro) },
            { chave: 'destinatario.cidade', rotulo: 'Cidade', get: c => s(c.destinatario?.cidade) },
            { chave: 'destinatario.uf', rotulo: 'UF', get: c => s(c.destinatario?.uf) },
            { chave: 'destinatario.cidade_uf', rotulo: 'Cidade/UF', get: c => cidadeUf(c.destinatario?.cidade, c.destinatario?.uf) },
            { chave: 'destinatario.cep', rotulo: 'CEP', get: c => s(c.destinatario?.cep) },
            { chave: 'destinatario.endereco_completo', rotulo: 'Endereço completo', get: c => c.destinatario ? enderecoCompleto(c.destinatario) : '' },
            { chave: 'destinatario.contato_nome', rotulo: 'Contato (nome / A/C)', get: c => s(c.destinatario?.contato_nome) },
            { chave: 'destinatario.contato_email', rotulo: 'Contato (e-mail)', get: c => s(c.destinatario?.contato_email) },
            { chave: 'destinatario.contato_telefone', rotulo: 'Contato (telefone)', get: c => s(c.destinatario?.contato_telefone) },
        ],
    },
    {
        id: 'documento',
        rotulo: 'Documento',
        campos: [
            { chave: 'documento.numero', rotulo: 'Número do documento', get: c => s(c.documento?.numero) },
            { chave: 'documento.assunto', rotulo: 'Assunto', get: c => s(c.documento?.assunto) },
            { chave: 'documento.data', rotulo: 'Data (dd/mm/aaaa)', get: c => dataCurta(dataDoDocumento(c)) },
            { chave: 'documento.data_extenso', rotulo: 'Data por extenso', get: c => dataPorExtenso(dataDoDocumento(c)) },
            { chave: 'documento.local_e_data', rotulo: 'Local e data ("Cidade, 7 de outubro de 2026")', get: c => localEData(s(c.documento?.cidade) || s(enderecoEmitente(c).cidade), dataDoDocumento(c)) },
            { chave: 'documento.ano', rotulo: 'Ano do documento', get: c => { const d = dataDoDocumento(c); return d ? d.slice(0, 4) : ''; } },
            { chave: 'documento.anexos', rotulo: 'Lista de anexos (numerada)', get: c => (c.documento?.anexos ?? []).map((a, i) => `${i + 1}. ${a}`).join('\n') },
        ],
    },
    {
        id: 'assinante',
        rotulo: 'Assinante',
        campos: [
            { chave: 'assinante.nome', rotulo: 'Nome', get: c => s(primeiroAssinante(c)?.nome) },
            { chave: 'assinante.cargo', rotulo: 'Cargo', get: c => s(primeiroAssinante(c)?.cargo) },
            { chave: 'assinante.registro_profissional', rotulo: 'Registro profissional (CREA/CAU)', get: c => s(primeiroAssinante(c)?.registroProfissional) },
            { chave: 'assinante.departamento', rotulo: 'Departamento', get: c => s(primeiroAssinante(c)?.departamento) },
            { chave: 'assinante.telefone', rotulo: 'Telefone', get: c => s(primeiroAssinante(c)?.telefone) },
            { chave: 'assinante.email', rotulo: 'E-mail', get: c => s(primeiroAssinante(c)?.email) },
            { chave: 'assinante.empresa', rotulo: 'Empresa', get: emitenteNome },
        ],
    },
    {
        id: 'usuario',
        rotulo: 'Usuário (quem redige)',
        campos: [
            { chave: 'usuario.nome', rotulo: 'Nome', get: c => s(c.usuario?.nome) },
            { chave: 'usuario.email', rotulo: 'E-mail', get: c => s(c.usuario?.email) },
            { chave: 'usuario.cargo', rotulo: 'Cargo', get: c => s(c.usuario?.cargo) },
            { chave: 'usuario.departamento', rotulo: 'Departamento', get: c => s(c.usuario?.departamento) },
            { chave: 'usuario.telefone', rotulo: 'Telefone', get: c => s(c.usuario?.telefone) },
        ],
    },
    {
        id: 'obra',
        rotulo: 'Obra',
        campos: [
            { chave: 'obra.nome', rotulo: 'Nome', get: campoLegado('project', 'name') },
            { chave: 'obra.codigo', rotulo: 'Código', get: campoLegado('project', 'code') },
            { chave: 'obra.endereco', rotulo: 'Endereço (logradouro e número)', get: c => enderecoCurto({ logradouro: c.project?.street, numero: c.project?.number, complemento: c.project?.complement }) },
            { chave: 'obra.cidade', rotulo: 'Cidade', get: campoLegado('project', 'city') },
            { chave: 'obra.cidade_uf', rotulo: 'Cidade/UF', get: c => cidadeUf(c.project?.city, c.project?.state) },
            { chave: 'obra.endereco_completo', rotulo: 'Endereço completo', get: campoLegado('project', 'address_full') },
            { chave: 'obra.cno', rotulo: 'CNO (matrícula)', get: campoLegado('project', 'matriculaCNO') },
            { chave: 'obra.art', rotulo: 'ART/RRT', get: campoLegado('project', 'artRrt') },
            { chave: 'obra.alvara', rotulo: 'Alvará', get: campoLegado('project', 'alvara') },
            { chave: 'obra.responsavel', rotulo: 'Responsável', get: campoLegado('project', 'responsibleTeam') },
            { chave: 'obra.mestre_de_obras', rotulo: 'Mestre de obras', get: campoLegado('project', 'mestreObras') },
            { chave: 'obra.contrato', rotulo: 'Número do contrato', get: campoLegado('contract', 'number') },
        ],
    },
    {
        id: 'empreendimento',
        rotulo: 'Empreendimento',
        campos: [
            { chave: 'empreendimento.nome', rotulo: 'Nome', get: c => s(c.empreendimento?.name) },
            { chave: 'empreendimento.codigo', rotulo: 'Código', get: c => s(c.empreendimento?.code) },
            { chave: 'empreendimento.endereco', rotulo: 'Endereço (logradouro e número)', get: c => enderecoCurto({ logradouro: c.empreendimento?.endereco_street, numero: c.empreendimento?.endereco_number, complemento: c.empreendimento?.endereco_complement }) },
            { chave: 'empreendimento.bairro', rotulo: 'Bairro', get: c => s(c.empreendimento?.endereco_neighborhood) },
            { chave: 'empreendimento.cidade', rotulo: 'Cidade', get: c => s(c.empreendimento?.endereco_city) },
            { chave: 'empreendimento.cidade_uf', rotulo: 'Cidade/UF', get: c => cidadeUf(c.empreendimento?.endereco_city, c.empreendimento?.endereco_state) },
            { chave: 'empreendimento.cep', rotulo: 'CEP', get: c => s(c.empreendimento?.endereco_zip_code) },
            { chave: 'empreendimento.endereco_completo', rotulo: 'Endereço completo', get: c => c.empreendimento ? enderecoCompleto({ logradouro: c.empreendimento.endereco_street, numero: c.empreendimento.endereco_number, complemento: c.empreendimento.endereco_complement, bairro: c.empreendimento.endereco_neighborhood, cidade: c.empreendimento.endereco_city, uf: c.empreendimento.endereco_state, cep: c.empreendimento.endereco_zip_code }) : '' },
            { chave: 'empreendimento.spe', rotulo: 'SPE (razão social)', get: c => s(c.empreendimento?.spe_razao_social) },
            { chave: 'empreendimento.spe_cnpj', rotulo: 'SPE (CNPJ)', get: c => s(c.empreendimento?.spe_cnpj) },
            { chave: 'empreendimento.responsavel_tecnico', rotulo: 'Responsável técnico', get: c => s(c.empreendimento?.responsavel_tecnico) },
            { chave: 'empreendimento.crea_cau', rotulo: 'CREA/CAU', get: c => s(c.empreendimento?.crea_cau) },
            { chave: 'empreendimento.matricula', rotulo: 'Matrícula', get: c => s(c.empreendimento?.matricula) },
            { chave: 'empreendimento.numero_processo', rotulo: 'Nº do processo', get: c => s(c.empreendimento?.numero_processo) },
        ],
    },
    {
        id: 'contrato',
        rotulo: 'Contrato',
        campos: [
            { chave: 'contrato.numero', rotulo: 'Número', get: campoLegado('contract', 'number') },
            { chave: 'contrato.titulo', rotulo: 'Título', get: campoLegado('contract', 'title') },
            { chave: 'contrato.objeto', rotulo: 'Objeto (descrição)', get: campoLegado('contract', 'description') },
            { chave: 'contrato.valor', rotulo: 'Valor atual', get: c => fmtMoeda(c.contract?.current_value ?? c.contract?.original_value) },
            { chave: 'contrato.valor_extenso', rotulo: 'Valor atual por extenso', get: c => { const v = c.contract?.current_value ?? c.contract?.original_value; return typeof v === 'number' ? valorPorExtenso(v) : ''; } },
            { chave: 'contrato.data_inicio', rotulo: 'Data de início', get: campoLegado('contract', 'start_date') },
            { chave: 'contrato.data_fim', rotulo: 'Data de término', get: campoLegado('contract', 'end_date') },
            { chave: 'contrato.prazo_dias', rotulo: 'Prazo (dias)', get: campoLegado('contract', 'prazo_dias') },
            { chave: 'contrato.status', rotulo: 'Situação', get: campoLegado('contract', 'status') },
        ],
    },
    {
        id: 'cliente',
        rotulo: 'Cliente',
        campos: [
            { chave: 'cliente.razao_social', rotulo: 'Razão social / nome', get: campoLegado('client', 'name') },
            { chave: 'cliente.cpf_cnpj', rotulo: 'CPF / CNPJ', get: campoLegado('client', 'document') },
            { chave: 'cliente.endereco', rotulo: 'Endereço completo', get: campoLegado('client', 'address_full') },
            { chave: 'cliente.cidade_uf', rotulo: 'Cidade/UF', get: c => cidadeUf(c.client?.city, c.client?.state) },
            { chave: 'cliente.email', rotulo: 'E-mail', get: campoLegado('client', 'email') },
            { chave: 'cliente.telefone', rotulo: 'Telefone', get: campoLegado('client', 'phone') },
            { chave: 'cliente.responsavel', rotulo: 'Representante legal', get: campoLegado('client', 'legal_rep_name') },
            { chave: 'cliente.qualificacao', rotulo: 'Qualificação completa', get: campoLegado('client', 'qualificacao') },
        ],
    },
    {
        id: 'fornecedor',
        rotulo: 'Fornecedor',
        campos: [
            { chave: 'fornecedor.razao_social', rotulo: 'Razão social / nome', get: c => s(c.supplier?.name) },
            { chave: 'fornecedor.nome_fantasia', rotulo: 'Nome fantasia', get: c => s(c.supplier?.nickname) || s(c.supplier?.name) },
            { chave: 'fornecedor.cnpj', rotulo: 'CPF / CNPJ', get: c => s(c.supplier?.document) },
            { chave: 'fornecedor.endereco', rotulo: 'Endereço completo', get: c => c.supplier ? enderecoCompleto({ logradouro: c.supplier.street || c.supplier.address, numero: c.supplier.number, bairro: c.supplier.neighborhood, cidade: c.supplier.city, uf: c.supplier.state, cep: c.supplier.zip_code }) : '' },
            { chave: 'fornecedor.cidade_uf', rotulo: 'Cidade/UF', get: c => cidadeUf(c.supplier?.city, c.supplier?.state) },
            { chave: 'fornecedor.contato', rotulo: 'Contato (nome)', get: c => s(c.supplier?.contact_name) },
            { chave: 'fornecedor.email', rotulo: 'E-mail', get: c => s(c.supplier?.email) },
            { chave: 'fornecedor.telefone', rotulo: 'Telefone', get: c => s(c.supplier?.phone) },
        ],
    },
];

/** Grupos legados do motor .docx, expostos como "Avançado" (chaves `source.field`). */
export const GRUPOS_LEGADOS: GrupoDoc[] = FIELD_GROUPS.map(g => ({
    id: g.source,
    rotulo: `Avançado › ${g.label}`,
    campos: g.fields.map(f => ({ chave: `${g.source}.${f.field}`, rotulo: f.label, get: (c: ContextoDoc) => f.get(c) })),
}));

export const CAMPOS_POR_CHAVE: Record<string, CampoDoc> = {};
for (const g of [...GRUPOS_DOC, ...GRUPOS_LEGADOS]) for (const f of g.campos) CAMPOS_POR_CHAVE[f.chave] = f;

/** Rótulo "Grupo › Campo" de uma chave; a própria chave quando desconhecida. */
export function rotuloDaChave(chave: string): string {
    const campo = CAMPOS_POR_CHAVE[chave];
    if (!campo) return chave;
    const grupo = [...GRUPOS_DOC, ...GRUPOS_LEGADOS].find(g => g.campos.includes(campo));
    return grupo ? `${grupo.rotulo} › ${campo.rotulo}` : campo.rotulo;
}

/**
 * Resolve cada chave no contexto. Chave desconhecida ou sem dado → ''. Quem
 * chama decide o que é pendência (ver `variaveis.chavesPendentes`).
 */
export function resolverCampos(chaves: Iterable<string>, ctx: ContextoDoc): Record<string, string> {
    const out: Record<string, string> = {};
    for (const chave of chaves) {
        const campo = CAMPOS_POR_CHAVE[chave];
        out[chave] = campo ? campo.get(ctx) : '';
    }
    return out;
}

/** Resolve TODAS as chaves do catálogo (prévia do modelo). */
export function resolverTodos(ctx: ContextoDoc): Record<string, string> {
    return resolverCampos(Object.keys(CAMPOS_POR_CHAVE), ctx);
}

/**
 * Contexto fictício, estável, para a PRÉVIA de um modelo antes de existir um
 * documento. Os valores são obviamente de exemplo (nomes genéricos), para
 * ninguém confundir a prévia com um ofício real.
 */
export function contextoDeExemplo(hoje = '2026-10-07'): ContextoDoc {
    return {
        organization: {
            id: 'exemplo', name: 'Construtora Exemplo Ltda.', cnpj: '12.345.678/0001-90',
            email: 'contato@exemplo.com.br', phone: '(35) 3000-0000', website: 'www.exemplo.com.br',
            address: { street: 'Rua das Acácias', number: '100', neighborhood: 'Centro', city: 'Cambuí', state: 'MG', zipCode: '37600-000' },
        } as unknown as ContextoDoc['organization'],
        destinatario: {
            tipo: 'MANUAL', razao_social: 'Prefeitura Municipal de Cambuí', cpf_cnpj: '18.675.983/0001-61',
            logradouro: 'Praça Coronel Justiniano', numero: '164', bairro: 'Centro', cidade: 'Cambuí', uf: 'MG', cep: '37600-000',
            contato_nome: 'Secretaria Municipal de Obras', contato_email: 'obras@cambui.mg.gov.br', contato_telefone: '(35) 3431-1167',
        },
        assinante: { nome: 'João da Silva', cargo: 'Diretor de Engenharia', registroProfissional: 'CREA-MG 123456/D', departamento: 'Engenharia', email: 'joao@exemplo.com.br', telefone: '(35) 99999-0000' },
        usuario: { nome: 'Maria Souza', email: 'maria@exemplo.com.br', cargo: 'Analista', departamento: 'Engenharia', telefone: '(35) 98888-0000' },
        documento: { numero: 'OF-ENG-047/2026', assunto: 'Solicitação de ligação definitiva de energia – Residencial Central', data: hoje, anexos: ['Memorial Descritivo', 'Planta Arquitetônica', 'ART nº 1234567'] },
        project: {
            name: 'Residencial Central', code: 'RES01', street: 'Av. Brasil', number: '1500', complement: 'Quadra B', neighborhood: 'Jardim Europa',
            city: 'Cambuí', state: 'MG', zipCode: '37600-000', matriculaCNO: '12.345.67890/01', artRrt: 'ART 2026-0001', alvara: 'ALV 45/2026',
            responsibleTeam: 'Eng. Carlos Pereira', mestreObras: 'Sr. Antônio',
        } as unknown as ContextoDoc['project'],
        empreendimento: {
            id: 'exemplo', organization_id: 'exemplo', name: 'Residencial Central', code: 'RES01', status: 'EM_OBRAS',
            endereco_street: 'Av. Brasil', endereco_number: '1500', endereco_neighborhood: 'Jardim Europa', endereco_city: 'Cambuí', endereco_state: 'MG', endereco_zip_code: '37600-000',
            spe_razao_social: 'Central Empreendimentos SPE Ltda.', spe_cnpj: '98.765.432/0001-10',
            responsavel_tecnico: 'Eng. Carlos Pereira', crea_cau: 'CREA-MG 654321/D', matricula: '45.678', numero_processo: 'PROC-2026/0123',
        } as unknown as Empreendimento,
        contract: { number: 'CSE-045', title: 'Execução de infraestrutura', description: 'Execução de infraestrutura do loteamento', current_value: 1250000, start_date: '2026-03-01', end_date: '2027-02-28', status: 'ACTIVE' } as unknown as ContextoDoc['contract'],
        client: {
            id: 'exemplo', name: 'Cliente Exemplo S.A.', document: '11.222.333/0001-44', type: 'PJ', email: 'contato@clienteexemplo.com.br', phone: '(11) 4000-0000',
            address: 'Rua das Flores', address_number: '20', neighborhood: 'Centro', city: 'São Paulo', state: 'SP', zip_code: '01000-000',
            legal_rep_name: 'Ana Pereira', legal_rep_document: '123.456.789-00', legal_rep_role: 'Diretora',
        } as unknown as ContextoDoc['client'],
        supplier: {
            id: 'exemplo', name: 'Fornecedor Exemplo Ltda.', nickname: 'Fornecedor Exemplo', document: '55.666.777/0001-88', type: 'PJ',
            contact_name: 'Pedro Lima', email: 'vendas@fornecedorexemplo.com.br', phone: '(35) 3500-0000',
            street: 'Rodovia BR-381', number: 'km 900', neighborhood: 'Distrito Industrial', city: 'Pouso Alegre', state: 'MG', zip_code: '37550-000',
        } as unknown as Supplier,
    };
}
