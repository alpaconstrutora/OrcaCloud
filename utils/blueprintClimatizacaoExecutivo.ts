/**
 * PROJETO DE CLIMATIZAÇÃO com ART (07/10/2026, E8.4 do roadmap de climatização).
 *
 * O molde é o do incêndio (`blueprintIncendioExecutivo`): o responsável se
 * identifica, as VERIFICAÇÕES saem das MESMAS conferências das gavetas (carga
 * térmica, seleção, linha e dreno, VRF, rede de ar) — o estado FALTA não
 * atende, o AVISO atende com o aviso escrito, o NÃO AVALIADO não entra — e a
 * emissão só habilita com todas atendidas. A emissão é imutável e amarrada ao
 * hash da BASE: o desenho, as premissas do estudo E o que a carga lê de fora
 * do desenho (os materiais da biblioteca e a cidade do contexto) — mudou um
 * deles, a emissão deixa de valer.
 *
 * O software não emite projeto — quem emite é o responsável técnico.
 */
import type { BlueprintModel } from './blueprintKernel';
import { KERNEL_VERSION, sha256, snapshotHash, stableStringify } from './blueprintKernel';
import type { ResponsavelTecnico } from './blueprintTopografiaExecutivo';
import type { BlocoDoMemorial } from './blueprintMemorialHidro';
import type { HipotesesClimatizacao } from './blueprintClimatizacao';
import type { CargaTermicaDoNivel } from './blueprintCargaTermica';
import { conferenciaDeCargaTermica, type ItemConferido } from './blueprintConferenciaClimatizacao';
import { selecaoDoNivel } from './blueprintSelecaoClimatizacao';
import { conferenciaDaLinha } from './blueprintLinhaFrigorigena';
import { conferenciaDoVrf } from './blueprintVrf';
import { analisarRedesDeAr, conferenciaDaRedeDeAr, vazoesDosTerminais, ventilacaoDoNivel } from './blueprintRedeDeAr';
import { memorialDeCalculoClimatizacao, memorialDescritivoClimatizacao, type ContextoDoMemorial } from './blueprintMemorialClimatizacao';

export type GrupoDaVerificacaoDeClimatizacao = 'RESPONSAVEL' | 'CARGA' | 'SELECAO' | 'LINHA' | 'VRF' | 'AR';

export interface VerificacaoClimatizacao {
  grupo: GrupoDaVerificacaoDeClimatizacao;
  item: string;
  norma: string;
  exigido: string;
  obtido: string;
  atende: boolean;
}

export interface ResultadoClimatizacaoExecutivo {
  verificacoes: VerificacaoClimatizacao[];
  podeEmitir: boolean;
  pendencias: string[];
}

export const ROTULO_DO_GRUPO_DE_CLIMATIZACAO: Record<GrupoDaVerificacaoDeClimatizacao, string> = {
  RESPONSAVEL: 'Responsável técnico',
  CARGA: 'Carga térmica — NBR 16655-3',
  SELECAO: 'Equipamentos × carga',
  LINHA: 'Linha frigorígena e dreno',
  VRF: 'Sistemas VRF',
  AR: 'Rede de ar e renovação — NBR 16401',
};

/** O que vai dentro do hash além do desenho e das premissas: o que a carga lê de FORA do desenho. */
export interface BaseExternaDaClimatizacao {
  materiais?: readonly unknown[];
  cidadeDoContexto?: string | null;
}

const dataBr = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');

/** A conferência de um painel vira verificação: FALTA não atende, AVISO atende (dito no obtido), NÃO AVALIADO não entra. */
function daConferencia(grupo: GrupoDaVerificacaoDeClimatizacao, norma: string, sufixo: string, itens: readonly ItemConferido[]): VerificacaoClimatizacao[] {
  return itens
    .filter((i) => i.estado !== 'NAO_AVALIADO')
    .map((i) => ({
      grupo,
      item: `${i.item}${sufixo}`,
      norma,
      exigido: '—',
      obtido: i.estado === 'AVISO' ? `aviso: ${i.obtido}` : i.obtido,
      atende: i.estado !== 'FALTA',
    }));
}

/**
 * As verificações da emissão. `niveis` = a carga do estudo (`cargaTermicaDoEstudo`,
 * com os materiais e a cidade do contexto) — a MESMA que a tela e o memorial usam.
 */
