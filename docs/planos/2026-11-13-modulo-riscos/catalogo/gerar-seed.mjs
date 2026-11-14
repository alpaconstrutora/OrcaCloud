// Gera a migration de seed do catálogo (F1.2) a partir de catalogo-consolidado.json.
// Rode ANTES o gerar-planilha.mjs (que valida e consolida). Idempotente: upsert por
// (organization_id NULL, codigo) — rodar de novo depois da revisão técnica (F0.5)
// atualiza os textos e o selo `revisao_tecnica` sem duplicar.
// Uso (da raiz da frente): node docs/planos/2026-11-13-modulo-riscos/catalogo/gerar-seed.mjs <arquivo.sql>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const destino = process.argv[2];
if (!destino) { console.error('uso: gerar-seed.mjs <arquivo-de-saida.sql>'); process.exit(1); }

const { categorias, itens } = JSON.parse(fs.readFileSync(path.join(DIR, 'catalogo-consolidado.json'), 'utf8'));
const lit = (s) => (s == null ? 'NULL' : `'${String(s).replace(/'/g, "''")}'`);
const arr = (a) => (a.length ? `ARRAY[${a.map(lit).join(', ')}]::TEXT[]` : `'{}'::TEXT[]`);
const REVISOES = ['rascunho', 'revisado', 'aprovado'];

const out = [];
out.push(`-- Módulo ÒPURA Riscos — F1.2: seed do catálogo do sistema (${categorias.length} categorias, ${itens.length} riscos).`);
out.push('-- GERADO por docs/planos/2026-11-13-modulo-riscos/catalogo/gerar-seed.mjs — não editar à mão;');
out.push('-- corrigir o RXX.json, rodar gerar-planilha.mjs e gerar-seed.mjs de novo.');
out.push('-- Linhas de sistema = organization_id NULL (só leitura para o app). Upsert idempotente.');
out.push("-- Conteúdo em RASCUNHO até a revisão técnica (F0.5): revisao_tecnica = 'rascunho'.");
out.push('');
out.push('INSERT INTO public.risk_categories (organization_id, codigo, nome, ordem) VALUES');
out.push(categorias.map((c, i) => `    (NULL, ${lit(c.codigo)}, ${lit(c.nome)}, ${i + 1})`).join(',\n'));
out.push('ON CONFLICT ON CONSTRAINT risk_categories_org_codigo_uk DO UPDATE SET nome = EXCLUDED.nome, ordem = EXCLUDED.ordem;');
out.push('');
out.push('INSERT INTO public.risk_catalog (organization_id, category_id, codigo, evento, causas, consequencias, controles_preventivos,');
out.push('    controles_resposta, sinais_alerta, dimensoes, fases, tipologias, condicoes_sugestao, integracoes, referencias,');
out.push('    gatilho_critico, gatilho_motivo, revisao_tecnica, created_by)');
out.push('SELECT NULL, c.id, v.codigo, v.evento, v.causas, v.consequencias, v.controles_preventivos, v.controles_resposta,');
out.push('       v.sinais_alerta, v.dimensoes, v.fases, v.tipologias, v.condicoes_sugestao, v.integracoes, v.referencias,');
out.push('       v.gatilho_critico, v.gatilho_motivo, v.revisao_tecnica, NULL');
out.push('FROM (VALUES');
out.push(itens.map((t) => {
  const rev = REVISOES.includes(t.revisao_tecnica) ? t.revisao_tecnica : 'rascunho';
  return `    (${lit(t.categoria)}, ${lit(t.codigo)}, ${lit(t.evento)}, ${arr(t.causas)}, ${arr(t.consequencias)}, ` +
    `${arr(t.controles_preventivos)}, ${arr(t.controles_resposta)}, ${arr(t.sinais_alerta)}, ${arr(t.dimensoes)}, ` +
    `${arr(t.fases)}, ${arr(t.tipologias)}, ${arr(t.condicoes_sugestao)}, ${arr(t.integracoes)}, ${arr(t.referencias)}, ` +
    `${t.gatilho_critico ? 'true' : 'false'}, ${lit(t.gatilho_motivo)}, ${lit(rev)})`;
}).join(',\n'));
out.push(') AS v(categoria, codigo, evento, causas, consequencias, controles_preventivos, controles_resposta, sinais_alerta,');
out.push('        dimensoes, fases, tipologias, condicoes_sugestao, integracoes, referencias, gatilho_critico, gatilho_motivo, revisao_tecnica)');
out.push('JOIN public.risk_categories c ON c.organization_id IS NULL AND c.codigo = v.categoria');
out.push('ON CONFLICT ON CONSTRAINT risk_catalog_org_codigo_uk DO UPDATE SET');
out.push('    category_id = EXCLUDED.category_id, evento = EXCLUDED.evento, causas = EXCLUDED.causas,');
out.push('    consequencias = EXCLUDED.consequencias, controles_preventivos = EXCLUDED.controles_preventivos,');
out.push('    controles_resposta = EXCLUDED.controles_resposta, sinais_alerta = EXCLUDED.sinais_alerta,');
out.push('    dimensoes = EXCLUDED.dimensoes, fases = EXCLUDED.fases, tipologias = EXCLUDED.tipologias,');
out.push('    condicoes_sugestao = EXCLUDED.condicoes_sugestao, integracoes = EXCLUDED.integracoes,');
out.push('    referencias = EXCLUDED.referencias, gatilho_critico = EXCLUDED.gatilho_critico,');
out.push('    gatilho_motivo = EXCLUDED.gatilho_motivo, revisao_tecnica = EXCLUDED.revisao_tecnica;');
out.push('');
out.push('-- Conferência: deve devolver 25 | 312.');
out.push('SELECT (SELECT count(*) FROM public.risk_categories WHERE organization_id IS NULL) AS categorias,');
out.push('       (SELECT count(*) FROM public.risk_catalog    WHERE organization_id IS NULL) AS riscos;');
fs.writeFileSync(destino, out.join('\n') + '\n');
console.log(`✅ ${destino}: ${categorias.length} categorias, ${itens.length} riscos`);
