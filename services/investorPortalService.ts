import { supabase } from '../lib/supabase';
import type { IndicadoresDoPainel } from '../utils/imovibCalculoDaVersao';
import type { ResultadosDaVersao } from '../utils/imovibVersoes';

export type ReportCategory =
    | 'relatorio' | 'contrato' | 'spe' | 'matricula' | 'licenca'
    | 'art' | 'nota' | 'prestacao_contas' | 'balancete' | 'dre' | 'ata' | 'outro';

export const REPORT_CATEGORY_LABELS: Record<ReportCategory, string> = {
    relatorio: 'Relatório',
    contrato: 'Contrato',
    spe: 'SPE',
    matricula: 'Matrícula',
    licenca: 'Licença',
    art: 'ART/RRT',
    nota: 'Nota Fiscal',
    prestacao_contas: 'Prestação de Contas',
    balancete: 'Balancete',
    dre: 'DRE',
    ata: 'Ata',
    outro: 'Outro',
};

export interface InvestorReport {
    id?: string;
    organization_id: string;
    investor_id?: string | null;
    project_id?: string | null;
    name: string;
    type?: string;
    category?: ReportCategory;
    url?: string;
    report_date?: string;
    created_at?: string;
}

export type OpportunityStatus = 'estudo' | 'viabilidade' | 'lancamento' | 'captacao' | 'encerrada';
export type OpportunityType = 'incorporacao' | 'loteamento' | 'obra_privada' | 'obra_publica';

export const OPPORTUNITY_STATUS_LABELS: Record<OpportunityStatus, string> = {
    estudo: 'Estudo',
    viabilidade: 'Viabilidade',
    lancamento: 'Lançamento',
    captacao: 'Captação',
    encerrada: 'Encerrada',
};

export const OPPORTUNITY_TYPE_LABELS: Record<OpportunityType, string> = {
    incorporacao: 'Incorporação',
    loteamento: 'Loteamento',
    obra_privada: 'Obra Privada',
    obra_publica: 'Obra Pública',
};

/** Cor do TEXTO do status (§8 do guia: sem pílula, sem caixa alta) — fundo claro. */
export const OPPORTUNITY_STATUS_TEXT: Record<OpportunityStatus, string> = {
    estudo: 'text-gray-600',
    viabilidade: 'text-amber-700',
    lancamento: 'text-blue-700',
    captacao: 'text-emerald-700',
    encerrada: 'text-red-600',
};

export const OPPORTUNITY_STATUS_COLORS: Record<OpportunityStatus, string> = {
    estudo: 'bg-gray-100 text-gray-600',
    viabilidade: 'bg-amber-100 text-amber-700',
    lancamento: 'bg-blue-100 text-blue-700',
    captacao: 'bg-emerald-100 text-emerald-700',
    encerrada: 'bg-red-100 text-red-600',
};

/**
 * Oportunidade = VITRINE + CAPTAÇÃO (plano docs/planos/2026-11-21-imovib-oportunidades-consolidacao.md, Fase 2).
 * Os números (VGV, TIR, ROI, prazo, custo, lucro, exposição) vêm SÓ da versão congelada do Imovib e o local
 * e a obra, do empreendimento do estudo — nenhum é digitado aqui. Exibir pela vitrine
 * (utils/oportunidadeNumerosDaVersao.ts, `naVitrine`).
 */
export interface InvestorOpportunity {
    id?: string;
    organization_id: string;
    title: string;
    subtitle?: string;
    open_date?: string;
    link?: string;
    status?: OpportunityStatus;
    opportunity_type?: OpportunityType;
    thumbnail_url?: string;
    /** Ticket mínimo: regra comercial da captação, não existe no estudo. */
    ticket_min?: number | null;
    is_published?: boolean;
    imovib_study_id?: string | null;
    /** Versão congelada do estudo que o investidor vê (obrigatória para publicar — Fase 2). */
    imovib_version_id?: string | null;
    distances_json?: any[] | null;
    team_json?: any[] | null;
    created_at?: string;
    // ── Só leitura (nunca vão num insert/update) ──
    /** `snapshot.calculo.investidor.indicadores` da versão escolhida (null sem versão). */
    indicadores_da_versao?: Partial<IndicadoresDoPainel> | null;
    /** `results` da versão escolhida: prazo e custos do momento do congelamento. */
    resultados_da_versao?: Partial<Pick<ResultadosDaVersao, 'duracao' | 'custoObra' | 'terreno'>> | null;
    /** Do empreendimento ligado ao estudo (o mais antigo da mesma organização). */
    local?: LocalDaOportunidade | null;
    /** Imagens do empreendimento (decorado, plantas, vistas) — Fase 3: a galeria própria saiu. */
    fotos?: FotoDaVitrine[] | null;
}

