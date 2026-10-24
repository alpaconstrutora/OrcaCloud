import React from 'react';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import { GhostButton, PrimaryButton } from '../portal/PortalKit';
import { sindicoPortalService, type FornecedorNovo, type IdentidadeDoSindico } from '../../services/sindicoPortalService';

/**
 * Portal do Síndico › Financeiro — cadastrar fornecedor do condomínio.
 * Plano: docs/planos/2026-10-24-portal-sindico-financeiro.md
 *
 * Nasce na organização do condomínio. CPF/CNPJ que já existe em qualquer
 * organização NÃO duplica: o banco (`sindico_portal_salvar_fornecedor`) passa o
 * cadastro existente a valer também no condomínio e devolve o nome dele — a
 * tela diz isso em vez de fingir que criou um novo.
 *
 * Abre por cima do lançamento (zIndex 60 sobre o 50 do Sheet; o confirm é 200).
 */

const ROTULO = 'text-xs font-semibold text-slate-500';
const CAMPO = 'w-full h-10 px-3 bg-white border border-gray-200 rounded-[6px] text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#E1553C]/20 focus:border-[#E1553C]';

const TIPOS_PIX: { value: NonNullable<FornecedorNovo['pix_key_type']>; label: string }[] = [
    { value: 'cnpj', label: 'CNPJ' }, { value: 'cpf', label: 'CPF' }, { value: 'email', label: 'E-mail' },
    { value: 'telefone', label: 'Telefone' }, { value: 'aleatoria', label: 'Aleatória' },
];

/** CPF tem 11 dígitos, CNPJ 14; vazio vale (o cadastro aceita sem documento). */
export function motivoDoDocumento(doc: string): string | null {
    const d = doc.replace(/\D/g, '');
    if (!d) return null;
    return d.length === 11 || d.length === 14 ? null : 'CPF tem 11 dígitos e CNPJ tem 14.';
}

const VAZIO: FornecedorNovo = { name: '', document: '', email: '', phone: '', contact_name: '', pix_key: '', pix_key_type: 'cnpj', bank_name: '', agency: '', account: '' };

interface Props {
    open: boolean;
    identidade: IdentidadeDoSindico;
    condominioId: string;
    onClose: () => void;
    /** `existente` = o documento já tinha cadastro, que passou a valer no condomínio. */
    onSalvo: (f: { id: string; nome: string; document?: string; existente: boolean }) => void;
}

