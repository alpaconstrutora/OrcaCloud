import React, { Suspense } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { SaleUnitStatus } from '../../lib/salesAnalysis';
import { rotuloDoAndar } from '../../lib/rentalUnitMirror';
import { contagemPorStatus, type CenaDoEspelho, type PrismaDoEspelho } from '../../utils/espelhoDeVendas3d';
import { ORDEM_DOS_STATUS, PALETA_PADRAO_DO_ESPELHO, resumoDoEspelho, type PaletaDoEspelho } from '../../utils/espelhoDeVendas3dMalha';
import { LUZES_DO_DIA, LUZ_PADRAO, ORDEM_DAS_LUZES, type LuzDoDia } from '../../utils/espelhoDeVendas3dLuz';
import { FichaDaUnidade, type DadosDaUnidade } from './FichaDaUnidade';
import { webglDisponivel } from './webglDisponivel';

/**
 * ESPELHO DE VENDAS 3D (09/11/2026) — a casca: legenda que destaca, o desenho 3D, a ficha da unidade tocada e a
 * lista por andar. Plano: docs/planos/2026-11-09-espelho-de-vendas-3d.md. O pedido nasceu de um vídeo de quiosque
 * de vendas: a torre em 3D, cada unidade na cor do status, o toque abre a ficha.
 *
 * - A LEGENDA é o controle "Destacar" (guia §28.6): uma escolha, a contagem ao lado, desligada com o motivo quando
 *   é zero. É também a codificação secundária da cor (§28.4): quem não distingue as cores lê os números.
 * - O 3D não é o único caminho: a lista por andar faz tudo o que o toque faz, pelo teclado (Tab entra uma vez, as
 *   setas andam). Sem WebGL, ou se o desenho falhar, ela é a tela — nunca uma área em branco.
 * - three só entra por `React.lazy`, e só quando há o que desenhar.
 * - Nunca tela cheia: o desenho tem altura fixa dentro do card.
 */

const Cena = React.lazy(() => import('./Espelho3DCena'));

export interface Espelho3DProps {
    cena: CenaDoEspelho;
    /** O que o cadastro diz de cada unidade (pelo id), para a ficha. */
    dados?: ReadonlyMap<string, DadosDaUnidade>;
    /** As cores e os nomes de cada status; ausente = a paleta da Análise de Vendas. */
    paleta?: PaletaDoEspelho;
    mostrarPreco?: boolean;
    /** Os botões da ficha (Proposta, cesta…); quem não age (o investidor) não passa. */
    acoesDaFicha?: (prisma: PrismaDoEspelho) => React.ReactNode;
    onSelecionar?: (unitId: string | null) => void;
    /** false = sem o card em volta (quem chama já tem o seu — o Portal do Investidor). */
    moldura?: boolean;
}

/** O desenho falhou depois de montado (contexto WebGL perdido, placa sem suporte): a lista assume. */
class SeODesenhoFalhar extends React.Component<{ onFalha: () => void; children: React.ReactNode }, { falhou: boolean }> {
    state = { falhou: false };
    static getDerivedStateFromError() {
        return { falhou: true };
    }
    componentDidCatch() {
        this.props.onFalha();
    }
    render() {
        return this.state.falhou ? null : this.props.children;
    }
}

interface AndarDaLista { andar: number; nome: string; unidades: PrismaDoEspelho[] }
interface TorreDaLista { torreId: string; nome: string; andares: AndarDaLista[] }

/** As unidades por torre e por andar, o mais alto em cima — como o prédio. */
function torresDaLista(cena: CenaDoEspelho): TorreDaLista[] {
    return cena.torres
        .map((t) => {
            const andares = new Map<number, AndarDaLista>();
            for (const p of cena.prismas) {
                if (p.torreId !== t.torreId || !p.unitId) continue;
                const a = andares.get(p.andar) ?? { andar: p.andar, nome: p.nomeDoAndar, unidades: [] };
                a.unidades.push(p);
                andares.set(p.andar, a);
            }
            return { torreId: t.torreId, nome: t.nome, andares: [...andares.values()].sort((a, b) => b.andar - a.andar) };
        })
        .filter((t) => t.andares.length > 0);
}

