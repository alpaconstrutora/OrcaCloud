import { useEffect, useState } from 'react';
import { getJournalEntryByReference } from '../../services/diarioService';
import type { JournalEntryPair } from '../../services/diarioService';

const fmt = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const fmtDate = (d: string) =>
  d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR') : '—';

const DRE_LABEL: Record<string, string> = {
  CUSTO_OBRA:    'Custo da Obra',
  CUSTO_SERVICO: 'Custo de Serviço',
  DESPESA_ADM:   'Despesa Adm.',
  RECEITA_BRUTA: 'Receita Bruta',
  PASSIVO:       'Passivo Circulante',
  SEM_CLASSIFICACAO: 'Sem classificação',
};

interface Props {
  invoiceId: string;
}

export function JournalEntryCard({ invoiceId }: Props) {
  const [entry, setEntry] = useState<JournalEntryPair | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getJournalEntryByReference(invoiceId)
      .then(setEntry)
      .finally(() => setLoading(false));
  }, [invoiceId]);

  if (loading) {
    return (
      <div style={{ padding: '16px 0', color: 'var(--ftext3)', fontSize: 13 }}>
        Carregando lançamento contábil…
      </div>
    );
  }

  if (!entry) return null;

  const balanced = Math.abs(entry.debitAmount - entry.creditAmount) < 0.01;

  return (
    <div style={{
      marginTop: 20,
      borderRadius: 12,
      border: '1px solid var(--fborder)',
      overflow: 'hidden',
    }}>
      {/* Cabeçalho */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 16px',
        background: 'color-mix(in srgb, var(--faccent) 8%, transparent)',
        borderBottom: '1px solid var(--fborder)',
      }}>
        <div>
          <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', color: 'var(--faccent)' }}>
            Lançamento Contábil
          </span>
          <span className="f-mono" style={{ fontSize: 10, color: 'var(--ftext3)', marginLeft: 10 }}>
            #{entry.journalEntryId.slice(0, 8)}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--ftext3)' }}>{fmtDate(entry.entryDate)}</span>
          {balanced
            ? <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--fgreen)', background: 'color-mix(in srgb, var(--fgreen) 12%, transparent)', padding: '2px 8px', borderRadius: 6 }}>✓ Balanceado</span>
            : <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--fred)',   background: 'color-mix(in srgb, var(--fred) 12%, transparent)',   padding: '2px 8px', borderRadius: 6 }}>⚠ Desbalanceado</span>
          }
        </div>
      </div>

      {/* Tabela D/C */}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: 'var(--fbg2, #f8f9fa)' }}>
            {(['Conta', 'Classificação', 'Débito', 'Crédito'] as const).map(h => (
              <th key={h} style={{
                padding: '6px 14px', textAlign: h === 'Conta' || h === 'Classificação' ? 'left' : 'right',
                fontSize: 10, fontWeight: 800, textTransform: 'uppercase', color: 'var(--ftext3)',
                borderBottom: '1px solid var(--fborder)',
              }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {/* Linha débito */}
          <tr>
            <td style={{ padding: '10px 14px', fontWeight: 700, color: 'var(--ftext)' }}>
              {entry.debitAccount}
            </td>
            <td style={{ padding: '10px 14px', color: 'var(--ftext3)', fontSize: 11 }}>
              {DRE_LABEL[entry.debitGroup ?? ''] ?? entry.debitGroup}
            </td>
            <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, fontFamily: 'monospace', color: '#1d4ed8' }}>
              {fmt(entry.debitAmount)}
            </td>
            <td style={{ padding: '10px 14px', textAlign: 'right', color: 'var(--ftext3)' }}>—</td>
          </tr>

          {/* Linha crédito */}
          <tr style={{ borderTop: '1px solid var(--fborder)' }}>
            <td style={{ padding: '10px 14px', fontWeight: 700, color: 'var(--ftext)', paddingLeft: 28 }}>
              &nbsp;&nbsp;{entry.creditAccount}
            </td>
            <td style={{ padding: '10px 14px', color: 'var(--ftext3)', fontSize: 11 }}>
              {DRE_LABEL[entry.creditGroup ?? ''] ?? entry.creditGroup}
            </td>
            <td style={{ padding: '10px 14px', textAlign: 'right', color: 'var(--ftext3)' }}>—</td>
            <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, fontFamily: 'monospace', color: '#16a34a' }}>
              {fmt(entry.creditAmount)}
            </td>
          </tr>

          {/* Total */}
          <tr style={{ borderTop: '2px solid var(--fborder)', background: 'var(--fbg2, #f8f9fa)' }}>
            <td colSpan={2} style={{ padding: '8px 14px', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', color: 'var(--ftext3)' }}>
              Total
            </td>
            <td style={{ padding: '8px 14px', textAlign: 'right', fontWeight: 900, fontFamily: 'monospace', color: '#1d4ed8' }}>
              {fmt(entry.debitAmount)}
            </td>
            <td style={{ padding: '8px 14px', textAlign: 'right', fontWeight: 900, fontFamily: 'monospace', color: '#16a34a' }}>
              {fmt(entry.creditAmount)}
            </td>
          </tr>
        </tbody>
      </table>

      {/* Status */}
      <div style={{
        padding: '8px 14px', borderTop: '1px solid var(--fborder)',
        fontSize: 11, color: 'var(--ftext3)',
        background: 'var(--fbg2, #f8f9fa)',
      }}>
        Status: <strong style={{ color: entry.status === 'CONCILIATED' ? 'var(--fgreen)' : 'var(--ftext2)' }}>
          {entry.status === 'CONCILIATED' ? 'Conciliado' : 'Pendente'}
        </strong>
        {entry.sourceSystem && (
          <span style={{ marginLeft: 12 }}>
            Origem: <strong>{entry.sourceSystem}</strong>
          </span>
        )}
      </div>
    </div>
  );
}
