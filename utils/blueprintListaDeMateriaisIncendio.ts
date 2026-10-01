/**
 * A LISTA DE MATERIAIS DE INCÊNDIO (E9.1 do roadmap de incêndio, 01/10/2026).
 * Molde: `blueprintListaDeMateriaisEletrica.ts`.
 *
 * O quantitativo do desenho (o MESMO `computeQuantities` do orçamento e da
 * planilha) no formato de COMPRA: tubos por material × DN, conexões por tipo ×
 * DN, peças por tipo × especificação (quant-1.24.0: extintor por agente ×
 * carga × capacidade, placa pelo código, sprinkler por K × posição) — no total
 * do desenho e por pavimento. Nada é calculado aqui além do recorte por
 * pavimento.
 */
import { POLITICA_PADRAO, ROTULO_DA_CONEXAO, computeQuantities, type BlueprintModel, type TipoDeConexao, type TipoDePontoHidraulico } from './blueprintKernel';
import type { Desenhista } from './blueprintExport';
import { FICHA_DO_PONTO_HIDRAULICO } from './blueprintHidraulica';
import { FICHA_DO_MATERIAL } from './blueprintHidraulicaPressao';
import { ROTULO_DO_AGENTE } from './blueprintExtintores';

type Quant = ReturnType<typeof computeQuantities>;

export interface LinhaDeMaterialDeIncendio {
  grupo: 'Tubulação' | 'Conexões' | 'Combate' | 'Casa de bombas' | 'Preventivos';
  item: string;
  quantidade: number;
  unidade: 'm' | 'un';
  itemCode: string | null;
}

export interface MateriaisDeIncendio {
  totais: LinhaDeMaterialDeIncendio[];
  porPavimento: { nome: string; tuboM: number; pecas: number }[];
}

/** O grupo da lista pelo grupo da ficha (hidrantes e chuveiros · preventivos · o resto é casa de bombas: bombas, válvulas, reservatório). */
const grupoDaPeca = (tipo: string | null): LinhaDeMaterialDeIncendio['grupo'] => {
  const g = (tipo ? FICHA_DO_PONTO_HIDRAULICO[tipo as TipoDePontoHidraulico]?.grupo ?? '' : '').toLowerCase();
  return g.includes('preventivos') || !tipo ? 'Preventivos' : g.includes('hidrantes') ? 'Combate' : 'Casa de bombas';
};

/** A especificação legível: o agente pelo nome (o kernel guarda o código). */
const legivel = (e: string | null) => {
  if (!e) return null;
  return e
    .split(' · ')
    .map((p) => (ROTULO_DO_AGENTE as Record<string, string>)[p] ?? (p === 'PENDENTE' ? 'pendente' : p === 'EM_PE' ? 'em pé' : p === 'LATERAL' ? 'lateral' : p))
    .join(' · ');
};

const ORDEM_DO_GRUPO: LinhaDeMaterialDeIncendio['grupo'][] = ['Tubulação', 'Conexões', 'Combate', 'Casa de bombas', 'Preventivos'];

/** A lista inteira; `quant` é recalculado quando não vem. */
export function materiaisDeIncendio(model: BlueprintModel, quant: Quant = computeQuantities(model, POLITICA_PADRAO)): MateriaisDeIncendio {
  const t = quant.totais;
  const totais: LinhaDeMaterialDeIncendio[] = [];
  for (const b of (t.porBitola ?? []).filter((x) => x.disciplina === 'INCENDIO')) {
    const mat = b.material ? FICHA_DO_MATERIAL[b.material as keyof typeof FICHA_DO_MATERIAL]?.rotulo ?? b.material : 'material não declarado';
    totais.push({ grupo: 'Tubulação', item: `Tubo ${mat} DN ${b.bitolaMm}`, quantidade: b.comprimentoM, unidade: 'm', itemCode: b.itemCode ?? null });
  }
  for (const c of (t.porConexao ?? []).filter((x) => x.disciplina === 'INCENDIO')) {
    totais.push({ grupo: 'Conexões', item: `${ROTULO_DA_CONEXAO[c.tipo as TipoDeConexao] ?? c.tipo} DN ${c.bitolaMm}${c.paraMm != null ? ` × ${c.paraMm}` : ''}`, quantidade: c.quantidade, unidade: 'un', itemCode: null });
  }
  for (const p of (t.porTerminal ?? []).filter((x) => x.disciplina === 'INCENDIO')) {
    const nome = p.classificacao ? FICHA_DO_PONTO_HIDRAULICO[p.classificacao as TipoDePontoHidraulico]?.rotulo ?? p.tipo : `${p.tipo} (sem tipo)`;
    const e = legivel(p.especificacao);
    totais.push({ grupo: grupoDaPeca(p.classificacao), item: e ? `${nome} — ${e}` : nome, quantidade: p.quantidade, unidade: 'un', itemCode: p.itemCode });
  }
  totais.sort((a, b) => ORDEM_DO_GRUPO.indexOf(a.grupo) - ORDEM_DO_GRUPO.indexOf(b.grupo));

  // Por pavimento: o comprimento REAL do quantitativo (não o da planta) e as peças.
  const nivelDoTrecho = new Map((model.trechos ?? []).map((x) => [x.id, x.levelId]));
  const niveis = [...model.levels].sort((a, b) => a.elevationMm - b.elevationMm);
  const porPavimento = niveis
    .map((l) => ({
      nome: l.name,
      tuboM: quant.trechos.filter((q) => q.disciplina === 'INCENDIO' && nivelDoTrecho.get(q.trechoId) === l.id).reduce((s, q) => s + q.comprimentoM, 0),
      pecas: (model.terminais ?? []).filter((x) => x.disciplina === 'INCENDIO' && x.levelId === l.id && x.tipoHidraulico).length,
    }))
    .filter((p) => p.tuboM > 0 || p.pecas > 0);
  return { totais, porPavimento };
}

