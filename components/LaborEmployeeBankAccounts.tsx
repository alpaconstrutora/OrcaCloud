import React, { useState } from 'react';
import { Building2, ChevronDown, Plus } from 'lucide-react';
import StandardTable, { type StandardTableColumn } from './ui/StandardTable';
import ActionIconButton from './ui/ActionIconButton';
import { useConfirm } from './ui/confirm';
import {
    ACCOUNT_TYPE_LABELS, PIX_KEY_TYPE_LABELS, EmployeeBankAccount, EmployeeBankAccountType, EmployeePixKeyType,
    describeBankAccount, emptyBankAccount, isBlankBankAccount, setPrimaryBankAccount,
} from '../utils/employeeBankAccounts';

/** Conta na lista da tela — `_key` identifica a linha antes de ela ter `id`. */
export type EmployeeBankAccountDraft = EmployeeBankAccount & { _key: string };

export const toDraft = (a: EmployeeBankAccount): EmployeeBankAccountDraft => ({ ...a, _key: a.id ?? crypto.randomUUID() });

interface Props {
    accounts: EmployeeBankAccountDraft[];
    onChange: (next: EmployeeBankAccountDraft[]) => void;
    loading?: boolean;
    /** Modal estreito de criação: `px-3` nas células (§6.9). */
    dense?: boolean;
    inputCls: string;
}

// "Principal" primeiro: é a decisão que a aba existe para tomar.
const COLUMNS: StandardTableColumn[] = [
    { key: 'principal', label: 'Principal', sortable: true, width: 150 },
    { key: 'banco', label: 'Banco', sortable: true, width: 200 },
    { key: 'conta', label: 'Agência / conta', sortable: true, width: 190 },
    { key: 'tipo', label: 'Tipo', sortable: true, width: 160 },
    { key: 'pix', label: 'PIX', sortable: true, width: 220 },
    { key: 'titular', label: 'Titular', sortable: true, width: 180 },
];

const Field: React.FC<{ label: string; children: React.ReactNode; className?: string }> = ({ label, children, className = '' }) => (
    <div className={`space-y-1.5 ${className}`}>
        <label className="text-xs font-semibold text-slate-500">{label}</label>
        {children}
    </div>
);

/**
 * Aba Dados Bancários do colaborador — várias contas, uma principal.
 *
 * A lista vive no estado do formulário e é gravada no "Salvar Alterações" do
 * próprio formulário (mesmo dirty-tracking das outras abas, §25), pela RPC
 * atômica `save_employee_bank_accounts`. Por isso "Adicionar"/"Atualizar" aqui
 * só mexem na lista da tela.
 */
