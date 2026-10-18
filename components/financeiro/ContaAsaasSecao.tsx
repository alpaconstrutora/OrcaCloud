import React, { useEffect, useRef, useState } from 'react';
import { Landmark, Loader2, KeyRound, RefreshCw, PlugZap, AlertTriangle, Check } from 'lucide-react';
import { asaasContaService, CONTA_ASAAS_PADRAO, type AmbienteAsaas, type ContaAsaasConfig } from '../../services/asaasContaService';
import { formatMoney, formatDateBR } from '../ui/Format';

interface Props {
    paymentAccountId: string;
    /** Do drawer: a configuração (ativo, piloto, tetos) grava no "Salvar" dele.
     *  Sem isto (uso avulso da seção), aparece o botão próprio de salvar. */
    registrarAoSalvar?: (fn: (() => Promise<void>) | null) => void;
}

type CamposConfig = Pick<ContaAsaasConfig, 'ativo' | 'piloto' | 'teto_por_pagamento' | 'teto_por_dia' | 'teto_avulso'>;
const CAMPOS_CONFIG: (keyof CamposConfig)[] = ['ativo', 'piloto', 'teto_por_pagamento', 'teto_por_dia', 'teto_avulso'];
const mudou = (a: CamposConfig, b: CamposConfig | null) => !b || CAMPOS_CONFIG.some(k => a[k] !== b[k]);

const INPUT = 'mt-1.5 w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal text-gray-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all';
const BOTAO = 'flex items-center justify-center gap-1.5 h-9 px-3.5 rounded-[6px] font-medium text-[13px] transition-all disabled:opacity-50 disabled:cursor-not-allowed';

