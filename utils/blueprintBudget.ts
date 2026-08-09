/**
 * RF-122 — de-para entre a geometria e o orçamento.
 *
 * É o último trecho do caminho que faz a planta valer alguma coisa: sem ele o
 * quantitativo fica bonito numa tela que ninguém usa para comprar material.
 *
 * ─── A TRAVA QUE JUSTIFICA O MÓDULO: A UNIDADE ──────────────────────────────
 *
 * O erro perigoso aqui não é o de-para vazio — esse aparece na hora. É o de-para
 * ERRADO: apontar a área de piso (m²) para um item cotado por metro linear
 * (rodapé). Nada quebra, nenhuma tela reclama, e sai uma linha de orçamento com
 * número plausível e errado por um fator de 4 ou 5. Só se descobre na obra.
 *
 * Por isso cada medida declara a DIMENSÃO que produz, e um mapeamento cuja
 * unidade do item não bate é **recusado**, não gerado com aviso. Aviso se ignora;
 * linha que não existe, não.
 *
 * ─── PROCEDÊNCIA (RF-121 → §22.1) ───────────────────────────────────────────
 *
 * Toda linha gerada carrega `calculationMemory` com a fórmula que produziu o
 * número, as variáveis de entrada e a versão publicada que a originou. Número de
 * orçamento sem procedência não pode ser conferido, e o PRD exige que a
 * importação continue ligada ao snapshot.
 *
 * ─── REENVIAR NÃO PODE DUPLICAR ─────────────────────────────────────────────
 *
 * O id de cada linha é determinístico e prefixado por estudo. Regerar a partir
 * de uma versão nova SUBSTITUI as linhas daquela planta em vez de empilhar —
 * é a disciplina do CA-08 aplicada na fronteira do orçamento.
 */

import type { BudgetEntry, SinapiItem } from '../types/budget';
import type { Quantitativos } from './blueprintKernel';

/** Dimensão física de uma medida. É o que a unidade do item tem que respeitar. */
export type Dimensao = 'M2' | 'M' | 'M3' | 'UN';

export type EscopoMedida = 'AMBIENTE' | 'PAREDE' | 'ABERTURA';

export interface DefinicaoMedida {
  id: string;
  rotulo: string;
  escopo: EscopoMedida;
  dimensao: Dimensao;
  /** Ajuda a escolher: diz o que a medida É, não como se chama. */
  descricao: string;
}

/**
 * Catálogo de medidas que a geometria sabe produzir.
 *
 * Deliberadamente fechado: o de-para escolhe DENTRE estas, e não uma expressão
 * livre sobre o payload. Expressão livre traria de volta exatamente o problema
 * que a trava de unidade resolve — daria para escrever qualquer coisa e o
 * sistema não teria como saber o que ela significa.
 */
export const MEDIDAS: DefinicaoMedida[] = [
  {
    id: 'AREA_PISO',
    rotulo: 'Área de piso',
    escopo: 'AMBIENTE',
    dimensao: 'M2',
    descricao: 'Contorno recuado em meia espessura de parede. NÃO é a área de eixo.',
  },
  {
    id: 'AREA_PISO_COM_PERDA',
    rotulo: 'Área de piso com perda',
    escopo: 'AMBIENTE',
    dimensao: 'M2',
    descricao: 'Área de piso acrescida da perda da política. Para compra, não para projeto.',
  },
  {
    id: 'COMPRIMENTO_RODAPE',
    rotulo: 'Comprimento de rodapé',
    escopo: 'AMBIENTE',
    dimensao: 'M',
    descricao: 'Perímetro menos os vãos de porta. Janela não interrompe rodapé.',
  },
  {
    id: 'AREA_RODAPE',
    rotulo: 'Área de rodapé',
    escopo: 'AMBIENTE',
    dimensao: 'M2',
    descricao: 'Comprimento de rodapé × altura da política.',
  },
  {
    id: 'PERIMETRO',
    rotulo: 'Perímetro do ambiente',
    escopo: 'AMBIENTE',
    dimensao: 'M',
    descricao: 'Perímetro de eixo, sem desconto de vão.',
  },
  {
    id: 'AREA_PAREDE_UMA_FACE',
    rotulo: 'Área de parede (uma face)',
    escopo: 'PAREDE',
    dimensao: 'M2',
    descricao: 'Face líquida, já descontadas as aberturas.',
  },
  {
    id: 'AREA_PAREDE_DUAS_FACES',
    rotulo: 'Área de parede (duas faces)',
    escopo: 'PAREDE',
    dimensao: 'M2',
    descricao: 'O que se reveste e se pinta dos dois lados. Uma face subestima pela metade.',
  },
  {
    id: 'COMPRIMENTO_PAREDE',
    rotulo: 'Comprimento de parede',
    escopo: 'PAREDE',
    dimensao: 'M',
    descricao: 'Eixo a eixo. Serve para verga, contraverga e cinta.',
  },
  {
    id: 'VOLUME_ALVENARIA',
    rotulo: 'Volume de alvenaria',
    escopo: 'PAREDE',
    dimensao: 'M3',
    descricao: 'Face líquida × espessura. O vazio das aberturas já saiu.',
  },
  {
    id: 'CONTAGEM_PORTAS',
    rotulo: 'Portas (unidades)',
    escopo: 'ABERTURA',
    dimensao: 'UN',
    descricao: 'Uma unidade por porta lançada na planta.',
  },
  {
    id: 'CONTAGEM_JANELAS',
    rotulo: 'Janelas (unidades)',
    escopo: 'ABERTURA',
    dimensao: 'UN',
    descricao: 'Uma unidade por janela lançada na planta.',
  },
  {
    id: 'AREA_ESQUADRIAS',
    rotulo: 'Área de esquadrias',
    escopo: 'ABERTURA',
    dimensao: 'M2',
    descricao: 'Largura × altura de cada abertura.',
  },
];

