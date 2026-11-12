#!/usr/bin/env node
/**
 * rls-trocar-is-org-member.mjs — gera as migrations que trocam, nas policies,
 * cada `is_org_member(X)` por `COALESCE((X) IN (SELECT public.minhas_orgs_membro()), false)`.
 *
 * Plano: docs/planos/2026-11-11-rls-is-org-member-tabelas-grandes.md ("Troca mecânica").
 *
 * Por quê: is_org_member roda POR LINHA (uma consulta em organization_members a cada
 * linha lida); o conjunto de orgs do usuário é calculado uma vez por consulta. O
 * COALESCE mantém o mesmo booleano quando X é nulo (is_org_member nunca devolve nulo),
 * então a troca vale em qualquer contexto (OR, AND, NOT, EXISTS, CASE).
 *
 * Entrada: o retrato das policies tirado do banco (pg_policies) em JSON —
 *   docs/planos/2026-11-11-rls-is-org-member/policies-antes.json
 * Saída (na mesma pasta):
 *   lote-N.sql        ALTER POLICY de cada policy do lote (só as cláusulas que mudam)
 *   volta-lote-N.sql  os mesmos ALTER POLICY com as expressões de antes
 *   validar.sql       EXPLAIN de cada expressão nova (confere sintaxe e tipos sem travar tabela)
 *
 * Uso: node scripts/rls-trocar-is-org-member.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const PASTA = path.join('docs', 'planos', '2026-11-11-rls-is-org-member');
const policies = JSON.parse(readFileSync(path.join(PASTA, 'policies-antes.json'), 'utf8'));

const NOVA = (arg) => `COALESCE((${arg}) IN (SELECT public.minhas_orgs_membro()), false)`;

/**
 * Troca toda chamada `is_org_member(...)` / `public.is_org_member(...)` da expressão.
 * Varre caractere a caractere: pula texto entre aspas simples ('' é aspa escapada) e
 * identificadores entre aspas duplas; acha o parêntese que fecha a chamada contando
 * aninhamento. Devolve { texto, trocas }.
 */
export function trocar(expr) {
  if (expr == null) return { texto: null, trocas: 0 };
  const n = expr.length;
  const ehIdent = (c) => c !== undefined && /[A-Za-z0-9_$.]/.test(c);
  // Fim de um literal '...' que começa em i (devolve o índice da aspa que fecha).
  const fimDoTexto = (i) => {
    let j = i + 1;
    while (j < n) {
      if (expr[j] === "'" && expr[j + 1] === "'") { j += 2; continue; }
      if (expr[j] === "'") return j;
      j++;
    }
    throw new Error(`aspa sem fechar em: ${expr}`);
  };
  // Tamanho do prefixo da chamada que começa em i, ou 0.
  const chamadaEm = (i) => {
    if (ehIdent(expr[i - 1])) return 0;          // parte de outro nome (x.is_org_member, fn_is_org_member)
    for (const prefixo of ['public.is_org_member(', 'is_org_member(']) {
      if (expr.startsWith(prefixo, i)) return prefixo.length;
    }
    return 0;
  };
  let saida = '';
  let trocas = 0;
  let i = 0;
  while (i < n) {
    const c = expr[i];
    if (c === "'") { const j = fimDoTexto(i); saida += expr.slice(i, j + 1); i = j + 1; continue; }
    if (c === '"') { const j = expr.indexOf('"', i + 1); saida += expr.slice(i, j + 1); i = j + 1; continue; }
    const tam = chamadaEm(i);
    if (tam > 0) {
      // acha o ')' que fecha a chamada, respeitando aninhamento e aspas
      let j = i + tam, prof = 1;
      while (j < n && prof > 0) {
        if (expr[j] === "'") { j = fimDoTexto(j) + 1; continue; }
        if (expr[j] === '(') prof++;
        else if (expr[j] === ')') prof--;
        j++;
      }
      if (prof !== 0) throw new Error(`parênteses desbalanceados em: ${expr}`);
      const interno = trocar(expr.slice(i + tam, j - 1));   // chamada dentro do argumento
      saida += NOVA(interno.texto);
      trocas += 1 + interno.trocas;
      i = j;
      continue;
    }
    saida += c;
    i++;
  }
  return { texto: saida, trocas };
}

const id = (s) => `"${s.replace(/"/g, '""')}"`;
const tabela = (p) => `${id(p.schemaname)}.${id(p.tablename)}`;

function alter(p, usando, checagem) {
  const partes = [`ALTER POLICY ${id(p.policyname)} ON ${tabela(p)}`];
  if (usando != null) partes.push(`  USING (${usando})`);
  if (checagem != null) partes.push(`  WITH CHECK (${checagem})`);
  return partes.join('\n') + ';';
}

