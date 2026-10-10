/**
 * Pesquisa avançada da lista de ofícios (item 30 da proposta, 10/10/2026).
 *
 * A busca da tabela já cobre número, assunto, destinatário e modelo, e o
 * filtro Situação cobre o estado. Aqui ficam os recortes que faltavam:
 * período, emitente (empresa ou organização), obra, empreendimento,
 * departamento, autor e assinante. Todos em AND.
 *
 * Puro: a tela resolve os nomes (store, departamentos, empreendimentos) e
 * passa em `NomesDosFiltros`. As opções de cada filtro são só os valores que
 * aparecem nos ofícios carregados — o usuário escolhe, nunca digita (guia §5.5),
 * e não aparece opção que não devolve nada.
 */
import type { DocGenDocumento } from '../../types/docGen';

export interface FiltrosOficio {
    /** Período pela data do ofício (`data_documento`; rascunho sem data usa o dia de criação). */
    de: string;
    ate: string;
    /** `c:<company_id>` (empresa emitente) ou `o:<organization_id>` (a própria organização). */
    emitente: string;
    obra: string;
    empreendimento: string;
    departamento: string;
    /** E-mail de quem criou (`created_by`). */
    autor: string;
    /** `m:<member_id>` ou `n:<nome normalizado>` (signatário sem usuário). */
    assinante: string;
}

export const FILTROS_VAZIOS: FiltrosOficio = {
    de: '', ate: '', emitente: '', obra: '', empreendimento: '', departamento: '', autor: '', assinante: '',
};

export interface NomesDosFiltros {
    organizacao: Record<string, string>;
    empresa: Record<string, string>;
    obra: Record<string, string>;
    empreendimento: Record<string, string>;
    departamento: Record<string, string>;
    /** e-mail (minúsculo) → nome do usuário. */
    usuario: Record<string, string>;
}

export interface OpcaoDeFiltro { value: string; label: string }

export interface OpcoesDosFiltros {
    emitente: OpcaoDeFiltro[];
    obra: OpcaoDeFiltro[];
    empreendimento: OpcaoDeFiltro[];
    departamento: OpcaoDeFiltro[];
    autor: OpcaoDeFiltro[];
    assinante: OpcaoDeFiltro[];
}

/** Data do ofício para o período: a do documento; no rascunho sem data, o dia em que foi criado. */
export function dataDoOficio(d: Pick<DocGenDocumento, 'data_documento' | 'created_at'>): string {
    return d.data_documento || (d.created_at ?? '').slice(0, 10);
}

export const chaveDoEmitente = (d: Pick<DocGenDocumento, 'company_id' | 'organization_id'>): string =>
    d.company_id ? `c:${d.company_id}` : `o:${d.organization_id}`;

const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

const chavesDosAssinantes = (d: Pick<DocGenDocumento, 'signatarios'>): string[] =>
    (d.signatarios ?? []).map(s => (s.memberId ? `m:${s.memberId}` : `n:${normalizar(s.nome ?? '')}`));

export function aplicarFiltros<T extends DocGenDocumento>(documentos: T[], f: FiltrosOficio): T[] {
    if (contarFiltrosAtivos(f) === 0) return documentos;
    // Datas em ISO (AAAA-MM-DD) comparam como texto; "até" inverte com "de" se vierem trocadas.
    const [de, ate] = f.de && f.ate && f.de > f.ate ? [f.ate, f.de] : [f.de, f.ate];
    return documentos.filter(d => {
        if (de || ate) {
            const data = dataDoOficio(d);
            if (!data || (de && data < de) || (ate && data > ate)) return false;
        }
        if (f.emitente && chaveDoEmitente(d) !== f.emitente) return false;
        if (f.obra && d.project_id !== f.obra) return false;
        if (f.empreendimento && d.empreendimento_id !== f.empreendimento) return false;
        if (f.departamento && d.department_id !== f.departamento) return false;
        if (f.autor && (d.created_by ?? '').toLowerCase() !== f.autor) return false;
        if (f.assinante && !chavesDosAssinantes(d).includes(f.assinante)) return false;
        return true;
    });
}

/** Quantos recortes estão ligados — o período conta como um só. */
export function contarFiltrosAtivos(f: FiltrosOficio): number {
    return (f.de || f.ate ? 1 : 0)
        + [f.emitente, f.obra, f.empreendimento, f.departamento, f.autor, f.assinante].filter(Boolean).length;
}

const ordenar = (m: Map<string, string>): OpcaoDeFiltro[] =>
    [...m].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));

/** Opções de cada filtro = valores presentes nos ofícios, com o nome que a tela conhece. */
export function opcoesDosFiltros(documentos: DocGenDocumento[], nomes: NomesDosFiltros): OpcoesDosFiltros {
    const emitente = new Map<string, string>();
    const obra = new Map<string, string>();
    const empreendimento = new Map<string, string>();
    const departamento = new Map<string, string>();
    const autor = new Map<string, string>();
    const assinante = new Map<string, string>();

    for (const d of documentos) {
        // A organização e a empresa costumam ter quase o mesmo nome ("Alpa Construtora…"):
        // a opção da organização diz que é o ofício emitido sem empresa escolhida.
        emitente.set(chaveDoEmitente(d), d.company_id
            ? nomes.empresa[d.company_id] ?? 'Empresa não encontrada'
            : `${nomes.organizacao[d.organization_id] ?? 'Organização não encontrada'} (sem empresa)`);
        if (d.project_id) obra.set(d.project_id, nomes.obra[d.project_id] ?? 'Obra não encontrada');
        if (d.empreendimento_id) empreendimento.set(d.empreendimento_id, nomes.empreendimento[d.empreendimento_id] ?? 'Empreendimento não encontrado');
        if (d.department_id) departamento.set(d.department_id, nomes.departamento[d.department_id] ?? 'Departamento não encontrado');
        if (d.created_by) {
            const email = d.created_by.toLowerCase();
            autor.set(email, nomes.usuario[email] ?? d.created_by);
        }
        for (const s of d.signatarios ?? []) {
            const chave = s.memberId ? `m:${s.memberId}` : `n:${normalizar(s.nome ?? '')}`;
            if (chave !== 'n:' && !assinante.has(chave)) assinante.set(chave, s.nome || 'Sem nome');
        }
    }

    return {
        emitente: ordenar(emitente),
        obra: ordenar(obra),
        empreendimento: ordenar(empreendimento),
        departamento: ordenar(departamento),
        autor: ordenar(autor),
        assinante: ordenar(assinante),
    };
}
