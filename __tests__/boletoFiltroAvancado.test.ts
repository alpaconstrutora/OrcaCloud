/**
 * Filtro avançado de Boletos a Pagar: um campo para cada coluna da tabela
 * (27/10/2026 — faltavam Centro de Custo e mais cinco).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { applyFilterRules, type FilterRule } from '../components/ui/FilterUtils';
import { buildAdvancedFilterFields, getAdvancedFilterValue, diaDaCaptura, type MapasDoBoleto } from '../utils/boletoFiltroAvancado';
import type { Boleto } from '../types';

const mapas: MapasDoBoleto = {
    supplierMap: { f1: 'VR Benefícios e Serviços' },
    projectMap: { p1: 'Garden Cambuhy', p2: 'Edifício Centro' },
    ccMap: { c1: 'Administrativo > Salários', c2: 'Obra > Material' },
    userNameMap: { 'ana@x.com': 'Ana Souza' },
};

const bol = (x: Partial<Boleto>): Boleto => ({
    id: 'b', organization_id: 'o', documento_path: '', documento_nome: 'BOL-001.pdf', documento_hash: 'h',
    status: 'rascunho' as Boleto['status'], created_at: '2026-10-20T15:00:00.000Z', ...x,
});

const lista = [
    bol({ id: '1', numero: 201, supplier_id: 'f1', project_id: 'p1', cost_center_id: 'c1', created_by_email: 'ana@x.com' }),
    bol({ id: '2', numero: 198, project_id: 'p2', cost_center_id: 'c2', created_by_email: 'zé@x.com', documento_nome: 'energia.pdf' }),
    bol({ id: '3', numero: 163 }),
];

const regra = (fieldKey: string, operator: FilterRule['operator'], value?: unknown): FilterRule =>
    ({ id: 'r', fieldKey, operator, value });
const filtrar = (r: FilterRule) => {
    const campos = buildAdvancedFilterFields(lista, mapas);
    return applyFilterRules(lista, [r], campos, (b, k) => getAdvancedFilterValue(b, k, mapas)).map(b => b.id);
};

describe('filtro avançado de boletos', () => {
    const colunas = ['numero', 'documento', 'beneficiario', 'descricao', 'obra', 'centro_custo', 'valor',
        'vencimento', 'status', 'capturado_em', 'capturado_por', 'origem'];

    it('tem um campo para cada coluna de dados da tabela', () => {
        const chaves = buildAdvancedFilterFields(lista, mapas).map(f => f.key);
        for (const c of colunas) expect(chaves, `coluna ${c}`).toContain(c);
    });

    it('o BoletoManager declara as mesmas colunas (não esquece uma coluna nova)', () => {
        const src = readFileSync(join(__dirname, '../components/BoletoManager.tsx'), 'utf8');
        const bloco = src.slice(src.indexOf('const BOLETO_COLUMNS'), src.indexOf('];', src.indexOf('const BOLETO_COLUMNS')));
        const declaradas = [...bloco.matchAll(/key: '([a-z_]+)'/g)].map(m => m[1]).filter(k => k !== 'actions');
        const chaves = buildAdvancedFilterFields(lista, mapas).map(f => f.key);
        for (const c of declaradas) expect(chaves, `coluna ${c}`).toContain(c);
    });

    it('Centro de Custo, Obra e Capturado por trazem lista com busca do que a tela mostra', () => {
        const campos = Object.fromEntries(buildAdvancedFilterFields(lista, mapas).map(f => [f.key, f]));
        expect(campos.centro_custo.options?.map(o => o.value)).toEqual(['Administrativo > Salários', 'Obra > Material']);
        expect(campos.obra.options?.map(o => o.value)).toEqual(['Edifício Centro', 'Garden Cambuhy']);
        expect(campos.capturado_por.options?.map(o => o.value)).toEqual(['Ana Souza', 'zé@x.com']);
    });

    it('filtra por Centro de Custo, Obra, Capturado por, Documento e Código', () => {
        expect(filtrar(regra('centro_custo', 'is', 'Administrativo > Salários'))).toEqual(['1']);
        expect(filtrar(regra('centro_custo', 'contains', 'material'))).toEqual(['2']);
        expect(filtrar(regra('centro_custo', 'is_not_set'))).toEqual(['3']);
        expect(filtrar(regra('obra', 'is', 'Garden Cambuhy'))).toEqual(['1']);
        expect(filtrar(regra('capturado_por', 'is', 'Ana Souza'))).toEqual(['1']);
        expect(filtrar(regra('documento', 'contains', 'energia'))).toEqual(['2']);
        expect(filtrar(regra('numero', 'gt', 190))).toEqual(['1', '2']);
        expect(filtrar(regra('numero', 'is', 163))).toEqual(['3']);
    });

    it('Capturado em compara o DIA que a célula mostra, inclusive no último dia do "Entre"', () => {
        const dia = diaDaCaptura(lista[0])!;
        expect(dia).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(filtrar(regra('capturado_em', 'is', dia))).toEqual(['1', '2', '3']);
        expect(filtrar(regra('capturado_em', 'between', [dia, dia]))).toEqual(['1', '2', '3']);
        expect(filtrar(regra('capturado_em', 'lt', dia))).toEqual([]);
    });

    it('diaDaCaptura usa o fuso local, não o UTC cru', () => {
        const d = new Date(2026, 9, 20, 23, 30); // 20/10 23:30 local
        expect(diaDaCaptura(bol({ created_at: d.toISOString() }))).toBe('2026-10-20');
        expect(diaDaCaptura(bol({ created_at: '' }))).toBeNull();
    });
});