const frase = (p: PrismaDoEspelho, paleta: PaletaDoEspelho) =>
    `Unidade ${p.rotulo}, ${p.torre}, ${p.nomeDoAndar}${p.status ? `, ${paleta[p.status].rotulo}` : ''}`;

export const Espelho3D: React.FC<Espelho3DProps> = ({ cena, dados, paleta = PALETA_PADRAO_DO_ESPELHO, mostrarPreco, acoesDaFicha, onSelecionar, moldura = true }) => {
    const card = moldura ? 'bg-white rounded-[10px] border border-gray-100 shadow-sm p-4' : '';
    const [destaque, setDestaque] = React.useState<SaleUnitStatus | null>(null);
    const [selecionada, setSelecionada] = React.useState<string | null>(null);
    // A luz do dia (F7): só muda o desenho — céu, sol e, à noite, as unidades acesas. O status segue na cor da legenda.
    const [luz, setLuz] = React.useState<LuzDoDia>(LUZ_PADRAO);
    const presetDeLuz = LUZES_DO_DIA[luz];
    const [desenha3d, setDesenha3d] = React.useState(webglDisponivel);
    const [desenhoFalhou, setDesenhoFalhou] = React.useState(false);
    const [listaAberta, setListaAberta] = React.useState(() => !desenha3d);

    const contagem = React.useMemo(() => contagemPorStatus(cena.prismas), [cena.prismas]);
    const resumo = React.useMemo(() => resumoDoEspelho(cena.prismas, paleta), [cena.prismas, paleta]);
    const torres = React.useMemo(() => torresDaLista(cena), [cena]);
    const total = ORDEM_DOS_STATUS.reduce((s, k) => s + contagem[k], 0);
    const prismaSelecionado = selecionada ? cena.prismas.find((p) => p.unitId === selecionada) ?? null : null;
    // "Outros status" só aparece quando existe: é exceção de cadastro, não uma categoria a oferecer vazia.
    const status = ORDEM_DOS_STATUS.filter((k) => k !== 'other' || contagem.other > 0);

    const selecionar = (unitId: string | null) => {
        setSelecionada(unitId);
        onSelecionar?.(unitId);
    };

    // A unidade que sumiu da cena (filtro de quem chama) não fica com a ficha aberta.
    React.useEffect(() => {
        if (selecionada && !cena.prismas.some((p) => p.unitId === selecionada)) setSelecionada(null);
    }, [cena.prismas, selecionada]);

    // Lista: Tab entra UMA vez (roving tabindex); as setas andam pela unidade e pelo andar.
    const [ativa, setAtiva] = React.useState<string>('');
    const botoes = React.useRef(new Map<string, HTMLButtonElement>());
    const posicao = React.useMemo(() => {
        const m = new Map<string, { t: number; a: number; i: number }>();
        torres.forEach((t, ti) => t.andares.forEach((a, ai) => a.unidades.forEach((u, ui) => m.set(u.unitId!, { t: ti, a: ai, i: ui }))));
        return m;
    }, [torres]);
    const primeira = torres[0]?.andares[0]?.unidades[0]?.unitId ?? '';
    const comFoco = posicao.has(ativa) ? ativa : primeira;
    const mover = (id: string, tecla: string) => {
        const p = posicao.get(id);
        if (!p) return;
        const t = torres[p.t];
        const doAndar = t.andares[p.a].unidades;
        let alvo: PrismaDoEspelho | undefined;
        if (tecla === 'ArrowRight') alvo = doAndar[p.i + 1] ?? torres[p.t + 1]?.andares[0]?.unidades[0];
        if (tecla === 'ArrowLeft') alvo = doAndar[p.i - 1] ?? torres[p.t - 1]?.andares[0]?.unidades.at(-1);
        if (tecla === 'ArrowUp' || tecla === 'ArrowDown') {
            const vizinho = t.andares[p.a + (tecla === 'ArrowUp' ? -1 : 1)]?.unidades;
            if (vizinho) alvo = vizinho[Math.min(p.i, vizinho.length - 1)];
        }
        if (tecla === 'Home') alvo = doAndar[0];
        if (tecla === 'End') alvo = doAndar.at(-1);
        if (alvo?.unitId) {
            setAtiva(alvo.unitId);
            botoes.current.get(alvo.unitId)?.focus();
        }
    };

    if (total === 0) {
        return (
            <div className={card}>
                <p className="min-h-[160px] flex items-center justify-center text-sm text-gray-500 text-center">
                    Nenhuma unidade para mostrar no espelho.{cena.avisos.length > 0 ? ` ${cena.avisos[0]}` : ''}
                </p>
            </div>
        );
    }

    return (
        <div className={card}>
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <div role="radiogroup" aria-label="Destacar unidades por status" className="flex flex-wrap items-center gap-1.5">
                {status.map((k) => {
                    const n = contagem[k];
                    const on = destaque === k;
                    return (
                        <button
                            key={k}
                            type="button"
                            role="radio"
                            aria-checked={on}
                            disabled={n === 0}
                            title={n === 0 ? `Nenhuma unidade ${paleta[k].rotulo.toLowerCase()}` : on ? 'Clique de novo para mostrar todas' : `Destacar: ${paleta[k].plural.toLowerCase()}`}
                            onClick={() => setDestaque(on ? null : k)}
                            className={`h-8 px-2.5 inline-flex items-center gap-2 rounded-[6px] border text-[13px] font-medium whitespace-nowrap transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 disabled:opacity-40 disabled:cursor-not-allowed ${
                                on ? 'bg-gray-900 border-gray-900 text-white' : 'bg-white border-gray-200 text-gray-700 hover:border-gray-400'
                            }`}
                        >
                            <span aria-hidden="true" className="w-2.5 h-2.5 rounded-[2px]" style={{ backgroundColor: paleta[k].cor }} />
                            {paleta[k].plural} <span className={`tabular-nums ${on ? 'text-gray-300' : 'text-gray-500'}`}>{n}</span>
                        </button>
                    );
                })}
            </div>
            {desenha3d && (
                <div role="radiogroup" aria-label="Luz do dia no desenho" className="inline-flex items-center rounded-[6px] border border-gray-200 bg-white p-0.5">
                    {ORDEM_DAS_LUZES.map((k) => {
                        const on = luz === k;
                        return (
                            <button
                                key={k}
                                type="button"
                                role="radio"
                                aria-checked={on}
                                title={`Ver as torres com a luz de: ${LUZES_DO_DIA[k].rotulo.toLowerCase()}`}
                                onClick={() => setLuz(k)}
                                className={`h-7 px-2.5 rounded-[4px] text-[13px] font-medium whitespace-nowrap transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 ${
                                    on ? 'bg-gray-900 text-white' : 'text-gray-700 hover:bg-gray-100'
                                }`}
                            >
                                {LUZES_DO_DIA[k].rotulo}
                            </button>
                        );
                    })}
                </div>
            )}
            </div>

            <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
                {desenha3d ? (
                    <div role="img" aria-label={`Torres em 3D. ${resumo}`} className="relative h-[60vh] min-h-[360px] overflow-hidden rounded-[10px] border border-gray-100"
                        data-luz={luz}
                        style={{ backgroundImage: `linear-gradient(to bottom, ${presetDeLuz.ceu.alto}, ${presetDeLuz.ceu.horizonte})` }}
                    >
                        <SeODesenhoFalhar
                            onFalha={() => {
                                setDesenha3d(false);
                                setDesenhoFalhou(true);
                                setListaAberta(true);
                            }}
                        >
                            <Suspense fallback={<p className="absolute inset-0 flex items-center justify-center text-sm text-gray-500">Carregando o desenho 3D…</p>}>
                                <Cena cena={cena} paleta={paleta} destaque={destaque} selecionada={selecionada} onSelecionar={selecionar} luz={presetDeLuz} />
                            </Suspense>
                        </SeODesenhoFalhar>
                        <p aria-hidden="true" className={`pointer-events-none absolute bottom-2 left-3 text-xs ${presetDeLuz.textoSobreOCeu === 'claro' ? 'text-slate-200' : 'text-gray-500'}`}>Arraste para girar · role ou pince para aproximar · toque numa unidade</p>
                    </div>
                ) : (
                    <p role="status" className="rounded-[10px] border border-gray-100 bg-gray-50 p-4 text-sm text-gray-700">
                        {desenhoFalhou ? 'O desenho 3D não pôde ser aberto neste aparelho.' : 'Este navegador não desenha 3D.'} As unidades estão na lista por andar, logo abaixo.
                    </p>
                )}

                <div>
                    {prismaSelecionado ? (
                        <FichaDaUnidade
                            prisma={prismaSelecionado}
                            dados={dados?.get(prismaSelecionado.unitId!)}
                            paleta={paleta}
                            mostrarPreco={mostrarPreco}
                            acoes={acoesDaFicha?.(prismaSelecionado)}
                            onFechar={() => selecionar(null)}
                        />
                    ) : (
                        <p className="rounded-[10px] border border-dashed border-gray-200 p-4 text-sm text-gray-500">
                            {desenha3d ? 'Toque numa unidade do desenho, ou escolha na lista por andar, para ver a ficha.' : 'Escolha uma unidade na lista por andar para ver a ficha.'}
                        </p>
                    )}
                </div>
            </div>

            <div className="mt-4 border-t border-gray-100 pt-3">
                <button
                    type="button"
                    aria-expanded={listaAberta}
                    aria-controls="espelho3d-lista"
                    onClick={() => setListaAberta((v) => !v)}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-700 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 rounded-[6px]"
                >
                    {listaAberta ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    Unidades por andar <span className="tabular-nums text-gray-500">{total}</span>
                </button>

                {listaAberta && (
                    <div id="espelho3d-lista" className="mt-3 flex gap-8 overflow-x-auto pb-1">
                        {torres.map((t) => (
                            <div key={t.torreId} role="group" aria-label={`${t.nome}, ${t.andares.reduce((s, a) => s + a.unidades.length, 0)} unidades`} className="shrink-0">
                                <p className="text-xs font-semibold text-gray-600 mb-2">{t.nome}</p>
                                <div className="flex flex-col gap-1.5">
                                    {t.andares.map((a) => {
                                        const rot = rotuloDoAndar(a.andar);
                                        return (
                                            <div key={a.andar} className="flex items-center gap-2">
                                                <span className="w-7 shrink-0 text-right text-xs text-gray-500 tabular-nums" title={a.nome}>{rot.curto}</span>
                                                <div className="flex gap-1.5">
                                                    {a.unidades.map((u) => {
                                                        const id = u.unitId!;
                                                        const apagada = destaque != null && u.status !== destaque;
                                                        const escolhida = id === selecionada;
                                                        return (
                                                            <button
                                                                key={id}
                                                                ref={(el) => {
                                                                    if (el) botoes.current.set(id, el);
                                                                    else botoes.current.delete(id);
                                                                }}
                                                                type="button"
                                                                tabIndex={id === comFoco ? 0 : -1}
                                                                aria-label={frase(u, paleta)}
                                                                aria-pressed={escolhida}
                                                                onClick={() => selecionar(escolhida ? null : id)}
                                                                onFocus={() => setAtiva(id)}
                                                                onKeyDown={(e) => {
                                                                    if (['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) {
                                                                        e.preventDefault();
                                                                        mover(id, e.key);
                                                                    }
                                                                }}
                                                                className={`h-9 min-w-[4.75rem] px-2 inline-flex items-center justify-center gap-1.5 rounded-[6px] border text-[13px] font-medium tabular-nums text-gray-900 transition-[opacity,filter] duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-blue-600 ${
                                                                    escolhida ? 'border-gray-900 bg-gray-50 ring-1 ring-gray-900' : 'border-gray-200 bg-white hover:border-gray-400'
                                                                } ${apagada ? 'opacity-25 saturate-0' : ''}`}
                                                            >
                                                                <span aria-hidden="true" className="w-2.5 h-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: u.status ? paleta[u.status].cor : undefined }} />
                                                                {u.rotulo}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default Espelho3D;
