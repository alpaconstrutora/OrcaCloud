/**
 * INCÊNDIO E8.4 (01/10/2026): os MEMORIAIS (de cálculo e descritivo) e a
 * EMISSÃO do projeto de segurança contra incêndio com ART. Molde:
 * `blueprintMemorialHidro` (blocos) e `blueprintHidroExecutivo` (conferência,
 * hash da base, capa executiva).
 *
 * Tudo DERIVADO do desenho e das premissas do estudo (`blueprint_study_incendio`)
 * pelas MESMAS funções das gavetas — classificação e exigências (E0), cálculo
 * hidráulico e planilha de pressões (E2/E5/E8.2), bomba (E4), saídas e rota de
 * fuga (E6), extintores, sinalização, iluminação, detecção e alarme (E7). Se o
 * memorial divergisse da tela, um dos dois estaria errado.
 *
 * Cada seção só aparece se o sistema EXISTE no desenho ou é EXIGIDO pela
 * classificação. As medidas que o desenho não modela (acesso de viatura,
 * brigada, compartimentação…) entram como lista "a cargo do responsável" — não
 * bloqueiam a emissão, mas a capa diz.
 *
 * ⚠️ As tabelas de norma transcritas de memória (CONFERIR NA NORMA/IT) não
 * bloqueiam: a DECLARAÇÃO da capa diz que o responsável as conferiu no texto
 * vigente — quem emite é ele, não o programa.
 */
import type { BlueprintModel, TipoDePontoHidraulico } from './blueprintKernel';
import { KERNEL_VERSION, materialDoTrecho, sha256, snapshotHash, stableStringify } from './blueprintKernel';
import type { ResponsavelTecnico } from './blueprintTopografiaExecutivo';
import { nBr, type BlocoDoMemorial } from './blueprintMemorialHidro';
import { FICHA_DO_MATERIAL } from './blueprintHidraulicaPressao';
import {
  ROTULO_DO_PRESET,
  classificarEdificacao,
  exigenciasDaEdificacao,
  pavimentoDeDescarga,
  type ClassificacaoDaEdificacao,
  type ExigenciasDaEdificacao,
  type HipotesesIncendio,
  type MedidaDeSeguranca,
} from './blueprintIncendioClassificacao';
import { ROTULO_DA_FORMULA } from './blueprintHidraulicaIncendio';
import { calculoDoEstudo, planilhaDePressoes } from './blueprintPlanilhaDePressoes';
import { conferenciaDeIncendio } from './blueprintConferenciaIncendio';
import { pressurizacaoDaRede, type AnaliseDaBomba } from './blueprintBombeamentoIncendio';
import type { CalculoDeIncendio } from './blueprintCalculoIncendio';
import { ROTULO_DO_RISCO } from './blueprintSprinklersIncendio';
import { ROTULO_DA_PROTECAO, analisarSaidas, type AnaliseDeSaidas } from './blueprintSaidasIncendio';
import { percursoDeFuga, type PercursoDeFuga } from './blueprintRotaDeFuga';
import { ROTULO_DO_AGENTE, analisarExtintores, type AnaliseDeExtintores } from './blueprintExtintores';
import { analisarSinalizacao, type AnaliseDeSinalizacao } from './blueprintSinalizacao';
import { analisarIluminacao, type AnaliseDeIluminacao } from './blueprintIluminacaoEmergencia';
import { analisarAlarme, type AnaliseDeAlarme } from './blueprintDeteccaoAlarme';
import { analisarAntipanico } from './blueprintAntipanico';

// ─── As análises, uma vez ────────────────────────────────────────────────────

/** Tudo o que os memoriais e a conferência leem, calculado UMA vez (o cálculo hidráulico é caro). */
export interface AnalisesDeIncendio {
  classificacao: ClassificacaoDaEdificacao;
  exigencias: ExigenciasDaEdificacao;
  temRede: boolean;
  calculo: CalculoDeIncendio | null;
  bomba: AnaliseDaBomba | null;
  saidas: AnaliseDeSaidas;
  percurso: PercursoDeFuga;
  extintores: AnaliseDeExtintores;
  sinalizacao: AnaliseDeSinalizacao;
  iluminacao: AnaliseDeIluminacao;
  alarme: AnaliseDeAlarme;
}

export function analisesDeIncendio(model: BlueprintModel, hip: HipotesesIncendio): AnalisesDeIncendio {
  const classificacao = classificarEdificacao(model, hip.classificacao);
  const exigencias = exigenciasDaEdificacao(classificacao);
  const exigida = (id: MedidaDeSeguranca) => exigencias.medidas.some((x) => x.medida === id && x.estado === 'EXIGIDA');
  const descarga = pavimentoDeDescarga(model, hip.classificacao.pisoDeDescargaLevelId)?.id ?? null;
  const grupo = classificacao.divisao.valor?.trim().charAt(0).toUpperCase() || null;
  const percurso = percursoDeFuga(model, grupo, descarga, hip.saidas.percursoMaximoM);
  const temRede = (model.trechos ?? []).some((t) => t.disciplina === 'INCENDIO');
  const doEstudo = temRede ? calculoDoEstudo(model, hip) : null;
  return {
    classificacao,
    exigencias,
    temRede,
    calculo: doEstudo?.calculo ?? null,
    bomba: doEstudo?.bomba ?? null,
    saidas: analisarSaidas(model, classificacao.divisao.valor, hip.saidas, hip.classificacao.pisoDeDescargaLevelId, classificacao.altura.valorM),
    percurso,
    extintores: analisarExtintores(model, classificacao.carga.nivel, hip.extintores),
    sinalizacao: analisarSinalizacao(model, percurso, descarga),
    iluminacao: analisarIluminacao(model, percurso, descarga, hip.iluminacao),
    alarme: analisarAlarme(model, exigida('DETECCAO'), exigida('ALARME')),
  };
}

// ─── Utilidades ──────────────────────────────────────────────────────────────

export interface ContextoDoMemorialDeIncendio {
  nomeDoEstudo: string;
  /** ISO — quando o documento foi gerado. */
  geradoEm: string;
}

