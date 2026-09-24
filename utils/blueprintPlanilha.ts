/**
 * O quantitativo da planta como PLANILHA — a parte que decide, sem browser.
 *
 * ─── POR QUE UM ARQUIVO PRÓPRIO, E NÃO DENTRO DO SERVICE ────────────────────
 *
 * A mesma razão de `blueprintAreaDeTransferencia` existir: o que entra em cada
 * aba, em que ordem, com que unidade e com quantas casas é REGRA, não
 * interação. Aqui ela é função pura — entra `Quantitativos`, sai matriz de
 * células — e por isso dá para conferir o número por teste em vez de abrindo o
 * arquivo no Excel. O service fica só com o que só ele pode fazer: virar
 * workbook e disparar o download.
 *
 * ─── NÚMERO É NÚMERO, NÃO TEXTO ─────────────────────────────────────────────
 *
 * Toda medida sai como `number` na célula, nunca como string formatada. Uma
 * planilha em que "12,50" é texto não soma, não ordena e não entra em fórmula —
 * e planilha que não soma é a única coisa que ninguém quer receber de um
 * quantitativo. O arredondamento de APRESENTAÇÃO fica na casa decimal do
 * arquivo; o valor guardado é o bruto.
 *
 * ─── A COBERTURA VAI DENTRO ─────────────────────────────────────────────────
 *
 * Primeira aba, antes de qualquer número. É a mesma disciplina do IFC e do DXF
 * (RF-127): o que a planilha NÃO contém é indistinguível do que não existe, e
 * uma planilha de quantitativo é lida como se fosse a lista de compras.
 */

import type { BlueprintModel, Quantitativos } from './blueprintKernel';
import { rotuloCurto } from './blueprintKernel';
import { nomeDoTipoDeAbertura, nomeDoTipoEstrutural } from './blueprintKernel';
import { ROTULO_DA_ORIGEM, type ArmaduraQuantificada } from './blueprintArmadura';
import { ROTULO_DA_CONEXAO, type DisciplinaDeRede, type TipoDePontoEletrico, type TipoDePontoHidraulico } from './blueprintKernel';
import { ROTULO_DA_DISCIPLINA, ROTULO_DO_PONTO_ELETRICO } from './blueprintRede';
import { ROTULO_DO_PONTO_HIDRAULICO } from './blueprintHidraulica';

export type Celula = string | number | null;
export type Aba = { nome: string; linhas: Celula[][] };

/**
 * O que esta planilha representa, e o que não representa.
 *
 * Escrita para quem RECEBE o arquivo. Vale a advertência do módulo inteiro: é
 * estudo preliminar, não projeto executivo.
 */
export const COBERTURA_PLANILHA = [
  'CONTÉM: ambientes (área de eixo e de piso, perímetro, rodapé), paredes (face, volume de alvenaria), aberturas, estrutura de concreto (volume e fôrma por peça), telhado (área REAL e projetada por água) e escadas/rampas (degraus, espelho, piso, pegada e o furo que abrem na laje).',
  'A LAJE já vem DESCONTADA do furo da escada, em área e em volume. O desconto é recalculado a cada leitura — mover a escada corrige o número sozinho.',
  'QUADRO DE ESQUADRIAS: uma linha por tipo (kind, medidas, nome de projeto e item), com quantidade e área total. Portas sem nome aparecem agrupadas por medida. Vão livre fica fora — não há caixilho.',
  'Área de telhado é a da SUPERFÍCIE INCLINADA (área projetada × √(1 + inclinação²)) — a 30% são 4,4% a mais que a planta; a 100%, 41%. É a área real que compra telha.',
  'Área de piso é o contorno RECUADO em meia espessura de parede — não é a área de eixo, e a diferença chega a 9%.',
  'ARMADURA ESQUEMÁTICA (aba "Armadura", quando há estrutura): kg de aço por peça pelos MÍNIMOS da NBR 6118 (barras, estribos ou malha) com um piso por taxa de referência (kg/m³) — hipóteses do estudo. É pré-quantitativo, não detalhamento: sem dobras, sem lista de barras, sem esforços. A coluna "Origem" diz se valeu o esquema ou a taxa.',
  'INSTALAÇÕES (abas "Instalações" e "Pontos e conexões", quando há rede, 18/09/2026): tubo por disciplina e DN com o comprimento REAL (prumadas e caimento inclusos), um trecho por linha com caimento em %; pontos hidráulicos e elétricos por classificação; conexões (joelho, tê, luva, redução) DEDUZIDAS dos encontros de trechos mais as lançadas à mão. Eletroduto entra pela bitola.',
  'NÃO CONTÉM preço. Para virar orçamento, use o de-para da aba Orçamento do editor, que trava a unidade do item.',
  'Fôrma de peça estrutural segue a política do módulo: pilar pelo perímetro da seção, viga em duas laterais mais o fundo, laje só o fundo. A borda da laje não entra.',
  'Estudo preliminar assistido; requer validação de profissional habilitado.',
];

