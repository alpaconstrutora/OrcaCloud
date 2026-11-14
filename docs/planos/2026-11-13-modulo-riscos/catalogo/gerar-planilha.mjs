// Valida os 25 RXX.json contra eventos-base.tsv e FORMATO.md e gera:
//   - catalogo-consolidado.json  (fonte do seed da F1.2)
//   - catalogo-riscos-revisao.xlsx (planilha para o engenheiro e o técnico de segurança)
// Uso (da raiz da frente): node docs/planos/2026-11-13-modulo-riscos/catalogo/gerar-planilha.mjs
// Sai com código 1 se houver qualquer erro de validação (e não gera nada).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';

const DIR = path.dirname(fileURLToPath(import.meta.url));

const LISTAS = {
  dimensoes: ['financeira', 'prazo', 'seguranca', 'qualidade', 'juridica', 'ambiental', 'reputacional', 'operacional'],
  fases: ['aquisicao', 'viabilidade', 'projeto_aprovacao', 'contratacao', 'inicio_obra', 'fundacoes', 'estrutura', 'instalacoes', 'acabamentos', 'entrega', 'pos_obra'],
  tipologias: ['residencial', 'comercial', 'galpao_industrial', 'loteamento', 'reforma', 'obra_publica'],
  condicoes_sugestao: ['subsolo', 'escavacao_profunda', 'contencao', 'terreno_inclinado', 'nivel_agua_alto', 'proximo_curso_dagua', 'area_ambiental_sensivel', 'vizinhanca_proxima', 'edificacao_ocupada', 'area_urbana_densa', 'estrutura_concreto', 'estrutura_metalica', 'pre_moldado', 'protensao', 'fundacao_profunda', 'grua_ou_guindaste', 'trabalho_em_altura', 'espaco_confinado', 'demolicao', 'edificacao_antiga', 'financiamento_bancario', 'venda_na_planta', 'locacao', 'contrato_publico', 'insumo_importado', 'muitos_terceirizados', 'prazo_curto', 'regiao_chuvosa', 'bim'],
  integracoes: ['planejamento', 'orcamento', 'financeiro', 'dividas', 'suprimentos', 'contratos', 'rh', 'sst', 'garantia_qualidade', 'ordens_servico', 'docs_ged', 'diario', 'comercial', 'locacoes', 'planta_bim', 'imovib', 'investidor', 'fiscal'],
};
const LIMITES = {
  causas: [2, 4], consequencias: [2, 4], controles_preventivos: [3, 5], controles_resposta: [1, 3],
  sinais_alerta: [1, 3], dimensoes: [1, 4], fases: [1, 5], tipologias: [1, 6],
  condicoes_sugestao: [0, 4], integracoes: [0, 4], referencias: [0, 3],
};
const ROTULO = {
  dimensoes: { financeira: 'Financeira', prazo: 'Prazo', seguranca: 'Segurança', qualidade: 'Qualidade', juridica: 'Jurídica', ambiental: 'Ambiental', reputacional: 'Reputacional', operacional: 'Operacional' },
  fases: { aquisicao: 'Aquisição', viabilidade: 'Viabilidade', projeto_aprovacao: 'Projeto e aprovação', contratacao: 'Contratação', inicio_obra: 'Início da obra', fundacoes: 'Fundações', estrutura: 'Estrutura', instalacoes: 'Instalações', acabamentos: 'Acabamentos', entrega: 'Entrega', pos_obra: 'Pós-obra' },
  tipologias: { residencial: 'Residencial', comercial: 'Comercial', galpao_industrial: 'Galpão industrial', loteamento: 'Loteamento', reforma: 'Reforma', obra_publica: 'Obra pública' },
};

// ── eventos-base ──────────────────────────────────────────────────────────────
const base = new Map(); const nomes = new Map(); let cat = null;
fs.readFileSync(path.join(DIR, 'eventos-base.tsv'), 'utf8').split(/\r?\n/).slice(1).forEach((l) => {
  if (!l.trim()) return;
  const [a, b] = l.split('\t');
  if (a.startsWith('#')) { cat = a.slice(1); nomes.set(cat, b); base.set(cat, []); return; }
  base.get(cat).push({ codigo: a, evento: b });
});

