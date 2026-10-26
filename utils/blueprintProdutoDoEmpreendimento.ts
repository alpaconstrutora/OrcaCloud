// utils/blueprintProdutoDoEmpreendimento.ts
//
// O PRODUTO do Estudo de Massa a partir das Torres & Unidades do Empreendimento — o caminho de volta da ponte
// Massa → Empreendimento (`services/massaEmpreendimentoSync.ts`). Pedido de 25/10/2026: "incorporação > planta
// inteligente: construir através dos dados importador de incorporação > empreendimento". Plano:
// docs/planos/2026-10-25-planta-construir-pelo-empreendimento.md.
//
// Puro: a tela só repassa. Nada aqui é chute — o que falta na unidade fica de fora e é dito:
//  - unidade com `blueprint_massa_chave` nasceu da PRÓPRIA massa (placeholder do sync) — trazê-la de volta seria laço;
//  - unidade com `blueprint_lote_uid` é lote do loteamento, não tipologia de edifício;
//  - tipologia sem nenhuma área privativa não entra no mix (área 0 não reparte), mas a unidade conta na meta.
// Padrão, hipóteses e financeiro são do produto ATUAL: o Empreendimento não tem padrão CUB; só muda quando a
// tipologia o nomeia ("R8-B") e todas concordam.

import type { EmpreendimentoTower, EmpreendimentoUnit } from '../types/empreendimento';
import { PADROES_DO_PRODUTO, type PadraoDoProduto, type Produto, type TipologiaDoProduto, type UsoDaTipologia } from './blueprintProduto';

export type UnidadeParaOProduto = Pick<EmpreendimentoUnit, 'name'> &
  Partial<Pick<EmpreendimentoUnit, 'typology' | 'private_area' | 'bedrooms' | 'parking_spaces' | 'price' | 'blueprint_massa_chave' | 'blueprint_lote_uid'>>;

export type TorreParaOProduto = Pick<EmpreendimentoTower, 'name'> &
  Partial<Pick<EmpreendimentoTower, 'floors_count' | 'units_per_floor' | 'blueprint_bloco_uid' | 'blueprint_quadra_uid'>> & { units?: UnidadeParaOProduto[] };

export interface ImportacaoDoProduto {
  /** O produto montado; `null` = nada a importar (o `motivo` diz por quê). */
  produto: Produto | null;
  motivo: string | null;
  avisos: string[];
}

/** Mesmo limite do campo da tabela de tipologias (`maxLength={40}` em TelaProduto). */
const NOME_MAX = 40;
const COMERCIAL = /\b(sala|loja|comercial)/i;