const LaborEmployeeBankAccounts: React.FC<Props> = ({ accounts, onChange, loading, dense, inputCls }) => {
    const confirm = useConfirm();
    // Linha em edição: `_key` de uma conta existente, 'nova' para incluir, null = fechado.
    const [editingKey, setEditingKey] = useState<string | null>(null);
    const [draft, setDraft] = useState<EmployeeBankAccount>(emptyBankAccount());

    const abrirNova = () => { setDraft(emptyBankAccount()); setEditingKey('nova'); };
    const abrirEdicao = (a: EmployeeBankAccountDraft) => { setDraft({ ...a }); setEditingKey(a._key); };
    const fechar = () => { setEditingKey(null); setDraft(emptyBankAccount()); };
    const set = <K extends keyof EmployeeBankAccount>(k: K, v: EmployeeBankAccount[K]) => setDraft(prev => ({ ...prev, [k]: v }));

    const aplicar = () => {
        if (isBlankBankAccount(draft)) return;
        if (editingKey === 'nova') {
            // A primeira conta já nasce principal; as demais não roubam a principal.
            const nova: EmployeeBankAccountDraft = { ...draft, is_primary: accounts.length === 0, _key: crypto.randomUUID() };
            onChange([...accounts, nova]);
        } else {
            onChange(accounts.map(a => (a._key === editingKey ? { ...a, ...draft, is_primary: a.is_primary } : a)));
        }
        fechar();
    };

    const tornarPrincipal = (key: string) => {
        onChange(setPrimaryBankAccount(accounts, accounts.findIndex(a => a._key === key)));
    };

    const excluir = async (a: EmployeeBankAccountDraft) => {
        const ok = await confirm({
            title: 'Excluir conta bancária?',
            message: `${describeBankAccount(a)} sai da lista${a.is_primary && accounts.length > 1 ? '; a próxima conta vira a principal' : ''}. A exclusão vale ao salvar o colaborador.`,
            variant: 'danger',
            confirmLabel: 'Excluir',
        });
        if (!ok) return;
        const resto = accounts.filter(x => x._key !== a._key);
        // Excluiu a principal: a primeira que sobrou assume — nunca fica sem principal.
        onChange(a.is_primary && resto.length > 0 ? setPrimaryBankAccount(resto, 0) : resto);
        if (editingKey === a._key) fechar();
    };

    const blank = isBlankBankAccount(draft);

    return (
        <div className="space-y-4">
            <StandardTable<EmployeeBankAccountDraft>
                storageKey="rh:colaborador:contasBancarias"
                columns={COLUMNS}
                rows={accounts}
                rowKey={a => a._key}
                dense={dense}
                loading={loading}
                maxHeight="40vh"
                // Sem busca: a lista é de poucas contas de UM colaborador.
                sortValue={(key, a) => {
                    switch (key) {
                        case 'principal': return a.is_primary ? 1 : 0;
                        case 'banco': return `${a.bank_code ?? ''} ${a.bank_name ?? ''}`;
                        case 'conta': return `${a.agency ?? ''} ${a.account ?? ''}`;
                        case 'tipo': return ACCOUNT_TYPE_LABELS[a.account_type];
                        case 'pix': return a.pix_key ?? '';
                        default: return a.holder_name ?? '';
                    }
                }}
                renderCell={(key, a) => {
                    switch (key) {
                        case 'principal':
                            return a.is_primary
                                ? <span className="text-sm font-normal text-emerald-700">Principal</span>
                                : (
                                    <button
                                        type="button"
                                        onClick={() => tornarPrincipal(a._key)}
                                        className="text-sm font-normal text-blue-600 hover:text-blue-800 whitespace-nowrap transition-colors"
                                    >
                                        Tornar principal
                                    </button>
                                );
                        case 'banco': {
                            const v = [a.bank_code, a.bank_name].filter(x => (x ?? '').trim()).join(' · ');
                            return <span className="block truncate text-sm font-normal text-gray-700" title={v}>{v || '—'}</span>;
                        }
                        case 'conta': {
                            const v = [a.agency?.trim() ? `Ag ${a.agency}` : '', a.account?.trim() ? `Conta ${a.account}` : ''].filter(Boolean).join(' · ');
                            return <span className="text-sm font-normal text-gray-600">{v || '—'}</span>;
                        }
                        case 'tipo': return <span className="text-sm font-normal text-gray-600">{ACCOUNT_TYPE_LABELS[a.account_type]}</span>;
                        case 'pix': {
                            const v = a.pix_key?.trim()
                                ? `${a.pix_key_type ? `${PIX_KEY_TYPE_LABELS[a.pix_key_type]}: ` : ''}${a.pix_key}`
                                : '';
                            return <span className="block truncate text-sm font-normal text-gray-700" title={v}>{v || '—'}</span>;
                        }
                        default:
                            return <span className="block truncate text-sm font-normal text-gray-700" title={a.holder_name ?? ''}>{a.holder_name || '—'}</span>;
                    }
                }}
                actions={{
                    width: 100,
                    render: a => (
                        <div className="flex items-center justify-end gap-1.5">
                            <ActionIconButton kind="edit" onClick={() => abrirEdicao(a)} />
                            <ActionIconButton kind="delete" onClick={() => void excluir(a)} />
                        </div>
                    ),
                }}
                toolbarRight={
                    <button
                        type="button"
                        onClick={abrirNova}
                        className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 shrink-0"
                    >
                        <Plus className="w-[15px] h-[15px]" />
                        Adicionar conta
                    </button>
                }
                empty={{
                    icon: <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-4" />,
                    title: 'Nenhuma conta cadastrada',
                    subtitle: 'Use "Adicionar conta". A primeira conta vira a principal.',
                }}
            />

            {editingKey && (
                <div className="bg-gray-50 border border-gray-200 rounded-[10px] p-4 space-y-4">
                    <h4 className="text-sm font-semibold text-gray-900">
                        {editingKey === 'nova' ? 'Nova conta bancária' : 'Editar conta bancária'}
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-4">
                        <Field label="Código do banco">
                            <input value={draft.bank_code ?? ''} onChange={e => set('bank_code', e.target.value)} className={inputCls} placeholder="Ex: 001, 341" />
                        </Field>
                        <Field label="Nome do banco" className="md:col-span-2">
                            <input value={draft.bank_name ?? ''} onChange={e => set('bank_name', e.target.value)} className={inputCls} placeholder="Ex: Banco do Brasil" />
                        </Field>
                        <Field label="Agência">
                            <input value={draft.agency ?? ''} onChange={e => set('agency', e.target.value)} className={inputCls} placeholder="0000-0" />
                        </Field>
                        <Field label="Número da conta">
                            <input value={draft.account ?? ''} onChange={e => set('account', e.target.value)} className={inputCls} placeholder="00000000-0" />
                        </Field>
                        <Field label="Tipo de conta">
                            <div className="relative">
                                <select value={draft.account_type} onChange={e => set('account_type', e.target.value as EmployeeBankAccountType)} className={inputCls + ' appearance-none pr-8'}>
                                    {(Object.keys(ACCOUNT_TYPE_LABELS) as EmployeeBankAccountType[]).map(t => (
                                        <option key={t} value={t}>{ACCOUNT_TYPE_LABELS[t]}</option>
                                    ))}
                                </select>
                                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                            </div>
                        </Field>
                        <Field label="Tipo da chave PIX">
                            <div className="relative">
                                <select value={draft.pix_key_type ?? ''} onChange={e => set('pix_key_type', (e.target.value || null) as EmployeePixKeyType | null)} className={inputCls + ' appearance-none pr-8'}>
                                    <option value="">Sem PIX / não informado</option>
                                    {(Object.keys(PIX_KEY_TYPE_LABELS) as EmployeePixKeyType[]).map(t => (
                                        <option key={t} value={t}>{PIX_KEY_TYPE_LABELS[t]}</option>
                                    ))}
                                </select>
                                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                            </div>
                        </Field>
                        <Field label="Chave PIX" className="md:col-span-2">
                            <input value={draft.pix_key ?? ''} onChange={e => set('pix_key', e.target.value)} className={inputCls} placeholder="CPF, e-mail, telefone ou chave aleatória" />
                        </Field>
                        <Field label="Titular (se não for o colaborador)" className="md:col-span-3">
                            <input value={draft.holder_name ?? ''} onChange={e => set('holder_name', e.target.value)} className={inputCls} placeholder="Deixe em branco quando a conta é do próprio colaborador" />
                        </Field>
                    </div>
                    <div className="flex items-center justify-end gap-2">
                        <span className="text-xs text-gray-500 mr-auto">A lista é gravada ao salvar o colaborador.</span>
                        <button type="button" onClick={fechar} className="h-9 px-3.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-[6px] transition-all">
                            Cancelar
                        </button>
                        <button
                            type="button"
                            onClick={aplicar}
                            disabled={blank}
                            title={blank ? 'Preencha banco, agência, conta ou chave PIX' : undefined}
                            className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {editingKey === 'nova' ? 'Adicionar à lista' : 'Atualizar conta'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default LaborEmployeeBankAccounts;
