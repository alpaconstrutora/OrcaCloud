import { describe, it, expect } from 'vitest';

/**
 * Fase 3 do plano docs/planos/2026-11-15-imovib-investidor-relatorio-e-dashboard.md: o relatório
 * completo ganha a edição do investidor (sem parecer, critérios nem mínimos), a capa visual e os
 * gráficos de cada seção.
 */
import { secoesDoRelatorio, capaDoRelatorio, ORDEM_DAS_SECOES } from '../utils/imovibRelatorio';
import { pdfDoRelatorio } from '../utils/imovibRelatorioPdf';
import { GRAFICOS_DA_SECAO } from '../utils/imovibGraficos';
import { baseStudy } from './fixtures/imovibEstudos';

const dados = (over: Record<string, unknown> = {}) => ({
    study: baseStudy({ recommendation: 'aprovar', recommendation_notes: 'Margem confortável', hurdle_margin_percent: 15, ...over }) as never,
    comparaveis: [],
    riscos: [],
    cenarios: [{ id: 'c1', study_id: 'e', name: 'Pessimista', kind: 'pessimista', choques: { preco: -10 }, sort_order: 0 }] as never,
    dueDiligence: [],
    socios: [],
    hoje: '2026-11-15',
});
const versao = { label: 'Comitê de novembro', created_at: '2026-11-15T13:40:00Z' };
// PNG 1×1 transparente.
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

describe('edição do investidor', () => {
    it('não traz a seção de parecer nem o parecer, os critérios ou a justificativa', () => {
        const s = secoesDoRelatorio(dados(), { edicao: 'investidor', versao });
        expect(s.map(x => x.id)).toEqual(ORDEM_DAS_SECOES.filter(id => id !== 'capa'));
        const tudo = JSON.stringify(s);
        expect(tudo).not.toMatch(/Parecer|Critérios|Margem confortável|Atende/);
    });

    it('a interna segue com a capa e o parecer; com versão, diz a versão e a data dela', () => {
        const s = secoesDoRelatorio(dados(), { versao });
        const capa = s.find(x => x.id === 'capa')!;
        expect(capa.paragrafos.join(' ')).toContain('Versão Comitê de novembro · congelada em 15/11/2026');
        expect(capa.paragrafos.join(' ')).toContain('Parecer: Aprovar');
    });

    it('cada seção com dado lista os seus gráficos; seção vazia não tem gráfico', () => {
        const s = secoesDoRelatorio(dados());
        for (const x of s) expect(x.graficos, x.id).toEqual(x.vazio ? [] : GRAFICOS_DA_SECAO[x.id]);
        expect(s.find(x => x.id === 'sensibilidade')!.graficos).toEqual(['tornado', 'cenarios']);
    });

    it('sem cenário salvo, a sensibilidade diz isso e mantém o tornado', () => {
        const s = secoesDoRelatorio({ ...dados(), cenarios: [] });
        const sens = s.find(x => x.id === 'sensibilidade')!;
        expect(sens.vazio).toBeNull();
        expect(sens.paragrafos).toEqual(['Sem cenários salvos (aba Sensibilidade e Risco).']);
        expect(sens.graficos).toEqual(['tornado']);
    });
});

describe('capa', () => {
    it('título, versão e os quatro números de destaque', () => {
        const c = capaDoRelatorio(dados(), { edicao: 'investidor', versao });
        expect(c.titulo).toBe('Estudo teste');
        expect(c.subtitulo).toBe('Versão Comitê de novembro · congelada em 15/11/2026');
        expect(c.destaques.map(d => d.rotulo)).toEqual(['VGV', 'VPL', 'TIR', 'Margem líquida']);
    });

    it('sem versão: a data do relatório', () => {
        expect(capaDoRelatorio(dados()).subtitulo).toBe('Relatório gerado em 15/11/2026');
    });
});

describe('PDF com capa e gráficos', () => {
    it('a capa ocupa a 1ª página, com a organização; os gráficos entram nas seções', () => {
        const s = secoesDoRelatorio(dados(), { edicao: 'investidor', versao });
        const semNada = pdfDoRelatorio(s, 'Estudo teste');
        const imagens = { curva_s: { dataUrl: PNG, largura: 900, altura: 380 }, tornado: { dataUrl: PNG, largura: 900, altura: 420 } };
        const completo = pdfDoRelatorio(s, 'Estudo teste', {
            capa: { ...capaDoRelatorio(dados(), { edicao: 'investidor', versao }), organizacao: 'Alpa Construtora', logo: PNG },
            imagens,
        });
        expect(completo.getNumberOfPages()).toBeGreaterThan(semNada.getNumberOfPages());
        const texto = completo.output();
        expect(texto).toContain('Alpa Construtora');
        expect(texto).toContain('congelada em 15/11/2026');
        expect((texto.match(/\/Subtype \/Image/g) ?? []).length).toBeGreaterThanOrEqual(2);
    });
});