const dataBr = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');
const um = (v: number, casas = 1) => v.toLocaleString('pt-BR', { maximumFractionDigits: casas });
const pecasDoTipo = (model: BlueprintModel, tipos: TipoDePontoHidraulico[]) =>
  (model.terminais ?? []).filter((t) => t.disciplina === 'INCENDIO' && t.tipoHidraulico && tipos.includes(t.tipoHidraulico));
const nomeDoNivel = (model: BlueprintModel) => {
  const m = new Map(model.levels.map((l) => [l.id, l.name]));
  return (id: string) => m.get(id) ?? '—';
};
const ROTULO_DA_EXIGENCIA = { EXIGIDA: 'Exigida', DISPENSADA: 'Dispensada', CONDICIONAL: 'Condicional', SEM_TABELA: 'Sem tabela' } as const;
const simNao = (b: boolean | null) => (b === null ? 'Não avaliado' : b ? 'Atende' : 'Não atende');

/** As medidas que o desenho NÃO modela — ficam a cargo do responsável (memorial e capa dizem). */
export const MEDIDAS_NAO_MODELADAS: readonly MedidaDeSeguranca[] = [
  'ACESSO_VIATURA',
  'PLANO_INTERVENCAO',
  'SEGURANCA_ESTRUTURAL',
  'COMPARTIMENTACAO_HORIZONTAL',
  'COMPARTIMENTACAO_VERTICAL',
  'CONTROLE_MATERIAIS_ACABAMENTO',
  'ELEVADOR_EMERGENCIA',
  'CONTROLE_FUMACA',
  'BRIGADA',
];

function cabecalho(model: BlueprintModel, ctx: ContextoDoMemorialDeIncendio, titulo: string): BlocoDoMemorial[] {
  return [
    { tipo: 'titulo', texto: titulo },
    { tipo: 'paragrafo', texto: `Estudo: ${ctx.nomeDoEstudo}. Gerado em ${dataBr(ctx.geradoEm)}.` },
    {
      tipo: 'paragrafo',
      texto: `Documento derivado do modelo do desenho (base ${snapshotHash(model).slice(0, 16)}, ${KERNEL_VERSION}) e das premissas de incêndio do estudo. Alterado o desenho ou as premissas, deve ser gerado de novo. As tabelas marcadas CONFERIR NA NORMA/IT foram transcritas e devem ser conferidas no texto vigente. Não substitui a análise e a responsabilidade do profissional habilitado.`,
    },
  ];
}

function secaoDaClassificacao(a: AnalisesDeIncendio): BlocoDoMemorial[] {
  const c = a.classificacao;
  const B: BlocoDoMemorial[] = [
    { tipo: 'secao', texto: 'Classificação da edificação' },
    {
      tipo: 'tabela',
      cabecalho: ['Item', 'Valor', 'Origem'],
      linhas: [
        ['Regulamento', ROTULO_DO_PRESET[c.preset], '—'],
        ['Ocupação (divisão)', c.divisao.valor ? `${c.divisao.valor}${c.grupo ? ` — ${c.grupo.nome}` : ''}` : 'não definida', c.divisao.motivo],
        ['Altura para incêndio', `${um(c.altura.valorM, 2)} m — tipo ${c.tipoPorAltura.tipo} (${c.tipoPorAltura.nome})`, c.altura.descarga && c.altura.ultimo ? `de ${c.altura.descarga} a ${c.altura.ultimo}` : c.altura.origem],
        ['Área construída', `${um(c.areaTotalM2, 2)} m² em ${c.pavimentos} pavimento(s)`, 'do desenho'],
        ['Carga de incêndio', c.carga.valorMJm2 != null ? `${um(c.carga.valorMJm2, 0)} MJ/m² (${c.carga.nivel ?? '—'})` : 'não definida', c.carga.origem],
      ],
    },
  ];
  if (c.pendencias.length) B.push({ tipo: 'paragrafo', texto: `Pendências da classificação: ${c.pendencias.join('; ')}.` });
  const e = a.exigencias;
  B.push(
    { tipo: 'secao', texto: 'Medidas de segurança contra incêndio' },
    {
      tipo: 'tabela',
      cabecalho: ['Medida', 'Situação', 'Motivo', 'Fonte'],
      linhas: e.medidas.map((m) => [m.nome, ROTULO_DA_EXIGENCIA[m.estado] + (m.rascunho ? ' (CONFERIR NA IT)' : ''), m.motivo, m.fonte ?? '—']),
    },
  );
  if (e.temRascunho) B.push({ tipo: 'paragrafo', texto: 'Linhas marcadas CONFERIR NA IT foram transcritas de memória: não servem para aprovação até conferidas no texto do regulamento.' });
  return B;
}

// ─── Memorial de cálculo ─────────────────────────────────────────────────────

