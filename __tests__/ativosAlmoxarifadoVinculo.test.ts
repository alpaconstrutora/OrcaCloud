import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ASSET_CATEGORY_LABELS } from '../utils/assetToStockItemRow';

// Vínculo Ativo ↔ Almoxarifado (docs/planos/2026-10-13-ativos-almoxarifado-vinculo.md).
// O banco espelha no item a categoria rotulada e a descrição "Nome — Marca Modelo"
// quando o ativo é editado; o cliente faz o mesmo ao criar o item
// (assetToStockItemRow). Duas cópias da mesma regra: este teste é o que impede a
// do SQL de ficar para trás quando o mapa do TypeScript ganhar uma categoria.
const MIGRATION = path.join(
    process.cwd(),
    'supabase', 'migrations', 'aplicar_20271013160000_ativos_almoxarifado_vinculo.sql',
);
const sql = readFileSync(MIGRATION, 'utf8');

describe('migration do vínculo Ativo ↔ Almoxarifado', () => {
    it('o CASE de fn_rotulo_categoria_ativo tem exatamente os rótulos de ASSET_CATEGORY_LABELS', () => {
        const corpo = /fn_rotulo_categoria_ativo\(p_categoria TEXT\)[\s\S]*?\$\$([\s\S]*?)\$\$/.exec(sql)?.[1] ?? '';
        const pares = Object.fromEntries(
            [...corpo.matchAll(/WHEN '([a-z_]+)'\s+THEN '([^']+)'/g)].map(m => [m[1], m[2]]),
        );
        expect(pares).toEqual(ASSET_CATEGORY_LABELS);
    });

    it('a sincronia é reconciliação, não evento: a função lê o saldo antes de lançar', () => {
        const fn = /FUNCTION public\.fn_reconciliar_estoque_do_ativo[\s\S]*?\r?\nEND;\r?\n\$\$;/.exec(sql)?.[0] ?? '';
        expect(fn).toMatch(/FROM public\.stock_balances/);
        // Saída e entrada são sempre a DIFERENÇA para o desejado (1 UN em casa, 0 fora).
        expect(fn).toMatch(/v_excesso := r\.quantity - CASE WHEN r\.warehouse_id = v_destino THEN 1 ELSE 0 END/);
        expect(fn).toMatch(/1 - v_tem/);
    });

    it('movimento manual de item que é ativo é barrado; só a reconciliação passa', () => {
        expect(sql).toMatch(/CREATE TRIGGER trg_stock_movements_trava_item_de_ativo\s+BEFORE INSERT ON public\.stock_movements/);
        expect(sql).toMatch(/set_config\('opura\.reconciliando_ativo', a\.id::text, true\)/);
        expect(sql).toMatch(/current_setting\('opura\.reconciliando_ativo', true\) = v_ativo\.id::text/);
    });

    it('toda função nova tira EXECUTE de PUBLIC e anon (REGRA #7)', () => {
        const nomes = [...sql.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)\(/g)].map(m => m[1]);
        expect(nomes.length).toBeGreaterThan(0);
        for (const nome of nomes) {
            expect(sql, nome).toMatch(new RegExp(`REVOKE EXECUTE ON FUNCTION public\\.${nome}\\([^)]*\\) FROM PUBLIC, anon;`));
        }
    });
});
