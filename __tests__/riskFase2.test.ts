import { describe, expect, it } from 'vitest';
import { exigeAprovacao, situacaoDaAprovacao, sugerirDoCatalogo, tipologiaDaObra } from '../utils/riskFase2';
import type { RiskCatalogItem } from '../types/risk';

const base = { estrategia: null, gatilho_critico: false, inerente_pontuacao: 6, residual_pontuacao: null, status: 'identificado', approval_status: null } as const;

describe('F2.3 — quando o risco exige aprovação', () => {
    it('aceitar exige; crítico (gatilho ou pontuação) exige; médio sem aceitar não exige', () => {
        expect(exigeAprovacao({ ...base, estrategia: 'aceitar' })).toEqual({ exige: true, motivo: 'Exige aprovação: a estratégia é aceitar o risco.' });
        expect(exigeAprovacao({ ...base, gatilho_critico: true }).motivo).toContain('gatilho crítico');
        expect(exigeAprovacao({ ...base, inerente_pontuacao: 20 }).motivo).toContain('crítico pela pontuação');
        expect(exigeAprovacao(base)).toEqual({ exige: false, motivo: null });
    });
    it('os dois motivos juntos; residual vale sobre a inerente; risco encerrado não exige', () => {
        expect(exigeAprovacao({ ...base, estrategia: 'aceitar', gatilho_critico: true }).motivo).toBe('Exige aprovação: a estratégia é aceitar o risco e o risco tem gatilho crítico.');
        expect(exigeAprovacao({ ...base, inerente_pontuacao: 25, residual_pontuacao: 6 }).exige).toBe(false);
        expect(exigeAprovacao({ ...base, estrategia: 'aceitar', status: 'encerrado' }).exige).toBe(false);
    });
    it('faixas da organização mudam o crítico', () => {
        expect(exigeAprovacao({ ...base, inerente_pontuacao: 16 }, { limite_medio: 4, limite_alto: 9, limite_critico: 16 }).exige).toBe(true);
    });
    it('situação para a tela', () => {
        expect(situacaoDaAprovacao(base)).toBe('nao_exige');
        expect(situacaoDaAprovacao({ ...base, estrategia: 'aceitar' })).toBe('falta_enviar');
        expect(situacaoDaAprovacao({ ...base, estrategia: 'aceitar', approval_status: 'PENDENTE' })).toBe('pendente');
        expect(situacaoDaAprovacao({ ...base, estrategia: 'aceitar', approval_status: 'APROVADO' })).toBe('aprovado');
        expect(situacaoDaAprovacao({ ...base, estrategia: 'aceitar', approval_status: 'REJEITADO' })).toBe('reprovado');
    });
});

describe('F2.4 — tipologia da obra e sugestão do catálogo', () => {
    it('mapeia tipo_obra e modalidade pública', () => {
        expect(tipologiaDaObra('residencial_multifamiliar')).toBe('residencial');
        expect(tipologiaDaObra('casa')).toBe('residencial');
        expect(tipologiaDaObra('loja')).toBe('comercial');
        expect(tipologiaDaObra('galpao')).toBe('galpao_industrial');
        expect(tipologiaDaObra('reforma')).toBe('reforma');
        expect(tipologiaDaObra('outro')).toBeNull();
        expect(tipologiaDaObra('casa', 'publica')).toBe('obra_publica');
    });

    const item = (codigo: string, tipologias: string[], condicoes: string[], gatilho = false): RiskCatalogItem =>
        ({ id: codigo, codigo, tipologias, condicoes_sugestao: condicoes, gatilho_critico: gatilho, ativo: true } as unknown as RiskCatalogItem);
    const catalogo = [
        item('R01.01', ['residencial', 'comercial'], []),
        item('R05.04', ['residencial'], ['subsolo', 'nivel_agua_alto']),
        item('R05.06', ['residencial'], ['subsolo', 'fundacao_profunda'], true),
        item('R05.08', ['residencial'], ['subsolo', 'contencao', 'escavacao_profunda'], true),
        item('R24.01', ['obra_publica'], ['contrato_publico']),
    ];

    it('obra residencial com subsolo e contenção: R05 no topo, pelas condições que batem', () => {
        const s = sugerirDoCatalogo(catalogo, 'residencial', ['subsolo', 'contencao'], new Set());
        expect(s.map(x => x.item.codigo)).toEqual(['R05.08', 'R05.06', 'R05.04', 'R01.01']);
        expect(s[0].condicoesQueBatem).toEqual(['subsolo', 'contencao']);
    });
    it('tipologia filtra e item já usado na obra não volta', () => {
        const s = sugerirDoCatalogo(catalogo, 'residencial', ['subsolo'], new Set(['R05.06']));
        expect(s.map(x => x.item.codigo)).not.toContain('R05.06');
        expect(s.map(x => x.item.codigo)).not.toContain('R24.01');
    });
    it('sem condição: gatilho crítico primeiro, depois o código', () => {
        expect(sugerirDoCatalogo(catalogo, 'residencial', [], new Set()).map(x => x.item.codigo))
            .toEqual(['R05.06', 'R05.08', 'R01.01', 'R05.04']);
    });
});
