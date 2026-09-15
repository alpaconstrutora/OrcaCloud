/**
 * PROJETO EXECUTIVO ELÉTRICO com ART — F7 do pré-dimensionamento (13/09/2026).
 *
 * ─── O QUE O SOFTWARE FAZ, E O QUE NÃO FAZ ──────────────────────────────────
 *
 * O mesmo molde da topografia (`blueprintTopografiaExecutivo.ts`): nenhum
 * programa emite projeto — quem emite é o responsável técnico, com registro
 * no conselho e ART/RRT recolhida. O que mora aqui é o FLUXO:
 *
 * 1. o responsável se identifica;
 * 2. as VERIFICAÇÕES são reunidas: cada regra da Conferência NBR 5410 sem
 *    falta, o pré-dimensionamento de cada circuito e de cada quadro sem
 *    falta, nenhum ponto sem potência, nenhum circuito sem tensão;
 * 3. só com tudo atendido o projeto é EMITIDO: o registro fica imutável,
 *    amarrado ao hash do DESENHO (o canônico do kernel) e ao hash das
 *    HIPÓTESES — mudou uma tomada ou o método de instalação, a emissão deixa
 *    de valer e a tela diz.
 *
 * Puro: modelo, hipóteses e conferência entram; verificações e texto saem.
 */
import { sha256, snapshotHash, stableStringify, type BlueprintModel } from './blueprintKernel';
import { KERNEL_VERSION } from './blueprintKernel';
import type { ConferenciaNbr5410 } from './blueprintNbr5410';
import type { ResponsavelTecnico } from './blueprintTopografiaExecutivo';
import {
  preDimensionarQuadroCompleto,
  type HipotesesEletricas,
  type PreDimensionamentoDoQuadro,
} from './blueprintEletricaDimensionamento';

export interface VerificacaoEletrica {
  /** Grupo para a tela agrupar. */
  grupo: 'RESPONSAVEL' | 'DADOS' | 'NORMA' | 'CIRCUITOS' | 'QUADROS';
  item: string;
  norma: string;
  exigido: string;
  obtido: string;
  atende: boolean;
}

export interface ResultadoEletricoExecutivo {
  verificacoes: VerificacaoEletrica[];
  quadros: PreDimensionamentoDoQuadro[];
  podeEmitir: boolean;
  pendencias: string[];
}

const n1 = (v: number) => v.toFixed(1).replace('.', ',');
/** Seção como se lê: "2,5 mm²" — vírgula; `—` quando não há. */
const mm2 = (v: number | null | undefined) => (v == null ? '—' : String(v).replace('.', ','));

