import { ifcGuidDeUid } from './blueprintIfc';
import type { BlueprintModel } from './blueprintKernel';

/**
 * LER um BCF — a metade que faltava, e o receptor que não achamos.
 *
 * ─── DUAS RAZÕES, E AS DUAS VALEM SOZINHAS ──────────────────────────────────
 *
 * 1. **O ciclo fecha.** O projetista responde no Revit e a resposta volta. Sem
 *    isso, a coordenação é um monólogo.
 * 2. **A verificação deixa de depender de terceiro.** O `.bcfzip` que
 *    escrevemos nunca foi aberto por um programa de verdade — os que leem BCF
 *    ou foram descontinuados ou não estavam à mão. Um leitor nosso não é o
 *    mesmo que um receptor de verdade, mas é MUITO melhor que nada, e o defeito
 *    que ele pega é o defeito que existe.
 *
 * ⚠️ **E dois lados meus podem partilhar o mesmo engano** — escrever errado e
 * ler errado do mesmo jeito. Por isso o teste não se contenta com a ida e
 * volta: ele lê também um `markup.bcf` REAL do buildingSMART, e afirma contra
 * os DADOS DE ORIGEM (o conflito que gerou o tópico), que são a terceira fonte.
 *
 * ─── POR QUE UM LEITOR À MÃO, E NÃO UM PARSER DE XML ────────────────────────
 *
 * `DOMParser` não existe no Node, e o formato é pequeno e regular. É a mesma
 * escolha do leitor de DXF. O preço está declarado logo abaixo, em `texto`.
 */

export interface TopicoLido {
  guid: string;
  titulo: string;
  tipo: string;
  status: string;
  autor: string;
  criadoEm: string;
  descricao: string;
  /** O nome do arquivo de viewpoint citado pelo markup, quando há um. */
  viewpoint: string | null;
  /** O IFC que o `Header` declara, quando ele existe. */
  ifcDeclarado: { projeto: string | null; nome: string | null } | null;
}

/**
 * O valor de um atributo, aceitando aspas simples ou duplas.
 *
 * ⚠️ O nome da tag é casado com prefixo de namespace OPCIONAL (`bcf:Topic`).
 * Arquivo de ferramenta de terceiro costuma trazê-lo, e um leitor que só aceite
 * a forma sem prefixo recusa metade do mundo real.
 */
function atributo(xml: string, tag: string, nome: string): string | null {
  const re = new RegExp(`<(?:\\w+:)?${tag}\\b[^>]*?\\b${nome}\\s*=\\s*("[^"]*"|'[^']*')`, 'i');
  const m = re.exec(xml);
  return m ? m[1].slice(1, -1) : null;
}

/**
 * O texto de um elemento simples.
 *
 * ⚠️ O que este leitor NÃO faz, e está declarado: não resolve entidades além
 * das cinco básicas, não lê CDATA e não entende elementos repetidos de mesmo
 * nome em níveis diferentes. Para o BCF, que é raso e regular, isso basta —
 * e fingir que basta para XML em geral seria o erro.
 */
function texto(xml: string, tag: string): string | null {
  const re = new RegExp(`<(?:\\w+:)?${tag}\\b[^>]*>([\\s\\S]*?)</(?:\\w+:)?${tag}>`, 'i');
  const m = re.exec(xml);
  if (!m) return null;
  return m[1]
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();
}

/** Um `markup.bcf` lido. Devolve `null` quando não há tópico nenhum. */
export function lerMarkup(xml: string): TopicoLido | null {
  const guid = atributo(xml, 'Topic', 'Guid');
  if (!guid) return null;

  // O `Header` é opcional. Quando existe, diz a QUAL modelo a pendência se
  // refere — é o que permite ao receptor não casar a pendência com o IFC errado.
  const cabecalho = /<(?:\w+:)?Header\b[\s\S]*?<\/(?:\w+:)?Header>/i.exec(xml)?.[0] ?? null;

  return {
    guid,
    titulo: texto(xml, 'Title') ?? '',
    tipo: atributo(xml, 'Topic', 'TopicType') ?? '',
    status: atributo(xml, 'Topic', 'TopicStatus') ?? '',
    autor: texto(xml, 'CreationAuthor') ?? '',
    criadoEm: texto(xml, 'CreationDate') ?? '',
    descricao: texto(xml, 'Description') ?? '',
    viewpoint: texto(xml, 'Viewpoint'),
    ifcDeclarado: cabecalho
      ? {
          projeto: atributo(cabecalho, 'File', 'IfcProject'),
          nome: texto(cabecalho, 'Filename'),
        }
      : null,
  };
}

/** Os `IfcGuid` selecionados por um `viewpoint.bcfv`. */
export function lerComponentes(xml: string): string[] {
  const re = /<(?:\w+:)?Component\b[^>]*?\bIfcGuid\s*=\s*("[^"]*"|'[^']*')/gi;
  const saida: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) saida.push(m[1].slice(1, -1));
  return saida;
}

export interface PendenciaImportada extends TopicoLido {
  componentes: string[];
  /**
   * Os elementos DESTE desenho que o tópico aponta, por `uid`.
   *
   * ⚠️ Menor que `componentes` quando o BCF fala de peças que este modelo não
   * tem — e isso é normal numa coordenação: o projetista comenta o modelo dele,
   * que inclui coisas que não são nossas.
   */
  uidsCasados: string[];
}

/**
 * Casa os tópicos com os elementos DESTE modelo.
 *
 * ─── ⚠️ O CASAMENTO É PELO CAMINHO DE IDA ───────────────────────────────────
 *
 * `ifcGuidDeUid` não tem inversa prática, então não se traduz o guid de volta:
 * monta-se o mapa `uid → guid` do modelo inteiro e procura-se ali. É mais
 * barato e, sobretudo, usa a MESMA função do exportador — inverter seria
 * reimplementar a compressão e abrir a porta para as duas versões divergirem.
 *
 * ⚠️ Tópico que não casa com nada NÃO é descartado. Ele volta com
 * `uidsCasados: []`, e quem chama decide o que fazer. Sumir com ele esconderia
 * exatamente o caso interessante: a pendência sobre a peça que alguém apagou.
 */
export function casarComModelo(
  topicos: PendenciaImportada[],
  model: BlueprintModel,
): PendenciaImportada[] {
  const porGuid = new Map<string, string>();
  const anotar = (uid: string | undefined) => {
    if (uid) porGuid.set(ifcGuidDeUid(uid), uid);
  };
  for (const w of model.walls) anotar(w.uid);
  for (const o of model.openings) anotar(o.uid);
  for (const s of model.structures) anotar(s.uid);
  for (const t of model.trechos ?? []) anotar(t.uid);
  for (const t of model.terminais ?? []) anotar(t.uid);
  for (const q of model.quadros ?? []) anotar(q.uid);
  for (const r of model.roofs ?? []) anotar(r.uid);
  for (const e of model.stairs ?? []) anotar(e.uid);
  for (const l of model.levels) anotar(l.uid);

  return topicos.map((t) => ({
    ...t,
    uidsCasados: t.componentes.map((g) => porGuid.get(g)).filter((u): u is string => !!u),
  }));
}
