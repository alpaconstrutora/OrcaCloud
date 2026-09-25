/**
 * Harness: monta o `BoletoFormModal` DE PRODUÇÃO (sem mock do componente) para
 * provar as duas entregas de 24/09/2026 na tela, não só no typecheck:
 *
 *  1. o campo **Organização** existe na edição, e fica desabilitado **com o
 *     motivo escrito** quando o boleto já está aprovado/pago;
 *  2. a **malha e a tipografia** seguem §21/§30/§16 — rótulo sentence case
 *     (`text-xs font-semibold text-slate-500`), campo `h-9 rounded-[6px]` com
 *     preenchimento cinza, no desenho do drawer "Agendar Ordem de Manutenção".
 *
 * ⚠️ O que este harness NÃO prova: a GRAVAÇÃO. Sem sessão, as listas
 * (fornecedores, obras, centros de custo) voltam vazias e a troca de
 * organização não chega ao banco — a trava de gravação é o teste
 * `__tests__/boletoMudarOrganizacao.test.ts`. Aqui só se olha o desenho.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../../index.css';
import BoletoFormModal from '../../../components/BoletoFormModal';
import { ConfirmProvider } from '../../../components/ui/confirm';
import { useStore } from '../../../store/useStore';
import type { Boleto, BoletoStatus, Organization } from '../../../types';

const EMAIL = 'harness@opura.test';

const orgs = [
  { id: 'org-alpa', name: 'ALPA Empreendimentos e Construções' },
  { id: 'org-spe', name: 'SPE Galeria Altavista' },
];

// `useWritableOrganizations` recorta por membro — sem `members` com este e-mail
// a lista cairia no fallback e o harness não provaria o recorte.
useStore.setState({
  organizations: orgs.map(o => ({
    ...o,
    address: {},
    members: [{ id: `m-${o.id}`, email: EMAIL, name: 'Harness', role: 'ADMIN' }],
  })) as unknown as Organization[],
  currentProfile: { ...useStore.getState().currentProfile, email: EMAIL },
});

function boletoFake(status: BoletoStatus): Boleto {
  return {
    id: `b-${status}`,
    numero: 20,
    organization_id: 'org-alpa',
    documento_nome: 'boleto-0020.pdf',
    documento_mime: 'application/pdf',
    banco_nome: 'Banco do Brasil',
    linha_digitavel: '00190.00009 01234.567004 12345.678901 2 99990000150000',
    valor: 1500,
    vencimento: '2026-10-10',
    beneficiario_nome: 'Fornecedor Exemplo LTDA',
    beneficiario_cnpj: '07.604.526/0001-20',
    confidence_score: 96,
    status,
    created_at: '2026-09-01T00:00:00Z',
  } as unknown as Boleto;
}

function Harness() {
  const [status, setStatus] = React.useState<BoletoStatus>('rascunho');
  return (
    <ConfirmProvider>
      <div style={{ padding: 12 }}>
        <select
          data-el="status"
          value={status}
          onChange={e => setStatus(e.target.value as BoletoStatus)}
          style={{ padding: 6 }}
        >
          {['rascunho', 'aprovado', 'pago', 'cancelado'].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div style={{ background: '#fff' }}>
        <BoletoFormModal
          key={status}
          organizationId="org-alpa"
          organizations={orgs}
          userEmail={EMAIL}
          boleto={boletoFake(status)}
          onClose={() => { /* harness */ }}
          onSaved={() => { /* harness */ }}
        />
      </div>
    </ConfirmProvider>
  );
}

createRoot(document.getElementById('raiz')!).render(<Harness />);