/** As verificações que a emissão exige — todas têm de atender. */
export function verificacoesEletricas(
  model: BlueprintModel,
  hip: HipotesesEletricas,
  responsavel: ResponsavelTecnico,
  conferencia: ConferenciaNbr5410,
): ResultadoEletricoExecutivo {
  const v: VerificacaoEletrica[] = [];

  // 1. Responsável.
  const temResp = !!responsavel.nome.trim() && !!responsavel.registro.trim();
  v.push({ grupo: 'RESPONSAVEL', item: 'Responsável técnico identificado', norma: 'Lei 5.194 / 12.378', exigido: 'nome e registro', obtido: temResp ? `${responsavel.nome} (${responsavel.conselho} ${responsavel.registro})` : 'incompleto', atende: temResp });
  const temArt = !!responsavel.artNumero.trim() && !!responsavel.artData.trim();
  v.push({ grupo: 'RESPONSAVEL', item: `${responsavel.conselho === 'CAU' ? 'RRT' : 'ART'} recolhida`, norma: 'Res. CONFEA 1.025 / CAU', exigido: 'número e data', obtido: temArt ? `nº ${responsavel.artNumero} em ${responsavel.artData.split('-').reverse().join('/')}` : 'não informada', atende: temArt });

  // 2. Dados completos — sem eles o cálculo é parcial e a emissão mentiria.
  const pontos = (model.terminais ?? []).filter((t) => t.disciplina === 'ELETRICA');
  const semPotencia = pontos.filter((t) => t.potenciaW == null && t.tipoEletrico !== 'INTERRUPTOR').length;
  v.push({ grupo: 'DADOS', item: 'Todo ponto com potência declarada', norma: '9.5.2 (VA por ponto)', exigido: '0 sem potência', obtido: `${semPotencia} sem potência`, atende: semPotencia === 0 });
  const semCircuito = pontos.filter((t) => !t.circuitoId && t.tipoEletrico !== 'INTERRUPTOR').length;
  v.push({ grupo: 'DADOS', item: 'Todo ponto em circuito', norma: '4.2.5 (divisão)', exigido: '0 fora de circuito', obtido: `${semCircuito} fora de circuito`, atende: semCircuito === 0 });
  const circuitos = model.circuitos ?? [];
  const semTensao = circuitos.filter((c) => !c.tensaoV).length;
  v.push({ grupo: 'DADOS', item: 'Todo circuito com tensão declarada', norma: '—', exigido: '0 sem tensão', obtido: `${semTensao} sem tensão`, atende: circuitos.length > 0 && semTensao === 0 });
  const semDeclaracao = circuitos.filter((c) => c.secaoMm2 == null || c.disjuntorA == null).length;
  v.push({ grupo: 'DADOS', item: 'Todo circuito com seção e disjuntor declarados', norma: '6.2.6 / 5.3.4', exigido: '0 sem declaração', obtido: `${semDeclaracao} sem seção ou disjuntor`, atende: circuitos.length > 0 && semDeclaracao === 0 });

  // 3. As regras da conferência, uma verificação por regra.
  for (const r of conferencia.regras) {
    if (r.codigo === 'SUGERIDAS' || r.codigo === 'PRE-DIM') continue;
    const faltas = r.achados.filter((a) => a.nivel === 'FALTA');
    v.push({ grupo: 'NORMA', item: r.titulo, norma: `NBR 5410 ${r.codigo}`, exigido: 'sem falta', obtido: faltas.length === 0 ? (r.naoAvaliado.length ? 'sem falta (parcial)' : 'sem falta') : `${faltas.length} falta(s)`, atende: faltas.length === 0 });
  }
  const sugeridas = pontos.filter((t) => t.sugerida).length;
  v.push({ grupo: 'DADOS', item: 'Nenhum ponto em posição sugerida', norma: '—', exigido: '0 sugeridos', obtido: `${sugeridas} sugerido(s)`, atende: sugeridas === 0 });

  // 4. Pré-dimensionamento por quadro e por circuito.
  const quadros = (model.quadros ?? [])
    .map((q) => preDimensionarQuadroCompleto(model, q.id, hip))
    .filter((q): q is PreDimensionamentoDoQuadro => !!q);
  for (const q of quadros) {
    for (const c of q.circuitos) {
      const faltas = c.achados.filter((a) => a.nivel === 'FALTA');
      const ok = c.ibA != null && faltas.length === 0;
      v.push({
        grupo: 'CIRCUITOS',
        item: `${q.nome} · ${c.nome}`,
        norma: 'Tab. 36/47 · 5.3.4.1 · 6.2.7',
        exigido: 'seção, disjuntor e queda atendidos',
        obtido: c.ibA == null ? 'não calculado' : faltas.length === 0 ? `IB ${n1(c.ibA)} A · ${mm2(c.secaoDeclaradaMm2 ?? c.secaoCalculada?.secaoMm2)} mm² · ${c.disjuntorDeclaradoA ?? '—'} A${c.quedaPct != null ? ` · ΔV ${n1(c.quedaPct)} %` : ''}` : faltas.map((f) => f.referencia).join(', '),
        atende: ok,
      });
    }
    const faltasQ = q.achados.filter((a) => a.nivel === 'FALTA');
    v.push({
      grupo: 'QUADROS',
      item: `${q.nome} — alimentador`,
      norma: '6.2.7.1 · Tab. 36',
      exigido: 'queda total e alimentador atendidos',
      obtido: q.ibA == null ? 'não calculado' : `${n1(q.sDemandadaVA)} VA (${q.demanda.nome}) · IB ${n1(q.ibA)} A · ${mm2(q.secaoCalculada?.secaoMm2)} mm² · geral ${q.disjuntorGeralA ?? '—'} A${q.quedaTotalMaxPct != null ? ` · ΔV total ${n1(q.quedaTotalMaxPct)} %` : ' · alimentador sem comprimento'}`,
      atende: q.ibA != null && faltasQ.length === 0 && q.quedaTotalMaxPct != null,
    });
  }

  const pendencias = v.filter((x) => !x.atende).map((x) => `${x.item}: ${x.obtido}`);
  return { verificacoes: v, quadros, podeEmitir: pendencias.length === 0 && quadros.length > 0, pendencias };
}

/**
 * O que a emissão fica amarrada: o DESENHO (hash canônico do kernel) e as
 * HIPÓTESES. Mudou qualquer um, a emissão não vale mais para o que está na tela.
 */
export function hashDaBaseEletrica(model: BlueprintModel, hip: HipotesesEletricas): { desenho: string; base: string } {
  const desenho = snapshotHash(model);
  return { desenho, base: sha256(stableStringify({ desenho, hipoteses: hip })) };
}

