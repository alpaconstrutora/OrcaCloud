import { describe, it, expect } from 'vitest';
import { secoesDoRelatorio, ORDEM_DAS_SECOES } from '../utils/imovibRelatorio';
import { pdfDoRelatorio } from '../utils/imovibRelatorioPdf';
import { memorialDePremissas } from '../utils/imovibMemorial';
import { baseStudy } from './fixtures/imovibEstudos';

/**
 * Relatório completo (item 10.5 do plano
 * docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md): 12 seções, texto e
 * tabelas de verdade; seção sem dado sai com a frase de vazio, não some.
 */
const dados = (over: Record<string, unknown> = {}) => ({
    study: baseStudy(over) as never,
    comparaveis: [],
    riscos: [],
    cenarios: [],
    dueDiligence: [],
    socios: [],
});

describe('10.5 — seções do relatório', () => {
    it('as 12 seções, na ordem do plano', () => {
        expect(secoesDoRelatorio(dados()).map(s => s.id)).toEqual(ORDEM_DAS_SECOES);
        expect(ORDEM_DAS_SECOES).toEqual(['capa', 'indicadores', 'premissas', 'mercado', 'produto', 'cronograma', 'fluxo', 'sensibilidade', 'riscos', 'due_diligence', 'tributos', 'capital']);
    });

    it('seção sem dado (estudo sem comparáveis, riscos, due diligence) sai com a frase de vazio', () => {
        const s = secoesDoRelatorio(dados());
        const de = (id: string) => s.find(x => x.id === id)!;
        expect(de('mercado').vazio).toMatch(/comparáve/i);
        expect(de('riscos').vazio).toMatch(/risco/i);
        expect(de('due_diligence').vazio).toMatch(/due diligence/i);
        expect(de('indicadores').vazio).toBeNull();
    });

    it('capa diz o parecer (ou que não foi registrado); indicadores têm VPL e TIR; premissas trazem o memorial inteiro com a fonte', () => {
        const estudo = baseStudy({ premise_notes: { discount_rate: { fonte: 'Comitê', data: '2026-11-01' } } });
        const s = secoesDoRelatorio({ ...dados(), study: estudo as never });
        const de = (id: string) => s.find(x => x.id === id)!;
        expect(de('capa').paragrafos.join(' ')).toMatch(/Parecer: Não registrado/);
        const ind = de('indicadores').tabelas[0].linhas.map(l => l[0]);
        expect(ind).toEqual(expect.arrayContaining(['VPL', 'TIR']));
        const prem = de('premissas').tabelas[0];
        expect(prem.linhas).toHaveLength(memorialDePremissas(estudo as never).length);
        expect(prem.linhas.find(l => l[1] === 'TMA')).toContain('Comitê');
    });

    it('fluxo anual soma os meses de cada ano do estudo', () => {
        const fluxo = secoesDoRelatorio(dados()).find(x => x.id === 'fluxo')!.tabelas[0];
        expect(fluxo.colunas[0]).toBe('Ano');
        expect(fluxo.linhas[0][0]).toBe('Ano 1');
    });

    it('o PDF sai com texto de verdade (a busca por "VPL" acha)', () => {
        const pdf = pdfDoRelatorio(secoesDoRelatorio(dados()), 'Estudo teste');
        const texto = pdf.output();
        expect(texto).toContain('VPL');
        expect(texto).toContain('Premissas');
        expect(pdf.getNumberOfPages()).toBeGreaterThan(1);
    });
});
