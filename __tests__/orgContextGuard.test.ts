import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TRAVA MECÂNICA — o seletor de organização do topo é a autoridade
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Roda no CI (.github/workflows/ci.yml → `npx vitest run`) a cada push e PR
 * para `main`. É de propósito que seja um TESTE e não um shell script: os
 * `scripts/check-*.sh` dependiam de alguém lembrar de executá-los, e por isso
 * o mesmo bug de organização voltava em toda tela nova. Aqui, código novo com
 * qualquer padrão abaixo quebra o build ANTES do merge.
 *
 * Regra de produto protegida (contrato em `hooks/useOrgContext.tsx`):
 *
 *   1. Topo apontando para uma organização  → usa ela, não pergunta nada.
 *   2. Topo em "Todas as organizações"      → aí sim pergunta.
 *   3. Mantendo "Todas"                     → grava global (organization_id NULL).
 *   4. Leitura NUNCA é bloqueada por falta de organização.
 *
 * ── Como esta trava funciona: CATRACA ─────────────────────────────────────
 *
 * O BASELINE abaixo é o inventário fechado da dívida existente em 2026-08-03,
 * levantado por este mesmo scanner. A catraca:
 *
 *   • Arquivo FORA do baseline com violação  → FALHA (é código novo/regressão).
 *   • Arquivo do baseline que PIOROU          → FALHA.
 *   • Arquivo do baseline que MELHOROU        → FALHA pedindo para baixar o
 *     número (o baseline nunca pode ficar folgado).
 *   • Arquivo do baseline zerado              → FALHA pedindo para remover a
 *     entrada.
 *
 * Ou seja: o número só anda para baixo, e chega a zero. Não é permitido
 * adicionar entrada nova ao BASELINE para "fazer passar" — se o seu arquivo
 * não está aqui, ele nasceu depois da regra e precisa usar `useOrgContext()`
 * (leitura) e `useOrgWriteTarget()` (criação).
 *
 * A ALLOWLIST é diferente do BASELINE: são exceções permanentes e legítimas,
 * cada uma com o porquê escrito.
 */

const repoRoot = process.cwd();
const SCAN_DIRS = ['components', 'hooks', 'services'];
const SCAN_EXT = new Set(['.ts', '.tsx']);

interface Rule {
    id: string;
    /** O que o padrão quebra — vira a mensagem de falha. */
    why: string;
    /** Como consertar. */
    fix: string;
    pattern: RegExp;
    /** Exceções permanentes, com justificativa. */
    allow: Record<string, string>;
    /** Dívida conhecida em 2026-08-03: arquivo → nº de ocorrências. Só diminui. */
    baseline: Record<string, number>;
}

const RULES: Rule[] = [
    {
        id: 'organizations[0] como organização',
        why: 'Pega a PRIMEIRA organização da lista em vez da selecionada no topo — lê e grava na organização errada, sem avisar.',
        fix: 'Use `const { orgId } = useOrgContext()`.',
        pattern: /(?:organizations|orgs)\s*\??\.?\[\s*0\s*\]/,
        allow: {
            'hooks/useOrgContext.tsx':
                'É a própria implementação: com UMA só organização, o alvo não é ambíguo.',
            'components/BrokerPortal.tsx':
                'Portal do corretor: o contexto é o do corretor logado (initialOrgId), não o seletor do topo do admin.',
            'components/EmitDocumentModal.tsx':
                'Busca a org por id primeiro; o índice 0 incide sobre uma lista já filtrada por membro.',
        },
        // 2026-08-03: 17 das 18 entradas pagas ao migrar as telas de criação para
        // `useOrgWriteTarget` (o hook resolve o caso de uma só organização
        // internamente) e ao remover `components/ui/useOrganizationPicker.tsx`.
        baseline: {
            // Cliente global (organization_id null) + topo em "Todas": a tela
            // precisa saber se existe uma organização óbvia para o vínculo.
            'components/ClientList.tsx': 1,
        },
    },
    {
        id: 'sentinela string vazia para "Todas as organizações"',
        why: 'Cria uma TERCEIRA sentinela (além de null e undefined). `??` não dispara para string vazia, então o fallback não roda e o botão de criar vira um botão morto.',
        fix: 'Passe `activeOrganizationId` (string | null) sem o `|| \'\'`, ou leia direto de `useOrgContext()`.',
        pattern: /activeOrganizationId\s*\|\|\s*['"]{2}/,
        allow: {},
        // Concentrado em quem distribui a org por prop. A saída é o filho ler de
        // `useOrgContext()` e a prop deixar de existir.
        baseline: {
            'components/AppRouter.tsx': 33,
            'components/LaborModule.tsx': 28,
            'components/OpuraDocsModule.tsx': 1,
            'components/TasksModule.tsx': 10,
        },
    },
    {
        id: 'guard que bloqueia leitura por falta de organização',
        why: 'Com "Todas as organizações" a organização é null e a tela fica em branco silenciosamente. É o bug mais repetido do projeto.',
        fix: 'Remova o guard. Passe a organização ao service, que só aplica `.eq(\'organization_id\',…)` quando ela existe — a RLS recorta o resto.',
        pattern: /if\s*\(\s*!\s*(?:active)?[Oo]rganizationId\s*\)\s*\{?\s*return/,
        allow: {
            'services/crewClassificationService.ts':
                'Classificação de equipe é por-organização; sem org não há regra a aplicar (devolve null, não esconde lista).',
            'services/empreendimentoAuditService.ts':
                'Trilha de auditoria é gravada por organização; sem org não há o que auditar.',
            'services/invoiceService.ts':
                'Predicado de filtro: sem org devolve `true` (não filtra) — exatamente o comportamento de "Todas".',
            'services/taxPayableService.ts':
                'Regime de reconhecimento é por-empresa; em "Todas" assume CAIXA em vez de esconder a lista.',
            'services/receivableService.ts':
                'Só o KPI de inadimplência (RPC consolida por org). A LISTA de recebíveis carrega normalmente com null.',
        },
        baseline: {
            'components/AreaEngineModule.tsx': 1,
            'components/BoletoLoteModal.tsx': 1,
            'components/FinancialClosePanel.tsx': 1,
            'components/OpuraGovernanceModule.tsx': 1,
            'components/ProcurementModule.tsx': 1,
            'components/ServiceContractsModule.tsx': 1,
        },
    },
    {
        id: 'react-query desabilitado por falta de organização',
        why: 'Mesmo efeito do guard: em "Todas as organizações" a query nunca roda e a tela fica vazia.',
        fix: 'Remova o `enabled`. O service deve aceitar organizationId null.',
        pattern: /enabled:\s*!!\s*(?:active)?[Oo]rganizationId\b/,
        allow: {},
        baseline: {
            'components/broker/BrokerHealthPanel.tsx': 1,
            'components/broker/BrokerIntegrations.tsx': 1,
        },
    },
];

function listSourceFiles(dir: string): string[] {
    const out: string[] = [];
    const walk = (current: string) => {
        for (const entry of readdirSync(current)) {
            if (entry === 'node_modules' || entry.startsWith('.')) continue;
            const full = path.join(current, entry);
            if (statSync(full).isDirectory()) walk(full);
            else if (SCAN_EXT.has(path.extname(entry))) out.push(full);
        }
    };
    walk(path.join(repoRoot, dir));
    return out;
}

const SOURCE_FILES = SCAN_DIRS.flatMap(listSourceFiles);
const rel = (f: string) => path.relative(repoRoot, f).split(path.sep).join('/');

/** Ignora comentários — as próprias correções citam os padrões proibidos ao explicá-los. */
function isComment(line: string): boolean {
    const t = line.trim();
    return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*');
}

/** arquivo → nº de ocorrências (só arquivos com ao menos uma). */
function countByFile(rule: Rule): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const file of SOURCE_FILES) {
        const r = rel(file);
        if (rule.allow[r]) continue;
        let n = 0;
        for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
            if (!isComment(line) && rule.pattern.test(line)) n++;
        }
        if (n > 0) counts[r] = n;
    }
    return counts;
}

