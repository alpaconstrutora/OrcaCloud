import { describe, expect, it, vi } from 'vitest';

vi.mock('../lib/supabase', () => ({ supabase: {} }));

import { diffParaAuditoria, fichaDoCatalogo } from '../services/riskService';
import type { RiskCatalogItem } from '../types/risk';

const item: RiskCatalogItem = {
    id: 'cat-1', organization_id: null, category_id: 'r05', codigo: 'R05.06', evento: 'Recalques diferenciais',
    causas: ['Aterro mal compactado', 'Fundações mistas'], consequencias: ['Fissuras', 'Reforço estrutural'],
    controles_preventivos: ['Monitorar recalques', 'Controle de compactação'], controles_resposta: ['Acionar projetista'],
    sinais_alerta: ['Leitura acima do limite'], dimensoes: ['seguranca', 'financeira'], fases: ['fundacoes', 'estrutura'],
    tipologias: ['residencial'], condicoes_sugestao: [], integracoes: [], referencias: [],
    gatilho_critico: true, gatilho_motivo: 'Estabilidade', revisao_tecnica: 'rascunho', versao: 3, ativo: true, updated_at: '',
};

describe('riskService — funções puras', () => {
    it('diffParaAuditoria: um evento por campo que mudou; ignora iguais e espelhos do banco', () => {
        const antes = { titulo: 'A', causa: 'x', tags: ['a'], inerente_pontuacao: 4, updated_at: '1' };
        const eventos = diffParaAuditoria(antes, { titulo: 'B', causa: 'x', tags: ['a', 'b'], inerente_pontuacao: 9, updated_at: '2' });
        expect(eventos).toEqual([
            { field_name: 'titulo', old_value: 'A', new_value: 'B' },
            { field_name: 'tags', old_value: ['a'], new_value: ['a', 'b'] },
        ]);
    });

    it('diffParaAuditoria: null e ausente são a mesma coisa', () => {
        expect(diffParaAuditoria({ frente: null } as Record<string, unknown>, { frente: undefined })).toEqual([]);
    });

    it('CA02: ficha do catálogo COPIA os textos, guarda código e versão, herda o gatilho', () => {
        const f = fichaDoCatalogo(item, { escopo: 'obra', project_id: 'obra-1', owner_user_id: 'u1', owner_nome: 'Ana', proxima_revisao: '2026-12-01' });
        expect(f).toMatchObject({
            catalog_id: 'cat-1', catalog_codigo: 'R05.06', catalog_versao: 3, evento: 'Recalques diferenciais',
            causa: 'Aterro mal compactado; Fundações mistas', consequencia: 'Fissuras; Reforço estrutural',
            gatilho_critico: true, gatilho_motivo: 'Estabilidade', escopo: 'obra', project_id: 'obra-1', fase: 'fundacoes',
            status: 'identificado',
        });
        // Cópia, não referência: mexer na ficha não mexe no item do catálogo.
        f.dimensoes.push('prazo');
        expect(item.dimensoes).toEqual(['seguranca', 'financeira']);
    });
});
