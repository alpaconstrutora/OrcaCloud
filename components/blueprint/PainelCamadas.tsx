/**
 * CAMADAS POR DISCIPLINA (04/10/2026) — a seção "Camadas" do painel lateral.
 *
 * Pedido: *"cada um destes módulos (eletrico, hidraulico, terreno, incendio,
 * mecanica) fossem criados como se fossem camadas … exibir/ocultar … para
 * verificar interferencias ele poderia exibir uma, duas ou quantas ele quiser.
 * esse gerenciamento poderia estar localizado no painel lateral direito"*.
 *
 * Uma linha por disciplina (as com subcamadas expandem: Elétrica em luz/força,
 * Hidráulica em água fria/quente/esgoto/pluvial). Em cada linha: olho
 * (visível ↔ oculta), meio-tom (a camada fica na tela como referência, sem
 * clique), contagem de peças nos pavimentos em vista e Isolar. Toda a regra
 * mora em `utils/blueprintCamadasPorDisciplina.ts`; aqui só se desenha.
 *
 * O olho é o mesmo botão plano do painel Componentes (`Olho` em
 * `PainelComponentes.tsx`) — é o vocabulário das listas densas deste painel.
 */
import React from 'react';
import { ChevronRight, Contrast, Eye, EyeOff, Focus, RotateCcw } from 'lucide-react';
import {
  AJUDA_DA_CAMADA,
  GRUPOS_DE_CAMADAS,
  ROTULO_DA_CAMADA,
  alternarAtenuacao,
  alternarVisibilidade,
  alvoIsolado,
  contagemDoGrupo,
  definirTodas,
  estadoDoGrupo,
  estadosIguais,
  ESTADOS_PADRAO,
  type AlvoDeCamada,
  type Camada,
  type ContagemDasCamadas,
  type DefinicaoDoGrupo,
  type EstadoDaCamada,
  type EstadosDasCamadas,
  type GrupoDeCamadas,
} from '../../utils/blueprintCamadasPorDisciplina';
import type { ItemDeExibicao } from './MenuExibir';
import { usePersistedState } from '../ui/TableUtils';
import {
  algumMapaAVista,
  alternarMeioTomDoMapa,
  alternarOlhoDoMapa,
  FONTE_DO_MAPA,
  FONTES_DO_MAPA,
  MAPA_OCULTO,
  motivoDaFonteIndisponivel,
  type EstadosDoMapa,
  type FonteDoMapa,
} from '../../utils/blueprintMapaDeFundo';

interface Props {
  estados: EstadosDasCamadas;
  onMudar: (estados: EstadosDasCamadas) => void;
  /** Peças por camada nos pavimentos em vista (o ativo na planta; os da vista no 3D). */
  contagem: ContagemDasCamadas;
  /** Isolar deixa a arquitetura em meio-tom como referência. */
  baseAtenuada: boolean;
  onBaseAtenuada: (v: boolean) => void;
  onIsolar: (alvo: AlvoDeCamada) => void;
  /** Volta ao estado de antes do isolamento. */
  onReexibir: () => void;
  /**
   * 12/10/2026: o MAPA DE FUNDO — *"camada terreno trazer as duas camadas
   * (relevo e ruas)"*. Com isto o Terreno expande em Mapa: ruas e Mapa: relevo.
   * Estado próprio (não é camada de peça): a linha do Terreno continua mandando
   * só no lote e na topografia. `motivoDesligado` = sem "Onde fica".
   */
  mapa?: { estados: EstadosDoMapa; onMudar: (e: EstadosDoMapa) => void; motivoDesligado: string | null };
  /**
   * 25/11/2026: AS OPÇÕES DO EXIBIR COMO SUBLINHAS — *"o que tem em exibir que falta implementar nas camadas como
   * exemplo da terraplanagem?"* → *"Implemente, sem mover para as Camadas os itens de medidas e preenchimento do
   * terreno."* Os itens são os MESMOS objetos do menu Exibir (um só lugar define rótulo, estado, alternar e motivo):
   * Terreno › Curvas de nível, Corte e aterro…; Estrutura › Eixos. Só o olho — não são peças (sem contagem,
   * meio-tom nem Isolar). O olho do grupo continua escondendo tudo dele de uma vez.
   */
  exibicao?: Partial<Record<GrupoDeCamadas, ItemDeExibicao[]>>;
}