export function memorialDeCalculoIncendio(model: BlueprintModel, hip: HipotesesIncendio, ctx: ContextoDoMemorialDeIncendio, a: AnalisesDeIncendio = analisesDeIncendio(model, hip)): BlocoDoMemorial[] {
  const B: BlocoDoMemorial[] = [...cabecalho(model, ctx, 'Memorial de cálculo — segurança contra incêndio'), ...secaoDaClassificacao(a)];
  const nivel = nomeDoNivel(model);
  const h = hip.hidraulica;

  // ── Hidráulico ──────────────────────────────────────────────────────────────
  if (a.temRede && a.calculo) {
    B.push(
      { tipo: 'secao', texto: 'Sistema hidráulico — premissas' },
      {
        tipo: 'tabela',
        cabecalho: ['Premissa', 'Valor'],
        linhas: [
          ['Fórmula de perda de carga', ROTULO_DA_FORMULA[h.formula]],
          ['Hidrantes simultâneos', String(h.hidrantesSimultaneos)],
          ['Hidrante: vazão e pressão mínimas no esguicho', `${um(h.vazaoMinimaHidranteLmin, 0)} L/min · ${um(h.pressaoMinimaHidranteKpa, 0)} kPa`],
          ['Hidrante: mangueira', `ø${h.diametroMangueiraHidranteMm} mm · ${um(h.comprimentoMangueiraHidranteM, 0)} m`],
          ['Mangotinho: vazão e pressão mínimas', `${um(h.vazaoMinimaMangotinhoLmin, 0)} L/min · ${um(h.pressaoMinimaMangotinhoKpa, 0)} kPa`],
          ['Sprinkler: pressão mínima no bico', `${um(h.pressaoMinimaSprinklerKpa, 0)} kPa`],
          ['Pressão máxima na rede', `${um(h.pressaoMaximaKpa, 0)} kPa`],
          ['Velocidade máxima', `${nBr(h.velocidadeMaxMs)} m/s`],
          ['Autonomia da reserva técnica', `${um(h.autonomiaMin, 0)} min`],
        ],
      },
    );
    const p = planilhaDePressoes(model, a.calculo);
    B.push({ tipo: 'secao', texto: 'Sistema hidráulico — planilha de pressões' });
    if (p.motivo) B.push({ tipo: 'paragrafo', texto: `Sem planilha: ${p.motivo}.` });
    else {
      for (const r of p.resumo) B.push({ tipo: 'paragrafo', texto: r });
      B.push({ tipo: 'subsecao', texto: 'Trechos (o caminho crítico primeiro, marcado *)' }, { tipo: 'tabela', cabecalho: p.cabecalhoTrechos, linhas: p.trechos });
      B.push({ tipo: 'subsecao', texto: 'Peças abertas no cálculo' }, { tipo: 'tabela', cabecalho: p.cabecalhoPecas, linhas: p.pecas });
    }
    // Sprinklers: o critério.
    const cr = a.calculo.criterio;
    if (a.calculo.porSistema.sprinklers && cr) {
      B.push(
        { tipo: 'secao', texto: 'Chuveiros automáticos — critério' },
        {
          tipo: 'tabela',
          cabecalho: ['Item', 'Valor'],
          linhas: [
            ['Classe de risco', cr.risco ? `${ROTULO_DO_RISCO[cr.risco.valor]} (${cr.risco.motivo})` : 'não definida'],
            ['Densidade', cr.densidade ? `${nBr(cr.densidade.valorLminM2, 1)} L/min/m²` : '—'],
            ['Área de operação', cr.areaDeOperacao ? `${um(cr.areaDeOperacao.valorM2, 0)} m²` : '—'],
            ['Área máxima por sprinkler', cr.areaPorSprinkler ? `${nBr(cr.areaPorSprinkler.valorM2, 1)} m²` : '—'],
            ['Sprinklers na área', cr.sprinklersNaArea != null ? String(cr.sprinklersNaArea) : '—'],
            ['Vazão mínima por sprinkler', cr.vazaoPorSprinklerLmin != null ? `${nBr(cr.vazaoPorSprinklerLmin, 1)} L/min` : '—'],
            ['Vazão da área de operação', cr.vazaoDaAreaLmin != null ? `${um(cr.vazaoDaAreaLmin, 0)} L/min` : '—'],
          ],
        },
        { tipo: 'paragrafo', texto: `Fonte: ${cr.fonte}.` },
      );
    }
    // A bomba.
    const b = a.bomba;
    if (b) {
      const linhas: string[][] = [];
      if (b.projeto) linhas.push(['Ponto de projeto', `${um(b.projeto.vazaoLmin, 0)} L/min a ${nBr(b.projeto.alturaM, 1)} mca`, '—']);
      linhas.push(['Curva da bomba', b.temCurva ? 'informada' : 'não informada', b.temCurva ? 'Atende' : 'Não avaliado']);
      if (b.alturaNaVazaoDeProjetoM != null) linhas.push(['Altura da curva na vazão de projeto', `${nBr(b.alturaNaVazaoDeProjetoM, 1)} mca`, simNao(b.atendeProjeto)]);
      if (b.operacao) linhas.push(['Ponto de operação', `${um(b.operacao.vazaoLmin, 0)} L/min a ${nBr(b.operacao.alturaM, 1)} mca`, simNao(b.operacao.atende)]);
      if (b.cento50) linhas.push(['A 150 % da vazão de projeto', b.cento50.alturaM != null ? `${nBr(b.cento50.alturaM, 1)} mca (mín. ${nBr(b.cento50.minimoM, 1)})` : 'fora da curva', simNao(b.cento50.atende)]);
      if (b.shutoff) linhas.push(['Shutoff (estática no ponto mais baixo)', `${nBr(b.shutoff.alturaM, 1)} mca · máx. ${um(b.shutoff.estaticaMaximaKpa, 0)} kPa`, simNao(b.shutoff.atende)]);
      if (b.npsh) linhas.push(['NPSH disponível × requerido', `${nBr(b.npsh.disponivelM, 1)} m × ${b.npsh.requeridoM != null ? `${nBr(b.npsh.requeridoM, 1)} m` : '—'}`, simNao(b.npsh.atende)]);
      B.push({ tipo: 'secao', texto: 'Bombeamento' }, { tipo: 'tabela', cabecalho: ['Item', 'Valor', 'Situação'], linhas });
      const pr = pressurizacaoDaRede(model, hip.bombeamento, a.calculo);
      if (pr?.ajustes) {
        B.push({
          tipo: 'paragrafo',
          texto: `Pressostatos (${pr.pressostatos} na rede): jockey para a ${um(pr.ajustes.paradaJockeyKpa, 0)} kPa e parte a ${um(pr.ajustes.partidaJockeyKpa, 0)} kPa; a principal parte a ${um(pr.ajustes.partidaPrincipalKpa, 0)} kPa — CONFERIR NA IT.`,
        });
      }
    }
    // A reserva técnica.
    const rti = a.calculo.rti;
    B.push(
      { tipo: 'secao', texto: 'Reserva técnica de incêndio' },
      {
        tipo: 'tabela',
        cabecalho: ['Exigida', 'Critério', 'Disponível no desenho', 'Situação'],
        linhas: [[rti.exigidaL != null ? `${um(rti.exigidaL, 0)} L` : '—', rti.porTabela && rti.exigidaL === rti.porTabela.litros ? `IT 17, Tabela 4 — ${rti.porTabela.descricao}` : `vazão × ${um(rti.autonomiaMin, 0)} min`, `${um(rti.disponivelL, 0)} L em ${rti.caixas.length} reservatório(s)`, rti.exigidaL == null ? 'Não avaliado' : rti.disponivelL + 1e-6 >= rti.exigidaL ? 'Atende' : 'Não atende']],
      },
    );
  }

  // ── Saídas e rota de fuga ───────────────────────────────────────────────────
  const s = a.saidas;
  if (s.populacao.length || s.itens.length) {
    B.push({ tipo: 'secao', texto: 'Saídas de emergência' });
    if (s.populacao.length) {
      B.push({ tipo: 'subsecao', texto: 'População' }, { tipo: 'tabela', cabecalho: ['Pavimento', 'Pessoas', 'Contagem'], linhas: s.populacao.map((p) => [p.nome, String(p.pessoas), p.origem === 'DORMITORIOS' ? `${p.base} dormitório(s)` : `${um(p.base, 1)} m²`]) });
    }
    if (s.itens.length) {
      B.push(
        { tipo: 'subsecao', texto: 'Larguras' },
        {
          tipo: 'tabela',
          cabecalho: ['Saída', 'Pessoas', 'Pavimento crítico', 'UP', 'Exigida (m)', 'Desenhada (m)', 'Situação'],
          linhas: s.itens.map((i) => [i.rotulo, String(i.pessoas), i.pavimentoCritico, String(i.unidades), nBr(i.exigidaMm / 1000), nBr(i.desenhadaMm / 1000), i.atende ? 'Atende' : 'Não atende']),
        },
      );
    }
    if (s.protecao.length) {
      B.push(
        { tipo: 'subsecao', texto: 'Escadas' },
        {
          tipo: 'tabela',
          cabecalho: ['Escada', 'Exigida', 'Declarada', 'Portas sem corta-fogo', 'Situação'],
          linhas: s.protecao.map((e) => [e.rotulo, e.exigida ? ROTULO_DA_PROTECAO[e.exigida] : '—', e.declarada ? ROTULO_DA_PROTECAO[e.declarada] : 'não declarada', String(e.portasSemCortaFogo.length), simNao(e.atende)]),
        },
      );
    }
    B.push({ tipo: 'paragrafo', texto: `Fonte: ${s.fonte}.` });
  }
  const pc = a.percurso;
  if (pc.ambientes.length) {
    const naoAtendem = pc.ambientes.filter((r) => r.atende === false);
    B.push(
      { tipo: 'secao', texto: 'Percurso de fuga' },
      {
        tipo: 'paragrafo',
        texto: `Limite: ${um(pc.limiteM, 0)} m (${pc.motivo}). Mais longo: ${pc.maisLonga?.distanciaM != null ? `${um(pc.maisLonga.distanciaM, 1)} m (${pc.maisLonga.rotulo}, ${nivel(pc.maisLonga.levelId)})` : '—'}. ${naoAtendem.length ? `${naoAtendem.length} ambiente(s) acima do limite.` : 'Todos os ambientes dentro do limite.'}`,
      },
      {
        tipo: 'tabela',
        cabecalho: ['Ambiente', 'Pavimento', 'Distância (m)', 'Pela escada', 'Situação'],
        linhas: pc.ambientes.map((r) => [r.rotulo, nivel(r.levelId), r.distanciaM != null ? nBr(r.distanciaM, 1) : 'sem caminho', r.pelaEscada ? 'sim' : 'não', simNao(r.atende)]),
      },
    );
  }

  // ── Preventivos ─────────────────────────────────────────────────────────────
  const ex = a.extintores;
  if (ex.ambientes.length || ex.extintores.length) {
    B.push(
      { tipo: 'secao', texto: 'Extintores' },
      { tipo: 'paragrafo', texto: `Risco ${ex.risco.toLowerCase()} (${ex.motivoDoRisco}); distância máxima a percorrer ${um(ex.distanciaMaximaM, 0)} m. Fonte: ${ex.fonte}.` },
      {
        tipo: 'tabela',
        cabecalho: ['Ambiente', 'Pavimento', 'Classes', 'Pior distância (m)', 'Situação'],
        linhas: ex.ambientes.map((x) => [x.rotulo, nivel(x.levelId), x.classes.join(', ') || '—', x.distanciaM != null ? nBr(x.distanciaM, 1) : 'sem extintor', x.atende ? 'Atende' : 'Não atende']),
      },
    );
  }
  const il = a.iluminacao;
  if (il.luminarias || il.pontosObrigatorios.length) {
    B.push(
      { tipo: 'secao', texto: 'Iluminação de emergência' },
      {
        tipo: 'paragrafo',
        texto: `${il.luminarias} luminária(s); espaçamento máximo ${um(il.espacamentoM, 1)} m; ${il.pontosObrigatorios.filter((p) => !p.coberto).length} ponto(s) obrigatório(s) sem luminária e ${il.trechosSemLuz.length} trecho(s) da rota sem luz; ${il.autonomiaCurta.length} com autonomia abaixo da mínima. Fonte: ${il.fonte}.`,
      },
    );
  }
  const si = a.sinalizacao;
  if (pecasDoTipo(model, ['PLACA']).length || si.pontosDaRota.length) {
    B.push(
      { tipo: 'secao', texto: 'Sinalização de emergência' },
      {
        tipo: 'paragrafo',
        texto: `${pecasDoTipo(model, ['PLACA']).length} placa(s); ${si.equipamentosSemPlaca.length} equipamento(s) sem placa; ${si.pontosDaRota.filter((p) => !p.coberto).length} ponto(s) da rota sem placa de orientação; ${si.placasSemCodigo.length} placa(s) sem código. Fonte: ${si.fonte}.`,
      },
    );
  }
  const al = a.alarme;
  if (al.deteccaoExigida || al.alarmeExigido || al.ambientes.length) {
    B.push(
      { tipo: 'secao', texto: 'Detecção e alarme' },
      {
        tipo: 'paragrafo',
        texto: `Detecção ${al.deteccaoExigida ? 'exigida' : 'não exigida'}; alarme ${al.alarmeExigido ? 'exigido' : 'não exigido'}. ${al.ambientes.filter((x) => !x.atende).length} ambiente(s) com ponto fora do raio de detecção; ${al.longeDoAcionador.length} longe de acionador; ${al.pavimentosSemAvisador.length} pavimento(s) sem avisador; ${al.semCentral ? 'sem central' : 'com central'}; ${al.foraDoLaco.length} peça(s) fora do laço. Fonte: ${al.fonte}.`,
      },
    );
  }
  return B;
}

