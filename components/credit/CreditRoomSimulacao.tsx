import React from 'react';
import { ChartCard } from '../analysis/chartKit';
import { campo, campoTravado, MOTIVO_CARENCIA_DA_OPERACAO, MOTIVO_PRAZO_DA_OPERACAO } from './camposDoRoom';
import type { CreditRoom, CreditRoomVersion } from '../../types/creditRoom';
import type { SnapshotCapacidade } from '../../utils/creditRoomSnapshot';
import { simularParametros } from '../../utils/creditRoomPrevia';
import {
    PARAMETROS_CAPACIDADE_PADRAO, carenciaVemDaOperacao, fluxosDaOperacao, parametrosEfetivos, prazoVemDaOperacao,
    validarParametrosCapacidade, type ParametrosCapacidade,
} from '../../utils/creditCapacity';

/**
 * Simulação de parâmetros da capacidade na PRÉVIA interna (22/11/2026).
 *
 * Mexer nos campos recalcula a aba na hora, em memória (`simularParametros`) —
 * não relê o banco e não grava nada. Só "Salvar no room" grava, e grava os
 * parâmetros do CADASTRO do room (a prévia seguinte nasce deles); versão
 * liberada continua imutável. O painel só existe na prévia do lado interno:
 * versão liberada e portal do credor não recebem `simulacao`.
 */

export interface SimulacaoDaCapacidade {
    room: CreditRoom;
    /** `VersaoPreparada.servicoNovoSimulado`: o serviço novo da série foi montado com `buildSchedule` (não é o cronograma de uma proposta). */
    servicoNovoSimulado: boolean;
    /** Grava os parâmetros no room (o pai chama o serviço e avisa `onChanged`). Rejeita com `Error` de mensagem legível. */
    onSalvar: (p: ParametrosCapacidade) => Promise<void>;
    /**
     * Avisa o pai quando há (ou deixa de haver) simulação NÃO salva — para o "Liberar" dizer que ela não vai
     * na liberação. Volta a `false` ao descartar, ao salvar, quando a prévia muda e quando a aba desmonta.
     */
    onPendenteChange?: (pendente: boolean) => void;
}

interface Campos {
    dscr_minimo: string; taxa_mensal_pct: string; prazo_meses: string; carencia_meses: string;
    sistema: ParametrosCapacidade['sistema']; haircut_estoque_pct: string;
}

const camposDe = (p: ParametrosCapacidade): Campos => ({
    dscr_minimo: String(p.dscr_minimo), taxa_mensal_pct: String(p.taxa_mensal_pct),
    prazo_meses: String(p.prazo_meses), carencia_meses: String(p.carencia_meses),
    sistema: p.sistema, haircut_estoque_pct: String(p.haircut_estoque_pct),
});

/** Campo vazio = `NaN` (inválido, nunca zero): a validação recusa e a aba segue com os parâmetros do room. */
const numero = (s: string) => (s.trim() === '' ? NaN : Number(s));

const CHAVES_NUMERICAS = ['dscr_minimo', 'taxa_mensal_pct', 'prazo_meses', 'carencia_meses', 'haircut_estoque_pct'] as const;

export interface PainelDaSimulacao {
    campos: Campos;
    onCampo: (k: keyof Campos, v: string) => void;
    prazoTravado: boolean; carenciaTravada: boolean;
    servicoNovoSimulado: boolean;
    mudou: boolean; erro: string | null;
    salvando: boolean; erroAoSalvar: string | null;
    onVoltar: () => void; onSalvar: () => void;
}

/**
 * Estado da simulação + a capacidade simulada. Sem `simulacao` (versão liberada,
 * portal) devolve a capacidade como veio e nenhum painel. A simulação é local
 * à versão exibida: uma prévia nova (outro objeto `version`) a descarta.
 */
