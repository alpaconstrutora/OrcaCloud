import { useState, useEffect } from 'react';
import { listClassificationRules, createClassificationRule, toggleClassificationRule } from '../../services/nfeService';
import type { ClassificationRule, RuleType } from '../../types/fiscal';

interface Props {
  organizationId: string;
  onToast: (msg: string, type: 'ok' | 'err') => void;
}

function Category({ cat }: { cat: string }) {
  return <span className={`f-cat f-cat-${cat}`}>{cat}</span>;
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

export function FiscalRules({ organizationId, onToast }: Props) {
  const [rules, setRules] = useState<ClassificationRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<NewRuleForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

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
    setSaving(true);
    try {
      await createClassificationRule({
        organization_id: organizationId,
        rule_type:       form.rule_type,
        match_value:     form.match_value.trim().toLowerCase(),
        category:        form.category,
        priority:        form.priority,
        is_active:       true,
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

  return (
    <div className="f-page">
      <div className="f-page-header">
        <div className="f-page-title">Regras de classificação</div>
        <div className="f-page-sub">
          Regras heurísticas configuráveis — NCM, CFOP e palavras-chave. Sem código hardcoded.
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        {([['NCM', 'ncm'], ['Palavra-chave', 'keyword'], ['CFOP', 'cfop']] as [string, RuleType][]).map(([label, type]) => (
          <div key={type} className="f-stat-card" style={{ flex: 1 }}>
            <div className="f-stat-val" style={{ fontSize: 22, color: 'var(--faccent)' }}>
              {countByType(type)}
            </div>
            <div className="f-stat-label">{label}</div>
          </div>
        ))}
      </div>

      <div className="f-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div className="f-section-title" style={{ margin: 0, border: 'none', padding: 0 }}>
            Regras ativas
          </div>
          <button className="f-btn f-btn-primary f-btn-sm" onClick={() => setShowForm(v => !v)}>
            {showForm ? '✕ Cancelar' : '+ Nova regra'}
          </button>
        </div>

        {/* Form de nova regra */}
        {showForm && (
          <div style={{
            background: 'var(--fbg3)', border: '1px solid var(--fborder)',
            borderRadius: 'var(--fradius)', padding: 16, marginBottom: 20,
            display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr auto', gap: 12, alignItems: 'flex-end',
          }}>
            <div>
              <div className="f-detail-key" style={{ marginBottom: 6 }}>Tipo</div>
              <select
                value={form.rule_type}
                onChange={e => setForm(f => ({ ...f, rule_type: e.target.value as RuleType }))}
                style={{
                  width: '100%', background: 'var(--fbg2)', border: '1px solid var(--fborder2)',
                  borderRadius: 'var(--fradius)', color: 'var(--ftext)', padding: '6px 10px',
                  fontSize: 13,
                }}
              >
                {RULE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <div className="f-detail-key" style={{ marginBottom: 6 }}>Valor</div>
              <input
                type="text"
                placeholder={form.rule_type === 'ncm' ? 'ex: 7214' : form.rule_type === 'cfop' ? 'ex: 5101' : 'ex: vergalhão'}
                value={form.match_value}
                onChange={e => setForm(f => ({ ...f, match_value: e.target.value }))}
                style={{
                  width: '100%', background: 'var(--fbg2)', border: '1px solid var(--fborder2)',
                  borderRadius: 'var(--fradius)', color: 'var(--ftext)', padding: '6px 10px',
                  fontSize: 13,
                }}
              />
            </div>
            <div>
              <div className="f-detail-key" style={{ marginBottom: 6 }}>Categoria</div>
              <select
                value={form.category}
                onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                style={{
                  width: '100%', background: 'var(--fbg2)', border: '1px solid var(--fborder2)',
                  borderRadius: 'var(--fradius)', color: 'var(--ftext)', padding: '6px 10px',
                  fontSize: 13,
                }}
              >
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <div className="f-detail-key" style={{ marginBottom: 6 }}>Prioridade</div>
              <input
                type="number"
                min={1} max={999}
                value={form.priority}
                onChange={e => setForm(f => ({ ...f, priority: Number(e.target.value) }))}
                style={{
                  width: '100%', background: 'var(--fbg2)', border: '1px solid var(--fborder2)',
                  borderRadius: 'var(--fradius)', color: 'var(--ftext)', padding: '6px 10px',
                  fontSize: 13,
                }}
              />
            </div>
            <button
              className="f-btn f-btn-primary f-btn-sm"
              onClick={handleCreate}
              disabled={saving}
            >
              {saving ? '…' : 'Salvar'}
            </button>
          </div>
        )}

        {loading ? (
          <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--ftext3)' }}>Carregando…</div>
        ) : (
          <div className="f-table-wrap">
            <table className="f-table">
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>Valor</th>
                  <th>Categoria</th>
                  <th>Prioridade</th>
                  <th>Escopo</th>
                  <th>Ativo</th>
                </tr>
              </thead>
              <tbody>
                {rules.map(r => (
                  <tr key={r.id} style={{ opacity: r.is_active ? 1 : 0.4 }}>
                    <td><span className="f-tag">{r.rule_type}</span></td>
                    <td className="f-mono" style={{ fontWeight: 600 }}>{r.match_value}</td>
                    <td><Category cat={r.category} /></td>
                    <td>
                      <span className="f-mono" style={{
                        fontSize: 11,
                        color: r.priority < 30 ? 'var(--fgreen)' : r.priority < 60 ? 'var(--famber)' : 'var(--ftext3)',
                      }}>
                        {r.priority}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontSize: 11, color: 'var(--ftext3)' }}>
                        {r.organization_id ? 'empresa' : 'global'}
                      </span>
                    </td>
                    <td>
                      {/* Só permite toggle em regras da organização, não globais */}
                      {r.organization_id ? (
                        <button
                          className="f-btn f-btn-ghost f-btn-sm"
                          onClick={() => handleToggle(r)}
                        >
                          {r.is_active ? 'Desativar' : 'Ativar'}
                        </button>
                      ) : (
                        <span className="f-mono" style={{ fontSize: 10, color: 'var(--ftext3)' }}>global</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div style={{
          marginTop: 16, padding: '12px 14px', background: 'var(--fbg3)',
          borderRadius: 'var(--fradius)', border: '1px solid var(--fborder)',
          fontSize: 12, color: 'var(--ftext2)',
        }}>
          <strong style={{ color: 'var(--ftext)' }}>Ordem de avaliação:</strong>{' '}
          NCM (prioridade mais alta) → CFOP → palavra-chave.
          Regras por empresa sobrescrevem globais de mesma prioridade.
        </div>
      </div>
    </div>
  );
}
