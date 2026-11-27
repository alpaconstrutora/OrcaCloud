import React from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, FileSignature, Loader2, Plus } from 'lucide-react';
import {
    CardHeader, GhostButton, PortalCard, PortalEmpty, PortalLoading, PrimaryButton, StatusPill, Td, TextLinkButton, Th,
    fmtBRLCents, fmtDate,
} from '../portal/PortalKit';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import MoneyCentsInput from '../ui/MoneyCentsInput';
import SupplierSelect from '../SupplierSelect';
import CostCenterSelect from '../CostCenterSelect';
import HierarchicalSelect from '../HierarchicalSelect';
import {
    centroPadraoDoCondominio, sindicoPortalService, type CondominioDoFinanceiro, type IdentidadeDoSindico,
} from '../../services/sindicoPortalService';
import {
    CONTRATO_ENCERRADO, PERIODICIDADES, andamentoDoContrato, motivoDoContrato, motivoNaoEncerraContrato,
    type ContratoDoCondominio, type FormContrato, type Periodicidade,
} from '../../utils/fornecedoresDoSindico';
import { hojeEmBrasilia } from '../../utils/mandatoSindico';

/**
 * Portal do Síndico › Financeiro › Contratos (G3, 26/11/2026).
 * Plano: docs/planos/2026-10-24-portal-sindico-gestao-completa.md
 * Pronto quando: contrato criado pelo síndico gera as parcelas em Contas a pagar.
 *
 * Contrato recorrente com fornecedor (elevador, limpeza, portaria…). Salvar cria
 * o contrato na organização do condomínio e a série de parcelas em Contas a
 * pagar — a mesma que o app gera (`sindico_portal_contrato_salvar` usa a regra
 * de vencimentos do app, provada por paridade). A prévia vem do banco, não de
 * uma cópia da regra aqui. Encerrar cancela as parcelas em aberto depois do fim.
 */

const ROTULO = 'text-xs font-semibold text-slate-500';
const CAMPO = 'w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#E1553C]/20 focus:border-[#E1553C]';

interface Props {
    identidade: IdentidadeDoSindico;
    condominioId: string | null;
    /** Cadastros do condomínio (centros, contas financeiras, fornecedores) — do Financeiro. */
    condominio: CondominioDoFinanceiro | null;
    motivoBase: string | null;
    notify: (m: string, t?: 'success' | 'error') => void;
    /** As parcelas caem em Contas a pagar: recarregar o financeiro depois de mudar. */
    onAlterado: () => void;
}

const Acao: React.FC<{ motivo: string | null; onClick: () => void; children: React.ReactNode }> = ({ motivo, onClick, children }) => (
    <span title={motivo ?? undefined} className={motivo ? 'cursor-not-allowed' : undefined}>
        <TextLinkButton onClick={onClick} disabled={!!motivo} className={motivo ? 'pointer-events-none text-gray-300 disabled:opacity-100' : ''}>
            {children}
        </TextLinkButton>
    </span>
);