const positivo = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;
const naoNegativo = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const arred = (v: number, casas: number) => Math.round(v * 10 ** casas) / 10 ** casas;
const media = (xs: number[]) => (xs.length > 0 ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
const chaveDe = (texto: string) => texto.trim().toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

function moda(xs: number[]): number {
  const conta = new Map<number, number>();
  for (const x of xs) conta.set(x, (conta.get(x) ?? 0) + 1);
  let melhor = 0;
  let vezes = 0;
  for (const [x, n] of conta) if (n > vezes) [melhor, vezes] = [x, n];
  return melhor;
}

/** O grupo da unidade: a tipologia escrita; sem ela, "Loja"/"Sala" pelo nome ou "N dorm." pelos dormitórios. */
function grupoDaUnidade(u: UnidadeParaOProduto): { nome: string; uso: UsoDaTipologia } {
  const tipologia = (u.typology ?? '').trim();
  if (tipologia) return { nome: tipologia, uso: COMERCIAL.test(tipologia) ? 'COMERCIAL' : 'RESIDENCIAL' };
  const palavra = u.name.match(COMERCIAL)?.[1];
  if (palavra) return { nome: palavra.charAt(0).toLocaleUpperCase('pt-BR') + palavra.slice(1).toLocaleLowerCase('pt-BR'), uso: 'COMERCIAL' };
  if (naoNegativo(u.bedrooms)) return { nome: `${u.bedrooms} dorm.`, uso: 'RESIDENCIAL' };
  return { nome: 'Sem tipologia', uso: 'RESIDENCIAL' };
}

/** O padrão CUB que a tipologia nomeia ("Apto R8-B", "r16-a"), se algum. */
function padraoNomeado(texto: string): PadraoDoProduto | null {
  const m = texto.toUpperCase().match(/\b(PIS|PP|R1|R8|R16|CSL8|CSL16|CAL8|GI|RP1Q)(?:-?([BNA]))?\b/);
  if (!m) return null;
  const k = m[2] ? `${m[1]}-${m[2]}` : m[1];
  return (PADROES_DO_PRODUTO as readonly string[]).includes(k) ? (k as PadraoDoProduto) : null;
}

export function produtoDoEmpreendimento(torres: TorreParaOProduto[], atual: Produto): ImportacaoDoProduto {
  const avisos: string[] = [];
  let daMassa = 0;
  let lotes = 0;
  let pelaContagem = 0;
  const validas: UnidadeParaOProduto[] = [];

  for (const t of torres) {
    const unidades = t.units ?? [];
    for (const u of unidades) {
      if (u.blueprint_massa_chave || t.blueprint_bloco_uid) daMassa++;
      else if (u.blueprint_lote_uid || t.blueprint_quadra_uid) lotes++;
      else validas.push(u);
    }
    // Torre sem unidades cadastradas: a meta sai de andares × unidades por andar (o que a ficha da torre diz).
    if (unidades.length === 0 && !t.blueprint_bloco_uid && !t.blueprint_quadra_uid && positivo(t.floors_count) && positivo(t.units_per_floor)) {
      const n = Math.round(t.floors_count) * Math.round(t.units_per_floor);
      pelaContagem += n;
      avisos.push(`${t.name}: sem unidades cadastradas — ${t.floors_count} pavimentos × ${t.units_per_floor} por pavimento = ${n} na meta, sem tipologia.`);
    }
  }
  if (daMassa > 0) avisos.push(`${plural(daMassa, 'unidade veio', 'unidades vieram')} do próprio Estudo de massa — fora da importação (seria a massa lendo a si mesma).`);
  if (lotes > 0) avisos.push(`${plural(lotes, 'lote', 'lotes')} do loteamento — fora da importação (lote não é tipologia de edifício).`);

  if (validas.length === 0 && pelaContagem === 0) {
    const motivo =
      daMassa > 0 && lotes === 0
        ? 'As unidades do Empreendimento vieram do próprio Estudo de massa — não há tipologia real para importar.'
        : lotes > 0 && daMassa === 0
          ? 'O Empreendimento só tem lotes do loteamento — não há tipologia de edifício para importar.'
          : 'O Empreendimento não tem unidades em Torres & Unidades (nem pavimentos × unidades por pavimento nas torres).';
    return { produto: null, motivo, avisos };
  }

  const metaUnidades = validas.length + pelaContagem;
  if (validas.length === 0) {
    avisos.push('Nenhuma unidade cadastrada: entrou só a meta de unidades; as tipologias atuais ficaram.');
    return { produto: { ...atual, metaUnidades }, motivo: null, avisos };
  }

  // Agrupar pela tipologia (sem diferença de caixa/acento), na ordem em que aparecem.
  const grupos = new Map<string, { nome: string; uso: UsoDaTipologia; unidades: UnidadeParaOProduto[] }>();
  for (const u of validas) {
    const g = grupoDaUnidade(u);
    const chave = `${g.uso}|${chaveDe(g.nome)}`;
    const existente = grupos.get(chave);
    if (existente) existente.unidades.push(u);
    else grupos.set(chave, { ...g, unidades: [u] });
  }

  const tipologias: TipologiaDoProduto[] = [];
  const contagem = new Map<string, number>();
  const padroes = new Set<PadraoDoProduto>();
  for (const g of grupos.values()) {
    const areas = g.unidades.map((u) => u.private_area).filter(positivo);
    if (areas.length === 0) {
      avisos.push(`"${g.nome}": ${plural(g.unidades.length, 'unidade', 'unidades')} sem área privativa — fora do mix (conta na meta).`);
      continue;
    }
    const semArea = g.unidades.length - areas.length;
    if (semArea > 0) avisos.push(`"${g.nome}": ${plural(semArea, 'unidade', 'unidades')} sem área privativa — a área é a média das outras.`);
    const padrao = padraoNomeado(g.nome);
    if (padrao) padroes.add(padrao);
    const precos = g.unidades.filter((u) => positivo(u.price) && positivo(u.private_area)).map((u) => (u.price as number) / (u.private_area as number));
    const id = `e${tipologias.length + 1}`;
    tipologias.push({
      id,
      nome: g.nome.slice(0, NOME_MAX),
      uso: g.uso,
      dormitorios: moda(g.unidades.map((u) => u.bedrooms).filter(naoNegativo)),
      areaPrivativaM2: arred(media(areas)!, 2),
      vagasPorUnidade: arred(media(g.unidades.map((u) => u.parking_spaces).filter(naoNegativo)) ?? 0, 2),
      proporcaoPct: 0,
      precoM2: arred(media(precos) ?? 0, 2),
    });
    contagem.set(id, g.unidades.length);
  }

  // O mix é em número de unidades, por uso (é como `problemasDoProduto` e a distribuição o leem).
  for (const t of tipologias) {
    const doUso = tipologias.filter((x) => x.uso === t.uso).reduce((s, x) => s + (contagem.get(x.id) ?? 0), 0);
    t.proporcaoPct = doUso > 0 ? arred(((contagem.get(t.id) ?? 0) / doUso) * 100, 1) : 0;
  }

  let padrao = atual.padrao;
  if (padroes.size === 1) padrao = [...padroes][0];
  else if (padroes.size > 1) avisos.push(`As tipologias nomeiam mais de um padrão CUB (${[...padroes].join(', ')}) — ficou o padrão atual (${atual.padrao}).`);

  if (tipologias.length === 0) {
    return { produto: null, motivo: 'Nenhuma unidade do Empreendimento tem área privativa — preencha em Torres & Unidades.', avisos };
  }
  return { produto: { ...atual, padrao, tipologias, metaUnidades }, motivo: null, avisos };
}
