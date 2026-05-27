import React from 'react';
import {
    Plus, Pencil, Trash2, Star, X, Building, CreditCard,
    Smartphone, CheckCircle2, AlertCircle, ChevronDown, ChevronUp
} from 'lucide-react';
import {
    SupplierBankAccount, AccountType, PixKeyType,
    BANCOS_BR, ACCOUNT_TYPE_LABELS, PIX_KEY_TYPE_LABELS
} from '../types';
import { supplierBankAccountService } from '../services/supplierBankAccountService';
import { useStore } from '../store/useStore';

// ─── Estilos reutilizáveis (consistentes com SupplierModal) ───────────────────
const inputCls = 'w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm font-medium text-gray-900 placeholder-gray-300 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all bg-white';
const labelCls = 'block text-[10px] font-black text-gray-400 uppercase tracking-wider mb-1';

// ─── Estado inicial do formulário ─────────────────────────────────────────────
const emptyAccount = (supplierId: string, organizationId: string | null): Omit<SupplierBankAccount, 'id' | 'created_at' | 'updated_at'> => ({
    supplier_id: supplierId,
    organization_id: organizationId,
    bank_code: '',
    bank_name: '',
    agency: '',
    agency_digit: '',
    account: '',
    account_digit: '',
    account_type: 'corrente',
    beneficiary_name: '',
    beneficiary_document: '',
    pix_key: '',
    pix_key_type: undefined,
    is_pix_primary: false,
    is_primary: false,
    status: 'ativo',
    notes: '',
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
function maskDoc(value: string): string {
    const d = value.replace(/\D/g, '');
    if (d.length <= 11) {
        return d.replace(/^(\d{3})(\d)/, '$1.$2')
                .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
                .replace(/\.(\d{3})(\d)/, '.$1-$2');
    }
    return d.slice(0, 14)
            .replace(/^(\d{2})(\d)/, '$1.$2')
            .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
            .replace(/\.(\d{3})(\d)/, '.$1/$2')
            .replace(/(\d{4})(\d)/, '$1-$2');
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface SupplierBankAccountsTabProps {
    supplierId: string;
    organizationId?: string | null;
}

// ─── Componente principal ─────────────────────────────────────────────────────
const SupplierBankAccountsTab: React.FC<SupplierBankAccountsTabProps> = ({
    supplierId,
    organizationId,
}) => {
    const { session } = useStore();
    const userId = session?.user?.id;

    const [accounts, setAccounts] = React.useState<SupplierBankAccount[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [showForm, setShowForm] = React.useState(false);
    const [editingId, setEditingId] = React.useState<string | null>(null);
    const [saving, setSaving] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [showInactive, setShowInactive] = React.useState(false);

    const [form, setForm] = React.useState(emptyAccount(supplierId, organizationId ?? null));
    const set = (patch: Partial<typeof form>) => setForm(f => ({ ...f, ...patch }));

    // ─── Carregar contas ───────────────────────────────────────────────────────
    const loadAccounts = React.useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const data = showInactive
                ? await supplierBankAccountService.listAllBySupplier(supplierId)
                : await supplierBankAccountService.listBySupplier(supplierId);
            setAccounts(data);
        } catch {
            setError('Erro ao carregar contas bancárias.');
        } finally {
            setLoading(false);
        }
    }, [supplierId, showInactive]);

    React.useEffect(() => { loadAccounts(); }, [loadAccounts]);

    // ─── Abrir formulário de edição ────────────────────────────────────────────
    const startEdit = (account: SupplierBankAccount) => {
        setForm({
            supplier_id: account.supplier_id,
            organization_id: account.organization_id ?? null,
            bank_code: account.bank_code ?? '',
            bank_name: account.bank_name ?? '',
            agency: account.agency ?? '',
            agency_digit: account.agency_digit ?? '',
            account: account.account ?? '',
            account_digit: account.account_digit ?? '',
            account_type: account.account_type,
            beneficiary_name: account.beneficiary_name ?? '',
            beneficiary_document: account.beneficiary_document ?? '',
            pix_key: account.pix_key ?? '',
            pix_key_type: account.pix_key_type,
            is_pix_primary: account.is_pix_primary,
            is_primary: account.is_primary,
            status: account.status,
            notes: account.notes ?? '',
        });
        setEditingId(account.id);
        setShowForm(true);
    };

    // ─── Abrir formulário de adição ────────────────────────────────────────────
    const startAdd = () => {
        setForm(emptyAccount(supplierId, organizationId ?? null));
        setEditingId(null);
        setShowForm(true);
    };

    // ─── Cancelar formulário ───────────────────────────────────────────────────
    const cancelForm = () => {
        setShowForm(false);
        setEditingId(null);
        setError(null);
    };

    // ─── Banco selecionado ─────────────────────────────────────────────────────
    const handleBankSelect = (code: string) => {
        if (code === '__outro__') {
            set({ bank_code: '', bank_name: '' });
            return;
        }
        const bank = BANCOS_BR.find(b => b.code === code);
        if (bank) set({ bank_code: bank.code, bank_name: bank.name });
    };

    // ─── Salvar ────────────────────────────────────────────────────────────────
    const handleSave = async () => {
        setError(null);
        if (!form.bank_name && !form.pix_key) {
            setError('Informe ao menos um banco/agência/conta ou uma chave PIX.');
            return;
        }
        setSaving(true);
        try {
            const payload = {
                ...form,
                created_by: userId,
                updated_by: userId,
            };
            if (editingId) {
                await supplierBankAccountService.update(editingId, payload);
            } else {
                await supplierBankAccountService.add(payload);
            }
            await loadAccounts();
            cancelForm();
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Erro ao salvar conta bancária.';
            setError(msg);
        } finally {
            setSaving(false);
        }
    };

    // ─── Remover (soft delete) ─────────────────────────────────────────────────
    const handleRemove = async (id: string) => {
        if (!confirm('Desativar esta conta bancária?')) return;
        try {
            await supplierBankAccountService.remove(id);
            await loadAccounts();
        } catch {
            setError('Erro ao remover conta bancária.');
        }
    };

    // ─── Render: card de conta ─────────────────────────────────────────────────
    const renderAccountCard = (acc: SupplierBankAccount) => (
        <div
            key={acc.id}
            className={`rounded-2xl border p-4 transition-all ${
                acc.is_primary
                    ? 'border-blue-200 bg-blue-50/40'
                    : 'border-gray-100 bg-white hover:border-gray-200'
            } ${acc.status === 'inativo' ? 'opacity-50' : ''}`}
        >
            {/* Linha 1: banco + badges */}
            <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                    {acc.is_primary && (
                        <Star className="w-3.5 h-3.5 text-blue-500 shrink-0" fill="currentColor" />
                    )}
                    <span className="text-sm font-black text-gray-900 truncate">
                        {acc.bank_name || `Banco ${acc.bank_code || '—'}`}
                    </span>
                    {acc.bank_code && (
                        <span className="text-[10px] font-bold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-md shrink-0">
                            {acc.bank_code}
                        </span>
                    )}
                    {acc.status === 'inativo' && (
                        <span className="text-[9px] font-black text-red-400 bg-red-50 px-1.5 py-0.5 rounded-md uppercase shrink-0">
                            Inativa
                        </span>
                    )}
                </div>
                {/* Ações */}
                <div className="flex items-center gap-1 shrink-0">
                    <button
                        onClick={() => startEdit(acc)}
                        className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-all"
                        title="Editar"
                    >
                        <Pencil className="w-3.5 h-3.5" />
                    </button>
                    {acc.status === 'ativo' && (
                        <button
                            onClick={() => handleRemove(acc.id)}
                            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                            title="Desativar"
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>
            </div>

            {/* Linha 2: agência e conta */}
            {(acc.agency || acc.account) && (
                <div className="flex items-center gap-3 mt-1.5">
                    <div className="flex items-center gap-1 text-xs text-gray-500">
                        <CreditCard className="w-3 h-3 text-gray-300" />
                        {acc.agency && (
                            <span>AG {acc.agency}{acc.agency_digit ? `-${acc.agency_digit}` : ''}</span>
                        )}
                        {acc.account && (
                            <span className="ml-1">
                                {ACCOUNT_TYPE_LABELS[acc.account_type].split(' ')[1] || 'CC'}{' '}
                                {acc.account}{acc.account_digit ? `-${acc.account_digit}` : ''}
                            </span>
                        )}
                    </div>
                </div>
            )}

            {/* Linha 3: favorecido */}
            {acc.beneficiary_name && (
                <div className="mt-1 text-xs text-gray-500 truncate">
                    👤 {acc.beneficiary_name}
                    {acc.beneficiary_document && (
                        <span className="text-gray-400 ml-1 font-mono">{acc.beneficiary_document}</span>
                    )}
                </div>
            )}

            {/* Linha 4: PIX */}
            {acc.pix_key && (
                <div className="flex items-center gap-1.5 mt-1.5">
                    <Smartphone className="w-3 h-3 text-green-500 shrink-0" />
                    <span className="text-xs text-green-700 font-medium">
                        PIX {acc.pix_key_type ? `(${PIX_KEY_TYPE_LABELS[acc.pix_key_type]})` : ''}
                    </span>
                    <span className="text-xs text-gray-500 font-mono truncate">{acc.pix_key}</span>
                    {acc.is_pix_primary && (
                        <span className="text-[9px] font-black text-green-600 bg-green-50 px-1.5 py-0.5 rounded-md uppercase shrink-0">
                            Principal
                        </span>
                    )}
                </div>
            )}
        </div>
    );

    // ─── Render: formulário inline ─────────────────────────────────────────────
    const renderForm = () => (
        <div className="rounded-2xl border-2 border-blue-100 bg-blue-50/20 p-5 space-y-4">
            <div className="flex items-center justify-between">
                <span className="text-xs font-black text-blue-700 uppercase tracking-widest">
                    {editingId ? '✏️ Editar Conta Bancária' : '➕ Nova Conta Bancária'}
                </span>
                <button onClick={cancelForm} className="p-1 hover:bg-blue-100 rounded-full transition-all">
                    <X className="w-3.5 h-3.5 text-blue-400" />
                </button>
            </div>

            {/* Banco */}
            <div>
                <label className={labelCls}>Banco</label>
                <select
                    className={inputCls + ' cursor-pointer'}
                    value={BANCOS_BR.some(b => b.code === form.bank_code) ? form.bank_code : '__outro__'}
                    onChange={e => handleBankSelect(e.target.value)}
                >
                    <option value="__outro__">— Outro banco —</option>
                    {BANCOS_BR.map(b => (
                        <option key={b.code} value={b.code}>{b.code} – {b.name}</option>
                    ))}
                </select>
            </div>

            {/* Código livre (se "Outro") */}
            {!BANCOS_BR.some(b => b.code === form.bank_code) && (
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className={labelCls}>Código do Banco</label>
                        <input
                            type="text" maxLength={5}
                            placeholder="Ex: 999"
                            className={inputCls + ' font-mono'}
                            value={form.bank_code}
                            onChange={e => set({ bank_code: e.target.value.replace(/\D/g, '') })}
                        />
                    </div>
                    <div>
                        <label className={labelCls}>Nome do Banco</label>
                        <input
                            type="text"
                            placeholder="Nome do banco"
                            className={inputCls}
                            value={form.bank_name}
                            onChange={e => set({ bank_name: e.target.value })}
                        />
                    </div>
                </div>
            )}

            {/* Agência */}
            <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                    <label className={labelCls}>Agência</label>
                    <input
                        type="text"
                        placeholder="0000"
                        className={inputCls + ' font-mono'}
                        value={form.agency}
                        onChange={e => set({ agency: e.target.value.replace(/\D/g, '') })}
                    />
                </div>
                <div>
                    <label className={labelCls}>Dígito</label>
                    <input
                        type="text" maxLength={1}
                        placeholder="0"
                        className={inputCls + ' font-mono'}
                        value={form.agency_digit}
                        onChange={e => set({ agency_digit: e.target.value.replace(/\D/g, '') })}
                    />
                </div>
            </div>

            {/* Conta */}
            <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                    <label className={labelCls}>Conta</label>
                    <input
                        type="text"
                        placeholder="00000000"
                        className={inputCls + ' font-mono'}
                        value={form.account}
                        onChange={e => set({ account: e.target.value.replace(/\D/g, '') })}
                    />
                </div>
                <div>
                    <label className={labelCls}>Dígito</label>
                    <input
                        type="text" maxLength={1}
                        placeholder="0"
                        className={inputCls + ' font-mono'}
                        value={form.account_digit}
                        onChange={e => set({ account_digit: e.target.value.replace(/\D/g, '') })}
                    />
                </div>
            </div>

            {/* Tipo de conta */}
            <div>
                <label className={labelCls}>Tipo de Conta</label>
                <select
                    className={inputCls + ' cursor-pointer'}
                    value={form.account_type}
                    onChange={e => set({ account_type: e.target.value as AccountType })}
                >
                    <option value="corrente">Conta Corrente</option>
                    <option value="poupanca">Conta Poupança</option>
                    <option value="pagamento">Conta de Pagamento</option>
                </select>
            </div>

            {/* Divisor: Favorecido */}
            <div className="flex items-center gap-2 pt-1">
                <span className="text-[10px] font-black text-gray-300 uppercase tracking-widest">Favorecido</span>
                <div className="flex-1 h-px bg-gray-100" />
            </div>

            {/* Nome + Documento do favorecido */}
            <div>
                <label className={labelCls}>Nome do Favorecido</label>
                <input
                    type="text"
                    placeholder="Nome completo ou razão social"
                    className={inputCls}
                    value={form.beneficiary_name}
                    onChange={e => set({ beneficiary_name: e.target.value })}
                />
            </div>
            <div>
                <label className={labelCls}>CPF / CNPJ do Favorecido</label>
                <input
                    type="text"
                    placeholder="000.000.000-00 ou 00.000.000/0000-00"
                    className={inputCls + ' font-mono'}
                    value={form.beneficiary_document}
                    onChange={e => set({ beneficiary_document: maskDoc(e.target.value) })}
                />
            </div>

            {/* Divisor: PIX */}
            <div className="flex items-center gap-2 pt-1">
                <Smartphone className="w-3.5 h-3.5 text-green-400" />
                <span className="text-[10px] font-black text-gray-300 uppercase tracking-widest">PIX</span>
                <div className="flex-1 h-px bg-gray-100" />
            </div>

            <div className="grid grid-cols-2 gap-3">
                <div>
                    <label className={labelCls}>Tipo de Chave</label>
                    <select
                        className={inputCls + ' cursor-pointer'}
                        value={form.pix_key_type ?? ''}
                        onChange={e => set({ pix_key_type: (e.target.value || undefined) as PixKeyType | undefined })}
                    >
                        <option value="">— sem PIX —</option>
                        <option value="cpf">CPF</option>
                        <option value="cnpj">CNPJ</option>
                        <option value="email">E-mail</option>
                        <option value="telefone">Telefone</option>
                        <option value="aleatoria">Chave Aleatória</option>
                    </select>
                </div>
                <div>
                    <label className={labelCls}>Chave PIX</label>
                    <input
                        type="text"
                        placeholder="Chave PIX"
                        className={inputCls + ' font-mono'}
                        value={form.pix_key}
                        onChange={e => set({ pix_key: e.target.value })}
                    />
                </div>
            </div>

            {/* Checkboxes */}
            <div className="flex flex-col gap-2.5 pt-1">
                <label className="flex items-center gap-2.5 cursor-pointer group">
                    <input
                        type="checkbox"
                        className="w-4 h-4 rounded accent-blue-600 cursor-pointer"
                        checked={form.is_primary}
                        onChange={e => set({ is_primary: e.target.checked })}
                    />
                    <span className="text-sm font-semibold text-gray-700 group-hover:text-gray-900 transition-colors">
                        ⭐ Conta principal
                    </span>
                    <span className="text-[10px] text-gray-400">(usada por padrão em pagamentos)</span>
                </label>

                {form.pix_key_type && (
                    <label className="flex items-center gap-2.5 cursor-pointer group">
                        <input
                            type="checkbox"
                            className="w-4 h-4 rounded accent-green-600 cursor-pointer"
                            checked={form.is_pix_primary}
                            onChange={e => set({ is_pix_primary: e.target.checked })}
                        />
                        <span className="text-sm font-semibold text-gray-700 group-hover:text-gray-900 transition-colors">
                            🔑 PIX principal
                        </span>
                        <span className="text-[10px] text-gray-400">(sugerido antes de TED/DOC)</span>
                    </label>
                )}
            </div>

            {/* Observações */}
            <div>
                <label className={labelCls}>Observações</label>
                <textarea
                    rows={2}
                    placeholder="Notas internas sobre esta conta..."
                    className={inputCls + ' resize-none'}
                    value={form.notes}
                    onChange={e => set({ notes: e.target.value })}
                />
            </div>

            {/* Status (só ao editar) */}
            {editingId && (
                <div>
                    <label className={labelCls}>Situação</label>
                    <select
                        className={inputCls + ' cursor-pointer'}
                        value={form.status}
                        onChange={e => set({ status: e.target.value as 'ativo' | 'inativo' })}
                    >
                        <option value="ativo">✅ Ativa</option>
                        <option value="inativo">⛔ Inativa</option>
                    </select>
                </div>
            )}

            {/* Erro */}
            {error && (
                <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-100 rounded-xl">
                    <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                    <span className="text-xs text-red-600 font-medium">{error}</span>
                </div>
            )}

            {/* Botões */}
            <div className="flex gap-2 pt-1">
                <button
                    type="button"
                    onClick={cancelForm}
                    className="flex-1 px-4 py-2.5 text-sm font-bold text-gray-400 hover:text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition-all"
                >
                    Cancelar
                </button>
                <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving}
                    className="flex-[2] px-4 py-2.5 bg-gray-900 text-white text-sm rounded-xl hover:bg-blue-600 transition-all shadow-lg font-black uppercase tracking-widest active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {saving ? 'Salvando...' : editingId ? 'Salvar Alterações' : 'Adicionar Conta'}
                </button>
            </div>
        </div>
    );

    // ─── Render principal ──────────────────────────────────────────────────────
    return (
        <div className="flex flex-col h-full">
            {/* Toolbar */}
            <div className="flex items-center justify-between px-7 py-4 border-b border-gray-100 shrink-0">
                <div className="flex items-center gap-2">
                    <Building className="w-4 h-4 text-gray-400" />
                    <span className="text-sm font-black text-gray-700">
                        {accounts.length} conta{accounts.length !== 1 ? 's' : ''} cadastrada{accounts.length !== 1 ? 's' : ''}
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setShowInactive(v => !v)}
                        className="text-[10px] font-bold text-gray-400 hover:text-gray-600 transition-all uppercase tracking-wider"
                    >
                        {showInactive ? 'Ocultar inativas' : 'Ver inativas'}
                    </button>
                    {!showForm && (
                        <button
                            onClick={startAdd}
                            className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white text-xs font-black uppercase tracking-wider rounded-xl hover:bg-blue-700 transition-all shadow-sm active:scale-95"
                        >
                            <Plus className="w-3.5 h-3.5" />
                            Adicionar
                        </button>
                    )}
                </div>
            </div>

            {/* Conteúdo scrollável */}
            <div className="flex-1 overflow-y-auto px-7 py-5 space-y-3">
                {/* Formulário inline */}
                {showForm && renderForm()}

                {/* Loading */}
                {loading && (
                    <div className="flex items-center justify-center py-12">
                        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                )}

                {/* Lista de contas */}
                {!loading && accounts.length === 0 && !showForm && (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                        <div className="p-3 bg-gray-50 rounded-2xl mb-3">
                            <CreditCard className="w-8 h-8 text-gray-300" />
                        </div>
                        <p className="text-sm font-bold text-gray-400">Nenhuma conta bancária cadastrada</p>
                        <p className="text-xs text-gray-300 mt-1">Adicione contas para agilizar pagamentos</p>
                        <button
                            onClick={startAdd}
                            className="mt-4 flex items-center gap-1.5 px-4 py-2 bg-blue-50 text-blue-600 text-xs font-black uppercase tracking-wider rounded-xl hover:bg-blue-100 transition-all"
                        >
                            <Plus className="w-3.5 h-3.5" />
                            Adicionar primeira conta
                        </button>
                    </div>
                )}

                {!loading && accounts.map(renderAccountCard)}

                {/* Erro global */}
                {error && !showForm && (
                    <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-100 rounded-xl">
                        <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                        <span className="text-xs text-red-600 font-medium">{error}</span>
                    </div>
                )}
            </div>
        </div>
    );
};

export default SupplierBankAccountsTab;
