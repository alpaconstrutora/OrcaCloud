/**
 * O MEMORIAL ELÉTRICO EM BLOCOS (E5.3 do roadmap elétrico, 29/09/2026).
 *
 * Dois documentos, derivados do desenho e das hipóteses na hora — antes da
 * emissão, não só nela —, no mesmo formato de blocos do memorial
 * hidrossanitário (`BlocoDoMemorial`), que já sai em PDF (com `paraWinAnsi`) e
 * DOCX pelo `artefatosDoMemorial`:
 *
 *   · DESCRITIVO — objeto, normas, entrada, quadros, circuitos, proteção,
 *     condutores e eletrodutos, aterramento, quantitativos, observações. Os
 *     textos de objeto, execução, aterramento e observações são EDITÁVEIS por
 *     estudo (`hip.textosDoMemorial`); vazios, o padrão/gerado.
 *   · DE CÁLCULO — hipóteses, cada quadro (demanda, alimentador, queda até a
 *     origem) com a tabela dos circuitos (IB, seção, Iz, disjuntor, curva, ΔV)
 *     e a conferência NBR 5410 regra a regra.
 *
 * A emissão com ART (`memorialExecutivoEletrico`) junta a capa de sempre
 * (responsável, base, verificações, declaração) com os dois.
 */
import { KERNEL_VERSION, drsDoQuadro, rotuloDoDPS, rotuloDoDR, snapshotHash, type BlueprintModel } from './blueprintKernel';
import { blocosDasLinhas, type BlocoDoMemorial, type ContextoDoMemorial } from './blueprintMemorialHidro';
import {
  ROTULO_DA_EXPOSICAO,
  fatorDeDiversidade,
  preDimensionarQuadroCompleto,
  textoDoMemorial,
  type HipotesesEletricas,
} from './blueprintEletricaDimensionamento';
import { entradaDoQuadro, padraoDeEntrada, rotuloDaEntrada } from './blueprintEntradaDeEnergia';
import { materiaisEletricos } from './blueprintListaDeMateriaisEletrica';
import { conferirNbr5410 } from './blueprintNbr5410';

const n1 = (v: number) => (Math.round(v * 10) / 10).toFixed(1).replace('.', ',');
const mm2 = (v: number | null | undefined) => (v == null ? '—' : String(v).replace('.', ','));
const dataBr = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');
const qtd = (v: number, un: 'm' | 'un') => (un === 'm' ? (Math.round(v * 100) / 100).toFixed(2).replace('.', ',') : String(Math.round(v)));

function cabecalho(model: BlueprintModel, ctx: ContextoDoMemorial, titulo: string): BlocoDoMemorial[] {
  return [
    { tipo: 'titulo', texto: titulo },
    { tipo: 'paragrafo', texto: `Estudo: ${ctx.nomeDoEstudo}. Gerado em ${dataBr(ctx.geradoEm)}.` },
    {
      tipo: 'paragrafo',
      texto: `Documento derivado do modelo do desenho (base ${snapshotHash(model).slice(0, 16)}, ${KERNEL_VERSION}). Alterado o desenho ou as hipóteses, deve ser gerado de novo. Não substitui a análise e a responsabilidade do profissional habilitado.`,
    },
  ];
}

const temEletrica = (model: BlueprintModel) => (model.quadros ?? []).length > 0;

