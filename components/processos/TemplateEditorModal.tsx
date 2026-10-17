/**
 * Editor de modelo de processo (template + etapas sequenciais).
 *
 * Vivia dentro de `components/ProcessosModule.tsx` desde a F1 (04/07/2026) e
 * saiu para arquivo próprio em 16/10/2026, quando a Torre de Controle do
 * fluxo P2P passou a abrir o MESMO editor a partir de uma transição do
 * fluxo (`inicial` com `trigger_type='EVENTO'` e o evento da aresta). Não é
 * um segundo editor: o módulo Processos importa daqui e nada muda para ele.
 *
 * `STEP_TYPE_LABEL` e `ListaDeMarcacao` são exportados porque o módulo os usa
 * fora do editor (timeline da instância, fila "Pendente comigo", Equipes).
 */
import React, { useEffect, useState } from 'react';
import { Layers, Plus, Loader2, GitBranch } from 'lucide-react';
import ActionIconButton from '../ui/ActionIconButton';
import { processService, problemaDoModelo } from '../../services/processService';
import type {
    ProcessTemplate, ProcessTemplateStep, ProcessStepType, ProcessEventKey, ProcessTriggerType,
    ProcessTemplateStepDraft, ProcessTemplateHeader, ProcessCondition, ProcessConditionField,
    ProcessConditionOp, ProcessAssignableMember, ProcessGroup, ProcessResponsibleType,
} from '../../types/process';
import { PROCESS_EVENT_LABEL } from '../../types/process';
import { CONDITION_FIELD_LABEL, CONDITION_OP_LABEL, CONDITION_OPS_BY_FIELD, validarCondicao } from '../../utils/processCondition';
import { useStore } from '../../store/useStore';
import { supplierService } from '../../services/supplierService';
import SupplierSelect, { type SupplierOption } from '../SupplierSelect';
import Button from '../ui/Button';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '../ui/modal';

export const STEP_TYPE_LABEL: Record<ProcessStepType, string> = {
    approval: 'Aprovação', task: 'Tarefa', document: 'Documento', validation: 'Validação', manual: 'Manual',
};

// ─── criar template ─────────────────────────────────────────

/** Etapa como o formulário a edita: a condição guarda o valor como TEXTO (ou lista de ids, no `in`) até gravar. */
interface EtapaEmEdicao {
    /** Etapa que já existe no modelo (edição). Ausente = etapa nova. */
    id?: string;
    name: string;
    step_type: ProcessStepType;
    requires_document: boolean;
    condition: { field: ProcessConditionField; op: ProcessConditionOp; value: string | string[] } | null;
    /** F3 — SLA da etapa em horas (texto até gravar; vazio = sem prazo). */
    sla_hours: string;
    /** F3/F3.2 — responsável codificado: '' | 'USER:<user_id>' | 'DEPARTMENT:<id>' | 'ROLE:<id>'. */
    responsavel: string;
    escalation_user_id: string;
    escalation_after_hours: string;
}

const ETAPA_VAZIA: EtapaEmEdicao = {
    name: '', step_type: 'manual', requires_document: false, condition: null,
    sla_hours: '', responsavel: '', escalation_user_id: '', escalation_after_hours: '',
};

/** 'DEPARTMENT:abc' → { type, id }; '' → nulls. */
function decodificarResponsavel(v: string): { type: ProcessResponsibleType | null; id: string | null } {
    const i = v.indexOf(':');
    if (i < 0) return { type: null, id: null };
    return { type: v.slice(0, i) as ProcessResponsibleType, id: v.slice(i + 1) || null };
}


/**
 * Responsável da etapa: uma pessoa OU um departamento/cargo (F3.2). Grupo sem
 * ninguém marcado aparece com o aviso no próprio rótulo — dá para escolher,
 * mas quem escolhe fica sabendo que a etapa nasce sem dono.
 */
