// Testemunha do Motor de Áreas NBR 12721 (13/10/2026, Fase 0 do plano
// docs/planos/2026-10-13-areas-nbr12721-na-planta.md).
//
// ⚠️ NÃO RODA MAIS desde a Fase 10 (14/10/2026): as funções e tabelas do Motor
// (`calculate_area_version`, `area_*`) foram apagadas do banco. A testemunha
// ficou CONGELADA nos 16 JSON de `__tests__/fixtures/nbr12721/` (bloco
// `testemunha`), que é o que `nbr12721Quadros.test.ts` confere. Este arquivo
// fica como registro de COMO elas foram capturadas.
//
// O cálculo dos Quadros I, II e IV-B vai sair do SQL (`calculate_area_version`)
// e virar motor puro em TS dentro da Planta. Antes de qualquer remoção, este
// script registra o que o SQL VIGENTE NO BANCO calcula para cada caso de
// `__tests__/fixtures/nbr12721/*.json` — é contra isso que o motor TS será
// conferido (tolerância 1e-9), do mesmo jeito que a conta própria de UTM ficou
// como testemunha do proj4.
//
// ─── POR QUE NADA É GRAVADO ────────────────────────────────────────────────
//
// As fixtures antigas (`supabase/seed/area_engine_case*`) criam organização e
// terminam em COMMIT — não podem rodar em produção. Aqui cada caso vira UM
// bloco `DO` que insere, valida, calcula e então LEVANTA UMA EXCEÇÃO com o
// resultado na mensagem: a exceção desfaz a transação inteira. Não há caminho
// em que o bloco termine bem, então não há caminho em que algo fique gravado.
// A organização usada é uma que já existe (nenhum INSERT em `organizations`).
// Mesmo assim o script conta as tabelas `area_*` antes e depois e falha se
// algo mudou.
//
// ─── USO ────────────────────────────────────────────────────────────────────
//
//     node scripts/nbr12721-testemunha.mjs            # todos os casos
//     node scripts/nbr12721-testemunha.mjs 03 11      # casos cujo nome começa assim
//
// Reescreve só o campo `testemunha` de cada JSON. `entrada` e `esperado` são
// escritos à mão; `esperado` confere a própria transcrição contra os valores
// das fixtures antigas (se um número diverge, o erro foi meu ao transcrever).
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(fileURLToPath(new URL('..', import.meta.url)));
const dirCasos = join(raiz, '__tests__', 'fixtures', 'nbr12721');
const tmp = mkdtempSync(join(tmpdir(), 'nbr12721-'));
const TOLERANCIA = 1e-9;

// ── banco ──────────────────────────────────────────────────────────────────

function rodar(sql) {
  const arq = join(tmp, 'q.sql');
  writeFileSync(arq, sql);
  // Uma string só: no Windows o `npx` precisa de shell, e args separados com
  // `shell: true` disparam o DEP0190. O caminho vem do mkdtemp (sem aspas).
  const r = spawnSync(`npx supabase db query --linked -o json -f "${arq}"`, {
    cwd: raiz,
    encoding: 'utf8',
    shell: true,
    maxBuffer: 64 * 1024 * 1024,
  });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

function consultar(sql) {
  const r = rodar(sql);
  if (r.status !== 0) throw new Error(`consulta falhou:\n${r.stderr}`);
  return JSON.parse(r.stdout).rows;
}

/** A saída do bloco vem na mensagem da exceção: "...TESTEMUNHA:<json>\nCONTEXT: ...". */
function lerTestemunha(stderr) {
  const i = stderr.indexOf('{"message":');
  if (i < 0) throw new Error(`resposta sem mensagem de erro:\n${stderr}`);
  const fim = stderr.indexOf('}\n', i);
  const msg = JSON.parse(stderr.slice(i, fim < 0 ? undefined : fim + 1)).message;
  const k = msg.indexOf('TESTEMUNHA:');
  if (k < 0) throw new Error(`o bloco falhou ANTES de chegar à testemunha:\n${msg}`);
  const corpo = msg.slice(k + 'TESTEMUNHA:'.length);
  const c = corpo.indexOf('\nCONTEXT:');
  return JSON.parse(c < 0 ? corpo : corpo.slice(0, c));
}

// ── SQL ─────────────────────────────────────────────────────────────────────

const lit = (v) => {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new Error(`número inválido: ${v}`);
    return String(v);
  }
  return `'${String(v).replace(/'/g, "''")}'`;
};

