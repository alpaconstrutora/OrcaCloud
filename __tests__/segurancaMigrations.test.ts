import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TRAVA MECÂNICA — os três padrões que produziram os achados críticos
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Roda no CI a cada push e PR. É um TESTE e não um `scripts/check-*.sh` pela
 * mesma razão do `orgContextGuard.test.ts`: script depende de alguém lembrar
 * de rodar, e foi exatamente assim que estes três padrões entraram em produção
 * e ficaram lá.
 *
 * ── O que esta trava protege ──────────────────────────────────────────────
 *
 * Auditoria de 2026-09-01 (`docs/security-audit/`). Os quatro achados críticos
 * vieram de três padrões, todos detectáveis por leitura do SQL:
 *
 *   P1. Policy que libera linha sem checar nada
 *       `WITH CHECK (true)` em organization_members deixava QUALQUER usuário
 *       autenticado se declarar `owner` de qualquer organização (C1-01).
 *       Comprovado em produção: is_org_manager FALSE→TRUE, 0→2214 lançamentos
 *       financeiros visíveis, com um único INSERT.
 *
 *   P2. Policy para o papel `anon` com expressão `true`
 *       `invoices` devolvia 829 notas fiscais a uma requisição HTTP sem login
 *       (C1-02). A chave anon vai no bundle do frontend — policy anon com
 *       `true` é acesso público, não "acesso do portal".
 *
 *   P3. SECURITY DEFINER sem REVOKE de PUBLIC
 *       O PostgreSQL concede EXECUTE a PUBLIC por padrão. As migrations faziam
 *       `GRANT ... TO authenticated` e paravam aí, então 8 RPCs que EMITEM
 *       credencial de portal ficaram executáveis por `anon` (C3-01), e toda a
 *       família de leitura do Portal do Colaborador entregava folha de
 *       pagamento só com o UUID (C3-02).
 *
 * ── Como funciona: CORTE DE HISTÓRICO ─────────────────────────────────────
 *
 * A trava vale para migrations com prefixo >= CORTE. Antes disso é histórico já
 * aplicado, que não se reescreve (ver a constante CORTE abaixo). Migration nova
 * com qualquer um dos três padrões quebra o build ANTES do merge.
 *
 * NÃO mova o CORTE para frente para "fazer passar".
 *
 * ── Por que a análise é do TEXTO das migrations, e não do banco ───────────
 *
 * O CI não tem credencial do banco, e não deveria ter. A verificação da postura
 * REAL (que é o que vale, porque o histórico de migrations tem drift) é o
 * `scripts/check-rls-postura.sh`, rodado sob demanda contra o banco remoto.
 * Esta trava aqui pega o padrão ANTES do merge; o script confere o resultado
 * DEPOIS da aplicação. As duas coisas são complementares.
 */

const PASTA = path.join(process.cwd(), 'supabase', 'migrations');

/**
 * CORTE DE HISTÓRICO — a trava vale para migrations criadas a partir daqui.
 *
 * Tudo antes de 20270918 é histórico JÁ APLICADO, e boa parte fora de
 * `schema_migrations` (as `2027*` foram rodadas por SQL direto). Reescrever
 * migration antiga é pior do que a dívida: muda o texto de algo que já rodou e
 * cria dúvida sobre o que o banco realmente tem. É o mesmo raciocínio dos
 * `ANISTIADOS` de `migrationsPrefixo.test.ts`.
 *
 * A dívida histórica não fica sem resposta: quem confere a postura REAL do
 * banco — que é o que vale — é `scripts/check-rls-postura.sh`, contra o banco
 * remoto. Esta trava impede que a dívida CRESÇA.
 *
 * O corte NÃO se move para frente. Se o seu arquivo é posterior a ele, ele
 * precisa passar.
 */
const CORTE = '20270918000000';

function prefixoDe(arquivo: string): string | null {
  const m = /^(?:aplicar_)?(\d{14})_/.exec(arquivo);
  return m ? m[1] : null;
}

/**
 * Migrations de correção: contêm os padrões apenas dentro de comentários que
 * explicam o que foi corrigido, ou em `DROP POLICY`. Não são violações.
 */
