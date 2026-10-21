import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, CalendarClock, CheckCircle2, FileText, Layers, Loader2, Paperclip, Receipt, Trash2, Upload } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import { SecaoTitulo } from '../ui/SecaoTitulo';
import MoneyCentsInput from '../ui/MoneyCentsInput';
import { useConfirm } from '../ui/confirm';
import { formatMoney, formatDateBR } from '../ui/Format';
import { darfService, type FormDarf } from '../../services/darfService';
import { competenciaBR, menorVencimento, normalizarLinhaDigitavel } from '../../utils/darf';
import type { Darf, TaxPayable } from '../../types/financial';

/**
 * Tributos a Pagar › "Agrupar em DARF" (criar) e aba DARFs › Editar. Plano:
 * docs/planos/2026-10-21-agrupar-tributos-em-darf.md.
 *
 * Painel lateral (UI_PATTERNS §3: criar/editar registro simples = Sheet).
 * Formulário curto: salvar fecha também na edição (UI_PATTERNS §6.4).
 *
 * A organização e a competência vêm dos tributos escolhidos (criar) ou do
 * próprio DARF (editar) — este painel nunca pergunta (REGRA #5). O pagamento
 * NÃO é aqui: o DARF vira uma linha em Contas a Pagar (PR #74).
 */

const ROTULO = 'text-xs font-semibold text-slate-500';
const CAMPO = 'w-full px-3 h-9 bg-gray-50 border border-gray-100 rounded-[6px] text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:bg-white focus:border-blue-600 transition-colors disabled:bg-gray-100 disabled:cursor-not-allowed';
const CAMPO_ERRO = 'border-red-300 bg-red-50/40';

/** Teto do bucket `financeiro-anexos` (20 MiB) e os tipos que ele aceita. */
const ANEXO_MAX_BYTES = 20 * 1024 * 1024;
const ANEXO_TIPOS = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];

export const MOTIVO_DARF_PAGO = 'DARF pago: estorne a baixa em Contas a Pagar para alterar vencimento, multa ou juros.';

/** Uma linha da composição exibida no painel. */
interface LinhaComposicao {
    id: string;
    tributo: string;
    descricao: string;
    vencimento: string | null;
    valor: number;
}

interface Props {
    open: boolean;
    onClose: () => void;
    /** Organização dos tributos (criar) ou do DARF (editar). */
    organizationId: string;
    /** Nome da organização — mostrado quando o topo está em "Todas". */
    organizacaoNome?: string | null;
    /** Criar: os tributos escolhidos (já validados por `validarSelecaoParaDarf`). */
    tributos?: TaxPayable[];
    /** Editar: o DARF aberto. */
    darf?: Darf | null;
    onSaved: (resultado: { darfId: string; dueDate: string; mensagem: string }) => void;
}

const Campo: React.FC<React.PropsWithChildren<{ label: string; erro?: string | null; dica?: React.ReactNode; className?: string }>> = ({ label, erro, dica, className = '', children }) => (
    <div className={`space-y-1.5 ${className}`}>
        <label className={ROTULO}>{label}</label>
        {children}
        {erro
            ? <p className="text-xs text-red-600 leading-snug">{erro}</p>
            : dica ? <p className="text-xs text-gray-500 leading-snug">{dica}</p> : null}
    </div>
);

interface EstadoForm {
    dueDate: string;
    multa: string;
    juros: string;
    codigoBarras: string;
    numeroDocumento: string;
    observacao: string;
}

