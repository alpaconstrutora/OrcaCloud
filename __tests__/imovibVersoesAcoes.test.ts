/**
 * Ações da aba Versões (plano docs/planos/2026-11-19-imovib-versoes-editar-excluir.md, F2.1/F2.2).
 * Versão publicada = só leitura; as demais: editar tudo, renomear e excluir — com uma edição por estudo.
 */
import { describe, it, expect } from 'vitest';
import { acoesDaVersao, partesAusentesDaVersao, type EdicaoDaVersao } from '../utils/imovibVersoes';

const livre = { pode: true };
const edicaoDe = (version_id: string, version_label: string): EdicaoDaVersao => ({
    version_id, version_label, started_by: 'u1', started_by_name: 'Ana', started_at: '2026-11-19T17:00:00Z',
});

describe('acoesDaVersao', () => {
    it('não publicada e sem edição aberta: tudo liberado', () => {
        const a = acoesDaVersao({ versaoId: 'v1', publicadaEm: null, edicaoAberta: null, pode: livre });
        expect(a.editar).toEqual({ pode: true });
        expect(a.excluir).toEqual({ pode: true });
        expect(a.renomear).toEqual({ pode: true });
    });

    it('publicada: as três desligadas, dizendo em qual oportunidade', () => {
        const a = acoesDaVersao({ versaoId: 'v1', publicadaEm: 'Garden Cambuhy', edicaoAberta: null, pode: livre });
        for (const acao of [a.editar, a.excluir, a.renomear]) {
            expect(acao.pode).toBe(false);
            expect(acao.motivo).toBe('Publicada em «Garden Cambuhy» — só leitura.');
        }
    });

    it('edição aberta de OUTRA versão: editar e excluir desligados, renomear livre', () => {
        const a = acoesDaVersao({ versaoId: 'v1', publicadaEm: null, edicaoAberta: edicaoDe('v2', 'Cenário banco'), pode: livre });
        expect(a.editar).toEqual({ pode: false, motivo: 'Termine a edição da versão «Cenário banco» antes de editar outra.' });
        expect(a.excluir).toEqual({ pode: false, motivo: 'Termine a edição da versão «Cenário banco» antes de excluir outra.' });
        expect(a.renomear).toEqual({ pode: true });
    });

    it('a própria versão em edição: editar e excluir desligados', () => {
        const a = acoesDaVersao({ versaoId: 'v1', publicadaEm: null, edicaoAberta: edicaoDe('v1', 'V1'), pode: livre });
        expect(a.editar).toEqual({ pode: false, motivo: 'Esta versão já está em edição no estudo.' });
        expect(a.excluir).toEqual({ pode: false, motivo: 'Salve ou descarte a edição desta versão antes de excluir.' });
    });

    it('sem permissão de edição: o motivo da permissão vale para as três', () => {
        const a = acoesDaVersao({ versaoId: 'v1', publicadaEm: null, edicaoAberta: null, pode: { pode: false, motivo: 'Sem permissão.' } });
        expect([a.editar, a.excluir, a.renomear]).toEqual([
            { pode: false, motivo: 'Sem permissão.' }, { pode: false, motivo: 'Sem permissão.' }, { pode: false, motivo: 'Sem permissão.' },
        ]);
    });
});

describe('partesAusentesDaVersao', () => {
    const base = { cenarios: [], capex_items: [], funding_sources: [] };
    it('versão de antes de 15/11 (sem relatorio): lista comparáveis, riscos, due diligence e sócios', () => {
        expect(partesAusentesDaVersao(base)).toEqual(['comparáveis', 'riscos', 'due diligence', 'sócios']);
    });
    it('versão completa: nada falta', () => {
        expect(partesAusentesDaVersao({ ...base, relatorio: { comparaveis: [], riscos: [], dueDiligence: [], socios: [] } })).toEqual([]);
    });
    it('sem cenários, CAPEX e fontes: também avisa', () => {
        expect(partesAusentesDaVersao({ relatorio: { comparaveis: [], riscos: [], dueDiligence: [], socios: [] } }))
            .toEqual(['cenários', 'CAPEX', 'outras fontes de capital']);
    });
});
