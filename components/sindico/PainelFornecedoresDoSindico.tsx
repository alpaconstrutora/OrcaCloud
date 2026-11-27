import React from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Loader2, Plus, Truck } from 'lucide-react';
import {
    CardHeader, GhostButton, PortalCard, PortalEmpty, PortalLoading, PrimaryButton, StatusPill, Td, TextLinkButton, Th,
} from '../portal/PortalKit';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import { useConfirm } from '../ui/confirm';
import FornecedorDoSindicoSheet from './FornecedorDoSindicoSheet';
import { sindicoPortalService, type FornecedorNovo, type IdentidadeDoSindico } from '../../services/sindicoPortalService';
import {
    TIPOS_PIX, motivoDaConta, motivoDoDocumento, motivoNaoEditaFornecedor, resumoDaConta,
    type ContaDoFornecedor, type FormContaDoFornecedor, type FornecedorDoCondominio,
} from '../../utils/fornecedoresDoSindico';

/**
 * Portal do Síndico › Financeiro › Fornecedores (G3, 26/11/2026).
 * Plano: docs/planos/2026-10-24-portal-sindico-gestao-completa.md
 *
 * Os fornecedores que a organização do condomínio enxerga: os dela (o síndico
 * cadastra, edita e cuida da conta/PIX) e os disponibilizados por outra empresa
 * (só consulta — quem cadastrou é quem altera). Trocar o nome acompanha os
 * títulos em aberto do condomínio, com a mesma regra do app (o banco conta
 * quantos mudaram e quantos ficaram). Conta do fornecedor nunca é apagada:
 * desativa (o pagamento já feito aponta para ela).
 */

const ROTULO = 'text-xs font-semibold text-slate-500';
const CAMPO = 'w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#E1553C]/20 focus:border-[#E1553C]';

interface Props {
    identidade: IdentidadeDoSindico;
    condominioId: string | null;
    /** Motivo de não poder gravar (link sem senha, condomínio sem org própria). */
    motivoBase: string | null;
    notify: (m: string, t?: 'success' | 'error') => void;
    /** O formulário de lançamento lê os fornecedores do financeiro: recarregar depois de mudar. */
    onAlterado: () => void;
}

const Acao: React.FC<{ motivo: string | null; onClick: () => void; children: React.ReactNode }> = ({ motivo, onClick, children }) => (
    <span title={motivo ?? undefined} className={motivo ? 'cursor-not-allowed' : undefined}>
        <TextLinkButton onClick={onClick} disabled={!!motivo} className={motivo ? 'pointer-events-none text-gray-300 disabled:opacity-100' : ''}>
            {children}
        </TextLinkButton>
    </span>
);

