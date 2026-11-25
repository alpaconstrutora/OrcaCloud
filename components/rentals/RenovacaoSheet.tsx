import React, { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw, AlertTriangle, Info } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import { contractRenewalService, motivoParaNaoEditarAditivo, RenewalMode, RenewalPreview } from '../../services/contractRenewalService';
import { contractService } from '../../services/contractService';
import { Contract, ContractAddendum } from '../../types';
import MoneyCentsInput from '../ui/MoneyCentsInput';
import { fimDaVigencia, mesesDaVigencia } from '../../utils/paymentPlan';

/**
 * Gaveta de renovação de locação — Gestão de Unidades › Renovações (plano
 * docs/planos/2026-11-25-renovacoes-e-reajustes-um-lugar.md, item 1).
 *
 * Renovar e Editar acontecem AQUI, na própria aba: antes levavam para a
 * negociação (Contrato › Renovações), e o mesmo assunto vivia em dois lugares.
 *
 * Os campos são os de "Dados do contrato" (vigência, periodicidade, índice,
 * valor), porque é isso que define de onde até quando as parcelas nascem.
 * Editar = SUBSTITUIR o aditivo (decisão do usuário, 25/11/2026): ele vira
 * Cancelado e nasce o próximo; a prévia é a de antes dele.
 */

interface Props {
    /** Contrato a renovar (o vigente). */
    contractId: string;
    /** Editar: o aditivo a substituir. */
    editarAditivoId?: string;
    onClose: () => void;
    /** Gravou: o pai fecha, relê e avisa. */
    onDone: (mensagem: string) => void;
}