export interface FotoDaVitrine { url: string; legenda: string | null }

export interface LocalDaOportunidade {
    cidade: string | null;
    uf: string | null;
    /** Obra principal do empreendimento (aba "Obra ao vivo"). */
    obra_id: string | null;
    /** Só no app (gestor): de onde o Data Room compartilha documentos. */
    empreendimento_id?: string | null;
}

export type InterestRole = 'investidor' | 'arquiteto' | 'engenheiro' | 'projetista' | 'consultor' | 'outro';
export type InterestStage = 'lead' | 'interesse' | 'reuniao' | 'proposta' | 'negociacao' | 'fechado';

export const INTEREST_ROLE_LABELS: Record<InterestRole, string> = {
    investidor: 'Investidor',
    arquiteto: 'Arquiteto',
    engenheiro: 'Engenheiro',
    projetista: 'Projetista',
    consultor: 'Consultor',
    outro: 'Outro',
};

export const INTEREST_STAGE_LABELS: Record<InterestStage, string> = {
    lead: 'Lead',
    interesse: 'Interesse',
    reuniao: 'Reunião',
    proposta: 'Proposta',
    negociacao: 'Negociação',
    fechado: 'Fechado',
};

export const INTEREST_STAGE_COLORS: Record<InterestStage, { bg: string; text: string; border: string }> = {
    lead:       { bg: 'bg-gray-50',     text: 'text-gray-600',    border: 'border-gray-200' },
    interesse:  { bg: 'bg-blue-50',     text: 'text-blue-700',    border: 'border-blue-200' },
    reuniao:    { bg: 'bg-indigo-50',   text: 'text-indigo-700',  border: 'border-indigo-200' },
    proposta:   { bg: 'bg-amber-50',    text: 'text-amber-700',   border: 'border-amber-200' },
    negociacao: { bg: 'bg-purple-50',   text: 'text-purple-700',  border: 'border-purple-200' },
    fechado:    { bg: 'bg-emerald-50',  text: 'text-emerald-700', border: 'border-emerald-200' },
};

export interface OpportunityInterest {
    id?: string;
    organization_id: string;
    opportunity_id: string;
    contact_name: string;
    contact_email?: string;
    contact_phone?: string;
    role: InterestRole;
    message?: string;
    stage?: InterestStage;
    created_at?: string;
}

const REPORT_COLS = 'id, organization_id, investor_id, project_id, name, type, category, url, report_date, created_at';

const OPP_COLS = [
    'id', 'organization_id', 'title', 'subtitle', 'open_date', 'link',
    'status', 'opportunity_type', 'thumbnail_url', 'ticket_min', 'is_published',
    'imovib_study_id', 'imovib_version_id', 'distances_json', 'team_json',
    'created_at',
    // Só leitura: números da versão escolhida (indicadores congelados + resultados do momento).
    'versao_publicada:imovib_study_versions!imovib_version_id(indicadores:snapshot->calculo->investidor->indicadores, results)',
].join(', ');

