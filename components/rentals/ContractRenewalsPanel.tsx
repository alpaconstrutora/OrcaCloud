import React, { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw, AlertTriangle, History, Info, Pencil } from 'lucide-react';
import ActionIconButton from '../ui/ActionIconButton';
import { useConfirm } from '../ui/confirm';
import { SecaoTitulo } from '../ui/SecaoTitulo';
import { contractRenewalService, motivoParaNaoEditarAditivo, RenewalMode, RenewalPreview } from '../../services/contractRenewalService';
import { contractService } from '../../services/contractService';
import { Contract, ContractAddendum } from '../../types';
import MoneyCentsInput from '../ui/MoneyCentsInput';
import { fimDaVigencia, mesesDaVigencia } from '../../utils/paymentPlan';

interface Props {
    /** Contrato gerado a partir desta negociação. */
    contract: Contract;
    onNotify: (msg: string, type?: 'success' | 'error' | 'info') => void;
    /** Recarrega o contrato no pai (vigência e valor mudam ao renovar). */
    onChanged?: () => void;
    /**
     * Abre já editando este aditivo — vem do Editar da fila Locações ›
     * Renovações, que só manda para cá (o único lugar onde se mexe na renovação).
     */
    editarAditivoId?: string;
}

/** Data BR por split — `new Date(iso)` retrocede um dia em UTC-3. */
const fmtDate = (iso?: string) => {
    if (!iso) return '—';
    const [y, m, d] = iso.slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
};
const fmtCur = (n?: number) =>
    (n ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Atalhos do prazo — os mesmos de "Dados do contrato" (DealModal). */
const PRAZOS_ATALHO = [12, 24, 30, 36];

// Régua do formulário: a mesma da sub-aba "Dados do contrato" (DealModal) —
// §21 (rótulo) e §30 (h-9, rótulo→campo 6px; `block` porque <label> é inline
// e ignora a margem do space-y).
const ROTULO = 'block text-xs font-semibold text-slate-500';
const CAMPO = 'w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-medium text-gray-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all';

/**
 * Renovações DESTE contrato, dentro da negociação.
 *
 * É o único lugar onde se renova: a aba Renovações do módulo Locações é apenas
 * a fila do que está vencendo e manda para cá.
 *
 * Os campos são os MESMOS da aba "Dados do contrato" (vigência, periodicidade,
 * índice, valor) porque é exatamente isso que a renovação define: sem eles não
 * há como saber de onde até quando as parcelas do período novo serão geradas.
 */
const ContractRenewalsPanel: React.FC<Props> = ({ contract, onNotify, onChanged, editarAditivoId }) => {
    const [addendums, setAddendums] = useState<ContractAddendum[]>([]);
    const [chain, setChain] = useState<Contract[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [preview, setPreview] = useState<RenewalPreview | null>(null);
    const confirm = useConfirm();

    // O pai passa `onNotify` inline (nova função a cada render). Como dependência
    // de `load`, cada aviso (que re-renderiza o pai) recarregaria a cadeia — e um
    // erro de carga viraria laço. A ref mantém a última sem entrar nas deps.
    const onNotifyRef = useRef(onNotify);
    useEffect(() => { onNotifyRef.current = onNotify; });
    const notificar = useCallback((msg: string, type?: 'success' | 'error' | 'info') => onNotifyRef.current(msg, type), []);

    // Formulário do período novo
    const [mode, setMode] = useState<RenewalMode>('ADITIVO');
    const [endDate, setEndDate] = useState('');
    const [prazoDraft, setPrazoDraft] = useState<string | null>(null);
    const [cycle, setCycle] = useState('');
    const [dueDay, setDueDay] = useState('');
    const [index, setIndex] = useState('');
    const [valor, setValor] = useState('');
    const [notes, setNotes] = useState('');
    // Editar = substituir este aditivo (decisão do usuário, 25/11/2026): o
    // formulário é o mesmo, preenchido com ele, e a prévia é a de antes dele.
    const [editando, setEditando] = useState<ContractAddendum | null>(null);
    const formRef = useRef<HTMLElement>(null);

    // O contrato VIGENTE da cadeia, não necessariamente o desta negociação: se a
    // renovação anterior foi por "novo contrato", o daqui está Encerrado e quem
    // vale é o último filho. Renovar o encerrado falharia.
    // (Renovar por ADITIVO não produz essa divergência — mantém o mesmo contrato
    // e a mesma negociação; é a via padrão.)
    const vigente = chain.length > 0 ? chain[chain.length - 1] : contract;
    const outroContrato = vigente.id !== contract.id;
    const semVigencia = !vigente.end_date;

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const cadeia = await contractRenewalService.getRenewalChain(contract.id);
            setChain(cadeia);
            // Aditivos de TODA a cadeia: com renovação mista (um contrato novo e
            // depois prorrogações nele), os aditivos ficam no filho, não neste.
            const ids = cadeia.length > 0 ? cadeia.map(c => c.id) : [contract.id];
            const listas = await Promise.all(ids.map(id => contractService.listAddendums(id)));
            setAddendums(listas.flat().filter(a => a.new_start_date));
        } catch (e) {
            notificar(`Erro ao carregar renovações: ${e instanceof Error ? e.message : ''}`, 'error');
        } finally {
            setLoading(false);
        }
    }, [contract.id, notificar]);

    useEffect(() => { load(); }, [load]);

    // Prévia (datas, reajuste sugerido, nº de parcelas). Recalcula quando o
    // usuário muda o término ou a via.
    // Só a prévia do ÚLTIMO pedido vale. A da "Nova renovação" (pedida ao abrir)
    // chegava depois de Editar já ter preenchido o formulário e trocava o fim
    // pelo padrão de +12 meses (CTL-006, 25/11/2026: AD-002 até 22/09/2021
    // aparecia até 22/09/2022).
    const previaSeq = useRef(0);
    const carregarPreview = useCallback(async () => {
        const seq = ++previaSeq.current;
        if (!vigente.end_date) { setPreview(null); return; }
        try {
            // Renovar ≠ reajustar (decisão do usuário, 24/11/2026): o período novo
            // nasce com o aluguel vigente; o reajuste anual é em Locações › Reajustes.
            const p = await contractRenewalService.previewRenewal(vigente.id, {
                endDate: endDate || undefined,
                mode,
                applyReajuste: false,
                substituindo: editando ?? undefined,
            });
            if (seq !== previaSeq.current) return;
            setPreview(p);
            // Só preenche o que está VAZIO agora (não no momento do pedido).
            setEndDate(v => v || p.endDate);
            setCycle(v => v || p.parent.billing_cycle || 'Mensal');
            // O dia em que a série vence DE FATO (última parcela); o due_day do
            // contrato pode estar diferente (CTL-006: 23 × parcelas no dia 10).
            setDueDay(v => v || String(p.seriesDueDay ?? p.parent.due_day ?? ''));
            setIndex(v => v || p.parent.reajuste_index || 'IGP-M');
            setValor(v => v || p.newValue.toFixed(2));
        } catch (e) {
            if (seq !== previaSeq.current) return;
            setPreview(null);
            notificar(e instanceof Error ? e.message : 'Não foi possível calcular a renovação.', 'error');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [vigente.id, vigente.end_date, endDate, mode, editando]);

    useEffect(() => { if (!loading) carregarPreview(); }, [loading, carregarPreview]);

    /** Por que este aditivo não pode ser editado — null = pode (mesma regra do serviço). */
    const motivoNaoEdita = (ad: ContractAddendum): string | null =>
        ad.contract_id !== vigente.id
            ? `O contrato foi renovado depois pelo ${vigente.number}: só a última renovação pode ser editada.`
            : motivoParaNaoEditarAditivo(ad, addendums);

    // Botão desligado sempre diz o motivo.
    const motivoBotaoEditar = (ad: ContractAddendum): string | null =>
        saving ? 'Aguarde: a operação anterior ainda está sendo gravada.'
            : editando?.id === ad.id ? `O ${ad.number} já está em edição no formulário acima.`
            : motivoNaoEdita(ad);

    const entrarEmEdicao = (ad: ContractAddendum) => {
        setEditando(ad);
        setMode('ADITIVO');
        setPrazoDraft(null);
        setEndDate(ad.new_end_date?.slice(0, 10) ?? '');
        setValor((ad.new_value ?? vigente.current_value ?? 0).toFixed(2));
        // Ciclo, dia e índice que o aditivo deixou no contrato (são os dele).
        setCycle(vigente.billing_cycle || 'Mensal');
        setDueDay(vigente.due_day ? String(vigente.due_day) : '');
        setIndex(vigente.reajuste_index || 'IGP-M');
        setNotes(ad.notes ?? '');
        formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    // Campos vazios = a prévia preenche de novo com os da próxima renovação.
    const sairDaEdicao = () => {
        setEditando(null);
        setPrazoDraft(null);
        setEndDate('');
        setValor('');
        setNotes('');
        setCycle('');
        setDueDay('');
        setIndex('');
    };

    // Veio do Editar da fila: entra em edição uma vez, quando a lista chegar.
    const pedidoDaFila = useRef(editarAditivoId);
    useEffect(() => {
        if (loading || !pedidoDaFila.current) return;
        const ad = addendums.find(a => a.id === pedidoDaFila.current);
        pedidoDaFila.current = undefined;
        if (!ad) return;
        const motivo = motivoNaoEdita(ad);
        if (motivo) notificar(motivo, 'error');
        else entrarEmEdicao(ad);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loading, addendums]);

    /**
     * Desfaz uma prorrogação por aditivo: apaga as parcelas do período novo,
     * devolve `end_date` e valor anteriores e marca o aditivo como Cancelado.
     */
    const handleDesfazerAditivo = async (ad: ContractAddendum) => {
        const ok = await confirm({
            title: `Desfazer o aditivo ${ad.number}?`,
            message: `A vigência volta para ${fmtDate(ad.previous_end_date)} e as `
                + `${ad.installments_generated ?? 0} parcela(s) do período prorrogado são apagadas. `
                + 'Se alguma já tiver sido paga ou conciliada, a operação é recusada.',
            variant: 'danger',
            confirmLabel: 'Desfazer',
        });
        if (!ok) return;
        setSaving(true);
        try {
            await contractRenewalService.undoAddendumRenewal(ad.id);
            await load();
            onChanged?.();
            notificar(`Aditivo ${ad.number} desfeito.`, 'success');
        } catch (e) {
            notificar(e instanceof Error ? e.message : 'Erro ao desfazer o aditivo.', 'error');
        } finally {
            setSaving(false);
        }
    };

    /**
     * Desfaz uma renovação por contrato novo: exclui o contrato-filho e as
     * parcelas dele, e reabre o anterior regenerando o que havia sido cortado.
     */
    const handleDesfazerContrato = async (filho: Contract) => {
        const ok = await confirm({
            title: `Desfazer a renovação ${filho.number}?`,
            message: 'O contrato criado pela renovação é excluído com as parcelas dele, e o contrato '
                + 'anterior volta a ficar Ativo com as parcelas restauradas. '
                + 'Se alguma parcela do contrato novo já tiver sido paga, a operação é recusada.',
            variant: 'danger',
            confirmLabel: 'Desfazer',
        });
        if (!ok) return;
        setSaving(true);
        try {
            await contractRenewalService.undoRenewal(filho.id);
            await load();
            onChanged?.();
            notificar(`Renovação ${filho.number} desfeita.`, 'success');
        } catch (e) {
            notificar(e instanceof Error ? e.message : 'Erro ao desfazer a renovação.', 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleRenovar = async () => {
        if (!preview) return;
        setSaving(true);
        try {
            const parsed = valor ? Number(valor.replace(',', '.')) : undefined;
            const overrides = {
                ...(cycle ? { billing_cycle: cycle as Contract['billing_cycle'] } : {}),
                ...(dueDay ? { due_day: Number(dueDay) } : {}),
                ...(index ? { reajuste_index: index } : {}),
            };
            const base = {
                endDate: endDate || undefined,
                newValue: parsed && parsed > 0 ? parsed : undefined,
                applyReajuste: false,
                notes: notes || undefined,
                inheritTerms: false,
                overrides,
            };

            if (editando) {
                const { addendum, replaced } = await contractRenewalService.replaceAddendumRenewal(editando.id, base);
                notificar(`Renovação alterada: o ${replaced.number} foi cancelado e o ${addendum.number} gerado com as parcelas do período.`, 'success');
                sairDaEdicao();
                await load();
                onChanged?.();
                return;
            }
            if (mode === 'ADITIVO') {
                await contractRenewalService.renewByAddendum(vigente.id, base);
                notificar('Aditivo de prorrogação gerado e parcelas do novo período criadas.', 'success');
            } else {
                await contractRenewalService.renewContract(vigente.id, base);
                notificar('Novo contrato criado e o anterior encerrado.', 'success');
            }
            setNotes('');
            setEndDate('');
            setValor('');
            await load();
            onChanged?.();
        } catch (e) {
            notificar(e instanceof Error ? e.message : 'Erro ao renovar o contrato.', 'error');
        } finally {
            setSaving(false);
        }
    };

    // Fim do período novo = início + prazo − 1 dia (mesma conta e mesmos atalhos
    // de "Dados do contrato"). O prazo não é guardado: deriva das duas datas.
    const inicioNovo = preview?.startDate?.slice(0, 10) ?? '';
    const prazoAtual = inicioNovo ? mesesDaVigencia(inicioNovo, endDate) : null;
    const aplicarPrazo = (meses: number) => { if (inicioNovo) setEndDate(fimDaVigencia(inicioNovo, meses)); };
    const motivoSemInicio = inicioNovo ? undefined : 'Aguarde o cálculo do início do período novo.';
    const fimAntesDoInicio = !!(endDate && inicioNovo && endDate <= inicioNovo);

    // Botão desligado sempre diz o motivo.
    const motivoNaoRenova = saving ? 'Aguarde: a operação anterior ainda está sendo gravada.'
        : !preview ? 'Aguarde o cálculo da renovação.'
        : !endDate ? 'Preencha o fim da vigência do período novo.'
        : fimAntesDoInicio ? `O fim da vigência deve ser posterior a ${fmtDate(inicioNovo)}.`
        : null;

    const corDoStatus = (status?: string) =>
        status === 'Aprovado' ? 'text-emerald-700' : status === 'Cancelado' ? 'text-red-600' : 'text-amber-800';

    return (
        <div className="max-w-5xl space-y-8">
            {/* Situação atual — bloco de estado, por isso card (§30) */}
            <div className="bg-white rounded-[10px] border border-gray-200 px-4 py-3">
                <p className="text-sm font-semibold text-gray-900">
                    {outroContrato ? `Contrato vigente ${vigente.number}: ` : 'Vigência atual: '}
                    {fmtDate(vigente.start_date)} a {fmtDate(vigente.end_date)}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                    Aluguel {fmtCur(vigente.current_value ?? vigente.original_value)}
                    {vigente.billing_cycle ? ` · ${vigente.billing_cycle.toLowerCase()}` : ''}
                    {vigente.due_day ? ` · todo dia ${vigente.due_day}` : ''}
                    {vigente.reajuste_index ? ` · reajuste por ${vigente.reajuste_index}` : ''}
                    {outroContrato ? ` · ${contract.number} foi encerrado por renovação` : ''}
                </p>
            </div>

            {semVigencia ? (
                <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-[10px] p-4 text-sm">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>Preencha o fim da vigência em "Dados do contrato" e salve a negociação para poder renovar.</span>
                </div>
            ) : (
                <section ref={formRef} className="space-y-4 scroll-mt-4">
                    <SecaoTitulo
                        icon={editando ? Pencil : RefreshCw}
                        titulo={editando ? `Editar renovação ${editando.number}` : 'Nova renovação'}
                    />

                    {/* Via da renovação — escolha única (radio). Editar é sempre
                        aditivo: o que se edita é um aditivo de prorrogação. */}
                    {!editando && (
                    <div className="space-y-1.5">
                        <p id="renovacao-via" className={ROTULO}>Como renovar</p>
                        <div role="radiogroup" aria-labelledby="renovacao-via" className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {([
                                { id: 'ADITIVO', titulo: 'Aditivo de prorrogação', texto: `Mantém o contrato ${vigente.number} e esta negociação. Só estende a vigência.` },
                                { id: 'NOVO_CONTRATO', titulo: 'Novo contrato', texto: `Cria ${preview?.nextNumber ?? 'um contrato novo'} e encerra o ${vigente.number}.` },
                            ] as const).map(op => (
                                <button
                                    key={op.id}
                                    type="button"
                                    role="radio"
                                    aria-checked={mode === op.id}
                                    onClick={() => setMode(op.id)}
                                    className={`text-left px-4 py-3 rounded-[10px] border transition-all ${
                                        mode === op.id ? 'border-blue-500 bg-blue-50/60 ring-2 ring-blue-500/20' : 'border-gray-200 bg-white hover:border-gray-300'
                                    }`}
                                >
                                    <span className="block text-sm font-semibold text-gray-900">{op.titulo}</span>
                                    <span className="block text-xs text-gray-500 mt-1">{op.texto}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                    )}

                    {/* Período novo — mesmos campos de "Dados do contrato", porque é
                        isso que define de onde até quando as parcelas nascem. Campos
                        curtos em três colunas (§30): data e select não esticam. */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-4">
                        <div className="space-y-1.5">
                            <label htmlFor="renovacao-inicio" className={ROTULO}>Início da Vigência</label>
                            <input
                                id="renovacao-inicio"
                                type="text"
                                readOnly
                                value={preview?.startDate ? fmtDate(preview.startDate) : ''}
                                placeholder="Calculando…"
                                className="w-full h-9 px-3 bg-gray-50 border border-gray-200 rounded-[6px] text-sm font-medium text-gray-900 placeholder:text-gray-400 outline-none cursor-default"
                            />
                            <p className="text-xs text-gray-500">
                                {editando ? `Dia seguinte ao fim da vigência anterior ao ${editando.number}.` : 'Dia seguinte ao fim da vigência atual.'}
                            </p>
                        </div>

                        <div className="space-y-1.5">
                            <div className="flex flex-wrap items-center justify-between gap-x-2">
                                <label htmlFor="renovacao-fim" className={ROTULO}>Fim da Vigência</label>
                                <div className="flex items-center gap-2 text-xs" title={motivoSemInicio}>
                                    {PRAZOS_ATALHO.map(n => (
                                        <button
                                            key={n}
                                            type="button"
                                            disabled={!inicioNovo}
                                            aria-label={`Prazo de ${n} meses`}
                                            onClick={() => { setPrazoDraft(null); aplicarPrazo(n); }}
                                            className={`font-medium disabled:text-gray-400 disabled:cursor-not-allowed ${prazoAtual === n ? 'text-blue-700 underline underline-offset-2' : 'text-blue-600 hover:text-blue-700'}`}
                                        >
                                            {n} meses
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="relative w-28 shrink-0" title={motivoSemInicio}>
                                    <input
                                        type="number"
                                        min={1}
                                        step={1}
                                        inputMode="numeric"
                                        aria-label="Prazo do período novo em meses"
                                        placeholder="Prazo"
                                        disabled={!inicioNovo}
                                        value={prazoDraft ?? (prazoAtual ?? '')}
                                        onChange={e => {
                                            setPrazoDraft(e.target.value);
                                            const meses = Math.floor(Number(e.target.value));
                                            if (meses >= 1) aplicarPrazo(meses);
                                        }}
                                        onBlur={() => setPrazoDraft(null)}
                                        className={`${CAMPO} pr-14 disabled:bg-gray-50 disabled:cursor-not-allowed`}
                                    />
                                    <span aria-hidden="true" className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500 pointer-events-none">meses</span>
                                </div>
                                <input
                                    id="renovacao-fim"
                                    type="date"
                                    value={endDate}
                                    onChange={e => { setPrazoDraft(null); setEndDate(e.target.value); }}
                                    className={`${CAMPO} flex-1 min-w-0`}
                                />
                            </div>
                            {fimAntesDoInicio && (
                                <p className="text-xs text-red-600">O fim deve ser posterior ao início.</p>
                            )}
                        </div>

                        <div className="space-y-1.5">
                            <label htmlFor="renovacao-valor" className={ROTULO}>Valor do Aluguel</label>
                            <MoneyCentsInput id="renovacao-valor" value={valor} onChange={v => setValor(v)} className={CAMPO} />
                            <p className="text-xs text-gray-500">
                                Aluguel vigente. O reajuste anual é aplicado em Locações › Reajustes, na data de aniversário do contrato.
                            </p>
                        </div>

                        <div className="space-y-1.5">
                            <label htmlFor="renovacao-periodicidade" className={ROTULO}>Periodicidade</label>
                            <select id="renovacao-periodicidade" value={cycle} onChange={e => setCycle(e.target.value)} className={`${CAMPO} cursor-pointer`}>
                                <option value="Mensal">Mensal</option>
                                <option value="Bimestral">Bimestral</option>
                                <option value="Semestral">Semestral</option>
                                <option value="Anual">Anual</option>
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <label htmlFor="renovacao-dia" className={ROTULO}>Dia de Vencimento</label>
                            <input id="renovacao-dia" type="number" min="1" max="31" value={dueDay}
                                onChange={e => setDueDay(e.target.value)} className={CAMPO} />
                        </div>
                        <div className="space-y-1.5">
                            <label htmlFor="renovacao-indice" className={ROTULO}>Índice de Reajuste</label>
                            <select id="renovacao-indice" value={index} onChange={e => setIndex(e.target.value)} className={`${CAMPO} cursor-pointer`}>
                                <option value="IGP-M">IGP-M</option>
                                <option value="IPCA">IPCA</option>
                                <option value="INCC">INCC</option>
                                <option value="INCC-M">INCC-M</option>
                                <option value="CUB">CUB</option>
                                <option value="OUTROS">Outros</option>
                            </select>
                        </div>

                        <div className="space-y-1.5 md:col-span-3">
                            <label htmlFor="renovacao-obs" className={ROTULO}>Observações</label>
                            <input id="renovacao-obs" type="text" value={notes} onChange={e => setNotes(e.target.value)}
                                placeholder="Opcional" className={`${CAMPO} placeholder:text-gray-400`} />
                        </div>
                    </div>

                    {/* Impacto — o que exatamente vai acontecer no financeiro */}
                    {preview && (
                        <div className="flex items-start gap-2 bg-blue-50 border border-blue-100 text-blue-800 rounded-[10px] p-4 text-sm">
                            <Info className="w-4 h-4 shrink-0 mt-0.5" />
                            {editando ? (
                                <span>
                                    O {editando.number} será <strong>cancelado</strong> (fica no histórico) e o{' '}
                                    {preview.nextAddendumNumber ?? 'aditivo novo'} gerado: vigência até{' '}
                                    {fmtDate(endDate || preview.endDate)} e {preview.installmentsToGenerate} parcela(s)
                                    {preview.firstInstallmentDate ? `, a 1ª em ${fmtDate(preview.firstInstallmentDate)}` : ''}.
                                    As parcelas do {editando.number} são trocadas pelas novas e os tributos, refeitos.
                                </span>
                            ) : mode === 'ADITIVO' ? (
                                <span>
                                    O contrato {vigente.number} <strong>não</strong> será encerrado: a vigência passa a
                                    terminar em {fmtDate(endDate || preview.endDate)} e serão geradas{' '}
                                    {preview.installmentsToGenerate} parcela(s){preview.firstInstallmentDate ? `, a 1ª em ${fmtDate(preview.firstInstallmentDate)} (continua a série atual)` : ` de ${fmtDate(preview.startDate)} até lá`}.
                                    Parcelas anteriores não são afetadas.
                                </span>
                            ) : (
                                <span>
                                    Será criado o contrato {preview.nextNumber} com parcelas próprias e o {vigente.number}
                                    {' '}será encerrado
                                    {preview.pendingToCancel > 0
                                        ? `, cancelando ${preview.pendingToCancel} parcela(s) futura(s) dele.`
                                        : '. Nenhuma parcela futura dele será cancelada.'}
                                </span>
                            )}
                        </div>
                    )}

                    {/* Rodapé do formulário: linha solta, ação primária §17 */}
                    <div className="flex items-center justify-end gap-4">
                        {editando && (
                            <button
                                type="button"
                                onClick={sairDaEdicao}
                                disabled={saving}
                                className="h-9 px-3.5 bg-white border border-gray-200 text-gray-700 rounded-[6px] hover:bg-gray-50 font-medium text-[13px] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Cancelar edição
                            </button>
                        )}
                        <span className="inline-flex" title={motivoNaoRenova ?? undefined}>
                            <button
                                type="button"
                                onClick={handleRenovar}
                                disabled={!!motivoNaoRenova}
                                className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <RefreshCw className={`w-[15px] h-[15px] ${saving ? 'animate-spin' : ''}`} />
                                {saving ? 'Processando…' : editando ? 'Salvar alterações' : mode === 'ADITIVO' ? 'Gerar aditivo' : 'Criar novo contrato'}
                            </button>
                        </span>
                    </div>
                </section>
            )}

            {/* Histórico */}
            {loading ? (
                <div className="text-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="mt-2 text-gray-500">Carregando renovações…</p>
                </div>
            ) : addendums.length === 0 && chain.length <= 1 ? null : (
                <section className="space-y-4">
                    <SecaoTitulo icon={History} titulo="Histórico de renovações" />
                    <div className="space-y-2">
                        {addendums.map(ad => (
                            <div key={ad.id} className="flex items-start gap-3 px-4 py-3 rounded-[10px] border border-gray-200 bg-white">
                                <History className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium text-gray-900">
                                        Aditivo {ad.number}
                                        <span className={`ml-2 text-sm font-normal ${corDoStatus(ad.status)}`}>{ad.status}</span>
                                    </p>
                                    <p className="text-xs text-gray-500 mt-0.5">
                                        {fmtDate(ad.new_start_date)} a {fmtDate(ad.new_end_date)} · {fmtCur(ad.new_value)}
                                        {ad.previous_value != null && ad.previous_value !== ad.new_value
                                            ? ` (era ${fmtCur(ad.previous_value)})` : ''}
                                        {ad.installments_generated ? ` · ${ad.installments_generated} parcela(s) geradas` : ''}
                                    </p>
                                </div>
                                {/* Desfazer só faz sentido enquanto a renovação não virou
                                    dinheiro: o serviço recusa se alguma parcela do período
                                    novo já foi paga ou conciliada, e a mensagem dele é
                                    mostrada como está. */}
                                {ad.status !== 'Cancelado' && (
                                    <div className="flex items-center gap-1.5 shrink-0">
                                        {/* Editar = substituir: este vira Cancelado e nasce o
                                            próximo com os dados novos. Só a última renovação. */}
                                        <span className="inline-flex" title={motivoBotaoEditar(ad) ?? undefined}>
                                            <ActionIconButton
                                                kind="edit"
                                                title={`Editar o ${ad.number}`}
                                                disabled={!!motivoBotaoEditar(ad)}
                                                onClick={() => entrarEmEdicao(ad)}
                                            />
                                        </span>
                                        <ActionIconButton
                                            kind="delete"
                                            title="Desfazer esta prorrogação"
                                            onClick={() => handleDesfazerAditivo(ad)}
                                        />
                                    </div>
                                )}
                            </div>
                        ))}
                        {chain.filter(c => c.id !== contract.id).map(c => (
                            <div key={c.id} className="flex items-start gap-3 px-4 py-3 rounded-[10px] border border-gray-200 bg-white">
                                <RefreshCw className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium text-gray-900">
                                        Contrato {c.number}
                                        <span className="ml-2 text-sm font-normal text-gray-600">{c.status}</span>
                                    </p>
                                    <p className="text-xs text-gray-500 mt-0.5">
                                        {fmtDate(c.start_date)} a {fmtDate(c.end_date)} · {fmtCur(c.current_value)}
                                    </p>
                                </div>
                                {/* Só o ÚLTIMO da cadeia pode ser desfeito: excluir um do meio
                                    deixaria o seguinte apontando para um pai inexistente. */}
                                {c.id === vigente.id && c.parent_contract_id && (
                                    <ActionIconButton
                                        kind="delete"
                                        title="Desfazer esta renovação e reabrir o contrato anterior"
                                        onClick={() => handleDesfazerContrato(c)}
                                    />
                                )}
                            </div>
                        ))}
                    </div>
                </section>
            )}
        </div>
    );
};

export default ContractRenewalsPanel;