/** Data BR por split — `new Date(iso)` retrocede um dia em UTC-3. */
const fmtDate = (iso?: string | null) => {
    if (!iso) return '—';
    const [y, m, d] = iso.slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
};
const fmtCur = (n?: number | null) => (n ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Atalhos do prazo — os mesmos de "Dados do contrato" (DealModal). */
const PRAZOS_ATALHO = [12, 24, 30, 36];

// Régua do formulário (§21 rótulo, §30 h-9 e rótulo→campo 6px).
const ROTULO = 'block text-xs font-semibold text-slate-500';
const CAMPO = 'w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-medium text-gray-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all';

const RenovacaoSheet: React.FC<Props> = ({ contractId, editarAditivoId, onClose, onDone }) => {
    const [saving, setSaving] = useState(false);
    const [erro, setErro] = useState<string | null>(null);
    const [preview, setPreview] = useState<RenewalPreview | null>(null);
    // Editar: o aditivo carregado, ou o motivo de não poder editar.
    const [editando, setEditando] = useState<ContractAddendum | null>(null);
    const [motivoNaoEdita, setMotivoNaoEdita] = useState<string | null>(null);
    const [pronto, setPronto] = useState(!editarAditivoId);

    const [mode, setMode] = useState<RenewalMode>('ADITIVO');
    const [endDate, setEndDate] = useState('');
    const [prazoDraft, setPrazoDraft] = useState<string | null>(null);
    const [cycle, setCycle] = useState('');
    const [dueDay, setDueDay] = useState('');
    const [index, setIndex] = useState('');
    const [valor, setValor] = useState('');
    const [notes, setNotes] = useState('');

    // Editar: carrega o aditivo e confere se ainda pode ser editado (a mesma
    // regra do serviço — só a última renovação aprovada).
    useEffect(() => {
        if (!editarAditivoId) return;
        let vivo = true;
        (async () => {
            try {
                const ad = await contractService.getAddendumById(editarAditivoId);
                if (!vivo) return;
                if (!ad) { setMotivoNaoEdita('Aditivo não encontrado.'); return; }
                const motivo = motivoParaNaoEditarAditivo(ad, await contractService.listAddendums(ad.contract_id));
                if (!vivo) return;
                if (motivo) { setMotivoNaoEdita(motivo); return; }
                setEditando(ad);
                setEndDate(ad.new_end_date?.slice(0, 10) ?? '');
                if (ad.new_value != null) setValor(ad.new_value.toFixed(2));
                setNotes(ad.notes ?? '');
            } catch (e) {
                if (vivo) setErro(e instanceof Error ? e.message : 'Erro ao carregar o aditivo.');
            } finally {
                if (vivo) setPronto(true);
            }
        })();
        return () => { vivo = false; };
    }, [editarAditivoId]);

    // Prévia (datas, nº de parcelas). Só vale a do ÚLTIMO pedido: uma resposta
    // atrasada trocava o fim por +12 meses (CTL-006, 25/11/2026, #739).
    const previaSeq = useRef(0);
    const carregarPreview = useCallback(async () => {
        const seq = ++previaSeq.current;
        try {
            // Renovar ≠ reajustar (24/11/2026): o período novo nasce com o aluguel
            // vigente; o reajuste anual é em Locações › Reajustes.
            const p = await contractRenewalService.previewRenewal(contractId, {
                endDate: endDate || undefined,
                mode,
                applyReajuste: false,
                substituindo: editando ?? undefined,
            });
            if (seq !== previaSeq.current) return;
            setPreview(p);
            setErro(null);
            // Só preenche o que está VAZIO no momento da resposta.
            setEndDate(v => v || p.endDate);
            setCycle(v => v || p.parent.billing_cycle || 'Mensal');
            // Editar: o dia que o aditivo deixou no contrato. Renovar: o dia em que
            // a série vence DE FATO (CTL-006: due_day 23 × parcelas no dia 10).
            setDueDay(v => v || String((editando ? p.parent.due_day : p.seriesDueDay ?? p.parent.due_day) ?? ''));
            setIndex(v => v || p.parent.reajuste_index || 'IGP-M');
            setValor(v => v || p.newValue.toFixed(2));
        } catch (e) {
            if (seq !== previaSeq.current) return;
            setPreview(null);
            setErro(e instanceof Error ? e.message : 'Não foi possível calcular a renovação.');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [contractId, endDate, mode, editando]);

    useEffect(() => { if (pronto && !motivoNaoEdita) carregarPreview(); }, [pronto, motivoNaoEdita, carregarPreview]);

    const salvar = async () => {
        if (!preview) return;
        setSaving(true);
        setErro(null);
        try {
            const parsed = valor ? Number(valor.replace(',', '.')) : undefined;
            const base = {
                endDate: endDate || undefined,
                newValue: parsed && parsed > 0 ? parsed : undefined,
                applyReajuste: false,
                notes: notes || undefined,
                inheritTerms: false,
                overrides: {
                    ...(cycle ? { billing_cycle: cycle as Contract['billing_cycle'] } : {}),
                    ...(dueDay ? { due_day: Number(dueDay) } : {}),
                    ...(index ? { reajuste_index: index } : {}),
                },
            };
            if (editando) {
                const { addendum, replaced } = await contractRenewalService.replaceAddendumRenewal(editando.id, base);
                onDone(`Renovação alterada: o ${replaced.number} foi cancelado e o ${addendum.number} gerado com as parcelas do período.`);
            } else if (mode === 'ADITIVO') {
                const { addendum } = await contractRenewalService.renewByAddendum(contractId, base);
                onDone(`Aditivo ${addendum.number} gerado e parcelas do novo período criadas.`);
            } else {
                const { child } = await contractRenewalService.renewContract(contractId, base);
                onDone(`Novo contrato ${child.number} criado e o ${preview.parent.number} encerrado.`);
            }
        } catch (e) {
            // Fica na gaveta, aberta: o usuário corrige ou fecha.
            setErro(e instanceof Error ? e.message : 'Erro ao renovar o contrato.');
        } finally {
            setSaving(false);
        }
    };

    // Fim = início + prazo − 1 dia (mesma conta e atalhos de "Dados do contrato").
    const inicioNovo = preview?.startDate?.slice(0, 10) ?? '';
    const prazoAtual = inicioNovo ? mesesDaVigencia(inicioNovo, endDate) : null;
    const aplicarPrazo = (meses: number) => { if (inicioNovo) setEndDate(fimDaVigencia(inicioNovo, meses)); };
    const motivoSemInicio = inicioNovo ? undefined : 'Aguarde o cálculo do início do período novo.';
    const fimAntesDoInicio = !!(endDate && inicioNovo && endDate <= inicioNovo);

    // Botão desligado sempre diz o motivo.
    const motivoNaoSalva = motivoNaoEdita
        ?? (saving ? 'Aguarde: a operação anterior ainda está sendo gravada.'
            : !preview ? 'Aguarde o cálculo da renovação.'
            : !endDate ? 'Preencha o fim da vigência do período novo.'
            : fimAntesDoInicio ? `O fim da vigência deve ser posterior a ${fmtDate(inicioNovo)}.`
            : null);

    const contrato = preview?.parent;
    const titulo = editarAditivoId
        ? `Editar renovação ${editando?.number ?? ''}`.trim()
        : `Renovar ${contrato?.number ?? 'contrato'}`;

    return (
        <Sheet open onClose={onClose} size="xl">
            <SheetHeader onClose={onClose}>
                <SheetTitle>{titulo}</SheetTitle>
                <SheetDescription>
                    {/* Editar: a prévia traz o contrato como era ANTES do aditivo. */}
                    {contrato
                        ? `${contrato.number} · vigência ${editando ? `antes do ${editando.number}` : 'atual'} ${fmtDate(contrato.start_date)} a ${fmtDate(contrato.end_date)} · aluguel ${fmtCur(contrato.current_value ?? contrato.original_value)}`
                        : motivoNaoEdita ? '' : 'Calculando…'}
                </SheetDescription>
            </SheetHeader>
            <SheetPanel className="p-6">
                <div className="space-y-6">
                    {(motivoNaoEdita || erro) && (
                        <div className="flex items-start gap-2 bg-red-50 border border-red-100 text-red-700 rounded-[10px] p-4 text-sm">
                            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                            <span>{motivoNaoEdita ?? erro}</span>
                        </div>
                    )}

                    {/* Via da renovação — escolha única (radio). Editar é sempre aditivo. */}
                    {!editarAditivoId && (
                        <div className="space-y-1.5">
                            <p id="renovacao-via" className={ROTULO}>Como renovar</p>
                            <div role="radiogroup" aria-labelledby="renovacao-via" className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {([
                                    { id: 'ADITIVO', titulo: 'Aditivo de prorrogação', texto: `Mantém o contrato ${contrato?.number ?? ''} e a negociação. Só estende a vigência.` },
                                    { id: 'NOVO_CONTRATO', titulo: 'Novo contrato', texto: `Cria ${preview?.nextNumber ?? 'um contrato novo'} e encerra o ${contrato?.number ?? 'atual'}.` },
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

                    {!motivoNaoEdita && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
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
                                {fimAntesDoInicio && <p className="text-xs text-red-600">O fim deve ser posterior ao início.</p>}
                            </div>

                            <div className="space-y-1.5">
                                <label htmlFor="renovacao-valor" className={ROTULO}>Valor do Aluguel</label>
                                <MoneyCentsInput id="renovacao-valor" value={valor} onChange={v => setValor(v)} className={CAMPO} />
                                <p className="text-xs text-gray-500">Aluguel vigente. O reajuste anual é aplicado na aba Reajustes, na data de aniversário.</p>
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

                            <div className="space-y-1.5 md:col-span-2">
                                <label htmlFor="renovacao-obs" className={ROTULO}>Observações</label>
                                <input id="renovacao-obs" type="text" value={notes} onChange={e => setNotes(e.target.value)}
                                    placeholder="Opcional" className={`${CAMPO} placeholder:text-gray-400`} />
                            </div>
                        </div>
                    )}

                    {/* Impacto — o que exatamente vai acontecer no financeiro */}
                    {preview && !motivoNaoEdita && (
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
                                    O contrato {preview.parent.number} <strong>não</strong> será encerrado: a vigência passa a
                                    terminar em {fmtDate(endDate || preview.endDate)} e serão geradas{' '}
                                    {preview.installmentsToGenerate} parcela(s){preview.firstInstallmentDate ? `, a 1ª em ${fmtDate(preview.firstInstallmentDate)} (continua a série atual)` : ` de ${fmtDate(preview.startDate)} até lá`}.
                                    Parcelas anteriores não são afetadas.
                                </span>
                            ) : (
                                <span>
                                    Será criado o contrato {preview.nextNumber} com parcelas próprias e o {preview.parent.number}
                                    {' '}será encerrado
                                    {preview.pendingToCancel > 0
                                        ? `, cancelando ${preview.pendingToCancel} parcela(s) futura(s) dele.`
                                        : '. Nenhuma parcela futura dele será cancelada.'}
                                </span>
                            )}
                        </div>
                    )}
                </div>
            </SheetPanel>
            <SheetFooter>
                <button type="button" onClick={onClose} disabled={saving} className="h-9 px-3.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-[6px] disabled:opacity-50">
                    Cancelar
                </button>
                <span className="inline-flex" title={motivoNaoSalva ?? undefined}>
                    <button
                        type="button"
                        onClick={salvar}
                        disabled={!!motivoNaoSalva}
                        className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <RefreshCw className={`w-[15px] h-[15px] ${saving ? 'animate-spin' : ''}`} />
                        {saving ? 'Processando…' : editarAditivoId ? 'Salvar alterações' : mode === 'ADITIVO' ? 'Gerar aditivo' : 'Criar novo contrato'}
                    </button>
                </span>
            </SheetFooter>
        </Sheet>
    );
};

export default RenovacaoSheet;