export const MEDIDA_POR_ID = new Map(MEDIDAS.map((m) => [m.id, m]));

/** Uma linha do de-para. Configuração da organização — mutável, versionada não. */
export interface MapeamentoOrcamento {
  id: string;
  organization_id: string;
  /** Id de `MEDIDAS`. */
  medida: string;
  /** Código no catálogo — SINAPI ou base própria, é o mesmo espaço de códigos. */
  item_code: string;
  /** Onde a linha cai na EAP do orçamento. */
  phase: string;
  budget_group: string;
  /**
   * `TOTAL` soma tudo numa linha; `POR_ELEMENTO` gera uma por ambiente/parede.
   *
   * Não há default óbvio: por elemento preserva a medição por ambiente e o
   * `location.room` do orçamento, mas uma planta de 40 ambientes × 3 medidas
   * vira 120 linhas. Quem monta o orçamento decide, mapeamento a mapeamento.
   */
  agrupamento: 'TOTAL' | 'POR_ELEMENTO';
  /**
   * Opcional: só aplica a ambientes cujo nome contenha um destes termos.
   * Existe porque revestimento de parede é de área molhada, não da casa inteira.
   * Vazio = todos.
   */
  filtro_ambiente: string[];
  active: boolean;
}

/** Mapeamento com o item já resolvido no catálogo. */
export interface MapeamentoResolvido {
  mapeamento: MapeamentoOrcamento;
  item: SinapiItem | null;
}

export interface Divergencia {
  mapeamentoId: string;
  medida: string;
  itemCode: string;
  motivo: string;
}

export interface ResultadoGeracao {
  entries: BudgetEntry[];
  divergencias: Divergencia[];
}

/**
 * Normaliza a unidade escrita no catálogo para uma dimensão.
 *
 * O SINAPI é irregular: 'M2', 'M²', 'm2', 'UN', 'UND', 'VB'. Comparar string
 * crua reprovaria mapeamento correto, o que empurraria o usuário a desligar a
 * trava — e uma trava desligada é pior do que trava nenhuma, porque dá a
 * impressão de que alguém conferiu.
 */
export function dimensaoDaUnidade(unidade: string | undefined | null): Dimensao | null {
  if (!unidade) return null;
  const u = unidade
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[\s.]/g, '');

  if (['M2', 'M²', 'MT2', 'METROQUADRADO'].includes(u)) return 'M2';
  if (['M3', 'M³', 'MT3', 'METROCUBICO'].includes(u)) return 'M3';
  if (['M', 'ML', 'MT', 'METRO', 'METROLINEAR'].includes(u)) return 'M';
  if (['UN', 'UND', 'UNID', 'UNIDADE', 'PC', 'PÇ', 'CJ', 'CONJ'].includes(u)) return 'UN';
  return null;
}