/** O MEMORIAL DESCRITIVO. Sem quadro no desenho, só o cabeçalho (nenhuma seção) — o painel diz que não há o que memorializar. */
export function memorialDescritivoEletrico(model: BlueprintModel, hip: HipotesesEletricas, ctx: ContextoDoMemorial): BlocoDoMemorial[] {
  const B = cabecalho(model, ctx, 'Memorial descritivo — instalações elétricas');
  if (!temEletrica(model)) return B;
  const quadros = (model.quadros ?? []).map((q) => ({ q, r: preDimensionarQuadroCompleto(model, q.id, hip) })).filter((x) => !!x.r);
  const circuitos = model.circuitos ?? [];
  const pontos = (model.terminais ?? []).filter((t) => t.disciplina === 'ELETRICA');
  const pavimentos = new Set(pontos.map((t) => t.levelId)).size;

  // 1. Objeto
  B.push({ tipo: 'secao', texto: 'Objeto' });
  const objeto = textoDoMemorial(hip, 'objeto');
  B.push({
    tipo: 'paragrafo',
    texto: objeto || `Este memorial descreve as instalações elétricas de baixa tensão do estudo "${ctx.nomeDoEstudo}": ${quadros.length} quadro(s), ${circuitos.length} circuito(s) e ${pontos.length} ponto(s) em ${pavimentos} pavimento(s), conforme as plantas, o quadro de cargas e o diagrama unifilar.`,
  });

  // 2. Normas
  B.push({ tipo: 'secao', texto: 'Normas' });
  const normas: string[][] = [['ABNT NBR 5410:2004', 'Instalações elétricas de baixa tensão']];
  if (pontos.some((t) => t.tipoEletrico === 'TUG' || t.tipoEletrico === 'TUE')) normas.push(['ABNT NBR 14136', 'Plugues e tomadas para uso doméstico e análogo']);
  if (circuitos.some((c) => c.disjuntorA != null)) normas.push(['ABNT NBR NM 60898', 'Disjuntores para proteção de sobrecorrentes']);
  if (quadros.some(({ q }) => !q.quadroPaiId)) normas.push(['Norma técnica da concessionária local', 'Padrão de entrada, medição e ramal de ligação']);
  B.push({ tipo: 'tabela', cabecalho: ['Norma', 'Assunto'], linhas: normas });

  // 3. Entrada de energia
  const entradas = quadros.map(({ q }) => entradaDoQuadro(model, q.id, hip)).filter((e): e is NonNullable<typeof e> => !!e);
  if (entradas.length) {
    B.push({ tipo: 'secao', texto: 'Entrada de energia' });
    for (const e of entradas) B.push({ tipo: 'paragrafo', texto: `${e.nome}: ${rotuloDaEntrada(e)}. ${e.padrao.conferir.charAt(0).toUpperCase()}${e.padrao.conferir.slice(1)}.` });
  }

  // 4. Quadros
  B.push({ tipo: 'secao', texto: 'Quadros de distribuição' });
  B.push({
    tipo: 'tabela',
    cabecalho: ['Quadro', 'Tipo', 'Alimentação', 'Alimentado por', 'Demanda (VA)', 'Geral (A)', 'Icn (kA)', 'DPS'],
    linhas: quadros.map(({ q, r }) => [
      q.nome + (r!.unidade ? ` (un. ${r!.unidade})` : ''),
      r!.tipo,
      `${r!.ligacao}${r!.tensaoV ? ` ${r!.tensaoV} V` : ''}`,
      r!.paiNome ?? 'entrada',
      String(Math.round(r!.sDemandadaVA)),
      r!.disjuntorGeralA != null ? String(r!.disjuntorGeralA) : '—',
      q.icnKa != null ? mm2(q.icnKa) : '—',
      q.dps ? rotuloDoDPS(q.dps) : '—',
    ]),
  });

  // 5. Circuitos
  B.push({ tipo: 'secao', texto: 'Circuitos' });
  const linhasC: string[][] = [];
  for (const { q, r } of quadros) {
    for (const c of r!.circuitos) {
      const circuito = circuitos.find((x) => x.id === c.circuitoId);
      const fase = c.secaoDeclaradaMm2 ?? c.secaoCalculada?.secaoMm2 ?? null;
      const dr = drsDoQuadro(model, q.id).find((d) => d.geral || d.circuitoIds.includes(c.circuitoId));
      linhasC.push([
        q.nome,
        c.nome + (c.reserva ? ' (reserva)' : ''),
        circuito?.tipo ?? '',
        `${c.ligacao}${c.tensaoV ? ` ${c.tensaoV} V` : ''}`,
        String(c.pontos),
        String(Math.round(c.sVA)),
        `${mm2(fase)} / ${mm2(c.secaoNeutroMm2 ?? fase)} / ${mm2(c.secaoPeMm2)}`,
        `${c.disjuntorDeclaradoA ?? c.disjuntorSugeridoA ?? '—'} A ${c.curvaDeclarada ?? c.curvaSugerida}`,
        dr ? rotuloDoDR(dr) : '—',
      ]);
    }
  }
  B.push({ tipo: 'tabela', cabecalho: ['Quadro', 'Circuito', 'Descrição', 'Lig./V', 'Pts', 'VA', 'Seção F/N/PE (mm²)', 'Disjuntor', 'DR'], linhas: linhasC });

  // 6. Proteção
  B.push({ tipo: 'secao', texto: 'Proteção' });
  const drs = quadros.flatMap(({ q }) => drsDoQuadro(model, q.id).map((d) => `${q.nome}: DR ${rotuloDoDR(d)} ${d.geral ? '(geral)' : `nos circuitos ${circuitos.filter((c) => d.circuitoIds.includes(c.id)).map((c) => c.nome).join(', ')}`}`));
  B.push({ tipo: 'paragrafo', texto: drs.length ? `Dispositivos diferenciais-residuais: ${drs.join('; ')}.` : 'Nenhum dispositivo DR declarado.' });
  B.push({ tipo: 'paragrafo', texto: `Proteção contra surtos: ${quadros.filter(({ q }) => q.dps).map(({ q }) => `${q.nome} — ${rotuloDoDPS(q.dps!)}`).join('; ') || 'nenhum DPS declarado'}. Exposição a descargas: ${ROTULO_DA_EXPOSICAO[hip.exposicaoARaios]}.` });
  B.push({ tipo: 'paragrafo', texto: `Capacidade de interrupção dos disjuntores contra a corrente de curto presumida na entrada de ${mm2(hip.ikEntradaKa)} kA (hipótese, a confirmar com a concessionária).` });

  // 7. Condutores e eletrodutos
  const m = materiaisEletricos(model);
  B.push({ tipo: 'secao', texto: 'Condutores e eletrodutos' });
  B.push({ tipo: 'paragrafo', texto: textoDoMemorial(hip, 'execucao') });
  const fio = m.totais.filter((l) => l.grupo === 'Condutores' || l.grupo === 'Eletrodutos');
  if (fio.length) B.push({ tipo: 'tabela', cabecalho: ['Item', 'Quantidade', 'Un.'], linhas: fio.map((l) => [l.item, qtd(l.quantidade, l.unidade), l.unidade]) });

  // 8. Aterramento
  B.push({ tipo: 'secao', texto: 'Aterramento' });
  B.push({ tipo: 'paragrafo', texto: textoDoMemorial(hip, 'aterramento') });

  // 9. Quantitativos
  B.push({ tipo: 'secao', texto: 'Quantitativos' });
  B.push({ tipo: 'tabela', cabecalho: ['Grupo', 'Item', 'Quantidade', 'Un.'], linhas: m.totais.map((l) => [l.grupo, l.item, qtd(l.quantidade, l.unidade), l.unidade]) });
  B.push({ tipo: 'paragrafo', texto: 'Quantidades do quantitativo do desenho (o mesmo do orçamento), sem perdas nem sobras.' });

  // 10. Observações (só com texto)
  const obs = textoDoMemorial(hip, 'observacoes');
  if (obs) {
    B.push({ tipo: 'secao', texto: 'Observações' });
    B.push({ tipo: 'paragrafo', texto: obs });
  }
  return B;
}

