/**
 * Remetente monitorado ("favorito") da captura de boletos por e-mail.
 *
 * Plano: docs/planos/2026-10-15-captura-boletos-por-email.md (item 4.4).
 * Favorito NÃO torna o boleto confiável: a importação automática ainda exige
 * DMARC, linha digitável válida, vencimento e o beneficiário ser o fornecedor
 * cadastrado (utils/emailCaptureRegras.ts). O texto da tela diz isso.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, ShieldCheck } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import SupplierSelect, { type SupplierOption } from '../SupplierSelect';
import {
    emailCaptureService,
    type ContaCaptura,
    type RemetenteCaptura,
    type RemetenteRascunho,
} from '../../services/emailCaptureService';

export type FornecedorDaOrg = SupplierOption & { organization_id: string | null };

const ROTULO = 'text-xs font-semibold text-slate-500';
const CAMPO = 'w-full px-3 h-9 bg-gray-50 border border-gray-100 rounded-[6px] text-sm text-gray-900 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all disabled:opacity-60';

interface Props {
    open: boolean;
    onClose: () => void;
    contas: ContaCaptura[];
    /** Fornecedores com a org de cada um — o campo só oferece os da org da caixa. */
    fornecedores: FornecedorDaOrg[];
    remetente?: RemetenteCaptura | null;
    /** "Adicionar aos favoritos" pela revisão do boleto: já vem com e-mail, caixa e fornecedor. */
    prefill?: Partial<RemetenteRascunho> | null;
    onSalvo: (r: RemetenteCaptura) => void;
}

function vazio(contas: ContaCaptura[], prefill?: Partial<RemetenteRascunho> | null): RemetenteRascunho {
    const conta = contas.find(c => c.id === prefill?.account_id) ?? contas[0];
    return {
        organization_id: conta?.organization_id ?? '',
        account_id: conta?.id ?? '',
        supplier_id: null,
        nome: null,
        tipo: 'exato',
        email: null,
        dominio: null,
        palavras_chave: [],
        importacao: 'revisao',
        exigir_dmarc: true,
        ativo: true,
        ...prefill,
    };
}