interface ValorMedido {
  /** Identificador estável do elemento — entra no id da linha. */
  ref: string;
  /** Nome legível para `location.room` e para a memória de cálculo. */
  rotulo: string;
  valor: number;
  formula?: string;
  variaveis: Record<string, number | string>;
}

/** Extrai da leitura do quantitativo os valores de uma medida, elemento a elemento. */
function medir(quant: Quantitativos, medidaId: string, filtro: string[]): ValorMedido[] {
  const combina = (nome: string | undefined) => {
    if (filtro.length === 0) return true;
    const n = (nome ?? '').toLowerCase();
    return filtro.some((f) => n.includes(f.trim().toLowerCase()));
  };

  switch (medidaId) {
    case 'AREA_PISO':
    case 'AREA_PISO_COM_PERDA':
    case 'COMPRIMENTO_RODAPE':
    case 'AREA_RODAPE':
    case 'PERIMETRO':
      return quant.ambientes
        .filter((a) => combina(a.nome))
        .map((a) => ({
          ref: a.spaceId,
          rotulo: a.nome ?? 'Ambiente sem nome',
          valor:
            medidaId === 'AREA_PISO' ? a.areaPisoM2
              : medidaId === 'AREA_PISO_COM_PERDA' ? a.areaPisoComPerdaM2
              : medidaId === 'COMPRIMENTO_RODAPE' ? a.comprimentoRodapeM
              : medidaId === 'AREA_RODAPE' ? a.areaRodapeM2
              : a.perimetroEixoM,
          formula: a.formulaAreaPiso,
          variaveis: {
            ambiente: a.nome ?? a.spaceId,
            areaEixoM2: a.areaEixoM2,
            areaPisoM2: a.areaPisoM2,
            perimetroEixoM: a.perimetroEixoM,
          },
        }));

    case 'AREA_PAREDE_UMA_FACE':
    case 'AREA_PAREDE_DUAS_FACES':
    case 'COMPRIMENTO_PAREDE':
    case 'VOLUME_ALVENARIA':
      return quant.paredes.map((p) => ({
        ref: p.wallId,
        rotulo: `Parede ${p.comprimentoM.toFixed(2)} m`,
        valor:
          medidaId === 'AREA_PAREDE_UMA_FACE' ? p.areaFaceLiquidaM2
            : medidaId === 'AREA_PAREDE_DUAS_FACES' ? p.areaFaceLiquidaM2 * 2
            : medidaId === 'COMPRIMENTO_PAREDE' ? p.comprimentoM
            : p.volumeM3,
        formula:
          medidaId === 'VOLUME_ALVENARIA'
            ? '(comprimento × altura − aberturas) × espessura'
            : 'comprimento × altura − aberturas',
        variaveis: {
          comprimentoM: p.comprimentoM,
          alturaM: p.alturaM,
          espessuraM: p.espessuraM,
          areaAberturasM2: p.areaAberturasM2,
        },
      }));

    case 'CONTAGEM_PORTAS':
    case 'CONTAGEM_JANELAS':
    case 'AREA_ESQUADRIAS': {
      const tipo = medidaId === 'CONTAGEM_PORTAS' ? 'door' : 'window';
      const alvo =
        medidaId === 'AREA_ESQUADRIAS'
          ? quant.aberturas
          : quant.aberturas.filter((o) => o.tipo === tipo);

      return alvo.map((o) => ({
        ref: o.openingId,
        rotulo: `${o.tipo === 'door' ? 'Porta' : 'Janela'} ${o.larguraM.toFixed(2)} × ${o.alturaM.toFixed(2)} m`,
        valor: medidaId === 'AREA_ESQUADRIAS' ? o.areaM2 : 1,
        formula: medidaId === 'AREA_ESQUADRIAS' ? 'largura × altura' : 'contagem',
        variaveis: { larguraM: o.larguraM, alturaM: o.alturaM },
      }));
    }

    default:
      return [];
  }
}

export interface ContextoGeracao {
  studyId: string;
  studyName: string;
  snapshotId: string;
  snapshotHash: string;
  revision: number;
}

/**
 * Gera as linhas de orçamento a partir de um quantitativo e do de-para.
 *
 * Função PURA: recebe o quantitativo e os itens já resolvidos, devolve linhas e
 * divergências. Não fala com o banco, o que é o que a torna testável — o erro
 * que interessa (unidade incompatível, medida inexistente) não precisa de rede
 * para aparecer.
 */
