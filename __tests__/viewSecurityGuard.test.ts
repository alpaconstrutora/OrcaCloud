import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TRAVA MECÂNICA — view nova nasce fechada
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Fase 3 do plano `docs/planos/2026-08-06-views-expostas-anon.md`.
 *
 * É um TESTE e não um `scripts/check-view-security.sh` de propósito. O plano
 * previa shell script + passo no `ci.yml`, mas esse formato já falhou neste
 * repositório: os `check-*.sh` dependiam de alguém lembrar de rodar, e foi
 * exatamente por isso que a trava do seletor de organização virou teste. Aqui,
 * `npx vitest run` já é passo do CI — então a checagem roda sozinha.
 *
 * ── O que esta trava protege ──────────────────────────────────────────────
 *
 * TODO default conspira contra uma view nascer fechada:
 *
 *   • Postgres cria view com `security_invoker = off` → ela roda como o DONO e
 *     **ignora a RLS das tabelas base**. Trancar a tabela NÃO tranca a view.
 *   • Supabase mantém `ALTER DEFAULT PRIVILEGES ... GRANT ... TO anon`, então
 *     a view nasce legível por quem não tem sessão.
 *
 * Em 2026-08-06 isso valia para **24 views** de financeiro, RH, FP&A e BI —
 * `vw_fact_financial_tx` devolvia 1.300 lançamentos à chave publicável. E não
 * era desatenção pontual: `vw_payables` tinha sido corrigida meses antes
 * (`20270840000001`) e a irmã `vw_receivables` seguiu aberta, porque nada
 * obrigava a lembrar.
 *
 * ── Regra ─────────────────────────────────────────────────────────────────
 *
 * Migration que cria view em `public` precisa, NO MESMO ARQUIVO:
 *
 *   1. `WITH (security_invoker = on)` na criação, ou um
 *      `ALTER VIEW ... SET (security_invoker = on)`;
 *   2. `REVOKE ... ON <view> FROM anon` — NOMINAL. `FROM PUBLIC` não basta,
 *      porque o Supabase concede a `anon` diretamente.
 *
 * ── Catraca ───────────────────────────────────────────────────────────────
 *
 * O BASELINE é o inventário fechado da dívida de 2026-08-11. Arquivo fora dele
 * com violação = migration nova = build quebrado. **Não adicione entrada ao
 * BASELINE para fazer passar** — o número só anda para baixo.
 *
 * As views do baseline já estão fechadas NO BANCO (migrations
 * `aplicar_20270903000002` e `...03`, aplicadas à mão em 2026-08-06/07). O que
 * o baseline registra é que o ARQUIVO original não trazia a proteção — é
 * dívida de higiene de migration, não exposição viva. Reescrever esses
 * arquivos antigos não é obrigatório; garantir que os NOVOS nasçam certos, é.
 */

const MIGRATIONS_DIR = path.join(__dirname, '..', 'supabase', 'migrations');

/** Migrations que criam view sem a proteção, herdadas de antes desta regra. */
const BASELINE = new Set<string>([
    'supabase/migrations/20260519000001_fiscal_nfe_rls_indexes.sql',
    'supabase/migrations/20260528000013_sprint14_comunicacao.sql',
    'supabase/migrations/20260528000014_sprint15_bi_rh.sql',
    'supabase/migrations/20260528000015_sprint16_esocial.sql',
    'supabase/migrations/20260601000000_create_incentives_module.sql',
    'supabase/migrations/20260628000004_f4_partida_dobrada.sql',
    'supabase/migrations/20260630000001_create_work_orders_module.sql',
    'supabase/migrations/20260705000001_company_targets_views.sql',
    'supabase/migrations/20260708000002_bi_executive_views.sql',
    'supabase/migrations/20260710000002_vw_fact_layers.sql',
    'supabase/migrations/20261101000002_fix_bi_temporal_and_origin_channel.sql',
    'supabase/migrations/20261118000002_receivables_columns.sql',
    'supabase/migrations/20261219000003_receivable_party_id.sql',
    'supabase/migrations/20261221000001_opura_fase0_ledger_dimensions.sql',
    'supabase/migrations/20261221000009_opura_dim_contraparte.sql',
    'supabase/migrations/20270106000000_fpa_module_fase1.sql',
    'supabase/migrations/20270107000000_fpa_cashflow_projection.sql',
    'supabase/migrations/20270129000000_fiscal_dead_letter_dismiss.sql',
    'supabase/migrations/20270716000004_opura_tts_regime.sql',
    'supabase/migrations/20270819000001_vw_receivables_exclude_contra.sql',
    'supabase/migrations/20270819000002_vw_receivables_vencido_business_status_nulo.sql',
    'supabase/migrations/20270824000010_vw_commercial_tax_payables.sql',
    'supabase/migrations/20270840000000_vw_payables_parcelas_suprimentos.sql',
    'supabase/migrations/20270847000000_vw_receivables_plano_de_contas.sql',
    'supabase/migrations/20270849000001_cleanup_unpublished_commercial_receivables.sql',
]);