function dataHora(iso: string | null): string {
    if (!iso) return '—';
    const d = new Date(iso);
    return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

/**
 * Seção "Conta Asaas" do drawer de Conta de Pagamento (Minha Organização ›
 * Contas). Fase 2 de docs/planos/2026-10-16-asaas-pendencias-e-pix.md.
 *
 * Os botões ficam FORA do submit do formulário de conta (todos type="button").
 * Chave, teste e extrato agem na hora; a configuração (ativo, piloto, tetos)
 * grava no "Salvar" do drawer, via `registrarAoSalvar` — 18/10/2026: com um
 * botão próprio de salvar ao lado do Salvar do drawer, o usuário desmarcou o
 * modo piloto, clicou no Salvar do drawer e a mudança se perdeu sem aviso.
 */
export default function ContaAsaasSecao({ paymentAccountId, registrarAoSalvar }: Props) {
    const [carregando, setCarregando] = useState(true);
    const [cfg, setCfg] = useState<ContaAsaasConfig | null>(null);
    const [ativando, setAtivando] = useState(false);
    const [env, setEnv] = useState<AmbienteAsaas>('sandbox');
    const [chave, setChave] = useState('');
    const [ocupado, setOcupado] = useState<null | 'chave' | 'config' | 'testar' | 'extrato'>(null);
    const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
    /** O que está gravado — para saber se há mudança a salvar. */
    const [salvo, setSalvo] = useState<CamposConfig | null>(null);

    const editando = cfg ?? (ativando ? { payment_account_id: paymentAccountId, ...CONTA_ASAAS_PADRAO } : null);
    const pendente = !!editando && mudou(editando, salvo);
    const editandoRef = useRef(editando);
    editandoRef.current = editando;
    const salvoRef = useRef(salvo);
    salvoRef.current = salvo;

    function aplicar(c: ContaAsaasConfig | null) {
        setCfg(c);
        setSalvo(c);
        if (c) setEnv(c.env);
    }

    /** Depois de testar/guardar chave/sincronizar: atualiza saldo, chave e erros,
     *  mas mantém o que o usuário mexeu e ainda não salvou (piloto, tetos…). */
    async function recarregar() {
        const c = await asaasContaService.get(paymentAccountId);
        const ed = editandoRef.current;
        const emEdicao = ed && mudou(ed, salvoRef.current);
        setSalvo(c);
        if (c) setEnv(c.env);
        setCfg(c && ed && emEdicao
            ? { ...c, ...Object.fromEntries(CAMPOS_CONFIG.map(k => [k, ed[k]])) } as ContaAsaasConfig
            : c);
    }

    // Entra no "Salvar" do drawer: grava só se a configuração mudou.
    useEffect(() => {
        if (!registrarAoSalvar) return;
        registrarAoSalvar(async () => {
            const e = editandoRef.current;
            if (!e || !mudou(e, salvoRef.current)) return;
            try {
                await asaasContaService.salvar(e);
            } catch (err) {
                throw new Error(`a configuração da conta Asaas não: ${err instanceof Error ? err.message : String(err)}`);
            }
        });
        return () => registrarAoSalvar(null);
    }, [registrarAoSalvar]);

    useEffect(() => {
        let vivo = true;
        asaasContaService.get(paymentAccountId)
            .then(c => { if (vivo) aplicar(c); })
            .catch(e => { if (vivo) setMsg({ tipo: 'erro', texto: e instanceof Error ? e.message : String(e) }); })
            .finally(() => { if (vivo) setCarregando(false); });
        return () => { vivo = false; };
    }, [paymentAccountId]);

    async function executar(qual: NonNullable<typeof ocupado>, fn: () => Promise<string>) {
        setOcupado(qual);
        setMsg(null);
        try {
            const texto = await fn();
            await recarregar();
            setMsg({ tipo: 'ok', texto });
        } catch (e) {
            setMsg({ tipo: 'erro', texto: e instanceof Error ? e.message : String(e) });
            await recarregar().catch(() => { /* mantém o que está na tela */ });
        } finally {
            setOcupado(null);
        }
    }

    if (carregando) {
        return (
            <div className="flex items-center gap-2 text-sm text-gray-400 pt-2 border-t border-gray-100">
                <Loader2 className="w-4 h-4 animate-spin" /> Carregando conta Asaas…
            </div>
        );
    }

    // Conta comum: oferece transformar em conta Asaas.
    if (!editando) {
        return (
            <div className="pt-4 border-t border-gray-100">
                <label className="text-xs font-semibold text-slate-500">Conta Asaas</label>
                <p className="text-xs text-gray-400 mt-0.5">
                    Use esta conta para emitir boletos e PIX a clientes e pagar títulos pela Asaas. O saldo e o extrato da Asaas passam a aparecer nela.
                </p>
                <p className="text-xs text-gray-400 mt-1">
                    Ao ativar, a regra de conciliação "Repasse Gateway (Asaas)" desta organização é desligada: o repasse da Asaas para o banco passa a ser conciliado como transferência entre contas próprias.
                </p>
                <button
                    type="button"
                    onClick={() => setAtivando(true)}
                    className={`${BOTAO} mt-2 border border-gray-200 bg-white text-gray-700 hover:bg-gray-50`}
                >
                    <Landmark className="w-4 h-4" /> Usar como conta Asaas
                </button>
            </div>
        );
    }

    const temChave = !!cfg?.tem_chave;
    const motivoSemChave = 'Cadastre e teste a chave de API primeiro.';
    const set = <K extends keyof ContaAsaasConfig>(k: K, v: ContaAsaasConfig[K]) =>
        setCfg({ ...editando, [k]: v } as ContaAsaasConfig);

    return (
        <div className="pt-4 border-t border-gray-100 space-y-4">
            <div>
                <label className="text-xs font-semibold text-slate-500 flex items-center gap-1.5">
                    <Landmark className="w-3.5 h-3.5" /> Conta Asaas
                </label>
                <dl className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                    <dt className="text-gray-500">Chave de API</dt>
                    <dd className="text-gray-700">
                        {temChave
                            ? `${cfg!.env === 'production' ? 'Produção' : 'Sandbox'} · trocada em ${dataHora(cfg!.chave_atualizada_em)}`
                            : 'Não cadastrada'}
                    </dd>
                    <dt className="text-gray-500">Saldo na Asaas</dt>
                    <dd className="text-gray-700">{cfg?.saldo != null ? `${formatMoney(cfg.saldo)} · ${dataHora(cfg.saldo_em)}` : '—'}</dd>
                    <dt className="text-gray-500">Extrato importado até</dt>
                    <dd className="text-gray-700">
                        {cfg?.extrato_sincronizado_ate ? formatDateBR(cfg.extrato_sincronizado_ate) : `ainda não (a partir de ${formatDateBR(editando.extrato_desde)})`}
                    </dd>
                </dl>
                {cfg?.ultimo_erro && (
                    <p className="mt-2 flex items-start gap-1.5 text-xs text-red-700 bg-red-50 rounded-[6px] p-2.5">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        <span>{cfg.ultimo_erro} <span className="text-red-500">({dataHora(cfg.ultimo_erro_em)})</span></span>
                    </p>
                )}
            </div>

            {/* Chave: testada na Asaas antes de guardar. */}
            <div>
                <label className="text-xs font-semibold text-slate-500">{temChave ? 'Trocar chave de API' : 'Chave de API'}</label>
                <p className="text-xs text-gray-400 mt-0.5">Painel da Asaas › Integrações › Chave de API. Ela é testada antes de ser guardada e não volta para esta tela.</p>
                <div className="mt-1.5 grid grid-cols-[9rem_1fr] gap-2">
                    <select value={env} onChange={e => setEnv(e.target.value as AmbienteAsaas)} className={INPUT.replace('mt-1.5 ', '')}>
                        <option value="sandbox">Sandbox</option>
                        <option value="production">Produção</option>
                    </select>
                    <input
                        type="password"
                        autoComplete="off"
                        value={chave}
                        onChange={e => setChave(e.target.value)}
                        placeholder={env === 'production' ? '$aact_prod_…' : '$aact_hmlg_…'}
                        className={INPUT.replace('mt-1.5 ', '')}
                    />
                </div>
                <button
                    type="button"
                    disabled={!chave.trim() || ocupado !== null}
                    title={!chave.trim() ? 'Cole a chave de API para testar.' : undefined}
                    onClick={() => executar('chave', async () => {
                        const r = await asaasContaService.salvarChave(paymentAccountId, env, chave.trim());
                        setChave('');
                        return `Chave aceita pela Asaas e guardada. Saldo: ${formatMoney(r.saldo)}.`;
                    })}
                    className={`${BOTAO} mt-2 bg-blue-600 text-white hover:bg-blue-700`}
                >
                    {ocupado === 'chave' ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                    Testar e guardar chave
                </button>
            </div>

            {/* Regras de uso — hipóteses editáveis (Fase 4 aplica no disparo). */}
            <div className="space-y-3">
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                    <input type="checkbox" checked={editando.ativo} onChange={e => set('ativo', e.target.checked)}
                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                    Conta Asaas ativa
                </label>
                <label className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
                    <input type="checkbox" checked={editando.piloto} onChange={e => set('piloto', e.target.checked)}
                        className="w-4 h-4 mt-0.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                    <span>Modo piloto <span className="block text-xs text-gray-400">Só a organização dona paga por esta conta, mesmo que ela atenda outras.</span></span>
                </label>
                <div className="grid grid-cols-3 gap-3">
                    {([
                        ['teto_por_pagamento', 'Teto por pagamento'],
                        ['teto_por_dia', 'Teto por dia'],
                        ['teto_avulso', 'Teto PIX avulso'],
                    ] as const).map(([k, rotulo]) => (
                        <div key={k}>
                            <label className="text-xs font-semibold text-slate-500">{rotulo}</label>
                            <input
                                type="number" min={0} step="0.01"
                                value={String(editando[k])}
                                onChange={e => set(k, Number(e.target.value) || 0)}
                                className={INPUT}
                            />
                        </div>
                    ))}
                </div>
            </div>

            {registrarAoSalvar && pendente && (
                <p className="flex items-center gap-1.5 text-xs text-amber-700">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    {cfg ? 'Configuração da conta Asaas alterada — grava ao clicar em Salvar.' : 'A conta Asaas é criada ao clicar em Salvar.'}
                </p>
            )}

            <div className="flex flex-wrap gap-2">
                {!registrarAoSalvar && (
                    <button
                        type="button"
                        disabled={ocupado !== null}
                        onClick={() => executar('config', async () => {
                            await asaasContaService.salvar(editando);
                            return 'Configuração da conta Asaas salva.';
                        })}
                        className={`${BOTAO} border border-gray-200 bg-white text-gray-700 hover:bg-gray-50`}
                    >
                        {ocupado === 'config' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                        Salvar configuração Asaas
                    </button>
                )}
                <button
                    type="button"
                    disabled={!temChave || ocupado !== null}
                    title={!temChave ? motivoSemChave : 'Consulta o saldo na Asaas com a chave guardada'}
                    onClick={() => executar('testar', async () => {
                        const r = await asaasContaService.testar(paymentAccountId);
                        return `Conexão ok. Saldo: ${formatMoney(r.saldo)}.`;
                    })}
                    className={`${BOTAO} border border-gray-200 bg-white text-gray-700 hover:bg-gray-50`}
                >
                    {ocupado === 'testar' ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlugZap className="w-4 h-4" />}
                    Testar conexão
                </button>
                <button
                    type="button"
                    disabled={!temChave || ocupado !== null}
                    title={!temChave ? motivoSemChave : 'Importa agora o extrato da Asaas para esta conta (também roda de hora em hora)'}
                    onClick={() => executar('extrato', async () => {
                        const r = await asaasContaService.sincronizarExtrato(paymentAccountId);
                        const [de, ate] = r.janela.split('..').map(d => formatDateBR(d));
                        const periodo = de === ate ? de : `${de} a ${ate}`;
                        if (r.no_periodo === 0) return `Extrato ${periodo}: nenhum movimento na Asaas neste período.`;
                        const jaEstavam = r.no_periodo - r.importadas;
                        return `Extrato ${periodo}: ${r.no_periodo} movimento(s) na Asaas — ${r.importadas} novo(s)`
                            + (jaEstavam > 0 ? `, ${jaEstavam} já importado(s) antes` : '')
                            + `; ${r.vinculadas} conciliado(s) automaticamente agora.`;
                    })}
                    className={`${BOTAO} border border-gray-200 bg-white text-gray-700 hover:bg-gray-50`}
                >
                    {ocupado === 'extrato' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    Sincronizar extrato
                </button>
            </div>
            {!temChave && (
                <p className="text-xs text-gray-400">Testar conexão e Sincronizar extrato ficam disponíveis depois que a chave for aceita.</p>
            )}

            {msg && (
                <p className={`text-xs rounded-[6px] p-2.5 ${msg.tipo === 'ok' ? 'text-emerald-700 bg-emerald-50' : 'text-red-700 bg-red-50'}`}>
                    {msg.texto}
                </p>
            )}
        </div>
    );
}