function ResponsavelSelect({ value, onChange, membros, grupos }: {
    value: string; onChange: (v: string) => void; membros: ProcessAssignableMember[]; grupos: ProcessGroup[];
}) {
    const deps = grupos.filter(g => g.type === 'DEPARTMENT');
    const roles = grupos.filter(g => g.type === 'ROLE');
    const rotulo = (g: ProcessGroup) => `${g.name}${g.memberUserIds.length === 0 ? ' — ninguém marcado em Equipes' : ` (${g.memberUserIds.length})`}`;
    return (
        <select value={value} onChange={e => onChange(e.target.value)}
            className="h-9 px-2 rounded-[6px] border border-gray-200 text-sm font-normal min-w-44 max-w-64 truncate">
            <option value="">Responsável (quem assume)</option>
            <optgroup label="Pessoas">
                {membros.map(m => (
                    <option key={m.email} value={m.userId ? `USER:${m.userId}` : ''} disabled={!m.userId}
                        title={m.userId ? undefined : 'Sem login vinculado — o membro precisa entrar no app uma vez'}>
                        {m.name}{m.userId ? '' : ' (sem login vinculado)'}
                    </option>
                ))}
            </optgroup>
            {deps.length > 0 && (
                <optgroup label="Departamentos">
                    {deps.map(g => <option key={g.id} value={`DEPARTMENT:${g.id}`}>{rotulo(g)}</option>)}
                </optgroup>
            )}
            {roles.length > 0 && (
                <optgroup label="Cargos">
                    {roles.map(g => <option key={g.id} value={`ROLE:${g.id}`}>{rotulo(g)}</option>)}
                </optgroup>
            )}
        </select>
    );
}

const horasOuNull = (v: string): number | null => {
    if (v.trim() === '') return null;
    const n = Number(v.replace(',', '.'));
    return Number.isFinite(n) && n >= 0 ? n : null;
};

/** Seletor de membro da organização. Quem não tem login vinculado aparece desabilitado COM o motivo — nunca escondido. */
function MembroSelect({ value, onChange, membros, placeholder, className = 'min-w-44 max-w-56' }: {
    value: string; onChange: (userId: string) => void; membros: ProcessAssignableMember[]; placeholder: string;
    /** Largura: compacto na linha da etapa (padrão); `w-full` no cabeçalho do formulário. */
    className?: string;
}) {
    return (
        <select value={value} onChange={e => onChange(e.target.value)}
            className={`h-9 px-2 rounded-[6px] border border-gray-200 text-sm font-normal truncate ${className}`}>
            <option value="">{placeholder}</option>
            {membros.map(m => (
                <option key={m.email} value={m.userId ?? ''} disabled={!m.userId}
                    title={m.userId ? undefined : 'Sem login vinculado — o membro precisa entrar no app uma vez'}>
                    {m.name}{m.userId ? '' : ' (sem login vinculado)'}
                </option>
            ))}
        </select>
    );
}

/** Texto do formulário → `ProcessCondition` (valor numérico para `amount`, lista para `in`); null quando não há condição. */
function condicaoParaGravar(c: EtapaEmEdicao['condition']): ProcessCondition | null {
    if (!c) return null;
    if (Array.isArray(c.value)) return { field: c.field, op: c.op, value: c.value };
    if (c.field !== 'amount') return { field: c.field, op: c.op, value: c.value };
    const n = Number(String(c.value).replace(/\./g, '').replace(',', '.'));
    return { field: c.field, op: c.op, value: Number.isFinite(n) && c.value !== '' ? n : String(c.value) };
}

/** Lista de marcação para o operador `in` (obras ou fornecedores). Rola quando passa de ~6 itens. */
export function ListaDeMarcacao({ opcoes, marcados, onChange }: {
    opcoes: { id: string; name: string }[];
    marcados: string[];
    onChange: (ids: string[]) => void;
}) {
    return (
        <div className="max-h-40 overflow-y-auto rounded-[6px] border border-gray-200 divide-y divide-gray-100 min-w-64">
            {opcoes.length === 0 && <p className="px-3 py-2 text-sm text-gray-400">Nenhum item disponível.</p>}
            {opcoes.map(o => (
                <label key={o.id} className="flex items-center gap-2 px-3 h-9 text-sm font-normal text-gray-700 cursor-pointer hover:bg-gray-50">
                    <input type="checkbox" className="w-4 h-4 rounded border-gray-300 text-blue-600"
                        checked={marcados.includes(o.id)}
                        onChange={e => onChange(e.target.checked ? [...marcados, o.id] : marcados.filter(id => id !== o.id))} />
                    <span className="truncate">{o.name}</span>
                </label>
            ))}
        </div>
    );
}

