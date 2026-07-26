// components/OrganizationCreateSheet.tsx
//
// Criação de organização (empresa do grupo). Painel lateral porque é "criar registro
// simples" — UI_PATTERNS.md §3.
//
// Por que este arquivo existe: o botão "Nova empresa" da aba Organização chamava
// `setIsCreatingOrganization(true)` desde sempre, mas nada no app observava esse estado —
// o AppRouter recebia a prop e nunca a usava, e não havia nenhum formulário de criação
// no código. O botão era morto. `handleUpsertOrganization` (hooks/useProjectOperations)
// já sabia criar via organizationService.createOrganization; só faltava a UI.
//
// Logo, membros e configurações não entram aqui: são editados depois em Detalhes
// (OrganizationPage), para manter a criação curta.
import React from 'react';
import { Loader2, Save } from 'lucide-react';
import { Organization } from '../types';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from './ui/sheet';
import CityStateSelect from './CityStateSelect';
import Button from './ui/Button';

interface Props {
    open: boolean;
    onClose: () => void;
    /** Recebe a organização montada; quem chama decide como persistir. */
    onCreate: (org: Organization) => Promise<void> | void;
    saving?: boolean;
}

type FormState = {
    name: string;
    cnpj: string;
    email: string;
    phone: string;
    website: string;
    street: string;
    number: string;
    neighborhood: string;
    city: string;
    state: string;
    zipCode: string;
};

const EMPTY: FormState = {
    name: '', cnpj: '', email: '', phone: '', website: '',
    street: '', number: '', neighborhood: '', city: '', state: '', zipCode: '',
};

const inputCls = 'w-full px-3 py-2 border border-gray-200 rounded-[6px] text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white transition-all';
const labelCls = 'block text-xs font-semibold text-gray-500 mb-1';

const Field: React.FC<{ label: string; children: React.ReactNode; required?: boolean }> = ({ label, children, required }) => (
    <div>
        <label className={labelCls}>
            {label}{required && <span className="text-red-500 ml-1">*</span>}
        </label>
        {children}
    </div>
);

const OrganizationCreateSheet: React.FC<Props> = ({ open, onClose, onCreate, saving: savingProp = false }) => {
    const [form, setForm] = React.useState<FormState>(EMPTY);
    const [error, setError] = React.useState<string | null>(null);
    // Estado próprio de envio: quem renderiza este painel (AppRouter, dentro de um
    // switch) não pode declarar hooks para controlar isso. `savingProp` continua
    // valendo como override para quem já tiver o estado à mão.
    const [submitting, setSubmitting] = React.useState(false);
    const saving = savingProp || submitting;

    // Formulário limpo a cada abertura: sem isto, um cadastro cancelado reaparece
    // preenchido na próxima vez que o painel abrir.
    React.useEffect(() => {
        if (open) { setForm(EMPTY); setError(null); setSubmitting(false); }
    }, [open]);

    const set = (k: keyof FormState, v: string) => setForm(p => ({ ...p, [k]: v }));

    const isDirty = React.useMemo(
        () => (Object.keys(EMPTY) as (keyof FormState)[]).some(k => form[k] !== EMPTY[k]),
        [form],
    );

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (saving) return;
        if (!form.name.trim()) { setError('O nome da organização é obrigatório.'); return; }
        setError(null);
        setSubmitting(true);
        try {
            // Sem `id`: é o que faz handleUpsertOrganization seguir pelo caminho de criação.
            await onCreate({
                name: form.name.trim(),
                cnpj: form.cnpj.trim() || undefined,
                email: form.email.trim() || undefined,
                phone: form.phone.trim() || undefined,
                website: form.website.trim() || undefined,
                address: {
                    street: form.street.trim() || undefined,
                    number: form.number.trim() || undefined,
                    neighborhood: form.neighborhood.trim() || undefined,
                    city: form.city.trim() || undefined,
                    state: form.state.trim() || undefined,
                    zipCode: form.zipCode.trim() || undefined,
                },
            } as Organization);
        } catch (e: unknown) {
            setError((e as Error).message || 'Erro ao criar a organização.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Sheet open={open} onClose={onClose} size="xl" dirty={isDirty && !saving}>
            <SheetHeader onClose={onClose}>
                <SheetTitle>Nova organização</SheetTitle>
                <SheetDescription>
                    Sócios, usuários e logotipo são configurados depois, em Detalhes.
                </SheetDescription>
            </SheetHeader>

            <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
                <SheetPanel className="px-6 py-5 space-y-6">
                    {error && (
                        <div className="p-3 bg-red-50 border border-red-200 rounded-[6px] text-red-700 text-sm">
                            {error}
                        </div>
                    )}

                    <div className="space-y-4">
                        <p className="text-xs font-semibold text-blue-600">Identificação</p>
                        <Field label="Nome da organização" required>
                            <input className={inputCls} value={form.name} autoFocus
                                onChange={e => set('name', e.target.value)} />
                        </Field>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <Field label="CNPJ">
                                <input className={inputCls} placeholder="00.000.000/0001-00"
                                    value={form.cnpj} onChange={e => set('cnpj', e.target.value)} />
                            </Field>
                            <Field label="Telefone">
                                <input className={inputCls} value={form.phone}
                                    onChange={e => set('phone', e.target.value)} />
                            </Field>
                            <Field label="E-mail">
                                <input type="email" className={inputCls} value={form.email}
                                    onChange={e => set('email', e.target.value)} />
                            </Field>
                            <Field label="Website">
                                <input className={inputCls} value={form.website}
                                    onChange={e => set('website', e.target.value)} />
                            </Field>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <p className="text-xs font-semibold text-blue-600">Endereço</p>
                        {/* Dados mestres (master_states / master_cities) + autofill de CEP. */}
                        <CityStateSelect
                            cep={form.zipCode}
                            stateCode={form.state}
                            cityName={form.city}
                            inputCls={inputCls}
                            labelCls={labelCls}
                            onChange={({ cep, stateCode, cityName }) => setForm(p => ({
                                ...p,
                                zipCode: cep ?? '',
                                state: stateCode ?? '',
                                city: cityName ?? '',
                            }))}
                            onCepLookup={(d) => setForm(p => ({
                                ...p,
                                street: d.logradouro || p.street,
                                neighborhood: d.bairro || p.neighborhood,
                            }))}
                        />
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div className="sm:col-span-2">
                                <Field label="Logradouro">
                                    <input className={inputCls} value={form.street}
                                        onChange={e => set('street', e.target.value)} />
                                </Field>
                            </div>
                            <Field label="Número">
                                <input className={inputCls} value={form.number}
                                    onChange={e => set('number', e.target.value)} />
                            </Field>
                        </div>
                        <Field label="Bairro">
                            <input className={inputCls} value={form.neighborhood}
                                onChange={e => set('neighborhood', e.target.value)} />
                        </Field>
                    </div>
                </SheetPanel>

                <SheetFooter>
                    <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
                        Cancelar
                    </Button>
                    <Button type="submit" disabled={saving} className="gap-2">
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Criar organização
                    </Button>
                </SheetFooter>
            </form>
        </Sheet>
    );
};

export default OrganizationCreateSheet;