function header(rule: Rule): string {
    return [
        '',
        `Padrão proibido: ${rule.id}`,
        `Por quê: ${rule.why}`,
        `Correção: ${rule.fix}`,
        'Contrato: hooks/useOrgContext.tsx · CLAUDE.md REGRA #5',
        '',
    ].join('\n');
}

describe('organização: o seletor do topo é a autoridade', () => {
    it('varre os diretórios de código de verdade', () => {
        // Se o scanner parar de achar arquivos (refactor de pastas), as regras
        // passariam vazias e a trava viraria teatro.
        expect(SOURCE_FILES.length).toBeGreaterThan(200);
    });

    for (const rule of RULES) {
        describe(rule.id, () => {
            const current = countByFile(rule);

            it('não aparece em arquivo novo', () => {
                const novos = Object.keys(current)
                    .filter(f => !(f in rule.baseline))
                    .map(f => `  ${f} (${current[f]}x)`);
                expect(
                    novos,
                    `${header(rule)}Violação em arquivo que NÃO está na dívida conhecida — ou seja, código novo:\n${novos.join('\n')}\n\n` +
                        'Não adicione ao BASELINE para fazer passar. Use useOrgContext()/useOrgWriteTarget().\n',
                ).toEqual([]);
            });

            it('não piora onde já existia', () => {
                const piores = Object.entries(current)
                    .filter(([f, n]) => f in rule.baseline && n > rule.baseline[f])
                    .map(([f, n]) => `  ${f}: ${rule.baseline[f]} → ${n}`);
                expect(piores, `${header(rule)}A dívida AUMENTOU:\n${piores.join('\n')}\n`).toEqual([]);
            });

            it('mantém o baseline apertado (sem folga)', () => {
                // Corrigiu? Ótimo — baixe/remova a entrada, senão a trava afrouxa
                // e deixa a regressão voltar sem ninguém ver.
                const folgados = Object.entries(rule.baseline)
                    .filter(([f, n]) => (current[f] ?? 0) < n)
                    .map(([f, n]) => `  ${f}: baseline ${n}, real ${current[f] ?? 0} → ${current[f] ? `baixe para ${current[f]}` : 'remova a entrada'}`);
                expect(folgados, `${header(rule)}Baseline com folga (dívida já paga, registro desatualizado):\n${folgados.join('\n')}\n`).toEqual([]);
            });
        });
    }

    it('não guarda allowlist nem baseline de arquivo inexistente', () => {
        const known = new Set(SOURCE_FILES.map(rel));
        const stale = RULES.flatMap(r =>
            [...Object.keys(r.allow), ...Object.keys(r.baseline)].filter(f => !known.has(f)),
        );
        expect(stale, `Aponta para arquivo que não existe mais: ${stale.join(', ')}`).toEqual([]);
    });
});
