import { useState, useEffect } from 'react';
import { Tags, Search, Plus, X } from 'lucide-react';
import { listClassificationRules, createClassificationRule, toggleClassificationRule } from '../../services/nfeService';
import type { ClassificationRule, RuleType } from '../../types/fiscal';
import { KpiCard } from '../ui/KpiCard';
import { ColumnConfig, useTableColumns, ColumnConfigButton, SortableHeader, usePersistedState } from '../ui/TableUtils';

interface Props {
  organizationId: string | null;
  writeOrganizationId: string | null;
  onToast: (msg: string, type: 'ok' | 'err') => void;
}

const CATEGORY_COLORS: Record<string, string> = {
  'aço': 'text-amber-600',
  'concreto': 'text-emerald-600',
  'elétrica': 'text-blue-600',
  'hidráulica': 'text-teal-600',
  'alvenaria': 'text-orange-600',
  'material': 'text-purple-600',
  'equipamento': 'text-cyan-600',
};

function CategoryText({ cat }: { cat: string }) {
  return <span className={`text-sm font-normal ${CATEGORY_COLORS[cat] ?? 'text-gray-600'}`}>{cat}</span>;
}

const RULE_TYPES: RuleType[] = ['ncm', 'cfop', 'keyword'];
const CATEGORIES = ['aço', 'concreto', 'elétrica', 'hidráulica', 'alvenaria', 'material', 'equipamento'];

interface NewRuleForm {
  rule_type: RuleType;
  match_value: string;
  category: string;
  priority: number;
}

const EMPTY_FORM: NewRuleForm = {
  rule_type: 'ncm',
  match_value: '',
  category: 'material',
  priority: 50,
};

const COLUMNS: ColumnConfig[] = [
  { key: 'type', label: 'Tipo', sortable: true },
  { key: 'value', label: 'Valor', sortable: true },
  { key: 'category', label: 'Categoria', sortable: true },
  { key: 'priority', label: 'Prioridade', sortable: true },
  { key: 'scope', label: 'Escopo', sortable: true },
  { key: 'status', label: 'Status', sortable: true },
  { key: 'actions', label: 'Ações', sortable: false },
];