const EmailCaptureSenderSheet: React.FC<Props> = ({ open, onClose, contas, fornecedores, remetente, prefill, onSalvo }) => {
    const [form, setForm] = useState<RemetenteRascunho>(() => vazio(contas, prefill));
    const [palavras, setPalavras] = useState('');
    const [dirty, setDirty] = useState(false);
    const [salvando, setSalvando] = useState(false);
    const [erro, setErro] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        const base = remetente ? { ...remetente } : vazio(contas, prefill);
        setForm(base);
        setPalavras((base.palavras_chave ?? []).join(', '));
        setDirty(false);
        setErro(null);
    }, [open, remetente, prefill, contas]);

    const set = <K extends keyof RemetenteRascunho>(k: K, v: RemetenteRascunho[K]) => {
        setForm(f => ({ ...f, [k]: v }));
        setDirty(true);
    };

    const conta = contas.find(c => c.id === form.account_id) ?? null;
    // Fornecedor tem de ser da organização da caixa (o banco também confere).
    const fornecedoresDaOrg = useMemo(
        () => (conta ? fornecedores.filter(f => f.organization_id === conta.organization_id) : []),
        [fornecedores, conta],
    );

    const alvo = form.tipo === 'exato' ? (form.email ?? '').trim() : (form.dominio ?? '').trim();
    const motivoDesligado: string | null = salvando
        ? 'Salvando…'
        : !conta
            ? 'Conecte uma caixa de e-mail antes de cadastrar remetentes.'
            : form.tipo === 'exato' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(alvo)
                ? 'Informe o e-mail do remetente.'
                : form.tipo === 'dominio' && !/^@?[^\s@]+\.[^\s@]+$/.test(alvo)
                    ? 'Informe o domínio (ex.: fornecedor.com.br).'
                    : null;

    async function salvar() {
        if (motivoDesligado || !conta) return;
        setSalvando(true);
        setErro(null);
        try {
            const salvo = await emailCaptureService.salvarRemetente(remetente?.id ?? null, {
                ...form,
                organization_id: conta.organization_id,
                palavras_chave: palavras.split(',').map(p => p.trim()).filter(Boolean),
            });
            setDirty(false);
            onSalvo(salvo);
            onClose();
        } catch (e) {
            setErro(e instanceof Error ? e.message : String(e));
        } finally {
            setSalvando(false);
        }
    }

    if (!open) return null;

    return (
        <Sheet open={open} onClose={onClose} size="md" dirty={dirty && !salvando}>
            <SheetHeader onClose={onClose}>
                <SheetTitle>{remetente ? 'Editar remetente monitorado' : 'Novo remetente monitorado'}</SheetTitle>
                <SheetDescription>Mensagens deste remetente são priorizadas na captura de boletos.</SheetDescription>
            </SheetHeader>

            <SheetPanel className="px-6 py-5 space-y-8">
                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                        <div className="space-y-1.5 col-span-2">
                            <label className={ROTULO} htmlFor="erem-nome">Nome</label>
                            <input id="erem-nome" value={form.nome ?? ''} onChange={e => set('nome', e.target.value || null)}
                                placeholder="Ex.: Cobrança Energisa" className={CAMPO} />
                        </div>
                        <div className="space-y-1.5">
                            <label className={ROTULO} htmlFor="erem-tipo">Monitorar por</label>
                            <select id="erem-tipo" value={form.tipo} onChange={e => set('tipo', e.target.value as 'exato' | 'dominio')} className={CAMPO}>
                                <option value="exato">Endereço exato</option>
                                <option value="dominio">Domínio inteiro</option>
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <label className={ROTULO} htmlFor="erem-conta">Caixa monitorada</label>
                            <select id="erem-conta" value={form.account_id} onChange={e => set('account_id', e.target.value)} className={CAMPO}>
                                {contas.map(c => <option key={c.id} value={c.id}>{c.usuario}</option>)}
                            </select>
                        </div>
                        <div className="space-y-1.5 col-span-2">
                            <label className={ROTULO} htmlFor="erem-alvo">{form.tipo === 'exato' ? 'E-mail' : 'Domínio'}</label>
                            <input id="erem-alvo" value={(form.tipo === 'exato' ? form.email : form.dominio) ?? ''}
                                onChange={e => set(form.tipo === 'exato' ? 'email' : 'dominio', e.target.value || null)}
                                placeholder={form.tipo === 'exato' ? 'cobranca@fornecedor.com.br' : 'fornecedor.com.br'} className={CAMPO} />
                        </div>
                        {form.tipo === 'dominio' && (
                            <p className="col-span-2 text-xs text-amber-700">
                                Domínio inteiro casa qualquer endereço dele, inclusive caixas que o fornecedor não usa para cobrança — confiança menor que um endereço exato.
                            </p>
                        )}
                        <div className="space-y-1.5 col-span-2">
                            <label className={ROTULO}>Fornecedor</label>
                            <SupplierSelect suppliers={fornecedoresDaOrg} value={form.supplier_id ?? ''}
                                onChange={id => set('supplier_id', id || null)} size="sm" placeholder="Sem vínculo" />
                        </div>
                        <div className="space-y-1.5 col-span-2">
                            <label className={ROTULO} htmlFor="erem-palavras">Palavras-chave (opcional)</label>
                            <input id="erem-palavras" value={palavras} onChange={e => { setPalavras(e.target.value); setDirty(true); }}
                                placeholder="boleto, fatura, cobrança" className={CAMPO} />
                            <p className="text-xs text-gray-500">Separadas por vírgula. Com palavras, só casa mensagem cujo assunto ou nome do anexo tenha uma delas.</p>
                        </div>
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
                        <ShieldCheck className="w-4 h-4 text-blue-600" />
                        <h3 className="text-sm font-semibold text-gray-900">Importação</h3>
                    </div>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                        <div className="space-y-1.5">
                            <label className={ROTULO} htmlFor="erem-imp">Boleto deste remetente</label>
                            <select id="erem-imp" value={form.importacao} onChange={e => set('importacao', e.target.value as 'automatica' | 'revisao')} className={CAMPO}>
                                <option value="revisao">Sempre revisar</option>
                                <option value="automatica">Rascunho automático</option>
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <label className={ROTULO} htmlFor="erem-ativo">Situação</label>
                            <select id="erem-ativo" value={form.ativo ? 'sim' : 'nao'} onChange={e => set('ativo', e.target.value === 'sim')} className={CAMPO}>
                                <option value="sim">Ativo</option>
                                <option value="nao">Inativo</option>
                            </select>
                        </div>
                        <label className="col-span-2 flex items-start gap-2 text-sm text-gray-700">
                            <input type="checkbox" checked={form.exigir_dmarc} onChange={e => set('exigir_dmarc', e.target.checked)}
                                className="mt-0.5 w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                            <span>Exigir autenticação do e-mail (DMARC) — sem ela, o boleto vai para revisão.</span>
                        </label>
                    </div>
                    {form.importacao === 'automatica' && (
                        <p className="text-xs text-gray-500">
                            Mesmo assim o boleto só sai da revisão se a linha digitável for válida, tiver vencimento e o beneficiário for o fornecedor cadastrado na organização.
                            {conta?.modo_piloto ? ' Esta caixa está em modo piloto: por enquanto tudo vai para revisão.' : ''}
                            {' '}Só gestores da organização podem gravar esta opção.
                        </p>
                    )}
                </div>

                {erro && <p className="rounded-[10px] border border-red-100 bg-red-50 px-3 py-2.5 text-sm text-red-700">{erro}</p>}
            </SheetPanel>

            <SheetFooter>
                <button onClick={onClose} disabled={salvando} className="h-9 px-3.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-[6px] disabled:opacity-50">
                    Cancelar
                </button>
                <button onClick={salvar} disabled={!!motivoDesligado} title={motivoDesligado ?? undefined}
                    className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed">
                    {salvando && <Loader2 className="w-4 h-4 animate-spin" />}
                    Salvar remetente
                </button>
            </SheetFooter>
        </Sheet>
    );
};

export default EmailCaptureSenderSheet;
