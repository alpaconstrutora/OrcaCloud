import { AlertTriangle, XCircle, Info, CheckCircle2, ShieldCheck } from 'lucide-react';
import type { TaxAlert, AlertSeverity } from '../../services/taxValidationService';

const SEV: Record<AlertSeverity, {
  Icon: React.ElementType;
  label: string;
  bg: string;
  border: string;
  text: string;
  iconColor: string;
}> = {
  critical: {
    Icon: XCircle,
    label: 'Crítico',
    bg:     'color-mix(in srgb, var(--fred) 8%, transparent)',
    border: 'color-mix(in srgb, var(--fred) 30%, transparent)',
    text:   'var(--fred)',
    iconColor: 'var(--fred)',
  },
  warning: {
    Icon: AlertTriangle,
    label: 'Atenção',
    bg:     'color-mix(in srgb, #d97706 8%, transparent)',
    border: 'color-mix(in srgb, #d97706 30%, transparent)',
    text:   '#92400e',
    iconColor: '#d97706',
  },
  info: {
    Icon: Info,
    label: 'Informação',
    bg:     'color-mix(in srgb, var(--faccent) 8%, transparent)',
    border: 'color-mix(in srgb, var(--faccent) 25%, transparent)',
    text:   'var(--ftext)',
    iconColor: 'var(--faccent)',
  },
};

interface Props {
  alerts: TaxAlert[];
  loading?: boolean;
}

export function TaxValidationPanel({ alerts, loading }: Props) {
  if (loading) {
    return (
      <div className="f-card" style={{ padding: '40px 0', textAlign: 'center', color: 'var(--ftext3)' }}>
        Analisando itens…
      </div>
    );
  }

  const critical = alerts.filter(a => a.severity === 'critical');
  const warnings  = alerts.filter(a => a.severity === 'warning');
  const infos     = alerts.filter(a => a.severity === 'info');

  if (alerts.length === 0) {
    return (
      <div className="f-card" style={{ textAlign: 'center', padding: '48px 24px' }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 56, height: 56, borderRadius: '50%',
          background: 'color-mix(in srgb, var(--fgreen) 12%, transparent)',
          marginBottom: 16,
        }}>
          <ShieldCheck size={28} color="var(--fgreen)" />
        </div>
        <div className="f-section-title" style={{ color: 'var(--fgreen)', marginBottom: 6 }}>
          Nenhum alerta encontrado
        </div>
        <div style={{ fontSize: 13, color: 'var(--ftext3)' }}>
          CFOP, NCM e valores dentro do esperado para uma nota de entrada.
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Resumo */}
      <div className="f-card" style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <div className="f-section-title" style={{ width: '100%', marginBottom: 8 }}>
          Resumo da validação tributária
        </div>
        {[
          { label: 'Críticos',    count: critical.length, color: 'var(--fred)' },
          { label: 'Atenções',    count: warnings.length,  color: '#d97706' },
          { label: 'Informações', count: infos.length,     color: 'var(--faccent)' },
        ].map(s => (
          <div key={s.label} style={{ flex: '1 1 80px', textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 900, color: s.color, lineHeight: 1 }}>{s.count}</div>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ftext3)', marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
        <div style={{
          flex: '1 1 auto', fontSize: 12, color: 'var(--ftext3)',
          display: 'flex', alignItems: 'center', paddingLeft: 8,
          borderLeft: '1px solid var(--fborder)',
        }}>
          {critical.length > 0
            ? 'Revise os alertas críticos antes de aprovar esta NF-e.'
            : warnings.length > 0
              ? 'Verifique os alertas de atenção — podem indicar inconsistências tributárias.'
              : 'Apenas informações. Nenhum problema identificado que impeça a aprovação.'}
        </div>
      </div>

      {/* Alertas agrupados por severidade */}
      {([
        { key: 'critical', items: critical },
        { key: 'warning',  items: warnings },
        { key: 'info',     items: infos },
      ] as { key: AlertSeverity; items: TaxAlert[] }[])
        .filter(g => g.items.length > 0)
        .map(group => {
          const s = SEV[group.key];
          return (
            <div key={group.key} className="f-card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 16px',
                background: s.bg,
                borderBottom: `1px solid ${s.border}`,
              }}>
                <s.Icon size={14} color={s.iconColor} />
                <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', color: s.text }}>
                  {s.label} — {group.items.length} alerta{group.items.length > 1 ? 's' : ''}
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {group.items.map((alert, i) => (
                  <div
                    key={`${alert.code}-${i}`}
                    style={{
                      display: 'flex', gap: 12, padding: '12px 16px',
                      borderBottom: i < group.items.length - 1 ? '1px solid var(--fborder)' : 'none',
                    }}
                  >
                    <div style={{ flexShrink: 0, marginTop: 2 }}>
                      <s.Icon size={14} color={s.iconColor} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 3 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ftext)' }}>
                          {alert.title}
                        </span>
                        {alert.lineNumber !== undefined && (
                          <span className="f-tag" style={{ fontSize: 10 }}>
                            linha {alert.lineNumber}
                          </span>
                        )}
                        <span className="f-mono" style={{ fontSize: 10, color: 'var(--ftext3)' }}>
                          {alert.code}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--ftext2)', lineHeight: 1.6 }}>
                        {alert.message}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
    </div>
  );
}
