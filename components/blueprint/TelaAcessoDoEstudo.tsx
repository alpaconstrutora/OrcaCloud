/**
 * ACESSO AO ESTUDO (20/09/2026, roadmap E10.1) — a tela in-flow: quem está
 * agora no ramo (presença), e o papel de cada membro da organização NESTE
 * estudo: EDITOR (padrão, sem linha no banco) ou LEITOR (não grava rascunho,
 * não publica — a RLS recusa; a tela trava antes).
 *
 * Só membros da organização aparecem: acesso ao estudo continua sendo acesso
 * à organização; aqui se REDUZ, nunca se amplia.
 */
import React, { useState } from 'react';
import { Eye, Pencil, Users } from 'lucide-react';
import { StandardTable, type StandardTableColumn } from '../ui/StandardTable';
import type { PermissaoGravada } from '../../services/blueprintStudyPermissionService';
import { iniciais, type PapelNoEstudo, type Participante } from '../../utils/blueprintColaboracao';

interface Membro {
  email: string;
  nome: string;
  papelNaOrg?: string;
}

interface Props {
  membros: Membro[];
  permissoes: PermissaoGravada[];
  participantes: Participante[];
  conectado: boolean;
  meuEmail: string | null;
  carregando: boolean;
  indisponivel: string | null;
  onDefinir: (email: string, papel: PapelNoEstudo) => Promise<void>;
  onVoltarAoPadrao: (permissaoId: string) => Promise<void>;
}

const COLUNAS: StandardTableColumn[] = [
  { key: 'membro', label: 'Membro', width: 260 },
  { key: 'org', label: 'Papel na organização', width: 160 },
  { key: 'presenca', label: 'Agora', width: 160 },
  { key: 'papel', label: 'Neste estudo', width: 220 },
];

export default function TelaAcessoDoEstudo({ membros, permissoes, participantes, conectado, meuEmail, carregando, indisponivel, onDefinir, onVoltarAoPadrao }: Props) {
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const porEmail = new Map(permissoes.map((p) => [p.email.toLowerCase(), p]));
  const presentes = new Map(participantes.map((p) => [p.email.toLowerCase(), p]));
  const leitores = permissoes.filter((p) => p.papel === 'LEITOR').length;

  async function mudar(m: Membro, papel: PapelNoEstudo) {
    setErro(null);
    setOcupado(m.email);
    try {
      const atual = porEmail.get(m.email.toLowerCase());
      if (papel === 'EDITOR' && atual) await onVoltarAoPadrao(atual.id);
      else if (papel === 'LEITOR') await onDefinir(m.email, papel);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(null);
    }
  }

  return (
    <div className="space-y-4" data-testid="tela-acesso-do-estudo">
      <div className="rounded-[10px] border border-slate-200 bg-white p-4 text-sm text-slate-700" data-testid="presenca-do-ramo">
        <p className="flex items-center gap-2 font-semibold text-slate-800">
          <Users className="h-4 w-4" /> Quem está neste ramo agora
          <span className={`ml-1 inline-block h-2 w-2 rounded-full ${conectado ? 'bg-emerald-500' : 'bg-slate-300'}`} title={conectado ? 'Conectado ao canal do ramo' : 'Sem conexão em tempo real'} />
        </p>
        {participantes.length === 0 ? (
          <p className="mt-1 text-xs text-slate-500">Só você. Quem abrir este ramo aparece aqui, com o pavimento e o que está editando; o que a outra pessoa seleciona fica travado para você até ela soltar.</p>
        ) : (
          <ul className="mt-2 flex flex-wrap gap-2">
            {participantes.map((p) => (
              <li key={p.userId} className="flex items-center gap-2 rounded-[6px] border border-slate-200 px-2 py-1 text-xs" data-testid="participante">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold text-white" style={{ backgroundColor: p.cor }}>{iniciais(p.nome)}</span>
                <span className="text-slate-800">{p.nome}</span>
                <span className="text-slate-500">{p.selecionados.length > 0 ? `editando ${p.selecionados.length} elemento(s)` : 'olhando'}{p.conexoes > 1 ? ` · ${p.conexoes} abas` : ''}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {indisponivel && <p className="rounded-[6px] border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">Permissões indisponíveis: {indisponivel}</p>}
      {erro && <p className="rounded-[6px] border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800" data-testid="erro-do-acesso">{erro}</p>}

      <p className="text-xs text-slate-500" data-testid="resumo-do-acesso">
        Todo membro da organização é <strong>editor</strong> deste estudo por padrão. Marque <strong>leitor</strong> para quem só acompanha: não grava rascunho nem publica (o banco recusa), e vê tudo. {leitores > 0 ? `${leitores} leitor(es) neste estudo.` : 'Nenhum leitor neste estudo.'}
      </p>

      <StandardTable<Membro>
        columns={COLUNAS}
        storageKey="blueprint:acesso-do-estudo"
        rows={membros}
        rowKey={(m) => m.email}
        loading={carregando}
        renderCell={(key, m) => {
          const papel: PapelNoEstudo = porEmail.get(m.email.toLowerCase())?.papel ?? 'EDITOR';
          const presente = presentes.get(m.email.toLowerCase());
          switch (key) {
            case 'membro':
              return (
                <span className="flex items-center gap-2 text-sm text-gray-800">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-[10px] font-semibold text-slate-700" style={presente ? { backgroundColor: presente.cor, color: '#fff' } : undefined}>{iniciais(m.nome || m.email)}</span>
                  <span className="flex flex-col"><span className="font-medium">{m.nome || m.email}{meuEmail && m.email.toLowerCase() === meuEmail.toLowerCase() ? ' (você)' : ''}</span><span className="text-xs text-slate-500">{m.email}</span></span>
                </span>
              );
            case 'org':
              return <span className="text-xs text-gray-600">{m.papelNaOrg ?? '—'}</span>;
            case 'presenca':
              return presente ? <span className="text-xs text-emerald-700">{presente.selecionados.length > 0 ? `editando ${presente.selecionados.length}` : 'no ramo'}</span> : <span className="text-xs text-slate-400">—</span>;
            case 'papel':
              return (
                <span className="inline-flex overflow-hidden rounded-[6px] border border-slate-300 text-xs" role="group" aria-label={`Papel de ${m.nome || m.email} neste estudo`}>
                  <button type="button" disabled={ocupado === m.email} onClick={() => void mudar(m, 'EDITOR')} aria-pressed={papel === 'EDITOR'} className={`inline-flex items-center gap-1 px-2 py-1 ${papel === 'EDITOR' ? 'bg-blue-600 text-white' : 'bg-white text-slate-700 hover:bg-slate-50'}`} aria-label={`Editor: ${m.email}`}>
                    <Pencil className="h-3 w-3" /> Editor
                  </button>
                  <button type="button" disabled={ocupado === m.email} onClick={() => void mudar(m, 'LEITOR')} aria-pressed={papel === 'LEITOR'} className={`inline-flex items-center gap-1 border-l border-slate-300 px-2 py-1 ${papel === 'LEITOR' ? 'bg-amber-500 text-white' : 'bg-white text-slate-700 hover:bg-slate-50'}`} aria-label={`Leitor: ${m.email}`}>
                    <Eye className="h-3 w-3" /> Leitor
                  </button>
                </span>
              );
            default:
              return null;
          }
        }}
        empty={{ title: 'Sem membros', subtitle: 'Os membros da organização aparecem aqui.' }}
      />
    </div>
  );
}
