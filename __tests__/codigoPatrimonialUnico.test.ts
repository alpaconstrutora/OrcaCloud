import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

// Código patrimonial único e sequencial (docs/planos/2026-10-13-codigo-patrimonial-unico.md).
// O número nasce no BANCO, sob trava. Este teste é a catraca que impede o
// gerador de voltar para o navegador — foi lá que nasceram os três geradores
// diferentes (dois sorteios e um MAIOR+1 sem trava).
const MIGRATION = path.join(process.cwd(), 'supabase', 'migrations', 'aplicar_20271013170000_codigo_patrimonial_unico.sql');
const sql = readFileSync(MIGRATION, 'utf8');

describe('código patrimonial nasce no banco', () => {
    it('o gerador trava por organização + prefixo e faz MAIOR+1', () => {
        expect(sql).toMatch(/pg_advisory_xact_lock\(hashtext\('asset_code:' \|\| p_org::text \|\| ':' \|\| p_prefixo\)\)/);
        expect(sql).toMatch(/coalesce\(max\(substring\(upper\(btrim\(code\)\)/);
    });

    it('a unicidade ignora caixa e espaço', () => {
        expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS uq_opura_assets_codigo_org\s+ON public\.opura_assets \(organization_id, upper\(btrim\(code\)\)\)/);
        expect(sql).toMatch(/DROP CONSTRAINT IF EXISTS uq_asset_code_org/);
    });

    it('a renumeração deixa tabela de reversão e código anterior', () => {
        expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.opura_assets_renumeracao_20271013/);
        expect(sql).toMatch(/codigo_anterior = coalesce\(a\.codigo_anterior, r\.codigo_antigo\)/);
    });

    it('toda função nova tira EXECUTE de PUBLIC e anon (REGRA #7)', () => {
        const nomes = [...sql.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)\(/g)].map(m => m[1]);
        expect(nomes.length).toBeGreaterThan(0);
        for (const nome of nomes) {
            expect(sql, nome).toMatch(new RegExp(`REVOKE EXECUTE ON FUNCTION public\\.${nome}\\([^)]*\\) FROM PUBLIC, anon;`));
        }
    });

    it('nenhum código patrimonial é sorteado ou calculado no navegador', () => {
        const arquivos: string[] = [];
        const varrer = (dir: string) => {
            for (const nome of readdirSync(dir)) {
                const p = path.join(dir, nome);
                if (statSync(p).isDirectory()) varrer(p);
                else if (/\.(ts|tsx)$/.test(nome)) arquivos.push(p);
            }
        };
        for (const d of ['components', 'services', 'utils', 'hooks', 'lib', 'store']) varrer(path.join(process.cwd(), d));
        const gerador = /OPR-(PAT|PRE)-\$\{|OPR-(PAT|PRE)-.*Math\.random/;
        const achados = arquivos.filter(f => gerador.test(readFileSync(f, 'utf8'))).map(f => path.relative(process.cwd(), f));
        expect(achados).toEqual([]);
    });
});