const ALLOWLIST = new Set<string>([
  'aplicar_20270918000001_rls_organization_members_insert.sql',
  'aplicar_20270918000002_rls_invoices_escopo_org.sql',
  'aplicar_20270918000004_revoke_public_rpcs_portal.sql',
  'aplicar_20270918000005_portal_colaborador_por_token.sql',
  'aplicar_20270918000006_rls_anon_remanescentes.sql',
  'aplicar_20270918000009_cron_task_alert_sem_placeholder.sql',
  '20270208000002_drop_anon_dev_policies_rollout.sql',
]);

/** Remove comentários para não acusar padrão citado em explicação. */
function semComentarios(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*--.*$/gm, ' ');
}

/** P1 + P2: CREATE POLICY cuja expressão libera sem condição. */
function policiesPermissivas(sql: string): number {
  const corpo = semComentarios(sql);
  const blocos = corpo.match(/CREATE\s+POLICY[\s\S]*?;/gi) ?? [];
  return blocos.filter((b) => {
    const temExpressaoTrue = /\b(USING|WITH\s+CHECK)\s*\(\s*true\s*\)/i.test(b);
    if (!temExpressaoTrue) return false;
    // service_role legitimamente tem acesso total — é o papel que ignora RLS.
    if (/\bTO\s+service_role\b/i.test(b) && !/\bTO\s+[^;]*\banon\b/i.test(b)) return false;
    return true;
  }).length;
}

/**
 * Cada CREATE FUNCTION do arquivo, com os ATRIBUTOS (o cabeçalho antes do corpo e o
 * que vem depois dele até o `;`) — o corpo fica de fora, para texto citado lá dentro
 * não contar. O corpo pode vir entre qualquer `$tag$` ou entre aspas simples
 * (`AS '...'`), e `SECURITY DEFINER` pode estar antes ou depois dele. Antes a trava
 * só olhava o cabeçalho e só reconhecia `$$`/`$function$`: com `$fn$`, com
 * `AS '...'` ou com `$$ LANGUAGE plpgsql SECURITY DEFINER;`, a função passava.
 */
