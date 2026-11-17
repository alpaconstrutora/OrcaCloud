import React from 'react';
import { AlertCircle, CheckCircle, ChevronRight, Timer } from 'lucide-react';
import StandardTable, { StandardTableColumn } from '../ui/StandardTable';
import TableSwitch from '../ui/TableSwitch';
import { useConfirm } from '../ui/confirm';
import { rotinasAutomaticasService, RotinaAutomatica } from '../../services/rotinasAutomaticasService';
import { GRUPOS_ROTINA, quandoRoda, rotinaMeta, statusDaExecucao } from '../../utils/rotinasAutomaticas';

/**
 * Configurações › Rotinas automáticas — liga/desliga os jobs do pg_cron.
 * Plano: docs/planos/2026-11-16-rotinas-automaticas-ligar-desligar.md
 *
 * Só superadmin chega aqui (a folha some para os demais, e o banco recusa as duas RPCs).
 * O interruptor mostra SEMPRE o estado devolvido pelo banco: não vira antes de gravar,
 * para nunca ficar "ligado na tela, desligado no banco". Ligar/desligar vale para todas
 * as organizações — cada rotina é um job único.
 */

// A área das Configurações tem ~840 px numa tela de 1440 (menu lateral + menu da página):
// as larguras somam 830 e a tabela é `dense` (§6.9) para não nascer com rolagem lateral.
// O interruptor vem logo depois do nome — é a ação da tela e nunca pode ficar fora da vista.
const COLUMNS: StandardTableColumn[] = [
    { key: 'rotina', label: 'Rotina', sortable: true, width: 330 },
    { key: 'ativa', label: 'Situação', sortable: true, width: 150 },
    { key: 'quando', label: 'Quando roda', sortable: true, width: 140 },
    { key: 'ultima', label: 'Última execução', sortable: true, width: 120 },
    { key: 'falhas', label: 'Falhas em 7 dias', sortable: true, width: 90 },
];

const ORDEM_DOS_GRUPOS = GRUPOS_ROTINA.map(g => g.id);
const ROTULO_DO_GRUPO = Object.fromEntries(GRUPOS_ROTINA.map(g => [g.id, g.rotulo])) as Record<string, string>;

const DATA_HORA_BRT = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
});
const DATA_BRT = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' });

function partes(fmt: Intl.DateTimeFormat, iso: string): Record<string, string> {
    return Object.fromEntries(fmt.formatToParts(new Date(iso)).map(p => [p.type, p.value]));
}
const dataHora = (iso: string) => { const p = partes(DATA_HORA_BRT, iso); return `${p.day}/${p.month} ${p.hour}:${p.minute}`; };
const dataCurta = (iso: string) => { const p = partes(DATA_BRT, iso); return `${p.day}/${p.month}`; };

type Aviso = { mensagem: string; tipo: 'sucesso' | 'erro' };

/** Linha da tela = jobid (chave de cron.job). Pelo nome, um job chamado "#77" colidiria com a
 *  rotina sem nome de jobid 77; reagendar troca o jobid, mas a linha clicada é trocada pela
 *  devolvida pelo banco. */
const chaveDa = (r: RotinaAutomatica) => String(r.jobid);
const metaDa = (r: RotinaAutomatica) => rotinaMeta(r.jobname, r.jobid);
const execucoes = (n: number) => `${n} ${n === 1 ? 'execução' : 'execuções'}`;
const RODANDO = new Set(['running', 'starting', 'connecting', 'sending']);
const idDetalhes = (r: RotinaAutomatica) => `rotina-detalhes-${r.jobid}`;
const EXPLICA_RELIGADA = 'Foi desligada nesta tela e voltou a ligar por fora dela — por exemplo, uma atualização do sistema que reagendou a rotina. Se ela deve ficar desligada, desligue de novo.';

/** A frase das execuções da semana — a mesma no title (mouse) e nos detalhes (teclado e toque). */
function fraseDaSemana(r: RotinaAutomatica): string {
    if (r.execucoes7d === 0 && r.falhas7d === 0) return 'Nenhuma execução nos últimos 7 dias.';
    if (r.falhas7d === 0) return `${execucoes(r.execucoes7d)} nos últimos 7 dias, nenhuma falhou.`;
    return `${r.falhas7d} de ${execucoes(r.execucoes7d)} nos últimos 7 dias ${r.falhas7d === 1 ? 'falhou' : 'falharam'}.`;
}

/** Desligada pela tela e ligada de novo por fora dela — o caso comum é uma migration que
 *  reagenda o job com unschedule + schedule: o job renasce ligado. */
const religadaFora = (r: RotinaAutomatica) => (r.ativa && r.ultimaAlteracao && !r.ultimaAlteracao.ativaDepois ? r.ultimaAlteracao : null);

