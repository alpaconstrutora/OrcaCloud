import React, { useState, useEffect, useCallback } from 'react';
import {
    Save, AlertCircle, Loader2, CheckCircle2,
    CalendarX, CalendarCheck, CalendarClock,
} from 'lucide-react';
import {
    CompanyIncorporacao, CompanyIncorporacaoUpsert,
    CompanyBankAccount, TIPO_SPE_LABELS, TipoSPE,
} from '../types';
import { companyService } from '../services/companyService';
import { supabase } from '../lib/supabase';

interface Props {
    companyId: string;
    orgId: string;
}

// ─── Alerta de vencimento de alvará ─────────────────────────

const AlvaraWarning: React.FC<{ validade?: string; label: string }> = ({ validade, label }) => {
    if (!validade) return null;
    const diffDias = Math.ceil((new Date(validade + 'T00:00:00').getTime() - Date.now()) / 86400000);
    const data = new Date(validade + 'T00:00:00').toLocaleDateString('pt-BR');

    if (diffDias < 0) return (
        <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs font-black">
            <CalendarX className="w-4 h-4 flex-shrink-0" />
            {label} vencido em {data} (há {Math.abs(diffDias)} dias)
        </div>
    );
    if (diffDias <= 30) return (
        <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs font-black">
            <CalendarClock className="w-4 h-4 flex-shrink-0" />
            {label} vence em {diffDias} dia{diffDias !== 1 ? 's' : ''} ({data})
        </div>
    );
    if (diffDias <= 60) return (
        <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl text-amber-700 text-xs font-black">
            <CalendarClock className="w-4 h-4 flex-shrink-0" />
            {label} vence em {diffDias} dias ({data})
        </div>
    );
    return (
        <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-xl text-green-700 text-xs font-black">
            <CalendarCheck className="w-4 h-4 flex-shrink-0" />
            {label} válido até {data}
        </div>
    );
};

// ─── Form ────────────────────────────────────────────────────

type FormData = {
    tipo_spe: TipoSPE | '';
    registro_incorporacao: string;
    cartorio: string;
    matriculas: string;      // comma-separated em UI, array no DB
    alvara_construcao: string;
    alvara_validade: string;
    habite_se: string;
    habite_se_data: string;
    rep_numero: string;
    conta_segregada_id: string;
    empreendimento_id: string;
};

const EMPTY: FormData = {
    tipo_spe: '', registro_incorporacao: '', cartorio: '', matriculas: '',
    alvara_construcao: '', alvara_validade: '', habite_se: '', habite_se_data: '',
    rep_numero: '', conta_segregada_id: '', empreendimento_id: '',
};

const cls = "w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white";

const Field: React.FC<{ label: string; children: React.ReactNode; hint?: string }> = ({ label, children, hint }) => (
    <div>
        <label className="block text-xs font-black uppercase tracking-widest text-gray-500 mb-1">{label}</label>
        {children}
        {hint && <p className="text-[10px] text-gray-400 mt-1">{hint}</p>}
    </div>
);

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-blue-600 mb-3">{title}</p>
        {children}
    </div>
);

// ─── Componente ───────────────────────────────────────────────

