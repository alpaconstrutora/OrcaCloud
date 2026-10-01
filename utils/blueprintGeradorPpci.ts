/**
 * INCÊNDIO E10 (01/10/2026) — O GERADOR DE PPCI: um botão que encadeia os
 * motores das etapas anteriores e devolve UMA prévia, UM lote e UM Ctrl+Z, com
 * o relatório do que ele NÃO decidiu.
 *
 * ─── A ORDEM ────────────────────────────────────────────────────────────────
 *
 * Cada etapa propõe sobre a CÓPIA de trabalho já com as anteriores aplicadas
 * (o kernel dá ids determinísticos — `seq` por prefixo —, então o lote
 * inteiro, reaplicado no original, cria os MESMOS ids: é o que `comPlacas` e
 * `conferirPlano` já usam):
 *
 *   classificação e exigências (E0) → percurso de fuga (E6, só leitura)
 *   → extintores com placa (E7.1) → hidrantes pela cobertura, com placa (E3.3)
 *   → sprinklers por ambiente + traçado (E5.2/5.3) → rede de hidrantes (E3.1)
 *   → DN automático pelo cálculo (E2) → área de operação (E5.2)
 *   → sinalização da rota e do que faltou (E7.2) → iluminação (E7.3)
 *   → detecção e alarme (E7.4) → conferência do resultado (E8.4).
 *
 * A sinalização vem DEPOIS dos equipamentos (ela põe placa em quem não tem) e
 * a iluminação depois da rota. Etapa de medida NÃO EXIGIDA pela classificação
 * não roda — o gerador não inventa sistema que o Corpo de Bombeiros não pede.
 *
 * ─── O QUE ELE NÃO DECIDE (vai para o relatório) ───────────────────────────
 *
 * Bomba e reserva técnica (não há motor que as escolha: a curva vem do
 * catálogo e o volume, do projeto), premissa faltando (ocupação, risco),
 * tabela de norma CONFERIR, medida exigida que o desenho não modela, ambiente
 * sem solução, conflito que a proposta criou, e cada verificação que ainda
 * FALTA no fim. Nada disso é escondido: "zero FALTA ou a lista exata".
 */
import type { BlueprintModel, Command, ObjectId } from './blueprintKernel';
import { applyBatch, conflitosArquitetonicos, pointInPolygon } from './blueprintKernel';
import { classificarEdificacao, exigenciasDaEdificacao, pavimentoDeDescarga, type HipotesesIncendio, type MedidaDeSeguranca } from './blueprintIncendioClassificacao';
import { percursoDeFuga } from './blueprintRotaDeFuga';
import { analisarExtintores, proporExtintores } from './blueprintExtintores';
import { analisarSinalizacao, proporSinalizacao } from './blueprintSinalizacao';
import { kitDaPeca } from './blueprintKitsIncendio';
import { proporEletrodutoDoLaco } from './blueprintLacoDeAlarme';
import { analisarAntipanico, proporAntipanico } from './blueprintAntipanico';
import { analisarSaidas } from './blueprintSaidasIncendio';
import { analisarIluminacao, proporIluminacao } from './blueprintIluminacaoEmergencia';
import { analisarAlarme, proporAlarme } from './blueprintDeteccaoAlarme';
import { proporHidrantes } from './blueprintCoberturaIncendio';
import { planejarRedeDeHidrantes } from './blueprintRedeDeHidrantes';
import { criterioDeSprinklers } from './blueprintSprinklersIncendio';
import { comandosDaDistribuicao, distribuirSprinklers } from './blueprintDistribuicaoSprinklers';
import { tracarRedeDeSprinklers } from './blueprintRedeDeSprinklers';
import { proporAreaDeOperacao } from './blueprintAreaDeOperacao';
import { ajustarDnDeIncendio } from './blueprintCalculoIncendio';
import { MEDIDAS_NAO_MODELADAS, ROTULO_DO_GRUPO_DE_INCENDIO, analisesDeIncendio, verificacoesIncendio } from './blueprintIncendioExecutivo';
import { RESPONSAVEL_VAZIO } from './blueprintTopografiaExecutivo';
import type { BlocoDoMemorial } from './blueprintMemorialHidro';
import { ROTULO_DA_ALIMENTACAO, ROTULO_DO_ARRANJO, proporFonte, proporRecalque, proporReserva } from './blueprintCasaDeBombas';
import type { BombaCandidata } from './blueprintBombeamentoIncendio';