// ── Troca e conferência ─────────────────────────────────────────────────────
const itens = policies.map((p) => {
  const q = trocar(p.qual);
  const c = trocar(p.with_check);
  for (const [orig, novo] of [[p.qual, q], [p.with_check, c]]) {
    if (orig == null) continue;
    if (/\bis_org_member\s*\(/.test(novo.texto)) throw new Error(`sobrou is_org_member em ${p.tablename}.${p.policyname}`);
    const chamadas = (orig.match(/\bis_org_member\s*\(/g) ?? []).length;
    if (chamadas !== novo.trocas) throw new Error(`${p.tablename}.${p.policyname}: ${chamadas} chamadas, ${novo.trocas} trocas`);
  }
  return {
    p,
    usando: q.trocas > 0 ? q.texto : null,       // só muda a cláusula que tinha a chamada
    checagem: c.trocas > 0 ? c.texto : null,
    trocas: q.trocas + c.trocas,
    publico: p.roles === '{public}' || /\banon\b/.test(p.roles),
  };
});

const lote = (it) =>
  it.p.schemaname === 'storage' ? 3 : Number(it.p.linhas) >= 300 ? 1 : 2;

const LOTES = {
  1: 'tabelas do schema public com 300 linhas ou mais (onde o custo foi medido)',
  2: 'o resto do schema public',
  3: 'storage.objects',
};

const cabecalho = (n, lista) => `-- ════════════════════════════════════════════════════════════════════════════
-- RLS: is_org_member por linha → conjunto de orgs calculado uma vez — LOTE ${n}
-- ${LOTES[n]}: ${lista.length} policies em ${new Set(lista.map((x) => tabela(x.p))).size} tabelas
-- ════════════════════════════════════════════════════════════════════════════
-- GERADO por scripts/rls-trocar-is-org-member.mjs a partir do retrato
-- docs/planos/2026-11-11-rls-is-org-member/policies-antes.json — não editar à mão;
-- regerar. Plano: docs/planos/2026-11-11-rls-is-org-member-tabelas-grandes.md
--
-- Cada is_org_member(X) vira COALESCE((X) IN (SELECT public.minhas_orgs_membro()), false):
-- mesmo booleano (inclusive X nulo), calculado uma vez por consulta. Só as cláusulas
-- que tinham a chamada mudam; nome, comando, papéis e as demais pernas ficam.
--
-- REGRA #7 — Pergunta 1: nenhuma perna nova; cada chamada é trocada no lugar.
-- Pergunta 2: nenhuma função nova. minhas_orgs_membro (aplicar_20271111940000) ganha
-- EXECUTE para anon quando o lote tem policy de papel {public}: o anon avalia essas
-- policies (mesmo motivo de is_org_member em aplicar_20271111930000); com JWT vazio
-- ela devolve conjunto vazio.
--
-- TRAVA: cada ALTER POLICY trava a tabela por milissegundos. lock_timeout de 2 s: se
-- uma tabela estiver ocupada o comando falha em vez de enfileirar o app — rodar de novo.
-- VOLTA: docs/planos/2026-11-11-rls-is-org-member/volta-lote-${n}.sql
--
-- Aplicar: npx supabase db query --linked -f <caminho deste arquivo>
-- NUNCA \`supabase db push\` (CLAUDE.md da raiz).

SET lock_timeout = '2s';
`;

for (const n of [1, 2, 3]) {
  const lista = itens.filter((it) => lote(it) === n);
  const temPublico = lista.some((it) => it.publico);
  const grant = temPublico
    ? `\n-- Policies de papel {public} neste lote: ${lista.filter((it) => it.publico).length}.\nGRANT EXECUTE ON FUNCTION public.minhas_orgs_membro() TO anon;\n`
    : '';
  const corpo = lista.map((it) => `-- ${it.p.cmd} · ${it.p.roles} · ${it.trocas} troca(s) · ${it.p.linhas} linhas\n${alter(it.p, it.usando, it.checagem)}`).join('\n\n');
  writeFileSync(path.join(PASTA, `lote-${n}.sql`), cabecalho(n, lista) + grant + '\n' + corpo + '\n', 'utf8');

  const volta = lista.map((it) => alter(it.p, it.usando != null ? it.p.qual : null, it.checagem != null ? it.p.with_check : null)).join('\n\n');
  writeFileSync(path.join(PASTA, `volta-lote-${n}.sql`),
    `-- VOLTA do lote ${n}: devolve as expressões com is_org_member (retrato de 11/11/2026).\nSET lock_timeout = '2s';\n\n${volta}\n`, 'utf8');
}

// Validação: EXPLAIN de cada expressão nova, como dono, sem trava (só AccessShare).
const validar = itens.flatMap((it) => [it.usando, it.checagem].filter((e) => e != null).map((e) => ({ it, e })));
const sqlValidar = `-- SÓ LEITURA: EXPLAIN de cada expressão nova (${validar.length}). Confere sintaxe e tipos.
DO $v$
DECLARE erros text := ''; n int := 0;
BEGIN
${validar.map(({ it, e }) => `  BEGIN EXECUTE ${dollar(`EXPLAIN SELECT 1 FROM ${tabela(it.p)} WHERE ${e}`)}; n := n + 1;
  EXCEPTION WHEN OTHERS THEN erros := erros || E'\\n' || ${dollar(`${it.p.tablename}.${it.p.policyname}`)} || ': ' || SQLERRM; END;`).join('\n')}
  RAISE EXCEPTION 'RESULTADOS: % expressões válidas de ${validar.length}%', n, CASE WHEN erros = '' THEN '' ELSE E'\\nERROS:' || erros END;
END
$v$;
`;
function dollar(s) { if (s.includes('$q$')) throw new Error('texto com $q$'); return `$q$${s}$q$`; }
writeFileSync(path.join(PASTA, 'validar.sql'), sqlValidar, 'utf8');

const total = itens.reduce((s, it) => s + it.trocas, 0);
console.log(`${itens.length} policies, ${total} chamadas trocadas`);
for (const n of [1, 2, 3]) {
  const l = itens.filter((it) => lote(it) === n);
  console.log(`  lote ${n}: ${l.length} policies, ${new Set(l.map((x) => tabela(x.p))).size} tabelas, ${l.filter((x) => x.publico).length} de papel {public}`);
}

// ── Conferência sobre os dados (sem trava): para cada expressão trocada e cada usuário,
// conta as linhas em que (antiga) IS DISTINCT FROM (nova). Tem de dar 0. Roda como dono
// (RLS desligada) com o JWT de cada usuário — as duas expressões na MESMA consulta.
for (const n of [1, 2, 3]) {
  const lista = itens.filter((it) => lote(it) === n);
  const pares = lista.flatMap((it) => [
    it.usando != null ? { it, antiga: it.p.qual, nova: it.usando, qual: 'USING' } : null,
    it.checagem != null ? { it, antiga: it.p.with_check, nova: it.checagem, qual: 'CHECK' } : null,
  ].filter(Boolean));
  const sql = `-- SÓ LEITURA (desfeito no fim): (antiga) IS DISTINCT FROM (nova) linha a linha, lote ${n}, ${pares.length} expressões × cada usuário.
DO $c$
DECLARE r text := ''; u record; k bigint; total bigint := 0; testes int := 0; detalhes text := '';
BEGIN
  PERFORM set_config('statement_timeout', '1800s', true);
  CREATE TEMP TABLE _quem ON COMMIT DROP AS
    SELECT DISTINCT lower(m.email) AS email, COALESCE(m.user_id, au.id) AS uid
      FROM public.organization_members m LEFT JOIN auth.users au ON lower(au.email) = lower(m.email)
    UNION
    SELECT DISTINCT lower(b.email), au.id FROM public.broker_profiles b LEFT JOIN auth.users au ON lower(au.email) = lower(b.email)
    UNION SELECT NULL, NULL;
  FOR u IN SELECT * FROM _quem LOOP
    PERFORM set_config('request.jwt.claims', CASE WHEN u.email IS NULL THEN '' ELSE json_build_object('sub', u.uid, 'email', u.email, 'role', 'authenticated')::text END, true);
    PERFORM set_config('request.jwt.claim.sub', '', true);
${pares.map(({ it, antiga, nova, qual }) => `    BEGIN
      EXECUTE ${dollar(`SELECT count(*) FROM ${tabela(it.p)} WHERE ((${antiga})) IS DISTINCT FROM ((${nova}))`)} INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s ${it.p.tablename}.${it.p.policyname.replace(/'/g, "''")} ${qual}: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s ${it.p.tablename}.${it.p.policyname.replace(/'/g, "''")} ${qual}: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;`).join('\n')}
  END LOOP;
  RAISE EXCEPTION 'RESULTADOS: lote ${n}: % comparações (expressão × usuário), % linhas com resultado diferente%', testes, total,
    CASE WHEN detalhes = '' THEN '' ELSE E'\n' || left(detalhes, 3000) END;
END
$c$;
`;
  writeFileSync(path.join(PASTA, `comparar-lote-${n}.sql`), sql, 'utf8');
}