/** Tem o que listar? (a folha só entra no conjunto com isso) */
export const temMateriaisDeIncendio = (model: BlueprintModel) =>
  (model.trechos ?? []).some((t) => t.disciplina === 'INCENDIO') || (model.terminais ?? []).some((t) => t.disciplina === 'INCENDIO' && t.tipoHidraulico);

const fmt = (v: number, un: 'm' | 'un') => (un === 'm' ? (Math.round(v * 100) / 100).toFixed(2).replace('.', ',') : String(Math.round(v)));

/** A aba do XLSX: as mesmas linhas, com o código de catálogo. */
export function abaDaListaDeMateriaisIncendio(m: MateriaisDeIncendio): { nome: string; linhas: (string | number)[][] } {
  return {
    nome: 'Incêndio — materiais',
    linhas: [
      ['Lista de materiais — incêndio'],
      ['Grupo', 'Item', 'Quantidade', 'Unidade', 'Código'],
      ...m.totais.map((l) => [l.grupo, l.item, Math.round(l.quantidade * 100) / 100, l.unidade, l.itemCode ?? '']),
      [],
      ['Pavimento', 'Tubo (m)', 'Peças (un)'],
      ...m.porPavimento.map((p) => [p.nome, Math.round(p.tuboM * 100) / 100, p.pecas]),
    ],
  };
}

/**
 * Desenha a lista em colunas (item · qtd · un.), fluindo para a coluna
 * seguinte quando a de baixo acaba; devolve quantas linhas escreveu.
 */
export function desenharListaDeMateriaisIncendio(d: Desenhista, model: BlueprintModel, x0: number, y0: number, largura: number, altura: number): number {
  const m = materiaisDeIncendio(model);
  const COR_FRACA = '#555555';
  const PASSO = 3.6;
  const larguraDaColuna = Math.min(125, largura / Math.max(1, Math.floor(largura / 125)));
  let col = 0;
  let y = y0;
  let escritas = 0;
  const x = () => x0 + col * larguraDaColuna;
  const quebra = (h: number) => {
    if (y + h > y0 + altura) {
      col += 1;
      y = y0;
    }
  };
  const titulo = (t: string) => {
    quebra(PASSO * 3);
    y += 2;
    d.texto(x(), y, t, 2.6);
    y += PASSO + 0.6;
    d.texto(x(), y, 'Item', 1.9, COR_FRACA);
    d.texto(x() + larguraDaColuna - 30, y, 'Qtd.', 1.9, COR_FRACA);
    d.texto(x() + larguraDaColuna - 12, y, 'Un.', 1.9, COR_FRACA);
    y += PASSO;
  };
  const linha = (l: { item: string; quantidade: number; unidade: 'm' | 'un' }) => {
    quebra(PASSO);
    d.texto(x(), y, l.item.length > 52 ? `${l.item.slice(0, 51)}…` : l.item, 1.9);
    d.texto(x() + larguraDaColuna - 30, y, fmt(l.quantidade, l.unidade), 1.9);
    d.texto(x() + larguraDaColuna - 12, y, l.unidade, 1.9);
    y += PASSO;
    escritas += 1;
  };
  if (m.totais.length === 0) {
    d.texto(x0, y0 + 4, 'Sem instalação de incêndio no desenho.', 2.2, COR_FRACA);
    return 0;
  }
  titulo('TOTAL DO DESENHO');
  let grupo = '';
  for (const l of m.totais) {
    if (l.grupo !== grupo) {
      quebra(PASSO);
      d.texto(x(), y, l.grupo, 2.0, COR_FRACA);
      y += PASSO;
      grupo = l.grupo;
    }
    linha(l);
  }
  if (m.porPavimento.length) {
    titulo('POR PAVIMENTO');
    for (const p of m.porPavimento) {
      linha({ item: `${p.nome} — tubulação`, quantidade: p.tuboM, unidade: 'm' });
      linha({ item: `${p.nome} — peças`, quantidade: p.pecas, unidade: 'un' });
    }
  }
  quebra(PASSO * 2);
  d.texto(x(), y + 2, 'Quantidades do quantitativo do desenho (o mesmo do orçamento): tubo pelo comprimento real; perdas e sobras não incluídas.', 1.7, COR_FRACA);
  return escritas;
}
