import React from 'react';
import { PenLine, ArrowUp, ArrowDown, X, AlertTriangle } from 'lucide-react';
import ActionIconButton from '../ui/ActionIconButton';
import type { OrganizationMember } from '../../types/users';
import type { SignatarioDoc } from '../../types/docGen';
import { signatarioDeMembro } from '../../services/docGen/resolverContexto';

/**
 * Quem assina (item 9 do pedido) — os usuários de Minha Organização › Usuários
 * (decisão de 07/10). O documento guarda um SNAPSHOT (nome, cargo, registro…)
 * do momento em que o signatário entrou; "Atualizar dados" relê do cadastro.
 * Vários signatários: a ordem da lista é a ordem no papel (até 3 por linha).
 */
interface Props {
    signatarios: SignatarioDoc[];
    onChange: (s: SignatarioDoc[]) => void;
    membros: OrganizationMember[];
    nomeDepartamento: (id: string | null | undefined) => string;
    somenteLeitura?: boolean;
}

export default function SignatariosEditor({ signatarios, onChange, membros, nomeDepartamento, somenteLeitura }: Props) {
    const [escolha, setEscolha] = React.useState('');
    const disponiveis = membros.filter(m => !signatarios.some(s => s.memberId === m.id)).sort((a, b) => a.name.localeCompare(b.name));

    const adicionar = () => {
        const m = membros.find(x => x.id === escolha);
        if (!m) return;
        onChange([...signatarios, signatarioDeMembro(m, nomeDepartamento)]);
        setEscolha('');
    };

    const atualizarDados = () => onChange(signatarios.map(s => {
        const m = membros.find(x => x.id === s.memberId);
        return m ? signatarioDeMembro(m, nomeDepartamento) : s;
    }));

    const mover = (i: number, d: -1 | 1) => {
        const j = i + d;
        if (j < 0 || j >= signatarios.length) return;
        const n = [...signatarios];
        [n[i], n[j]] = [n[j], n[i]];
        onChange(n);
    };

    return (
        <div className="space-y-3">
            {signatarios.length === 0 ? (
                <p className="text-sm text-gray-500">Nenhum signatário escolhido.</p>
            ) : (
                <ul className="divide-y divide-gray-100 rounded-[10px] border border-gray-100">
                    {signatarios.map((s, i) => {
                        const membro = membros.find(m => m.id === s.memberId);
                        const semCargo = !s.cargo;
                        const semImagem = !membro?.assinaturaPath;
                        return (
                            <li key={s.memberId ?? `${s.nome}-${i}`} className="flex items-start gap-3 px-3 py-2.5">
                                <PenLine className="w-4 h-4 mt-0.5 text-gray-400 shrink-0" />
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm text-gray-800 truncate">{s.nome}</p>
                                    <p className="text-xs text-gray-500 truncate">{[s.cargo, s.registroProfissional, s.departamento].filter(Boolean).join(' · ') || '—'}</p>
                                    {(semCargo || semImagem) && (
                                        <p className="flex items-center gap-1 text-xs text-amber-700 mt-0.5">
                                            <AlertTriangle className="w-3.5 h-3.5" />
                                            {[semCargo && 'sem cargo', semImagem && 'sem imagem de assinatura'].filter(Boolean).join(' e ')}
                                            {' '}— complete em Minha Organização › Usuários
                                        </p>
                                    )}
                                </div>
                                {!somenteLeitura && (
                                    <div className="flex items-center gap-1.5 shrink-0">
                                        <ActionIconButton kind="move" size="sm" title="Subir" icon={<ArrowUp className="w-3.5 h-3.5" />} onClick={() => mover(i, -1)} disabled={i === 0} />
                                        <ActionIconButton kind="move" size="sm" title="Descer" icon={<ArrowDown className="w-3.5 h-3.5" />} onClick={() => mover(i, 1)} disabled={i === signatarios.length - 1} />
                                        <ActionIconButton kind="delete" size="sm" title="Tirar da lista" icon={<X className="w-3.5 h-3.5" />} onClick={() => onChange(signatarios.filter((_, k) => k !== i))} />
                                    </div>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}

            {!somenteLeitura && (
                <div className="flex flex-wrap items-center gap-2">
                    <select value={escolha} onChange={e => setEscolha(e.target.value)}
                        className="flex-1 min-w-[260px] h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500">
                        <option value="">{disponiveis.length ? '— Escolher usuário da organização —' : '— Todos os usuários já estão na lista —'}</option>
                        {disponiveis.map(m => <option key={m.id} value={m.id}>{m.name}{m.cargo ? ` · ${m.cargo}` : ''}</option>)}
                    </select>
                    <button type="button" onClick={adicionar} disabled={!escolha} title={!escolha ? 'Escolha um usuário' : undefined}
                        className="h-9 px-3.5 bg-white border border-gray-200 text-gray-700 rounded-[6px] hover:bg-gray-50 font-medium text-[13px] disabled:opacity-50 disabled:cursor-not-allowed">
                        Adicionar signatário
                    </button>
                    {signatarios.length > 0 && (
                        <button type="button" onClick={atualizarDados} title="Relê nome, cargo e registro de Minha Organização › Usuários"
                            className="h-9 px-3 text-sm font-medium text-blue-700 hover:bg-blue-50 rounded-[6px]">
                            Atualizar dados
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