const PainelFornecedoresDoSindico: React.FC<Props> = ({ identidade, condominioId, motivoBase, notify, onAlterado }) => {
    const [lista, setLista] = React.useState<FornecedorDoCondominio[] | null>(null);
    const [erro, setErro] = React.useState<string | null>(null);
    const [versao, setVersao] = React.useState(0);
    const [novo, setNovo] = React.useState(false);
    const [editandoId, setEditandoId] = React.useState<string | null>(null);

    React.useEffect(() => {
        if (!condominioId) return;
        let vivo = true;
        setErro(null);
        sindicoPortalService.getFornecedores(identidade, condominioId)
            .then(f => { if (vivo) setLista(f); })
            .catch(e => { if (vivo) { setLista(null); setErro(e instanceof Error ? e.message : 'Não foi possível carregar os fornecedores.'); } });
        return () => { vivo = false; };
    }, [identidade, condominioId, versao]);

    const recarregar = () => { setVersao(v => v + 1); onAlterado(); };
    const editando = lista?.find(f => f.id === editandoId) ?? null;

    return (
        <>
            <PortalCard>
                <CardHeader
                    title="Fornecedores"
                    subtitle="Quem presta serviço ao condomínio — e para onde vai o pagamento"
                    right={
                        <span title={motivoBase ?? undefined}>
                            <PrimaryButton onClick={() => setNovo(true)} disabled={!!motivoBase} className={motivoBase ? 'pointer-events-none' : ''}>
                                <Plus className="w-4 h-4" /> Novo fornecedor
                            </PrimaryButton>
                        </span>
                    }
                />
                {erro ? (
                    <p className="px-5 pb-5 text-sm text-[#4A505C] flex items-start gap-2"><AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" /> {erro}</p>
                ) : !lista ? (
                    <PortalLoading label="Carregando os fornecedores..." />
                ) : lista.length === 0 ? (
                    <PortalEmpty icon={<Truck className="w-8 h-8" />} title="Nenhum fornecedor cadastrado"
                        subtitle="Cadastre quem presta serviço ao condomínio: elevador, limpeza, portaria, energia…" />
                ) : (
                    <div className="overflow-x-auto border-t border-[#ECECEF]">
                        <table className="w-full min-w-[760px]">
                            <thead className="border-b border-[#ECECEF]">
                                <tr>
                                    <Th>Fornecedor</Th><Th>CPF/CNPJ</Th><Th>Contato</Th><Th>Pagamento</Th>
                                    <Th className="text-right">Em aberto</Th><Th>Ações</Th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[#ECECEF]">
                                {lista.map(f => {
                                    const principal = f.contas.find(c => c.ativa && c.principal) ?? f.contas.find(c => c.ativa);
                                    const motivo = motivoNaoEditaFornecedor(f, motivoBase);
                                    return (
                                        <tr key={f.id} className="hover:bg-gray-50/70 transition-colors">
                                            <Td className="text-[#1F2430]">
                                                {f.nome}
                                                <span className="block text-[11px] text-gray-400">
                                                    {[f.codigo ? `Cód. ${f.codigo}` : null, f.categoria, f.editavel ? null : 'Disponibilizado por outra organização'].filter(Boolean).join(' · ') || '—'}
                                                </span>
                                            </Td>
                                            <Td className="tabular-nums whitespace-nowrap">{f.documento || '—'}</Td>
                                            <Td>
                                                {(() => {
                                                    // A 1ª informação que houver em destaque; o resto embaixo, sem repetir.
                                                    const [principal, ...resto] = [f.contato, f.email, f.telefone].filter(Boolean);
                                                    if (!principal) return '—';
                                                    return (
                                                        <>
                                                            {principal}
                                                            {resto.length > 0 && <span className="block text-[11px] text-gray-400">{resto.join(' · ')}</span>}
                                                        </>
                                                    );
                                                })()}
                                            </Td>
                                            <Td className="max-w-[260px]">
                                                {principal
                                                    ? <span className="block truncate" title={resumoDaConta(principal)}>{resumoDaConta(principal)}</span>
                                                    : <span className="text-gray-400">Sem conta nem PIX</span>}
                                            </Td>
                                            <Td className="text-right tabular-nums">{f.titulosEmAberto}</Td>
                                            <Td className="whitespace-nowrap">
                                                <Acao motivo={motivo} onClick={() => setEditandoId(f.id)}>Editar</Acao>
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

            {condominioId && (
                <FornecedorDoSindicoSheet
                    open={novo}
                    identidade={identidade}
                    condominioId={condominioId}
                    onClose={() => setNovo(false)}
                    onSalvo={f => {
                        setNovo(false);
                        notify(f.existente ? `"${f.nome}" já estava cadastrado — nada foi duplicado.` : 'Fornecedor cadastrado.');
                        recarregar();
                    }}
                />
            )}
            <EditarFornecedorSheet
                fornecedor={editando}
                identidade={identidade}
                condominioId={condominioId}
                notify={notify}
                onClose={() => setEditandoId(null)}
                onAlterado={recarregar}
            />
        </>
    );
};

// ── Editar: dados do cadastro + contas/PIX ──────────────────────────────────
const dadosDe = (f: FornecedorDoCondominio | null): FornecedorNovo => ({
    name: f?.nome ?? '', document: f?.documento ?? '', email: f?.email ?? '', phone: f?.telefone ?? '',
    contact_name: f?.contato ?? '', category: f?.categoria ?? '',
});

const EditarFornecedorSheet: React.FC<{
    fornecedor: FornecedorDoCondominio | null;
    identidade: IdentidadeDoSindico;
    condominioId: string | null;
    notify: (m: string, t?: 'success' | 'error') => void;
    onClose: () => void;
    onAlterado: () => void;
}> = ({ fornecedor, identidade, condominioId, notify, onClose, onAlterado }) => {
    const confirm = useConfirm();
    const [form, setForm] = React.useState<FornecedorNovo>(dadosDe(null));
    const [salvando, setSalvando] = React.useState(false);
    const [erro, setErro] = React.useState<string | null>(null);
    const [conta, setConta] = React.useState<ContaDoFornecedor | 'nova' | null>(null);
    const aberto = !!fornecedor;
    const idAberto = fornecedor?.id;

    // Reabre com os dados do cadastro; recarregar a lista (conta salva) não apaga o que se digita.
    React.useEffect(() => { if (idAberto) { setForm(dadosDe(fornecedor)); setErro(null); } }, [idAberto]); // eslint-disable-line react-hooks/exhaustive-deps

    const set = <K extends keyof FornecedorNovo>(k: K, v: FornecedorNovo[K]) => setForm(f => ({ ...f, [k]: v }));
    const sujo = aberto && JSON.stringify(form) !== JSON.stringify(dadosDe(fornecedor));
    const motivo = salvando ? 'Gravando…' : !sujo ? 'Nada mudou.'
        : !form.name.trim() ? 'Informe o nome do fornecedor.' : motivoDoDocumento(form.document ?? '');

    const salvar = async () => {
        if (!fornecedor || !condominioId || motivo) return;
        setSalvando(true);
        setErro(null);
        try {
            const r = await sindicoPortalService.editarFornecedor(identidade, condominioId, fornecedor.id, form);
            const titulos = r.titulosAtualizados
                ? ` O nome foi atualizado em ${r.titulosAtualizados} ${r.titulosAtualizados === 1 ? 'título' : 'títulos'}.` : '';
            const ficaram = r.titulosMantidos
                ? ` ${r.titulosMantidos} ${r.titulosMantidos === 1 ? 'ficou' : 'ficaram'} com o nome antigo (rascunho ou mês fechado).` : '';
            notify(`Fornecedor salvo.${titulos}${ficaram}`);
            onAlterado();
            onClose();
        } catch (e) {
            setErro(e instanceof Error ? e.message : 'Não foi possível salvar o fornecedor.');
        } finally {
            setSalvando(false);
        }
    };

    const alternarConta = async (c: ContaDoFornecedor) => {
        if (!fornecedor || !condominioId) return;
        if (c.ativa) {
            const ok = await confirm({
                title: 'Desativar esta conta?',
                message: 'Ela deixa de ser usada para pagar este fornecedor. O que já foi pago nela continua como está — dá para reativar depois.',
                confirmLabel: 'Desativar', variant: 'warning',
            });
            if (!ok) return;
        }
        try {
            await sindicoPortalService.salvarContaFornecedor(identidade, condominioId, fornecedor.id, c.id, {
                ...formDaConta(c), principal: false, ativa: !c.ativa,
            });
            notify(c.ativa ? 'Conta desativada.' : 'Conta reativada.');
            onAlterado();
        } catch (e) {
            notify(e instanceof Error ? e.message : 'Não foi possível salvar a conta.', 'error');
        }
    };

    return (
        <>
            <Sheet open={aberto} onClose={onClose} size="md" dirty={sujo && !salvando}>
                <SheetHeader onClose={onClose}>
                    <SheetTitle>Editar fornecedor</SheetTitle>
                    <SheetDescription>{fornecedor?.codigo ? `Fornecedor ${fornecedor.codigo}` : fornecedor?.nome}</SheetDescription>
                </SheetHeader>
                <SheetPanel className="p-4 md:p-6 space-y-4">
                    <div className="bg-white p-6 rounded-[10px] border border-gray-100 shadow-sm space-y-4">
                        <div className="space-y-1.5">
                            <label className={ROTULO} htmlFor="editar-forn-nome">Nome ou razão social *</label>
                            <input id="editar-forn-nome" className={CAMPO} value={form.name} onChange={e => set('name', e.target.value)} />
                            {fornecedor && form.name.trim() && form.name.trim() !== fornecedor.nome && fornecedor.titulosEmAberto > 0 && (
                                <p className="text-xs text-gray-500">O nome novo também vai para os títulos em aberto deste fornecedor.</p>
                            )}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                            <div className="space-y-1.5">
                                <label className={ROTULO} htmlFor="editar-forn-doc">CPF ou CNPJ</label>
                                <input id="editar-forn-doc" className={CAMPO} value={form.document} inputMode="numeric" onChange={e => set('document', e.target.value)} />
                                {form.document && motivoDoDocumento(form.document) && <p className="text-xs text-red-600">{motivoDoDocumento(form.document)}</p>}
                            </div>
                            <div className="space-y-1.5">
                                <label className={ROTULO} htmlFor="editar-forn-contato">Contato</label>
                                <input id="editar-forn-contato" className={CAMPO} value={form.contact_name} onChange={e => set('contact_name', e.target.value)} />
                            </div>
                            <div className="space-y-1.5">
                                <label className={ROTULO} htmlFor="editar-forn-email">E-mail</label>
                                <input id="editar-forn-email" type="email" className={CAMPO} value={form.email} onChange={e => set('email', e.target.value)} />
                            </div>
                            <div className="space-y-1.5">
                                <label className={ROTULO} htmlFor="editar-forn-tel">Telefone</label>
                                <input id="editar-forn-tel" className={CAMPO} value={form.phone} onChange={e => set('phone', e.target.value)} />
                            </div>
                            <div className="space-y-1.5 sm:col-span-2">
                                <label className={ROTULO} htmlFor="editar-forn-cat">Categoria</label>
                                <input id="editar-forn-cat" className={CAMPO} value={form.category} placeholder="Ex.: Elevadores, Limpeza, Portaria"
                                    onChange={e => set('category', e.target.value)} />
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm">
                        <div className="flex items-center justify-between gap-3 px-6 pt-5 pb-3">
                            <p className="text-[13px] font-semibold text-[#1F2430]">Dados para pagamento</p>
                            <TextLinkButton onClick={() => setConta('nova')}><Plus className="w-4 h-4" /> Conta ou PIX</TextLinkButton>
                        </div>
                        {(fornecedor?.contas.length ?? 0) === 0 ? (
                            <p className="px-6 pb-5 text-sm text-gray-500">Nenhuma conta nem chave PIX cadastrada.</p>
                        ) : (
                            <ul className="divide-y divide-[#ECECEF] border-t border-[#ECECEF]">
                                {fornecedor!.contas.map(c => (
                                    <li key={c.id} className="px-6 py-3 flex flex-wrap items-center justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className={`text-sm ${c.ativa ? 'text-[#1F2430]' : 'text-gray-400'}`}>{resumoDaConta(c)}</p>
                                            <p className="text-[11px] text-gray-400">{c.titular ? `Titular: ${c.titular}` : 'Titular: o próprio fornecedor'}</p>
                                        </div>
                                        <span className="inline-flex items-center gap-3">
                                            {c.principal && c.ativa && <StatusPill tone="good">Principal</StatusPill>}
                                            {!c.ativa && <StatusPill tone="muted">Inativa</StatusPill>}
                                            <TextLinkButton onClick={() => setConta(c)}>Editar</TextLinkButton>
                                            <TextLinkButton onClick={() => alternarConta(c)}>{c.ativa ? 'Desativar' : 'Reativar'}</TextLinkButton>
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </SheetPanel>
                <SheetFooter>
                    <div className="flex items-center justify-end gap-3 w-full">
                        {erro && <p className="mr-auto flex items-center gap-1.5 text-sm text-red-600"><AlertCircle className="w-4 h-4 shrink-0" /> {erro}</p>}
                        <GhostButton onClick={onClose}>Fechar</GhostButton>
                        <span title={motivo ?? undefined}>
                            <PrimaryButton onClick={salvar} disabled={!!motivo} className={motivo ? 'pointer-events-none' : ''}>
                                {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                                Salvar
                            </PrimaryButton>
                        </span>
                    </div>
                </SheetFooter>
            </Sheet>

            <ContaDoFornecedorSheet
                conta={conta}
                fornecedor={fornecedor}
                identidade={identidade}
                condominioId={condominioId}
                onClose={() => setConta(null)}
                onSalvo={m => { setConta(null); notify(m); onAlterado(); }}
            />
        </>
    );
};

// ── Conta / PIX do fornecedor ───────────────────────────────────────────────
const formDaConta = (c: ContaDoFornecedor | null): FormContaDoFornecedor => ({
    pix: c?.pix ?? '', tipoPix: c?.tipoPix ?? 'cnpj', banco: c?.banco ?? '', agencia: c?.agencia ?? '', conta: c?.conta ?? '',
    tipoConta: c?.tipoConta ?? 'corrente', titular: c?.titular ?? '', documentoTitular: c?.documentoTitular ?? '',
    principal: c?.principal ?? false,
});

const ContaDoFornecedorSheet: React.FC<{
    conta: ContaDoFornecedor | 'nova' | null;
    fornecedor: FornecedorDoCondominio | null;
    identidade: IdentidadeDoSindico;
    condominioId: string | null;
    onClose: () => void;
    onSalvo: (m: string) => void;
}> = ({ conta, fornecedor, identidade, condominioId, onClose, onSalvo }) => {
    const atual = conta && conta !== 'nova' ? conta : null;
    const [form, setForm] = React.useState<FormContaDoFornecedor>(formDaConta(null));
    const [salvando, setSalvando] = React.useState(false);
    const [erro, setErro] = React.useState<string | null>(null);

    React.useEffect(() => { if (conta) { setForm(formDaConta(atual)); setErro(null); } }, [conta]); // eslint-disable-line react-hooks/exhaustive-deps

    const set = <K extends keyof FormContaDoFornecedor>(k: K, v: FormContaDoFornecedor[K]) => setForm(f => ({ ...f, [k]: v }));
    const sujo = !!conta && JSON.stringify(form) !== JSON.stringify(formDaConta(atual));
    const motivo = salvando ? 'Gravando…' : !sujo ? 'Nada mudou.' : motivoDaConta(form);

    const salvar = async () => {
        if (!fornecedor || !condominioId || motivo) return;
        setSalvando(true);
        setErro(null);
        try {
            await sindicoPortalService.salvarContaFornecedor(identidade, condominioId, fornecedor.id, atual?.id ?? null, { ...form, ativa: atual?.ativa ?? true });
            onSalvo(atual ? 'Conta salva.' : 'Conta cadastrada.');
        } catch (e) {
            setErro(e instanceof Error ? e.message : 'Não foi possível salvar a conta.');
        } finally {
            setSalvando(false);
        }
    };

    return (
        <Sheet open={!!conta} onClose={onClose} size="md" dirty={sujo && !salvando} zIndex={60}>
            <SheetHeader onClose={onClose}>
                <SheetTitle>{atual ? 'Editar conta' : 'Nova conta ou PIX'}</SheetTitle>
                <SheetDescription>{fornecedor?.nome}</SheetDescription>
            </SheetHeader>
            <SheetPanel className="p-4 md:p-6">
                <div className="bg-white p-6 rounded-[10px] border border-gray-100 shadow-sm space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                        <div className="space-y-1.5">
                            <label className={ROTULO} htmlFor="conta-forn-pix-tipo">Tipo de chave PIX</label>
                            <select id="conta-forn-pix-tipo" className={CAMPO} value={form.tipoPix} onChange={e => set('tipoPix', e.target.value as FormContaDoFornecedor['tipoPix'])}>
                                {TIPOS_PIX.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <label className={ROTULO} htmlFor="conta-forn-pix">Chave PIX</label>
                            <input id="conta-forn-pix" className={CAMPO} value={form.pix} onChange={e => set('pix', e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                            <label className={ROTULO} htmlFor="conta-forn-banco">Banco</label>
                            <input id="conta-forn-banco" className={CAMPO} value={form.banco} onChange={e => set('banco', e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                            <label className={ROTULO} htmlFor="conta-forn-tipo">Tipo de conta</label>
                            <select id="conta-forn-tipo" className={CAMPO} value={form.tipoConta} onChange={e => set('tipoConta', e.target.value as FormContaDoFornecedor['tipoConta'])}>
                                <option value="corrente">Corrente</option><option value="poupanca">Poupança</option><option value="pagamento">Pagamento</option>
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <label className={ROTULO} htmlFor="conta-forn-ag">Agência</label>
                            <input id="conta-forn-ag" className={CAMPO} value={form.agencia} onChange={e => set('agencia', e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                            <label className={ROTULO} htmlFor="conta-forn-conta">Conta</label>
                            <input id="conta-forn-conta" className={CAMPO} value={form.conta} onChange={e => set('conta', e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                            <label className={ROTULO} htmlFor="conta-forn-titular">Titular</label>
                            <input id="conta-forn-titular" className={CAMPO} value={form.titular} placeholder={fornecedor?.nome ?? ''} onChange={e => set('titular', e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                            <label className={ROTULO} htmlFor="conta-forn-titular-doc">CPF/CNPJ do titular</label>
                            <input id="conta-forn-titular-doc" className={CAMPO} value={form.documentoTitular} inputMode="numeric"
                                placeholder={fornecedor?.documento ?? ''} onChange={e => set('documentoTitular', e.target.value)} />
                        </div>
                    </div>
                    <label className="flex items-center gap-2 text-sm text-[#1F2430]">
                        <input type="checkbox" checked={form.principal} onChange={e => set('principal', e.target.checked)} className="accent-[#E1553C]" />
                        Usar esta conta como principal
                    </label>
                </div>
            </SheetPanel>
            <SheetFooter>
                <div className="flex items-center justify-end gap-3 w-full">
                    {erro && <p className="mr-auto flex items-center gap-1.5 text-sm text-red-600"><AlertCircle className="w-4 h-4 shrink-0" /> {erro}</p>}
                    <GhostButton onClick={onClose}>Cancelar</GhostButton>
                    <span title={motivo ?? undefined}>
                        <PrimaryButton onClick={salvar} disabled={!!motivo} className={motivo ? 'pointer-events-none' : ''}>
                            {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                            Salvar
                        </PrimaryButton>
                    </span>
                </div>
            </SheetFooter>
        </Sheet>
    );
};

export default PainelFornecedoresDoSindico;