const TEXTO_DO_ESTADO: Record<EstadoDaCamada | 'MISTO', string> = {
  VISIVEL: 'text-slate-700',
  ATENUADA: 'text-slate-500',
  OCULTA: 'text-slate-400',
  MISTO: 'text-slate-700',
};

const ROTULO_DO_ESTADO: Record<EstadoDaCamada | 'MISTO', string> = {
  VISIVEL: 'visível',
  ATENUADA: 'em meio-tom',
  OCULTA: 'oculta',
  MISTO: 'parcial',
};

function BotaoDaLinha({
  titulo,
  pressionado,
  onClick,
  children,
  desligado,
}: {
  titulo: string;
  pressionado?: boolean | 'mixed';
  onClick: () => void;
  children: React.ReactNode;
  /** O motivo, quando desligado — vira o `title` (botão desligado sempre diz o porquê). */
  desligado?: string | null;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressionado}
      aria-label={titulo}
      title={desligado ?? titulo}
      disabled={!!desligado}
      className="shrink-0 rounded-[6px] p-1 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}

interface LinhaProps {
  alvo: AlvoDeCamada;
  rotulo: string;
  ajuda: string;
  cor?: string;
  estado: EstadoDaCamada | 'MISTO';
  quantidade: number;
  isolado: boolean;
  nivel: 0 | 1;
  expansor?: { aberto: boolean; onAlternar: () => void; idDoCorpo: string };
  onOlho: () => void;
  onMeioTom: () => void;
  onIsolar: () => void;
  onReexibir: () => void;
}

function Linha({ alvo, rotulo, ajuda, cor, estado, quantidade, isolado, nivel, expansor, onOlho, onMeioTom, onIsolar, onReexibir }: LinhaProps) {
  const oculta = estado === 'OCULTA';
  const vazia = quantidade === 0;
  return (
    <li
      data-camada={alvo}
      data-estado={estado}
      className={`flex items-center gap-1 py-0.5 ${nivel === 1 ? 'pl-6' : 'pl-1'} pr-1`}
    >
      {expansor ? (
        <button
          type="button"
          onClick={expansor.onAlternar}
          aria-expanded={expansor.aberto}
          aria-controls={expansor.idDoCorpo}
          aria-label={`${expansor.aberto ? 'Recolher' : 'Expandir'} ${rotulo}`}
          title={`${expansor.aberto ? 'Recolher' : 'Expandir'} ${rotulo}`}
          className="shrink-0 rounded-[6px] p-0.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
        >
          <ChevronRight className={`h-3.5 w-3.5 transition-transform duration-200 ${expansor.aberto ? 'rotate-90' : ''}`} />
        </button>
      ) : (
        nivel === 0 && <span className="w-[18px] shrink-0" aria-hidden="true" />
      )}
      {cor && <span className="h-2.5 w-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: cor, opacity: oculta ? 0.35 : estado === 'ATENUADA' ? 0.55 : 1 }} aria-hidden="true" />}
      <span
        className={`min-w-0 flex-1 truncate text-sm ${TEXTO_DO_ESTADO[estado]} ${vazia ? 'opacity-60' : ''}`}
        title={`${rotulo} — ${ROTULO_DO_ESTADO[estado]}. ${ajuda}${vazia ? ' Nenhuma peça nos pavimentos em vista.' : ''}`}
      >
        {rotulo}
      </span>
      <span
        className={`shrink-0 rounded-[6px] bg-slate-100 px-1.5 py-0.5 text-[11px] tabular-nums ${vazia ? 'text-slate-400' : 'text-slate-600'}`}
        title={vazia ? 'Nenhuma peça nos pavimentos em vista' : `${quantidade} peça${quantidade === 1 ? '' : 's'} nos pavimentos em vista`}
      >
        {quantidade}
      </span>
      <BotaoDaLinha
        titulo={estado === 'ATENUADA' ? `Tirar ${rotulo} do meio-tom` : `${rotulo} em meio-tom (referência, sem clique)`}
        pressionado={estado === 'ATENUADA'}
        onClick={onMeioTom}
      >
        <Contrast className={`h-3.5 w-3.5 ${estado === 'ATENUADA' ? 'text-blue-600' : 'text-slate-400'}`} />
      </BotaoDaLinha>
      <BotaoDaLinha
        titulo={oculta ? `Exibir ${rotulo}` : `Ocultar ${rotulo}`}
        pressionado={estado === 'MISTO' ? 'mixed' : !oculta}
        onClick={onOlho}
      >
        {oculta ? (
          <EyeOff className="h-3.5 w-3.5 text-slate-400" />
        ) : (
          <Eye className={`h-3.5 w-3.5 ${estado === 'MISTO' ? 'text-slate-400' : 'text-blue-600'}`} />
        )}
      </BotaoDaLinha>
      {isolado ? (
        <BotaoDaLinha titulo={`Reexibir as camadas (sair do isolamento de ${rotulo})`} pressionado onClick={onReexibir}>
          <RotateCcw className="h-3.5 w-3.5 text-blue-600" />
        </BotaoDaLinha>
      ) : (
        <BotaoDaLinha titulo={`Isolar ${rotulo} — só ela na tela`} onClick={onIsolar}>
          <Focus className="h-3.5 w-3.5 text-slate-400" />
        </BotaoDaLinha>
      )}
    </li>
  );
}

/**
 * Uma linha do mapa de fundo: olho e meio-tom como as camadas, sem contagem
 * (não há peça) e sem Isolar (fundo não é disciplina — fica um vão do tamanho
 * do botão para as colunas alinharem com as outras linhas).
 */
function LinhaDoMapa({ fonte, estado, motivoDesligado, onOlho, onMeioTom }: { fonte: FonteDoMapa; estado: EstadoDaCamada; motivoDesligado: string | null; onOlho: () => void; onMeioTom: () => void }) {
  const { rotulo, ajuda } = FONTE_DO_MAPA[fonte];
  const oculta = estado === 'OCULTA';
  return (
    <li data-mapa={fonte} data-estado={estado} className="flex items-center gap-1 py-0.5 pl-6 pr-1">
      <span
        className={`min-w-0 flex-1 truncate text-sm ${TEXTO_DO_ESTADO[estado]} ${motivoDesligado ? 'opacity-60' : ''}`}
        title={`${rotulo} — ${ROTULO_DO_ESTADO[estado]}. ${ajuda}${motivoDesligado ? ` ${motivoDesligado}` : ''}`}
      >
        {rotulo}
      </span>
      <span className="shrink-0 rounded-[6px] bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-400" title="Mapa de fundo: não tem peças">
        —
      </span>
      <BotaoDaLinha
        titulo={estado === 'ATENUADA' ? `Tirar ${rotulo} do meio-tom` : `${rotulo} em meio-tom (claro, por baixo do desenho)`}
        pressionado={estado === 'ATENUADA'}
        onClick={onMeioTom}
        desligado={motivoDesligado}
      >
        <Contrast className={`h-3.5 w-3.5 ${estado === 'ATENUADA' ? 'text-blue-600' : 'text-slate-400'}`} />
      </BotaoDaLinha>
      <BotaoDaLinha titulo={oculta ? `Exibir ${rotulo}` : `Ocultar ${rotulo}`} pressionado={!oculta} onClick={onOlho} desligado={motivoDesligado}>
        {oculta ? <EyeOff className="h-3.5 w-3.5 text-slate-400" /> : <Eye className="h-3.5 w-3.5 text-blue-600" />}
      </BotaoDaLinha>
      <span className="w-[22px] shrink-0" aria-hidden="true" />
    </li>
  );
}

/**
 * Uma linha de opção do Exibir: o mesmo item do menu. Só o olho, com vãos no lugar do meio-tom e do Isolar para as
 * colunas alinharem. Item sem efeito agora (`desabilitado`) fica com o olho desligado e o motivo no `title`.
 */
function LinhaDeExibicao({ item }: { item: ItemDeExibicao }) {
  const motivo = item.desabilitado ? item.ajuda : null;
  const estado: EstadoDaCamada = item.ligado ? 'VISIVEL' : 'OCULTA';
  return (
    <li data-exibir={item.chave} data-estado={estado} className="flex items-center gap-1 py-0.5 pl-6 pr-1">
      <span
        className={`min-w-0 flex-1 truncate text-sm ${TEXTO_DO_ESTADO[estado]} ${motivo ? 'opacity-60' : ''}`}
        title={`${item.rotulo} — ${item.ligado ? 'ligado' : 'desligado'}. ${item.ajuda} (A mesma opção de Vista › Exibir.)`}
      >
        {item.rotulo}
      </span>
      <span className="shrink-0 rounded-[6px] bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-400" title="Opção de exibição: não tem peças">
        —
      </span>
      <span className="w-[22px] shrink-0" aria-hidden="true" />
      <BotaoDaLinha titulo={item.ligado ? `Ocultar ${item.rotulo}` : `Exibir ${item.rotulo}`} pressionado={item.ligado} onClick={item.alternar} desligado={motivo}>
        {item.ligado ? <Eye className="h-3.5 w-3.5 text-blue-600" /> : <EyeOff className="h-3.5 w-3.5 text-slate-400" />}
      </BotaoDaLinha>
      <span className="w-[22px] shrink-0" aria-hidden="true" />
    </li>
  );
}

export default function PainelCamadas({ estados, onMudar, contagem, baseAtenuada, onBaseAtenuada, onIsolar, onReexibir, mapa, exibicao }: Props) {
  // Grupos expandidos: preferência de leitura, como o aberto/fechado das seções.
  const [expandidos, setExpandidos] = usePersistedState<Record<string, boolean>>('blueprint:camadasExpandidas', {});
  const isolado = alvoIsolado(estados, { baseAtenuada });
  const tudoVisivel = estadosIguais(estados, ESTADOS_PADRAO);
  // "Ocultar todas" também esconde o mapa: ocultar tudo e o mapa ficar seria defeito.
  const tudoOculto = estadosIguais(estados, definirTodas('OCULTA')) && !(mapa && algumMapaAVista(mapa.estados));

  const linhaDaCamada = (c: Camada, g: DefinicaoDoGrupo, nivel: 0 | 1, expansor?: LinhaProps['expansor']) => (
    <Linha
      key={c}
      expansor={expansor}
      alvo={c}
      rotulo={nivel === 0 ? g.rotulo : ROTULO_DA_CAMADA[c]}
      ajuda={AJUDA_DA_CAMADA[c]}
      cor={nivel === 0 ? g.cor : undefined}
      estado={estados[c]}
      quantidade={nivel === 0 ? contagemDoGrupo(g.id, contagem) : contagem[c]}
      isolado={isolado === c || (nivel === 0 && isolado === g.id)}
      nivel={nivel}
      onOlho={() => onMudar(alternarVisibilidade(estados, nivel === 0 ? g.id : c))}
      onMeioTom={() => onMudar(alternarAtenuacao(estados, nivel === 0 ? g.id : c))}
      onIsolar={() => onIsolar(nivel === 0 ? g.id : c)}
      onReexibir={onReexibir}
    />
  );

  return (
    <div className="space-y-2 px-1 pb-2">
      <div className="flex flex-wrap items-center gap-1.5 px-1">
        <button
          type="button"
          onClick={() => onMudar(ESTADOS_PADRAO)}
          disabled={tudoVisivel}
          title={tudoVisivel ? 'Todas as camadas já estão visíveis' : 'Mostrar todas as camadas (o mapa de fundo não liga sozinho: ele baixa imagens da internet)'}
          className="inline-flex items-center gap-1 rounded-[6px] border border-slate-300 px-1.5 py-0.5 text-xs text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Eye className="h-3 w-3" /> Mostrar todas
        </button>
        <button
          type="button"
          onClick={() => {
            onMudar(definirTodas('OCULTA'));
            if (mapa && algumMapaAVista(mapa.estados)) mapa.onMudar(MAPA_OCULTO);
          }}
          disabled={tudoOculto}
          title={tudoOculto ? 'Todas as camadas já estão ocultas' : 'Ocultar todas as camadas (depois ligue só as que quer comparar)'}
          className="inline-flex items-center gap-1 rounded-[6px] border border-slate-300 px-1.5 py-0.5 text-xs text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <EyeOff className="h-3 w-3" /> Ocultar todas
        </button>
      </div>

      <ul className="divide-y divide-slate-100" aria-label="Camadas por disciplina">
        {GRUPOS_DE_CAMADAS.map((g) => {
          // Grupo de UMA camada com sublinhas: a linha é a MESMA de hoje, com a seta que abre o mapa de fundo
          // (Terreno) e as opções do Exibir (Terreno, Estrutura) — independentes dela.
          const comMapa = g.id === 'TERRENO' && !!mapa;
          const opcoes = exibicao?.[g.id] ?? [];
          if (g.camadas.length === 1 && (comMapa || opcoes.length > 0)) {
            const aberto = expandidos[g.id] ?? false;
            const idDoCorpo = `camadas-${g.id.toLowerCase()}`;
            return (
              <li key={g.id} className="list-none">
                <ul>{linhaDaCamada(g.camadas[0], g, 0, { aberto, idDoCorpo, onAlternar: () => setExpandidos((e) => ({ ...e, [g.id]: !aberto })) })}</ul>
                {aberto && (
                  <ul id={idDoCorpo} className="ml-4 border-l border-slate-200" aria-label={`Dentro de ${g.rotulo}`}>
                    {comMapa && mapa && FONTES_DO_MAPA.map((f) => (
                      <LinhaDoMapa
                        key={f}
                        fonte={f}
                        estado={mapa.estados[f]}
                        motivoDesligado={mapa.motivoDesligado ?? motivoDaFonteIndisponivel(f)}
                        onOlho={() => mapa.onMudar(alternarOlhoDoMapa(mapa.estados, f))}
                        onMeioTom={() => mapa.onMudar(alternarMeioTomDoMapa(mapa.estados, f))}
                      />
                    ))}
                    {opcoes.map((it) => (
                      <LinhaDeExibicao key={it.chave} item={it} />
                    ))}
                  </ul>
                )}
              </li>
            );
          }
          if (g.camadas.length === 1) return linhaDaCamada(g.camadas[0], g, 0);
          const aberto = expandidos[g.id] ?? false;
          const idDoCorpo = `camadas-${g.id.toLowerCase()}`;
          return (
            <li key={g.id} className="list-none">
              <ul>
                <Linha
                  alvo={g.id}
                  rotulo={g.rotulo}
                  ajuda={g.camadas.map((c) => `${ROTULO_DA_CAMADA[c]}: ${AJUDA_DA_CAMADA[c]}`).join(' ')}
                  cor={g.cor}
                  estado={estadoDoGrupo(g.id, estados)}
                  quantidade={contagemDoGrupo(g.id, contagem)}
                  isolado={isolado === g.id}
                  nivel={0}
                  expansor={{ aberto, idDoCorpo, onAlternar: () => setExpandidos((e) => ({ ...e, [g.id]: !aberto })) }}
                  onOlho={() => onMudar(alternarVisibilidade(estados, g.id))}
                  onMeioTom={() => onMudar(alternarAtenuacao(estados, g.id))}
                  onIsolar={() => onIsolar(g.id)}
                  onReexibir={onReexibir}
                />
              </ul>
              {aberto && (
                <ul id={idDoCorpo} className="ml-4 border-l border-slate-200">
                  {g.camadas.map((c) => linhaDaCamada(c, g, 1))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>

      <label className="flex items-start gap-1.5 px-1 text-[11px] leading-snug text-slate-500">
        <input type="checkbox" className="mt-0.5" checked={baseAtenuada} onChange={(e) => onBaseAtenuada(e.target.checked)} />
        Isolar mantém a arquitetura em meio-tom, como referência
      </label>
    </div>
  );
}
