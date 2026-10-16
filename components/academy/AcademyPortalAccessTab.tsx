import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Loader2, Mail, Plus, Users } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import StandardTable, { type StandardTableColumn } from '../ui/StandardTable';
import ActionIconButton from '../ui/ActionIconButton';
import { useConfirm } from '../ui/confirm';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import Button from '../ui/Button';
import { academyPortalUsersService, type NovoAcessoPortal } from '../../services/academyPortalUsersService';
import { laborService, type Contractor, type Employee } from '../../services/laborService';
import { laborKeys } from '../../lib/queryKeys';
import { STALE } from '../../lib/queryClient';
import type { AcademyPortalUser, AcademyPortalUserTipo } from '../../types/academy';

/**
 * RH › Treinamentos › Portal — quem pode entrar no Portal de Treinamentos
 * (/portal-treinamentos) e o convite por e-mail.
 *
 * Plano: docs/planos/2026-10-15-portal-de-treinamentos.md
 *
 * Dois tipos de acesso:
 *   COLABORADOR → ficha existente (e-mail vem preenchido da ficha);
 *   TERCEIRO    → prestador/terceirizado: o cadastro cria uma ficha própria
 *                 em employees (contract_type EMPREITEIRO, academy_externo),
 *                 porque a Academia só matricula e certifica fichas.
 */

const inputCls = 'w-full px-3 py-2 bg-white border border-gray-200 rounded-[6px] text-sm font-normal outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all';

const Campo: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
    <div className="space-y-1.5">
        <label className="text-xs font-semibold text-gray-500">{label}</label>
        {children}
    </div>
);

const COLUMNS: StandardTableColumn[] = [
    { key: 'name',        label: 'Nome',          sortable: true, width: 220 },
    { key: 'email',       label: 'E-mail',        sortable: true, width: 240 },
    { key: 'tipo',        label: 'Tipo',          sortable: true, width: 130 },
    { key: 'vinculo',     label: 'Ficha / empresa', sortable: true, width: 220 },
    { key: 'invited_at',  label: 'Convite',       sortable: true, width: 160 },
    { key: 'last_access', label: 'Último acesso', sortable: true, width: 150 },
    { key: 'status',      label: 'Situação',      sortable: true, width: 110 },
];

const TIPO_LABEL: Record<AcademyPortalUserTipo, string> = { COLABORADOR: 'Colaborador', TERCEIRO: 'Terceirizado' };

const fmtDataHora = (iso?: string | null) =>
    iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : null;

interface Props {
    orgId: string | null;
    employees: Employee[];
    podeEditar: boolean;
    notify: (msg: string, tipo?: 'success' | 'error') => void;
}