const RotinasAutomaticasSettings: React.FC = () => {
    const confirm = useConfirm();
    const [rotinas, setRotinas] = React.useState<RotinaAutomatica[]>([]);
    const [carregando, setCarregando] = React.useState(true);
    const [erroDeCarga, setErroDeCarga] = React.useState<string | null>(null);
    const [gravando, setGravando] = React.useState<Set<string>>(() => new Set());
    const [aviso, setAviso] = React.useState<Aviso | null>(null);
    // Linha com os detalhes abertos (uma por vez). O title some para quem usa teclado ou toque:
    // tudo o que ele diz aparece por escrito ali. O botão mora na coluna Rotina, a primeira e
    // sempre à vista: na última coluna, com a tabela rolada (390 px, notebook), o detalhe abria
    // fora da vista (revisão de 16/11).
    const [aberta, setAberta] = React.useState<string | null>(null);
    const timerDoAviso = React.useRef<ReturnType<typeof setTimeout> | null>(null);

    const avisar = React.useCallback((mensagem: string, tipo: Aviso['tipo']) => {
        // Mesma região montada: o segundo aviso troca o TEXTO, e o leitor de tela anuncia. A
        // animação de entrada roda quando o aviso aparece, não a cada troca.
        setAviso({ mensagem, tipo });
        if (timerDoAviso.current) clearTimeout(timerDoAviso.current);
        timerDoAviso.current = setTimeout(() => setAviso(null), 4500);
    }, []);
    React.useEffect(() => () => { if (timerDoAviso.current) clearTimeout(timerDoAviso.current); }, []);

    const carregar = React.useCallback(async () => {
        setCarregando(true);
        setErroDeCarga(null);
        try {
            setRotinas(await rotinasAutomaticasService.listar());
        } catch (e) {
            setErroDeCarga(e instanceof Error ? e.message : String(e));
        } finally {
            setCarregando(false);
        }
    }, []);
    React.useEffect(() => { void carregar(); }, [carregar]);

    // Depois de um erro ao gravar, relê sem esqueleto: se o banco gravou e só a resposta se
    // perdeu (rede, tempo esgotado), a tela não pode ficar mostrando o estado antigo.
    const releSemEsqueleto = React.useCallback(async () => {
        try { setRotinas(await rotinasAutomaticasService.listar()); } catch { /* o aviso de erro já está na tela */ }
    }, []);

    const alternar = async (r: RotinaAutomatica) => {
        const meta = metaDa(r);
        const ligar = !r.ativa;
        if (!ligar && meta.sensivel) {
            const ok = await confirm({
                title: `Desligar "${meta.nome}"?`,
                message: `${meta.aoDesligar}\n\nVale para todas as organizações. Dá para ligar de novo aqui a qualquer momento.`,
                variant: 'warning',
                confirmLabel: 'Desligar',
            });
            if (!ok) return;
        }
        const chave = chaveDa(r);
        setGravando(prev => new Set(prev).add(chave));
        try {
            const atual = await rotinasAutomaticasService.definir(r.jobname, ligar, r.jobid);
            setRotinas(prev => prev.map(x => (chaveDa(x) === chave ? atual : x)));   // §22: só a linha
            avisar(`${meta.nome}: ${atual.ativa ? 'ligada' : 'desligada'}.`, 'sucesso');
        } catch (e) {
            const motivo = e instanceof Error ? e.message : String(e);
            avisar(`Não foi possível ${ligar ? 'ligar' : 'desligar'} "${meta.nome}": ${motivo}`, 'erro');
            await releSemEsqueleto();
        } finally {
            setGravando(prev => { const s = new Set(prev); s.delete(chave); return s; });
        }
    };

    const ligadas = rotinas.filter(r => r.ativa).length;

    const renderCell = (key: string, r: RotinaAutomatica): React.ReactNode => {
        const meta = metaDa(r);
        switch (key) {
            case 'rotina': {
                const chave = chaveDa(r);
                const aberto = aberta === chave;
                // Nome fixo: quem diz aberto/fechado é o aria-expanded.
                const rotulo = `Detalhes de ${meta.nome}`;
                return (
                    <div className="flex min-w-0 items-start gap-1.5">
                        <button
                            type="button"
                            aria-expanded={aberto}
                            aria-controls={aberto ? idDetalhes(r) : undefined}
                            aria-label={rotulo}
                            title={rotulo}
                            onClick={() => setAberta(aberto ? null : chave)}
                            className="-ml-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[6px] text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                        >
                            <ChevronRight aria-hidden="true" className={`h-4 w-4 transition-transform ${aberto ? 'rotate-90' : ''}`} />
                        </button>
                        <div className="min-w-0">
                            <span className="block truncate text-sm font-normal text-gray-700" title={r.jobname ?? `jobid ${r.jobid}`}>{meta.nome}</span>
                            {meta.oQueFaz && (
                                <span className="block text-[13px] text-gray-500 line-clamp-2" title={meta.oQueFaz}>{meta.oQueFaz}</span>
                            )}
                        </div>
                    </div>
                );
            }
            case 'quando': {
                const texto = quandoRoda(r.schedule);
                return <span className="block text-sm font-normal text-gray-600" title={`Expressão (horário de Brasília = GMT−3): ${r.schedule}`}>{texto}</span>;
            }
            case 'ultima':
                if (!r.ultima) {
                    return <span className="text-sm font-normal text-gray-600" title="Nenhuma execução nos últimos 40 dias">—</span>;
                }
                return (
                    <span className="text-sm font-normal text-gray-600 tabular-nums" title={`Situação: ${statusDaExecucao(r.ultima.status)}`}>
                        {dataHora(r.ultima.inicio)}
                        {r.ultima.status === 'failed' && <span className="text-red-600"> · falhou</span>}
                        {RODANDO.has(r.ultima.status) && <span> · {statusDaExecucao(r.ultima.status)}</span>}
                    </span>
                );
            case 'falhas': {
                if (r.execucoes7d === 0 && r.falhas7d === 0) {
                    return <span className="text-sm font-normal text-gray-600" title="Nenhuma execução nos últimos 7 dias">Sem execução</span>;
                }
                if (r.falhas7d === 0) {
                    return (
                        <span className="text-sm font-normal text-gray-600" title={`${execucoes(r.execucoes7d)} nos últimos 7 dias, nenhuma falhou`}>
                            Nenhuma
                        </span>
                    );
                }
                // O erro vem da última execução que FALHOU — não da última execução, que pode ter
                // passado ou estar rodando agora.
                const titulo = fraseDaSemana(r)
                    + (r.ultimoErro ? '\n' + `Último erro (${dataHora(r.ultimoErro.em)}): ${r.ultimoErro.mensagem}` : '');
                return (
                    <span className="text-sm font-normal text-red-600" title={titulo}>
                        {r.falhas7d} {r.falhas7d === 1 ? 'falha' : 'falhas'}
                    </span>
                );
            }
            case 'ativa': {
                const ocupado = gravando.has(chaveDa(r));
                const alteracao = r.ultimaAlteracao;
                const desligouQuem = !r.ativa && alteracao && !alteracao.ativaDepois ? alteracao : null;
                const religada = religadaFora(r);
                return (
                    <div className="space-y-0.5">
                        <TableSwitch
                            checked={r.ativa}
                            onChange={() => { void alternar(r); }}
                            onLabel="Ligada"
                            offLabel="Desligada"
                            ariaLabel={`Rotina ${meta.nome}`}
                            disabled={ocupado}
                            title={ocupado ? 'Gravando…' : r.ativa ? 'Desligar para todas as organizações' : 'Ligar para todas as organizações'}
                        />
                        {desligouQuem && (
                            <span className="block text-[13px] text-gray-500 [overflow-wrap:anywhere]">
                                Desligada por {desligouQuem.porEmail ?? 'alguém sem e-mail'} em {dataCurta(desligouQuem.em)}
                            </span>
                        )}
                        {religada && (
                            <span className="block text-[13px] text-amber-700 [overflow-wrap:anywhere]" title={EXPLICA_RELIGADA}>
                                Religada fora desta tela · desligada por {religada.porEmail ?? 'alguém sem e-mail'} em {dataCurta(religada.em)}
                            </span>
                        )}
                    </div>
                );
            }
            default:
                return null;
        }
    };

    // Linha de detalhes logo abaixo da rotina — o que o title diz, por escrito.
    const renderExpanded = (r: RotinaAutomatica, visibleCount: number): React.ReactNode => {
        if (aberta !== chaveDa(r)) return null;
        const meta = metaDa(r);
        const religada = religadaFora(r);
        const rotulo = 'text-gray-500';
        const valor = 'text-gray-700 [overflow-wrap:anywhere]';
        return (
            <tr className="bg-gray-50/60">
                <td colSpan={visibleCount} className="px-3 py-3">
                    {/* §6.13: o bloco acompanha a rolagem horizontal e cabe na tela. */}
                    <div
                        id={idDetalhes(r)}
                        role="region"
                        aria-label={`Detalhes de ${meta.nome}`}
                        className="sticky left-3 max-w-[min(48rem,calc(100vw-2rem))]"
                    >
                        <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 text-[13px] sm:grid-cols-[max-content_minmax(0,1fr)]">
                            {meta.oQueFaz && (<>
                                <dt className={rotulo}>O que faz</dt>
                                <dd className={valor}>{meta.oQueFaz}</dd>
                            </>)}
                            <dt className={rotulo}>Nome técnico</dt>
                            <dd className={valor}>{r.jobname ?? `sem nome (jobid ${r.jobid})`}</dd>
                            <dt className={rotulo}>Quando roda</dt>
                            <dd className={valor}>{quandoRoda(r.schedule)} · expressão do pg_cron {r.schedule} (GMT; Brasília = GMT−3)</dd>
                            <dt className={rotulo}>Última execução</dt>
                            <dd className={`${valor} tabular-nums`}>
                                {r.ultima ? `${dataHora(r.ultima.inicio)} · ${statusDaExecucao(r.ultima.status)}` : 'Nenhuma nos últimos 40 dias'}
                            </dd>
                            <dt className={rotulo}>Últimos 7 dias</dt>
                            <dd className={valor}>{fraseDaSemana(r)}</dd>
                            {r.ultimoErro && (<>
                                <dt className={rotulo}>Último erro ({dataHora(r.ultimoErro.em)})</dt>
                                <dd>
                                    <p className="whitespace-pre-wrap rounded-[6px] border border-gray-200 bg-white px-2 py-1.5 text-[13px] text-gray-700 [overflow-wrap:anywhere]">{r.ultimoErro.mensagem}</p>
                                </dd>
                            </>)}
                            {religada && (<>
                                <dt className="text-amber-700">Religada fora desta tela</dt>
                                <dd className={valor}>{EXPLICA_RELIGADA}</dd>
                            </>)}
                        </dl>
                    </div>
                </td>
            </tr>
        );
    };

    const sortValue = (key: string, r: RotinaAutomatica) => {
        switch (key) {
            case 'rotina': return metaDa(r).nome;
            case 'quando': return quandoRoda(r.schedule);
            case 'ultima': return r.ultima?.inicio ?? '';
            case 'falhas': return r.falhas7d;
            case 'ativa': return r.ativa ? 1 : 0;
            default: return null;
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-start gap-4">
                <div className="p-3 bg-blue-50 rounded-[10px]">
                    <Timer className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                    <h2 className="text-lg font-semibold text-gray-800">Rotinas automáticas</h2>
                    <p className="text-sm text-gray-500 mt-1">
                        {carregando && rotinas.length === 0
                            ? 'O que o sistema faz sozinho, em horário marcado.'
                            : `${rotinas.length} ${rotinas.length === 1 ? 'rotina' : 'rotinas'} · ${ligadas} ${ligadas === 1 ? 'ligada' : 'ligadas'}.`}
                        {' '}Ligar ou desligar vale para todas as organizações. Horários de Brasília.
                    </p>
                </div>
            </div>

            {erroDeCarga && (
                <div role="alert" className="flex items-center gap-3 rounded-[10px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span className="flex-1">Não foi possível carregar as rotinas: {erroDeCarga}</span>
                    <button
                        type="button"
                        onClick={() => { void carregar(); }}
                        className="h-9 px-3.5 rounded-[6px] border border-red-200 bg-white text-[13px] font-medium text-red-700 hover:bg-red-100 transition-all"
                    >
                        Tentar de novo
                    </button>
                </div>
            )}

            <StandardTable<RotinaAutomatica>
                storageKey="configuracoes:rotinas-automaticas"
                dense
                columns={COLUMNS}
                rows={rotinas}
                rowKey={chaveDa}
                loading={carregando}
                searchText={r => { const m = metaDa(r); return `${m.nome} ${r.jobname ?? ''} ${m.oQueFaz}`; }}
                searchPlaceholder="Buscar rotina..."
                sortValue={sortValue}
                renderCell={renderCell}
                renderExpanded={renderExpanded}
                agrupamento={{
                    opcoes: [{ value: 'grupo', label: 'Grupo' }],
                    chave: (_campo, r) => {
                        const g = metaDa(r).grupo;
                        return { key: g, label: ROTULO_DO_GRUPO[g] ?? g };
                    },
                    semRotulo: () => 'Sem grupo',
                    ordem: () => ORDEM_DOS_GRUPOS,
                    padrao: 'grupo',
                    title: 'Agrupar as rotinas',
                }}
                empty={{ icon: <Timer className="w-12 h-12 text-gray-300 mx-auto mb-4" />, title: 'Nenhuma rotina encontrada' }}
            />

            {aviso && (
                <div
                    role={aviso.tipo === 'erro' ? 'alert' : 'status'}
                    className={`fixed bottom-6 right-6 z-[300] flex items-center gap-3 px-5 py-4 rounded-[10px] shadow-xl text-sm font-medium animate-in slide-in-from-bottom-4 duration-300 ${
                        aviso.tipo === 'sucesso' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
                    }`}
                >
                    {aviso.tipo === 'sucesso' ? <CheckCircle className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                    {aviso.mensagem}
                </div>
            )}
        </div>
    );
};

export default RotinasAutomaticasSettings;
