import React, { useEffect, useState } from 'react';
import { X, AlertTriangle, CheckCircle2, Loader2, Users } from 'lucide-react';
import { boletoService } from '../services/boletoService';
import type { Boleto, BoletoStatus } from '../types';
import { STATUS_LABELS, STATUS_TEXT_COLORS, STATUS_DO_LOTE, resumoDeStatusEmLote } from '../utils/boletoStatus';
import { formatBRL } from './BoletoFormModal';
import CostCenterSelect, { CostCenterOption } from './CostCenterSelect';
import PlanoContasSelect, { PlanoContasOption } from './PlanoContasSelect';
import SupplierSelect, { SupplierOption } from './SupplierSelect';
import HierarchicalSelect, { HierarchicalSelectItem } from './HierarchicalSelect';
import { financialRegistryService } from '../services/financialRegistryService';
import { nomeDoBeneficiario } from '../utils/boletoBeneficiario';
import { resumoDaAprovacaoEmLote } from '../utils/boletoAprovacaoLote';

/** Valor da opção "— Sem vínculo —" da Obra: tira a obra dos boletos (grava null). */
const SEM_VINCULO = '__sem_vinculo__';

interface ItemOption {
    id: string;
    name: string;
}

interface BoletoEdicaoEmLoteModalProps {
    boletos: Boleto[];
    organizationId: string;
    suppliers: SupplierOption[];
    projects: ItemOption[];
    costCenters: CostCenterOption[];
    userEmail?: string;
    onClose: () => void;
    onSaved: () => void;
}

/** `ficaram`: a regra não deixou mudar (status) — não é erro, é "ficou como estava". */
type ActionResult = {
    ok: string[];
    errors: Array<{ id: string; error: string }>;
    ficaram?: Array<{ id: string; motivo: string }>;
    acao?: 'aprovar' | 'status';
    para?: BoletoStatus;
} | null;

