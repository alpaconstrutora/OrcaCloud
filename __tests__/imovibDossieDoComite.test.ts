/** Dossiê do comitê pelo estudo (item 1.5 do plano docs/planos/2026-11-21-imovib-oportunidades-consolidacao.md). */
import { describe, it, expect } from 'vitest';
import { secoesDoDossie, type DadosDoDossie } from '../utils/imovibDossieDoComite';

const base: DadosDoDossie = {
    study: { name: 'Garden', recommendation: 'aprovar_com_condicoes', recommendation_notes: 'Baixar a hipoteca', recommended_by: 'Ana', recommended_at: '2026-11-20T12:00:00Z' },
    versao: {
        label: 'Comitê de novembro', created_at: '2026-11-20T12:00:00Z',
        results: { vgv: 10_000_000, vgvLiquido: 9_000_000, custoObra: 5_000_000, terreno: 1_000_000, vpl: 800_000, tirAnual: 24.5, vplProjeto: 0, tirProjetoAnual: null, exposicaoMaxima: 3_000_000, duracao: 36, lucroLiquido: 2_000_000, margemLiquidaPct: 20, paybackMes: 30, multiplo: 1.6 },
    },
    dueDiligence: [
        { label: 'Ônus e gravames', status: 'problema', criticidade: 'critica', notes: 'IA (90%): Hipoteca\nmais' },
        { label: 'Topografia', status: 'pendente', criticidade: 'media', notes: null },
        { label: 'Matrícula', status: 'ok', criticidade: 'alta', notes: null },
    ],
    riscos: [
        { category: 'juridico', description: 'Ação contra o vendedor', probability: 4, impact: 5, status: 'aberto', mitigation: 'Certidões' },
        { category: 'mercado', description: 'Concorrente lançando', probability: 2, impact: 2, status: 'aberto', mitigation: null },
    ],
    modelos: [{ name: 'Permuta 10%', deal_type: 'permuta_fisica', r: { vpl: 900_000, tirAnual: 30, lucro: 1_800_000, exposicaoMaxima: 2_000_000, caixaDoTerreno: 0, parteDoProprietario: 0 } }],
    decisoes: [{ id: 'd', study_id: 'e', version_id: 'v', gate: 1, decision: 'aprovado', decided_by_nome: 'Bruno', decided_at: '2026-11-20T12:00:00Z' }],
    gateAtual: 2,
    hoje: new Date('2026-11-21T12:00:00Z'),
};

describe('secoesDoDossie', () => {
    it('lê a versão avaliada, o parecer e só o que trava', () => {
        const s = secoesDoDossie(base);
        const por = (t: string) => s.find(x => x.titulo === t)!.linhas.join('\n');
        expect(s[0].linhas[0]).toMatch(/Gate 2 — Viabilidade preliminar/);
        expect(por('Versão avaliada')).toMatch(/Comitê de novembro/);
        expect(por('Versão avaliada')).toMatch(/24,5% a\.a\./);
        expect(por('Parecer do analista')).toMatch(/Aprovar com condições — Ana/);
        expect(por('Due diligence — o que trava')).toMatch(/3 itens · 1 de criticidade/);
        expect(por('Due diligence — o que trava')).toMatch(/Ônus e gravames — crítica, com problema: IA \(90%\): Hipoteca$/m);
        expect(por('Riscos — o que trava')).toMatch(/2 riscos · 1 alto\/crítico/);
        expect(por('Riscos — o que trava')).toMatch(/\[Jurídico\] Ação contra o vendedor — severidade 20/);
        expect(por('Modelos de aquisição do terreno')).toMatch(/Permuta 10% \(Permuta física\)/);
        expect(por('Decisões do comitê')).toMatch(/Gate 1 — Triagem: Aprovado — Bruno/);
    });

    it('sem versão e sem parecer, diz o que falta', () => {
        const s = secoesDoDossie({ ...base, versao: null, study: { name: 'X' }, modelos: [], decisoes: [] });
        const por = (t: string) => s.find(x => x.titulo === t)!.linhas.join('\n');
        expect(por('Versão avaliada')).toMatch(/congele uma na aba Versões/);
        expect(por('Parecer do analista')).toMatch(/Sem parecer/);
        expect(por('Decisões do comitê')).toMatch(/Nenhuma decisão/);
    });
});
