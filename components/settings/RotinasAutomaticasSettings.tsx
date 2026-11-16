import React from 'react';
import { AlertCircle, CheckCircle, Timer } from 'lucide-react';
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

type Aviso = { id: number; mensagem: string; tipo: 'sucesso' | 'erro' };

/** Rotina sem nome no pg_cron (jobname NULL) é identificada pelo jobid. */
const chaveDa = (r: RotinaAutomatica) => r.jobname ?? `#${r.jobid}`;
const metaDa = (r: RotinaAutomatica) => rotinaMeta(r.jobname, r.jobid);
const execucoes = (n: number) => `${n} ${n === 1 ? 'execução' : 'execuções'}`;
const RODANDO = new Set(['running', 'starting', 'connecting']);

const RotinasAutomaticasSettings: React.FC = () => {
    const confirm = useConfirm();
    const [rotinas, setRotinas] = React.useState<RotinaAutomatica[]>([]);
    const [carregando, setCarregando] = React.useState(true);
    const [erroDeCarga, setErroDeCarga] = React.useState<string | null>(null);
    const [gravando, setGravando] = React.useState<Set<string>>(() => new Set());
    const [aviso, setAviso] = React.useState<Aviso | null>(null);
    const timerDoAviso = React.useRef<ReturnType<typeof setTimeout> | null>(null);

    const avisar = React.useCallback((mensagem: string, tipo: Aviso['tipo']) => {
        setAviso(prev => ({ id: (prev?.id ?? 0) + 1, mensagem, tipo }));   // id novo = a entrada anima de novo
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
            case 'rotina':
                return (
                    <div className="min-w-0">
                        <span className="block truncate text-sm font-normal text-gray-700" title={r.jobname ?? `jobid ${r.jobid}`}>{meta.nome}</span>
                        {meta.oQueFaz && (
                            <span className="block text-[13px] text-gray-500 line-clamp-2" title={meta.oQueFaz}>{meta.oQueFaz}</span>
                        )}
                    </div>
                );
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
                const titulo = `${r.falhas7d} de ${execucoes(r.execucoes7d)} nos últimos 7 dias ${r.falhas7d === 1 ? 'falhou' : 'falharam'}.`
                    + (r.ultimoErro ? `
Último erro (${dataHora(r.ultimoErro.em)}): ${r.ultimoErro.mensagem}` : '');
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
                // Desligada pela tela e ligada de novo por fora dela — o caso comum é uma migration
                // que reagenda o job com unschedule + schedule: o job renasce ligado.
                const religadaFora = r.ativa && alteracao && !alteracao.ativaDepois ? alteracao : null;
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
                        {religadaFora && (
                            <span
                                className="block text-[13px] text-amber-700 [overflow-wrap:anywhere]"
                                title="Foi desligada nesta tela e voltou a ligar por fora dela — por exemplo, uma atualização do sistema que reagendou a rotina. Se ela deve ficar desligada, desligue de novo."
                            >
                                Religada fora desta tela · desligada por {religadaFora.porEmail ?? 'alguém sem e-mail'} em {dataCurta(religadaFora.em)}
                            </span>
                        )}
                    </div>
                );
            }
            default:
                return null;
        }
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
                            : `${rotinas.length} rotinas · ${ligadas} ligadas.`}
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
                searchText={r => { const m = metaDa(r); return `${m.nome} ${chaveDa(r)} ${m.oQueFaz}`; }}
                searchPlaceholder="Buscar rotina..."
                sortValue={sortValue}
                renderCell={renderCell}
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
                    key={aviso.id}
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