// ─── Memorial descritivo ─────────────────────────────────────────────────────

const NORMAS = [
  'Decreto e Instruções Técnicas do CBMMG (regulamento de segurança contra incêndio de Minas Gerais)',
  'NBR 13714 — Sistemas de hidrantes e de mangotinhos para combate a incêndio',
  'NBR 10897 — Sistemas de proteção contra incêndio por chuveiros automáticos',
  'NBR 12693 — Sistemas de proteção por extintores de incêndio',
  'NBR 13434 — Sinalização de segurança contra incêndio e pânico',
  'NBR 10898 — Sistema de iluminação de emergência',
  'NBR 17240 — Sistemas de detecção e alarme de incêndio',
  'NBR 9077 — Saídas de emergência em edifícios',
];

export function memorialDescritivoIncendio(model: BlueprintModel, hip: HipotesesIncendio, ctx: ContextoDoMemorialDeIncendio, a: AnalisesDeIncendio = analisesDeIncendio(model, hip)): BlocoDoMemorial[] {
  const B: BlocoDoMemorial[] = [...cabecalho(model, ctx, 'Memorial descritivo — segurança contra incêndio')];
  const c = a.classificacao;
  B.push(
    { tipo: 'secao', texto: 'Objeto' },
    {
      tipo: 'paragrafo',
      texto: `Projeto das medidas de segurança contra incêndio e pânico da edificação ${c.divisao.valor ? `de ocupação ${c.divisao.valor}${c.grupo ? ` (${c.grupo.nome})` : ''}` : '(ocupação não definida)'}, com ${um(c.areaTotalM2, 2)} m² em ${c.pavimentos} pavimento(s) e altura para incêndio de ${um(c.altura.valorM, 2)} m, conforme ${ROTULO_DO_PRESET[c.preset]}.`,
    },
    { tipo: 'secao', texto: 'Normas' },
    ...NORMAS.map((n): BlocoDoMemorial => ({ tipo: 'paragrafo', texto: `• ${n}` })),
  );

  // Os sistemas, com as peças que existem.
  const conta = (tipos: TipoDePontoHidraulico[]) => pecasDoTipo(model, tipos).length;
  const sistemas: string[] = [];
  const hid = conta(['HIDRANTE_SIMPLES', 'HIDRANTE_DUPLO']);
  const mg = conta(['MANGOTINHO']);
  if (hid || mg) {
    sistemas.push(
      `Hidrantes e mangotinhos: ${hid} hidrante(s) e ${mg} mangotinho(s) em abrigo, com mangueira ø${hip.hidraulica.diametroMangueiraHidranteMm} mm de ${um(hip.hidraulica.comprimentoMangueiraHidranteM, 0)} m e esguicho; ${conta(['HIDRANTE_RECALQUE'])} registro(s) de recalque para o Corpo de Bombeiros.`,
    );
  }
  const spk = conta(['SPRINKLER']);
  if (spk) sistemas.push(`Chuveiros automáticos: ${spk} sprinkler(s), ${conta(['VGA'])} válvula(s) de governo e alarme e ${conta(['CHAVE_FLUXO'])} chave(s) de fluxo.`);
  const bi = conta(['BOMBA_INCENDIO']);
  const bj = conta(['BOMBA_JOCKEY']);
  if (bi || bj) sistemas.push(`Bombeamento: ${bi} bomba(s) principal(is), ${bj} jockey e ${conta(['PRESSOSTATO'])} pressostato(s), com partida automática pela queda de pressão da rede.`);
  if (a.calculo) {
    const r = a.calculo.rti;
    sistemas.push(
      r.porTabela && r.exigidaL === r.porTabela.litros
        ? `Reserva técnica de incêndio: ${um(r.disponivelL, 0)} L no desenho, para os ${um(r.porTabela.litros, 0)} L da IT 17 do CBMMG (Tabela 4: ${r.porTabela.descricao}).`
        : `Reserva técnica de incêndio: ${um(r.disponivelL, 0)} L no desenho, para ${um(r.autonomiaMin, 0)} min de funcionamento.`,
    );
  }
  const ext = pecasDoTipo(model, ['EXTINTOR']);
  if (ext.length) {
    const porAgente = new Map<string, number>();
    for (const t of ext) {
      const k = t.agenteExtintor ? `${ROTULO_DO_AGENTE[t.agenteExtintor]}${t.capacidadeExtintora ? ` ${t.capacidadeExtintora}` : ''}` : 'agente não informado';
      porAgente.set(k, (porAgente.get(k) ?? 0) + 1);
    }
    sistemas.push(`Extintores: ${ext.length} unidade(s) — ${[...porAgente].map(([k, n]) => `${n} × ${k}`).join(', ')}.`);
  }
  const placas = pecasDoTipo(model, ['PLACA']);
  if (placas.length) {
    const codigos = [...new Set(placas.map((p) => p.codigoPlaca).filter(Boolean))].sort();
    sistemas.push(`Sinalização de emergência: ${placas.length} placa(s) fotoluminescente(s)${codigos.length ? ` (${codigos.join(', ')})` : ''}.`);
  }
  const lum = pecasDoTipo(model, ['LUMINARIA_EMERGENCIA']);
  if (lum.length) sistemas.push(`Iluminação de emergência: ${lum.length} luminária(s) autônoma(s) ao longo das rotas de fuga.`);
  const det = conta(['DETECTOR_FUMACA', 'DETECTOR_TEMPERATURA', 'DETECTOR_CHAMA']);
  const ac = conta(['ACIONADOR_MANUAL']);
  const av = conta(['AVISADOR']);
  const ce = conta(['CENTRAL_ALARME']);
  if (det || ac || av || ce) sistemas.push(`Detecção e alarme: ${det} detector(es), ${ac} acionador(es) manual(is), ${av} avisador(es) e ${ce} central(is).`);
  const escadas = a.saidas.protecao.length;
  if (escadas) sistemas.push(`Saídas de emergência: ${escadas} escada(s) — ${a.saidas.protecao.map((e) => `${e.rotulo} ${e.declarada ? ROTULO_DA_PROTECAO[e.declarada].toLowerCase() : '(proteção não declarada)'}`).join('; ')}.`);
  B.push({ tipo: 'secao', texto: 'Sistemas' });
  if (sistemas.length) B.push(...sistemas.map((t): BlocoDoMemorial => ({ tipo: 'paragrafo', texto: t })));
  else B.push({ tipo: 'paragrafo', texto: 'Nenhum sistema de incêndio lançado no desenho.' });

  // Tubulação por material × DN.
  const tubos = new Map<string, number>();
  for (const t of (model.trechos ?? []).filter((x) => x.disciplina === 'INCENDIO')) {
    const m = materialDoTrecho(t);
    const k = `${m ? FICHA_DO_MATERIAL[m].rotulo : 'material não informado'}|${t.bitolaMm}`;
    tubos.set(k, (tubos.get(k) ?? 0) + Math.hypot(t.b.x - t.a.x, t.b.y - t.a.y, t.cotaBMm - t.cotaAMm) / 1000);
  }
  if (tubos.size) {
    B.push(
      { tipo: 'secao', texto: 'Materiais' },
      {
        tipo: 'tabela',
        cabecalho: ['Tubulação', 'DN', 'Comprimento (m)'],
        linhas: [...tubos].sort(([a1], [b1]) => a1.localeCompare(b1)).map(([k, l]) => {
          const [mat, dn] = k.split('|');
          return [mat, dn, nBr(l, 1)];
        }),
      },
    );
  }

  // O que o desenho não modela.
  const naoModeladas = a.exigencias.medidas.filter((m) => m.estado === 'EXIGIDA' && MEDIDAS_NAO_MODELADAS.includes(m.medida));
  if (naoModeladas.length) {
    B.push(
      { tipo: 'secao', texto: 'Medidas exigidas a cargo do responsável' },
      { tipo: 'paragrafo', texto: `O desenho não modela estas medidas exigidas; o projeto delas é do responsável técnico: ${naoModeladas.map((m) => m.nome.toLowerCase()).join('; ')}.` },
    );
  }
  B.push(
    { tipo: 'secao', texto: 'Execução e ensaios' },
    {
      tipo: 'paragrafo',
      texto: 'A rede de hidrantes e de chuveiros automáticos deve ser ensaiada em estanqueidade antes do fechamento e as bombas testadas em vazão e pressão de projeto. Equipamentos e sinalização devem ser certificados conforme as normas acima. Medidas e alturas indicadas como CONFERIR NA IT devem ser confirmadas no texto vigente.',
    },
  );
  return B;
}