/** UUID determinístico — o mesmo caso gera sempre os mesmos ids. */
function uuid(caso, tipo, codigo) {
  const h = createHash('md5').update(`nbr12721:${caso}:${tipo}:${codigo}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

function sqlDoCaso(nome, e) {
  const id = (tipo, codigo) => {
    if (codigo === null || codigo === undefined) return 'NULL';
    return lit(uuid(nome, tipo, codigo));
  };
  const ver = id('versao', 'v1');
  const projeto = id('projeto', 'p');
  const exigir = (lista, tipo, codigo, onde) => {
    if (codigo === null || codigo === undefined) return;
    if (!lista.some((x) => x.code === codigo)) throw new Error(`${nome}: ${onde} cita ${tipo} inexistente "${codigo}"`);
  };
  const L = [];
  L.push(`INSERT INTO public.area_projects (id, organization_id, name, normative_reference, normative_valid_from, project_type, status)
VALUES (${projeto}, v_org, ${lit('Testemunha ' + nome)}, 'ABNT NBR 12721:2006', DATE '2007-01-21', ${lit(e.project_type ?? 'vertical')}, 'active');`);
  L.push(`INSERT INTO public.area_versions (id, area_project_id, version_number, version_label, status, calculation_engine_version, normative_reference, normative_valid_from)
VALUES (${ver}, ${projeto}, 1, ${lit('Testemunha ' + nome)}, 'draft', 'testemunha-fase0', 'ABNT NBR 12721:2006', DATE '2007-01-21');`);
  for (const b of e.blocks) {
    L.push(`INSERT INTO public.area_version_blocks (id, area_version_id, code, name, sort_order)
VALUES (${id('bloco', b.code)}, ${ver}, ${lit(b.code)}, ${lit(b.name)}, ${lit(b.sort_order ?? 1)});`);
  }
  for (const f of e.floors) {
    exigir(e.blocks, 'bloco', f.block, `pavimento ${f.code}`);
    L.push(`INSERT INTO public.area_version_floors (id, area_version_id, block_id, code, name, floor_type, sort_order, is_template, is_materialized, materialized_label, materialized_index)
VALUES (${id('pavimento', f.code)}, ${ver}, ${id('bloco', f.block)}, ${lit(f.code)}, ${lit(f.name)}, ${lit(f.floor_type ?? 'other')}, ${lit(f.sort_order ?? 1)}, false, true, ${lit(f.label ?? f.name)}, ${lit(f.sort_order ?? 1)});`);
  }
  e.units.forEach((u, i) => {
    exigir(e.blocks, 'bloco', u.block, `unidade ${u.code}`);
    exigir(e.floors, 'pavimento', u.floor, `unidade ${u.code}`);
    L.push(`INSERT INTO public.area_version_units (id, area_version_id, block_id, primary_floor_id, code, unit_type, typology_code, is_autonomous, is_active, is_template, is_materialized, materialized_label, materialized_index)
VALUES (${id('unidade', u.code)}, ${ver}, ${id('bloco', u.block)}, ${id('pavimento', u.floor)}, ${lit(u.code)}, ${lit(u.unit_type ?? 'apartment')}, ${lit(u.typology_code ?? null)}, ${lit(u.is_autonomous ?? true)}, ${lit(u.is_active ?? true)}, false, true, ${lit(u.code)}, ${i + 1});`);
  });
  e.spaces.forEach((s, i) => {
    exigir(e.blocks, 'bloco', s.block, `espaço ${s.code}`);
    exigir(e.floors, 'pavimento', s.floor, `espaço ${s.code}`);
    exigir(e.units, 'unidade', s.unit, `espaço ${s.code}`);
    L.push(`INSERT INTO public.area_version_spaces (id, area_version_id, block_id, floor_id, unit_id, code, name, use_class, private_nature, coverage_class, common_division_class, ownership_accounting_mode, real_area_m2_raw, coefficient_value, source_type, is_template, is_materialized, materialized_label, materialized_index)
VALUES (${id('espaco', s.code)}, ${ver}, ${id('bloco', s.block)}, ${id('pavimento', s.floor)}, ${id('unidade', s.unit)}, ${lit(s.code)}, ${lit(s.name)}, ${lit(s.use_class)}, ${lit(s.private_nature ?? 'not_applicable')}, ${lit(s.coverage_class ?? 'covered_standard')}, ${lit(s.common_division_class ?? 'not_applicable')}, ${lit(s.ownership_accounting_mode)}, ${lit(s.real_area_m2_raw)}, ${lit(s.coefficient_value === undefined ? 1 : s.coefficient_value)}, 'manual', false, true, ${lit(s.name)}, ${i + 1});`);
  });
  (e.accessory_links ?? []).forEach((l, i) => {
    exigir(e.units, 'unidade', l.parent_unit, 'vínculo de acessório');
    exigir(e.spaces, 'espaço', l.accessory_space, 'vínculo de acessório');
    exigir(e.units, 'unidade', l.accessory_unit, 'vínculo de acessório');
    L.push(`INSERT INTO public.area_version_unit_accessory_links (id, area_version_id, parent_unit_id, accessory_space_id, accessory_unit_id, link_type, affects_private_area, affects_coefficient)
VALUES (${id('vinculo', String(i))}, ${ver}, ${id('unidade', l.parent_unit)}, ${id('espaco', l.accessory_space)}, ${id('unidade', l.accessory_unit)}, ${lit(l.link_type ?? 'parking')}, ${lit(l.affects_private_area ?? true)}, ${lit(l.affects_coefficient ?? true)});`);
  });
  (e.common_allocations ?? []).forEach((a, i) => {
    exigir(e.spaces, 'espaço', a.common_space, 'alocação não proporcional');
    exigir(e.units, 'unidade', a.target_unit, 'alocação não proporcional');
    L.push(`INSERT INTO public.area_version_common_allocations (id, area_version_id, common_space_id, target_unit_id, allocation_method, allocated_real_area_m2_raw, allocated_equivalent_area_m2_raw, percentage)
VALUES (${id('alocacao', String(i))}, ${ver}, ${id('espaco', a.common_space)}, ${id('unidade', a.target_unit)}, ${lit(a.allocation_method)}, ${lit(a.allocated_real_area_m2_raw ?? null)}, ${lit(a.allocated_equivalent_area_m2_raw ?? null)}, ${lit(a.percentage ?? null)});`);
  });
  (e.distribution_scopes ?? []).forEach((d, i) => {
    exigir(e.spaces, 'espaço', d.common_space, 'escopo de distribuição');
    exigir(e.blocks, 'bloco', d.block, 'escopo de distribuição');
    L.push(`INSERT INTO public.area_version_common_distribution_scopes (id, area_version_id, common_space_id, distribution_scope, block_id)
VALUES (${id('escopo', String(i))}, ${ver}, ${id('espaco', d.common_space)}, ${lit(d.distribution_scope)}, ${id('bloco', d.block)});`);
  });

  return `DO $testemunha$
DECLARE
    v_org uuid;
    v_validacao jsonb;
    v_calculo jsonb;
    v_payload jsonb;
BEGIN
    SELECT id INTO v_org FROM public.organizations ORDER BY id LIMIT 1;
${L.join('\n')}
    v_validacao := public.validate_area_version(${ver});
    v_calculo := public.calculate_area_version(${ver});
    SELECT canonical_payload_json INTO v_payload FROM public.area_versions WHERE id = ${ver};
    -- Sempre aborta: a exceção desfaz tudo o que este bloco inseriu.
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'TESTEMUNHA:' || jsonb_build_object(
        'validacao_antes', v_validacao,
        'calculo', v_calculo - 'version_id' - 'version_payload_hash',
        'payload', v_payload
    )::text;
END
$testemunha$;`;
}

// ── conferências ────────────────────────────────────────────────────────────

const num = (v) => (v === null || v === undefined ? 0 : Number(v));
const soma = (linhas, campo) => (linhas ?? []).reduce((s, r) => s + num(r[campo]), 0);

/** Fechamentos entre quadros — REGISTRADOS, não exigidos: a testemunha diz o que o SQL faz. */
function fechamentos(p) {
  if (!p) return null;
  return {
    soma_qii_31: soma(p.quadro_ii, 'qii_31_proportionality_coefficient_raw'),
    soma_fracoes: soma(p.fractions, 'fraction_decimal_raw'),
    soma_milesimos: soma(p.fractions, 'fraction_thousandths_raw'),
    qi_17_real: soma(p.quadro_i, 'qi_17_floor_real_total_raw'),
    qi_18_equivalente: soma(p.quadro_i, 'qi_18_floor_equivalent_total_raw'),
    qii_37_real: soma(p.quadro_ii, 'qii_37_unit_real_total_raw'),
    qii_38_equivalente: soma(p.quadro_ii, 'qii_38_unit_equivalent_total_raw'),
    qivb_f_real: soma(p.quadro_ivb, 'qivb_f_real_total_area_raw'),
  };
}

function conferirEsperado(nome, esperado, t) {
  const erros = [];
  if (!esperado) return erros;
  if (esperado.status && t.calculo?.status !== esperado.status) {
    erros.push(`status ${t.calculo?.status} ≠ esperado ${esperado.status}`);
  }
  for (const cod of esperado.codigos ?? []) {
    const tem = (t.calculo?.blocking_errors ?? []).some((x) => x.code === cod);
    if (!tem) erros.push(`código ${cod} não apareceu`);
  }
  for (const c of esperado.linhas ?? []) {
    const linhas = t.payload?.[c.quadro] ?? [];
    const rotulo = c.quadro === 'quadro_i' ? 'floor_label' : 'unit_label';
    const linha = linhas.find((r) => r[rotulo] === c.chave);
    if (!linha) {
      erros.push(`${c.quadro}: linha "${c.chave}" não existe`);
      continue;
    }
    for (const [campo, valor] of Object.entries(c.campos)) {
      if (Math.abs(num(linha[campo]) - valor) > TOLERANCIA) {
        erros.push(`${c.quadro} "${c.chave}" ${campo} = ${linha[campo]} ≠ esperado ${valor}`);
      }
    }
  }
  return erros.map((x) => `${nome}: ${x}`);
}

// ── principal ───────────────────────────────────────────────────────────────

const CONTAGEM = `SELECT
  (SELECT count(*) FROM public.area_projects) AS projetos,
  (SELECT count(*) FROM public.area_versions) AS versoes,
  (SELECT count(*) FROM public.area_version_spaces) AS espacos,
  (SELECT count(*) FROM public.area_version_quadro_ii_rows) AS quadro_ii,
  (SELECT count(*) FROM public.area_version_audit_logs) AS auditoria`;

const FUNCOES = `SELECT p.proname AS nome, md5(pg_get_functiondef(p.oid)) AS md5
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname IN ('validate_area_version', 'calculate_area_version')
 ORDER BY 1`;

const filtros = process.argv.slice(2);
const arquivos = readdirSync(dirCasos)
  .filter((f) => f.endsWith('.json'))
  .filter((f) => filtros.length === 0 || filtros.some((x) => f.startsWith(x)))
  .sort();
if (arquivos.length === 0) {
  console.error('nenhum caso encontrado');
  process.exit(1);
}

const antes = consultar(CONTAGEM)[0];
const funcoes = Object.fromEntries(consultar(FUNCOES).map((r) => [r.nome, r.md5]));
console.log(`banco antes: ${JSON.stringify(antes)}`);
console.log(`funções: ${JSON.stringify(funcoes)}`);

const problemas = [];
for (const arq of arquivos) {
  const caminho = join(dirCasos, arq);
  const caso = JSON.parse(readFileSync(caminho, 'utf8'));
  const nome = arq.replace(/\.json$/, '');
  const r = rodar(sqlDoCaso(nome, caso.entrada));
  if (r.status === 0) throw new Error(`${nome}: o bloco TERMINOU SEM EXCEÇÃO — isso não pode acontecer`);
  const t = lerTestemunha(r.stderr);
  caso.testemunha = {
    capturada_em: new Date().toISOString().slice(0, 10),
    funcoes_md5: funcoes,
    validacao_antes: t.validacao_antes,
    calculo: t.calculo,
    fechamentos: fechamentos(t.payload),
    payload: t.payload,
  };
  writeFileSync(caminho, JSON.stringify(caso, null, 2) + '\n');
  const erros = conferirEsperado(nome, caso.esperado, t);
  problemas.push(...erros);
  const f = caso.testemunha.fechamentos;
  console.log(
    `${erros.length ? '✗' : '✓'} ${nome}: ${t.calculo?.status}` +
      (t.calculo?.blocking_errors?.length ? ` [${t.calculo.blocking_errors.map((x) => x.code).join(', ')}]` : '') +
      (f ? ` · Σqii31=${f.soma_qii_31} · Σfrações=${f.soma_fracoes} · Σ‰=${f.soma_milesimos}` : ''),
  );
}

const depois = consultar(CONTAGEM)[0];
console.log(`banco depois: ${JSON.stringify(depois)}`);
rmSync(tmp, { recursive: true, force: true });

if (JSON.stringify(antes) !== JSON.stringify(depois)) {
  console.error('✗ AS TABELAS area_* MUDARAM — investigar antes de qualquer outra coisa');
  process.exit(2);
}
if (problemas.length) {
  console.error(`\n✗ ${problemas.length} divergência(s) contra o esperado:\n  ${problemas.join('\n  ')}`);
  process.exit(1);
}
console.log(`\n✓ ${arquivos.length} caso(s) capturado(s); banco intacto`);