export function gerarLancamentos(
  quant: Quantitativos,
  resolvidos: MapeamentoResolvido[],
  ctx: ContextoGeracao,
): ResultadoGeracao {
  const entries: BudgetEntry[] = [];
  const divergencias: Divergencia[] = [];

  const procedencia =
    `Gerado da planta "${ctx.studyName}", versão ${ctx.revision} ` +
    `(hash ${ctx.snapshotHash.slice(0, 12)}). Política ${quant.policy.version}, ` +
    `kernel ${quant.kernelVersion || '—'}.`;

  for (const { mapeamento: m, item } of resolvidos) {
    if (!m.active) continue;

    const def = MEDIDA_POR_ID.get(m.medida);
    if (!def) {
      divergencias.push({
        mapeamentoId: m.id,
        medida: m.medida,
        itemCode: m.item_code,
        motivo: `Medida "${m.medida}" não existe no catálogo de medidas.`,
      });
      continue;
    }

    if (!item) {
      divergencias.push({
        mapeamentoId: m.id,
        medida: m.medida,
        itemCode: m.item_code,
        motivo: `Item ${m.item_code} não encontrado no catálogo (SINAPI nem base própria).`,
      });
      continue;
    }

    // A TRAVA. Recusa, não avisa.
    const dimItem = dimensaoDaUnidade(item.unit);
    if (dimItem !== def.dimensao) {
      divergencias.push({
        mapeamentoId: m.id,
        medida: m.medida,
        itemCode: m.item_code,
        motivo:
          `"${def.rotulo}" produz ${def.dimensao}, mas o item ${m.item_code} é cotado ` +
          `em "${item.unit}"${dimItem ? ` (${dimItem})` : ' (unidade não reconhecida)'}. ` +
          `Nenhuma linha foi gerada — o número sairia plausível e errado.`,
      });
      continue;
    }

    const medidos = medir(quant, m.medida, m.filtro_ambiente ?? []);
    if (medidos.length === 0) continue;

    const base = {
      sinapiItem: item,
      phase: m.phase,
      group: m.budget_group,
      discipline: 'Planta Inteligente',
    };

    if (m.agrupamento === 'TOTAL') {
      const total = medidos.reduce((s, v) => s + v.valor, 0);
      entries.push({
        ...base,
        id: `bp:${ctx.studyId}:${m.id}:total`,
        quantity: total,
        notes: procedencia,
        calculationMemory: {
          formula: medidos[0].formula,
          variables: {
            medida: def.rotulo,
            elementos: medidos.length,
            snapshot: ctx.snapshotId,
          },
          result: total,
          justification: procedencia,
        },
      });
    } else {
      for (const v of medidos) {
        entries.push({
          ...base,
          id: `bp:${ctx.studyId}:${m.id}:${v.ref}`,
          quantity: v.valor,
          location: { room: v.rotulo },
          notes: procedencia,
          calculationMemory: {
            formula: v.formula,
            variables: { ...v.variaveis, medida: def.rotulo, snapshot: ctx.snapshotId },
            result: v.valor,
            justification: procedencia,
          },
        });
      }
    }
  }

  return { entries, divergencias };
}

/** Prefixo que marca uma linha como originada de uma planta. */
export function prefixoDoEstudo(studyId: string): string {
  return `bp:${studyId}:`;
}

/**
 * Aplica as linhas geradas sobre um orçamento existente.
 *
 * SUBSTITUI as linhas da mesma planta em vez de empilhar. Regerar depois de
 * publicar uma versão nova é a operação normal — se ela duplicasse, o orçamento
 * dobraria em silêncio a cada revisão, que é o pior desfecho possível para um
 * módulo cujo propósito é dar confiança no número.
 *
 * Linha de outra origem (digitada à mão, importada de outro lugar) não é tocada.
 */
export function aplicarNoOrcamento(
  orcamentoAtual: BudgetEntry[],
  novas: BudgetEntry[],
  studyId: string,
): { budget: BudgetEntry[]; removidas: number; adicionadas: number } {
  const prefixo = prefixoDoEstudo(studyId);
  const preservadas = orcamentoAtual.filter((e) => !String(e.id).startsWith(prefixo));

  return {
    budget: [...preservadas, ...novas],
    removidas: orcamentoAtual.length - preservadas.length,
    adicionadas: novas.length,
  };
}