// ─── Conferência e emissão ───────────────────────────────────────────────────

export type GrupoDaVerificacaoDeIncendio = 'RESPONSAVEL' | 'DADOS' | 'EXIGENCIAS' | 'REDE' | 'NBR13714' | 'NBR10897' | 'CBMMG' | 'SAIDAS' | 'PREVENTIVOS';

export interface VerificacaoIncendio {
  grupo: GrupoDaVerificacaoDeIncendio;
  item: string;
  norma: string;
  exigido: string;
  obtido: string;
  atende: boolean;
}

export interface ResultadoIncendioExecutivo {
  verificacoes: VerificacaoIncendio[];
  podeEmitir: boolean;
  pendencias: string[];
}

export const ROTULO_DO_GRUPO_DE_INCENDIO: Record<GrupoDaVerificacaoDeIncendio, string> = {
  RESPONSAVEL: 'Responsável técnico',
  DADOS: 'Classificação',
  EXIGENCIAS: 'Medidas exigidas no desenho',
  REDE: 'Rede de incêndio — lançamento',
  NBR13714: 'Hidrantes e mangotinhos — NBR 13714',
  NBR10897: 'Chuveiros automáticos — NBR 10897',
  CBMMG: 'Rede, recalque, bombas e reserva — IT do CBMMG',
  SAIDAS: 'Saídas e rota de fuga — NBR 9077',
  PREVENTIVOS: 'Extintores, sinalização, iluminação e alarme',
};