/** O MEMORIAL DE CÁLCULO. Sem quadro no desenho, só o cabeçalho. */
export function memorialDeCalculoEletrico(model: BlueprintModel, hip: HipotesesEletricas, ctx: ContextoDoMemorial): BlocoDoMemorial[] {
  const B = cabecalho(model, ctx, 'Memorial de cálculo — instalações elétricas (NBR 5410:2004)');
  if (!temEletrica(model)) return B;

  B.push({ tipo: 'secao', texto: 'Hipóteses' });
  const d = hip.demanda;
  B.push({
    tipo: 'tabela',
    cabecalho: ['Parâmetro', 'Valor'],
    linhas: [
      ['Condutores', 'cobre, isolação PVC 70 °C'],
      ['Método de instalação (Tab. 33/36)', hip.metodoDeInstalacao],
      ['Temperatura ambiente (Tab. 40)', `${hip.temperaturaAmbienteC} °C`],
      ['Circuitos agrupados (Tab. 42)', String(hip.circuitosAgrupados)],
      ['Resistividade do cobre', `${String(hip.rhoOhmMm2PorM).replace('.', ',')} Ω·mm²/m`],
      ['Queda máxima no terminal (6.2.7)', `${n1(hip.limiteQuedaTerminalPct)} %`],
      ['Queda máxima da origem (6.2.7.1)', `${n1(hip.origemComTransformador ? Math.max(7, hip.limiteQuedaTotalPct) : hip.limiteQuedaTotalPct)} %${hip.origemComTransformador ? ' (transformador próprio)' : ''}`],
      ['Seção mínima de TUE (hipótese)', `${mm2(hip.secaoMinimaTueMm2)} mm²`],
      ['Disjuntores (catálogo)', `${hip.catalogoDeDisjuntoresA.join(', ')} A`],
      ['Demanda', `${d.nome} — luz ${d.ILUMINACAO}, TUG ${d.TUG}, força ${d.FORCA}, motores ${d.MOTOR ?? 1}${d.fonte ? ` (fonte ${d.fonte}${d.dataISO ? `, ${dataBr(d.dataISO)}` : ''})` : ''}`],
      ['Diversidade (uso coletivo)', fatorDeDiversidade(hip.diversidade).nome],
      ['Padrão de entrada', padraoDeEntrada(hip.padraoDeEntrada).nome],
      ['Corrente de curto presumida (hipótese)', `${mm2(hip.ikEntradaKa)} kA`],
      ['Exposição a descargas', ROTULO_DA_EXPOSICAO[hip.exposicaoARaios]],
    ],
  });

  B.push({ tipo: 'secao', texto: 'Quadros e circuitos' });
  for (const q of model.quadros ?? []) {
    const r = preDimensionarQuadroCompleto(model, q.id, hip);
    if (!r) continue;
    B.push({ tipo: 'subsecao', texto: `${q.nome} — ${r.tipo} · ${r.ligacao}${r.tensaoV ? ` ${r.tensaoV} V` : ''}${r.paiNome ? ` · alimentado por ${r.paiNome}` : ' · entrada'}` });
    const partes = [
      `Carga instalada ${Math.round(r.sInstaladaVA)} VA; demandada ${Math.round(r.sDemandadaVA)} VA (${r.demanda.nome})`,
      r.unidadesAtendidas > 0 ? `uso coletivo: ${r.unidadesAtendidas} unidade(s) × ${String(r.fatorDeDiversidade).replace('.', ',')} = ${Math.round(r.sDemandadaUnidadesVA)} VA + serviço ${Math.round(r.sDemandadaServicoVA)} VA` : null,
      r.ibA != null ? `alimentador: IB ${n1(r.ibA)} A, seção ${mm2(r.secaoCalculada?.secaoMm2)} mm², geral ${r.disjuntorGeralA ?? '—'} A` : 'alimentador não calculado',
      r.quedaAlimentadorPct != null ? `queda no alimentador ${n1(r.quedaAlimentadorPct)} %${r.alimentadorM != null ? ` em ${n1(r.alimentadorM)} m${r.alimentadorOrigem === 'ELETRODUTOS' ? ' (pelo eletroduto)' : ''}` : ''}` : null,
      r.cadeia.length > 1 ? `queda até a origem: ${r.cadeia.map((e) => `${e.nome} ${e.quedaAlimentadorPct == null ? '—' : n1(e.quedaAlimentadorPct)} %`).join(' + ')}` : null,
      r.quedaTotalMaxPct != null ? `total ao pior ponto ${n1(r.quedaTotalMaxPct)} % (limite ${n1(r.limiteQuedaEfetivoPct)} %)` : null,
    ].filter((x): x is string => !!x);
    B.push({ tipo: 'paragrafo', texto: `${partes.join('; ')}.` });
    if (r.circuitos.length) {
      B.push({
        tipo: 'tabela',
        cabecalho: ['Circuito', 'Lig./V', 'VA', 'IB (A)', 'Seção decl./mín. (mm²)', 'Iz (A)', 'Disjuntor decl./sug. (A)', 'Curva', 'ΔV (%)', 'Situação'],
        linhas: r.circuitos.map((c) => {
          const faltas = c.achados.filter((a) => a.nivel === 'FALTA');
          return [
            c.nome,
            `${c.ligacao}${c.tensaoV ? ` ${c.tensaoV}` : ''}`,
            String(Math.round(c.sVA)),
            c.ibA == null ? '—' : n1(c.ibA),
            `${mm2(c.secaoDeclaradaMm2)} / ${mm2(c.secaoCalculada?.secaoMm2)}`,
            c.izDeclaradaA != null ? n1(c.izDeclaradaA) : c.secaoCalculada ? n1(c.secaoCalculada.izA) : '—',
            `${c.disjuntorDeclaradoA ?? '—'} / ${c.disjuntorSugeridoA ?? '—'}`,
            c.curvaDeclarada ?? `${c.curvaSugerida} (sug.)`,
            c.quedaPct == null ? '—' : n1(c.quedaPct),
            c.ibA == null ? 'não calculado' : faltas.length ? `FALTA ${[...new Set(faltas.map((a) => a.referencia))].join(', ')}` : 'atende',
          ];
        }),
      });
    }
    for (const a of r.achados) B.push({ tipo: 'paragrafo', texto: `${a.nivel === 'FALTA' ? 'FALTA' : 'Aviso'} (${a.referencia}): ${a.mensagem}.` });
  }

  B.push({ tipo: 'secao', texto: 'Conferência NBR 5410' });
  const conf = conferirNbr5410(model, null, hip);
  B.push({
    tipo: 'tabela',
    cabecalho: ['Regra', 'O que confere', 'Avaliados', 'Faltas', 'Avisos'],
    linhas: conf.regras.map((r) => [r.codigo === 'SUGERIDAS' ? 'Sugeridas' : r.codigo === 'ENTRADA' ? 'Entrada' : r.codigo, r.titulo, String(r.avaliados), String(r.achados.filter((a) => a.nivel === 'FALTA').length), String(r.achados.filter((a) => a.nivel === 'AVISO').length)]),
  });
  return B;
}

/**
 * O memorial da EMISSÃO com ART: a capa de sempre (`memorialEletrico` —
 * responsável, base, verificações, declaração, em linhas) seguida dos dois
 * memoriais sem os seus cabeçalhos. É o que a emissão grava.
 */
export function memorialExecutivoEletrico(linhasDaCapa: string[], model: BlueprintModel, hip: HipotesesEletricas, ctx: ContextoDoMemorial): BlocoDoMemorial[] {
  return [
    ...blocosDasLinhas(linhasDaCapa),
    { tipo: 'secao', texto: 'Memorial de cálculo' },
    ...memorialDeCalculoEletrico(model, hip, ctx).slice(3),
    { tipo: 'secao', texto: 'Memorial descritivo' },
    ...memorialDescritivoEletrico(model, hip, ctx).slice(3),
  ];
}