export function useSimulacaoDeParametros(
    version: CreditRoomVersion, cBase: SnapshotCapacidade | null, simulacao?: SimulacaoDaCapacidade,
): { capacidade: SnapshotCapacidade | null; painel: PainelDaSimulacao | null } {
    const room = simulacao?.room;
    const guardado = room?.parametrosCapacidade ?? PARAMETROS_CAPACIDADE_PADRAO;
    // Os parâmetros que a conta do room usa de fato (prazo/carência da operação vencem os do cadastro).
    const base = React.useMemo(
        () => (room ? parametrosEfetivos(guardado, room.termMonths, room.graceMonths) : null),
        [room, guardado],
    );
    const camposBase = React.useMemo(() => (base ? camposDe(base) : null), [base]);
    const [edicao, setEdicao] = React.useState<{ versao: CreditRoomVersion; campos: Campos } | null>(null);
    const [salvando, setSalvando] = React.useState(false);
    const [erroAoSalvar, setErroAoSalvar] = React.useState<string | null>(null);

    const campos = edicao && edicao.versao === version ? edicao.campos : camposBase;
    const servicoNovoSimulado = simulacao?.servicoNovoSimulado ?? false;

    const calculo = React.useMemo(() => {
        if (!room || !base || !campos) return null;
        const prazoTravado = prazoVemDaOperacao(room.termMonths);
        const carenciaTravada = carenciaVemDaOperacao(room.graceMonths);
        const p: ParametrosCapacidade = {
            ...base,
            dscr_minimo: numero(campos.dscr_minimo),
            taxa_mensal_pct: numero(campos.taxa_mensal_pct),
            sistema: campos.sistema,
            haircut_estoque_pct: numero(campos.haircut_estoque_pct),
            ...(prazoTravado ? {} : { prazo_meses: numero(campos.prazo_meses) }),
            ...(carenciaTravada ? {} : { carencia_meses: numero(campos.carencia_meses) }),
        };
        const mudou = p.sistema !== base.sistema || CHAVES_NUMERICAS.some(k => p[k] !== base[k]);
        const erro = validarParametrosCapacidade(p, room.termMonths, room.graceMonths);
        // Inválido = a aba segue com os parâmetros do room (simular com prazo 0 ou taxa vazia seria inventar número).
        const capacidade = cBase && mudou && !erro
            ? simularParametros(cBase, p, {
                requestedAmount: version.snapshot.operacao?.requested_amount ?? 0,
                servicoNovoSimulado,
                fluxos: fluxosDaOperacao(version.snapshot),
            })
            : cBase;
        return { p, mudou, erro, capacidade, prazoTravado, carenciaTravada };
    }, [room, base, campos, cBase, version, servicoNovoSimulado]);

    const pendente = !!simulacao && !!calculo?.mudou;
    const avisarPendente = simulacao?.onPendenteChange;
    React.useEffect(() => {
        if (!avisarPendente) return;
        avisarPendente(pendente);
        return () => avisarPendente(false);
    }, [pendente, avisarPendente]);

    if (!simulacao || !room || !campos || !calculo) return { capacidade: cBase, painel: null };

    const { p, mudou, erro, capacidade, prazoTravado, carenciaTravada } = calculo;
    const salvar = async () => {
        if (!mudou || erro || salvando) return;
        // O que vai ao cadastro: os parâmetros GUARDADOS com os campos editáveis trocados.
        // Prazo/carência que vêm da operação ficam como estavam (a operação é quem manda neles).
        const gravar: ParametrosCapacidade = {
            ...guardado,
            dscr_minimo: p.dscr_minimo, taxa_mensal_pct: p.taxa_mensal_pct, sistema: p.sistema,
            haircut_estoque_pct: p.haircut_estoque_pct,
            ...(prazoTravado ? {} : { prazo_meses: p.prazo_meses }),
            ...(carenciaTravada ? {} : { carencia_meses: p.carencia_meses }),
        };
        setSalvando(true);
        setErroAoSalvar(null);
        try {
            await simulacao.onSalvar(gravar);
        } catch (e) {
            setErroAoSalvar(e instanceof Error && e.message ? e.message : 'Não foi possível salvar os parâmetros no room.');
        } finally {
            setSalvando(false);
        }
    };

    return {
        capacidade,
        painel: {
            campos, prazoTravado, carenciaTravada, servicoNovoSimulado, mudou, erro, salvando, erroAoSalvar,
            onCampo: (k, v) => { setErroAoSalvar(null); setEdicao({ versao: version, campos: { ...campos, [k]: v } }); },
            onVoltar: () => { setErroAoSalvar(null); setEdicao(null); },
            onSalvar: () => void salvar(),
        },
    };
}