export function verificacoesIncendio(model: BlueprintModel, hip: HipotesesIncendio, responsavel: ResponsavelTecnico, a: AnalisesDeIncendio = analisesDeIncendio(model, hip)): ResultadoIncendioExecutivo {
  const v: VerificacaoIncendio[] = [];
  const sigla = responsavel.conselho === 'CAU' ? 'RRT' : 'ART';
  v.push({
    grupo: 'RESPONSAVEL',
    item: 'Responsável técnico identificado',
    norma: 'Lei 5.194/66 · Lei 12.378/10',
    exigido: 'nome e registro no conselho',
    obtido: responsavel.nome.trim() && responsavel.registro.trim() ? `${responsavel.nome} (${responsavel.conselho} ${responsavel.registro})` : 'incompleto',
    atende: !!(responsavel.nome.trim() && responsavel.registro.trim()),
  });
  v.push({
    grupo: 'RESPONSAVEL',
    item: `${sigla} recolhida`,
    norma: responsavel.conselho === 'CAU' ? 'Lei 12.378/10' : 'Lei 6.496/77',
    exigido: 'número e data',
    obtido: responsavel.artNumero.trim() && responsavel.artData ? `nº ${responsavel.artNumero}` : 'incompleta',
    atende: !!(responsavel.artNumero.trim() && responsavel.artData),
  });

  // ── Classificação ─────────────────────────────────────────────────────────
  const c = a.classificacao;
  v.push({ grupo: 'DADOS', item: 'Ocupação definida', norma: 'Regulamento do CBMMG', exigido: 'a divisão da ocupação', obtido: c.divisao.valor ?? 'não definida', atende: !!c.divisao.valor });
  v.push({ grupo: 'DADOS', item: 'Regulamento com tabela de exigências', norma: ROTULO_DO_PRESET[c.preset], exigido: 'a tabela do estado', obtido: a.exigencias.temTabela ? 'há' : 'sem tabela — cole o texto do regulamento', atende: a.exigencias.temTabela });

  // ── As medidas exigidas, no desenho ───────────────────────────────────────
  const exigida = (id: MedidaDeSeguranca) => a.exigencias.medidas.some((x) => x.medida === id && x.estado === 'EXIGIDA');
  const conta = (tipos: TipoDePontoHidraulico[]) => pecasDoTipo(model, tipos).length;
  const presenca: [MedidaDeSeguranca, string, TipoDePontoHidraulico[]][] = [
    ['HIDRANTES', 'Hidrantes ou mangotinhos', ['HIDRANTE_SIMPLES', 'HIDRANTE_DUPLO', 'MANGOTINHO']],
    ['CHUVEIROS_AUTOMATICOS', 'Chuveiros automáticos', ['SPRINKLER']],
    ['EXTINTORES', 'Extintores', ['EXTINTOR']],
    ['SINALIZACAO', 'Sinalização de emergência', ['PLACA']],
    ['ILUMINACAO_EMERGENCIA', 'Iluminação de emergência', ['LUMINARIA_EMERGENCIA']],
    ['DETECCAO', 'Detectores', ['DETECTOR_FUMACA', 'DETECTOR_TEMPERATURA', 'DETECTOR_CHAMA']],
    ['ALARME', 'Acionadores e avisadores', ['ACIONADOR_MANUAL', 'AVISADOR']],
  ];
  for (const [medida, rotulo, tipos] of presenca) {
    if (!exigida(medida)) continue;
    const n = conta(tipos);
    v.push({ grupo: 'EXIGENCIAS', item: `${rotulo} no desenho`, norma: 'Regulamento do CBMMG', exigido: 'medida exigida pela classificação', obtido: n ? `${n} no desenho` : 'nenhum', atende: n > 0 });
  }

  // ── Rede e hidráulica: a MESMA conferência da gaveta de cálculo (a reserva técnica inclusa) ──
  if (a.temRede && a.calculo) {
    const pr = pressurizacaoDaRede(model, hip.bombeamento, a.calculo);
    for (const x of conferenciaDeIncendio(model, a.calculo, a.calculo.hip, a.bomba, pr)) {
      if (x.estado === 'NAO_AVALIADO') continue;
      const grupo: GrupoDaVerificacaoDeIncendio = x.grupo === 'NBR 13714' ? 'NBR13714' : x.grupo === 'NBR 10897' ? 'NBR10897' : x.grupo === 'CBMMG' ? 'CBMMG' : 'REDE';
      v.push({ grupo, item: x.item, norma: x.grupo === 'Lançamento' ? '—' : x.grupo, exigido: x.exigido, obtido: x.obtido, atende: x.estado === 'ATENDE' });
    }
  }

  // ── Saídas e rota ─────────────────────────────────────────────────────────
  for (const i of a.saidas.itens) {
    v.push({ grupo: 'SAIDAS', item: `Largura — ${i.rotulo}`, norma: 'NBR 9077 · IT do CBMMG', exigido: `≥ ${nBr(i.exigidaMm / 1000)} m (${i.unidades} UP)`, obtido: `${nBr(i.desenhadaMm / 1000)} m`, atende: i.atende });
  }
  for (const e of a.saidas.protecao) {
    if (e.atende === null) continue;
    v.push({ grupo: 'SAIDAS', item: `Proteção da escada — ${e.rotulo}`, norma: 'NBR 9077 · IT do CBMMG', exigido: e.exigida ? ROTULO_DA_PROTECAO[e.exigida] : '—', obtido: e.declarada ? ROTULO_DA_PROTECAO[e.declarada] : 'não declarada', atende: e.atende });
  }
  // F5: a barra antipânico nas portas por onde a rota passa (regra CONFERIR NA IT).
  const portas = analisarAntipanico(model, a.percurso, a.saidas).filter((p) => p.exigida);
  if (portas.length) {
    const sem = portas.filter((p) => !p.tem);
    v.push({ grupo: 'SAIDAS', item: 'Barra antipânico nas portas da rota', norma: 'NBR 11785 · IT do CBMMG — CONFERIR', exigido: `${portas.length} porta(s): ${portas[0].motivo}`, obtido: sem.length ? `${sem.length} sem a barra` : 'todas com a barra', atende: sem.length === 0 });
  }
  const longas = a.percurso.ambientes.filter((r) => r.atende === false);
  if (a.percurso.ambientes.length) {
    v.push({ grupo: 'SAIDAS', item: 'Percurso de fuga de todos os ambientes', norma: 'NBR 9077 · IT do CBMMG', exigido: `≤ ${um(a.percurso.limiteM, 0)} m`, obtido: longas.length ? `${longas.length} acima (pior ${longas[0].rotulo})` : `pior ${a.percurso.maisLonga?.distanciaM != null ? `${um(a.percurso.maisLonga.distanciaM, 1)} m` : '—'}`, atende: longas.length === 0 });
  }

  // ── Preventivos ───────────────────────────────────────────────────────────
  if (exigida('EXTINTORES') || a.extintores.extintores.length) {
    const fora = a.extintores.ambientes.filter((x) => !x.atende);
    v.push({ grupo: 'PREVENTIVOS', item: 'Extintor ao alcance em todo ambiente', norma: 'NBR 12693 · IT do CBMMG', exigido: `≤ ${um(a.extintores.distanciaMaximaM, 0)} m a percorrer, classe do ambiente`, obtido: fora.length ? `${fora.length} ambiente(s) fora` : 'todos', atende: fora.length === 0 && a.extintores.pavimentosSemExtintor.length === 0 });
    const capacidade = a.extintores.extintores.filter((x) => x.capacidadeAtende === false);
    v.push({ grupo: 'PREVENTIVOS', item: 'Capacidade extintora', norma: 'NBR 12693', exigido: `mínima do risco ${a.extintores.risco.toLowerCase()}`, obtido: capacidade.length ? `${capacidade.length} abaixo` : 'todas', atende: capacidade.length === 0 });
  }
  if (exigida('SINALIZACAO') || conta(['PLACA'])) {
    const faltas = a.sinalizacao.equipamentosSemPlaca.length + a.sinalizacao.pontosDaRota.filter((p) => !p.coberto).length + a.sinalizacao.placasSemCodigo.length;
    v.push({ grupo: 'PREVENTIVOS', item: 'Sinalização de equipamentos e da rota', norma: 'NBR 13434', exigido: 'placa em cada equipamento e em cada mudança de direção/saída', obtido: faltas ? `${faltas} falta(s)` : 'completa', atende: faltas === 0 });
  }
  if (exigida('ILUMINACAO_EMERGENCIA') || a.iluminacao.luminarias) {
    const faltas = a.iluminacao.pontosObrigatorios.filter((p) => !p.coberto).length + a.iluminacao.trechosSemLuz.length + a.iluminacao.autonomiaCurta.length;
    v.push({ grupo: 'PREVENTIVOS', item: 'Iluminação de emergência ao longo das rotas', norma: 'NBR 10898', exigido: `espaçamento ≤ ${um(a.iluminacao.espacamentoM, 1)} m e pontos obrigatórios`, obtido: faltas ? `${faltas} falta(s)` : 'completa', atende: faltas === 0 });
  }
  if (a.alarme.deteccaoExigida || a.alarme.alarmeExigido) {
    const al = a.alarme;
    const faltas = al.ambientes.filter((x) => !x.atende).length + al.longeDoAcionador.length + al.pavimentosSemAvisador.length + (al.semCentral ? 1 : 0) + al.foraDoLaco.length;
    v.push({ grupo: 'PREVENTIVOS', item: 'Detecção e alarme', norma: 'NBR 17240', exigido: 'cobertura, acionador a ≤ 30 m, avisador por pavimento, central e laço', obtido: faltas ? `${faltas} falta(s)` : 'completo', atende: faltas === 0 });
  }

  const pendencias = v.filter((x) => !x.atende).map((x) => `${x.item}: ${x.obtido}`);
  return { verificacoes: v, podeEmitir: pendencias.length === 0, pendencias };
}

