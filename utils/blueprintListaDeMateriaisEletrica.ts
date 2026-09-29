/**
 * A LISTA DE MATERIAIS ELÉTRICOS (E5.2 do roadmap elétrico, 29/09/2026).
 *
 * O quantitativo elétrico que já existe (E0.3 fio/quadro/disjuntor/DR; E2.3
 * fio por tipo e seção; E3 DR, DPS, curva/Icn) no formato de COMPRA: uma
 * linha por item, com quantidade e unidade — em três recortes: o total do
 * desenho, cada quadro e cada pavimento. Nada é calculado aqui: é o mesmo
 * `computeQuantities` do orçamento e da planilha, só arrumado para a prancha.
 */
import { POLITICA_PADRAO, ROTULO_DO_CONDUTOR, computeQuantities, type BlueprintModel, type TipoDePontoEletrico } from './blueprintKernel';
import type { Desenhista } from './blueprintExport';
import { ROTULO_DO_PONTO_ELETRICO } from './blueprintRede';
import { quantitativosPorPavimento } from './blueprintQuantitativosPorPavimento';

type Quant = ReturnType<typeof computeQuantities>;

export interface LinhaDeMaterial {
  grupo: string;
  item: string;
  quantidade: number;
  unidade: 'm' | 'un';
}

export interface MateriaisEletricos {
  totais: LinhaDeMaterial[];
  porQuadro: { nome: string; linhas: LinhaDeMaterial[] }[];
  porPavimento: { nome: string; eletrodutoM: number; condutorM: number; pontos: number }[];
}

const mm2 = (v: number) => String(v).replace('.', ',');
const kA = (v: number) => String(v).replace('.', ',');

function linhasDeDisjuntores(lista: { inA: number | null; curva?: string | null; icnKa?: number | null; quantidade: number }[]): LinhaDeMaterial[] {
  return lista.filter((d) => d.quantidade > 0).map((d) => ({ grupo: 'Proteção', item: `Disjuntor ${d.inA != null ? `${d.inA} A` : '(In não declarado)'}${d.curva ? ` curva ${d.curva}` : ''}${d.icnKa != null ? ` · ${kA(d.icnKa)} kA` : ''}`, quantidade: d.quantidade, unidade: 'un' }));
}
function linhasDeDr(lista: { inA: number | null; idnMa: number; polos: number | null; quantidade: number }[]): LinhaDeMaterial[] {
  return lista.filter((d) => d.quantidade > 0).map((d) => ({ grupo: 'Proteção', item: `DR ${d.inA != null ? `${d.inA} A / ` : ''}${d.idnMa} mA${d.polos ? ` ${d.polos}P` : ''}${d.inA == null ? ' (In não declarado)' : ''}`, quantidade: d.quantidade, unidade: 'un' }));
}