const FornecedorDoSindicoSheet: React.FC<Props> = ({ open, identidade, condominioId, onClose, onSalvo }) => {
    const [form, setForm] = React.useState<FornecedorNovo>(VAZIO);
    const [salvando, setSalvando] = React.useState(false);
    const [erro, setErro] = React.useState<string | null>(null);

    React.useEffect(() => { if (open) { setForm(VAZIO); setErro(null); } }, [open]);

    const set = <K extends keyof FornecedorNovo>(k: K, v: FornecedorNovo[K]) => setForm(f => ({ ...f, [k]: v }));
    const sujo = JSON.stringify(form) !== JSON.stringify(VAZIO);
    const motivo = !form.name.trim() ? 'Informe o nome do fornecedor.' : motivoDoDocumento(form.document ?? '');

    const salvar = async () => {
        if (motivo || salvando) return;
        setSalvando(true);
        setErro(null);
        try {
            const r = await sindicoPortalService.salvarFornecedor(identidade, condominioId, {
                ...form,
                // Sem chave PIX, o tipo não tem por que ir.
                pix_key_type: form.pix_key?.trim() ? form.pix_key_type : undefined,
            });
            onSalvo({ id: r.id, nome: r.nome, document: form.document, existente: r.existente });
        } catch (e) {
            setErro(e instanceof Error ? e.message : 'Não foi possível cadastrar o fornecedor.');
        } finally {
            setSalvando(false);
        }
    };

    return (
        <Sheet open={open} onClose={onClose} size="md" dirty={sujo && !salvando} zIndex={60}>
            <SheetHeader onClose={onClose}>
                <SheetTitle>Cadastrar fornecedor</SheetTitle>
                <SheetDescription>Fica disponível para as contas deste condomínio</SheetDescription>
            </SheetHeader>
            <SheetPanel className="p-4 md:p-6">
                <div className="bg-white p-6 rounded-[10px] border border-gray-100 shadow-sm space-y-4">
                    <div className="space-y-1.5">
                        <label className={ROTULO} htmlFor="forn-nome">Nome ou razão social *</label>
                        <input id="forn-nome" className={CAMPO} value={form.name} onChange={e => set('name', e.target.value)} placeholder="Ex.: Elevadores Andrade Ltda" />
                    </div>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                        <div className="space-y-1.5">
                            <label className={ROTULO} htmlFor="forn-doc">CPF ou CNPJ</label>
                            <input id="forn-doc" className={CAMPO} value={form.document} onChange={e => set('document', e.target.value)} inputMode="numeric" placeholder="Só números ou com pontuação" />
                            {form.document && motivoDoDocumento(form.document) && <p className="text-xs text-red-600">{motivoDoDocumento(form.document)}</p>}
                        </div>
                        <div className="space-y-1.5">
                            <label className={ROTULO} htmlFor="forn-contato">Contato</label>
                            <input id="forn-contato" className={CAMPO} value={form.contact_name} onChange={e => set('contact_name', e.target.value)} placeholder="Nome de quem atende" />
                        </div>
                        <div className="space-y-1.5">
                            <label className={ROTULO} htmlFor="forn-email">E-mail</label>
                            <input id="forn-email" type="email" className={CAMPO} value={form.email} onChange={e => set('email', e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                            <label className={ROTULO} htmlFor="forn-tel">Telefone</label>
                            <input id="forn-tel" className={CAMPO} value={form.phone} onChange={e => set('phone', e.target.value)} />
                        </div>
                    </div>
                    <p className="pt-2 text-[13px] font-semibold text-[#1F2430]">Dados para pagamento</p>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                        <div className="space-y-1.5">
                            <label className={ROTULO} htmlFor="forn-pix-tipo">Tipo de chave PIX</label>
                            <select id="forn-pix-tipo" className={CAMPO} value={form.pix_key_type}
                                onChange={e => set('pix_key_type', e.target.value as FornecedorNovo['pix_key_type'])}>
                                {TIPOS_PIX.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <label className={ROTULO} htmlFor="forn-pix">Chave PIX</label>
                            <input id="forn-pix" className={CAMPO} value={form.pix_key} onChange={e => set('pix_key', e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                            <label className={ROTULO} htmlFor="forn-banco">Banco</label>
                            <input id="forn-banco" className={CAMPO} value={form.bank_name} onChange={e => set('bank_name', e.target.value)} />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <label className={ROTULO} htmlFor="forn-ag">Agência</label>
                                <input id="forn-ag" className={CAMPO} value={form.agency} onChange={e => set('agency', e.target.value)} />
                            </div>
                            <div className="space-y-1.5">
                                <label className={ROTULO} htmlFor="forn-conta">Conta</label>
                                <input id="forn-conta" className={CAMPO} value={form.account} onChange={e => set('account', e.target.value)} />
                            </div>
                        </div>
                    </div>
                </div>
            </SheetPanel>
            <SheetFooter>
                <div className="flex items-center justify-end gap-3 w-full">
                    {erro && <p className="mr-auto flex items-center gap-1.5 text-sm text-red-600"><AlertCircle className="w-4 h-4 shrink-0" /> {erro}</p>}
                    <GhostButton onClick={onClose}>Cancelar</GhostButton>
                    <PrimaryButton onClick={salvar} disabled={!!motivo || salvando} title={motivo ?? (salvando ? 'Gravando…' : undefined)}>
                        {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                        Cadastrar
                    </PrimaryButton>
                </div>
            </SheetFooter>
        </Sheet>
    );
};

export default FornecedorDoSindicoSheet;
