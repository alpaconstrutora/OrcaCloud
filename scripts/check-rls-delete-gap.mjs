#!/usr/bin/env node
/**
 * Caça exclusões que o app pede e a RLS engole em silêncio.
 *
 * ── O bug que originou este script (2026-08-26) ───────────────────────────────
 * `warranty_claims` tinha policy de SELECT, INSERT e UPDATE para `authenticated`
 * e NENHUMA de DELETE. Com RLS ligada e sem policy permissiva, o DELETE apaga
 * ZERO linhas e **não devolve erro**. `warrantyService.delete()` só testava
 * `error`, então a tela mostrava "Chamado excluído" e o chamado continuava lá.
 *
 * ── Por que auditar POLICY e não CALL SITE ────────────────────────────────────
 * Há 312 `.delete()` no repo e nenhum confere linhas afetadas. Corrigir os 312
 * é caro e quase todo inútil: onde a policy existe, o `.delete()` funciona. O
 * que realmente quebra é a interseção — o app apaga E a tabela não tem policy.
 * É essa lista, curta, que este script produz.
 *
 * ── Limite honesto ────────────────────────────────────────────────────────────
 * É análise ESTÁTICA sobre `supabase/migrations/`. Policy criada à mão no
 * console, fora de migration, não aparece aqui. Trate a saída como "suspeitos a
 * confirmar em `pg_policies`", não como veredito. A consulta de confirmação sai
 * junto no relatório.
 *
 * Uso:
 *   node scripts/check-rls-delete-gap.mjs           # relatório completo
 *   node scripts/check-rls-delete-gap.mjs --quiet   # só o resumo
 * Sai com código 1 se achar alguma tabela na interseção.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const RAIZ = process.cwd();
const PASTA_MIGRATIONS = path.join(RAIZ, 'supabase', 'migrations');
const PASTAS_CODIGO = ['services', 'components', 'hooks', 'store', 'utils'];
const QUIET = process.argv.includes('--quiet');

// ─────────────────────────────────────────────────────────────────────────────
// 1. Ler as migrations em ordem de nome — é a ordem em que rodaram.
//    `aplicar_20270905000001_x.sql` e `20270905000001_x.sql` ordenam pelo
//    prefixo numérico, não pelo "aplicar_".
// ─────────────────────────────────────────────────────────────────────────────

const chaveOrdem = (f) => {
  const m = /^(?:aplicar_)?(\d{14})_/.exec(f);
  return m ? m[1] + f : 'zzzz' + f;
};

const migrations = readdirSync(PASTA_MIGRATIONS)
  .filter((f) => f.endsWith('.sql'))
  .sort((a, b) => chaveOrdem(a).localeCompare(chaveOrdem(b)));

/** tabelas com RLS ligada */
const rlsLigada = new Set();
/** chave "tabela::policy" -> { tabela, cmd, role } — reflete CREATE e DROP em ordem */
const policies = new Map();

// O nome da policy PODE TER ESPAÇOS ("Manage internal_transactions as member"),
// o `FOR` pode faltar (default ALL) e o `TO` também (default PUBLIC). Capturar
// o miolo entre o nome da tabela e o USING/WITH CHECK e ler FOR/TO de lá é o
// único jeito que aguenta as três variações que este repo realmente usa.
const reRls = /ALTER\s+TABLE\s+(?:ONLY\s+)?(?:public\.)?"?(\w+)"?\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/gi;
const reCreate = /CREATE\s+POLICY\s+(?:"([^"]+)"|(\w+))\s+ON\s+(?:public\.)?"?(\w+)"?([\s\S]{0,200}?)(?:USING\s*\(|WITH\s+CHECK\s*\(|;)/gi;
const reDrop = /DROP\s+POLICY\s+(?:IF\s+EXISTS\s+)?(?:"([^"]+)"|(\w+))\s+ON\s+(?:public\.)?"?(\w+)"?/gi;

