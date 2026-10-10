import { describe, it, expect } from 'vitest';
import {
    aplicarFiltros, contarFiltrosAtivos, dataDoOficio, opcoesDosFiltros, FILTROS_VAZIOS,
    type FiltrosOficio, type NomesDosFiltros,
} from '../services/docGen/filtrosOficios';
import type { DocGenDocumento } from '../types/docGen';

const doc = (id: string, p: Partial<DocGenDocumento>): DocGenDocumento => ({
    id, organization_id: 'org-1', company_id: null, project_id: null, empreendimento_id: null, department_id: null,
    data_documento: null, created_at: '2026-10-01T12:00:00Z', created_by: null, signatarios: [],
    ...p,
} as DocGenDocumento);

const DOCS = [
    doc('a', { data_documento: '2026-09-15', company_id: 'emp-1', project_id: 'obra-1', department_id: 'dep-eng',
        created_by: 'Ana@Alpa.com', signatarios: [{ memberId: 'm-1', nome: 'Carlos Diretor' }] }),
    doc('b', { data_documento: '2026-10-05', project_id: 'obra-2', empreendimento_id: 'emp-x', department_id: 'dep-jur',
        created_by: 'bruno@alpa.com', signatarios: [{ memberId: 'm-1', nome: 'Carlos Diretor' }, { nome: 'Síndico Externo' }] }),
    // rascunho sem data: o período usa o dia de criação
    doc('c', { data_documento: null, created_at: '2026-10-09T23:00:00Z', organization_id: 'org-2', created_by: 'ana@alpa.com' }),
];

const f = (p: Partial<FiltrosOficio>): FiltrosOficio => ({ ...FILTROS_VAZIOS, ...p });
const ids = (l: DocGenDocumento[]) => l.map(d => d.id);

describe('filtros da lista de ofícios (item 30)', () => {
    it('sem filtro devolve a MESMA lista (identidade — a tabela detecta recorte por ela)', () => {
        expect(aplicarFiltros(DOCS, FILTROS_VAZIOS)).toBe(DOCS);
        expect(contarFiltrosAtivos(FILTROS_VAZIOS)).toBe(0);
    });

    it('período pela data do ofício; rascunho sem data usa o dia de criação; datas trocadas se invertem', () => {
        expect(dataDoOficio(DOCS[2])).toBe('2026-10-09');
        expect(ids(aplicarFiltros(DOCS, f({ de: '2026-10-01' })))).toEqual(['b', 'c']);
        expect(ids(aplicarFiltros(DOCS, f({ ate: '2026-09-30' })))).toEqual(['a']);
        expect(ids(aplicarFiltros(DOCS, f({ de: '2026-10-05', ate: '2026-10-05' })))).toEqual(['b']);
        expect(ids(aplicarFiltros(DOCS, f({ de: '2026-10-31', ate: '2026-10-01' })))).toEqual(['b', 'c']);
        expect(contarFiltrosAtivos(f({ de: '2026-10-01', ate: '2026-10-31' }))).toBe(1);
    });

    it('emitente: a empresa quando há, senão a organização', () => {
        expect(ids(aplicarFiltros(DOCS, f({ emitente: 'c:emp-1' })))).toEqual(['a']);
        expect(ids(aplicarFiltros(DOCS, f({ emitente: 'o:org-1' })))).toEqual(['b']);
        expect(ids(aplicarFiltros(DOCS, f({ emitente: 'o:org-2' })))).toEqual(['c']);
    });

    it('obra, empreendimento e departamento pelo id', () => {
        expect(ids(aplicarFiltros(DOCS, f({ obra: 'obra-2' })))).toEqual(['b']);
        expect(ids(aplicarFiltros(DOCS, f({ empreendimento: 'emp-x' })))).toEqual(['b']);
        expect(ids(aplicarFiltros(DOCS, f({ departamento: 'dep-eng' })))).toEqual(['a']);
    });

    it('autor pelo e-mail sem diferença de caixa; assinante por usuário ou pelo nome', () => {
        expect(ids(aplicarFiltros(DOCS, f({ autor: 'ana@alpa.com' })))).toEqual(['a', 'c']);
        expect(ids(aplicarFiltros(DOCS, f({ assinante: 'm:m-1' })))).toEqual(['a', 'b']);
        expect(ids(aplicarFiltros(DOCS, f({ assinante: 'n:sindico externo' })))).toEqual(['b']);
    });

    it('vários filtros somam (AND)', () => {
        const ligados = f({ assinante: 'm:m-1', de: '2026-10-01' });
        expect(ids(aplicarFiltros(DOCS, ligados))).toEqual(['b']);
        expect(contarFiltrosAtivos(ligados)).toBe(2);
    });

    it('opções só com o que existe nos ofícios, com nome resolvido e ordenadas', () => {
        const nomes: NomesDosFiltros = {
            organizacao: { 'org-1': 'Alpa', 'org-2': 'Beta' },
            empresa: { 'emp-1': 'Alpa Engenharia' },
            obra: { 'obra-1': 'Residencial Sol' },
            empreendimento: { 'emp-x': 'Bella Vista' },
            departamento: { 'dep-eng': 'Engenharia', 'dep-jur': 'Jurídico', 'dep-rh': 'RH' },
            usuario: { 'ana@alpa.com': 'Ana Souza' },
        };
        const o = opcoesDosFiltros(DOCS, nomes);
        expect(o.emitente).toEqual([
            { value: 'o:org-1', label: 'Alpa (sem empresa)' }, { value: 'c:emp-1', label: 'Alpa Engenharia' }, { value: 'o:org-2', label: 'Beta (sem empresa)' },
        ]);
        expect(o.obra).toEqual([{ value: 'obra-2', label: 'Obra não encontrada' }, { value: 'obra-1', label: 'Residencial Sol' }]);
        expect(o.departamento.map(x => x.label)).toEqual(['Engenharia', 'Jurídico']); // RH não tem ofício
        expect(o.autor).toEqual([{ value: 'ana@alpa.com', label: 'Ana Souza' }, { value: 'bruno@alpa.com', label: 'bruno@alpa.com' }]);
        expect(o.assinante).toEqual([{ value: 'm:m-1', label: 'Carlos Diretor' }, { value: 'n:sindico externo', label: 'Síndico Externo' }]);
        expect(o.empreendimento).toEqual([{ value: 'emp-x', label: 'Bella Vista' }]);
    });
});