export type SituacaoDaEtapa = 'LANCOU' | 'NADA_A_FAZER' | 'NAO_EXIGIDA' | 'NAO_RODOU';

export interface EtapaDoPpci {
  id: 'EXTINTORES' | 'HIDRANTES' | 'SPRINKLERS' | 'FONTE' | 'REDE' | 'RECALQUE' | 'DN' | 'RESERVA' | 'AREA_DE_OPERACAO' | 'SINALIZACAO' | 'ILUMINACAO' | 'ALARME' | 'ANTIPANICO';
  rotulo: string;
  situacao: SituacaoDaEtapa;
  /** Comandos que a etapa pôs no lote. */
  comandos: number;
  /** O que ela disse — por que não rodou, ou o que ficou sem solução. */
  nota: string | null;
}

export type GrupoDaPendencia = 'PREMISSA' | 'CONFERIR' | 'NAO_DECIDIDO' | 'SEM_SOLUCAO' | 'CONFLITO' | 'VERIFICACAO';

export interface PendenciaDoPpci {
  grupo: GrupoDaPendencia;
  texto: string;
}

export interface PlanoDoPpci {
  /** O LOTE: aplicado no modelo original de uma vez, um Ctrl+Z. */
  comandos: Command[];
  /** Os ids que o lote cria, na ordem — para conferir a reaplicação. */
  criados: ObjectId[];
  etapas: EtapaDoPpci[];
  pendencias: PendenciaDoPpci[];
  /** O modelo DEPOIS do lote (a prévia). */
  resultado: BlueprintModel;
}

export const ROTULO_DA_PENDENCIA: Record<GrupoDaPendencia, string> = {
  PREMISSA: 'Premissa faltando',
  CONFERIR: 'CONFERIR NA NORMA/IT (valor em uso)',
  NAO_DECIDIDO: 'O gerador não decide',
  SEM_SOLUCAO: 'Sem solução automática',
  CONFLITO: 'Conflito que a proposta criou',
  VERIFICACAO: 'Verificação que ainda falta',
};

const um = (v: number, casas = 1) => v.toLocaleString('pt-BR', { maximumFractionDigits: casas });

/** Os valores de norma EM USO, marcados CONFERIR desde as etapas que os introduziram. */
export function conferirDasPremissas(hip: HipotesesIncendio): string[] {
  const h = hip.hidraulica;
  return [
    `Hidrantes simultâneos: ${h.hidrantesSimultaneos} (IT do CBMMG)`,
    `Hidrante: ${um(h.vazaoMinimaHidranteLmin, 0)} L/min e ${um(h.pressaoMinimaHidranteKpa, 0)} kPa no esguicho mais desfavorável (NBR 13714 / IT)`,
    `Mangotinho: ${um(h.vazaoMinimaMangotinhoLmin, 0)} L/min e ${um(h.pressaoMinimaMangotinhoKpa, 0)} kPa (NBR 13714 / IT)`,
    `Mangueira de ${um(h.comprimentoMangueiraHidranteM, 0)} m e jato de ${um(h.alcanceDoJatoM, 0)} m para a cobertura (IT)`,
    `Autonomia da reserva técnica: ${um(h.autonomiaMin, 0)} min (IT)`,
    `Pressão máxima ${um(h.pressaoMaximaKpa, 0)} kPa e velocidade máxima ${um(h.velocidadeMaxMs, 1)} m/s (NBR 13714)`,
    `Sprinklers: densidade, área de operação e área por sprinkler da tabela do risco (NBR 10897)`,
    `Percurso máximo de fuga${hip.saidas.percursoMaximoM != null ? ` declarado: ${um(hip.saidas.percursoMaximoM, 0)} m` : ': da tabela da ocupação'} (NBR 9077 / IT)`,
    `Distância máxima até o extintor${hip.extintores.distanciaMaximaM != null ? ` declarada: ${um(hip.extintores.distanciaMaximaM, 0)} m` : ': do risco'} (NBR 12693 / IT)`,
    `Espaçamento das luminárias de emergência${hip.iluminacao.espacamentoMaximoM != null ? ` declarado: ${um(hip.iluminacao.espacamentoMaximoM, 1)} m` : ': o padrão'} (NBR 10898)`,
    'Afastamento de 30 cm entre sprinkler e luminária (NBR 10897)',
  ];
}