// ── validação ─────────────────────────────────────────────────────────────────
const erros = []; const todos = [];
for (const [c, eventos] of base) {
  const arq = path.join(DIR, `${c}.json`);
  if (!fs.existsSync(arq)) { erros.push(`${c}: arquivo ausente`); continue; }
  let j; try { j = JSON.parse(fs.readFileSync(arq, 'utf8')); } catch (e) { erros.push(`${c}: JSON inválido (${e.message})`); continue; }
  if (j.categoria !== c) erros.push(`${c}: categoria = ${j.categoria}`);
  if (j.nome !== nomes.get(c)) erros.push(`${c}: nome difere do eventos-base`);
  if (!Array.isArray(j.itens) || j.itens.length !== eventos.length) { erros.push(`${c}: ${j.itens?.length} itens, esperado ${eventos.length}`); continue; }
  j.itens.forEach((it, i) => {
    const id = it.codigo ?? `${c}[${i}]`;
    if (it.codigo !== eventos[i].codigo) erros.push(`${id}: código fora de ordem (esperado ${eventos[i].codigo})`);
    if (it.evento !== eventos[i].evento) erros.push(`${id}: evento não é cópia literal`);
    for (const [campo, [min, max]] of Object.entries(LIMITES)) {
      const v = it[campo];
      if (!Array.isArray(v)) { erros.push(`${id}: ${campo} ausente`); continue; }
      if (v.length < min || v.length > max) erros.push(`${id}: ${campo} com ${v.length} (limite ${min}–${max})`);
      if (v.some((s) => typeof s !== 'string' || !s.trim())) erros.push(`${id}: ${campo} com texto vazio`);
      if (LISTAS[campo]) v.filter((s) => !LISTAS[campo].includes(s)).forEach((s) => erros.push(`${id}: ${campo} fora da lista: ${s}`));
      if (new Set(v).size !== v.length) erros.push(`${id}: ${campo} repetido`);
    }
    if (typeof it.gatilho_critico !== 'boolean') erros.push(`${id}: gatilho_critico não é boolean`);
    if (it.gatilho_critico && !(typeof it.gatilho_motivo === 'string' && it.gatilho_motivo.trim())) erros.push(`${id}: gatilho sem motivo`);
    if (!it.gatilho_critico && it.gatilho_motivo != null) erros.push(`${id}: motivo sem gatilho`);
    todos.push({ ...it, categoria: c, categoria_nome: nomes.get(c) });
  });
}
const codigos = todos.map((t) => t.codigo);
if (new Set(codigos).size !== codigos.length) erros.push('códigos duplicados');
if (erros.length) { console.error(`❌ ${erros.length} erro(s):\n` + erros.join('\n')); process.exit(1); }

// ── saída 1: consolidado ──────────────────────────────────────────────────────
fs.writeFileSync(path.join(DIR, 'catalogo-consolidado.json'), JSON.stringify({
  fonte: 'ÒPURA Riscos – Especificação funcional (13/11/2026); enriquecimento em RASCUNHO para revisão técnica',
  categorias: [...nomes].map(([codigo, nome]) => ({ codigo, nome, itens: base.get(codigo).length })),
  itens: todos,
}, null, 2) + '\n');

// ── saída 2: planilha ─────────────────────────────────────────────────────────
const lista = (v) => v.map((s) => `• ${s}`).join('\n');
const rot = (campo, v) => v.map((s) => ROTULO[campo]?.[s] ?? s).join(', ');
const revisor = (t) => (t.categoria === 'R14' ? 'Técnico de segurança' : t.gatilho_critico ? 'Engenheiro + Técnico de segurança' : 'Engenheiro');

const wb = new ExcelJS.Workbook();
wb.creator = 'ÒPURA'; wb.created = new Date();

const leia = wb.addWorksheet('Leia-me');
leia.getColumn(1).width = 110;
[
  ['Catálogo de riscos da construção civil — rascunho para revisão técnica', true],
  [''],
  ['O que é: os 312 eventos de risco da especificação "ÒPURA Riscos" (25 categorias), com causas, consequências, controles, sinais de alerta e classificação sugeridos.'],
  ['O texto do EVENTO é o da especificação e não se altera. Todo o resto é rascunho e precisa de validação de profissional habilitado antes de entrar no sistema.'],
  [''],
  ['Como revisar (aba "Catálogo"):', true],
  ['1. A coluna "Revisor" indica quem revisa a linha: Engenheiro, Técnico de segurança (R14), ou os dois (itens marcados como gatilho crítico).'],
  ['2. Preencha "Situação": Aprovado, Aprovado com ajustes ou Reprovado.'],
  ['3. Em "Aprovado com ajustes", escreva a correção em "Texto corrigido" indicando o campo (ex.: "Controles preventivos: trocar o 2º item por …").'],
  ['4. "Gatilho crítico = Sim" faz o risco ser tratado como crítico mesmo com pontuação baixa (morte/lesão grave, colapso, embargo ou responsabilização). Confirme ou derrube.'],
  ['5. "Referências" só cita normas e leis com número e assunto conhecidos; confira a edição vigente.'],
  [''],
  ['As correções voltam para os arquivos do catálogo por script; não renomeie colunas nem mude a ordem das linhas.'],
].forEach(([t, negrito], i) => { const c = leia.getCell(i + 1, 1); c.value = t; c.font = { bold: !!negrito, size: i === 0 ? 14 : 11 }; c.alignment = { wrapText: true }; });