for (const arquivo of migrations) {
  const sql = readFileSync(path.join(PASTA_MIGRATIONS, arquivo), 'utf8');

  // DROP antes de CREATE dentro do mesmo arquivo daria resultado errado se
  // processados em blocos separados; por isso varremos por posição.
  const eventos = [];
  for (const m of sql.matchAll(reRls)) eventos.push({ pos: m.index, tipo: 'rls', tabela: m[1] });
  for (const m of sql.matchAll(reCreate)) {
    const miolo = m[4] ?? '';
    const cmd = (/\bFOR\s+(ALL|SELECT|INSERT|UPDATE|DELETE)\b/i.exec(miolo)?.[1] ?? 'ALL').toUpperCase();
    const role = /\bTO\s+([\w][\w\s,]*?)\s*$|\bTO\s+([\w][\w\s,]*?)(?=\s+(?:USING|WITH|AS)\b)/i.exec(miolo);
    eventos.push({
      pos: m.index, tipo: 'create',
      nome: m[1] ?? m[2], tabela: m[3], cmd,
      role: (role?.[1] ?? role?.[2] ?? 'public').trim(),
    });
  }
  for (const m of sql.matchAll(reDrop))
    eventos.push({ pos: m.index, tipo: 'drop', nome: m[1] ?? m[2], tabela: m[3] });

  // Policies criadas em LAÇO, via SQL dinâmico. O motor de áreas cria as ~13
  // policies `*_org_access` assim, num FOREACH sobre um ARRAY de tabelas:
  //
  //     FOREACH t IN ARRAY ARRAY['area_version_units', ...]
  //     LOOP  EXECUTE format('CREATE POLICY %s_org_access ON public.%I FOR ALL ...
  //
  // Sem tratar isso, as 13 apareciam como "sem policy de DELETE" — 11 dos 21
  // achados da primeira versão deste script eram exatamente esse falso
  // positivo. O nome da policy aqui é irrelevante (é gerado); o que importa é
  // que a tabela passa a ter caminho de DELETE.
  for (const m of sql.matchAll(/EXECUTE\s+format\(\s*'(CREATE\s+POLICY[\s\S]{0,400}?)'/gi)) {
    const template = m[1];
    const cmd = (/\bFOR\s+(ALL|SELECT|INSERT|UPDATE|DELETE)\b/i.exec(template)?.[1] ?? 'ALL').toUpperCase();
    if (cmd !== 'ALL' && cmd !== 'DELETE') continue;
    const role = /\bTO\s+(\w+)/i.exec(template)?.[1] ?? 'public';
    // tabelas do ARRAY[...] mais próximo acima
    const antes = sql.slice(Math.max(0, m.index - 2000), m.index);
    const arr = [...antes.matchAll(/ARRAY\s*\[([\s\S]*?)\]/gi)].pop();
    if (!arr) continue;
    for (const t of arr[1].matchAll(/'(\w+)'/g)) {
      eventos.push({ pos: m.index, tipo: 'create', nome: `__dinamica_${t[1]}`, tabela: t[1], cmd, role });
    }
  }

  eventos.sort((a, b) => a.pos - b.pos);

  for (const e of eventos) {
    if (e.tipo === 'rls') rlsLigada.add(e.tabela);
    else if (e.tipo === 'create') policies.set(`${e.tabela}::${e.nome}`, { tabela: e.tabela, cmd: e.cmd, role: e.role, arquivo });
    else policies.delete(`${e.tabela}::${e.nome}`);
  }
}

/** tabela -> true se alguma policy viva permite DELETE a quem não é anon */
const podeApagar = new Map();
for (const p of policies.values()) {
  if (p.cmd !== 'DELETE' && p.cmd !== 'ALL') continue;
  const soAnon = /^anon$/i.test(p.role);
  if (soAnon) continue; // policy de dev para anon não conta como caminho do app
  podeApagar.set(p.tabela, p);
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Onde o app chama .delete(), e sobre qual tabela
// ─────────────────────────────────────────────────────────────────────────────

function arquivosDeCodigo(dir, acc = []) {
  let entradas;
  try { entradas = readdirSync(dir); } catch { return acc; }
  for (const nome of entradas) {
    if (nome === 'node_modules' || nome === 'dist' || nome.startsWith('.')) continue;
    const p = path.join(dir, nome);
    if (statSync(p).isDirectory()) arquivosDeCodigo(p, acc);
    else if (/\.(ts|tsx)$/.test(nome)) acc.push(p);
  }
  return acc;
}

/** tabela -> [{arquivo, linha}] */
const chamadas = new Map();

for (const pasta of PASTAS_CODIGO) {
  for (const arquivo of arquivosDeCodigo(path.join(RAIZ, pasta))) {
    const linhas = readFileSync(arquivo, 'utf8').split('\n');
    linhas.forEach((linha, i) => {
      if (!linha.includes('.delete()')) return;
      // A tabela vem do `.from('x')` mais próximo acima, na mesma cadeia.
      let tabela = null;
      for (let j = i; j >= Math.max(0, i - 8); j--) {
        const m = /\.from\(\s*['"`](\w+)['"`]/.exec(linhas[j]);
        if (m) { tabela = m[1]; break; }
      }
      if (!tabela) return;
      if (!chamadas.has(tabela)) chamadas.set(tabela, []);
      chamadas.get(tabela).push({ arquivo: path.relative(RAIZ, arquivo).replace(/\\/g, '/'), linha: i + 1 });
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. A interseção
// ─────────────────────────────────────────────────────────────────────────────

const suspeitas = [];
for (const [tabela, locais] of chamadas) {
  if (!rlsLigada.has(tabela)) continue;      // sem RLS, o DELETE passa
  if (podeApagar.has(tabela)) continue;      // tem policy — ok
  suspeitas.push({ tabela, locais });
}
suspeitas.sort((a, b) => b.locais.length - a.locais.length || a.tabela.localeCompare(b.tabela));

// ─────────────────────────────────────────────────────────────────────────────
// 4. Relatório
// ─────────────────────────────────────────────────────────────────────────────

console.log('── Exclusões que a RLS pode estar engolindo em silêncio ──\n');
console.log(`migrations lidas          : ${migrations.length}`);
console.log(`tabelas com RLS ligada    : ${rlsLigada.size}`);
console.log(`tabelas com policy DELETE : ${podeApagar.size}`);
console.log(`tabelas que o app apaga   : ${chamadas.size}`);
console.log(`SUSPEITAS                 : ${suspeitas.length}\n`);

if (suspeitas.length === 0) {
  console.log('✅ Nenhuma tabela com RLS ligada, sem policy de DELETE, e apagada pelo app.');
  process.exit(0);
}

if (!QUIET) {
  for (const s of suspeitas) {
    console.log(`❌ ${s.tabela}  (${s.locais.length} chamada${s.locais.length > 1 ? 's' : ''})`);
    for (const l of s.locais.slice(0, 6)) console.log(`     ${l.arquivo}:${l.linha}`);
    if (s.locais.length > 6) console.log(`     … mais ${s.locais.length - 6}`);
  }
  console.log('');
}

console.log('Confirme no banco antes de corrigir — policy criada à mão, fora de');
console.log('migration, não aparece nesta análise estática:\n');
console.log("SELECT tablename, policyname, cmd, roles FROM pg_policies");
console.log(" WHERE schemaname = 'public'");
console.log(`   AND tablename IN (${suspeitas.map((s) => `'${s.tabela}'`).join(', ')})`);
console.log(' ORDER BY tablename, cmd;\n');
console.log('Para cada uma confirmada, decidir entre: criar policy de DELETE,');
console.log('trocar exclusão por arquivamento, ou remover a ação da tela.');
console.log('Em qualquer caso, o service tem de parar de reportar sucesso quando');
console.log('apagou zero linhas — ver services/warrantyService.ts:delete().');

process.exit(1);