const DarfSheet: React.FC<Props> = ({ open, onClose, organizationId, organizacaoNome, tributos = [], darf, onSaved }) => {
    const confirm = useConfirm();
    const isEdit = !!darf;
    const pago = !!darf && darf.n_pagos > 0;

    const [form, setForm] = useState<EstadoForm>({ dueDate: '', multa: '', juros: '', codigoBarras: '', numeroDocumento: '', observacao: '' });
    const [snapshot, setSnapshot] = useState('');
    const [arquivo, setArquivo] = useState<File | null>(null);
    const [removerAnexo, setRemoverAnexo] = useState(false);
    const [composicao, setComposicao] = useState<LinhaComposicao[]>([]);
    const [carregando, setCarregando] = useState(false);
    const [salvando, setSalvando] = useState(false);
    const [tentou, setTentou] = useState(false);
    const [erro, setErro] = useState<string | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    // Abrir: preenche com a seleção (criar) ou com o DARF e a composição dele (editar).
    useEffect(() => {
        if (!open) return;
        setErro(null);
        setTentou(false);
        setArquivo(null);
        setRemoverAnexo(false);
        const inicial: EstadoForm = darf
            ? {
                dueDate: darf.due_date,
                multa: darf.multa ? String(darf.multa) : '',
                juros: darf.juros ? String(darf.juros) : '',
                codigoBarras: darf.codigo_barras ?? '',
                numeroDocumento: darf.numero_documento ?? '',
                observacao: darf.observacao ?? '',
            }
            : { dueDate: menorVencimento(tributos) ?? '', multa: '', juros: '', codigoBarras: '', numeroDocumento: '', observacao: '' };
        setForm(inicial);
        setSnapshot(JSON.stringify(inicial));
        if (!darf) {
            setComposicao(tributos.map(t => ({
                id: t.id, tributo: t.party_name ?? '—', descricao: t.description ?? '', vencimento: t.due_date ?? null, valor: t.amount ?? 0,
            })));
            return;
        }
        let vivo = true;
        setCarregando(true);
        darfService.membros(darf.id)
            .then(ms => {
                if (!vivo) return;
                // Só os tributos: multa e juros têm campo próprio no painel.
                setComposicao(ms.filter(m => m.party_type === 'TAX').map(m => ({
                    id: m.id, tributo: m.party_name ?? '—', descricao: m.description ?? '', vencimento: null, valor: m.amount ?? 0,
                })));
            })
            .catch(e => { if (vivo) setErro(e instanceof Error ? e.message : 'Não foi possível carregar a composição do DARF.'); })
            .finally(() => { if (vivo) setCarregando(false); });
        return () => { vivo = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, darf?.id]);

    const set = <K extends keyof EstadoForm>(k: K, v: EstadoForm[K]) => setForm(f => ({ ...f, [k]: v }));

    const principal = isEdit ? (darf?.principal ?? 0) : composicao.reduce((s, l) => s + l.valor, 0);
    const multa = Number(form.multa) || 0;
    const juros = Number(form.juros) || 0;
    const total = principal + multa + juros;
    const competencia = isEdit ? darf!.competencia : (tributos[0]?.transaction_date ?? '');
    const nTributos = isEdit ? (darf?.qtd_tributos ?? composicao.length) : composicao.length;

    const linha = normalizarLinhaDigitavel(form.codigoBarras);
    const erros = useMemo(() => {
        const e: Partial<Record<keyof EstadoForm, string>> = {};
        if (!form.dueDate) e.dueDate = 'Informe o vencimento do DARF.';
        if (!linha.valido) e.codigoBarras = `Informe os 44 dígitos do código de barras ou os 48 da linha digitável (tem ${linha.digitos.length}).`;
        if (!pago && nTributos < 2 && multa + juros <= 0) e.multa = 'Com 1 tributo, o DARF precisa de multa ou juros — ou selecione mais tributos.';
        return e;
    }, [form.dueDate, linha.valido, linha.digitos.length, pago, nTributos, multa, juros]);
    const mostrar = (k: keyof EstadoForm) => (tentou ? erros[k] ?? null : null);

    const dirty = JSON.stringify(form) !== snapshot || !!arquivo || removerAnexo;

    async function fechar() {
        if (dirty && !salvando) {
            const ok = await confirm({
                title: 'Sair sem salvar?',
                message: 'O que foi preenchido neste DARF será perdido.',
                variant: 'warning',
                confirmLabel: 'Sair e descartar',
                cancelLabel: 'Continuar editando',
            });
            if (!ok) return;
        }
        onClose();
    }

    function escolherArquivo(f: File | null) {
        setErro(null);
        if (!f) return;
        if (!ANEXO_TIPOS.includes(f.type)) { setErro('O anexo precisa ser PDF ou imagem (PNG, JPG, WEBP).'); return; }
        if (f.size > ANEXO_MAX_BYTES) { setErro('O anexo passa de 20 MB. Reduza o arquivo e tente de novo.'); return; }
        setArquivo(f);
        setRemoverAnexo(false);
    }

    async function salvar() {
        setTentou(true);
        if (Object.keys(erros).length > 0) {
            setErro('Corrija os campos marcados.');
            return;
        }
        const dados: FormDarf = {
            dueDate: form.dueDate,
            multa,
            juros,
            codigoBarras: form.codigoBarras,
            numeroDocumento: form.numeroDocumento,
            observacao: form.observacao,
        };
        setSalvando(true);
        setErro(null);
        try {
            if (isEdit && darf) {
                await darfService.editar(darf, dados, { arquivo, removerAnexo });
                onSaved({ darfId: darf.id, dueDate: form.dueDate, mensagem: 'DARF atualizado.' });
            } else {
                const id = await darfService.criar(organizationId, tributos.map(t => t.id), dados, arquivo);
                onSaved({
                    darfId: id,
                    dueDate: form.dueDate,
                    mensagem: `DARF criado com ${tributos.length} tributo${tributos.length !== 1 ? 's' : ''} · ${formatMoney(total)}. O pagamento é em Contas a Pagar.`,
                });
            }
        } catch (e) {
            setErro(e instanceof Error ? e.message : 'Não foi possível gravar o DARF.');
        } finally {
            setSalvando(false);
        }
    }

    const temAnexoGravado = !!darf?.documento_path && !removerAnexo && !arquivo;

    return (
        <Sheet open={open} onClose={onClose} size="xl" dirty={dirty && !salvando}>
            <SheetHeader onClose={fechar}>
                <SheetTitle>{isEdit ? 'Editar DARF' : 'Agrupar em DARF'}</SheetTitle>
                <SheetDescription>
                    Competência {competenciaBR(competencia)}
                    {organizacaoNome ? ` · ${organizacaoNome}` : ''}
                    {' · '}o pagamento é feito em Contas a Pagar, como um título só.
                </SheetDescription>
            </SheetHeader>

            <SheetPanel className="px-6 py-5 space-y-8">
                {pago && (
                    <div className="flex gap-2 p-3 rounded-[6px] bg-amber-50 border border-amber-100 text-amber-800 text-sm">
                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>Este DARF já está pago. Dá para trocar o código de barras, o número, a observação e o anexo; vencimento, multa e juros só depois de estornar a baixa em Contas a Pagar.</span>
                    </div>
                )}

                {/* Composição */}
                <div className="space-y-4">
                    <SecaoTitulo icon={Layers} titulo="Tributos agrupados" resumo={`${nTributos} tributo${nTributos !== 1 ? 's' : ''}`} />
                    {carregando ? (
                        <div className="text-center py-6">
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto"></div>
                        </div>
                    ) : (
                        <div className="overflow-x-auto rounded-[10px] border border-gray-100">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-white text-gray-700 font-semibold text-xs border-b border-gray-200">
                                        <th className="px-3 py-2 border-r border-gray-100">Tributo</th>
                                        <th className="px-4 py-2 border-r border-gray-100">Descrição</th>
                                        {!isEdit && <th className="px-3 py-2 border-r border-gray-100 whitespace-nowrap">Venc. atual</th>}
                                        <th className="px-3 py-2 text-right">Valor</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                    {composicao.map(l => (
                                        <tr key={l.id}>
                                            <td className="px-3 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-700 whitespace-nowrap">{l.tributo}</td>
                                            <td className="px-4 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-700 max-w-0">
                                                <span className="block truncate" title={l.descricao}>{l.descricao || '—'}</span>
                                            </td>
                                            {!isEdit && <td className="px-3 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-600 whitespace-nowrap">{formatDateBR(l.vencimento)}</td>}
                                            <td className="px-3 py-2.5 text-right text-sm font-medium text-gray-800 whitespace-nowrap">{formatMoney(l.valor)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr className="border-t border-gray-200">
                                        <td colSpan={isEdit ? 2 : 3} className="px-3 py-2 text-sm text-gray-500">Principal</td>
                                        <td className="px-3 py-2 text-right text-sm font-medium text-gray-800 whitespace-nowrap">{formatMoney(principal)}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    )}
                </div>

                {/* Vencimento e valores */}
                <div className="space-y-4">
                    <SecaoTitulo icon={CalendarClock} titulo="Vencimento e valores" />
                    <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                        <Campo label="Vencimento do DARF *" erro={mostrar('dueDate')}
                            dica={pago ? null : 'Os tributos passam a vencer nesta data; o vencimento original volta se o DARF for desagrupado.'}>
                            {/* Campo desligado não mostra o `title` em todo navegador: o motivo vai no span. */}
                            <span title={pago ? MOTIVO_DARF_PAGO : undefined} className="block">
                                <input
                                    type="date"
                                    value={form.dueDate}
                                    max="9999-12-31"
                                    disabled={pago}
                                    onChange={e => set('dueDate', e.target.value)}
                                    className={`${CAMPO} ${mostrar('dueDate') ? CAMPO_ERRO : ''}`}
                                />
                            </span>
                        </Campo>
                        <Campo label="Total do DARF">
                            {/* Só leitura e escuro (§32): é a soma, não um campo a preencher. */}
                            <p className="h-9 flex items-center text-sm font-medium text-gray-900" aria-live="polite">{formatMoney(total)}</p>
                        </Campo>
                        <Campo label="Multa (R$)" erro={mostrar('multa')} dica={pago ? null : 'Despesa de "Multa e Juros de Mora", paga junto com o DARF.'}>
                            <span title={pago ? MOTIVO_DARF_PAGO : undefined} className="block">
                                <MoneyCentsInput
                                    value={form.multa}
                                    disabled={pago}
                                    onChange={v => set('multa', v)}
                                    className={`${CAMPO} ${mostrar('multa') ? CAMPO_ERRO : ''}`}
                                />
                            </span>
                        </Campo>
                        <Campo label="Juros (R$)">
                            <span title={pago ? MOTIVO_DARF_PAGO : undefined} className="block">
                                <MoneyCentsInput
                                    value={form.juros}
                                    disabled={pago}
                                    onChange={v => set('juros', v)}
                                    className={CAMPO}
                                />
                            </span>
                        </Campo>
                    </div>
                </div>

                {/* Dados da guia */}
                <div className="space-y-4">
                    <SecaoTitulo icon={Receipt} titulo="Dados da guia" />
                    <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                        <Campo label="Código de barras / linha digitável" erro={mostrar('codigoBarras')} className="col-span-2"
                            dica={linha.digitos.length === 0 ? 'Opcional — cole a linha digitável do DARF (48 dígitos).' : `${linha.digitos.length} dígitos`}>
                            <input
                                type="text"
                                inputMode="numeric"
                                value={form.codigoBarras}
                                onChange={e => set('codigoBarras', e.target.value)}
                                placeholder="85800000000-0 00000000000-0 00000000000-0 00000000000-0"
                                className={`${CAMPO} ${mostrar('codigoBarras') ? CAMPO_ERRO : ''}`}
                            />
                        </Campo>
                        <Campo label="Número do documento">
                            <input
                                type="text"
                                value={form.numeroDocumento}
                                onChange={e => set('numeroDocumento', e.target.value)}
                                placeholder="Nº do DARF numerado"
                                className={CAMPO}
                            />
                        </Campo>
                        <Campo label="Observação" className="col-span-2">
                            <textarea
                                value={form.observacao}
                                onChange={e => set('observacao', e.target.value)}
                                rows={2}
                                className="w-full px-3 py-2 bg-gray-50 border border-gray-100 rounded-[6px] text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:bg-white focus:border-blue-600 transition-colors resize-none"
                            />
                        </Campo>
                    </div>
                </div>

                {/* Anexo */}
                <div className="space-y-4">
                    <SecaoTitulo icon={Paperclip} titulo="PDF do DARF" />
                    <input
                        ref={fileRef}
                        type="file"
                        accept={ANEXO_TIPOS.join(',')}
                        className="hidden"
                        onChange={e => { escolherArquivo(e.target.files?.[0] ?? null); e.target.value = ''; }}
                    />
                    {arquivo ? (
                        <div className="flex items-center gap-3 p-3 rounded-[6px] border border-gray-100 bg-gray-50">
                            <FileText className="w-4 h-4 text-gray-500 shrink-0" />
                            <span className="flex-1 min-w-0 truncate text-sm text-gray-900" title={arquivo.name}>{arquivo.name}</span>
                            <button type="button" onClick={() => setArquivo(null)} className="text-sm font-medium text-gray-600 hover:text-gray-900">Remover</button>
                        </div>
                    ) : temAnexoGravado ? (
                        <div className="flex items-center gap-3 p-3 rounded-[6px] border border-gray-100 bg-gray-50">
                            <FileText className="w-4 h-4 text-gray-500 shrink-0" />
                            <span className="flex-1 min-w-0 truncate text-sm text-gray-900" title={darf!.documento_nome ?? ''}>{darf!.documento_nome || 'Documento'}</span>
                            <button
                                type="button"
                                onClick={async () => {
                                    try { window.open(await darfService.urlDoAnexo(darf!.documento_path!), '_blank', 'noopener'); }
                                    catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível abrir o documento.'); }
                                }}
                                className="text-sm font-medium text-blue-600 hover:text-blue-800"
                            >
                                Ver
                            </button>
                            <button type="button" onClick={() => fileRef.current?.click()} className="text-sm font-medium text-gray-600 hover:text-gray-900">Trocar</button>
                            <button type="button" onClick={() => setRemoverAnexo(true)} className="text-red-500 hover:text-red-700" title="Remover documento">
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    ) : (
                        <button
                            type="button"
                            onClick={() => fileRef.current?.click()}
                            className="w-full flex items-center justify-center gap-2 h-16 rounded-[6px] border border-dashed border-gray-300 text-sm font-medium text-gray-600 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50/40 transition-colors"
                        >
                            <Upload className="w-4 h-4" />
                            Anexar o PDF do DARF (PDF ou imagem, até 20 MB)
                        </button>
                    )}
                    {removerAnexo && (
                        <p className="text-xs text-gray-500">O documento será removido ao salvar. <button type="button" onClick={() => setRemoverAnexo(false)} className="text-blue-600 hover:text-blue-800 font-medium">Desfazer</button></p>
                    )}
                </div>
            </SheetPanel>

            <SheetFooter>
                <div className="flex items-center justify-end gap-3 w-full">
                    {erro ? (
                        <p className="mr-auto flex items-center gap-1.5 text-sm text-red-600">
                            <AlertCircle className="w-4 h-4 shrink-0" /> {erro}
                        </p>
                    ) : (
                        <p className="mr-auto text-sm text-gray-500">
                            {multa + juros > 0 && <>{formatMoney(principal)} + {formatMoney(multa + juros)} de encargos = </>}
                            <span className="font-medium text-gray-900">{formatMoney(total)}</span>
                        </p>
                    )}
                    <button
                        type="button"
                        onClick={fechar}
                        className="h-9 px-3.5 text-[13px] font-medium text-gray-600 hover:bg-gray-100 rounded-[6px] transition-all"
                    >
                        Cancelar
                    </button>
                    <button
                        type="button"
                        onClick={salvar}
                        disabled={salvando || carregando}
                        title={salvando ? 'Gravando…' : carregando ? 'Carregando a composição…' : undefined}
                        className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                        {salvando ? <Loader2 className="w-[15px] h-[15px] animate-spin" /> : <CheckCircle2 className="w-[15px] h-[15px]" />}
                        {isEdit ? 'Salvar DARF' : 'Criar DARF'}
                    </button>
                </div>
            </SheetFooter>
        </Sheet>
    );
};

export default DarfSheet;
