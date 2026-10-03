/**
 * TELA "Gerar massa" (02/10/2026, ESTUDO DE MASSA M5): o objetivo e as
 * restrições, a biblioteca de implantações que entra na varredura, o botão que
 * roda o gerador (num Web Worker), a tabela com a MELHOR de cada implantação
 * (pela régua do estudo: zona, produto, CUB) e a frente de Pareto, a planta da
 * escolhida com o lote e os blocos, as decisões e os avisos. Duas saídas:
 * "Criar alternativa com esta" (um ramo novo, E6.1 — o comparador da M4 põe
 * lado a lado) e "Aplicar neste estudo" (troca os blocos do desenho aberto;
 * Ctrl+Z desfaz).
 *
 * CONVERSA (M5c): "duas torres", "apartamentos entre 65 e 75 m²", "reduzir
 * área comum" — o pedido vira mudanças no produto e na configuração (IA
 * `planta-ia` modo massa, ou o intérprete local), o gerador re-gera e o turno
 * fecha com o delta do melhor cenário. "Desfazer" volta o produto e a
 * configuração de antes do pedido.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Bot, Building2, Play, Square, Undo2 } from 'lucide-react';

import {
  CONFIGURACAO_DO_GERADOR_DE_MASSA_PADRAO,
  type ConfiguracaoDoGeradorDeMassa,
  MODOS_DE_ESTACIONAMENTO,
  OBJETIVOS_DA_MASSA,
  ROTULO_DA_IMPLANTACAO,
  ROTULO_DO_ESTACIONAMENTO,
  ROTULO_DO_OBJETIVO,
  TIPOS_DE_IMPLANTACAO,
  type CandidatoDeMassa,
  type EntradaDoGeradorDeMassa,
  type HipotesesDoGeradorDeMassa,
  type ModoDeEstacionamento,
  type ObjetivoDaMassa,
  type PesosDoObjetivo,
  type RestricoesDaMassa,
  type TipoDeImplantacao,
} from '../../utils/blueprintGeradorDeMassa';
import { formatarDoComparador, nomeSugeridoDoCenario } from '../../utils/blueprintComparadorDeMassa';
import { aplicarMudancasDaMassa, deltaDaMassa, interpretarPedidoDaMassaLocal, type MudancasDaMassa } from '../../utils/blueprintIaDaMassa';
import type { Produto } from '../../utils/blueprintProduto';
import { COR_DO_USO_DO_BLOCO } from '../../utils/blueprintMassa';
import { divisasDoLote, medirTerreno } from '../../utils/blueprintTerreno';
import type { BlueprintModel, Point } from '../../utils/blueprintKernel';
import type { EstadoDoGeradorDeMassa } from '../../hooks/useGeradorDeMassa';
import { StandardTable, type StandardTableColumn } from '../ui/StandardTable';
import { usePersistedState } from '../ui/TableUtils';

interface Props {
  gerador: EstadoDoGeradorDeMassa;
  /** O modelo aberto: o lote e os blocos que já existem (são substituídos ao aplicar). */
  model: BlueprintModel;
  regua: EntradaDoGeradorDeMassa['regua'];
  /** Número da próxima alternativa (para o nome "EM-00N"). */
  proximoNumero: number;
  onAbrirProduto: () => void;
  onCriarAlternativa: (c: CandidatoDeMassa, nome: string) => Promise<void>;
  onAplicar: (c: CandidatoDeMassa) => Promise<void>;
  /** M5c: grava o produto mudado por um pedido (o mesmo `setProduto` da tela Produto). */
  onProduto?: (p: Produto) => void;
  /** M5c: a IA no modo massa; `mudancas: null` + motivo quando indisponível. */
  onPedirIa?: (pedido: string, contexto: unknown) => Promise<{ mudancas: MudancasDaMassa | null; indisponivel: string | null }>;
}

interface TurnoDaMassa {
  id: number;
  pedido: string;
  entendimento: string;
  fonte: string;
  aplicadas: string[];
  recusadas: string[];
  antes: { produto: Produto; cfg: ConfiguracaoDoGeradorDeMassa; melhor: CandidatoDeMassa | null };
  /** Preenchido quando o gerador termina a nova varredura. */
  delta: string | null;
  desfeito: boolean;
}

const EXEMPLOS_DE_PEDIDO = ['duas torres com apartamentos entre 65 e 75 m²', 'reduzir área comum', 'no máximo 12 pavimentos e sem subsolo', '60% de 2 dorm e aumente o preço em 5%'];