export function gerarPpci(
  original: BlueprintModel,
  hip: HipotesesIncendio,
  /** Fase B: as bombas de incêndio do catálogo da organização (com curva) — escolhe a que atende o ponto de projeto. */
  catalogo: readonly BombaCandidata[] = [],
): PlanoDoPpci {
  let m = original;
  const comandos: Command[] = [];
  const criados: ObjectId[] = [];
  const etapas: EtapaDoPpci[] = [];
  const pendencias: PendenciaDoPpci[] = [];
  const aplicar = (lote: Command[]): number => {
    if (lote.length === 0) return 0;
    const r = applyBatch(m, lote);
    m = r.model;
    comandos.push(...lote);
    criados.push(...r.diff.created);
    return lote.length;
  };
  const etapa = (id: EtapaDoPpci['id'], rotulo: string, situacao: SituacaoDaEtapa, n: number, nota: string | null = null) => etapas.push({ id, rotulo, situacao: situacao === 'LANCOU' && n === 0 ? 'NADA_A_FAZER' : situacao, comandos: n, nota });

  // ── Classificação e exigências ────────────────────────────────────────────
  const classificacao = classificarEdificacao(m, hip.classificacao);
  const exigencias = exigenciasDaEdificacao(classificacao);
  const exigida = (id: MedidaDeSeguranca) => exigencias.medidas.some((x) => x.medida === id && x.estado === 'EXIGIDA');
  for (const p of classificacao.pendencias) pendencias.push({ grupo: 'PREMISSA', texto: p });
  if (!classificacao.divisao.valor) pendencias.push({ grupo: 'PREMISSA', texto: 'Ocupação (divisão) não definida — sem ela as exigências não saem da tabela.' });
  for (const x of exigencias.medidas) {
    if (x.estado === 'SEM_TABELA') pendencias.push({ grupo: 'CONFERIR', texto: `${x.nome}: ${x.motivo}` });
    // D1: a nota da IT 01 depende do que o desenho não sabe — o gerador não lança; o responsável decide.
    else if (x.estado === 'CONDICIONAL') pendencias.push({ grupo: 'NAO_DECIDIDO', texto: `${x.nome}: ${x.motivo} — não lançada; declare a condição ou lance à mão.` });
    else if (x.rascunho) pendencias.push({ grupo: 'CONFERIR', texto: `${x.nome} (${x.estado === 'EXIGIDA' ? 'exigida' : 'dispensada'}): transcrito de memória — ${x.fonte ?? 'conferir na IT'}` });
    if (x.estado === 'EXIGIDA' && MEDIDAS_NAO_MODELADAS.includes(x.medida)) pendencias.push({ grupo: 'NAO_DECIDIDO', texto: `${x.nome}: exigida e fora do desenho — projeto do responsável.` });
  }
  for (const t of conferirDasPremissas(hip)) pendencias.push({ grupo: 'CONFERIR', texto: t });
  const descarga = pavimentoDeDescarga(m, hip.classificacao.pisoDeDescargaLevelId)?.id ?? null;
  const grupo = classificacao.divisao.valor?.trim().charAt(0).toUpperCase() || null;

  // ── Extintores (com a placa de cada um) ───────────────────────────────────
  if (exigida('EXTINTORES')) {
    const p = proporExtintores(m, analisarExtintores(m, classificacao.carga.nivel, hip.extintores), hip.extintores);
    // F1: o kit da peça (a placa de cada extintor) — o mesmo da inserção à mão.
    const n = aplicar(p.comandos.length ? kitDaPeca(m, p.comandos).comandos : []);
    for (const s of p.semCobertura) pendencias.push({ grupo: 'SEM_SOLUCAO', texto: `Extintor: ${s}` });
    etapa('EXTINTORES', 'Extintores (com placa)', 'LANCOU', n, p.motivo);
  } else etapa('EXTINTORES', 'Extintores (com placa)', 'NAO_EXIGIDA', 0);

  // ── Hidrantes pela cobertura (com placa) ──────────────────────────────────
  if (exigida('HIDRANTES')) {
    const p = proporHidrantes(m, hip.hidraulica);
    const n = aplicar(p.comandos.length ? kitDaPeca(m, p.comandos).comandos : []);
    const nomes = new Map(m.spaces.map((s) => [s.id, s.name ?? 'ambiente']));
    for (const id of p.semSolucao) pendencias.push({ grupo: 'SEM_SOLUCAO', texto: `Hidrante: ${nomes.get(id) ?? id} fica fora do alcance de qualquer posição proposta.` });
    etapa('HIDRANTES', 'Hidrantes pela cobertura (com placa)', 'LANCOU', n, p.semSolucao.length ? `${p.semSolucao.length} ambiente(s) sem solução` : null);
  } else etapa('HIDRANTES', 'Hidrantes pela cobertura (com placa)', 'NAO_EXIGIDA', 0);

  // ── Sprinklers por ambiente + traçado ─────────────────────────────────────
  const criterio = criterioDeSprinklers(hip.sprinklers, classificacao.divisao.valor);
  if (exigida('CHUVEIROS_AUTOMATICOS')) {
    const risco = criterio.risco?.valor ?? null;
    if (!risco) {
      pendencias.push({ grupo: 'PREMISSA', texto: 'Sprinklers exigidos, mas sem classe de risco (nem declarada nem sugerida pela ocupação).' });
      etapa('SPRINKLERS', 'Sprinklers por ambiente e traçado', 'NAO_RODOU', 0, 'sem classe de risco');
    } else {
      let n = 0;
      for (const s of [...m.spaces]) {
        // O ambiente que já tem sprinkler dentro fica como está.
        const temDentro = (m.terminais ?? []).some((t) => t.tipoHidraulico === 'SPRINKLER' && t.levelId === s.levelId && pointInPolygon(s.ring, t.at));
        if (temDentro) continue;
        const plano = distribuirSprinklers(m, s.id, criterio, hip.sprinklers);
        const alt = plano.alternativas[0];
        if (!alt) {
          pendencias.push({ grupo: 'SEM_SOLUCAO', texto: `Sprinklers em ${s.name ?? 'ambiente'}: ${plano.motivo ?? 'sem distribuição possível'}.` });
          continue;
        }
        const tubos = tracarRedeDeSprinklers(m, plano, alt, 'PONTA', risco);
        if (tubos.motivo) pendencias.push({ grupo: 'SEM_SOLUCAO', texto: `Traçado dos sprinklers em ${s.name ?? 'ambiente'}: ${tubos.motivo}.` });
        n += aplicar([...comandosDaDistribuicao(plano, alt), ...tubos.comandos]);
      }
      etapa('SPRINKLERS', 'Sprinklers por ambiente e traçado', 'LANCOU', n);
    }
  } else etapa('SPRINKLERS', 'Sprinklers por ambiente e traçado', 'NAO_EXIGIDA', 0);

  // ── Fase B · 1: a FONTE — casa de bombas (bomba, jockey, pressostatos) ou caixa elevada ──
  const temCombate = (m.terminais ?? []).some((t) => t.disciplina === 'INCENDIO' && (t.tipoHidraulico === 'HIDRANTE_SIMPLES' || t.tipoHidraulico === 'HIDRANTE_DUPLO' || t.tipoHidraulico === 'MANGOTINHO' || t.tipoHidraulico === 'SPRINKLER'));
  const rotuloDaFonte = `Fonte: ${ROTULO_DA_ALIMENTACAO[hip.bombeamento.alimentacao].toLowerCase()} · ${ROTULO_DO_ARRANJO[hip.bombeamento.reserva].toLowerCase()}`;
  if (temCombate) {
    const f = proporFonte(m, hip);
    const n = aplicar(f.comandos);
    for (const p of f.pendencias) pendencias.push({ grupo: 'NAO_DECIDIDO', texto: p });
    etapa('FONTE', rotuloDaFonte, f.pendencias.length && n === 0 ? 'NAO_RODOU' : 'LANCOU', n, f.pendencias[0] ?? null);
  } else etapa('FONTE', rotuloDaFonte, 'NAO_EXIGIDA', 0);

  // ── Rede de hidrantes ─────────────────────────────────────────────────────
  const temHidrante = (m.terminais ?? []).some((t) => t.disciplina === 'INCENDIO' && (t.tipoHidraulico === 'HIDRANTE_SIMPLES' || t.tipoHidraulico === 'HIDRANTE_DUPLO' || t.tipoHidraulico === 'MANGOTINHO'));
  if (temHidrante) {
    const plano = planejarRedeDeHidrantes(m, hip.rede);
    const n = plano.motivo ? 0 : aplicar(plano.comandos);
    if (plano.motivo) pendencias.push({ grupo: 'NAO_DECIDIDO', texto: `Rede de hidrantes: ${plano.motivo}. A bomba (ou a caixa de incêndio) é escolha do projeto — lance-a e gere de novo.` });
    etapa('REDE', 'Rede de hidrantes (geral, colunas, ramais)', plano.motivo ? 'NAO_RODOU' : 'LANCOU', n, plano.motivo);
  } else etapa('REDE', 'Rede de hidrantes (geral, colunas, ramais)', exigida('HIDRANTES') ? 'NAO_RODOU' : 'NAO_EXIGIDA', 0, exigida('HIDRANTES') ? 'nenhum hidrante no desenho' : null);

  // ── Fase B · 2: o REGISTRO DE RECALQUE, ligado à rede ─────────────────────
  if (exigida('HIDRANTES') && (m.trechos ?? []).some((t) => t.disciplina === 'INCENDIO')) {
    const rc = proporRecalque(m, hip);
    const n = aplicar(rc.comandos);
    for (const p of rc.pendencias) pendencias.push({ grupo: 'NAO_DECIDIDO', texto: p });
    etapa('RECALQUE', 'Registro de recalque no passeio', rc.pendencias.length && n === 0 ? 'NAO_RODOU' : 'LANCOU', n, rc.pendencias[0] ?? null);
  } else etapa('RECALQUE', 'Registro de recalque no passeio', exigida('HIDRANTES') ? 'NAO_RODOU' : 'NAO_EXIGIDA', 0, exigida('HIDRANTES') ? 'sem rede de incêndio' : null);

  // ── DN automático pelo cálculo ────────────────────────────────────────────
  if ((m.trechos ?? []).some((t) => t.disciplina === 'INCENDIO')) {
    const dn = ajustarDnDeIncendio(m, hip.hidraulica, exigida('CHUVEIROS_AUTOMATICOS') ? criterio : null);
    const n = aplicar(dn.comandos);
    if (dn.motivo && n === 0) pendencias.push({ grupo: 'NAO_DECIDIDO', texto: `DN automático: ${dn.motivo}.` });
    etapa('DN', 'DN pelo cálculo hidráulico', 'LANCOU', n, dn.motivo);
  } else etapa('DN', 'DN pelo cálculo hidráulico', 'NAO_RODOU', 0, 'sem rede de incêndio');

  // ── Fase B · 3: o VOLUME da reserva técnica (e a curva da bomba, se o catálogo tem) ──
  if ((m.trechos ?? []).some((t) => t.disciplina === 'INCENDIO')) {
    const rv = proporReserva(m, hip, catalogo);
    const n = aplicar(rv.comandos);
    for (const p of rv.pendencias) pendencias.push({ grupo: 'NAO_DECIDIDO', texto: p });
    etapa('RESERVA', 'Reserva técnica (volume) e curva da bomba', 'LANCOU', n, rv.pendencias[0] ?? null);
  } else etapa('RESERVA', 'Reserva técnica (volume) e curva da bomba', 'NAO_RODOU', 0, 'sem rede de incêndio');

  // ── Área de operação (sprinklers) ─────────────────────────────────────────
  if (exigida('CHUVEIROS_AUTOMATICOS') && (m.terminais ?? []).some((t) => t.tipoHidraulico === 'SPRINKLER') && (m.areasDeOperacao ?? []).length === 0 && criterio.risco) {
    const a = proporAreaDeOperacao(m, hip.hidraulica, criterio);
    const n = aplicar(a.comandos);
    etapa('AREA_DE_OPERACAO', 'Área de operação (a mais desfavorável)', 'LANCOU', n, a.motivo);
  } else etapa('AREA_DE_OPERACAO', 'Área de operação (a mais desfavorável)', exigida('CHUVEIROS_AUTOMATICOS') ? 'NADA_A_FAZER' : 'NAO_EXIGIDA', 0);

  // ── Sinalização, iluminação, detecção e alarme (pela rota) ────────────────
  const percurso = () => percursoDeFuga(m, grupo, descarga, hip.saidas.percursoMaximoM);
  if (exigida('SINALIZACAO')) {
    const n = aplicar(proporSinalizacao(m, analisarSinalizacao(m, percurso(), descarga)));
    etapa('SINALIZACAO', 'Sinalização da rota e dos equipamentos', 'LANCOU', n);
  } else etapa('SINALIZACAO', 'Sinalização da rota e dos equipamentos', 'NAO_EXIGIDA', 0);
  if (exigida('ILUMINACAO_EMERGENCIA')) {
    // Até 3 passadas: a luminária lançada muda o que a análise seguinte ainda acusa (o trecho
    // entre dois pontos obrigatórios só se mede com eles no lugar).
    let n = 0;
    for (let passada = 0; passada < 3; passada++) {
      const pc = percurso();
      const lote = proporIluminacao(m, pc, analisarIluminacao(m, pc, descarga, hip.iluminacao));
      if (lote.length === 0) break;
      // F6: cada luminária com o ponto de alimentação dela no circuito de iluminação.
      n += aplicar(kitDaPeca(m, lote).comandos);
    }
    etapa('ILUMINACAO', 'Iluminação de emergência ao longo das rotas', 'LANCOU', n);
  } else etapa('ILUMINACAO', 'Iluminação de emergência ao longo das rotas', 'NAO_EXIGIDA', 0);
  if (exigida('DETECCAO') || exigida('ALARME')) {
    let n = aplicar(proporAlarme(m, analisarAlarme(m, exigida('DETECCAO'), exigida('ALARME'))));
    // F3: o eletroduto do laço (central → dispositivos, e a prumada).
    n += aplicar(proporEletrodutoDoLaco(m));
    etapa('ALARME', 'Detecção e alarme (laço, central e eletroduto)', 'LANCOU', n);
  } else etapa('ALARME', 'Detecção e alarme (laço, central e eletroduto)', 'NAO_EXIGIDA', 0);

  // ── F5: a barra antipânico nas portas da rota ─────────────────────────────
  if (exigida('SAIDAS_EMERGENCIA')) {
    const saidas = analisarSaidas(m, classificacao.divisao.valor, hip.saidas, hip.classificacao.pisoDeDescargaLevelId, classificacao.altura.valorM);
    const n = aplicar(proporAntipanico(m, analisarAntipanico(m, percurso(), saidas)));
    etapa('ANTIPANICO', 'Barra antipânico nas portas da rota', 'LANCOU', n);
  } else etapa('ANTIPANICO', 'Barra antipânico nas portas da rota', 'NAO_EXIGIDA', 0);

  // (Fase B: bomba, jockey, pressostatos, recalque e reserva agora são propostos — o que cada passo
  // não resolveu entrou acima como "não decide", com o motivo.)

  // ── Conflitos que a proposta criou ────────────────────────────────────────
  const novos = new Set(criados);
  for (const c of conflitosArquitetonicos(m)) {
    if (!novos.has(c.pecaId) && !novos.has(c.outroId)) continue;
    pendencias.push({ grupo: 'CONFLITO', texto: `${c.classe.replace(/_/g, ' ').toLowerCase()} (${c.medidaMm} mm) — peça ${c.pecaId}.` });
  }

  // ── A conferência do resultado (a da emissão, menos o responsável) ────────
  const r = verificacoesIncendio(m, hip, RESPONSAVEL_VAZIO, analisesDeIncendio(m, hip));
  for (const v of r.verificacoes) {
    if (v.atende || v.grupo === 'RESPONSAVEL') continue;
    pendencias.push({ grupo: 'VERIFICACAO', texto: `${ROTULO_DO_GRUPO_DE_INCENDIO[v.grupo]} — ${v.item}: exigido ${v.exigido}; obtido ${v.obtido}.` });
  }

  return { comandos, criados, etapas, pendencias, resultado: m };
}

