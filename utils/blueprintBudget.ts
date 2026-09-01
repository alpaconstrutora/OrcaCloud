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
import type { Quantitativos, StructuralKind } from './blueprintKernel';
import {
  nomeDoTipoDeAbertura as nomeDoTipo,
  nomeDoTipoEstrutural,
} from './blueprintKernel';

/** Dimensão física de uma medida. É o que a unidade do item tem que respeitar. */
export type Dimensao = 'M2' | 'M' | 'M3' | 'UN';

/**
 * `EDIFICACAO` é o escopo do TODO — um valor por nível, não por elemento.
 *
 * Existe porque área construída não é atributo de ambiente, de parede nem de
 * abertura: é do contorno externo. Encaixá-la em `AMBIENTE` produziria uma
 * linha por cômodo com o mesmo número repetido, que somaria errado no
 * orçamento.
 */
export type EscopoMedida = 'AMBIENTE' | 'PAREDE' | 'ABERTURA' | 'EDIFICACAO' | 'ESTRUTURA';

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
    id: 'AREA_CONSTRUIDA',
    rotulo: 'Área construída',
    escopo: 'EDIFICACAO',
    dimensao: 'M2',
    descricao:
      'Contorno externo pela FACE das paredes. Maior que a soma dos pisos — ' +
      'entre os cômodos está a alvenaria. É o número de laje e cobertura.',
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

  // ── Estrutura ────────────────────────────────────────────────────────────
  //
  // SEPARADAS POR FAMÍLIA, e não uma medida "volume de concreto" só. Concreto
  // de pilar, de viga, de laje e de fundação são itens de catálogo diferentes:
  // fck diferente, bombeamento diferente, produtividade de lançamento
  // diferente. Um total único forçaria o usuário a mapear tudo para um item só
  // e o orçamento sairia com um número plausível e errado — exatamente o modo
  // de falha que o cabeçalho deste arquivo descreve.
  {
    id: 'VOLUME_CONCRETO_PILAR',
    rotulo: 'Concreto — pilares',
    escopo: 'ESTRUTURA',
    dimensao: 'M3',
    descricao: 'Seção × altura de cada pilar. Seção redonda usa π, não o quadrado envolvente.',
  },
  {
    id: 'VOLUME_CONCRETO_VIGA',
    rotulo: 'Concreto — vigas',
    escopo: 'ESTRUTURA',
    dimensao: 'M3',
    descricao: 'Comprimento do eixo × base × altura da seção. Não inclui viga de fundação.',
  },
  {
    id: 'VOLUME_CONCRETO_LAJE',
    rotulo: 'Concreto — lajes',
    escopo: 'ESTRUTURA',
    dimensao: 'M3',
    descricao: 'Área do contorno desenhado × espessura.',
  },
  {
    id: 'VOLUME_CONCRETO_FUNDACAO',
    rotulo: 'Concreto — fundação',
    escopo: 'ESTRUTURA',
    dimensao: 'M3',
    descricao: 'Estacas, blocos de coroamento e vigas de fundação somados — tudo abaixo do piso.',
  },
  {
    id: 'AREA_FORMA_PILAR',
    rotulo: 'Fôrma — pilares',
    escopo: 'ESTRUTURA',
    dimensao: 'M2',
    descricao: 'Perímetro da seção × altura. Topo e base não são cofrados.',
  },
  {
    id: 'AREA_FORMA_VIGA',
    rotulo: 'Fôrma — vigas',
    escopo: 'ESTRUTURA',
    dimensao: 'M2',
    descricao: 'Duas laterais mais o fundo: (2 × altura + base) × comprimento.',
  },
  {
    id: 'AREA_FORMA_LAJE',
    rotulo: 'Fôrma — lajes',
    escopo: 'ESTRUTURA',
    dimensao: 'M2',
    descricao: 'Só o fundo. A borda depende de onde a laje encosta em viga, e o desenho não diz.',
  },
  {
    id: 'AREA_FORMA_FUNDACAO',
    rotulo: 'Fôrma — fundação',
    escopo: 'ESTRUTURA',
    dimensao: 'M2',
    descricao:
      'Blocos e vigas de fundação. Estaca escavada normalmente não usa fôrma — ' +
      'não mapeie esta medida se for o caso.',
  },
  {
    id: 'COMPRIMENTO_ESTACA',
    rotulo: 'Estacas (metro perfurado)',
    escopo: 'ESTRUTURA',
    dimensao: 'M',
    descricao: 'Profundidade somada. É como a estaca é cotada — por metro, não por volume.',
  },
  {
    id: 'CONTAGEM_PILARES',
    rotulo: 'Pilares (unidades)',
    escopo: 'ESTRUTURA',
    dimensao: 'UN',
    descricao: 'Uma unidade por pilar lançado na planta.',
  },
  {
    id: 'CONTAGEM_ESTACAS',
    rotulo: 'Estacas (unidades)',
    escopo: 'ESTRUTURA',
    dimensao: 'UN',
    descricao: 'Uma unidade por estaca. Serve para mobilização e arrasamento, cotados por peça.',
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
          ? // VÃO LIVRE FICA DE FORA: esquadria é o caixilho que se compra, e um
            // vão sem esquadria não tem o que orçar aqui. Ele já aparece no
            // quantitativo por outro caminho — desconta área de parede e
            // interrompe rodapé.
            quant.aberturas.filter((o) => o.tipo !== 'passage')
          : quant.aberturas.filter((o) => o.tipo === tipo);

      return alvo.map((o) => ({
        ref: o.openingId,
        rotulo: `${nomeDoTipo(o.tipo)} ${o.larguraM.toFixed(2)} × ${o.alturaM.toFixed(2)} m`,
        valor: medidaId === 'AREA_ESQUADRIAS' ? o.areaM2 : 1,
        formula: medidaId === 'AREA_ESQUADRIAS' ? 'largura × altura' : 'contagem',
        variaveis: { larguraM: o.larguraM, alturaM: o.alturaM },
      }));
    }

    case 'VOLUME_CONCRETO_PILAR':
    case 'VOLUME_CONCRETO_VIGA':
    case 'VOLUME_CONCRETO_LAJE':
    case 'VOLUME_CONCRETO_FUNDACAO':
    case 'AREA_FORMA_PILAR':
    case 'AREA_FORMA_VIGA':
    case 'AREA_FORMA_LAJE':
    case 'AREA_FORMA_FUNDACAO':
    case 'COMPRIMENTO_ESTACA':
    case 'CONTAGEM_PILARES':
    case 'CONTAGEM_ESTACAS': {
      const FUNDACAO: StructuralKind[] = ['ESTACA', 'BLOCO_COROAMENTO', 'VIGA_FUNDACAO'];
      const tipos: StructuralKind[] = medidaId.endsWith('_PILAR') || medidaId === 'CONTAGEM_PILARES'
        ? ['PILAR']
        : medidaId.endsWith('_VIGA')
          ? ['VIGA']
          : medidaId.endsWith('_LAJE')
            ? ['LAJE']
            : medidaId.endsWith('_FUNDACAO')
              ? FUNDACAO
              : ['ESTACA'];

      // O FILTRO POR NOME NÃO SE APLICA. Ele existe para recortar ambientes
      // ("só área molhada"), e peça estrutural não tem nome de ambiente — o
      // rótulo dela é "P1", que ninguém filtra por termo. Aplicá-lo aqui
      // esvaziaria a medida em silêncio sempre que houvesse um filtro montado
      // para outra coisa.
      return (quant.estruturas ?? [])
        .filter((e) => tipos.includes(e.kind))
        .map((e) => ({
          ref: e.structuralId,
          rotulo: e.rotulo
            ? `${e.rotulo} · ${nomeDoTipoEstrutural(e.kind)}`
            : nomeDoTipoEstrutural(e.kind),
          valor: medidaId.startsWith('VOLUME_CONCRETO')
            ? e.volumeConcretoM3
            : medidaId.startsWith('AREA_FORMA')
              ? e.areaFormaM2
              : medidaId === 'COMPRIMENTO_ESTACA'
                ? e.comprimentoM
                : 1,
          formula: medidaId.startsWith('CONTAGEM') ? 'contagem' : e.formula,
          variaveis: {
            tipo: nomeDoTipoEstrutural(e.kind),
            rotulo: e.rotulo || e.structuralId,
            comprimentoM: e.comprimentoM,
            volumeConcretoM3: e.volumeConcretoM3,
            areaFormaM2: e.areaFormaM2,
          },
        }));
    }

    case 'AREA_CONSTRUIDA': {
      // UMA linha só: o escopo é a edificação, não o elemento. O filtro por
      // nome não se aplica — não há nome de elemento para casar.
      if (quant.totais.areaConstruidaM2 <= 0) return [];
      return [
        {
          ref: 'edificacao',
          rotulo: 'Edificação',
          valor: quant.totais.areaConstruidaM2,
          formula: 'contorno externo expandido em meia espessura de parede',
          variaveis: { areaConstruidaM2: quant.totais.areaConstruidaM2 },
        },
      ];
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
 * Linhas de orçamento a partir das CAMADAS DE PAREDE — a ponte direta.
 *
 * ─── POR QUE ESTA NÃO PASSA PELO DE-PARA ────────────────────────────────────
 *
 * Todas as outras medidas precisam de um mapeamento porque a geometria não sabe
 * qual item comprar: "área de piso" pode virar contrapiso, cerâmica ou laminado,
 * e quem decide é quem orça. Na camada essa pergunta já foi respondida no
 * DESENHO — o usuário escolheu o item ao montar a composição da parede. Exigir
 * que ele repetisse a escolha no de-para seria pedir a mesma informação duas
 * vezes e criar uma segunda fonte da verdade sobre o mesmo material.
 *
 * ⚠️ E é por isso que uma medida `VOLUME_CAMADA` genérica NÃO foi acrescentada
 * ao catálogo `MEDIDAS`. Ela pareceria natural e seria uma armadilha: um
 * mapeamento aponta UMA medida para UM item, então "volume de camada → item X"
 * somaria bloco, reboco e isolamento de todas as paredes num item só. Sairia
 * uma linha com número plausível e errado — exatamente o desfecho que a trava de
 * unidade no cabeçalho deste arquivo existe para impedir. O de-para continua
 * servindo as medidas do TODO (`VOLUME_ALVENARIA`, `AREA_PAREDE_DUAS_FACES`);
 * a composição vem por aqui.
 *
 * ─── A TRAVA DE UNIDADE VALE IGUAL ──────────────────────────────────────────
 *
 * A camada produz duas grandezas — volume e área de face — e é a UNIDADE do item
 * que decide qual delas vale: m³ leva o volume, m² leva a área. Item cotado em
 * metro linear ou por unidade é RECUSADO com divergência, e não aproximado para
 * a grandeza mais próxima: a mesma disciplina de `gerarLancamentos`.
 *
 * ─── UMA LINHA POR MATERIAL ─────────────────────────────────────────────────
 *
 * Sempre agrupado, nunca por parede. Aqui não há a escolha `TOTAL` ×
 * `POR_ELEMENTO` do de-para porque não há nada a escolher: uma casa tem dezenas
 * de paredes com a mesma composição, e uma linha por parede não é uma lista de
 * compras. O detalhe parede a parede continua no quantitativo, que é onde se
 * confere.
 *
 * Função PURA, como `gerarLancamentos`: recebe os itens já resolvidos.
 */
export function gerarLancamentosDeCamadas(
  quant: Quantitativos,
  itensPorCodigo: Map<string, SinapiItem>,
  ctx: ContextoGeracao,
): ResultadoGeracao {
  const entries: BudgetEntry[] = [];
  const divergencias: Divergencia[] = [];

  const procedencia =
    `Gerado das camadas de parede da planta "${ctx.studyName}", versão ${ctx.revision} ` +
    `(hash ${ctx.snapshotHash.slice(0, 12)}). Política ${quant.policy.version}, ` +
    `kernel ${quant.kernelVersion || '—'}.`;

  for (const m of quant.totais.porMaterial ?? []) {
    // Camada sem material escolhido. Não é erro — desenhar antes de decidir o
    // material é o fluxo normal —, mas some do orçamento, e sumir calado é o que
    // não pode: o volume existe no desenho e não apareceria em lugar nenhum.
    if (!m.itemCode) {
      divergencias.push({
        mapeamentoId: `camada:${m.funcao}`,
        medida: 'CAMADA',
        itemCode: '',
        motivo:
          `${m.volumeM3.toFixed(2)} m³ de camada "${m.funcao}" sem material vinculado. ` +
          `Escolha o item no painel da parede para que ela entre no orçamento.`,
      });
      continue;
    }

    const item = itensPorCodigo.get(m.itemCode);
    if (!item) {
      divergencias.push({
        mapeamentoId: `camada:${m.itemCode}`,
        medida: 'CAMADA',
        itemCode: m.itemCode,
        motivo: `Item ${m.itemCode} não encontrado no catálogo (SINAPI nem base própria).`,
      });
      continue;
    }

    const dim = dimensaoDaUnidade(item.unit);
    if (dim !== 'M3' && dim !== 'M2') {
      divergencias.push({
        mapeamentoId: `camada:${m.itemCode}`,
        medida: 'CAMADA',
        itemCode: m.itemCode,
        motivo:
          `A camada produz volume (M3) ou área de face (M2), mas o item ${m.itemCode} ` +
          `é cotado em "${item.unit}"${dim ? ` (${dim})` : ' (unidade não reconhecida)'}. ` +
          `Nenhuma linha foi gerada — o número sairia plausível e errado.`,
      });
      continue;
    }

    const valor = dim === 'M3' ? m.volumeM3 : m.areaFaceM2;
    if (valor <= 0) continue;

    entries.push({
      // Determinístico e sob o prefixo do estudo, para `aplicarNoOrcamento`
      // SUBSTITUIR em vez de empilhar quando a planta for republicada. A função
      // entra na chave porque ela entra no agrupamento: duas camadas com o mesmo
      // código e funções diferentes são duas linhas, e dois ids iguais fariam
      // uma sumir.
      id: `bp:${ctx.studyId}:camada:${m.itemCode}:${m.funcao}`,
      sinapiItem: item,
      quantity: valor,
      phase: '',
      group: 'Camadas de parede',
      discipline: 'Planta Inteligente',
      notes: procedencia,
      calculationMemory: {
        formula:
          dim === 'M3'
            ? 'Σ (área de face líquida × espessura da camada), por parede'
            : 'Σ (área de face líquida), por parede',
        variables: {
          material: m.descricao || m.itemCode,
          funcao: m.funcao,
          volumeM3: m.volumeM3,
          areaFaceM2: m.areaFaceM2,
          snapshot: ctx.snapshotId,
        },
        result: valor,
        justification: procedencia,
      },
    });
  }

  return { entries, divergencias };
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