type LinhaDaOportunidade = Omit<InvestorOpportunity, 'indicadores_da_versao' | 'resultados_da_versao' | 'local'> & {
    versao_publicada?: { indicadores?: Partial<IndicadoresDoPainel> | null; results?: Partial<ResultadosDaVersao> | null } | null;
};
/** Linha do select → oportunidade, com o embed da versão achatado. */
const daLinha = (row: LinhaDaOportunidade): InvestorOpportunity => {
    const { versao_publicada, ...o } = row;
    const r = versao_publicada?.results;
    return {
        ...o,
        indicadores_da_versao: versao_publicada?.indicadores ?? null,
        resultados_da_versao: r ? { duracao: r.duracao, custoObra: r.custoObra, terreno: r.terreno } : null,
    };
};
/** Campos só de leitura nunca vão num insert/update (não são colunas). */
const semCamposDeLeitura = <T extends Partial<InvestorOpportunity>>(o: T): Omit<T, 'indicadores_da_versao' | 'resultados_da_versao' | 'local' | 'fotos'> => {
    const { indicadores_da_versao: _i, resultados_da_versao: _r, local: _l, fotos: _f, ...resto } = o;
    return resto;
};

/**
 * Local e obra de cada oportunidade, do empreendimento ligado ao estudo (`empreendimentos.imovib_study_id`).
 * Sem UNIQUE na coluna: vale o mais antigo; empreendimento de OUTRA organização não vale (a mesma regra de
 * imovibService.carregarVinculos). A RPC do portal faz a mesma escolha em SQL.
 */
/**
 * Fotos da vitrine = imagens do empreendimento (bucket público empreendimento-midia): decorado, plantas por
 * tipologia e vistas das torres — a mesma ordem de fn_oportunidade_na_vitrine no banco (Fase 3).
 */
async function fotosDosEmpreendimentos(ids: string[]): Promise<Map<string, FotoDaVitrine[]>> {
    const out = new Map<string, FotoDaVitrine[]>();
    if (ids.length === 0) return out;
    const [dec, plantas, vistas] = await Promise.all([
        supabase.from('empreendimento_tipologia_decorado').select('empreendimento_id, imagem_url, legenda, tipologia, ordem').in('empreendimento_id', ids).order('ordem', { ascending: true }),
        supabase.from('empreendimento_tipologia_plantas').select('empreendimento_id, imagem_url, tipologia').in('empreendimento_id', ids),
        supabase.from('empreendimento_tower_vistas').select('imagem_url, legenda, andar_de, torre:empreendimento_towers!inner(empreendimento_id, name)').in('torre.empreendimento_id', ids).order('andar_de', { ascending: true }),
    ]);
    for (const r of [dec, plantas, vistas]) if (r.error) throw r.error;
    const por = (id: string) => { if (!out.has(id)) out.set(id, []); return out.get(id)!; };
    for (const d of (dec.data ?? []) as { empreendimento_id: string; imagem_url: string; legenda: string | null; tipologia: string }[]) por(d.empreendimento_id).push({ url: d.imagem_url, legenda: d.legenda ?? d.tipologia });
    for (const p of (plantas.data ?? []) as { empreendimento_id: string; imagem_url: string; tipologia: string }[]) por(p.empreendimento_id).push({ url: p.imagem_url, legenda: `Planta — ${p.tipologia}` });
    for (const v of (vistas.data ?? []) as unknown as { imagem_url: string; legenda: string | null; torre: { empreendimento_id: string; name: string } }[]) por(v.torre.empreendimento_id).push({ url: v.imagem_url, legenda: v.legenda ?? `Vista — ${v.torre.name}` });
    return out;
}

async function comLocal(ops: InvestorOpportunity[]): Promise<InvestorOpportunity[]> {
    const estudos = [...new Set(ops.map(o => o.imovib_study_id).filter((x): x is string => !!x))];
    if (estudos.length === 0) return ops.map(o => ({ ...o, local: null, fotos: [] }));
    const { data, error } = await supabase
        .from('empreendimentos')
        .select('id, organization_id, imovib_study_id, endereco_city, endereco_state, project_id, created_at')
        .in('imovib_study_id', estudos)
        .order('created_at', { ascending: true });
    if (error) throw error;
    const linhas = (data ?? []) as { id: string; organization_id: string; imovib_study_id: string; endereco_city: string | null; endereco_state: string | null; project_id: string | null }[];
    const escolhido = (o: InvestorOpportunity) => linhas.find(x => x.imovib_study_id === o.imovib_study_id && x.organization_id === o.organization_id);
    const fotos = await fotosDosEmpreendimentos([...new Set(ops.map(escolhido).filter(Boolean).map(e => e!.id))]);
    return ops.map(o => {
        const e = escolhido(o);
        return {
            ...o,
            local: e ? { cidade: e.endereco_city ?? null, uf: e.endereco_state ?? null, obra_id: e.project_id ?? null, empreendimento_id: e.id } : null,
            fotos: e ? fotos.get(e.id) ?? [] : [],
        };
    });
}