const PainelContratosDoSindico: React.FC<Props> = ({ identidade, condominioId, condominio, motivoBase, notify, onAlterado }) => {
    const [lista, setLista] = React.useState<ContratoDoCondominio[] | null>(null);
    const [erro, setErro] = React.useState<string | null>(null);
    const [versao, setVersao] = React.useState(0);
    const [novo, setNovo] = React.useState(false);
    const [encerrando, setEncerrando] = React.useState<ContratoDoCondominio | null>(null);

    React.useEffect(() => {
        if (!condominioId) return;
        let vivo = true;
        setErro(null);
        sindicoPortalService.getContratos(identidade, condominioId)
            .then(c => { if (vivo) setLista(c); })
            .catch(e => { if (vivo) { setLista(null); setErro(e instanceof Error ? e.message : 'Não foi possível carregar os contratos.'); } });
        return () => { vivo = false; };
    }, [identidade, condominioId, versao]);

    const depoisDeGravar = (m: string) => { setNovo(false); setEncerrando(null); notify(m); setVersao(v => v + 1); onAlterado(); };

    return (
        <>
            <PortalCard>
                <CardHeader
                    title="Contratos"
                    subtitle="Serviços contínuos do condomínio — cada contrato gera as parcelas em Contas a pagar"
                    right={
                        <span title={motivoBase ?? (!condominio ? 'Carregando o condomínio…' : undefined)}>
                            <PrimaryButton onClick={() => setNovo(true)} disabled={!!motivoBase || !condominio}
                                className={motivoBase || !condominio ? 'pointer-events-none' : ''}>
                                <Plus className="w-4 h-4" /> Novo contrato
                            </PrimaryButton>
                        </span>
                    }
                />
                {erro ? (
                    <p className="px-5 pb-5 text-sm text-[#4A505C] flex items-start gap-2"><AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" /> {erro}</p>
                ) : !lista ? (
                    <PortalLoading label="Carregando os contratos..." />
                ) : lista.length === 0 ? (
                    <PortalEmpty icon={<FileSignature className="w-8 h-8" />} title="Nenhum contrato"
                        subtitle="Cadastre os serviços contínuos do condomínio: as parcelas de cada mês entram sozinhas em Contas a pagar." />
                ) : (
                    <div className="overflow-x-auto border-t border-[#ECECEF]">
                        <table className="w-full min-w-[860px]">
                            <thead className="border-b border-[#ECECEF]">
                                <tr>
                                    <Th>Contrato</Th><Th>Fornecedor</Th><Th className="text-right">Parcela</Th><Th>Vigência</Th>
                                    <Th>Parcelas</Th><Th>Situação</Th><Th>Ações</Th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[#ECECEF]">
                                {lista.map(c => {
                                    const encerrado = CONTRATO_ENCERRADO.includes(c.status);
                                    return (
                                        <tr key={c.id} className="hover:bg-gray-50/70 transition-colors">
                                            <Td className="text-[#1F2430]">
                                                {c.objeto}
                                                <span className="block text-[11px] text-gray-400">{c.numero ?? '—'}</span>
                                            </Td>
                                            <Td>{c.fornecedor ?? '—'}</Td>
                                            <Td className="text-right tabular-nums text-[#1F2430] whitespace-nowrap">
                                                {fmtBRLCents(Number(c.valor) || 0)}
                                                {c.recorrente && c.periodicidade && (
                                                    <span className="block text-[11px] text-gray-400">{c.periodicidade}{c.diaVencimento ? `, dia ${c.diaVencimento}` : ''}</span>
                                                )}
                                            </Td>
                                            <Td className="whitespace-nowrap">{fmtDate(c.inicio)} {c.fim ? `a ${fmtDate(c.fim)}` : '· sem fim'}</Td>
                                            <Td className="whitespace-nowrap">
                                                {andamentoDoContrato(c)}
                                                {c.proximoVencimento && <span className="block text-[11px] text-gray-400">próxima {fmtDate(c.proximoVencimento)}</span>}
                                            </Td>
                                            <Td><StatusPill tone={encerrado ? 'muted' : 'good'}>{c.status}</StatusPill></Td>
                                            <Td className="whitespace-nowrap">
                                                <Acao motivo={motivoNaoEncerraContrato(c, motivoBase)} onClick={() => setEncerrando(c)}>Encerrar</Acao>
                                            </Td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
                {motivoBase && <p className="px-5 py-3 text-xs text-gray-500">{motivoBase}</p>}
            </PortalCard>

            <NovoContratoSheet open={novo} identidade={identidade} condominio={condominio}
                onClose={() => setNovo(false)} onSalvo={depoisDeGravar} />
            <EncerrarContratoSheet contrato={encerrando} identidade={identidade} condominioId={condominioId}
                onClose={() => setEncerrando(null)} onSalvo={depoisDeGravar} />
        </>
    );
};

// ── Novo contrato ────────────────────────────────────────────────────────────
function formVazio(condominio: CondominioDoFinanceiro | null): FormContrato {
    return {
        objeto: '', fornecedorId: '', valor: 0, periodicidade: 'Mensal', diaVencimento: 10,
        inicio: hojeEmBrasilia(), fim: '', centroId: centroPadraoDoCondominio(condominio)?.id ?? '', categoriaId: '',
    };
}

const NovoContratoSheet: React.FC<{
    open: boolean;
    identidade: IdentidadeDoSindico;
    condominio: CondominioDoFinanceiro | null;
    onClose: () => void;
    onSalvo: (m: string) => void;
}> = ({ open, identidade, condominio, onClose, onSalvo }) => {
    const [form, setForm] = React.useState<FormContrato>(formVazio(condominio));
    const [valorTexto, setValorTexto] = React.useState('');
    const [previa, setPrevia] = React.useState<{ vencimentos: string[]; vencidas: number } | null>(null);
    const [calculando, setCalculando] = React.useState(false);
    const [salvando, setSalvando] = React.useState(false);
    const [erro, setErro] = React.useState<string | null>(null);

    React.useEffect(() => {
        if (!open) return;
        setForm(formVazio(condominio)); setValorTexto(''); setPrevia(null); setErro(null);
    }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

    const set = <K extends keyof FormContrato>(k: K, v: FormContrato[K]) => setForm(f => ({ ...f, [k]: v }));
    const motivoForm = motivoDoContrato(form);

    // Prévia do banco quando as datas mudam (folga para a digitação).
    const chave = `${form.inicio}|${form.fim}|${form.diaVencimento}|${form.periodicidade}`;
    React.useEffect(() => {
        if (!open || !condominio || !form.inicio || !form.diaVencimento || form.diaVencimento > 28 || (form.fim && form.fim < form.inicio)) {
            setPrevia(null); return;
        }
        let vivo = true;
        setCalculando(true);
        const t = setTimeout(() => {
            sindicoPortalService.contratoPrevia(identidade, condominio.id, form)
                .then(p => { if (vivo) setPrevia(p); })
                .catch(() => { if (vivo) setPrevia(null); })
                .finally(() => { if (vivo) setCalculando(false); });
        }, 300);
        return () => { vivo = false; clearTimeout(t); };
    }, [open, chave, condominio, identidade]); // eslint-disable-line react-hooks/exhaustive-deps

    const sujo = open && (JSON.stringify(form) !== JSON.stringify(formVazio(condominio)) || valorTexto !== '');
    const motivo = salvando ? 'Gravando…' : !condominio ? 'Carregando o condomínio…' : motivoForm
        ?? (calculando ? 'Calculando as parcelas…' : previa && previa.vencimentos.length === 0 ? 'Nenhum vencimento entre o início e o fim — confira as datas.' : null);

    const salvar = async () => {
        if (!condominio || motivo) return;
        setSalvando(true);
        setErro(null);
        try {
            const r = await sindicoPortalService.salvarContrato(identidade, condominio.id, form);
            onSalvo(`Contrato ${r.numero} criado. ${r.parcelas} ${r.parcelas === 1 ? 'parcela entrou' : 'parcelas entraram'} em Contas a pagar.`);
        } catch (e) {
            setErro(e instanceof Error ? e.message : 'Não foi possível salvar o contrato.');
        } finally {
            setSalvando(false);
        }
    };

    const centros = (condominio?.centros ?? []).map(c => ({ id: c.id, code: c.code, name: c.name, parent_id: c.parentId }));
    const fornecedores = condominio?.fornecedores ?? [];
    const total = previa ? previa.vencimentos.length * form.valor : 0;

    return (
        <Sheet open={open} onClose={onClose} size="md" dirty={sujo && !salvando}>
            <SheetHeader onClose={onClose}>
                <SheetTitle>Novo contrato</SheetTitle>
                <SheetDescription>{condominio?.nome}</SheetDescription>
            </SheetHeader>
            <SheetPanel className="p-4 md:p-6 space-y-4">
                <div className="bg-white p-6 rounded-[10px] border border-gray-100 shadow-sm space-y-4">
                    <div className="space-y-1.5">
                        <label className={ROTULO} htmlFor="contrato-objeto">Objeto *</label>
                        <input id="contrato-objeto" className={CAMPO} value={form.objeto} maxLength={200} placeholder="Ex.: Manutenção mensal dos elevadores"
                            onChange={e => set('objeto', e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                        <span className={ROTULO}>Fornecedor *</span>
                        <SupplierSelect suppliers={fornecedores} value={form.fornecedorId} onChange={id => set('fornecedorId', id || '')}
                            placeholder="Selecionar fornecedor" size="sm" title="Selecionar fornecedor" />
                        {fornecedores.length === 0 && <p className="text-xs text-gray-500">Cadastre o fornecedor na aba Fornecedores.</p>}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                        <div className="space-y-1.5">
                            <label className={ROTULO} htmlFor="contrato-valor">Valor da parcela *</label>
                            <MoneyCentsInput id="contrato-valor" value={valorTexto} className={CAMPO}
                                onChange={v => { setValorTexto(v); set('valor', v === '' ? 0 : Number(v)); }} />
                        </div>
                        <div className="space-y-1.5">
                            <label className={ROTULO} htmlFor="contrato-periodicidade">Periodicidade</label>
                            <select id="contrato-periodicidade" className={CAMPO} value={form.periodicidade}
                                onChange={e => set('periodicidade', e.target.value as Periodicidade)}>
                                {PERIODICIDADES.map(p => <option key={p} value={p}>{p}</option>)}
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <label className={ROTULO} htmlFor="contrato-dia">Dia do vencimento *</label>
                            <input id="contrato-dia" type="number" min={1} max={28} className={CAMPO} value={form.diaVencimento ?? ''}
                                onChange={e => set('diaVencimento', e.target.value === '' ? null : Number(e.target.value))} />
                            <p className="text-[11px] text-gray-400">De 1 a 28 — assim fevereiro nunca fica sem parcela.</p>
                        </div>
                        <div />
                        <div className="space-y-1.5">
                            <label className={ROTULO} htmlFor="contrato-inicio">Início *</label>
                            <input id="contrato-inicio" type="date" className={CAMPO} value={form.inicio} onChange={e => set('inicio', e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                            <label className={ROTULO} htmlFor="contrato-fim">Fim</label>
                            <input id="contrato-fim" type="date" className={CAMPO} value={form.fim} onChange={e => set('fim', e.target.value)} />
                            <p className="text-[11px] text-gray-400">Sem fim: entram os próximos 12 vencimentos.</p>
                        </div>
                        <div className="space-y-1.5">
                            <span className={ROTULO}>Centro de custo *</span>
                            <CostCenterSelect costCenters={centros} value={form.centroId} onChange={v => set('centroId', v || '')}
                                hoverCls="hover:bg-[#FDEDE8]" size="sm" />
                        </div>
                        <div className="space-y-1.5">
                            <span className={ROTULO}>Conta financeira *</span>
                            <HierarchicalSelect
                                items={(condominio?.categorias ?? []).filter(c => c.nature !== 'REVENUE' || c.id === form.categoriaId)
                                    .map(c => ({ id: c.id, name: c.name, parentId: c.parentId ?? null }))}
                                value={form.categoriaId}
                                onChange={v => set('categoriaId', v || '')}
                                valueField="id" placeholder="—" hoverCls="hover:bg-[#FDEDE8]" size="sm"
                                panelVariant="drawer" drawerTitle="Selecionar Conta Financeira"
                            />
                        </div>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-[10px] border border-gray-100 shadow-sm space-y-2">
                    <div className="flex items-center justify-between gap-3">
                        <p className="text-[13px] font-semibold text-[#1F2430]">Parcelas que vão para Contas a pagar</p>
                        {previa && previa.vencimentos.length > 0 && form.valor > 0 && (
                            <span className="text-sm font-medium text-[#1F2430] tabular-nums">{fmtBRLCents(total)}</span>
                        )}
                    </div>
                    {calculando && !previa ? (
                        <p className="text-sm text-gray-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Calculando…</p>
                    ) : !previa ? (
                        <p className="text-sm text-gray-500">Informe o início e o dia do vencimento para ver as parcelas.</p>
                    ) : previa.vencimentos.length === 0 ? (
                        <p className="text-sm text-gray-500">Nenhum vencimento entre o início e o fim.</p>
                    ) : (
                        <>
                            <p className="text-sm text-[#4A505C]">
                                {previa.vencimentos.length} {previa.vencimentos.length === 1 ? 'parcela' : 'parcelas'}: de {fmtDate(previa.vencimentos[0])} a {fmtDate(previa.vencimentos[previa.vencimentos.length - 1])}.
                            </p>
                            {previa.vencidas > 0 && (
                                <p className="text-sm text-amber-700 flex items-start gap-1.5">
                                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                                    {previa.vencidas} {previa.vencidas === 1 ? 'já nasce vencida' : 'já nascem vencidas'} (o início é no passado). Dê baixa nelas em Contas a pagar se já foram pagas.
                                </p>
                            )}
                        </>
                    )}
                </div>
            </SheetPanel>
            <SheetFooter>
                <div className="flex items-center justify-end gap-3 w-full">
                    {erro && <p className="mr-auto flex items-center gap-1.5 text-sm text-red-600"><AlertCircle className="w-4 h-4 shrink-0" /> {erro}</p>}
                    <GhostButton onClick={onClose}>Cancelar</GhostButton>
                    <span title={motivo ?? undefined}>
                        <PrimaryButton onClick={salvar} disabled={!!motivo} className={motivo ? 'pointer-events-none' : ''}>
                            {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                            Criar contrato
                        </PrimaryButton>
                    </span>
                </div>
            </SheetFooter>
        </Sheet>
    );
};

// ── Encerrar ─────────────────────────────────────────────────────────────────
const EncerrarContratoSheet: React.FC<{
    contrato: ContratoDoCondominio | null;
    identidade: IdentidadeDoSindico;
    condominioId: string | null;
    onClose: () => void;
    onSalvo: (m: string) => void;
}> = ({ contrato, identidade, condominioId, onClose, onSalvo }) => {
    const [fim, setFim] = React.useState('');
    const [motivoTexto, setMotivoTexto] = React.useState('');
    const [salvando, setSalvando] = React.useState(false);
    const [erro, setErro] = React.useState<string | null>(null);

    // Sugere hoje — ou o início, se o contrato ainda não começou (encerrar antes do início o banco recusa).
    React.useEffect(() => {
        if (!contrato) return;
        const hoje = hojeEmBrasilia();
        setFim(contrato.inicio > hoje ? contrato.inicio : hoje); setMotivoTexto(''); setErro(null);
    }, [contrato]);

    const motivo = salvando ? 'Gravando…' : !fim ? 'Informe a data de encerramento.'
        : contrato && fim < contrato.inicio ? 'A data de encerramento não pode ser antes do início do contrato.'
            : !motivoTexto.trim() ? 'Diga o motivo do encerramento.' : null;

    const salvar = async () => {
        if (!contrato || !condominioId || motivo) return;
        setSalvando(true);
        setErro(null);
        try {
            const r = await sindicoPortalService.encerrarContrato(identidade, condominioId, contrato.id, fim, motivoTexto.trim());
            const canc = r.canceladas ? ` ${r.canceladas} ${r.canceladas === 1 ? 'parcela em aberto foi cancelada' : 'parcelas em aberto foram canceladas'}.` : '';
            const mant = r.mantidas ? ` ${r.mantidas} em mês fechado ${r.mantidas === 1 ? 'ficou' : 'ficaram'} — fale com a administradora.` : '';
            onSalvo(`Contrato encerrado.${canc}${mant}`);
        } catch (e) {
            setErro(e instanceof Error ? e.message : 'Não foi possível encerrar o contrato.');
        } finally {
            setSalvando(false);
        }
    };

    return (
        <Sheet open={!!contrato} onClose={onClose} size="sm" dirty={!!motivoTexto.trim() && !salvando}>
            <SheetHeader onClose={onClose}>
                <SheetTitle>Encerrar contrato</SheetTitle>
                <SheetDescription>{contrato ? `${contrato.numero ?? ''} · ${contrato.objeto}` : ''}</SheetDescription>
            </SheetHeader>
            <SheetPanel className="p-4 md:p-6">
                <div className="bg-white p-6 rounded-[10px] border border-gray-100 shadow-sm space-y-4">
                    <p className="text-sm text-[#4A505C]">
                        As parcelas em aberto com vencimento depois desta data são canceladas. As já pagas ficam como estão.
                    </p>
                    <div className="space-y-1.5">
                        <label className={ROTULO} htmlFor="encerrar-fim">Encerra em *</label>
                        <input id="encerrar-fim" type="date" className={CAMPO} value={fim} onChange={e => setFim(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                        <label className={ROTULO} htmlFor="encerrar-motivo">Motivo *</label>
                        <textarea id="encerrar-motivo" rows={3} className={`${CAMPO} h-auto py-2`} value={motivoTexto}
                            placeholder="Ex.: troca de empresa, fim do serviço" onChange={e => setMotivoTexto(e.target.value)} />
                    </div>
                </div>
            </SheetPanel>
            <SheetFooter>
                <div className="flex items-center justify-end gap-3 w-full">
                    {erro && <p className="mr-auto flex items-center gap-1.5 text-sm text-red-600"><AlertCircle className="w-4 h-4 shrink-0" /> {erro}</p>}
                    <GhostButton onClick={onClose}>Cancelar</GhostButton>
                    <span title={motivo ?? undefined}>
                        <PrimaryButton onClick={salvar} disabled={!!motivo} className={motivo ? 'pointer-events-none' : ''}>
                            {salvando && <Loader2 className="w-4 h-4 animate-spin" />}
                            Encerrar
                        </PrimaryButton>
                    </span>
                </div>
            </SheetFooter>
        </Sheet>
    );
};

export default PainelContratosDoSindico;
