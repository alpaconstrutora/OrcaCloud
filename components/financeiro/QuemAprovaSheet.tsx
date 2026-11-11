import React, { useState } from 'react';
import { Info, Loader2 } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel } from '../ui/sheet';
import { approvalApproversService } from '../../services/approvalApproversService';
import type { ApprovalApprover, MembroAprovador } from '../../types/financial';

/**
 * Quem aprova cada nível de uma faixa (itens com valor) ou de um tipo de item
 * (itens sem valor). Alçada por usuário, 10/11/2026 —
 * docs/planos/2026-11-10-alcada-aprovacao-por-usuario.md.
 *
 * Marcar/desmarcar grava na hora (sem "Salvar"): é uma lista de presença, e o
 * banco já recusa quem não é dono/admin. Ninguém marcado num nível = qualquer
 * pessoa da organização aprova aquele nível, como era antes.
 */
export type AlvoDaAlcada = { faixaId: string } | { entityType: NonNullable<ApprovalApprover['entity_type']> };

interface Props {
    open: boolean;
    onClose: () => void;
    titulo: string;
    descricao: string;
    organizationId: string;
    alvo: AlvoDaAlcada;
    /** Rótulo de cada nível exigido ("Gestor", "Financeiro / Diretoria"). */
    niveis: { level: 1 | 2; rotulo: string }[];
    membros: MembroAprovador[];
    /** Aprovadores da organização inteira; o painel filtra os do alvo. */
    aprovadores: ApprovalApprover[];
    onChange: (aprovadores: ApprovalApprover[]) => void;
    /** `null` = pode editar; senão, o motivo da lista estar só leitura. */
    motivoSomenteLeitura: string | null;
}

function doAlvo(a: ApprovalApprover, alvo: AlvoDaAlcada): boolean {
    return 'faixaId' in alvo ? a.faixa_id === alvo.faixaId : a.entity_type === alvo.entityType;
}

export default function QuemAprovaSheet({
    open, onClose, titulo, descricao, organizationId, alvo, niveis, membros, aprovadores, onChange, motivoSomenteLeitura,
}: Props) {
    const [gravando, setGravando] = useState<string | null>(null);
    const [erro, setErro] = useState<string | null>(null);

    async function alternar(level: 1 | 2, membro: MembroAprovador, marcado: boolean) {
        const chave = `${level}:${membro.user_id}`;
        setGravando(chave);
        setErro(null);
        try {
            if (marcado) {
                const atual = aprovadores.find(a => doAlvo(a, alvo) && a.level === level && a.user_id === membro.user_id);
                if (atual) await approvalApproversService.remover(atual.id);
                onChange(aprovadores.filter(a => a !== atual));
            } else {
                await approvalApproversService.incluir({ organizationId, level, userId: membro.user_id, ...alvo });
                // O insert não devolve a linha (sem SELECT de volta para não depender da
                // RLS de leitura no mesmo passo): relê a lista da organização.
                onChange(await approvalApproversService.listar(organizationId));
            }
        } catch (e) {
            setErro(e instanceof Error ? e.message : 'Não foi possível gravar.');
        } finally {
            setGravando(null);
        }
    }

    return (
        <Sheet open={open} onClose={onClose} size="md">
            <SheetHeader onClose={onClose}>
                <SheetTitle>{titulo}</SheetTitle>
                <SheetDescription>{descricao}</SheetDescription>
            </SheetHeader>

            <SheetPanel className="p-6 space-y-6">
                {motivoSomenteLeitura && (
                    <p className="flex gap-2 p-3 rounded-[10px] bg-blue-50 border border-blue-100 text-sm text-blue-900">
                        <Info className="w-4 h-4 mt-0.5 shrink-0" />
                        {motivoSomenteLeitura}
                    </p>
                )}
                {erro && (
                    <p role="alert" className="p-3 rounded-[10px] bg-red-50 border border-red-200 text-sm text-red-700">{erro}</p>
                )}

                {niveis.map(({ level, rotulo }) => {
                    const marcados = new Set(aprovadores.filter(a => doAlvo(a, alvo) && a.level === level).map(a => a.user_id));
                    return (
                        <fieldset key={level} className="space-y-2" disabled={!!motivoSomenteLeitura}>
                            <legend className="text-sm font-semibold text-gray-900">
                                Nível {level} · {rotulo}
                            </legend>
                            <p className="text-sm text-gray-600">
                                {marcados.size === 0
                                    ? 'Ninguém marcado: qualquer pessoa da organização aprova este nível.'
                                    : `Só ${marcados.size === 1 ? 'a pessoa marcada aprova' : `as ${marcados.size} pessoas marcadas aprovam`} este nível.`}
                            </p>
                            <ul className="border border-gray-200 rounded-[10px] divide-y divide-gray-100">
                                {membros.map(m => {
                                    const marcado = marcados.has(m.user_id);
                                    const chave = `${level}:${m.user_id}`;
                                    return (
                                        <li key={m.user_id}>
                                            <label className="flex items-center gap-3 px-3 min-h-11 cursor-pointer hover:bg-gray-50 has-[:disabled]:cursor-default has-[:disabled]:hover:bg-transparent">
                                                <input
                                                    type="checkbox"
                                                    checked={marcado}
                                                    disabled={gravando !== null}
                                                    onChange={() => alternar(level, m, marcado)}
                                                    className="h-4 w-4 rounded border-gray-300 accent-blue-600 focus-visible:ring-2 focus-visible:ring-blue-500/40"
                                                />
                                                <span className="flex-1 min-w-0">
                                                    <span className="block text-sm text-gray-900 truncate">{m.nome}</span>
                                                    {m.nome !== m.email && <span className="block text-xs text-gray-500 truncate">{m.email}</span>}
                                                </span>
                                                {gravando === chave && <Loader2 className="w-4 h-4 animate-spin text-gray-500" aria-label="Gravando" />}
                                            </label>
                                        </li>
                                    );
                                })}
                            </ul>
                        </fieldset>
                    );
                })}
            </SheetPanel>
        </Sheet>
    );
}