/** Duas casas na apresentação; o valor guardado é o bruto do kernel. */
/** Metro do quantitativo -> centimetro, como a tela mostra esquadria (P2.46). */
const cmDeM = (m: number) => Number((m * 100).toFixed(1));

function n2(v: number): number {
  return Math.round(v * 100) / 100;
}

/** Três casas — só para volume, onde a segunda casa já é m³ que se compra. */
function n3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

export interface ContextoPlanilha {
  titulo: string;
  revisao: number;
  hash: string;
  kernelVersion: string;
}

/**
 * As abas da planilha, na ordem em que devem aparecer.
 *
 * ABA SÓ EXISTE SE TIVER LINHA. Uma aba "Estrutura" vazia numa planta sem
 * pilar não é neutra: quem abre lê "esta planta não tem estrutura orçável"
 * quando o correto é "ninguém desenhou estrutura". A ausência da aba diz a
 * mesma coisa sem fingir que houve conferência.
 */
export function abasDoQuantitativo(
  quant: Quantitativos,
  ctx: ContextoPlanilha,
  /** A armadura esquemática, calculada com as hipóteses do estudo. Ausente = sem aba e sem linhas de aço. */
  armadura?: ArmaduraQuantificada | null,
  /** Os parâmetros personalizados das peças (`linhasDeParametros(model)`). Ausente/vazio = sem aba. */
  parametros?: LinhaDeParametro[] | null,
): Aba[] {
  const abas: Aba[] = [];
  const t = quant.totais;

  // ── Capa ────────────────────────────────────────────────────────────────
  abas.push({
    nome: 'Cobertura',
    linhas: [
      ['QUANTITATIVO DA PLANTA'],
      ['Estudo', ctx.titulo],
      ['Versão', ctx.revisao],
      ['Hash do snapshot', ctx.hash],
      ['Kernel', ctx.kernelVersion],
      ['Política de cálculo', quant.policy.version],
      [],
      ['O QUE ESTE ARQUIVO REPRESENTA'],
      ...COBERTURA_PLANILHA.map((i) => [i]),
    ],
  });

  // ── Totais ──────────────────────────────────────────────────────────────
  const totais: Celula[][] = [['Medida', 'Valor', 'Unidade']];
  if (quant.ambientes.length > 0) {
    totais.push(
      ['Área de piso', n2(t.areaPisoM2), 'm²'],
      [`Área de piso com perda (${(quant.policy.perdaRevestimento * 100).toFixed(0)}%)`, n2(t.areaPisoComPerdaM2), 'm²'],
      ['Área construída', n2(t.areaConstruidaM2), 'm²'],
      ['Área de parede (duas faces)', n2(t.areaParedeDuasFacesM2), 'm²'],
      ['Volume de alvenaria', n3(t.volumeAlvenariaM3), 'm³'],
      ['Comprimento de rodapé', n2(t.comprimentoRodapeM), 'm'],
      ['Portas', t.portas, 'un'],
      ['Janelas', t.janelas, 'un'],
      ['Vãos livres', t.vaosLivres, 'un'],
      ['Portas de correr', t.portasDeCorrer, 'un'],
      ['Área de esquadrias', n2(t.areaAberturasM2), 'm²'],
    );
  }
  // Concreto e fôrma SEPARADOS por família — a mesma razão do de-para: são
  // itens de catálogo diferentes, e um total único não compra nada.
  if (quant.estruturas.length > 0) {
    totais.push(
      [],
      ['ESTRUTURA'],
      ['Concreto — pilares', n3(t.volumeConcretoPilarM3), 'm³'],
      ['Concreto — vigas', n3(t.volumeConcretoVigaM3), 'm³'],
      ['Concreto — lajes', n3(t.volumeConcretoLajeM3), 'm³'],
      ['Concreto — fundação', n3(t.volumeConcretoFundacaoM3), 'm³'],
      ['Fôrma — pilares', n2(t.areaFormaPilarM2), 'm²'],
      ['Fôrma — vigas', n2(t.areaFormaVigaM2), 'm²'],
      ['Fôrma — lajes', n2(t.areaFormaLajeM2), 'm²'],
      ['Fôrma — fundação', n2(t.areaFormaFundacaoM2), 'm²'],
      ['Comprimento de vigas', n2(t.comprimentoVigasM), 'm'],
      ['Área de laje', n2(t.areaLajeM2), 'm²'],
      ['Estacas', t.estacas, 'un'],
      ['Estacas — metro perfurado', n2(t.comprimentoEstacasM), 'm'],
      ['Pilares', t.pilares, 'un'],
      ['Blocos de coroamento', t.blocosCoroamento, 'un'],
      ...(armadura
        ? ([
            ['Aço — pilares', n2(armadura.totais.pilarKg), 'kg'],
            ['Aço — vigas', n2(armadura.totais.vigaKg), 'kg'],
            ['Aço — lajes', n2(armadura.totais.lajeKg), 'kg'],
            ['Aço — fundação', n2(armadura.totais.fundacaoKg), 'kg'],
            ['Aço — total (CA-50)', n2(armadura.totais.ca50Kg), 'kg'],
            ['Aço — total (CA-60)', n2(armadura.totais.ca60Kg), 'kg'],
          ] as Celula[][])
        : []),
    );
  }
  // As DUAS áreas, sempre: a real é a que compra, a projetada é a que se
  // confere no desenho — ver `telhado.ts`.
  if (quant.telhados.length > 0) {
    totais.push(
      [],
      ['TELHADO'],
      ['Área de telhado (real, inclinada)', n2(t.areaTelhadoM2), 'm²'],
      ['Área de telhado (projetada em planta)', n2(t.areaTelhadoProjetadaM2), 'm²'],
      ['Águas', t.aguas, 'un'],
    );
  }
  if (quant.escadas.length > 0) {
    totais.push(
      [],
      ['ESCADAS E RAMPAS'],
      ['Pegada em planta', n2(t.areaEscadasM2), 'm²'],
      ['Degraus (espelhos)', t.degraus, 'un'],
      ['Escadas e rampas', t.escadas, 'un'],
    );
  }
  // INSTALAÇÕES (18/09/2026): tubo por disciplina e DN — é assim que se compra —,
  // pontos por classificação e as conexões deduzidas dos encontros.
  const nomeDaDisciplina = (d: string) => ROTULO_DA_DISCIPLINA[d as DisciplinaDeRede] ?? d;
  const nomeDoPonto = (p: { tipo: string; classificacao: string | null }) =>
    p.classificacao
      ? (ROTULO_DO_PONTO_HIDRAULICO[p.classificacao as TipoDePontoHidraulico] ?? ROTULO_DO_PONTO_ELETRICO[p.classificacao as TipoDePontoEletrico] ?? p.classificacao)
      : `${p.tipo} (sem tipo)`;
  if ((t.porBitola ?? []).length > 0 || (t.porTerminal ?? []).length > 0) {
    totais.push([], ['INSTALAÇÕES']);
    for (const b of t.porBitola ?? []) totais.push([`${nomeDaDisciplina(b.disciplina)} DN ${b.bitolaMm}${b.itemCode ? ` · ${b.itemCode}` : ''}`, n2(b.comprimentoM), 'm']);
    for (const p of t.porTerminal ?? []) totais.push([`${nomeDoPonto(p)} · ${nomeDaDisciplina(p.disciplina)}`, p.quantidade, 'un']);
    for (const c of t.porConexao ?? []) totais.push([`${ROTULO_DA_CONEXAO[c.tipo]} DN ${c.bitolaMm}${c.paraMm != null ? `→${c.paraMm}` : ''} · ${nomeDaDisciplina(c.disciplina)}`, c.quantidade, 'un']);
    totais.push(['Rede — comprimento total', n2(t.comprimentoRedeM), 'm']);
  }
  abas.push({ nome: 'Totais', linhas: totais });

  // ── Ambientes ───────────────────────────────────────────────────────────
  if (quant.ambientes.length > 0) {
    abas.push({
      nome: 'Ambientes',
      linhas: [
        ['Ambiente', 'Área de piso (m²)', 'Área de eixo (m²)', 'Piso c/ perda (m²)', 'Perímetro (m)', 'Rodapé (m)', 'Área de rodapé (m²)', 'Pé-direito útil (m)', 'Volume (m³)', 'Fórmula da área de piso'],
        ...quant.ambientes.map((a, i) => [
          a.nome ?? `Ambiente ${i + 1}`,
          n2(a.areaPisoM2),
          n2(a.areaEixoM2),
          n2(a.areaPisoComPerdaM2),
          n2(a.perimetroEixoM),
          n2(a.comprimentoRodapeM),
          n2(a.areaRodapeM2),
          n2(a.peDireitoM ?? 0),
          n2(a.volumeM3 ?? 0),
          a.formulaAreaPiso,
        ]),
      ],
    });
  }

  // ── Paredes ─────────────────────────────────────────────────────────────
  if (quant.paredes.length > 0) {
    abas.push({
      nome: 'Paredes',
      linhas: [
        ['Parede', 'Comprimento (m)', 'Altura (m)', 'Espessura (m)', 'Face bruta (m²)', 'Aberturas (m²)', 'Face líquida (m²)', 'Volume (m³)'],
        ...quant.paredes.map((p) => [
          p.wallId,
          n2(p.comprimentoM),
          n2(p.alturaM),
          n2(p.espessuraM),
          n2(p.areaFaceBrutaM2),
          n2(p.areaAberturasM2),
          n2(p.areaFaceLiquidaM2),
          n3(p.volumeM3),
        ]),
      ],
    });
  }

  // ── Aberturas ───────────────────────────────────────────────────────────
  if (quant.aberturas.length > 0) {
    abas.push({
      nome: 'Aberturas',
      linhas: [
        ['Abertura', 'Tipo', 'Esquadria', 'Item', 'Largura (m)', 'Altura (m)', 'Área (m²)'],
        ...quant.aberturas.map((o) => [
          o.openingId,
          nomeDoTipoDeAbertura(o.tipo),
          o.tipo === 'passage' ? '' : o.nome,
          o.itemCode,
          n2(o.larguraM),
          n2(o.alturaM),
          n2(o.areaM2),
        ]),
      ],
    });
  }

  // ── Quadro de esquadrias ────────────────────────────────────────────────
  //
  // Uma linha por TIPO, com a quantidade: é a forma em que esquadria se orça e
  // se confere. Sai mesmo sem tipo declarado — as portas 80×210 sem nome
  // formam a linha "Porta 800×2100" — porque um quadro que só lista as
  // nomeadas esconde justamente as que faltam nomear.
  if ((quant.totais.porEsquadria ?? []).length > 0) {
    abas.push({
      nome: 'Quadro de esquadrias',
      linhas: [
        // Largura e altura em CENTIMETRO (P2.46): a esquadria se especifica em cm
        // ("porta 80x210"), e o quadro tem de dizer o mesmo que a tela.
        ['Esquadria', 'Tipo', 'Largura (cm)', 'Altura (cm)', 'Quantidade', 'Área total (m²)', 'Item', 'Descrição'],
        ...quant.totais.porEsquadria.map((e) => [
          e.nome,
          nomeDoTipoDeAbertura(e.tipo),
          cmDeM(e.larguraM),
          cmDeM(e.alturaM),
          e.quantidade,
          n2(e.areaM2),
          e.itemCode,
          e.descricao,
        ]),
      ],
    });
  }

  // ── Estrutura ───────────────────────────────────────────────────────────
  if (quant.estruturas.length > 0) {
    abas.push({
      nome: 'Estrutura',
      linhas: [
        ['Rótulo', 'Tipo', 'Comprimento (m)', 'Área em planta (m²)', 'Concreto (m³)', 'Fôrma (m²)', 'Fórmula do volume'],
        ...quant.estruturas.map((e) => [
          // Sem rótulo, o id — é o único identificador que resta, e uma célula
          // vazia deixaria a linha impossível de casar com o desenho.
          e.rotulo || e.structuralId,
          nomeDoTipoEstrutural(e.kind),
          n2(e.comprimentoM),
          n2(e.areaPlantaM2),
          n3(e.volumeConcretoM3),
          n2(e.areaFormaM2),
          e.formula,
        ]),
      ],
    });
  }

  // ── Armadura (esquemática) ──────────────────────────────────────────────
  if (armadura && armadura.pecas.length > 0) {
    abas.push({
      nome: 'Armadura',
      linhas: [
        ['Rótulo', 'Tipo', 'Seção', 'Concreto (m³)', 'Aço (kg)', 'Taxa (kg/m³)', 'CA-50 (kg)', 'CA-60 (kg)', 'Barras (m)', 'Estribos (m)', 'Origem', 'Esquema (mínimos NBR 6118)'],
        ...armadura.pecas.map((p) => [
          p.rotulo || p.structuralId,
          nomeDoTipoEstrutural(p.kind),
          p.secao,
          n3(p.volumeConcretoM3),
          n2(p.kg),
          n2(p.taxaEfetivaKgM3),
          n2(p.kgCa50),
          n2(p.kgCa60),
          n2(p.comprimentoLongitudinalM),
          n2(p.comprimentoTransversalM),
          ROTULO_DA_ORIGEM[p.origem],
          p.descricao,
        ]),
      ],
    });
  }

  // ── Instalações ─────────────────────────────────────────────────────────
  //
  // Um trecho por linha, com o comprimento REAL (a prumada mede a altura; o
  // esgoto com caimento mede a diagonal) e o caimento em % — é o que se confere
  // na prancha e o que separa o tubo que se compra do que se desenhou.
  if (quant.trechos.length > 0) {
    abas.push({
      nome: 'Instalações',
      linhas: [
        ['Trecho', 'Disciplina', 'DN (mm)', 'Item', 'Em planta (m)', 'Real (m)', 'Desnível (m)', 'Caimento (%)', 'Fórmula'],
        ...quant.trechos.map((tr, i) => [
          tr.rotulo || `${nomeDaDisciplina(tr.disciplina)} ${i + 1}`,
          nomeDaDisciplina(tr.disciplina),
          tr.bitolaMm,
          tr.itemCode ?? '',
          n2(tr.comprimentoPlantaM),
          n2(tr.comprimentoM),
          n3(tr.desnivelM),
          tr.comprimentoPlantaM > 0 ? Number(((Math.abs(tr.desnivelM) / tr.comprimentoPlantaM) * 100).toFixed(1)) : '',
          tr.formula,
        ]),
      ],
    });
  }
  if ((t.porTerminal ?? []).length > 0 || (t.porConexao ?? []).length > 0) {
    abas.push({
      nome: 'Pontos e conexões',
      linhas: [
        ['PONTOS'],
        ['Classificação', 'Disciplina', 'Item', 'Quantidade'],
        ...(t.porTerminal ?? []).map((p) => [nomeDoPonto(p), nomeDaDisciplina(p.disciplina), p.itemCode ?? '', p.quantidade]),
        [],
        ['CONEXÕES (deduzidas dos encontros de trechos + lançadas à mão)'],
        ['Conexão', 'Disciplina', 'DN (mm)', 'Reduz para (mm)', 'Quantidade', 'Deduzidas', 'Manuais'],
        ...(t.porConexao ?? []).map((c) => [ROTULO_DA_CONEXAO[c.tipo], nomeDaDisciplina(c.disciplina), c.bitolaMm, c.paraMm ?? '', c.quantidade, c.derivadas, c.manuais]),
      ],
    });
  }

  // ── Telhado ─────────────────────────────────────────────────────────────
  if (quant.telhados.length > 0) {
    abas.push({
      nome: 'Telhado',
      linhas: [
        ['Água', 'Inclinação (%)', 'Inclinação (°)', 'Área real (m²)', 'Área projetada (m²)', 'Beiral (m)', 'Altura máx. (m)', 'Fórmula'],
        ...quant.telhados.map((a, i) => [
          `Água ${i + 1}`,
          a.inclinacaoPct,
          n2(a.inclinacaoGraus),
          n2(a.areaRealM2),
          n2(a.areaProjetadaM2),
          n2(a.comprimentoBeiralM),
          n2(a.alturaMaximaM),
          a.formula,
        ]),
      ],
    });
  }

  // ── Escadas e rampas ────────────────────────────────────────────────────
  //
  // O número de degraus vai na planilha mesmo sendo derivado: é o que se conta
  // para revestir, e é o que se confere contra a prancha.
  if (quant.escadas.length > 0) {
    abas.push({
      nome: 'Escadas',
      linhas: [
        ['Peça', 'Tipo', 'Degraus', 'Espelho (m)', 'Piso (m)', 'Largura (m)', 'Desnível (m)', 'Comprimento (m)', 'Inclinada (m)', 'Inclinação (%)', 'Pegada (m²)', 'Furo na laje (m²)', 'Fórmula'],
        ...quant.escadas.map((e, i) => [
          e.rotulo || `${e.tipo === 'RAMPA' ? 'Rampa' : 'Escada'} ${i + 1}`,
          e.tipo === 'RAMPA' ? 'Rampa' : 'Escada',
          e.degraus,
          Number(e.espelhoM.toFixed(3)),
          Number(e.pisoM.toFixed(3)),
          n2(e.larguraM),
          n2(e.desnivelM),
          n2(e.comprimentoM),
          n2(e.comprimentoInclinadoM),
          Number(e.inclinacaoPct.toFixed(1)),
          n2(e.areaPlantaM2),
          n2(e.areaFuroLajeM2),
          e.formula,
        ]),
      ],
    });
  }

  // ── Parâmetros personalizados (E1.2) ─────────────────────────────────────
  if (parametros && parametros.length > 0) {
    abas.push({
      nome: 'Parâmetros',
      linhas: [
        ['Peça', 'Família', 'Chave', 'Valor', 'Origem'],
        ...parametros.map((l) => [l.peca, l.familia, l.chave, typeof l.valor === 'boolean' ? (l.valor ? 'sim' : 'não') : l.valor, l.origem === 'formula' ? 'fórmula' : 'gravado']),
      ],
    });
  }

  return abas;
}