function definicoesDeFuncao(corpo: string): { nome: string; atributos: string }[] {
  const definicoes: { nome: string; atributos: string }[] = [];
  const inicioRe = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?["]?(\w+)["]?\s*\(/gi;
  let m: RegExpExecArray | null;
  while ((m = inicioRe.exec(corpo))) {
    const resto = corpo.slice(m.index);
    const abertura = /\$([A-Za-z0-9_]*)\$|\bAS\s+'/i.exec(resto);
    let fimDoCorpo = resto.length;
    let cabecalho = resto;
    if (abertura) {
      cabecalho = resto.slice(0, abertura.index);
      if (abertura[0].startsWith('$')) {
        const fecha = resto.indexOf(abertura[0], abertura.index + abertura[0].length);
        fimDoCorpo = fecha < 0 ? resto.length : fecha + abertura[0].length;
      } else {
        // Corpo entre aspas simples: '' é uma aspa escapada.
        let i = abertura.index + abertura[0].length;
        while (i < resto.length && !(resto[i] === "'" && resto[i + 1] !== "'")) i += resto[i] === "'" ? 2 : 1;
        fimDoCorpo = Math.min(resto.length, i + 1);
      }
    }
    const pontoEVirgula = resto.indexOf(';', fimDoCorpo);
    const rodape = abertura ? resto.slice(fimDoCorpo, pontoEVirgula < 0 ? resto.length : pontoEVirgula) : '';
    definicoes.push({ nome: m[1], atributos: `${abertura ? cabecalho : resto.slice(0, pontoEVirgula < 0 ? resto.length : pontoEVirgula)} ${rodape}` });
    inicioRe.lastIndex = m.index + (pontoEVirgula < 0 ? resto.length : pontoEVirgula);
  }
  return definicoes;
}

/** P3: CREATE FUNCTION SECURITY DEFINER sem REVOKE de PUBLIC no mesmo arquivo. */
function secdefSemRevoke(sql: string): number {
  const corpo = semComentarios(sql);
  // Só conta as que declaram SECURITY DEFINER (antes ou depois do corpo).
  const definer = definicoesDeFuncao(corpo)
    .filter((d) => /SECURITY\s+DEFINER/i.test(d.atributos))
    .map((d) => d.nome);
  if (definer.length === 0) return 0;

  const temRevoke = (nome: string) =>
    new RegExp(`REVOKE[\\s\\S]{0,200}?${nome}\\s*\\(`, 'i').test(corpo) ||
    new RegExp(`REVOKE\\s+EXECUTE\\s+ON\\s+ALL\\s+FUNCTIONS`, 'i').test(corpo);

  return definer.filter((nome) => !temRevoke(nome)).length;
}

function migrations(): string[] {
  return readdirSync(PASTA).filter((f) => f.endsWith('.sql'));
}

function violacoes(): Map<string, number> {
  const mapa = new Map<string, number>();
  for (const arquivo of migrations()) {
    if (ALLOWLIST.has(arquivo)) continue;
    const prefixo = prefixoDe(arquivo);
    if (!prefixo || prefixo < CORTE) continue;   // histórico imutável
    const sql = readFileSync(path.join(PASTA, arquivo), 'utf8');
    const total = policiesPermissivas(sql) + secdefSemRevoke(sql);
    if (total > 0) mapa.set(arquivo, total);
  }
  return mapa;
}

describe('segurança · migrations não podem repetir os padrões da auditoria', () => {
  it('NENHUMA VIOLAÇÃO NOVA (policy sem condição ou SECURITY DEFINER sem REVOKE)', () => {
    const achadas = violacoes();
    const novas: string[] = [];

    for (const [arquivo, n] of achadas) {
      novas.push(
        `  ${arquivo}: ${n} violação(ões).\n` +
        `    Policy precisa de condição real (is_org_member/is_org_manager);\n` +
        `    função SECURITY DEFINER precisa de REVOKE EXECUTE ... FROM PUBLIC\n` +
        `    escrito de forma LITERAL — REVOKE dentro de EXECUTE format() não é\n` +
        `    visível para esta trava, que lê o texto do arquivo.`,
      );
    }

    expect(
      novas,
      novas.length
        ? `\n\nPadrão de segurança proibido em migration:\n\n${novas.join('\n\n')}\n\n` +
          `Contexto: docs/security-audit/relatorio-auditoria-seguranca.pdf\n` +
          `Plano:    docs/planos/2026-09-02-correcao-auditoria-seguranca.md\n`
        : '',
    ).toEqual([]);
  });

  it('nenhuma migration carrega placeholder de segredo', () => {
    const PROIBIDOS = ['INTERNAL_SECRET_HERE', 'CONFIGURE_SERVICE_ROLE_KEY', 'SUA_SERVICE_ROLE_KEY', 'SEU_PROJECT_REF'];
    const ofensores: string[] = [];

    for (const arquivo of migrations()) {
      if (ALLOWLIST.has(arquivo)) continue;
      const bruto = readFileSync(path.join(PASTA, arquivo), 'utf8');

      // Peneira barata antes da cara. Ao contrário do outro teste, este varre as
      // 835 migrations (não só as posteriores ao corte), e `semComentarios` em
      // cada uma levava o teste a ~6,8 s — acima do limite padrão de 5 s do
      // Vitest. Sob carga ele estourava e reportava FALHA onde não havia nenhuma.
      //
      // Isso importa mais desde que a suíte virou portão do build no Vercel
      // (`vercel.json` → buildCommand): teste que falha por orçamento de tempo,
      // e não por defeito, bloqueia publicação legítima em máquina mais lenta.
      //
      // A peneira é segura porque remover comentário só TIRA texto: se o
      // placeholder não está no bruto, também não estará no limpo.
      if (!PROIBIDOS.some((p) => bruto.includes(p))) continue;

      const sql = semComentarios(bruto);
      const achados = PROIBIDOS.filter((p) => sql.includes(p));
      if (achados.length) ofensores.push(`  ${arquivo}: ${achados.join(', ')}`);
    }

    // Achado C4-02: o padrão COALESCE(variavel, 'PLACEHOLDER') fez o
    // task-alert-notifier rodar por meses contra `SEU_PROJECT_REF.supabase.co`,
    // falhando com "Couldn't resolve host name" a cada minuto — e o
    // cron.job_run_details marcava tudo como `succeeded`, porque pg_net é
    // assíncrono. Segredo ausente tem de falhar visível, nunca virar literal.
    const ESPERADOS_HISTORICOS = 2; // 20260224000002 e 20261118000011, já aplicadas
    expect(
      ofensores.length,
      ofensores.length > ESPERADOS_HISTORICOS
        ? `\n\nPlaceholder de segredo em migration:\n\n${ofensores.join('\n')}\n`
        : '',
    ).toBeLessThanOrEqual(ESPERADOS_HISTORICOS);
  });
});

describe('segurança · a trava enxerga toda função SECURITY DEFINER (pendência da Fase 0 do plano Imovib)', () => {
  const comRevoke = (sql: string) => `${sql}
REVOKE EXECUTE ON FUNCTION public.fn_x() FROM PUBLIC;`;

  it('corpo delimitado por $$ ou $function$ (já pegava)', () => {
    expect(secdefSemRevoke('CREATE FUNCTION public.fn_x() RETURNS int LANGUAGE sql SECURITY DEFINER AS $$ SELECT 1 $$;')).toBe(1);
    expect(secdefSemRevoke('CREATE FUNCTION public.fn_x() RETURNS int LANGUAGE sql SECURITY DEFINER AS $function$ SELECT 1 $function$;')).toBe(1);
  });

  it('corpo com outro delimitador ($fn$, $body$, $x$)', () => {
    expect(secdefSemRevoke('CREATE FUNCTION public.fn_x() RETURNS int LANGUAGE sql SECURITY DEFINER AS $fn$ SELECT 1 $fn$;')).toBe(1);
    expect(secdefSemRevoke('CREATE OR REPLACE FUNCTION fn_x() RETURNS int SECURITY DEFINER AS $body$ BEGIN RETURN 1; END $body$ LANGUAGE plpgsql;')).toBe(1);
  });

  it('SECURITY DEFINER escrito DEPOIS do corpo', () => {
    expect(secdefSemRevoke('CREATE FUNCTION public.fn_x() RETURNS int AS $$ SELECT 1 $$ LANGUAGE sql SECURITY DEFINER;')).toBe(1);
    expect(secdefSemRevoke('CREATE FUNCTION public.fn_x() RETURNS int AS $q$ SELECT 1 $q$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;')).toBe(1);
  });

  it("corpo entre aspas simples (AS '...')", () => {
    expect(secdefSemRevoke("CREATE FUNCTION public.fn_x() RETURNS int LANGUAGE sql SECURITY DEFINER AS 'SELECT 1';")).toBe(1);
  });

  it('com REVOKE de PUBLIC no arquivo, passa; SECURITY INVOKER e corpo que só CITA "security definer" não contam', () => {
    expect(secdefSemRevoke(comRevoke('CREATE FUNCTION public.fn_x() RETURNS int AS $fn$ SELECT 1 $fn$ LANGUAGE sql SECURITY DEFINER;'))).toBe(0);
    expect(secdefSemRevoke('CREATE FUNCTION public.fn_x() RETURNS int LANGUAGE sql SECURITY INVOKER AS $$ SELECT 1 $$;')).toBe(0);
    expect(secdefSemRevoke("CREATE FUNCTION public.fn_x() RETURNS text LANGUAGE sql AS $$ SELECT 'SECURITY DEFINER' $$;")).toBe(0);
  });

  it('a função seguinte não empresta o SECURITY DEFINER para a anterior', () => {
    const sql = [
      'CREATE FUNCTION public.fn_a() RETURNS int LANGUAGE sql AS $$ SELECT 1 $$;',
      'CREATE FUNCTION public.fn_b() RETURNS int LANGUAGE sql SECURITY DEFINER AS $$ SELECT 2 $$;',
      'REVOKE EXECUTE ON FUNCTION public.fn_b() FROM PUBLIC;',
    ].join('\n');
    expect(secdefSemRevoke(sql)).toBe(0);
  });
});