/** Painel "Simular parâmetros" — mora logo abaixo dos KPIs da aba Capacidade (só prévia interna). */
export const PainelSimulacao: React.FC<{ painel: PainelDaSimulacao }> = ({ painel: s }) => {
    const uid = React.useId();
    const id = (k: string) => `${uid}-${k}`;
    const motivoSalvar = s.salvando ? 'Salvando…'
        : s.erro ?? (!s.mudou ? 'Nada mudou em relação aos parâmetros do room.' : null);

    return (
        <ChartCard
            title="Simular parâmetros"
            subtitle="Recalcula a aba na hora, só nesta tela: nada é gravado até você salvar no room. A prévia e a próxima liberação passam a usar os parâmetros salvos."
        >
            <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-x-6 gap-y-4">
                    <div className="space-y-1.5">
                        <label htmlFor={id('dscr')} className="block text-xs font-semibold text-slate-500">DSCR mínimo</label>
                        <input id={id('dscr')} type="number" min={0} step={0.05} value={s.campos.dscr_minimo} onChange={e => s.onCampo('dscr_minimo', e.target.value)} className={campo} />
                    </div>
                    <div className="space-y-1.5">
                        <label htmlFor={id('taxa')} className="block text-xs font-semibold text-slate-500">Taxa mensal (%)</label>
                        <input id={id('taxa')} type="number" min={0} step={0.01} value={s.campos.taxa_mensal_pct} onChange={e => s.onCampo('taxa_mensal_pct', e.target.value)} className={campo} />
                    </div>
                    <div className="space-y-1.5">
                        <label htmlFor={id('prazo')} className="block text-xs font-semibold text-slate-500">Prazo (meses)</label>
                        <input
                            id={id('prazo')} type="number" min={1} step={1} value={s.campos.prazo_meses}
                            disabled={s.prazoTravado} title={s.prazoTravado ? MOTIVO_PRAZO_DA_OPERACAO : undefined}
                            onChange={e => s.onCampo('prazo_meses', e.target.value)}
                            className={s.prazoTravado ? campoTravado : campo}
                        />
                        {s.prazoTravado && <p className="text-xs text-gray-500">Vem do prazo da operação.</p>}
                    </div>
                    <div className="space-y-1.5">
                        <label htmlFor={id('carencia')} className="block text-xs font-semibold text-slate-500">Carência (meses)</label>
                        <input
                            id={id('carencia')} type="number" min={0} step={1} value={s.campos.carencia_meses}
                            disabled={s.carenciaTravada} title={s.carenciaTravada ? MOTIVO_CARENCIA_DA_OPERACAO : undefined}
                            onChange={e => s.onCampo('carencia_meses', e.target.value)}
                            className={s.carenciaTravada ? campoTravado : campo}
                        />
                        {s.carenciaTravada && <p className="text-xs text-gray-500">Vem da carência da operação.</p>}
                    </div>
                    <div className="space-y-1.5">
                        <label htmlFor={id('sistema')} className="block text-xs font-semibold text-slate-500">Sistema de amortização</label>
                        <select id={id('sistema')} value={s.campos.sistema} onChange={e => s.onCampo('sistema', e.target.value)} className={campo}>
                            <option value="PRICE">Price</option>
                            <option value="SAC">SAC</option>
                        </select>
                    </div>
                    <div className="space-y-1.5">
                        <label htmlFor={id('haircut')} className="block text-xs font-semibold text-slate-500">Haircut do estoque (%)</label>
                        <input id={id('haircut')} type="number" min={0} max={100} value={s.campos.haircut_estoque_pct} onChange={e => s.onCampo('haircut_estoque_pct', e.target.value)} className={campo} />
                    </div>
                </div>

                {!s.servicoNovoSimulado && (
                    <p className="text-xs text-gray-500">
                        A parcela nova vem da proposta de dívida vinculada — taxa, prazo, carência e sistema mudam só o valor máximo.
                    </p>
                )}
                {s.erro && (
                    <p role="alert" className="text-xs text-red-600">{s.erro} A aba segue com os parâmetros do room até você corrigir.</p>
                )}
                {s.erroAoSalvar && <p role="alert" className="text-xs text-red-600">{s.erroAoSalvar}</p>}

                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                    {s.mudou
                        ? <span className="text-sm font-medium text-amber-700">simulado — não salvo</span>
                        : <span className="text-sm text-gray-500">Parâmetros iguais aos do room.</span>}
                    <div className="flex flex-wrap items-center gap-3">
                        {motivoSalvar && <span id={id('motivo')} className="text-xs text-gray-500">{motivoSalvar}</span>}
                        {s.mudou && (
                            <button
                                type="button" onClick={s.onVoltar} disabled={s.salvando}
                                className="h-9 px-3.5 text-[13px] font-medium text-gray-700 border border-gray-200 rounded-[6px] hover:bg-gray-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Voltar aos do room
                            </button>
                        )}
                        <button
                            type="button" onClick={s.onSalvar}
                            disabled={!!motivoSalvar} title={motivoSalvar ?? undefined}
                            aria-describedby={motivoSalvar ? id('motivo') : undefined}
                            className="h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
                        >
                            Salvar no room
                        </button>
                    </div>
                </div>
            </div>
        </ChartCard>
    );
};