const CompanyIncorporacaoTab: React.FC<Props> = ({ companyId, orgId }) => {
    const [form, setForm] = useState<FormData>(EMPTY);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [bankAccounts, setBankAccounts] = useState<CompanyBankAccount[]>([]);
    const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [inc, accs, projs] = await Promise.all([
                companyService.getIncorporacao(companyId),
                companyService.listBankAccounts(companyId),
                supabase
                    .from('projects')
                    .select('id, name')
                    .or(`settings->>'organizationId'.eq.${orgId},organization_id.eq.${orgId}`)
                    .order('name'),
            ]);

            setBankAccounts(accs);
            setProjects((projs.data ?? []) as { id: string; name: string }[]);

            if (inc) {
                setForm({
                    tipo_spe: inc.tipo_spe ?? '',
                    registro_incorporacao: inc.registro_incorporacao ?? '',
                    cartorio: inc.cartorio ?? '',
                    matriculas: (inc.matriculas ?? []).join(', '),
                    alvara_construcao: inc.alvara_construcao ?? '',
                    alvara_validade: inc.alvara_validade ?? '',
                    habite_se: inc.habite_se ?? '',
                    habite_se_data: inc.habite_se_data ?? '',
                    rep_numero: inc.rep_numero ?? '',
                    conta_segregada_id: inc.conta_segregada_id ?? '',
                    empreendimento_id: inc.empreendimento_id ?? '',
                });
            }
        } catch (e: unknown) {
            setError((e as Error).message);
        } finally {
            setLoading(false);
        }
    }, [companyId, orgId]);

    useEffect(() => { load(); }, [load]);

    const set = (field: keyof FormData, value: string) =>
        setForm(prev => ({ ...prev, [field]: value }));

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true); setError(null);
        try {
            const payload: CompanyIncorporacaoUpsert = {
                company_id: companyId,
                tipo_spe: (form.tipo_spe as TipoSPE) || undefined,
                registro_incorporacao: form.registro_incorporacao.trim() || undefined,
                cartorio: form.cartorio.trim() || undefined,
                matriculas: form.matriculas
                    ? form.matriculas.split(',').map(m => m.trim()).filter(Boolean)
                    : undefined,
                alvara_construcao: form.alvara_construcao.trim() || undefined,
                alvara_validade: form.alvara_validade || undefined,
                habite_se: form.habite_se.trim() || undefined,
                habite_se_data: form.habite_se_data || undefined,
                rep_numero: form.rep_numero.trim() || undefined,
                conta_segregada_id: form.conta_segregada_id || undefined,
                empreendimento_id: form.empreendimento_id || undefined,
            };
            await companyService.upsertIncorporacao(payload);
            setSuccess('Dados salvos com sucesso.');
            setTimeout(() => setSuccess(null), 3000);
        } catch (e: unknown) {
            setError((e as Error).message);
        } finally {
            setSaving(false);
        }
    };

    if (loading) return (
        <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
    );

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
                </div>
            )}
            {success && (
                <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm">
                    <CheckCircle2 className="w-4 h-4 flex-shrink-0" />{success}
                </div>
            )}

            <Section title="Tipo e Registro">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <Field label="Tipo SPE / Regime">
                        <select className={cls} value={form.tipo_spe}
                            onChange={e => set('tipo_spe', e.target.value)}>
                            <option value="">Selecione</option>
                            {(Object.entries(TIPO_SPE_LABELS) as [TipoSPE, string][]).map(([v, l]) => (
                                <option key={v} value={v}>{l}</option>
                            ))}
                        </select>
                    </Field>
                    <Field label="Número do Registro de Incorporação">
                        <input className={cls} value={form.registro_incorporacao}
                            placeholder="ex: 12.345/2024"
                            onChange={e => set('registro_incorporacao', e.target.value)} />
                    </Field>
                    <Field label="Cartório">
                        <input className={cls} value={form.cartorio}
                            placeholder="ex: 1º Ofício de Imóveis"
                            onChange={e => set('cartorio', e.target.value)} />
                    </Field>
                    <div className="md:col-span-2">
                        <Field label="Matrículas" hint="Separe múltiplas matrículas por vírgula">
                            <input className={cls} value={form.matriculas}
                                placeholder="ex: 12345, 12346, 12347"
                                onChange={e => set('matriculas', e.target.value)} />
                        </Field>
                    </div>
                    <Field label="REP – Registro Especial Patrimonial">
                        <input className={cls} value={form.rep_numero}
                            onChange={e => set('rep_numero', e.target.value)} />
                    </Field>
                </div>
            </Section>

            <Section title="Alvará de Construção">
                <div className="space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Field label="Número do Alvará">
                            <input className={cls} value={form.alvara_construcao}
                                placeholder="ex: 2024/ALV/12345"
                                onChange={e => set('alvara_construcao', e.target.value)} />
                        </Field>
                        <Field label="Validade do Alvará">
                            <input type="date" className={cls} value={form.alvara_validade}
                                onChange={e => set('alvara_validade', e.target.value)} />
                        </Field>
                    </div>
                    <AlvaraWarning validade={form.alvara_validade} label="Alvará" />
                </div>
            </Section>

            <Section title="Habite-se">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label="Número do Habite-se">
                        <input className={cls} value={form.habite_se}
                            onChange={e => set('habite_se', e.target.value)} />
                    </Field>
                    <Field label="Data de Emissão">
                        <input type="date" className={cls} value={form.habite_se_data}
                            onChange={e => set('habite_se_data', e.target.value)} />
                    </Field>
                </div>
            </Section>

            <Section title="Vínculos Operacionais">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {projects.length > 0 && (
                        <Field label="Empreendimento Vinculado">
                            <select className={cls} value={form.empreendimento_id}
                                onChange={e => set('empreendimento_id', e.target.value)}>
                                <option value="">Nenhum</option>
                                {projects.map(p => (
                                    <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                            </select>
                        </Field>
                    )}
                    {bankAccounts.length > 0 && (
                        <Field label="Conta Segregada"
                            hint="Conta bancária exclusiva do patrimônio de afetação">
                            <select className={cls} value={form.conta_segregada_id}
                                onChange={e => set('conta_segregada_id', e.target.value)}>
                                <option value="">Nenhuma</option>
                                {bankAccounts.map(a => (
                                    <option key={a.id} value={a.id}>
                                        {a.banco_nome ?? a.banco_codigo}
                                        {a.conta ? ` — CC ${a.conta}` : ''}
                                    </option>
                                ))}
                            </select>
                        </Field>
                    )}
                    {bankAccounts.length === 0 && (
                        <p className="text-xs text-gray-400 col-span-2">
                            Cadastre contas bancárias na aba <strong>Contas Bancárias</strong> para vincular uma conta segregada.
                        </p>
                    )}
                </div>
            </Section>

            <div className="flex justify-end pt-2 border-t border-gray-100">
                <button type="submit" disabled={saving}
                    className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-blue-700 transition-all disabled:opacity-60 active:scale-95">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Salvar Incorporação
                </button>
            </div>
        </form>
    );
};

export default CompanyIncorporacaoTab;