/** Uma linha por (peça, chave) — a planilha lista o que cada peça afirma. */
export interface LinhaDeParametro {
  peca: string;
  familia: string;
  chave: string;
  valor: string | number | boolean;
  /** Digitado na peça, ou calculado por fórmula da definição (E1.5). */
  origem: 'gravado' | 'formula';
}

/**
 * Os parâmetros personalizados de todas as peças, na ordem do modelo. A peça
 * é nomeada pelo rótulo quando há, senão pelo rótulo curto do uid — o mesmo
 * que o painel de conflitos usa.
 */
const rc = (uid: string | undefined, familia: Parameters<typeof rotuloCurto>[1]) => (uid ? rotuloCurto(uid, familia) : '—');

export function linhasDeParametros(
  model: BlueprintModel,
  /** Os calculados por fórmula, por uid (E1.5) — `parametrosCalculadosDoModelo`. */
  calculados?: ReadonlyMap<string, Record<string, string | number | boolean>>,
  /** Chaves NÃO compartilhadas (P2.5) — ficam de fora da planilha. */
  privadas?: ReadonlySet<string>,
): LinhaDeParametro[] {
  const saida: LinhaDeParametro[] = [];
  const publica = (chave: string) => !privadas?.has(chave);
  const add = (familia: string, peca: string, uid: string, p: Record<string, string | number | boolean> | undefined) => {
    for (const chave of Object.keys(p ?? {}).sort()) if (publica(chave)) saida.push({ peca, familia, chave, valor: p![chave], origem: 'gravado' });
    const calc = calculados?.get(uid);
    for (const chave of Object.keys(calc ?? {}).sort()) if (publica(chave)) saida.push({ peca, familia, chave, valor: calc![chave], origem: 'formula' });
  };
  for (const w of model.walls) add('Parede', rc(w.uid, 'wall'), w.uid, w.parametros);
  for (const o of model.openings) add(nomeDoTipoDeAbertura(o.kind), o.esquadria?.nome || rc(o.uid, 'opening'), o.uid, o.parametros);
  for (const x of model.structures ?? []) add(nomeDoTipoEstrutural(x.kind), x.rotulo || rc(x.uid, 'structural'), x.uid, x.parametros);
  for (const r of model.roofs ?? []) add('Água de telhado', rc(r.uid, 'roof'), r.uid, r.parametros);
  for (const e of model.stairs ?? []) add(e.tipo === 'RAMPA' ? 'Rampa' : 'Escada', e.rotulo || rc(e.uid, 'stair'), e.uid, e.parametros);
  for (const t of model.trechos ?? []) add(`Trecho ${ROTULO_DA_DISCIPLINA[t.disciplina]}`, t.rotulo || rc(t.uid, 'trecho'), t.uid, t.parametros);
  for (const t of model.terminais ?? []) add(`Ponto ${ROTULO_DA_DISCIPLINA[t.disciplina]}`, t.rotulo || rc(t.uid, 'terminal'), t.uid, t.parametros);
  for (const q of model.quadros ?? []) add('Quadro', q.nome || rc(q.uid, 'quadro'), q.uid, q.parametros);
  return saida;
}
