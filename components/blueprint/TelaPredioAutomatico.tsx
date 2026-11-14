/**
 * TELA "Prédio automático" (PA2 do plano docs/planos/2026-11-12-predio-automatico.md, 13/11/2026): do BLOCO da massa ao
 * prédio — o pavimento tipo com as cópias vivas, a planta das unidades e o tipo levando as instalações aos andares — numa
 * prévia gerada no Web Worker, com o resumo, a planta de cada pavimento, as etapas e o relatório, e as duas saídas:
 * "Lançar" (um lote, um Ctrl+Z — com a trava `conferirPlanoDoPredio` antes) e "Criar alternativa". Molde:
 * `TelaCasaAutomatica` (as mesmas abas, a barra com as ações e a faixa de estado).
 */
import React, { useEffect, useRef, useState } from 'react';
import { Building2, ChevronDown, ChevronRight, ClipboardList, MapPin, Play, Settings2, Square, Wand2 } from 'lucide-react';

import Button from '../ui/Button';
import { SecaoTitulo } from '../ui/SecaoTitulo';
import { TabsBar, type TabsBarItem } from '../ui/TabsBar';
import PlantaDaPrevia, { type DisciplinaDaPrevia, type MarcaNaPrevia } from './PlantaDaPrevia';
import { Numero } from './TelaCasaAutomatica';
import { disciplinaDoLocal } from '../../utils/blueprintLocalDaPendencia';
import { ROTULO_DA_PENDENCIA, type GrupoDaPendencia, type PendenciaDoPpci, type SituacaoDaEtapa } from '../../utils/blueprintGeradorPpci';
import { ROTULO_DO_ESQUEMA } from '../../utils/blueprintPavimentoTipoDaMassa';
import type { Produto, ProdutoDoBloco } from '../../utils/blueprintProduto';
import type { HipotesesDoPredio } from '../../utils/blueprintPredioAutomatico';
import type { EstadoDoPredioAutomatico } from '../../hooks/usePredioAutomatico';

const COR_DA_SITUACAO: Record<SituacaoDaEtapa, string> = {
  LANCOU: 'text-emerald-700',
  NADA_A_FAZER: 'text-slate-500',
  NAO_EXIGIDA: 'text-slate-400',
  NAO_RODOU: 'text-amber-700',
  CALCULOU: 'text-sky-700',
};
const ROTULO_DA_SITUACAO: Record<SituacaoDaEtapa, string> = { LANCOU: 'lança', NADA_A_FAZER: 'nada a fazer', NAO_EXIGIDA: 'desligada', NAO_RODOU: 'não rodou', CALCULOU: 'calcula' };
const ORDEM: GrupoDaPendencia[] = ['VERIFICACAO', 'PREMISSA', 'SEM_SOLUCAO', 'CONFLITO', 'NAO_DECIDIDO', 'CONFERIR'];

export const MOTIVO_GERANDO_PREDIO = 'Aguarde: o prédio está sendo gerado.';
export const MOTIVO_PREVIA_VELHA_PREDIO = 'O produto ou as hipóteses mudaram depois da prévia — gere de novo.';

interface Props {
  predio: EstadoDoPredioAutomatico;
  /** O bloco de onde o prédio nasce. */
  bloco: { nome: string; pavimentos: number };
  produto: Produto;
  /** A distribuição do produto neste bloco (`null` = produto sem tipologia). */
  doBloco: ProdutoDoBloco | null;
  onEditarProduto: () => void;
  hipoteses: HipotesesDoPredio;
  onHipoteses: (h: HipotesesDoPredio) => void;
  motivoParaNaoGerar: string | null;
  onGerar: () => void;
  /** A prévia é de outro produto ou de outras hipóteses (a assinatura do pedido mudou). */
  desatualizada?: boolean;
  /** `conferirPlanoDoPredio` sobre o desenho de agora; `null` sem prévia. */
  prova: { ok: true } | { ok: false; motivo: string } | null;
  onLancar: () => Promise<void>;
  onCriarAlternativa: () => Promise<void>;
  /** O que o último "Lançar" fez. */
  lancado: string | null;
}