/** A lista inteira; `quant` é recalculado quando não vem. */
export function materiaisEletricos(model: BlueprintModel, quant: Quant = computeQuantities(model, POLITICA_PADRAO)): MateriaisEletricos {
  const t = quant.totais;
  const totais: LinhaDeMaterial[] = [];
  for (const c of t.porCondutor ?? []) if (c.comprimentoM > 0) totais.push({ grupo: 'Condutores', item: `Condutor ${ROTULO_DO_CONDUTOR[c.tipo]}${c.secaoMm2 != null ? ` ${mm2(c.secaoMm2)} mm²` : ' (circuito sem seção)'}`, quantidade: c.comprimentoM, unidade: 'm' });
  for (const b of (t.porBitola ?? []).filter((x) => x.disciplina === 'ELETRICA')) totais.push({ grupo: 'Eletrodutos', item: `Eletroduto Ø${b.bitolaMm}${b.itemCode ? ` · ${b.itemCode}` : ''}`, quantidade: b.comprimentoM, unidade: 'm' });
  for (const c of (t.porConexao ?? []).filter((x) => x.disciplina === 'ELETRICA')) totais.push({ grupo: 'Eletrodutos', item: `Conexão ${c.tipo.toLowerCase()} Ø${c.bitolaMm}`, quantidade: c.quantidade, unidade: 'un' });
  for (const p of (t.porTerminal ?? []).filter((x) => x.disciplina === 'ELETRICA')) totais.push({ grupo: 'Pontos e caixas', item: `${p.classificacao ? (ROTULO_DO_PONTO_ELETRICO[p.classificacao as TipoDePontoEletrico] ?? p.classificacao) : `${p.tipo} (sem tipo)`}${p.itemCode ? ` · ${p.itemCode}` : ''}`, quantidade: p.quantidade, unidade: 'un' });
  if ((t.quadros ?? 0) > 0) totais.push({ grupo: 'Quadros', item: 'Quadro de distribuição', quantidade: t.quadros, unidade: 'un' });
  totais.push(...linhasDeDisjuntores(t.porDisjuntor ?? []));
  totais.push(...linhasDeDr(t.porDR ?? []));
  for (const d of t.porDPS ?? []) if (d.quantidade > 0) totais.push({ grupo: 'Proteção', item: `DPS classe ${d.classe}${d.inKa != null ? ` ${kA(d.inKa)} kA` : ''}${d.upKv != null ? ` Up ${kA(d.upKv)} kV` : ''}`, quantidade: d.quantidade, unidade: 'un' });

  const porQuadro = (t.porQuadro ?? []).map((q) => ({
    nome: q.nome,
    linhas: [
      { grupo: 'Quadro', item: 'Circuitos', quantidade: q.circuitos, unidade: 'un' as const },
      { grupo: 'Quadro', item: 'Pontos', quantidade: q.pontos, unidade: 'un' as const },
      { grupo: 'Quadro', item: 'Eletroduto', quantidade: q.eletrodutoM, unidade: 'm' as const },
      { grupo: 'Quadro', item: 'Condutor', quantidade: q.condutorM, unidade: 'm' as const },
      ...linhasDeDisjuntores(q.porDisjuntor),
      ...linhasDeDr(q.porDR ?? []),
      ...(q.dps ? [{ grupo: 'Proteção', item: q.dps, quantidade: 1, unidade: 'un' as const }] : []),
    ],
  }));
  const porPavimento = quantitativosPorPavimento(model, quant)
    .filter((p) => p.eletrodutoM > 0 || p.condutorM > 0 || p.pontosEletricos > 0)
    .map((p) => ({ nome: p.nome, eletrodutoM: p.eletrodutoM, condutorM: p.condutorM, pontos: p.pontosEletricos }));
  return { totais, porQuadro, porPavimento };
}

const fmt = (v: number, un: 'm' | 'un') => (un === 'm' ? (Math.round(v * 100) / 100).toFixed(2).replace('.', ',') : String(Math.round(v)));

/**
 * Desenha a lista em colunas (item · qtd · un.), fluindo para a coluna
 * seguinte quando a de baixo acaba; devolve quantas linhas escreveu.
 */
export function desenharListaDeMateriaisEletrica(d: Desenhista, model: BlueprintModel, x0: number, y0: number, largura: number, altura: number): number {
  const m = materiaisEletricos(model);
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
    d.texto(x0, y0 + 4, 'Sem instalação elétrica no desenho.', 2.2, COR_FRACA);
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
  for (const q of m.porQuadro) {
    titulo(`QUADRO ${q.nome}`);
    for (const l of q.linhas) linha(l);
  }
  if (m.porPavimento.length) {
    titulo('POR PAVIMENTO');
    for (const p of m.porPavimento) {
      linha({ item: `${p.nome} — eletroduto`, quantidade: p.eletrodutoM, unidade: 'm' });
      linha({ item: `${p.nome} — condutor`, quantidade: p.condutorM, unidade: 'm' });
      linha({ item: `${p.nome} — pontos`, quantidade: p.pontos, unidade: 'un' });
    }
  }
  // A nota logo DEPOIS do conteúdo (no pé da área útil ela encostava no carimbo — visto no harness).
  quebra(PASSO * 2);
  d.texto(x(), y + 2, 'Quantidades do quantitativo do desenho (o mesmo do orçamento): fio pela fiação derivada × comprimento real; perdas e sobras não incluídas.', 1.7, COR_FRACA);
  return escritas;
}