const BoletoEdicaoEmLoteModal: React.FC<BoletoEdicaoEmLoteModalProps> = ({
    boletos, organizationId, suppliers, projects, costCenters, userEmail, onClose, onSaved,
}) => {
    // Nome do beneficiário na lista: o mesmo da coluna da tela, nunca o arquivo (16/10/2026).
    const nomesFornecedor = Object.fromEntries(suppliers.map(f => [f.id, f.nickname || f.name]));
    const [supplierId, setSupplierId] = useState('');
    const [projectId, setProjectId] = useState('');
    const [costCenterId, setCostCenterId] = useState('');
    const [planoDeContasId, setPlanoDeContasId] = useState('');
    const [categoryId, setCategoryId] = useState('');
    const [descricao, setDescricao] = useState('');
    // Conta Financeira e Plano de Contas — carregados aqui mesmo: o BoletoManager
    // não os tem em mãos (só busca Fornecedor/Obra/Centro de Custo para a tabela).
    const [contasFinanceiras, setContasFinanceiras] = useState<HierarchicalSelectItem[]>([]);
    const [planoContas, setPlanoContas] = useState<PlanoContasOption[]>([]);
    useEffect(() => {
        financialRegistryService.listChartOfAccounts(organizationId)
            .then(rows => setContasFinanceiras(rows.map(c => ({ id: c.id, name: c.name, parentId: c.parent_id ?? null }))))
            .catch(() => setContasFinanceiras([]));
        financialRegistryService.listPlanoContas(organizationId)
            .then(setPlanoContas)
            .catch(() => setPlanoContas([]));
    }, [organizationId]);
    const [saving, setSaving] = useState(false);
    const [result, setResult] = useState<ActionResult>(null);
    /* Mudar status em lote (23/10/2026): mesma regra do campo Status da página. */
    const [novoStatus, setNovoStatus] = useState<BoletoStatus | ''>('');
    const [motivoStatus, setMotivoStatus] = useState('');

    const totalValor = boletos.reduce((s, b) => s + (b.valor ?? 0), 0);

    const beneficiarios = [...new Set(boletos.map(b => b.supplier_id ?? b.beneficiario_nome ?? ''))];
    const mixedBeneficiario = beneficiarios.length > 1;

    function buildFields() {
        const fields: Partial<Pick<Boleto, 'supplier_id' | 'cost_center_id' | 'plano_de_contas_id' | 'category_id' | 'project_id' | 'descricao'>> = {};
        // "— Sem vínculo —" (SEM_VINCULO) desvincula (grava null); "— Não alterar —" ('') não
        // manda o campo — mesmo defeito do formulário de 1 boleto corrigido em 14/10/2026.
        if (supplierId)        fields.supplier_id        = supplierId === SEM_VINCULO ? null : supplierId;
        if (projectId)         fields.project_id         = projectId === SEM_VINCULO ? null : projectId;
        if (costCenterId)      fields.cost_center_id     = costCenterId === SEM_VINCULO ? null : costCenterId;
        if (planoDeContasId)   fields.plano_de_contas_id = planoDeContasId === SEM_VINCULO ? null : planoDeContasId;
        if (categoryId)        fields.category_id    = categoryId;
        if (descricao.trim())  fields.descricao      = descricao.trim();
        return fields;
    }

    // Agrupa boletos por organization_id para suportar seleção multi-org
    function groupByOrg(): Record<string, string[]> {
        const g: Record<string, string[]> = {};
        for (const b of boletos) {
            const oid = b.organization_id || organizationId;
            (g[oid] ??= []).push(b.id);
        }
        return g;
    }

    async function handleSalvarRascunho() {
        setSaving(true);
        try {
            const fields = buildFields();
            for (const [oid, ids] of Object.entries(groupByOrg())) {
                await boletoService.associarEmLote(ids, oid, fields, userEmail);
            }
            onSaved();
            onClose();
        } catch (err: unknown) {
            setResult({ ok: [], errors: [{ id: '', error: err instanceof Error ? err.message : String(err) }] });
        } finally {
            setSaving(false);
        }
    }

    async function handleAprovarELancar() {
        setSaving(true);
        const allOk: string[] = [];
        const allErrors: Array<{ id: string; error: string }> = [];
        try {
            const fields = buildFields();
            for (const [oid, ids] of Object.entries(groupByOrg())) {
                const res = await boletoService.aprovarEmLote(ids, oid, fields, userEmail);
                allOk.push(...res.ok);
                allErrors.push(...res.errors);
            }
        } catch (err: unknown) {
            allErrors.push({ id: '', error: err instanceof Error ? err.message : String(err) });
        } finally {
            setSaving(false);
        }
        // Mostrar resultado ANTES de chamar onSaved (que recarrega os dados no pai)
        setResult({ ok: allOk, errors: allErrors, acao: 'aprovar' });
        if (allOk.length > 0) onSaved();
    }

    async function handleAplicarStatus() {
        if (!novoStatus) return;
        setSaving(true);
        const r: NonNullable<ActionResult> = { ok: [], errors: [], ficaram: [], acao: 'status', para: novoStatus };
        try {
            for (const [oid, ids] of Object.entries(groupByOrg())) {
                const res = await boletoService.mudarStatusEmLote(ids, oid, novoStatus, { motivo: motivoStatus, userEmail });
                r.ok.push(...res.ok);
                r.errors.push(...res.errors);
                r.ficaram!.push(...res.ficaram);
            }
        } catch (err: unknown) {
            r.errors.push({ id: '', error: err instanceof Error ? err.message : String(err) });
        } finally {
            setSaving(false);
        }
        setResult(r);
        if (r.ok.length > 0) onSaved();
    }

    const allDone = result !== null && result.errors.length === 0;
    const noneChanged = !supplierId && !projectId && !costCenterId && !planoDeContasId && !categoryId && !descricao.trim();

    /* "Aprovar e Lançar" sem exigir alteração (21/10/2026, pedido do usuário):
       a MESMA regra do serviço diz quem está pronto — rascunho/revisão com
       fornecedor (o escolhido aqui, o do boleto ou o sugerido), vencimento e valor. */
    const resumo = resumoDaAprovacaoEmLote(boletos, buildFields());
    const motivoParaNaoAprovar: string | null = resumo.prontos > 0
        ? null
        : resumo.pendencias.length === 1
            ? resumo.pendencias[0].motivo
            : `Nenhum dos ${boletos.length} boletos pode ser lançado — veja o motivo de cada um na lista.`;
    const tituloDoAprovar = motivoParaNaoAprovar
        ?? `Lança ${resumo.prontos} de ${boletos.length} em Contas a Pagar e os envia para a alçada.`
            + (resumo.pendencias.length === 1 ? ' O outro fica como está.'
                : resumo.pendencias.length > 1 ? ` Os outros ${resumo.pendencias.length} ficam como estão.` : '');
    const resumoStatus = novoStatus ? resumoDeStatusEmLote(boletos, novoStatus) : null;
    const faltaMotivoStatus = novoStatus === 'cancelado' && !motivoStatus.trim();
    const motivoParaNaoAplicarStatus: string | null = !resumoStatus ? null
        : resumoStatus.mudam === 0 ? 'Nenhum dos boletos selecionados pode ir para este status — veja o motivo de cada um na lista.'
        : faltaMotivoStatus ? 'Escreva o motivo do cancelamento.'
        : null;
    const numeroDoBoleto = (id: string) => {
        const n = boletos.find(b => b.id === id)?.numero;
        return n != null ? `#${String(n).padStart(4, '0')}` : `${id.slice(0, 8)}…`;
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">

                {/* Header */}
                <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
                    <div>
                        <h2 className="text-lg font-black text-gray-900">Edição em Lote</h2>
                        <p className="text-xs text-gray-400 mt-0.5">
                            {boletos.length} boleto{boletos.length !== 1 ? 's' : ''} selecionado{boletos.length !== 1 ? 's' : ''} · {formatBRL(totalValor)}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        disabled={saving}
                        className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100 transition-colors disabled:opacity-50"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="overflow-y-auto flex-1 px-6 py-4 space-y-5">

                    {/* Aviso beneficiários misturados */}
                    {mixedBeneficiario && !result && (
                        <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-xs">
                            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                            <span>
                                Os boletos selecionados têm <strong>{beneficiarios.length} beneficiários distintos</strong>.
                                A edição se aplica a todos igualmente.
                            </span>
                        </div>
                    )}

                    {/* Quantos o "Aprovar e Lançar" vai lançar (mesma regra do serviço) */}
                    {!result && (
                        <p className="text-xs text-gray-600">
                            <span className="font-semibold text-gray-800">{resumo.prontos} de {boletos.length}</span> pronto{resumo.prontos !== 1 ? 's' : ''} para lançar
                            {resumo.comSugestao > 0 && <> · {resumo.comSugestao} com o fornecedor sugerido</>}
                        </p>
                    )}

                    {/* Lista resumida — com o que impede cada boleto de ser lançado */}
                    <div className="bg-gray-50 rounded-2xl border border-gray-100 divide-y divide-gray-100 max-h-48 overflow-y-auto">
                        {boletos.map(b => {
                            const avaliacao = resumo.porId.get(b.id);
                            const planoStatus = resumoStatus?.porId.get(b.id);
                            return (
                                <div key={b.id} className="flex items-start justify-between px-4 py-2 text-xs">
                                    <span className="min-w-0 max-w-[70%]">
                                        <span className="block text-gray-700 font-medium truncate" title={nomeDoBeneficiario(b, nomesFornecedor)}>
                                            {nomeDoBeneficiario(b, nomesFornecedor)}
                                            {' · '}<span className={`font-normal ${STATUS_TEXT_COLORS[b.status]}`}>{STATUS_LABELS[b.status]}</span>
                                        </span>
                                        {/* Com um status escolhido, a linha diz o que acontece com ESTE boleto. */}
                                        {!result && planoStatus && (planoStatus.muda
                                            ? <span className="block text-gray-500">→ {STATUS_LABELS[planoStatus.transicao.para]}</span>
                                            : <span className="block text-amber-700">{planoStatus.motivo}</span>)}
                                        {!result && !planoStatus && avaliacao && !avaliacao.pronto && (
                                            <span className="block text-amber-700">{avaliacao.motivo}</span>
                                        )}
                                        {!result && !planoStatus && avaliacao?.pronto && avaliacao.usaSugestao && (
                                            <span className="block text-gray-500">
                                                Fornecedor sugerido: {nomesFornecedor[avaliacao.fornecedor] ?? 'cadastrado'}
                                            </span>
                                        )}
                                    </span>
                                    <span className="text-gray-500 font-bold flex-shrink-0 ml-2">{formatBRL(b.valor)}</span>
                                </div>
                            );
                        })}
                    </div>

                    {/* Resultado da operação (aparece após Aprovar e Lançar) */}
                    {result && (
                        <div className="space-y-2">
                            {result.ok.length > 0 && (
                                <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs">
                                    <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                                    <span>
                                        {result.ok.length} boleto{result.ok.length !== 1 ? 's' : ''}{' '}
                                        {result.acao === 'status' && result.para
                                            ? `passa${result.ok.length !== 1 ? 'ram' : 'ou'} para "${STATUS_LABELS[result.para]}".`
                                            : `aprovado${result.ok.length !== 1 ? 's' : ''} com sucesso.`}
                                    </span>
                                </div>
                            )}
                            {result.errors.map((e, i) => (
                                <div key={i} className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs">
                                    <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                                    <span>{e.id ? `Boleto ${numeroDoBoleto(e.id)}: ` : ''}{e.error}</span>
                                </div>
                            ))}
                            {result.ficaram?.map(f => (
                                <div key={f.id} className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs">
                                    <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                                    <span>Boleto {numeroDoBoleto(f.id)} ficou como estava: {f.motivo}</span>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Mudar status (23/10/2026) — mesma regra do campo Status da página do
                        boleto (utils/boletoStatus.ts): cada boleto muda só se o caminho existe,
                        com o efeito de sempre no financeiro; ação própria, separada dos campos. */}
                    {!allDone && (
                        <div className="space-y-3">
                            <div>
                                <label htmlFor="lote-status" className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-1 block">Mudar status</label>
                                <select
                                    id="lote-status"
                                    value={novoStatus}
                                    onChange={e => { setNovoStatus(e.target.value as BoletoStatus | ''); setMotivoStatus(''); setResult(null); }}
                                    disabled={saving}
                                    className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 outline-none focus:border-blue-400 disabled:opacity-50"
                                >
                                    <option value="">— Não alterar —</option>
                                    {STATUS_DO_LOTE.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                                </select>
                                <p className="text-xs text-gray-500 mt-1">Para aprovar, use "Aprovar e Lançar".</p>
                            </div>
                            {resumoStatus && (
                                <div role="region" aria-label="Mudança de status em lote" className="p-3 rounded-xl bg-amber-50 border border-amber-200 space-y-2 text-xs text-gray-900">
                                    <p>
                                        <span className="font-semibold">{resumoStatus.mudam} de {boletos.length}</span> passa{resumoStatus.mudam !== 1 ? 'm' : ''} para "{STATUS_LABELS[novoStatus as BoletoStatus]}"
                                        {resumoStatus.ficam > 0 && <> · {resumoStatus.ficam} fica{resumoStatus.ficam !== 1 ? 'm' : ''} como {resumoStatus.ficam !== 1 ? 'estão' : 'está'}</>}
                                    </p>
                                    {resumoStatus.efeitos.map(e => (
                                        <p key={`${e.de}-${e.descricao}`}>
                                            <span className="font-semibold">{STATUS_LABELS[e.de]} ({e.quantos}):</span> {e.descricao}
                                        </p>
                                    ))}
                                    {novoStatus === 'cancelado' && resumoStatus.mudam > 0 && (
                                        <textarea
                                            rows={2}
                                            value={motivoStatus}
                                            onChange={e => setMotivoStatus(e.target.value)}
                                            disabled={saving}
                                            aria-label="Motivo do cancelamento"
                                            placeholder="Motivo do cancelamento (vale para todos)"
                                            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 outline-none focus:border-blue-400"
                                        />
                                    )}
                                    <div className="flex justify-end">
                                        <button
                                            type="button"
                                            onClick={handleAplicarStatus}
                                            disabled={saving || !!motivoParaNaoAplicarStatus}
                                            title={motivoParaNaoAplicarStatus ?? `Aplica o status em ${resumoStatus.mudam} boleto${resumoStatus.mudam !== 1 ? 's' : ''}.`}
                                            /* Mesma escala dos botões do rodapé desta janela (ainda na escala antiga, §16 — não misturar). */
                                            className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-white font-bold text-button uppercase tracking-widest transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${resumoStatus.mexeNoFinanceiro ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}
                                        >
                                            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                                            Aplicar status
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Campos de edição — ocultados após resultado final */}
                    {!allDone && (
                        <div className="space-y-4">
                            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-gray-400 pb-1 border-b border-gray-100">
                                <Users className="w-3.5 h-3.5" />
                                Alterar campos — deixe vazio para não alterar
                            </div>

                            <div>
                                <label className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-1 block">Fornecedor</label>
                                {/* "— Sem vínculo —" é uma linha DENTRO do drawer (não um link à parte — era onde
                                    o usuário procurava e não achava; print de 14/10/2026). */}
                                <SupplierSelect
                                    suppliers={suppliers}
                                    value={supplierId}
                                    onChange={setSupplierId}
                                    placeholder="— Não alterar —"
                                    fallbackLabel={supplierId === SEM_VINCULO ? '— Sem vínculo —' : undefined}
                                    clearLabel="— Sem vínculo —"
                                    clearValue={SEM_VINCULO}
                                    disabled={saving}
                                />
                            </div>

                            <div>
                                <label className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-1 block">Obra / Projeto</label>
                                <select
                                    value={projectId}
                                    onChange={e => setProjectId(e.target.value)}
                                    disabled={saving}
                                    className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 outline-none focus:border-blue-400 disabled:opacity-50"
                                >
                                    <option value="">— Não alterar —</option>
                                    <option value={SEM_VINCULO}>— Sem vínculo —</option>
                                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </select>
                            </div>

                            <div>
                                <label className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-1 block">Centro de Custo</label>
                                <CostCenterSelect
                                    costCenters={costCenters}
                                    value={costCenterId}
                                    onChange={setCostCenterId}
                                    placeholder="— Não alterar —"
                                    fallbackLabel={costCenterId === SEM_VINCULO ? '— Sem vínculo —' : undefined}
                                    clearLabel="— Sem vínculo —"
                                    clearValue={SEM_VINCULO}
                                    disabled={saving}
                                    hoverCls="hover:bg-blue-50"
                                />
                            </div>

                            <div>
                                <label className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-1 block">Plano de Contas</label>
                                <PlanoContasSelect
                                    planoContas={planoContas}
                                    value={planoDeContasId}
                                    onChange={setPlanoDeContasId}
                                    placeholder="— Não alterar —"
                                    fallbackLabel={planoDeContasId === SEM_VINCULO ? '— Sem vínculo —' : undefined}
                                    clearLabel="— Sem vínculo —"
                                    clearValue={SEM_VINCULO}
                                    disabled={saving}
                                />
                            </div>

                            <div>
                                <label className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-1 block">Conta Financeira</label>
                                <HierarchicalSelect
                                    items={contasFinanceiras}
                                    value={categoryId}
                                    onChange={setCategoryId}
                                    valueField="id"
                                    placeholder="— Não alterar —"
                                    disabled={saving}
                                    hoverCls="hover:bg-blue-50"
                                    panelVariant="drawer"
                                    drawerTitle="Selecionar Conta Financeira"
                                />
                            </div>

                            <div>
                                <label className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-1 block">Descrição</label>
                                <input
                                    type="text"
                                    value={descricao}
                                    onChange={e => setDescricao(e.target.value)}
                                    disabled={saving}
                                    placeholder="— Não alterar —"
                                    className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 outline-none focus:border-blue-400 disabled:opacity-50"
                                />
                            </div>

                            {noneChanged && (
                                <p className="text-xs text-gray-500 text-center">Altere ao menos um campo para salvar o rascunho.</p>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 pb-6 pt-4 border-t border-gray-100 flex items-center gap-3">
                    <button
                        onClick={onClose}
                        disabled={saving}
                        className="flex-1 px-4 py-3 rounded-2xl bg-gray-100 text-gray-700 font-bold text-button uppercase tracking-widest hover:bg-gray-200 transition-colors disabled:opacity-50"
                    >
                        {allDone ? 'Fechar' : 'Cancelar'}
                    </button>
                    {!allDone && (
                        <>
                            <button
                                onClick={handleSalvarRascunho}
                                disabled={saving || noneChanged}
                                title={noneChanged ? 'Altere ao menos um campo para salvar o rascunho.' : undefined}
                                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-gray-900 text-white font-bold text-button uppercase tracking-widest hover:bg-gray-800 transition-colors disabled:opacity-40"
                            >
                                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                                Salvar Rascunho
                            </button>
                            <button
                                onClick={handleAprovarELancar}
                                disabled={saving || !!motivoParaNaoAprovar}
                                title={tituloDoAprovar}
                                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-blue-600 text-white font-bold text-button uppercase tracking-widest hover:bg-blue-700 transition-colors disabled:opacity-40 shadow-lg shadow-blue-900/20"
                            >
                                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                                Aprovar e Lançar
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default BoletoEdicaoEmLoteModal;