type Configuracao = ConfiguracaoDoGeradorDeMassa;
const PADRAO: Configuracao = CONFIGURACAO_DO_GERADOR_DE_MASSA_PADRAO;

const COLUNAS: StandardTableColumn[] = [
  // Soma 1.230 px: cabe no miolo do app COM a barra lateral (1.600 px de janela).
  // O rótulo da implantação quebra em duas linhas; os números, não.
  { key: 'implantacao', label: 'Implantação', width: 310 },
  { key: 'pavimentos', label: 'Pav.', width: 70 },
  { key: 'unidades', label: 'Unidades', width: 90 },
  { key: 'vendavel', label: 'Vendável', width: 110 },
  { key: 'vagas', label: 'Vagas', width: 90 },
  { key: 'vgv', label: 'VGV', width: 115 },
  { key: 'custo', label: 'Custo', width: 115 },
  { key: 'resultado', label: 'Resultado', width: 115 },
  { key: 'margem', label: 'Margem', width: 85 },
  { key: 'pareto', label: 'Pareto', width: 100 },
];

const ROTULO_DO_PESO: Record<keyof PesosDoObjetivo, string> = { vgv: 'VGV', resultado: 'Resultado', unidades: 'Unidades', eficiencia: 'Eficiência', custo: 'Custo (menor)', complexidade: 'Complexidade (menor)', insolacao: 'Sol nas fachadas' };

/** "12; 15; 18" → [12, 15, 18] (vírgula decimal aceita). */
function listaDeMetros(texto: string): number[] {
  return texto
    .split(/[;\s]+/)
    .map((x) => Number(x.replace(',', '.')))
    .filter((x) => Number.isFinite(x) && x >= 8 && x <= 80);
}
const listaParaTexto = (xs: number[]) => xs.map((x) => String(x).replace('.', ',')).join('; ');

/** A planta da implantação: o lote, e os blocos coloridos pelo uso (subsolo tracejado). */
function MiniImplantacao({ lote, candidato }: { lote: Point[]; candidato: CandidatoDeMassa }) {
  const pts = [...lote, ...candidato.blocos.flatMap((b) => b.pontos)];
  if (pts.length === 0) return null;
  const minX = Math.min(...pts.map((p) => p.x));
  const maxX = Math.max(...pts.map((p) => p.x));
  const minY = Math.min(...pts.map((p) => p.y));
  const maxY = Math.max(...pts.map((p) => p.y));
  const pad = Math.max(maxX - minX, maxY - minY) * 0.05;
  // Norte = +Y do desenho: no SVG o y cresce para baixo.
  const caminho = (anel: Point[]) => anel.map((p, i) => `${i ? 'L' : 'M'}${p.x - minX + pad},${maxY - p.y + pad}`).join(' ') + ' Z';
  const w = maxX - minX + 2 * pad;
  const h = maxY - minY + 2 * pad;
  const traco = Math.max(w, h) / 300;
  const ordem = [...candidato.blocos].sort((a, b) => a.cotaBaseMm - b.cotaBaseMm);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-[320px] w-full rounded-[6px] border border-slate-200 bg-slate-50" role="img" aria-label={`Implantação: ${candidato.rotulo}`} data-testid="mini-implantacao">
      {lote.length >= 3 && <path d={caminho(lote)} fill="#ffffff" stroke="#475569" strokeWidth={traco * 1.5} />}
      {ordem.map((b, i) => (
        <path
          key={i}
          d={caminho(b.pontos)}
          fill={b.cotaBaseMm < 0 ? 'none' : COR_DO_USO_DO_BLOCO[b.uso]}
          fillOpacity={0.85}
          stroke={b.cotaBaseMm < 0 ? '#64748b' : '#1e293b'}
          strokeDasharray={b.cotaBaseMm < 0 ? `${traco * 6} ${traco * 4}` : undefined}
          strokeWidth={traco}
        >
          <title>{`${b.nome} · ${b.pavimentos} pav · ${b.uso.toLowerCase()}`}</title>
        </path>
      ))}
    </svg>
  );
}