const INTEREST_COLS = 'id, organization_id, opportunity_id, contact_name, contact_email, contact_phone, role, message, stage, created_at';


export const investorPortalService = {
    // ─── Reports ─────────────────────────────────────────────────────────────

    /** `organizationId` null = "Todas as organizações" (REGRA #5): sem filtro, a RLS recorta às do usuário. */
    async listReports(organizationId: string | null | undefined, investorId?: string, category?: ReportCategory): Promise<InvestorReport[]> {
        let query = supabase
            .from('investor_reports')
            .select(REPORT_COLS)
            .order('created_at', { ascending: false });
        if (organizationId) query = query.eq('organization_id', organizationId);

        if (investorId) {
            query = query.or(`investor_id.eq.${investorId},investor_id.is.null`);
        }
        if (category) {
            query = query.eq('category', category);
        }

        const { data, error } = await query;
        if (error) throw error;
        return (data ?? []) as InvestorReport[];
    },

    async addReport(report: Omit<InvestorReport, 'id' | 'created_at'>): Promise<InvestorReport> {
        const { data, error } = await supabase
            .from('investor_reports')
            .insert({ ...report, category: report.category ?? 'relatorio' })
            .select(REPORT_COLS)
            .single();
        if (error) throw error;
        return data as InvestorReport;
    },

    async deleteReport(id: string): Promise<void> {
        const { error } = await supabase.from('investor_reports').delete().eq('id', id);
        if (error) throw error;
    },

    // ─── Opportunities ────────────────────────────────────────────────────────

    /** `organizationId` null = "Todas as organizações" (REGRA #5): sem filtro, a RLS recorta às do usuário. */
    async listOpportunities(organizationId: string | null | undefined, onlyPublished = false): Promise<InvestorOpportunity[]> {
        let query = supabase
            .from('investor_opportunities')
            .select(OPP_COLS)
            .order('created_at', { ascending: false });
        if (organizationId) query = query.eq('organization_id', organizationId);

        if (onlyPublished) query = query.eq('is_published', true);

        const { data, error } = await query;
        if (error) throw error;
        return comLocal(((data ?? []) as unknown as LinhaDaOportunidade[]).map(daLinha));
    },

    async addOpportunity(opp: Omit<InvestorOpportunity, 'id' | 'created_at'>): Promise<InvestorOpportunity> {
        const { data, error } = await supabase
            .from('investor_opportunities')
            .insert({ ...semCamposDeLeitura(opp), status: opp.status ?? 'estudo', is_published: opp.is_published ?? false })
            .select(OPP_COLS)
            .single();
        if (error) throw error;
        return (await comLocal([daLinha(data as unknown as LinhaDaOportunidade)]))[0];
    },

    async updateOpportunity(id: string, patch: Partial<Omit<InvestorOpportunity, 'id' | 'organization_id' | 'created_at'>>): Promise<InvestorOpportunity> {
        const { data, error } = await supabase
            .from('investor_opportunities')
            .update(semCamposDeLeitura(patch))
            .eq('id', id)
            .select(OPP_COLS)
            .single();
        if (error) throw error;
        return (await comLocal([daLinha(data as unknown as LinhaDaOportunidade)]))[0];
    },

    /**
     * O que a vitrine LÊ do estudo escolhido no formulário: local e obra do empreendimento e o parecer
     * (parecer "reprovar" trava a publicação — item 5.2 do plano 2026-11-21-imovib-oportunidades-consolidacao).
     */
    async lidoDoEstudo(studyId: string, organizationId: string): Promise<{ local: LocalDaOportunidade | null; parecer: string | null; empreendimento: string | null; fotos: FotoDaVitrine[] }> {
        const [{ data: est, error: e1 }, { data: emps, error: e2 }] = await Promise.all([
            supabase.from('imovib_studies').select('recommendation').eq('id', studyId).maybeSingle(),
            supabase.from('empreendimentos').select('id, name, organization_id, endereco_city, endereco_state, project_id, created_at')
                .eq('imovib_study_id', studyId).eq('organization_id', organizationId).order('created_at', { ascending: true }).limit(1),
        ]);
        if (e1) throw e1;
        if (e2) throw e2;
        const e = (emps ?? [])[0] as { id: string; name: string; endereco_city: string | null; endereco_state: string | null; project_id: string | null } | undefined;
        const fotos = e ? (await fotosDosEmpreendimentos([e.id])).get(e.id) ?? [] : [];
        return {
            fotos,
            parecer: (est as { recommendation?: string | null } | null)?.recommendation ?? null,
            empreendimento: e?.name ?? null,
            local: e ? { cidade: e.endereco_city ?? null, uf: e.endereco_state ?? null, obra_id: e.project_id ?? null, empreendimento_id: e.id } : null,
        };
    },

    /** Oportunidades que escolheram uma versão deste estudo (aba Versões do Imovib — plano 2026-11-15, Fase 2). */
    async oportunidadesComVersaoDoEstudo(studyId: string): Promise<Pick<InvestorOpportunity, 'id' | 'title' | 'is_published' | 'imovib_version_id'>[]> {
        const { data, error } = await supabase
            .from('investor_opportunities')
            .select('id, title, is_published, imovib_version_id')
            .eq('imovib_study_id', studyId)
            .not('imovib_version_id', 'is', null);
        if (error) throw error;
        return (data ?? []) as Pick<InvestorOpportunity, 'id' | 'title' | 'is_published' | 'imovib_version_id'>[];
    },

    async deleteOpportunity(id: string): Promise<void> {
        const { error } = await supabase.from('investor_opportunities').delete().eq('id', id);
        if (error) throw error;
    },

    // ─── Interests ────────────────────────────────────────────────────────────

    async addInterest(interest: Omit<OpportunityInterest, 'id' | 'created_at'>): Promise<OpportunityInterest> {
        const { data, error } = await supabase
            .from('opportunity_interests')
            .insert({ ...interest, stage: interest.stage ?? 'lead' })
            .select(INTEREST_COLS)
            .single();
        if (error) throw error;
        const saved = data as OpportunityInterest;

        /* A notificação por e-mail NÃO é mais disparada daqui. Quem dispara é a
           trigger `trg_notify_opportunity_interest` no INSERT em
           `opportunity_interests` (migration aplicar_20270918000024).

           Motivo: a function exige credencial de serviço — sem isso ela era um
           amplificador de spam (achado C3-06), já que o `verify_jwt` da
           plataforma é satisfeito pela chave anon, que é pública. Do navegador
           não há como mandar essa credencial, e não deveria haver.

           Ganho de lado: o disparo passou a valer para os três caminhos de
           interesse (este, o portal por token e o marketplace público) e para
           qualquer outro que venha a existir — antes cobria só os call sites
           que alguém lembrou de instrumentar. */

        return saved;
    },

    // organizationId null/undefined ⇒ "todas as organizações": sem filtro de org,
    // a RLS do Supabase restringe às orgs que o usuário pode acessar.
    async listInterests(organizationId?: string | null, opportunityId?: string): Promise<OpportunityInterest[]> {
        let query = supabase
            .from('opportunity_interests')
            .select(INTEREST_COLS)
            .order('created_at', { ascending: false });

        if (organizationId) query = query.eq('organization_id', organizationId);
        if (opportunityId) query = query.eq('opportunity_id', opportunityId);

        const { data, error } = await query;
        if (error) throw error;
        return (data ?? []) as OpportunityInterest[];
    },

    async updateInterestStage(id: string, stage: InterestStage): Promise<void> {
        const { error } = await supabase
            .from('opportunity_interests')
            .update({ stage })
            .eq('id', id);
        if (error) throw error;
    },
};