/**
 * Views que podem ficar legíveis por `anon` por decisão de produto.
 * Diferente do BASELINE: exceção permanente, não dívida a zerar.
 */
const ALLOWLIST = new Set<string>([
    // Catálogo do PostGIS — pertence à extensão, e REVOKE nelas pode quebrá-la.
    'geography_columns',
    'geometry_columns',
]);

const sqlFiles = (dir: string): string[] => {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
        const full = path.join(dir, entry);
        if (statSync(full).isDirectory()) out.push(...sqlFiles(full));
        else if (entry.endsWith('.sql')) out.push(full);
    }
    return out;
};

/** Remove comentários de linha e de bloco — sem isso, uma view citada num
 *  comentário explicativo seria lida como criação real (o mesmo defeito que
 *  torna o `check-ui-standard.sh` §7 falso-positivo em arquivo grande). */
const stripComments = (sql: string): string =>
    sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');

interface Violation { file: string; view: string; missing: string[] }

const scan = (): Violation[] => {
    const out: Violation[] = [];

    for (const file of sqlFiles(MIGRATIONS_DIR)) {
        const raw = readFileSync(file, 'utf8');
        const sql = stripComments(raw);
        const rel = path.relative(path.join(__dirname, '..'), file).replace(/\\/g, '/');

        const criacoes = [...sql.matchAll(
            /CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+(?:public\.)?"?([a-z0-9_]+)"?/gi,
        )];

        for (const m of criacoes) {
            const view = m[1].toLowerCase();
            if (ALLOWLIST.has(view)) continue;

            const missing: string[] = [];

            // security_invoker: na própria criação ou num ALTER no mesmo arquivo.
            const temInvoker =
                /security_invoker\s*=\s*on/i.test(sql) ||
                new RegExp(`ALTER\\s+VIEW\\s+(?:public\\.)?"?${view}"?[\\s\\S]{0,200}?security_invoker\\s*=\\s*on`, 'i').test(sql);
            if (!temInvoker) missing.push('security_invoker = on');

            // REVOKE nominal de anon nesta view.
            const temRevokeAnon = new RegExp(
                `REVOKE[\\s\\S]{0,80}?ON\\s+(?:TABLE\\s+)?(?:public\\.)?"?${view}"?[\\s\\S]{0,80}?FROM[^;]*\\banon\\b`,
                'i',
            ).test(sql);
            if (!temRevokeAnon) missing.push('REVOKE ... FROM anon');

            if (missing.length > 0) out.push({ file: rel, view, missing });
        }
    }
    return out;
};

describe('Trava — view nova nasce fechada para anon e respeita a RLS', () => {
    it('nenhuma migration FORA do baseline cria view desprotegida', () => {
        const novas = scan().filter(v => !BASELINE.has(v.file));

        if (novas.length > 0) {
            const detalhe = novas
                .map(v => `  ${v.file}\n    view "${v.view}" sem: ${v.missing.join(' e ')}`)
                .join('\n');

            expect.fail(
                `\n${novas.length} view(s) criada(s) sem proteção:\n\n${detalhe}\n\n` +
                'Toda view em `public` precisa, NO MESMO ARQUIVO:\n\n' +
                '  CREATE VIEW public.minha_view WITH (security_invoker = on) AS ...;\n' +
                '  REVOKE ALL ON public.minha_view FROM anon;\n' +
                '  REVOKE ALL ON public.minha_view FROM PUBLIC;\n' +
                '  GRANT SELECT ON public.minha_view TO authenticated;\n\n' +
                'Por quê: sem `security_invoker`, a view roda como o DONO e ignora a RLS\n' +
                'das tabelas base — trancar a tabela NÃO tranca a view. E `REVOKE FROM\n' +
                'PUBLIC` não basta: o Supabase concede a `anon` diretamente.\n\n' +
                'Em 2026-08-06 isso deixou 24 views abertas, incluindo 1.300 lançamentos\n' +
                'financeiros legíveis sem sessão. Ver docs/planos/2026-08-06-views-expostas-anon.md\n\n' +
                'NÃO adicione ao BASELINE para fazer passar.\n',
            );
        }
    });

    it('o baseline não fica folgado — entrada que já foi corrigida deve sair', () => {
        const violando = new Set(scan().map(v => v.file));
        const obsoletas = [...BASELINE].filter(f => !violando.has(f));

        expect(
            obsoletas,
            `\nEstas entradas do BASELINE não violam mais — remova-as:\n  ${obsoletas.join('\n  ')}\n`,
        ).toEqual([]);
    });
});