function formatarObjetivo(v: number | null, objetivo: ObjetivoDaMassa): string {
  if (v == null) return '—';
  switch (objetivo) {
    case 'VGV':
    case 'RESULTADO':
      return formatarDoComparador(v, 'brl');
    case 'VENDAVEL':
    case 'MENOR_COMUM':
    case 'MENOR_GARAGEM':
      return formatarDoComparador(Math.abs(v), 'm2');
    case 'UNIDADES':
      return formatarDoComparador(v, 'num');
    case 'EFICIENCIA':
      return formatarDoComparador(v, 'pct');
    case 'INSOLACAO':
      return `${formatarDoComparador(v, 'h')} de sol nas fachadas`;
    case 'MENOR_CUSTO':
      return Math.abs(v) < 100_000 ? `${formatarDoComparador(Math.abs(v), 'num')} R$/m² vendável` : formatarDoComparador(Math.abs(v), 'brl');
    case 'PONDERADO':
      return `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} / 100`;
  }
}

export default function TelaGeradorDeMassa({ gerador, model, regua, proximoNumero, onAbrirProduto, onCriarAlternativa, onAplicar, onProduto, onPedirIa }: Props) {
  const [cfg, setCfg] = usePersistedState<Configuracao>('blueprint:gerador-de-massa', PADRAO);
  const c: Configuracao = { ...PADRAO, ...cfg, restricoes: { ...PADRAO.restricoes, ...cfg.restricoes }, hipoteses: { ...PADRAO.hipoteses, ...cfg.hipoteses }, pesos: { ...PADRAO.pesos, ...cfg.pesos } };
  const [profundidadesTexto, setProfundidadesTexto] = useState(listaParaTexto(c.hipoteses.profundidadesM));
  const [comprimentosTexto, setComprimentosTexto] = useState(listaParaTexto(c.hipoteses.comprimentosDaTorreM));
  const [escolhida, setEscolhida] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const r = gerador.resultado;
  const pareto = useMemo(() => new Set(r?.pareto ?? []), [r]);
  const atual = r?.melhores.find((x) => x.chave === escolhida) ?? r?.melhores[0] ?? null;
  const lote = useMemo(() => medirTerreno(divisasDoLote(model.boundaries))?.anel ?? [], [model.boundaries]);
  const blocosAtuais = (model.blocos ?? []).length;
  const temProduto = regua.produto.tipologias.length > 0;

  const set = (m: Partial<Configuracao>) => setCfg({ ...c, ...m });
  const setH = (m: Partial<HipotesesDoGeradorDeMassa>) => set({ hipoteses: { ...c.hipoteses, ...m } });
  const setR = (m: Partial<RestricoesDaMassa>) => set({ restricoes: { ...c.restricoes, ...m } });
  const campo = 'h-8 w-24 rounded-[6px] border border-slate-300 bg-white px-2 text-right text-sm tabular-nums';
  const lista = 'h-8 rounded-[6px] border border-slate-300 bg-white px-2 text-sm';
  const numeroOuNulo = (v: string) => (v.trim() === '' ? null : Math.max(1, Math.round(Number(v) || 1)));

  const rodar = () => {
    setErro(null);
    setEscolhida(null);
    gerador.gerar({ model, regua, objetivo: c.objetivo, pesos: c.pesos, restricoes: c.restricoes }, c.semente, c.hipoteses);
  };
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
  const motivoDoGerar = c.hipoteses.tipos.length === 0 ? 'Escolha pelo menos uma implantação' : lote.length < 3 ? 'Feche o lote na aba Terreno primeiro' : null;

  // ── Conversa (M5c) ──
  const [pedido, setPedido] = useState('');
  const [pensando, setPensando] = useState(false);
  const [turnos, setTurnos] = useState<TurnoDaMassa[]>([]);
  const pendente = useRef<number | null>(null);
  const proximoId = useRef(1);
  const gerarCom = (produto: Produto, k: ConfiguracaoDoGeradorDeMassa) => {
    setErro(null);
    setEscolhida(null);
    gerador.gerar({ model, regua: { ...regua, produto }, objetivo: k.objetivo, pesos: k.pesos, restricoes: k.restricoes }, k.semente, k.hipoteses);
  };
  // O turno pendente fecha com o delta quando a varredura nova termina.
  useEffect(() => {
    if (pendente.current == null || gerador.rodando || !gerador.resultado) return;
    const id = pendente.current;
    pendente.current = null;
    const depois = gerador.resultado.melhores[0] ?? null;
    setTurnos((ts) => ts.map((t) => (t.id === id ? { ...t, delta: deltaDaMassa(t.antes.melhor, depois) } : t)));
  }, [gerador.resultado, gerador.rodando]);
  const enviarPedido = async () => {
    const texto = pedido.trim();
    if (!texto || pensando) return;
    setPensando(true);
    try {
      const contexto = {
        produto: { padrao: regua.produto.padrao, metaUnidades: regua.produto.metaUnidades, tipologias: regua.produto.tipologias.map((t) => ({ nome: t.nome, uso: t.uso, dormitorios: t.dormitorios, areaPrivativaM2: t.areaPrivativaM2, proporcaoPct: t.proporcaoPct, precoM2: t.precoM2 })) },
        configuracao: { objetivo: c.objetivo, tipos: c.hipoteses.tipos, estacionamento: c.hipoteses.estacionamento, pavimentosMax: c.restricoes.pavimentosMax, unidadesMin: c.restricoes.unidadesMin },
        melhor: r?.melhores[0] ? { rotulo: r.melhores[0].rotulo, unidades: r.melhores[0].cenario.unidades, vgv: r.melhores[0].cenario.vgv } : null,
      };
      const resposta = onPedirIa ? await onPedirIa(texto, contexto) : { mudancas: null, indisponivel: 'sem IA nesta tela' };
      const mudancas = resposta.mudancas ?? interpretarPedidoDaMassaLocal(texto, regua.produto);
      const fonte = resposta.mudancas ? 'IA' : `intérprete local${resposta.indisponivel ? ` — ${resposta.indisponivel}` : ''}`;
      const id = proximoId.current++;
      const antes = { produto: regua.produto, cfg: c, melhor: r?.melhores[0] ?? null };
      if (!mudancas) {
        setTurnos((ts) => [{ id, pedido: texto, entendimento: `Não entendi o pedido. Exemplos: ${EXEMPLOS_DE_PEDIDO.map((x) => `"${x}"`).join(', ')}.`, fonte, aplicadas: [], recusadas: [], antes, delta: null, desfeito: false }, ...ts].slice(0, 6));
        return;
      }
      const ap = aplicarMudancasDaMassa(mudancas, regua.produto, c);
      setTurnos((ts) => [{ id, pedido: texto, entendimento: mudancas.entendimento, fonte, aplicadas: ap.aplicadas, recusadas: ap.recusadas, antes, delta: null, desfeito: false }, ...ts].slice(0, 6));
      setPedido('');
      if (ap.aplicadas.length === 0) return;
      if (onProduto && JSON.stringify(ap.produto) !== JSON.stringify(regua.produto)) onProduto(ap.produto);
      setCfg(ap.configuracao);
      // O que impede gerar é avaliado DEPOIS do pedido (ele pode ter mudado a biblioteca).
      const impede = lote.length < 3 ? 'sem lote fechado: não gerou' : ap.configuracao.hipoteses.tipos.length === 0 ? 'nenhuma implantação escolhida: não gerou' : null;
      if (impede) {
        setTurnos((ts) => ts.map((x) => (x.id === id ? { ...x, delta: impede } : x)));
        return;
      }
      pendente.current = id;
      gerarCom(ap.produto, ap.configuracao);
    } finally {
      setPensando(false);
    }
  };
  const desfazer = (t: TurnoDaMassa) => {
    if (onProduto && JSON.stringify(t.antes.produto) !== JSON.stringify(regua.produto)) onProduto(t.antes.produto);
    setCfg(t.antes.cfg);
    setTurnos((ts) => ts.map((x) => (x.id === t.id ? { ...x, desfeito: true } : x)));
    gerarCom(t.antes.produto, t.antes.cfg);
  };

  return (
    <div className="space-y-4" data-testid="tela-gerador-de-massa">
      <div className="space-y-3 rounded-[6px] border border-gray-200 bg-white px-5 py-4" data-testid="conversa-da-massa">
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void enviarPedido();
          }}
        >
          <Bot className="h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={pedido}
            onChange={(e) => setPedido(e.target.value)}
            placeholder={`Peça em linguagem natural — ex.: "${EXEMPLOS_DE_PEDIDO[0]}"`}
            aria-label="Pedido para a massa"
            className="h-9 min-w-[280px] flex-1 rounded-[6px] border border-slate-300 bg-white px-3 text-sm"
          />
          <button
            type="submit"
            disabled={!pedido.trim() || pensando || gerador.rodando}
            title={!pedido.trim() ? 'Escreva o pedido' : pensando ? 'Interpretando o pedido…' : gerador.rodando ? 'Aguarde a varredura em andamento' : undefined}
            className="h-9 rounded-[6px] bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-slate-300"
            data-testid="enviar-pedido-da-massa"
          >
            {pensando ? 'Interpretando…' : 'Aplicar e gerar'}
          </button>
        </form>
        <p className="text-xs text-slate-500">
          O pedido muda o PRODUTO (tipologias, faixa de área, mix, preço, padrão) e esta configuração — nunca desenha blocos: o gerador re-gera e o turno mostra o que mudou no melhor cenário.
        </p>
        {turnos.length > 0 && (
          <ol className="space-y-2" data-testid="turnos-da-massa">
            {turnos.map((t, i) => (
              <li key={t.id} className={`rounded-[6px] border px-3 py-2 text-xs ${t.desfeito ? 'border-slate-200 bg-slate-50 text-slate-400' : 'border-slate-200 bg-white text-gray-700'}`} data-testid="turno-da-massa">
                <div className="flex items-start justify-between gap-2">
                  <p>
                    <span className="font-medium text-gray-900">“{t.pedido}”</span> <span className="text-slate-400">· {t.fonte}</span>
                  </p>
                  {i === 0 && !t.desfeito && t.aplicadas.length > 0 && (
                    <button type="button" onClick={() => desfazer(t)} disabled={gerador.rodando} title={gerador.rodando ? 'Aguarde a varredura em andamento' : 'Volta o produto e a configuração de antes deste pedido'} className="inline-flex shrink-0 items-center gap-1 rounded-[6px] border border-slate-300 bg-white px-2 py-0.5 text-xs font-medium text-gray-700 hover:bg-slate-50 disabled:opacity-50" data-testid="desfazer-pedido-da-massa">
                      <Undo2 className="h-3.5 w-3.5" /> Desfazer
                    </button>
                  )}
                </div>
                <p className="mt-1 text-slate-600">{t.entendimento}</p>
                {t.aplicadas.length > 0 && <p className="mt-1">Aplicado: {t.aplicadas.join(' · ')}</p>}
                {t.recusadas.length > 0 && <p className="mt-1 text-amber-800">Não aplicado: {t.recusadas.join(' · ')}</p>}
                {t.desfeito ? (
                  <p className="mt-1">Desfeito.</p>
                ) : t.aplicadas.length > 0 ? (
                  <p className="mt-1 font-medium text-gray-900" data-testid="delta-da-massa">
                    {t.delta ?? 'Gerando…'}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="space-y-3 rounded-[6px] border border-gray-200 bg-white px-5 py-4" data-testid="configuracao-do-gerador-de-massa">
        <div className="flex flex-wrap items-end gap-4 text-xs text-slate-600">
          <label className="flex flex-col gap-1">
            Objetivo
            <select value={c.objetivo} onChange={(e) => set({ objetivo: e.target.value as ObjetivoDaMassa })} aria-label="Objetivo" className={lista}>
              {OBJETIVOS_DA_MASSA.map((o) => (
                <option key={o} value={o}>
                  {ROTULO_DO_OBJETIVO[o]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            Estacionamento
            <select value={c.hipoteses.estacionamento} onChange={(e) => setH({ estacionamento: e.target.value as ModoDeEstacionamento })} aria-label="Estacionamento" className={lista}>
              {MODOS_DE_ESTACIONAMENTO.map((o) => (
                <option key={o} value={o}>
                  {ROTULO_DO_ESTACIONAMENTO[o]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            Unidades mínimas
            <input type="number" min={1} value={c.restricoes.unidadesMin ?? ''} placeholder={regua.produto.metaUnidades != null ? `meta ${regua.produto.metaUnidades}` : 'sem'} onChange={(e) => setR({ unidadesMin: numeroOuNulo(e.target.value) })} aria-label="Unidades mínimas" className={campo} />
          </label>
          <label className="flex flex-col gap-1">
            Pavimentos máx.
            <input type="number" min={1} value={c.restricoes.pavimentosMax ?? ''} placeholder="a lei" onChange={(e) => setR({ pavimentosMax: numeroOuNulo(e.target.value) })} aria-label="Pavimentos máximos" className={campo} />
          </label>
          <label className="flex flex-col gap-1">
            Profundidades da lâmina (m)
            <input
              type="text"
              value={profundidadesTexto}
              onChange={(e) => setProfundidadesTexto(e.target.value)}
              onBlur={() => {
                const xs = listaDeMetros(profundidadesTexto);
                if (xs.length) setH({ profundidadesM: xs });
                setProfundidadesTexto(listaParaTexto(xs.length ? xs : c.hipoteses.profundidadesM));
              }}
              aria-label="Profundidades da lâmina (m)"
              className="h-8 w-32 rounded-[6px] border border-slate-300 bg-white px-2 text-sm tabular-nums"
            />
          </label>
          <label className="flex flex-col gap-1">
            Comprimentos da torre (m)
            <input
              type="text"
              value={comprimentosTexto}
              onChange={(e) => setComprimentosTexto(e.target.value)}
              onBlur={() => {
                const xs = listaDeMetros(comprimentosTexto);
                if (xs.length) setH({ comprimentosDaTorreM: xs });
                setComprimentosTexto(listaParaTexto(xs.length ? xs : c.hipoteses.comprimentosDaTorreM));
              }}
              aria-label="Comprimentos da torre (m)"
              className="h-8 w-32 rounded-[6px] border border-slate-300 bg-white px-2 text-sm tabular-nums"
            />
          </label>
          <label className="flex flex-col gap-1">
            Entre blocos (m)
            <input type="number" min={3} step={0.5} value={c.hipoteses.afastamentoEntreBlocosM} onChange={(e) => Number(e.target.value) >= 3 && setH({ afastamentoEntreBlocosM: Number(e.target.value) })} aria-label="Afastamento entre blocos (m)" className={campo} />
          </label>
          <label className="flex flex-col gap-1">
            Semente
            <input type="number" min={1} value={c.semente} onChange={(e) => set({ semente: Math.max(1, Math.round(Number(e.target.value) || 1)) })} aria-label="Semente" className={campo} />
          </label>
        </div>

        {c.objetivo === 'PONDERADO' && (
          <div className="flex flex-wrap items-end gap-4 text-xs text-slate-600" data-testid="pesos-do-objetivo">
            {(Object.keys(ROTULO_DO_PESO) as (keyof PesosDoObjetivo)[]).map((k) => (
              <label key={k} className="flex flex-col gap-1">
                {ROTULO_DO_PESO[k]}
                <input type="number" min={0} max={10} value={c.pesos[k]} onChange={(e) => set({ pesos: { ...c.pesos, [k]: Math.max(0, Math.min(10, Number(e.target.value) || 0)) } })} aria-label={`Peso: ${ROTULO_DO_PESO[k]}`} className="h-8 w-16 rounded-[6px] border border-slate-300 bg-white px-2 text-right text-sm tabular-nums" />
              </label>
            ))}
            <span className="pb-2 text-slate-500">Cada indicador é normalizado entre o pior e o melhor da varredura; peso 0 tira o indicador.</span>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-700" data-testid="implantacoes-do-gerador">
          <span className="font-medium text-slate-500">Implantações:</span>
          {TIPOS_DE_IMPLANTACAO.map((t) => (
            <label key={t} className="inline-flex items-center gap-1">
              <input
                type="checkbox"
                checked={c.hipoteses.tipos.includes(t)}
                onChange={(e) => setH({ tipos: e.target.checked ? TIPOS_DE_IMPLANTACAO.filter((x) => x === t || c.hipoteses.tipos.includes(x)) : c.hipoteses.tipos.filter((x) => x !== t) })}
                aria-label={ROTULO_DA_IMPLANTACAO[t as TipoDeImplantacao]}
                className="h-3.5 w-3.5 rounded border-slate-300"
              />
              {ROTULO_DA_IMPLANTACAO[t as TipoDeImplantacao]}
            </label>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-700">
          <label className="inline-flex items-center gap-1">
            <input type="checkbox" checked={c.restricoes.respeitarLei} onChange={(e) => setR({ respeitarLei: e.target.checked })} aria-label="Respeitar a lei" className="h-3.5 w-3.5 rounded border-slate-300" />
            Respeitar a lei (CA, TO, gabarito e envelope por pavimento)
          </label>
          <label className="inline-flex items-center gap-1">
            <input type="checkbox" checked={c.restricoes.atenderVagas} onChange={(e) => setR({ atenderVagas: e.target.checked })} aria-label="Atender às vagas exigidas" className="h-3.5 w-3.5 rounded border-slate-300" />
            Atender às vagas exigidas (produto e zona)
          </label>
          <span className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setCfg(PADRAO);
                setProfundidadesTexto(listaParaTexto(PADRAO.hipoteses.profundidadesM));
                setComprimentosTexto(listaParaTexto(PADRAO.hipoteses.comprimentosDaTorreM));
              }}
              className="h-9 rounded-[6px] border border-slate-300 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-slate-50"
            >
              Padrão
            </button>
            {gerador.rodando ? (
              <button type="button" onClick={gerador.cancelar} className="inline-flex h-9 items-center gap-1 rounded-[6px] border border-red-300 bg-white px-3 text-sm font-medium text-red-700 hover:bg-red-50" data-testid="cancelar-geracao-de-massa">
                <Square className="h-4 w-4" /> Parar
              </button>
            ) : (
              <button type="button" onClick={rodar} disabled={!!motivoDoGerar} title={motivoDoGerar ?? undefined} className="inline-flex h-9 items-center gap-1 rounded-[6px] bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-slate-300" data-testid="gerar-massa">
                <Play className="h-4 w-4" /> Gerar implantações
              </button>
            )}
          </span>
        </div>
        {motivoDoGerar && <p className="text-xs text-amber-800">{motivoDoGerar}.</p>}
        <p className="text-xs text-slate-500" data-testid="contexto-do-gerador-de-massa">
          {temProduto ? (
            <>
              Produto: <strong>{regua.produto.nome}</strong> ({regua.produto.tipologias.length} tipologia(s), padrão {regua.produto.padrao}).{' '}
            </>
          ) : (
            <>
              <AlertTriangle className="mr-1 inline h-3.5 w-3.5 text-amber-600" />
              Sem produto —{' '}
              <button type="button" onClick={onAbrirProduto} className="font-medium text-blue-700 hover:underline">
                defina as tipologias
              </button>{' '}
              para medir unidades e dinheiro.{' '}
            </>
          )}
          Cada combinação é medida com a régua do estudo (zona, recuos, produto, CUB) — a mesma do comparador. A grade é exaustiva; a semente guia só o refinamento, e a mesma semente dá sempre o mesmo resultado.
        </p>
        {(erro || gerador.erro) && (
          <p className="flex items-center gap-1 text-xs text-red-700" role="alert">
            <AlertTriangle className="h-3.5 w-3.5" /> {erro ?? gerador.erro}
          </p>
        )}
      </div>

      {r && (
        <p className="text-xs text-slate-600" data-testid="resumo-do-gerador-de-massa">
          {r.avaliados} combinações medidas, {r.viaveis} viáveis{r.quadro ? ` · envelope no térreo ${formatarDoComparador(r.quadro.larguraM, 'm')} × ${formatarDoComparador(r.quadro.profundidadeM, 'm')}` : ''} · objetivo: {ROTULO_DO_OBJETIVO[r.objetivo].toLowerCase()} · a melhor de cada implantação abaixo.
        </p>
      )}

      <StandardTable<CandidatoDeMassa>
        columns={COLUNAS}
        storageKey="blueprint:geradorDeMassaResultados"
        rows={r?.melhores ?? []}
        rowKey={(x) => x.chave}
        loading={gerador.rodando}
        onRowClick={(x) => setEscolhida(x.chave)}
        rowClassName={(x) => (atual && x.chave === atual.chave ? 'bg-blue-50/40 cursor-pointer' : 'cursor-pointer')}
        sortValue={(key, x) => {
          const s = x.cenario;
          switch (key) {
            case 'implantacao':
              return x.rotulo;
            case 'pavimentos':
              return s.pavimentosMax;
            case 'unidades':
              return s.unidades;
            case 'vendavel':
              return s.areaVendavelM2;
            case 'vagas':
              return s.vagasQueCabem;
            case 'vgv':
              return s.vgv ?? -1;
            case 'custo':
              return s.custoTotal ?? -1;
            case 'resultado':
              return s.resultado ?? -Infinity;
            case 'margem':
              return s.margemPct ?? -Infinity;
            case 'pareto':
              return pareto.has(x.chave) ? 0 : 1;
            default:
              return null;
          }
        }}
        renderCell={(key, x) => {
          const s = x.cenario;
          const n = 'whitespace-nowrap text-sm tabular-nums text-gray-700';
          switch (key) {
            case 'implantacao':
              return (
                <span className="text-sm text-gray-900" title={`Critério: ${formatarObjetivo(x.valor, r!.objetivo)}`}>
                  {x.rotulo}
                </span>
              );
            case 'pavimentos':
              return <span className={n}>{s.pavimentosMax}</span>;
            case 'unidades':
              return <span className={n}>{s.unidades}</span>;
            case 'vendavel':
              return <span className={n}>{formatarDoComparador(s.areaVendavelM2, 'm2')}</span>;
            case 'vagas':
              return (
                <span className={n} title={`cabem ${s.vagasQueCabem}, exigidas ${s.vagasExigidas}`}>
                  {s.vagasQueCabem} / {s.vagasExigidas}
                </span>
              );
            case 'vgv':
              return <span className={n}>{formatarDoComparador(s.vgv, 'brl')}</span>;
            case 'custo':
              return <span className={n}>{formatarDoComparador(s.custoTotal, 'brl')}</span>;
            case 'resultado':
              return <span className={n}>{formatarDoComparador(s.resultado, 'brl')}</span>;
            case 'margem':
              return <span className={n}>{formatarDoComparador(s.margemPct, 'pct')}</span>;
            case 'pareto':
              return pareto.has(x.chave) ? <span className="whitespace-nowrap rounded-[6px] bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">na frente</span> : <span className="text-xs text-slate-400">dominada</span>;
            default:
              return null;
          }
        }}
        empty={{
          title: gerador.rodando ? 'Gerando…' : r ? 'Nenhuma implantação atende às restrições' : 'Nenhuma implantação gerada ainda',
          subtitle: r ? (r.avisos[r.avisos.length - 1] ?? 'Afrouxe as restrições ou mude a biblioteca.') : 'Escolha o objetivo e clique em Gerar implantações. Sai a melhor de cada tipo; a frente de Pareto separa as não dominadas em VGV, custo e complexidade.',
        }}
      />

      {r && r.avisos.length > 0 && (
        <ul className="list-disc space-y-0.5 rounded-[6px] border border-amber-200 bg-amber-50 py-2 pl-8 pr-4 text-xs text-amber-900" data-testid="avisos-do-gerador-de-massa">
          {r.avisos.map((a, k) => (
            <li key={k}>{a}</li>
          ))}
        </ul>
      )}

      {r && atual && (
        <div className="space-y-4 rounded-[6px] border border-gray-200 bg-white px-5 py-4" data-testid="implantacao-escolhida">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-gray-900">
              <Building2 className="mr-1 inline h-4 w-4 text-slate-400" /> {atual.rotulo} · critério {formatarObjetivo(atual.valor, r.objetivo)}
            </p>
            <span className="flex items-center gap-2">
              <button
                type="button"
                disabled={!!ocupado}
                onClick={() => void agir('criar', () => onCriarAlternativa(atual, nomeSugeridoDoCenario(proximoNumero, atual.cenario)))}
                className="h-9 rounded-[6px] border border-slate-300 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-slate-50 disabled:opacity-50"
                data-testid="criar-alternativa-de-massa"
              >
                {ocupado === 'criar' ? 'Criando…' : `Criar alternativa ${nomeSugeridoDoCenario(proximoNumero, null)}`}
              </button>
              <button
                type="button"
                disabled={!!ocupado}
                onClick={() => void agir('aplicar', () => onAplicar(atual))}
                className="h-9 rounded-[6px] bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-slate-300"
                data-testid="aplicar-massa"
                title={blocosAtuais > 0 ? `Os ${blocosAtuais} bloco(s) do desenho são trocados por estes (Ctrl+Z desfaz)` : 'Os blocos entram no desenho aberto (Ctrl+Z desfaz)'}
              >
                {ocupado === 'aplicar' ? 'Aplicando…' : 'Aplicar neste estudo'}
              </button>
            </span>
          </div>
          {blocosAtuais > 0 && <p className="text-xs text-amber-800">O desenho já tem {blocosAtuais} bloco(s): aplicar troca todos — prefira criar uma alternativa para comparar.</p>}
          <div className="grid gap-4 md:grid-cols-2">
            <MiniImplantacao lote={lote} candidato={atual} />
            <div className="space-y-3 text-xs">
              <div data-testid="blocos-da-implantacao">
                <p className="mb-1 font-medium text-slate-500">Blocos</p>
                <ul className="space-y-0.5 text-gray-700">
                  {atual.blocos.map((b, k) => (
                    <li key={k}>
                      <span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: COR_DO_USO_DO_BLOCO[b.uso] }} />
                      {b.nome} · {b.pavimentos} pav · {b.uso.toLowerCase()}
                      {b.cotaBaseMm !== 0 ? ` · base a ${formatarDoComparador(b.cotaBaseMm / 1000, 'm')}` : ''}
                    </li>
                  ))}
                </ul>
              </div>
              <div data-testid="decisoes-do-gerador-de-massa">
                <p className="mb-1 font-medium text-slate-500">Decisões do gerador</p>
                <ol className="list-decimal space-y-0.5 pl-5 text-gray-700">
                  {r.decisoes.map((d, k) => (
                    <li key={k}>{d}</li>
                  ))}
                </ol>
              </div>
              {r.descartes.length > 0 && (
                <p className="text-slate-600" data-testid="descartes-do-gerador-de-massa">
                  Descartadas: {r.descartes.map((d) => `${d.motivo} (${d.quantos})`).join(' · ')}.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
