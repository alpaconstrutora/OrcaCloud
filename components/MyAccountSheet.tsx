import React from 'react';
import { Loader2, Mail, User as UserIcon, Shield, Hash, Building2, CalendarDays, CheckCircle2 } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from './ui/sheet';
import { organizationService } from '../services/organizationService';
import type { OrganizationMember } from '../types';

interface MyAccountSheetProps {
  open: boolean;
  onClose: () => void;
  member: OrganizationMember | null;
  email?: string;
  organizationName?: string;
  roleLabel?: string;
  onSaved: (name: string) => void;
}

const formatJoinedAt = (value?: string) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
};

// Campo de cadastro somente-leitura: e-mail (chave de login), cargo e organização
// são geridos em Configurações > Usuários, não neste drawer de autoatendimento.
const ReadOnlyField: React.FC<{ icon: React.ElementType; label: string; value: string }> = ({ icon: Icon, label, value }) => (
  <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
    <div className="min-w-0 flex-1">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className="truncate text-sm text-slate-800">{value}</div>
    </div>
  </div>
);

export default function MyAccountSheet({ open, onClose, member, email, organizationName, roleLabel, onSaved }: MyAccountSheetProps) {
  const [name, setName] = React.useState(member?.name ?? '');
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setName(member?.name ?? '');
      setError(null);
      setSaved(false);
    }
  }, [open, member]);

  const dirty = name.trim() !== (member?.name ?? '').trim();

  const handleSave = async () => {
    if (!member || !name.trim() || !dirty) return;
    setSaving(true);
    setError(null);
    try {
      await organizationService.updateMemberSelf(member.id, { name: name.trim() });
      onSaved(name.trim());
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      console.error('[MyAccountSheet] Erro ao salvar dados de cadastro:', err);
      setError('Não foi possível salvar. Tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} size="lg" dirty={dirty}>
      <SheetHeader onClose={onClose}>
        <SheetTitle>Minha conta</SheetTitle>
        <SheetDescription>Seus dados de cadastro nesta organização.</SheetDescription>
      </SheetHeader>
      <SheetPanel className="px-6 py-6">
        <div className="space-y-6">
          <section>
            <h3 className="text-sm font-bold text-slate-900">Dados pessoais</h3>
            <div className="mt-3 space-y-3">
              <div>
                <label htmlFor="my-account-name" className="mb-1 block text-xs font-medium text-slate-500">
                  Nome completo
                </label>
                <input
                  id="my-account-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Seu nome"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                />
              </div>
              <ReadOnlyField icon={Mail} label="E-mail de login" value={email ?? '—'} />
            </div>
          </section>

          <section className="border-t border-slate-100 pt-6">
            <h3 className="text-sm font-bold text-slate-900">Vínculo com a organização</h3>
            <p className="mt-1 text-xs text-slate-500">Esses dados são definidos por um administrador em Configurações da organização.</p>
            <div className="mt-3 space-y-3">
              <ReadOnlyField icon={Shield} label="Cargo / função" value={roleLabel ?? '—'} />
              <ReadOnlyField icon={Building2} label="Organização" value={organizationName ?? '—'} />
              {member?.code && <ReadOnlyField icon={Hash} label="Código do membro" value={member.code} />}
              <ReadOnlyField icon={CalendarDays} label="Membro desde" value={formatJoinedAt(member?.joinedAt)} />
            </div>
          </section>

          {!member && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-700">
              Não encontramos seu registro de membro nesta organização. Verifique com um administrador.
            </p>
          )}
          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700">{error}</p>
          )}
        </div>
      </SheetPanel>
      <SheetFooter>
        {saved && (
          <span className="mr-auto flex items-center gap-1.5 text-xs font-medium text-emerald-600">
            <CheckCircle2 className="h-4 w-4" /> Salvo
          </span>
        )}
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Fechar
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!member || !name.trim() || !dirty || saving}
          className="flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserIcon className="h-4 w-4" />}
          Salvar alterações
        </button>
      </SheetFooter>
    </Sheet>
  );
}