const AcademyPortalAccessTab: React.FC<Props> = ({ orgId, employees, podeEditar, notify }) => {
    const qc = useQueryClient();
    const confirm = useConfirm();
    const [sheet, setSheet] = useState<'novo' | AcademyPortalUser | null>(null);
    const [enviando, setEnviando] = useState<string | null>(null);

    const key = [...laborKeys.all, 'academyPortalUsers', orgId];
    // Sem `enabled: !!orgId` — em "Todas" a RLS recorta sozinha (REGRA #5).
    const { data: acessos = [], isLoading } = useQuery({
        queryKey: key,
        queryFn: () => academyPortalUsersService.list(orgId),
        staleTime: STALE.fast,
    });

    const atualizar = (fn: (prev: AcademyPortalUser[]) => AcademyPortalUser[]) =>
        qc.setQueryData<AcademyPortalUser[]>(key, prev => fn(prev ?? []));   // §22

    const convidar = async (u: AcademyPortalUser) => {
        setEnviando(u.id);
        try {
            const { kind } = await academyPortalUsersService.invite(u.id);
            const agora = new Date().toISOString();
            atualizar(prev => prev.map(x => x.id === u.id ? { ...x, invited_at: agora } : x));
            notify(kind === 'invite'
                ? `Convite enviado para ${u.email}.`
                : `${u.email} já tinha conta: enviado o e-mail para definir a senha.`);
        } catch (e: any) {
            notify(e?.message || 'Não foi possível enviar o convite.', 'error');
        } finally {
            setEnviando(null);
        }
    };

    const alternarAtivo = useMutation({
        mutationFn: (u: AcademyPortalUser) => academyPortalUsersService.update(u.id, { is_active: !u.is_active }),
        onSuccess: salvo => atualizar(prev => prev.map(x => x.id === salvo.id ? { ...x, ...salvo } : x)),
        onError: (e: Error) => notify(e.message, 'error'),
    });

    const excluir = async (u: AcademyPortalUser) => {
        const ok = await confirm({
            title: 'Remover acesso ao portal?',
            message: `${u.name} deixa de entrar no Portal de Treinamentos. As matrículas e os certificados da ficha continuam no RH.`,
            variant: 'danger',
            confirmLabel: 'Remover',
        });
        if (!ok) return;
        try {
            await academyPortalUsersService.remove(u.id);
            atualizar(prev => prev.filter(x => x.id !== u.id));
            notify('Acesso removido.');
        } catch (e: any) {
            notify(e?.message || 'Não foi possível remover.', 'error');
        }
    };

    const semOrg = !orgId;

    return (
        <>
            <StandardTable<AcademyPortalUser>
                storageKey="rh:treinamentos:portal"
                columns={COLUMNS}
                rows={acessos}
                rowKey={u => u.id}
                loading={isLoading}
                searchText={u => `${u.name} ${u.email} ${u.employee_name ?? ''} ${u.empresa_terceira ?? ''}`}
                searchPlaceholder="Buscar por nome, e-mail ou empresa..."
                sortValue={(k, u) => {
                    switch (k) {
                        case 'tipo': return TIPO_LABEL[u.tipo];
                        case 'vinculo': return u.tipo === 'TERCEIRO' ? (u.empresa_terceira ?? '') : (u.employee_name ?? '');
                        case 'last_access': return u.last_access_at ?? '';
                        case 'status': return u.is_active ? 'Ativo' : 'Inativo';
                        default: return (u as unknown as Record<string, string | null | undefined>)[k] ?? '';
                    }
                }}
                renderCell={(k, u) => {
                    switch (k) {
                        case 'name': return <span className="text-sm font-normal text-gray-900">{u.name}</span>;
                        case 'email': return <span className="text-sm font-normal text-gray-700">{u.email}</span>;
                        case 'tipo': return <span className={`text-sm font-normal ${u.tipo === 'TERCEIRO' ? 'text-orange-700' : 'text-gray-700'}`}>{TIPO_LABEL[u.tipo]}</span>;
                        case 'vinculo': return (
                            <span className="text-sm font-normal text-gray-700">
                                {u.tipo === 'TERCEIRO'
                                    ? (u.empresa_terceira || '—')
                                    : (u.employee_name || '—')}
                                {u.employee_role && <span className="text-gray-400"> · {u.employee_role}</span>}
                            </span>
                        );
                        case 'invited_at': return <span className="text-sm font-normal text-gray-600">{u.invited_at ? `Enviado em ${fmtDataHora(u.invited_at)}` : <span className="text-amber-700">Não enviado</span>}</span>;
                        case 'last_access': return <span className="text-sm font-normal text-gray-600">{fmtDataHora(u.last_access_at) ?? <span className="text-gray-400">Nunca</span>}</span>;
                        case 'status': return <span className={`text-sm font-normal ${u.is_active ? 'text-emerald-700' : 'text-gray-500'}`}>{u.is_active ? 'Ativo' : 'Inativo'}</span>;
                        default: return null;
                    }
                }}
                actions={{
                    width: 150,
                    render: u => (
                        <div className="flex items-center justify-end gap-1.5">
                            <button
                                type="button"
                                onClick={() => convidar(u)}
                                disabled={!podeEditar || !u.is_active || enviando === u.id}
                                title={!podeEditar ? 'Você não tem permissão para convidar'
                                    : !u.is_active ? 'Acesso inativo — ative antes de convidar'
                                    : u.invited_at ? 'Reenviar convite por e-mail' : 'Enviar convite por e-mail'}
                                className="flex items-center gap-1 h-8 px-2.5 rounded-[6px] text-xs font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-50 transition-all"
                            >
                                {enviando === u.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
                                {u.invited_at ? 'Reenviar' : 'Convidar'}
                            </button>
                            <ActionIconButton
                                kind="edit"
                                onClick={() => setSheet(u)}
                                disabled={!podeEditar}
                                title={!podeEditar ? 'Você não tem permissão para editar' : 'Editar'}
                            />
                            <ActionIconButton
                                kind={u.is_active ? 'lock' : 'unlock'}
                                onClick={() => alternarAtivo.mutate(u)}
                                disabled={!podeEditar}
                                title={!podeEditar ? 'Você não tem permissão' : u.is_active ? 'Desativar acesso' : 'Reativar acesso'}
                            />
                            <ActionIconButton
                                kind="delete"
                                onClick={() => excluir(u)}
                                disabled={!podeEditar}
                                title={!podeEditar ? 'Você não tem permissão' : 'Remover acesso'}
                            />
                        </div>
                    ),
                }}
                toolbarRight={
                    <button
                        type="button"
                        onClick={() => setSheet('novo')}
                        disabled={!podeEditar || semOrg}
                        title={!podeEditar ? 'Você não tem permissão para liberar acessos'
                            : semOrg ? 'Selecione uma organização no topo para liberar o acesso' : undefined}
                        className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 transition-all font-medium text-[13px] active:scale-95 shrink-0 disabled:opacity-50"
                    >
                        <Plus className="w-[15px] h-[15px]" /> Liberar acesso
                    </button>
                }
                empty={{
                    icon: <Users className="w-12 h-12 text-gray-300 mx-auto mb-4" />,
                    title: 'Ninguém tem acesso ao Portal de Treinamentos ainda',
                    subtitle: 'Libere o acesso de um colaborador ou de um terceirizado e envie o convite por e-mail. Ele entra em /portal-treinamentos.',
                }}
            />

            {sheet && orgId && (
                <AcessoSheet
                    open
                    onClose={() => setSheet(null)}
                    orgId={orgId}
                    employees={employees}
                    existente={sheet === 'novo' ? null : sheet}
                    jaComAcesso={new Set(acessos.map(a => a.employee_id))}
                    onSaved={(salvo, criado) => {
                        atualizar(prev => criado ? [salvo, ...prev] : prev.map(x => x.id === salvo.id ? { ...x, ...salvo } : x));
                        if (criado) qc.invalidateQueries({ queryKey: key });   // ficha nova do terceiro → nome da ficha
                        notify(criado ? 'Acesso liberado. Agora envie o convite por e-mail.' : 'Acesso atualizado.');
                    }}
                    notify={notify}
                />
            )}
        </>
    );
};

// ── Drawer: liberar / editar acesso ─────────────────────────────────────────

interface SheetProps {
    open: boolean;
    onClose: () => void;
    orgId: string;
    employees: Employee[];
    existente: AcademyPortalUser | null;
    jaComAcesso: Set<string>;
    onSaved: (u: AcademyPortalUser, criado: boolean) => void;
    notify: (msg: string, tipo?: 'success' | 'error') => void;
}

const AcessoSheet: React.FC<SheetProps> = ({ open, onClose, orgId, employees, existente, jaComAcesso, onSaved, notify }) => {
    const editando = !!existente;
    const [salvando, setSalvando] = useState(false);
    const [contractors, setContractors] = useState<Contractor[]>([]);
    const [form, setForm] = useState<NovoAcessoPortal>({
        orgId,
        tipo: existente?.tipo ?? 'COLABORADOR',
        name: existente?.name ?? '',
        email: existente?.email ?? '',
        phone: existente?.phone ?? '',
        cpf: existente?.cpf ?? '',
        employeeId: existente?.employee_id ?? '',
        empresaTerceira: existente?.empresa_terceira ?? '',
        contractorId: existente?.contractor_id ?? null,
        funcao: '',
    });
    const set = <K extends keyof NovoAcessoPortal>(k: K, v: NovoAcessoPortal[K]) => setForm(p => ({ ...p, [k]: v }));

    useEffect(() => {
        laborService.listContractors(orgId).then(setContractors).catch(() => setContractors([]));
    }, [orgId]);

    // Colaboradores ativos sem acesso ainda (fichas de terceiro não entram: já têm o seu).
    const elegiveis = useMemo(() => employees.filter(e =>
        e.status === 'ATIVO' && !jaComAcesso.has(e.id) && !(e as Employee & { academy_externo?: boolean }).academy_externo),
    [employees, jaComAcesso]);

    // O app já tem a informação: escolher a ficha preenche nome e e-mail, sem
    // sobrescrever o que o usuário já digitou por cima.
    const escolherColaborador = (id: string) => {
        const e = employees.find(x => x.id === id);
        setForm(p => ({
            ...p,
            employeeId: id,
            name: p.name || e?.name || '',
            email: p.email || (e as Employee & { email?: string })?.email || '',
            phone: p.phone || (e as Employee & { phone?: string })?.phone || '',
            cpf: p.cpf || (e as Employee & { cpf?: string })?.cpf || '',
        }));
    };

    const salvar = async () => {
        if (!form.name.trim() || !form.email.trim()) { notify('Nome e e-mail são obrigatórios.', 'error'); return; }
        if (!editando && form.tipo === 'COLABORADOR' && !form.employeeId) { notify('Escolha o colaborador.', 'error'); return; }
        setSalvando(true);
        try {
            if (editando && existente) {
                const salvo = await academyPortalUsersService.update(existente.id, {
                    name: form.name.trim(), email: form.email.trim(), phone: form.phone || null, cpf: form.cpf || null,
                    empresa_terceira: form.tipo === 'TERCEIRO' ? (form.empresaTerceira || null) : null,
                    contractor_id: form.tipo === 'TERCEIRO' ? (form.contractorId || null) : null,
                });
                onSaved({ ...existente, ...salvo }, false);
            } else {
                const criado = await academyPortalUsersService.create(form);
                const ficha = employees.find(e => e.id === criado.employee_id);
                onSaved({ ...criado, employee_name: ficha?.name ?? (form.tipo === 'TERCEIRO' ? form.name : undefined), employee_role: ficha?.role }, true);
            }
            onClose();
        } catch (e: any) {
            notify(e?.message || 'Não foi possível salvar.', 'error');
        } finally {
            setSalvando(false);
        }
    };

    return (
        <Sheet open={open} onClose={onClose} size="lg">
            <SheetHeader onClose={onClose}>
                <SheetTitle>{editando ? 'Editar acesso' : 'Liberar acesso ao Portal de Treinamentos'}</SheetTitle>
                <SheetDescription>
                    {editando
                        ? 'O e-mail é o login da pessoa; ao mudar, envie o convite de novo.'
                        : 'Depois de liberar, envie o convite por e-mail: a pessoa cria a senha e entra em /portal-treinamentos.'}
                </SheetDescription>
            </SheetHeader>

            <SheetPanel className="p-6">
                <div className="space-y-4">
                    <Campo label="Quem é">
                        <div className="flex gap-2">
                            {(['COLABORADOR', 'TERCEIRO'] as const).map(t => (
                                <button
                                    key={t}
                                    type="button"
                                    disabled={editando}
                                    onClick={() => set('tipo', t)}
                                    className={`h-9 px-3 rounded-[6px] border text-sm font-medium transition-all disabled:opacity-60 ${
                                        form.tipo === t ? 'bg-blue-600 border-blue-600 text-white' : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-gray-300'
                                    }`}
                                >
                                    {TIPO_LABEL[t]}
                                </button>
                            ))}
                        </div>
                        {form.tipo === 'TERCEIRO' && !editando && (
                            <p className="text-xs text-gray-400">
                                Prestador ou funcionário de empreiteiro. Uma ficha de treinamento é criada em Colaboradores
                                (tipo Empreiteiro) só para a Academia matricular e certificar.
                            </p>
                        )}
                    </Campo>

                    {form.tipo === 'COLABORADOR' && !editando && (
                        <Campo label="Colaborador">
                            <div className="relative">
                                <select
                                    value={form.employeeId || ''}
                                    onChange={e => escolherColaborador(e.target.value)}
                                    className={inputCls + ' appearance-none pr-8'}
                                >
                                    <option value="">Selecione...</option>
                                    {elegiveis.map(e => <option key={e.id} value={e.id}>{e.name} — {e.role}</option>)}
                                </select>
                                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                            </div>
                            {elegiveis.length === 0 && (
                                <p className="text-xs text-amber-600">Todos os colaboradores ativos já têm acesso.</p>
                            )}
                        </Campo>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                        <Campo label="Nome">
                            <input value={form.name} onChange={e => set('name', e.target.value)} className={inputCls} />
                        </Campo>
                        <Campo label="E-mail (login)">
                            <input type="email" value={form.email} onChange={e => set('email', e.target.value)} className={inputCls} placeholder="nome@empresa.com.br" />
                        </Campo>
                        <Campo label="Telefone">
                            <input value={form.phone || ''} onChange={e => set('phone', e.target.value)} className={inputCls} />
                        </Campo>
                        <Campo label="CPF">
                            <input value={form.cpf || ''} onChange={e => set('cpf', e.target.value)} className={inputCls} />
                        </Campo>
                    </div>

                    {form.tipo === 'TERCEIRO' && (
                        <div className="grid grid-cols-2 gap-4">
                            <Campo label="Empresa (empreiteiro / prestador)">
                                <input value={form.empresaTerceira || ''} onChange={e => set('empresaTerceira', e.target.value)} className={inputCls} placeholder="Razão social ou nome" />
                            </Campo>
                            <Campo label="Empreiteiro cadastrado (opcional)">
                                <div className="relative">
                                    <select
                                        value={form.contractorId || ''}
                                        onChange={e => {
                                            const c = contractors.find(x => x.id === e.target.value);
                                            setForm(p => ({ ...p, contractorId: e.target.value || null, empresaTerceira: p.empresaTerceira || c?.razao_social || '' }));
                                        }}
                                        className={inputCls + ' appearance-none pr-8'}
                                    >
                                        <option value="">Nenhum</option>
                                        {contractors.map(c => <option key={c.id} value={c.id}>{c.razao_social}</option>)}
                                    </select>
                                    <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                                </div>
                            </Campo>
                            {!editando && (
                                <Campo label="Função">
                                    <input value={form.funcao || ''} onChange={e => set('funcao', e.target.value)} className={inputCls} placeholder="Ex.: Pedreiro, Eletricista" />
                                </Campo>
                            )}
                        </div>
                    )}
                </div>
            </SheetPanel>

            <SheetFooter>
                <Button variant="ghost" size="lg" onClick={onClose}>Cancelar</Button>
                <button
                    onClick={salvar}
                    disabled={salvando}
                    className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 transition-all font-medium text-[13px] active:scale-95 disabled:opacity-50"
                >
                    {salvando ? <Loader2 className="w-[15px] h-[15px] animate-spin" /> : null}
                    {salvando ? 'Salvando...' : (editando ? 'Salvar' : 'Liberar acesso')}
                </button>
            </SheetFooter>
        </Sheet>
    );
};

export default AcademyPortalAccessTab;
