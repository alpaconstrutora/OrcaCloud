import { describe, it, expect } from 'vitest';
import { itensDoLote, tiposDoFiltro, TIPOS_DA_FILA, origemDaFila, origensDoFiltro, ORIGENS_DA_FILA, ORIGEM_FILA } from '../utils/filaAprovacao';

const item = (id: string, approval_status = 'PENDENTE') => ({ id, approval_status });

describe('itensDoLote', () => {
    it('só aprova o que está selecionado, pendente E na tela (o filtro escondeu = fora do lote)', () => {
        const naTela = [item('a'), item('b'), item('c', 'RASCUNHO')];
        const selecionados = new Set(['a', 'c', 'escondido']);
        expect(itensDoLote(naTela, selecionados).map(i => i.id)).toEqual(['a']);
    });

    it('nada selecionado = lote vazio', () => {
        expect(itensDoLote([item('a')], new Set())).toEqual([]);
    });
});

describe('tiposDoFiltro', () => {
    const MAPA = ['transaction', 'contract', 'purchase_order', 'process_step', 'blueprint_snapshot',
        'purchase_request', 'doc_gen_documento', 'project_risk', 'darf'];

    // 16/11/2026: mesma regra do filtro Origem — fila sem DARF não pode esconder o tipo DARF.
    it('fila vazia: todos os tipos que a fila pode trazer, na ordem do mapa', () => {
        expect(tiposDoFiltro([], MAPA, 'all')).toEqual(['transaction', 'blueprint_snapshot', 'purchase_request', 'doc_gen_documento', 'darf']);
    });

    it('tipo que a fila NÃO traz (contrato e compra desde 26/10, risco tem fila própria) fica fora', () => {
        expect(tiposDoFiltro([], MAPA, 'all')).not.toEqual(expect.arrayContaining(['contract']));
        expect(tiposDoFiltro([], MAPA, 'all')).not.toContain('purchase_order');
        expect(tiposDoFiltro([], MAPA, 'all')).not.toContain('project_risk');
    });

    it('…a menos que apareça na fila (esquecer no catálogo não esconde)', () => {
        expect(tiposDoFiltro([{ entity: 'process_step' }], MAPA, 'all')).toContain('process_step');
    });

    it('o tipo escolhido continua na lista mesmo fora do catálogo (para o usuário poder trocar)', () => {
        expect(tiposDoFiltro([], MAPA, 'contract')).toContain('contract');
    });

    it('todo tipo do catálogo tem lugar no mapa de rótulos', () => {
        for (const t of TIPOS_DA_FILA) expect(MAPA).toContain(t);
    });
});

// 16/11/2026 — "no filtro Origem falta Tributos": o filtro só listava as origens com
// item na fila; sem DARF pendente (e com o tributo solto fora da fila desde 09/11),
// "Tributo" sumia — junto com Folha, Obra, NF-e, Planta, Ofício…
describe('origensDoFiltro', () => {
    it('fila vazia: oferece TODAS as origens que a fila pode trazer, Tributo incluído', () => {
        const opcoes = origensDoFiltro([], '');
        for (const o of ['Tributo', 'Folha', 'Boleto', 'Comercial', 'Pedido de compra', 'Contrato recorrente', 'NF-e',
            'Obra', 'Medição', 'Dividendos', 'Financiamento', 'Pró-labore', 'Avulso', 'Manutenção de ativo',
            'Planta', 'Solicitação de compra', 'Ofício']) {
            expect(opcoes).toContain(o);
        }
    });

    it('sem repetição e em ordem alfabética', () => {
        const opcoes = origensDoFiltro([], '');
        expect(new Set(opcoes).size).toBe(opcoes.length);
        expect(opcoes).toEqual([...opcoes].sort((a, b) => a.localeCompare(b, 'pt-BR')));
    });

    it('origem fora do catálogo que aparecer na fila entra pelas linhas (esquecer no catálogo não esconde)', () => {
        expect(origensDoFiltro([{ origem: 'ORIGEM_NOVA' }], '')).toContain('Origem Nova');
    });

    it('o escolhido (persistido) continua na lista mesmo fora do catálogo — o <select> não cai calado', () => {
        expect(origensDoFiltro([], 'DARF')).toContain('DARF');
    });

    it('toda origem do catálogo tem rótulo próprio — nenhuma cai no "Asset Maintenance" do fallback', () => {
        for (const o of ORIGENS_DA_FILA) expect(ORIGEM_FILA[o], o).toBeTruthy();
    });
});

describe('origemDaFila', () => {
    it('DARF e FGTS avulso são a mesma origem: Tributo', () => {
        expect(origemDaFila({ origem: 'DARF' })).toBe('Tributo');
        expect(origemDaFila({ origem: 'TRIBUTO' })).toBe('Tributo');
    });

    it('sem origem = null (a célula mostra "—")', () => {
        expect(origemDaFila({ origem: null })).toBeNull();
    });
});