/** O hash da BASE da emissão: desenho + premissas de incêndio. Muda qualquer um, a emissão deixa de valer. */
export function hashDaBaseIncendio(model: BlueprintModel, hip: HipotesesIncendio): { desenho: string; base: string } {
  const desenho = snapshotHash(model);
  return { desenho, base: sha256(stableStringify({ desenho, hipoteses: hip })) };
}

/** A capa executiva + o memorial de cálculo + o descritivo, como blocos (o que a emissão grava). */
export function memorialExecutivoIncendio(
  model: BlueprintModel,
  hip: HipotesesIncendio,
  responsavel: ResponsavelTecnico,
  r: ResultadoIncendioExecutivo,
  ctx: { nomeDoEstudo: string; hashDoDesenho: string; hashDaBase: string; emitidoEm: string },
  a: AnalisesDeIncendio = analisesDeIncendio(model, hip),
): BlocoDoMemorial[] {
  const sigla = responsavel.conselho === 'CAU' ? 'RRT' : 'ART';
  const naoModeladas = a.exigencias.medidas.filter((m) => m.estado === 'EXIGIDA' && MEDIDAS_NAO_MODELADAS.includes(m.medida));
  const B: BlocoDoMemorial[] = [
    { tipo: 'titulo', texto: 'Projeto de segurança contra incêndio e pânico' },
    { tipo: 'paragrafo', texto: `Estudo: ${ctx.nomeDoEstudo}. Emitido em ${dataBr(ctx.emitidoEm)}.` },
    { tipo: 'secao', texto: 'Responsável técnico' },
    {
      tipo: 'tabela',
      cabecalho: ['Nome', 'Título', 'Registro', sigla, 'Data'],
      linhas: [[responsavel.nome, responsavel.titulo, `${responsavel.conselho} ${responsavel.registro}`, responsavel.artNumero, responsavel.artData ? dataBr(responsavel.artData) : '—']],
    },
    { tipo: 'secao', texto: 'Base do projeto' },
    { tipo: 'paragrafo', texto: `Desenho ${ctx.hashDoDesenho.slice(0, 16)} e premissas ${ctx.hashDaBase.slice(0, 16)} (${KERNEL_VERSION}). Alterada a base — o desenho ou as premissas —, esta emissão deixa de valer.` },
    { tipo: 'secao', texto: 'Verificações' },
    {
      tipo: 'tabela',
      cabecalho: ['Grupo', 'Verificação', 'Norma', 'Exigido', 'Obtido', 'Resultado'],
      linhas: r.verificacoes.map((x) => [ROTULO_DO_GRUPO_DE_INCENDIO[x.grupo], x.item, x.norma, x.exigido, x.obtido, x.atende ? 'Atende' : 'Não atende']),
    },
    { tipo: 'secao', texto: 'Declaração' },
    {
      tipo: 'paragrafo',
      texto: `O responsável técnico acima declara ter conferido o projeto e os cálculos deste documento — inclusive, no texto vigente do regulamento e das normas, os valores e tabelas indicados como CONFERIR NA NORMA/IT${naoModeladas.length ? `, e ter projetado as medidas exigidas que o desenho não modela (${naoModeladas.map((m) => m.nome.toLowerCase()).join('; ')})` : ''} — e responde por eles pela ${sigla} indicada. Os cálculos foram gerados pelo programa a partir do desenho; o programa não substitui o profissional habilitado.`,
    },
  ];
  const ctxMemorial = { nomeDoEstudo: ctx.nomeDoEstudo, geradoEm: ctx.emitidoEm };
  // Os dois memoriais sem os cabeçalhos próprios (a capa já diz estudo, data e base).
  const semCabecalho = (b: BlocoDoMemorial[]) => b.slice(3);
  const calculo = memorialDeCalculoIncendio(model, hip, ctxMemorial, a);
  const descritivo = memorialDescritivoIncendio(model, hip, ctxMemorial, a);
  B.push({ tipo: 'titulo', texto: 'Memorial de cálculo' }, ...semCabecalho(calculo));
  B.push({ tipo: 'titulo', texto: 'Memorial descritivo' }, ...semCabecalho(descritivo));
  return B;
}