type Aba = 'programa' | 'hipoteses' | 'resultado' | 'relatorio';

const rotuloCls = 'text-xs font-semibold text-slate-500';
const cardCls = 'rounded-[10px] border border-gray-100 bg-white p-6 shadow-sm';
const f2 = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function Dado({ rotulo, valor, nota }: { rotulo: string; valor: React.ReactNode; nota?: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <dt className={rotuloCls}>{rotulo}</dt>
      <dd className="text-lg font-semibold text-gray-900 tabular-nums">{valor}</dd>
      {nota && <dd className="text-xs text-slate-500">{nota}</dd>}
    </div>
  );
}

export default function TelaPredioAutomatico(props: Props) {
  const { predio, prova, doBloco, produto } = props;
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aberto, setAberto] = useState<GrupoDaPendencia | null>('SEM_SOLUCAO');
  const plano = predio.plano;
  const [nivelDaPrevia, setNivelDaPrevia] = useState<string | null>(null);
  const [disciplinaDaPrevia, setDisciplinaDaPrevia] = useState<DisciplinaDaPrevia>('ARQUITETURA');
  // A pendência escolhida no Relatório, marcada na planta — só vale para a prévia em que foi escolhida.
  const [marcado, setMarcado] = useState<{ plano: unknown; texto: string; marcas: MarcaNaPrevia[] } | null>(null);
  const marcadoAgora = marcado && marcado.plano === plano ? marcado : null;
  const plantaRef = useRef<HTMLElement | null>(null);
  const [aba, setAba] = useState<Aba>(plano ? 'resultado' : 'programa');

  const verNaPlanta = (x: PendenciaDoPpci) => {
    if (!plano || !x.locais?.length) return;
    const l = x.locais[0];
    setNivelDaPrevia(l.levelId);
    setDisciplinaDaPrevia(disciplinaDoLocal(plano.resultado, l));
    setMarcado({ plano, texto: x.texto, marcas: x.locais.flatMap((y) => (y.ponto ? [{ levelId: y.levelId, ponto: y.ponto }] : [])) });
    setAba('resultado');
  };
  useEffect(() => {
    if (marcadoAgora) plantaRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
  }, [marcadoAgora]);

  // Ao terminar de gerar, o resultado — a menos que se esteja lendo o relatório.
  const rodava = useRef(predio.rodando);
  useEffect(() => {
    if (rodava.current && !predio.rodando && predio.plano) setAba((a) => (a === 'relatorio' ? a : 'resultado'));
    rodava.current = predio.rodando;
  }, [predio.rodando, predio.plano]);

  // A prévia abre no pavimento tipo; o escolhido que a prévia nova não tem volta para ele.
  const niveis = plano?.resultado.levels ?? [];
  const nivelEfetivo = niveis.some((l) => l.id === nivelDaPrevia) ? nivelDaPrevia : (plano?.tipoLevelId ?? null);

  const motivoDeCriar = !plano
    ? 'Gere a prévia primeiro'
    : plano.comandos.length === 0
      ? 'A prévia não tem nada a lançar'
      : predio.rodando
        ? MOTIVO_GERANDO_PREDIO
        : props.desatualizada
          ? MOTIVO_PREVIA_VELHA_PREDIO
          : ocupado
            ? 'Aguarde a ação em curso'
            : undefined;
  const motivoDeLancar = motivoDeCriar ?? (prova && !prova.ok ? prova.motivo : undefined);
  const avisoDeLancar = plano && plano.comandos.length > 0 && !predio.rodando ? motivoDeLancar : undefined;

  const agir = async (nome: string, fn: () => Promise<void>) => {
    setOcupado(nome);
    setErro(null);
    try {
      await fn();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(null);
    }
  };

  // O andar tipo da distribuição: o piso com as unidades do tipo (o mesmo que o motor divide).
  const pisoTipo = doBloco ? (doBloco.pisos.find((x) => x.unidades === doBloco.unidadesPorPavimento) ?? null) : null;
  const tipologiasDoTipo = pisoTipo
    ? Object.entries(pisoTipo.porTipologia)
        .filter(([, n]) => n > 0)
        .map(([id, n]) => ({ id, n, t: produto.tipologias.find((x) => x.id === id) ?? null }))
    : [];
  const semSolucao = plano ? plano.pendencias.filter((x) => x.grupo === 'SEM_SOLUCAO').length : 0;

  const abas: TabsBarItem<Aba>[] = [
    { id: 'programa', label: 'Programa' },
    { id: 'hipoteses', label: 'Hipóteses' },
    ...(plano
      ? ([
          { id: 'resultado', label: 'Resultado' },
          {
            id: 'relatorio',
            label: 'Relatório',
            badge: plano.pendencias.length,
            badgeTom: semSolucao > 0 ? 'alerta' : undefined,
            badgeTitulo: `${plano.pendencias.length} item(ns)`,
          },
        ] as TabsBarItem<Aba>[])
      : []),
  ];
  const abaEfetiva: Aba = abas.some((a) => a.id === aba) ? aba : plano ? 'resultado' : 'programa';

  return (
    <div className="space-y-6" data-testid="tela-predio">
      {/* ── Abas + as ações da tela: Gerar, Criar alternativa e Lançar à vista em qualquer aba ── */}
      <div>
        <TabsBar tabs={abas} value={abaEfetiva} onChange={setAba}>
          {predio.rodando ? (
            <Button variant="secondary" onClick={predio.cancelar} data-testid="parar-predio" className="border-red-200 text-red-700 hover:bg-red-50">
              <Square className="h-4 w-4" /> Parar
            </Button>
          ) : (
            <Button variant={plano ? 'secondary' : 'primary'} onClick={props.onGerar} disabled={!!props.motivoParaNaoGerar} title={props.motivoParaNaoGerar ?? undefined} data-testid="gerar-predio">
              <Play className="h-4 w-4" /> {plano ? 'Gerar de novo' : 'Gerar prévia'}
            </Button>
          )}
          {plano && (
            <>
              <Button variant="secondary" onClick={() => agir('criar', props.onCriarAlternativa)} disabled={!!motivoDeCriar} title={motivoDeCriar} data-testid="criar-alternativa-predio">
                {ocupado === 'criar' ? 'Criando…' : 'Criar alternativa'}
              </Button>
              <Button onClick={() => agir('lancar', props.onLancar)} disabled={!!motivoDeLancar} title={motivoDeLancar} data-testid="lancar-predio">
                {ocupado === 'lancar' ? 'Lançando…' : `Lançar os ${plano.resumo.pavimentosLancados} pavimentos`}
              </Button>
            </>
          )}
        </TabsBar>

        {((props.motivoParaNaoGerar && !predio.rodando) || predio.rodando || erro || predio.erro || props.lancado || avisoDeLancar) && (
          <div className="mb-3 space-y-2">
            {props.motivoParaNaoGerar && !predio.rodando && (
              <p className="text-xs text-amber-700" data-testid="motivo-gerar-predio">
                {props.motivoParaNaoGerar}
              </p>
            )}
            {predio.rodando && (
              <p className="text-sm text-slate-600" data-testid="progresso-predio">
                {predio.progresso ? `Etapa ${predio.progresso.indice} de ${predio.progresso.total}: ${predio.progresso.rotulo}` : 'Gerando o prédio…'}
              </p>
            )}
            {(erro || predio.erro) && (
              <p role="alert" className="text-sm text-red-700">
                {erro ?? predio.erro}
              </p>
            )}
            {props.lancado && <p className="rounded-[6px] border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{props.lancado}</p>}
            {avisoDeLancar && <p className="text-xs text-amber-700">{avisoDeLancar}</p>}
          </div>
        )}
      </div>

      {/* ── Programa: o que o motor lê — o bloco e o produto distribuído nele ── */}
      {abaEfetiva === 'programa' && (
        <div role="tabpanel" aria-label="Programa" className={`space-y-6 ${cardCls}`} data-testid="programa-do-predio">
          <SecaoTitulo
            icon={Building2}
            titulo={`Bloco "${props.bloco.nome}"`}
            resumo={`produto "${produto.nome}" distribuído no bloco (Terreno › Massa › Produto)`}
            acoes={
              <Button variant="secondary" onClick={props.onEditarProduto} data-testid="editar-produto-do-predio">
                Editar o produto
              </Button>
            }
          />
          {doBloco && doBloco.unidades > 0 ? (
            <>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-4">
                <Dado rotulo="Pavimentos do bloco" valor={props.bloco.pavimentos} />
                <Dado rotulo="Unidades por andar" valor={doBloco.unidadesPorPavimento} nota={`${doBloco.unidades} no bloco`} />
                <Dado rotulo="Núcleo" valor={`${f2(doBloco.nucleo.m2)} m²`} nota={`${doBloco.nucleo.elevadores} elevador(es) · ${doBloco.nucleo.explicacao}`} />
                <Dado rotulo="Eficiência do andar" valor={doBloco.eficienciaDoPavimentoPct != null ? `${f2(doBloco.eficienciaDoPavimentoPct)} %` : '—'} nota="privativa ÷ bruta" />
              </dl>
              <section className="space-y-2">
                <h4 className={rotuloCls}>Tipologias no andar tipo</h4>
                <ul className="space-y-1 text-sm text-gray-700" data-testid="tipologias-do-tipo">
                  {tipologiasDoTipo.map(({ id, n, t }) => (
                    <li key={id}>
                      {n} × {t?.nome ?? id}
                      {t ? ` · ${f2(t.areaPrivativaM2)} m² · ${t.dormitorios} dorm.` : ''}
                    </li>
                  ))}
                </ul>
              </section>
            </>
          ) : (
            <p className="text-sm text-amber-700">Sem unidade neste bloco: defina as tipologias do produto.</p>
          )}
        </div>
      )}

      {/* ── Hipóteses ── */}
      {abaEfetiva === 'hipoteses' && (
        <div role="tabpanel" aria-label="Hipóteses" className={`space-y-4 ${cardCls}`} data-testid="hipoteses-do-predio">
          <SecaoTitulo icon={Settings2} titulo="Hipóteses" resumo="o que o prédio leva" />
          <label className="flex items-start gap-2 text-sm text-gray-700">
            <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-gray-300" checked={props.hipoteses.plantas} onChange={(e) => props.onHipoteses({ ...props.hipoteses, plantas: e.target.checked })} data-testid="hipotese-plantas" />
            <span>
              Gerar a planta interna das unidades (cômodos, portas e janelas)
              <span className="block text-xs text-slate-500">Desligado, cada unidade sai só com o perímetro — para desenhar à mão.</span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm text-gray-700">
            <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-gray-300" checked={props.hipoteses.terreo} onChange={(e) => props.onHipoteses({ ...props.hipoteses, terreo: e.target.checked })} data-testid="hipotese-terreo" />
            <span>
              Montar o térreo (hall e portaria, centro de medição, casa de bombas e áreas comuns) e o núcleo desde ele
              <span className="block text-xs text-slate-500">As fatias das unidades viram as salas do condomínio; a porta de entrada vai na fachada do hall voltada para a rua.</span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm text-gray-700">
            <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-gray-300" checked={props.hipoteses.cobertura} onChange={(e) => props.onHipoteses({ ...props.hipoteses, cobertura: e.target.checked })} data-testid="hipotese-cobertura" />
            <span>
              Montar a cobertura (laje, platibanda e área técnica) e os reservatórios
              <span className="block text-xs text-slate-500">O inferior na casa de bombas, o superior sobre o núcleo — pela população contada nos dormitórios de todos os andares.</span>
            </span>
          </label>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Numero rotulo="Porta de entrada (mm)" valor={props.hipoteses.larguraDoAcessoMm} min={900} max={3000} passo={50} onValor={(v) => v != null && props.onHipoteses({ ...props.hipoteses, larguraDoAcessoMm: v })} />
            <Numero rotulo="Pé-direito da cobertura (mm)" valor={props.hipoteses.peDireitoDaCoberturaMm} min={2200} max={6000} passo={50} onValor={(v) => v != null && props.onHipoteses({ ...props.hipoteses, peDireitoDaCoberturaMm: v })} />
            <Numero rotulo="Laje de cobertura (mm)" valor={props.hipoteses.espessuraDaLajeMm} min={80} max={400} passo={10} onValor={(v) => v != null && props.onHipoteses({ ...props.hipoteses, espessuraDaLajeMm: v })} />
            <Numero rotulo="Platibanda (mm)" valor={props.hipoteses.alturaDaPlatibandaMm} min={300} max={3000} passo={50} onValor={(v) => v != null && props.onHipoteses({ ...props.hipoteses, alturaDaPlatibandaMm: v })} />
            <Numero
              rotulo="Reservatório superior acima da laje (mm)"
              valor={props.hipoteses.cotaDoReservatorioSuperiorMm}
              min={0}
              max={8000}
              passo={100}
              title="Sobre a casa de máquinas e a caixa de escada"
              onValor={(v) => v != null && props.onHipoteses({ ...props.hipoteses, cotaDoReservatorioSuperiorMm: v })}
            />
          </div>
          <p className="text-sm text-slate-600">Os andares acima do tipo entram como cópias vivas — o que se edita no tipo, inclusive as instalações, vai para eles.</p>
        </div>
      )}

      {/* ── Resultado ── */}
      {abaEfetiva === 'resultado' && plano && (
        <div role="tabpanel" aria-label="Resultado" className={`space-y-6 ${cardCls}`} data-testid="previa-do-predio">
          <SecaoTitulo icon={Wand2} titulo="Resultado" resumo={`${plano.comandos.length} comando(s) num lote só`} />
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-4" data-testid="resumo-do-predio">
            <Dado rotulo="Unidades no prédio" valor={plano.resumo.unidades} nota={`${plano.resumo.unidadesPorAndar} por andar × ${plano.resumo.pavimentos} pavimento(s)`} />
            <Dado rotulo="Pavimento tipo" valor={`1 + ${plano.resumo.copias} cópia(s)`} nota={ROTULO_DO_ESQUEMA[plano.resumo.esquema]} />
            <Dado rotulo="Eficiência desenhada" valor={plano.resumo.eficienciaDesenhadaPct != null ? `${f2(plano.resumo.eficienciaDesenhadaPct)} %` : '—'} nota={plano.resumo.elevadores ? `${plano.resumo.elevadores} elevador(es)` : 'sem elevador'} />
            <Dado
              rotulo="Plantas das unidades"
              valor={plano.resumo.plantas ? `${plano.resumo.plantas.comodos} cômodo(s)` : 'só o perímetro'}
              nota={plano.resumo.plantas ? `${plano.resumo.plantas.unidades} unidade(s)${plano.resumo.plantas.grupos ? ` · ${plano.resumo.plantas.grupos} grupo(s) de iguais` : ''}` : undefined}
            />
            <Dado
              rotulo="Térreo"
              valor={plano.resumo.terreo ? `${plano.resumo.terreo.salas.length} sala(s)` : 'com o projetista'}
              nota={plano.resumo.terreo ? `${plano.resumo.terreo.salas.join(' · ')}${plano.resumo.terreo.acesso ? '' : ' · sem porta de entrada'}` : undefined}
            />
            <Dado rotulo="Cobertura" valor={plano.resumo.cobertura ? `+${f2(plano.resumo.cobertura.cotaM)} m` : '—'} nota={plano.resumo.cobertura ? 'laje, platibanda e área técnica' : undefined} />
            <Dado
              rotulo="Reservação"
              valor={plano.resumo.reservacao ? `${plano.resumo.reservacao.totalL.toLocaleString('pt-BR')} L` : '—'}
              nota={
                plano.resumo.reservacao
                  ? `${plano.resumo.reservacao.pessoas} pessoa(s)${plano.resumo.reservacao.inferiorL != null ? ` · inferior ${plano.resumo.reservacao.inferiorL.toLocaleString('pt-BR')} L` : ''}${plano.resumo.reservacao.superiorL != null ? ` · superior ${plano.resumo.reservacao.superiorL.toLocaleString('pt-BR')} L` : ''}`
                  : undefined
              }
            />
          </dl>

          {nivelEfetivo && (
            <section className="space-y-2" ref={plantaRef}>
              <h4 className={rotuloCls}>Planta de cada pavimento</h4>
              {marcadoAgora && (
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-700" data-testid="marcado-na-planta-predio">
                  <MapPin className="h-4 w-4 shrink-0 text-red-600" aria-hidden />
                  <span className="min-w-0">Marcado na planta: {marcadoAgora.texto}</span>
                  <button type="button" className="font-medium text-blue-600 hover:text-blue-800" onClick={() => setMarcado(null)}>
                    Limpar marcas
                  </button>
                </p>
              )}
              <PlantaDaPrevia modelo={plano.resultado} levelId={nivelEfetivo} onLevelId={setNivelDaPrevia} disciplina={disciplinaDaPrevia} onDisciplina={setDisciplinaDaPrevia} marcas={marcadoAgora?.marcas} />
            </section>
          )}

          <section className="space-y-2">
            <h4 className={rotuloCls}>Etapas ({plano.etapas.length})</h4>
            <ul className="grid grid-cols-1 gap-x-8 lg:grid-cols-2" data-testid="etapas-do-predio">
              {plano.etapas.map((e) => (
                <li key={e.id} className="border-b border-gray-100 py-1.5 text-sm">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 text-gray-700">{e.rotulo}</span>
                    <span className={`shrink-0 text-xs ${COR_DA_SITUACAO[e.situacao]}`}>
                      {ROTULO_DA_SITUACAO[e.situacao]}
                      {e.comandos > 0 ? ` · ${e.comandos}` : ''}
                    </span>
                  </span>
                  {e.nota && <span className="block text-xs text-slate-500">{e.nota}</span>}
                </li>
              ))}
            </ul>
          </section>

          {plano.decisoes.length > 0 && (
            <section className="space-y-2">
              <h4 className={rotuloCls}>Decisões</h4>
              <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
                {plano.decisoes.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      {/* ── Relatório: as pendências por grupo ── */}
      {abaEfetiva === 'relatorio' && plano && (
        <div role="tabpanel" aria-label="Relatório" className={`space-y-4 ${cardCls}`} data-testid="pendencias-do-predio">
          <SecaoTitulo icon={ClipboardList} titulo="Relatório" resumo={`${plano.pendencias.length} item(ns)`} />
          {plano.pendencias.length === 0 && <p className="text-sm text-emerald-700">Nada pendente no resultado.</p>}
          <div className="space-y-2">
            {ORDEM.map((grupo) => {
              const lista = plano.pendencias.filter((x) => x.grupo === grupo);
              if (!lista.length) return null;
              return (
                <div key={grupo}>
                  <button
                    type="button"
                    onClick={() => setAberto(aberto === grupo ? null : grupo)}
                    aria-expanded={aberto === grupo}
                    aria-controls={`pendencias-predio-${grupo}`}
                    className="flex w-full items-center gap-1 text-left text-sm font-medium text-gray-700 hover:text-gray-900"
                  >
                    {aberto === grupo ? <ChevronDown className="h-4 w-4 shrink-0" aria-hidden /> : <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />}
                    {ROTULO_DA_PENDENCIA[grupo]} ({lista.length})
                  </button>
                  {aberto === grupo && (
                    <ul id={`pendencias-predio-${grupo}`} className="mt-1 space-y-1 pl-5">
                      {lista.map((x, i) => (
                        <li key={i} className={`break-words text-sm ${grupo === 'VERIFICACAO' || grupo === 'SEM_SOLUCAO' || grupo === 'CONFLITO' ? 'text-red-700' : 'text-slate-600'}`}>
                          {x.locais?.length ? (
                            <button type="button" onClick={() => verNaPlanta(x)} className="text-left hover:underline">
                              {x.texto}
                              <span className="ml-2 inline-flex items-center gap-1 whitespace-nowrap font-medium text-blue-600">
                                <MapPin className="h-3.5 w-3.5" aria-hidden />
                                ver na planta
                              </span>
                            </button>
                          ) : (
                            x.texto
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