export function verificacoesClimatizacao(
  model: BlueprintModel,
  niveis: readonly CargaTermicaDoNivel[],
  hip: HipotesesClimatizacao,
  responsavel: ResponsavelTecnico,
  nomeDoNivel: (levelId: string) => string,
): ResultadoClimatizacaoExecutivo {
  const v: VerificacaoClimatizacao[] = [];
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

  const climatizados = niveis.reduce((s, n) => s + n.ambientes.filter((a) => a.climatizado).length, 0);
  v.push({ grupo: 'CARGA', item: 'Ambiente climatizado no desenho', norma: 'NBR 16655-3', exigido: 'pelo menos um', obtido: climatizados ? `${climatizados} ambiente(s)` : 'nenhum', atende: climatizados > 0 });

  for (const n of niveis) {
    if (!n.ambientes.some((a) => a.climatizado)) continue;
    const em = ` — ${nomeDoNivel(n.levelId)}`;
    v.push(...daConferencia('CARGA', 'NBR 16655-3', em, conferenciaDeCargaTermica(n).itens));
    // O catálogo é da organização, não do projeto: a seleção confere só equipamento × carga.
    v.push(...daConferencia('SELECAO', 'NBR 16655-3 · catálogo do fabricante', em, selecaoDoNivel(model, n, hip.selecao, []).conferencia.filter((i) => i.codigo !== 'CATALOGO')));
  }
  const ordem = [...model.levels].sort((a, b) => a.elevationMm - b.elevationMm);
  for (const l of ordem) {
    const em = ` — ${nomeDoNivel(l.id)}`;
    v.push(...daConferencia('LINHA', 'catálogo do fabricante (HIPÓTESE)', em, conferenciaDaLinha(model, l.id, hip.linha)));
    v.push(...daConferencia('VRF', 'catálogo do fabricante (HIPÓTESE)', em, conferenciaDoVrf(model, l.id, hip.vrf)));
  }
  for (const n of niveis) {
    const redes = analisarRedesDeAr(model, n.levelId, vazoesDosTerminais(model, n, hip.ar), hip.ar);
    const ventilacao = ventilacaoDoNivel(model, n, hip.ar);
    if (!redes.length && !ventilacao.some((x) => x.exaustores || x.tomadasDeAr || x.falta)) continue;
    v.push(...daConferencia('AR', 'NBR 16401-1 e -3', ` — ${nomeDoNivel(n.levelId)}`, conferenciaDaRedeDeAr(redes, ventilacao, hip.ar)));
  }

  const pendencias = v.filter((x) => !x.atende).map((x) => `${x.item}: ${x.obtido}`);
  return { verificacoes: v, podeEmitir: pendencias.length === 0, pendencias };
}

/** O hash da BASE: desenho + premissas + o que a carga lê de fora do desenho (materiais, cidade). */
export function hashDaBaseClimatizacao(model: BlueprintModel, hip: HipotesesClimatizacao, externa: BaseExternaDaClimatizacao = {}): { desenho: string; base: string } {
  const desenho = snapshotHash(model);
  return { desenho, base: sha256(stableStringify({ desenho, hipoteses: hip, materiais: externa.materiais ?? [], cidadeDoContexto: externa.cidadeDoContexto ?? null })) };
}

/** A capa executiva + o memorial de cálculo + o descritivo, como blocos (o que a emissão grava). */
export function memorialExecutivoClimatizacao(
  model: BlueprintModel,
  niveis: CargaTermicaDoNivel[],
  hip: HipotesesClimatizacao,
  responsavel: ResponsavelTecnico,
  r: ResultadoClimatizacaoExecutivo,
  ctx: { nomeDoEstudo: string; hashDoDesenho: string; hashDaBase: string; emitidoEm: string; nomeDoNivel: (levelId: string) => string },
): BlocoDoMemorial[] {
  const sigla = responsavel.conselho === 'CAU' ? 'RRT' : 'ART';
  const B: BlocoDoMemorial[] = [
    { tipo: 'titulo', texto: 'Projeto de climatização' },
    { tipo: 'paragrafo', texto: `Estudo: ${ctx.nomeDoEstudo}. Emitido em ${dataBr(ctx.emitidoEm)}.` },
    { tipo: 'secao', texto: 'Responsável técnico' },
    {
      tipo: 'tabela',
      cabecalho: ['Nome', 'Título', 'Registro', sigla, 'Data'],
      linhas: [[responsavel.nome, responsavel.titulo, `${responsavel.conselho} ${responsavel.registro}`, responsavel.artNumero, responsavel.artData ? dataBr(responsavel.artData) : '—']],
    },
    { tipo: 'secao', texto: 'Base do projeto' },
    { tipo: 'paragrafo', texto: `Desenho ${ctx.hashDoDesenho.slice(0, 16)} e premissas ${ctx.hashDaBase.slice(0, 16)} (${KERNEL_VERSION}). Alterada a base — o desenho, as premissas do estudo, os materiais da biblioteca ou a cidade do contexto —, esta emissão deixa de valer.` },
    { tipo: 'secao', texto: 'Verificações' },
    {
      tipo: 'tabela',
      cabecalho: ['Grupo', 'Verificação', 'Norma', 'Obtido', 'Resultado'],
      linhas: r.verificacoes.map((x) => [ROTULO_DO_GRUPO_DE_CLIMATIZACAO[x.grupo], x.item, x.norma, x.obtido, x.atende ? 'Atende' : 'Não atende']),
    },
    { tipo: 'secao', texto: 'Declaração' },
    {
      tipo: 'paragrafo',
      texto: `O responsável técnico acima declara ter conferido o projeto e os cálculos deste documento — inclusive, no texto vigente das normas (NBR 16655, NBR 16401, NBR 15220) e no catálogo do fabricante dos equipamentos escolhidos, os valores e tabelas indicados como CONFERIR NA NORMA ou HIPÓTESE — e responde por eles pela ${sigla} indicada. Os cálculos foram gerados pelo programa a partir do desenho; o programa não substitui o profissional habilitado.`,
    },
  ];
  const ctxMemorial: ContextoDoMemorial = { nomeDoEstudo: ctx.nomeDoEstudo, geradoEm: ctx.emitidoEm, nomeDoNivel: ctx.nomeDoNivel };
  // Os dois memoriais sem o título próprio (a capa já diz estudo, data e base).
  const semTitulo = (b: BlocoDoMemorial[]) => b.filter((x, i) => !(i === 0 && x.tipo === 'titulo'));
  B.push({ tipo: 'titulo', texto: 'Memorial de cálculo' }, ...semTitulo(memorialDeCalculoClimatizacao(niveis, hip, ctxMemorial, model)));
  B.push({ tipo: 'titulo', texto: 'Memorial descritivo' }, ...semTitulo(memorialDescritivoClimatizacao(niveis, hip, ctxMemorial, model)));
  return B;
}