/** Etapa gravada no modelo → como o formulário a edita (o inverso de `condicaoParaGravar`). */
function etapaParaEdicao(s: ProcessTemplateStep): EtapaEmEdicao {
    const c = s.condition;
    return {
        id: s.id,
        name: s.name,
        step_type: s.step_type,
        requires_document: s.requires_document,
        condition: c ? { field: c.field, op: c.op, value: Array.isArray(c.value) ? c.value.map(String) : String(c.value ?? '') } : null,
        sla_hours: s.sla_hours != null ? String(s.sla_hours) : '',
        responsavel: s.default_responsible_type && s.default_responsible_id ? `${s.default_responsible_type}:${s.default_responsible_id}` : '',
        escalation_user_id: s.escalation_user_id ?? '',
        escalation_after_hours: s.escalation_after_hours != null ? String(s.escalation_after_hours) : '',
    };
}

const EVENT_KEYS = Object.keys(PROCESS_EVENT_LABEL) as ProcessEventKey[];

/** Modelo em edição: o modelo gravado + as etapas dele. Ausente = criar modelo novo. */
export interface ModeloEmEdicao { template: ProcessTemplate; steps: ProcessTemplateStep[] }

export default function TemplateEditorModal({ open, onClose, organizationId, onSaved, editando, inicial }: {
    open: boolean; onClose: () => void; organizationId: string; onSaved: () => void; editando?: ModeloEmEdicao | null;
    /**
     * Valores de partida de um modelo NOVO (a Torre de Controle abre o editor a
     * partir de uma transição do fluxo P2P, já com o evento escolhido). Só é
     * lido ao abrir sem `editando`; quem passa um literal inline não dispara
     * reabertura a cada render porque o efeito depende só de `open`/`editando`.
     */
    inicial?: Pick<ProcessTemplateHeader, 'trigger_type' | 'trigger_event_key' | 'name'>;
}) {
    const [name, setName] = useState('');
    const [category, setCategory] = useState('');
    const [steps, setSteps] = useState<EtapaEmEdicao[]>([{ ...ETAPA_VAZIA }]);
    // Dono e disparo (04/10/2026): modelo automático sem dono deixava processo vencer sem aviso.
    const [ownerUserId, setOwnerUserId] = useState('');
    const [triggerType, setTriggerType] = useState<ProcessTriggerType>('MANUAL');
    const [triggerEventKey, setTriggerEventKey] = useState('');
    // Valor mínimo (16/10/2026): texto do campo; vazio = todo evento abre processo.
    const [minAmount, setMinAmount] = useState('');
    const [saving, setSaving] = useState(false);
    const [erro, setErro] = useState<string | null>(null);
    // Preenche o formulário ao abrir: com o modelo (editar) ou vazio (criar).
    useEffect(() => {
        if (!open) return;
        const t = editando?.template;
        setName(t?.name ?? inicial?.name ?? '');
        setCategory(t?.category ?? '');
        setOwnerUserId(t?.owner_user_id ?? '');
        setTriggerType(t?.trigger_type ?? inicial?.trigger_type ?? 'MANUAL');
        setTriggerEventKey(t?.trigger_event_key ?? inicial?.trigger_event_key ?? '');
        setMinAmount(t?.trigger_min_amount != null ? String(t.trigger_min_amount) : '');
        setSteps(editando?.steps.length ? editando.steps.map(etapaParaEdicao) : [{ ...ETAPA_VAZIA }]);
        setErro(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, editando]);
    // Obras da organização ativa (só OBRA, sem projeto de sistema — REGRA #2/#3 já cortadas no store).
    const obras = useStore(s => s.projects);
    // Fornecedores para a condição por fornecedor — carregados só com o modal aberto (§7.1.1: drawer, não <select>).
    const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
    // Membros para responsável/escalado (F3) — idem, só com o modal aberto.
    const [membros, setMembros] = useState<ProcessAssignableMember[]>([]);
    // Departamentos e cargos da org, para responsável por grupo (F3.2).
    const [grupos, setGrupos] = useState<ProcessGroup[]>([]);
    useEffect(() => {
        if (!open) return;
        supplierService.listSuppliers(organizationId)
            .then(lista => setSuppliers(lista.map(s => ({ id: s.id, name: s.name, nickname: s.nickname ?? null }))))
            .catch(() => setSuppliers([]));
        processService.listAssignableMembers(organizationId).then(setMembros).catch(() => setMembros([]));
        processService.listGroups(organizationId).then(setGrupos).catch(() => setGrupos([]));
    }, [open, organizationId]);

    if (!open) return null;

    const addStep = () => setSteps(s => [...s, { ...ETAPA_VAZIA }]);
    const removeStep = (idx: number) => setSteps(s => s.filter((_, i) => i !== idx));
    const setStep = (idx: number, patch: Partial<EtapaEmEdicao>) => setSteps(arr => arr.map((x, i) => i === idx ? { ...x, ...patch } : x));

    const save = async () => {
        // Condição inválida bloqueia o salvar COM o motivo (o botão nunca fica mudo).
        const condicoes = steps.map(s => condicaoParaGravar(s.condition));
        for (let i = 0; i < steps.length; i++) {
            const problema = validarCondicao(condicoes[i]);
            if (problema) { setErro(`Etapa ${i + 1}: ${problema}`); return; }
        }
        // Escalonamento sem prazo não tem quando disparar — o botão diz por quê em vez de gravar algo inerte.
        const semPrazoComEscalado = steps.findIndex(s => s.escalation_user_id && horasOuNull(s.sla_hours) === null);
        if (semPrazoComEscalado >= 0) { setErro(`Etapa ${semPrazoComEscalado + 1}: escalonamento exige SLA (h) preenchido.`); return; }
        const header = {
            name, category, trigger_type: triggerType,
            trigger_event_key: triggerType === 'EVENTO' ? (triggerEventKey || null) : null,
            owner_user_id: ownerUserId || null,
            trigger_min_amount: triggerType === 'EVENTO' && minAmount.trim() !== ''
                ? Number(minAmount.replace(',', '.'))
                : null,
        };
        const etapas: ProcessTemplateStepDraft[] = steps.map((s, i) => ({
            id: s.id,
            name: s.name, step_type: s.step_type, requires_document: s.requires_document,
            condition: condicoes[i],
            sla_hours: horasOuNull(s.sla_hours),
            default_responsible_type: decodificarResponsavel(s.responsavel).type,
            default_responsible_id: decodificarResponsavel(s.responsavel).id,
            escalation_user_id: s.escalation_user_id || null,
            escalation_after_hours: s.escalation_user_id ? (horasOuNull(s.escalation_after_hours) ?? 0) : null,
        }));
        // Mesma regra do service, checada antes para o motivo aparecer sem ida ao banco.
        const problema = problemaDoModelo(header, etapas);
        if (problema) { setErro(problema); return; }
        setErro(null);
        setSaving(true);
        try {
            if (editando) await processService.updateTemplate(editando.template.id, header, etapas);
            else await processService.createTemplate(organizationId, header, etapas);
            onSaved();
            onClose();
        } catch (e) {
            setErro(e instanceof Error ? e.message : String(e));
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal open={open} onClose={onClose} size="xl">
            <ModalHeader title={editando ? `Editar modelo · v${editando.template.version}` : 'Novo template de processo'} icon={<Layers className="w-5 h-5 text-blue-600" />} onClose={onClose} />
            <ModalBody className="space-y-4">
                {editando && (
                    <p className="text-sm text-gray-500">
                        Salvar cria a versão {editando.template.version + 1}. Processos já iniciados continuam com as etapas, prazos e responsáveis de quando começaram.
                    </p>
                )}
                {/* §21 rótulo sentence case · §30 malha: par space-y-1.5, grade gap-x-6 gap-y-4 */}
                <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-500">Nome</label>
                        <input value={name} onChange={e => setName(e.target.value)}
                            className="w-full h-9 px-3 rounded-[6px] border border-gray-200 text-sm" placeholder="Ex.: Admissão de funcionário" />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-500">Categoria</label>
                        <input value={category} onChange={e => setCategory(e.target.value)}
                            className="w-full h-9 px-3 rounded-[6px] border border-gray-200 text-sm" placeholder="Ex.: RH" />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-500">Disparo</label>
                        <select value={triggerType} onChange={e => setTriggerType(e.target.value as ProcessTriggerType)}
                            className="w-full h-9 px-2 rounded-[6px] border border-gray-200 text-sm font-normal">
                            <option value="MANUAL">Manual: alguém inicia</option>
                            <option value="EVENTO">Automático: nasce de um evento</option>
                        </select>
                    </div>
                    {triggerType === 'EVENTO' && (
                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-slate-500">Dispara quando</label>
                            <select value={triggerEventKey} onChange={e => setTriggerEventKey(e.target.value)}
                                className="w-full h-9 px-2 rounded-[6px] border border-gray-200 text-sm font-normal">
                                <option value="">Escolha o evento…</option>
                                {EVENT_KEYS.map(k => <option key={k} value={k}>{PROCESS_EVENT_LABEL[k]}</option>)}
                            </select>
                        </div>
                    )}
                    {triggerType === 'EVENTO' && (
                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-slate-500">Só dispara a partir de (R$)</label>
                            <input
                                type="number" min="0" step="0.01" inputMode="decimal"
                                value={minAmount} onChange={e => setMinAmount(e.target.value)}
                                className="w-full h-9 px-3 rounded-[6px] border border-gray-200 text-sm" placeholder="Vazio = todo evento"
                            />
                            <p className="text-xs text-gray-500">Vale para eventos com valor (título, boleto, pedido). Abaixo dele, o evento não abre processo.</p>
                        </div>
                    )}
                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-500">
                            Dono do modelo{triggerType === 'EVENTO' ? ' (obrigatório)' : ''}
                        </label>
                        <MembroSelect value={ownerUserId} onChange={setOwnerUserId} membros={membros} placeholder="Escolha o dono…" className="w-full" />
                        <p className="text-xs text-gray-500">Recebe o aviso quando uma etapa vence sem responsável nem escalado.</p>
                    </div>
                </div>

                <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-500">Etapas (sequenciais)</label>
                    <div className="space-y-4">
                        {steps.map((s, idx) => (
                            <div key={idx} className="space-y-1.5">
                                <div className="flex items-center gap-2">
                                    <span className="w-5 text-xs font-black text-gray-400">{idx + 1}.</span>
                                    <input value={s.name} onChange={e => setStep(idx, { name: e.target.value })}
                                        className="flex-1 h-9 px-3 rounded-[6px] border border-gray-200 text-sm" placeholder="Nome da etapa" />
                                    <select value={s.step_type} onChange={e => setStep(idx, { step_type: e.target.value as ProcessStepType })}
                                        className="h-9 px-2 rounded-[6px] border border-gray-200 text-sm font-normal">
                                        {(Object.keys(STEP_TYPE_LABEL) as ProcessStepType[]).map(t => (
                                            <option key={t} value={t}>{STEP_TYPE_LABEL[t]}</option>
                                        ))}
                                    </select>
                                    {!s.condition && (
                                        <ActionIconButton kind="settings" title="Só executa quando… (condição)" icon={<GitBranch className="w-4 h-4" />}
                                            onClick={() => setStep(idx, { condition: { field: 'amount', op: 'gt', value: '' } })} />
                                    )}
                                    {steps.length > 1 && (
                                        <ActionIconButton kind="delete" onClick={() => removeStep(idx)} />
                                    )}
                                </div>
                                {/* F3 — prazo, responsável e escalonamento da etapa */}
                                <div className="ml-7 flex flex-wrap items-center gap-2">
                                    <label className="flex items-center gap-1.5 text-xs text-gray-500 whitespace-nowrap">
                                        SLA (h)
                                        <input inputMode="decimal" value={s.sla_hours} onChange={e => setStep(idx, { sla_hours: e.target.value })}
                                            className="h-9 w-20 px-3 rounded-[6px] border border-gray-200 text-sm" placeholder="48" />
                                    </label>
                                    <ResponsavelSelect value={s.responsavel} onChange={v => setStep(idx, { responsavel: v })}
                                        membros={membros} grupos={grupos} />
                                    <MembroSelect value={s.escalation_user_id} onChange={v => setStep(idx, { escalation_user_id: v })}
                                        membros={membros} placeholder="Escalonar para… (opcional)" />
                                    {s.escalation_user_id && (
                                        <label className="flex items-center gap-1.5 text-xs text-gray-500 whitespace-nowrap">
                                            após (h)
                                            <input inputMode="decimal" value={s.escalation_after_hours} onChange={e => setStep(idx, { escalation_after_hours: e.target.value })}
                                                className="h-9 w-16 px-3 rounded-[6px] border border-gray-200 text-sm" placeholder="0" />
                                        </label>
                                    )}
                                </div>
                                {s.condition && (
                                    <div className="ml-7 flex flex-wrap items-center gap-2">
                                        <span className="text-xs text-gray-500 whitespace-nowrap">Só executa quando</span>
                                        <select value={s.condition.field}
                                            onChange={e => {
                                                const field = e.target.value as ProcessConditionField;
                                                setStep(idx, { condition: { field, op: CONDITION_OPS_BY_FIELD[field][0], value: '' } });
                                            }}
                                            className="h-9 px-2 rounded-[6px] border border-gray-200 text-sm font-normal">
                                            {(Object.keys(CONDITION_FIELD_LABEL) as ProcessConditionField[]).map(f => (
                                                <option key={f} value={f}>{CONDITION_FIELD_LABEL[f]}</option>
                                            ))}
                                        </select>
                                        <select value={s.condition.op}
                                            onChange={e => {
                                                const op = e.target.value as ProcessConditionOp;
                                                // `in` guarda lista; os outros, um valor só — trocar o operador zera o valor.
                                                setStep(idx, { condition: { ...s.condition!, op, value: op === 'in' ? [] : '' } });
                                            }}
                                            className="h-9 px-2 rounded-[6px] border border-gray-200 text-sm font-normal">
                                            {CONDITION_OPS_BY_FIELD[s.condition.field].map(op => (
                                                <option key={op} value={op}>{CONDITION_OP_LABEL[op]}</option>
                                            ))}
                                        </select>
                                        {s.condition.field === 'amount' ? (
                                            <input inputMode="decimal" value={s.condition.value as string}
                                                onChange={e => setStep(idx, { condition: { ...s.condition!, value: e.target.value } })}
                                                className="h-9 w-36 px-3 rounded-[6px] border border-gray-200 text-sm" placeholder="R$ 30000" />
                                        ) : s.condition.op === 'in' ? (
                                            <ListaDeMarcacao
                                                opcoes={s.condition.field === 'project_id'
                                                    ? obras.flatMap(p => p.id ? [{ id: p.id, name: p.name }] : [])
                                                    : suppliers}
                                                marcados={Array.isArray(s.condition.value) ? s.condition.value : []}
                                                onChange={ids => setStep(idx, { condition: { ...s.condition!, value: ids } })} />
                                        ) : s.condition.field === 'project_id' ? (
                                            <select value={s.condition.value as string}
                                                onChange={e => setStep(idx, { condition: { ...s.condition!, value: e.target.value } })}
                                                className="h-9 px-2 rounded-[6px] border border-gray-200 text-sm font-normal min-w-40">
                                                <option value="">Escolha a obra…</option>
                                                {obras.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                            </select>
                                        ) : (
                                            <div className="min-w-56">
                                                <SupplierSelect size="sm" suppliers={suppliers} value={s.condition.value as string}
                                                    onChange={id => setStep(idx, { condition: { ...s.condition!, value: id } })}
                                                    placeholder="Escolha o fornecedor…" />
                                            </div>
                                        )}
                                        <ActionIconButton kind="delete" title="Remover condição" onClick={() => setStep(idx, { condition: null })} />
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                    <Button variant="secondary" size="sm" onClick={addStep}>
                        <Plus className="w-3.5 h-3.5" /> Adicionar etapa
                    </Button>
                </div>
                {erro && <p className="text-sm text-red-600">{erro}</p>}
            </ModalBody>
            <ModalFooter>
                <Button variant="secondary" onClick={onClose}>Cancelar</Button>
                <Button onClick={save} disabled={saving}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : editando ? 'Salvar nova versão' : 'Criar template'}</Button>
            </ModalFooter>
        </Modal>
    );
}