/** Reaplicar o lote no original cria os MESMOS ids? (ids determinísticos — a trava antes de gravar). */
export function conferirPlanoDoPpci(original: BlueprintModel, plano: PlanoDoPpci): { ok: true } | { ok: false; motivo: string } {
  if (plano.comandos.length === 0) return { ok: false, motivo: 'o gerador não tem nada a lançar' };
  try {
    const r = applyBatch(original, plano.comandos);
    const iguais = r.diff.created.length === plano.criados.length && r.diff.created.every((id, i) => id === plano.criados[i]);
    return iguais ? { ok: true } : { ok: false, motivo: 'o desenho mudou desde a prévia — gere de novo' };
  } catch (e) {
    return { ok: false, motivo: e instanceof Error ? e.message : String(e) };
  }
}


const ROTULO_DA_SITUACAO: Record<SituacaoDaEtapa, string> = { LANCOU: 'Lançou', NADA_A_FAZER: 'Nada a fazer', NAO_EXIGIDA: 'Não exigida', NAO_RODOU: 'Não rodou' };

/** E10.2: o RELATÓRIO do gerador — etapas e pendências — no formato dos memoriais (PDF/DOCX). */
export function relatorioDoPpci(plano: PlanoDoPpci, ctx: { nomeDoEstudo: string; geradoEm: string }): BlocoDoMemorial[] {
  const B: BlocoDoMemorial[] = [
    { tipo: 'titulo', texto: 'Gerador de PPCI — relatório' },
    { tipo: 'paragrafo', texto: `Estudo: ${ctx.nomeDoEstudo}. Gerado em ${ctx.geradoEm.slice(0, 10).split('-').reverse().join('/')}. ${plano.comandos.length} comando(s) num lote só (um Ctrl+Z desfaz tudo).` },
    { tipo: 'secao', texto: 'Etapas' },
    { tipo: 'tabela', cabecalho: ['Etapa', 'Situação', 'Comandos', 'Observação'], linhas: plano.etapas.map((e) => [e.rotulo, ROTULO_DA_SITUACAO[e.situacao], String(e.comandos), e.nota ?? '—']) },
  ];
  for (const g of ['VERIFICACAO', 'PREMISSA', 'SEM_SOLUCAO', 'CONFLITO', 'NAO_DECIDIDO', 'CONFERIR'] as GrupoDaPendencia[]) {
    const lista = plano.pendencias.filter((p) => p.grupo === g);
    if (!lista.length) continue;
    B.push({ tipo: 'secao', texto: `${ROTULO_DA_PENDENCIA[g]} (${lista.length})` }, ...lista.map((p): BlocoDoMemorial => ({ tipo: 'paragrafo', texto: `• ${p.texto}` })));
  }
  if (!plano.pendencias.some((p) => p.grupo === 'VERIFICACAO')) B.push({ tipo: 'paragrafo', texto: 'Nenhuma verificação em falta no resultado.' });
  return B;
}