const ws = wb.addWorksheet('Catálogo', { views: [{ state: 'frozen', xSplit: 3, ySplit: 1 }] });
const cols = [
  ['Código', 9], ['Categoria', 22], ['Evento de risco', 34], ['Causas típicas', 42], ['Consequências', 42],
  ['Controles preventivos', 50], ['Controles de resposta', 40], ['Sinais de alerta', 40], ['Dimensões de impacto', 18],
  ['Fases', 20], ['Tipologias', 20], ['Sugerir quando a obra tem', 20], ['Módulos que integram', 20],
  ['Gatilho crítico', 10], ['Motivo do gatilho', 30], ['Referências', 28],
  ['Revisor', 18], ['Situação', 16], ['Comentário do revisor', 36], ['Texto corrigido', 40],
];
ws.columns = cols.map(([header, width]) => ({ header, width }));
todos.forEach((t) => ws.addRow([
  t.codigo, `${t.categoria} ${t.categoria_nome}`, t.evento, lista(t.causas), lista(t.consequencias),
  lista(t.controles_preventivos), lista(t.controles_resposta), lista(t.sinais_alerta),
  rot('dimensoes', t.dimensoes), rot('fases', t.fases), rot('tipologias', t.tipologias),
  t.condicoes_sugestao.join(', '), t.integracoes.join(', '),
  t.gatilho_critico ? 'Sim' : 'Não', t.gatilho_motivo ?? '', t.referencias.join('\n'),
  revisor(t), '', '', '',
]));
const cab = ws.getRow(1);
cab.font = { bold: true, color: { argb: 'FFFFFFFF' } };
cab.alignment = { vertical: 'middle', wrapText: true };
cab.eachCell((c, n) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: n >= 17 ? 'FF7A4B00' : 'FF1B3A5C' } }; });
cab.height = 32;
ws.autoFilter = { from: 'A1', to: { row: 1, column: cols.length } };
for (let r = 2; r <= todos.length + 1; r++) {
  const row = ws.getRow(r);
  row.alignment = { vertical: 'top', wrapText: true };
  row.getCell(18).dataValidation = { type: 'list', allowBlank: true, formulae: ['"Aprovado,Aprovado com ajustes,Reprovado"'] };
  for (let c = 17; c <= 20; c++) row.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF6E5' } };
  if (row.getCell(14).value === 'Sim') row.getCell(14).font = { bold: true, color: { argb: 'FFB00020' } };
}

const res = wb.addWorksheet('Resumo');
res.columns = [{ header: 'Código', width: 9 }, { header: 'Categoria', width: 60 }, { header: 'Riscos', width: 9 }, { header: 'Gatilho crítico', width: 15 }, { header: 'Revisor principal', width: 22 }];
for (const [c, nome] of nomes) {
  const itens = todos.filter((t) => t.categoria === c);
  res.addRow([c, nome, itens.length, itens.filter((t) => t.gatilho_critico).length, c === 'R14' ? 'Técnico de segurança' : 'Engenheiro']);
}
res.addRow(['', 'Total', todos.length, todos.filter((t) => t.gatilho_critico).length, '']);
res.getRow(1).font = { bold: true };
res.getRow(res.rowCount).font = { bold: true };

await wb.xlsx.writeFile(path.join(DIR, 'catalogo-riscos-revisao.xlsx'));
const g = todos.filter((t) => t.gatilho_critico).length;
console.log(`✅ ${nomes.size} categorias, ${todos.length} riscos, ${g} com gatilho crítico → catalogo-consolidado.json + catalogo-riscos-revisao.xlsx`);