export function FiscalRules({ organizationId, writeOrganizationId, onToast }: Props) {
  const [rules, setRules] = useState<ClassificationRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<NewRuleForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = usePersistedState<string>('fiscalRules:search', '');
  const tableColumns = useTableColumns(COLUMNS, 'fiscalRulesColumns');

  const loadRules = () => {
    setLoading(true);
    listClassificationRules(organizationId)
      .then(setRules)
      .catch(() => onToast('Erro ao carregar regras', 'err'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadRules(); }, [organizationId]);

  const handleCreate = async () => {
    if (!form.match_value.trim()) {
      onToast('Informe o valor de correspondência', 'err');
      return;
    }
    if (!writeOrganizationId) {
      onToast('Selecione uma organização para criar a regra', 'err');
      return;
    }
    setSaving(true);
    try {
      await createClassificationRule({
        organization_id: writeOrganizationId,
        rule_type: form.rule_type,
        match_value: form.match_value.trim().toLowerCase(),
        category: form.category,
        priority: form.priority,
        is_active: true,
      });
      onToast('Regra criada com sucesso', 'ok');
      setShowForm(false);
      setForm(EMPTY_FORM);
      loadRules();
    } catch (err: any) {
      onToast(err.message ?? 'Erro ao criar regra', 'err');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (rule: ClassificationRule) => {
    try {
      await toggleClassificationRule(rule.id, !rule.is_active);
      setRules(prev => prev.map(r => r.id === rule.id ? { ...r, is_active: !r.is_active } : r));
    } catch {
      onToast('Erro ao alterar regra', 'err');
    }
  };

  const countByType = (type: RuleType) => rules.filter(r => r.rule_type === type).length;

  const term = searchTerm.trim().toLowerCase();
  const filtered = rules.filter(r =>
    !term || r.match_value.toLowerCase().includes(term) || r.category.toLowerCase().includes(term)
  );

  const shown = [...filtered].sort((a, b) => {
    if (tableColumns.sortColumn) {
      const dir = tableColumns.sortDirection === 'asc' ? 1 : -1;
      switch (tableColumns.sortColumn) {
        case 'type': return a.rule_type.localeCompare(b.rule_type) * dir;
        case 'value': return a.match_value.localeCompare(b.match_value) * dir;
        case 'category': return a.category.localeCompare(b.category) * dir;
        case 'priority': return (a.priority - b.priority) * dir;
        case 'scope': return (Number(!!a.organization_id) - Number(!!b.organization_id)) * dir;
        case 'status': return (Number(a.is_active) - Number(b.is_active)) * dir;
      }
    }
    return a.priority - b.priority; // default: prioridade mais alta primeiro (menor número)
  });

  const inputCls = 'w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all';
  const labelCls = 'text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-gray-900 tracking-tight">Regras de classificação</h1>
        <p className="text-gray-400 text-sm mt-1.5 font-medium">Regras heurísticas configuráveis — NCM, CFOP e palavras-chave. Sem código hardcoded.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KpiCard label="NCM" value={countByType('ncm')} icon={<Tags className="w-5 h-5" />} color="blue" />
        <KpiCard label="Palavra-chave" value={countByType('keyword')} icon={<Tags className="w-5 h-5" />} color="purple" />
        <KpiCard label="CFOP" value={countByType('cfop')} icon={<Tags className="w-5 h-5" />} color="teal" />
      </div>

      <div className="flex flex-col md:flex-row gap-2.5 items-center">
        <div className="flex-1 relative w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por valor ou categoria..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full h-9 pl-9 pr-4 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
          />
        </div>
        <div className="hidden md:block w-px h-6 bg-gray-200 shrink-0"></div>
        <div className="flex items-center h-9 bg-white px-1 rounded-[10px] border border-gray-100 gap-1 shrink-0">
          <ColumnConfigButton
            columns={COLUMNS.filter(c => c.key !== 'actions')}
            visibleColumns={tableColumns.visibleColumns}
            showColumnConfig={tableColumns.showColumnConfig}
            onToggleShow={() => tableColumns.setShowColumnConfig(!tableColumns.showColumnConfig)}
            onToggleColumn={tableColumns.toggleColumn}
            onReset={tableColumns.resetColumns}
          />
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 shrink-0"
        >
          {showForm ? <X className="w-[15px] h-[15px]" /> : <Plus className="w-[15px] h-[15px]" />}
          {showForm ? 'Cancelar' : 'Nova regra'}
        </button>
      </div>

      {showForm && (
        <div className="bg-gray-50 border border-gray-100 rounded-[10px] p-4 grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
          <div>
            <label className={labelCls}>Tipo</label>
            <select value={form.rule_type} onChange={e => setForm(f => ({ ...f, rule_type: e.target.value as RuleType }))} className={inputCls}>
              {RULE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Valor</label>
            <input
              type="text"
              placeholder={form.rule_type === 'ncm' ? 'ex: 7214' : form.rule_type === 'cfop' ? 'ex: 5101' : 'ex: vergalhão'}
              value={form.match_value}
              onChange={e => setForm(f => ({ ...f, match_value: e.target.value }))}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Categoria</label>
            <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className={inputCls}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Prioridade</label>
            <input
              type="number"
              min={1} max={999}
              value={form.priority}
              onChange={e => setForm(f => ({ ...f, priority: Number(e.target.value) }))}
              className={inputCls}
            />
          </div>
          <button
            onClick={handleCreate}
            disabled={saving}
            className="h-9 px-4 rounded-[6px] text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-all disabled:opacity-50"
          >
            {saving ? '…' : 'Salvar'}
          </button>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-gray-500 text-sm">Carregando...</p>
        </div>
      ) : shown.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-[10px] shadow-sm border border-gray-100">
          <Tags className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhuma regra encontrada</h3>
          <p className="text-sm text-gray-500">Crie uma nova regra ou ajuste a busca.</p>
        </div>
      ) : (
        <div className="bg-white rounded-[10px] shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                  {tableColumns.visibleColumns.includes('type') && (
                    <SortableHeader colKey="type" label="Tipo" uppercase={false}
                      sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort}
                      className="px-6 py-2 border-r border-gray-100" />
                  )}
                  {tableColumns.visibleColumns.includes('value') && (
                    <SortableHeader colKey="value" label="Valor" uppercase={false}
                      sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort}
                      className="px-6 py-2 border-r border-gray-100" />
                  )}
                  {tableColumns.visibleColumns.includes('category') && (
                    <SortableHeader colKey="category" label="Categoria" uppercase={false}
                      sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort}
                      className="px-6 py-2 border-r border-gray-100" />
                  )}
                  {tableColumns.visibleColumns.includes('priority') && (
                    <SortableHeader colKey="priority" label="Prioridade" uppercase={false}
                      sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort}
                      className="px-6 py-2 border-r border-gray-100" />
                  )}
                  {tableColumns.visibleColumns.includes('scope') && (
                    <SortableHeader colKey="scope" label="Escopo" uppercase={false}
                      sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort}
                      className="px-6 py-2 border-r border-gray-100" />
                  )}
                  {tableColumns.visibleColumns.includes('status') && (
                    <SortableHeader colKey="status" label="Status" uppercase={false}
                      sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort}
                      className="px-6 py-2 border-r border-gray-100" />
                  )}
                  {tableColumns.visibleColumns.includes('actions') && (
                    <th className="px-6 py-2 text-right text-sm font-semibold text-gray-500">Ações</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {shown.map(r => (
                  <tr key={r.id} className={`hover:bg-blue-50/50 transition-colors ${!r.is_active ? 'opacity-50' : ''}`}>
                    {tableColumns.visibleColumns.includes('type') && (
                      <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600">{r.rule_type}</td>
                    )}
                    {tableColumns.visibleColumns.includes('value') && (
                      <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-medium text-gray-800">{r.match_value}</td>
                    )}
                    {tableColumns.visibleColumns.includes('category') && (
                      <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0"><CategoryText cat={r.category} /></td>
                    )}
                    {tableColumns.visibleColumns.includes('priority') && (
                      <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal">
                        <span className={r.priority < 30 ? 'text-emerald-600' : r.priority < 60 ? 'text-amber-600' : 'text-gray-400'}>{r.priority}</span>
                      </td>
                    )}
                    {tableColumns.visibleColumns.includes('scope') && (
                      <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-500">
                        {r.organization_id ? 'empresa' : 'global'}
                      </td>
                    )}
                    {tableColumns.visibleColumns.includes('status') && (
                      <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal">
                        <span className={r.is_active ? 'text-emerald-700' : 'text-gray-400'}>{r.is_active ? 'Ativa' : 'Inativa'}</span>
                      </td>
                    )}
                    {tableColumns.visibleColumns.includes('actions') && (
                      <td className="px-6 py-2.5 text-right">
                        {r.organization_id ? (
                          <button
                            onClick={() => handleToggle(r)}
                            className="text-blue-600 hover:text-blue-800 text-sm font-medium p-1.5 hover:bg-blue-50 rounded-lg transition-all"
                          >
                            {r.is_active ? 'Desativar' : 'Ativar'}
                          </button>
                        ) : (
                          <span className="text-xs text-gray-400">global</span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="px-6 py-3.5 bg-gray-50 border-t border-gray-100 text-xs text-gray-500">
            <strong className="text-gray-700">Ordem de avaliação:</strong>{' '}
            NCM (prioridade mais alta) → CFOP → palavra-chave. Regras por empresa sobrescrevem globais de mesma prioridade.
          </div>
        </div>
      )}
    </div>
  );
}