/** O memorial, em linhas (título, seções, itens) — o PDF só quebra e pagina. */
export function memorialEletrico(
  responsavel: ResponsavelTecnico,
  hip: HipotesesEletricas,
  r: ResultadoEletricoExecutivo,
  ctx: { nomeDoEstudo: string; hashDoDesenho: string; hashDaBase: string; emitidoEm: string },
): string[] {
  const L: string[] = [];
  const data = ctx.emitidoEm.slice(0, 10).split('-').reverse().join('/');
  const sigla = responsavel.conselho === 'CAU' ? 'RRT' : 'ART';
  L.push('# Memorial de cálculo — projeto executivo elétrico (NBR 5410:2004)');
  L.push(`${ctx.nomeDoEstudo} · emitido em ${data}`);
  L.push('');
  L.push('## 1. Responsável técnico');
  L.push(`${responsavel.nome}, ${responsavel.titulo} — ${responsavel.conselho} ${responsavel.registro}`);
  L.push(`${sigla} nº ${responsavel.artNumero}, recolhida em ${responsavel.artData.split('-').reverse().join('/')}`);
  L.push('');
  L.push('## 2. Base do projeto');
  L.push(`Desenho: hash ${ctx.hashDoDesenho.slice(0, 16)} (kernel ${KERNEL_VERSION}).`);
  L.push(`Hash da base (desenho + hipóteses): ${ctx.hashDaBase.slice(0, 16)}. Alterada a base, este memorial deixa de valer.`);
  L.push('');
  L.push('## 3. Hipóteses');
  L.push(`Condutores de cobre, isolação PVC 70 °C, método de instalação ${hip.metodoDeInstalacao} (Tabela 36); temperatura ambiente ${hip.temperaturaAmbienteC} °C (Tabela 40); ${hip.circuitosAgrupados} circuito(s) por eletroduto (Tabela 42); seção mínima por uso pela Tabela 47; TUE / ligação direta ≥ ${String(hip.secaoMinimaTueMm2).replace('.', ',')} mm² (hipótese de projeto).`);
  L.push(`ρ do cobre ${String(hip.rhoOhmMm2PorM).replace('.', ',')} Ω·mm²/m; queda máxima ${hip.limiteQuedaTerminalPct} % no circuito terminal e ${hip.limiteQuedaTotalPct} % da origem (6.2.7). Disjuntores: ${hip.catalogoDeDisjuntoresA.join(', ')} A (IB ≤ In ≤ Iz, 5.3.4.1).`);
  L.push(`Demanda: ${hip.demanda.nome} — iluminação ${hip.demanda.ILUMINACAO}, TUG ${hip.demanda.TUG}, força ${hip.demanda.FORCA}. Desequilíbrio de fases tolerado ${hip.desequilibrioMaxPct} %.`);
  L.push('');
  L.push('## 4. Quadros e circuitos');
  for (const q of r.quadros) {
    L.push(`### ${q.nome} — ${q.ligacao}${q.tensaoV ? ` ${q.tensaoV} V` : ''}${q.ligacaoDeduzida ? ' (ligação deduzida dos circuitos)' : ''}`);
    L.push(`Carga instalada ${Math.round(q.sInstaladaVA)} VA (iluminação ${Math.round(q.porGrupoVA.ILUMINACAO)}, TUG ${Math.round(q.porGrupoVA.TUG)}, força ${Math.round(q.porGrupoVA.FORCA)}); demandada ${Math.round(q.sDemandadaVA)} VA.`);
    if (q.ibA != null) {
      L.push(`Alimentador: IB ${n1(q.ibA)} A; seção ${mm2(q.secaoCalculada?.secaoMm2)} mm² (Iz ${q.secaoCalculada ? n1(q.secaoCalculada.izA) : '—'} A); disjuntor geral ${q.disjuntorGeralA ?? '—'} A${q.quedaAlimentadorPct != null ? `; queda no alimentador ${n1(q.quedaAlimentadorPct)} %, total até o pior ponto ${n1(q.quedaTotalMaxPct ?? 0)} %` : ''}.`);
    }
    if (q.fases) L.push(`Fases: R ${Math.round(q.fases.R)} · S ${Math.round(q.fases.S)} · T ${Math.round(q.fases.T)} VA${q.desequilibrioPct != null ? ` (desequilíbrio ${n1(q.desequilibrioPct)} %)` : ''}.`);
    for (const c of q.circuitos) {
      L.push(
        `${c.nome} (${c.ligacao}${c.tensaoV ? ` ${c.tensaoV} V` : ''}): ${c.pontos} ponto(s), ${Math.round(c.sVA)} VA, IB ${c.ibA == null ? '—' : n1(c.ibA)} A; seção declarada ${mm2(c.secaoDeclaradaMm2)} mm² (mínima ${mm2(c.secaoCalculada?.secaoMm2)} mm²); disjuntor ${c.disjuntorDeclaradoA ?? '—'} A (sugerido ${c.disjuntorSugeridoA ?? '—'} A)${c.quedaPct != null && c.comprimento ? `; ΔV ${n1(c.quedaPct)} % em ${n1(c.comprimento.metros)} m ${c.comprimento.origem === 'ESTIMADO' ? '(estimado)' : '(eletrodutos)'}` : ''}. ${c.achados.some((a) => a.nivel === 'FALTA') ? 'NÃO ATENDE.' : 'ATENDE.'}`,
      );
    }
    L.push('');
  }
  L.push('## 5. Verificações');
  for (const x of r.verificacoes) L.push(`${x.atende ? '[✓]' : '[✗]'} ${x.item} — ${x.norma} — exigido ${x.exigido}; obtido ${x.obtido}.`);
  L.push('');
  L.push('## 6. Declaração');
  L.push(
    `As verificações acima foram feitas pela ABNT NBR 5410:2004 sobre o desenho e as hipóteses registradas no estudo. A responsabilidade técnica pelo projeto é do profissional identificado no item 1, nos termos da ${sigla} citada. O programa organiza o cálculo e o registro; não substitui o profissional.`,
  );
  return L;
}
