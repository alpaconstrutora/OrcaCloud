import React from 'react';
import { History, Loader2 } from 'lucide-react';
import type { DocGenEvento } from '../../types/docGen';
import { descreverEvento } from '../../services/docGen/tramitacao';
import { formatarDataHora } from './rotulos';

/**
 * Linha do tempo do ofício (aprovação, assinatura, emissão, envio, recebimento,
 * resposta…). Quem grava é o banco (`doc_gen_eventos`); aqui só se lê.
 */
interface Props {
    eventos: DocGenEvento[];
    carregando: boolean;
}

const COR: Record<string, string> = {
    APROVADO: 'bg-green-500', APROVADO_NIVEL: 'bg-green-400', REJEITADO: 'bg-red-500', CANCELADO: 'bg-red-500',
    EMITIDO: 'bg-blue-600', ASSINADO: 'bg-blue-400', RESPONDIDO: 'bg-emerald-600', ENCERRADO: 'bg-slate-500',
};

export default function HistoricoDocumento({ eventos, carregando }: Props) {
    if (carregando) {
        return <div className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> Carregando o histórico…</div>;
    }
    if (eventos.length === 0) {
        return (
            <div className="flex items-center gap-2 text-sm text-gray-500">
                <History className="w-4 h-4 text-gray-400" /> Nada registrado ainda. Aprovação, assinatura, emissão e tramitação aparecem aqui.
            </div>
        );
    }
    return (
        <ol className="relative border-l border-gray-200 ml-1.5 space-y-4">
            {eventos.map(e => (
                <li key={e.id} className="ml-4">
                    <span className={`absolute -left-[5px] mt-1.5 w-2.5 h-2.5 rounded-full ${COR[e.tipo] ?? 'bg-gray-400'}`} />
                    <p className="text-sm text-gray-800">{descreverEvento(e)}</p>
                    <p className="text-xs text-gray-400">{formatarDataHora(e.created_at)}{e.autor ? ` · ${e.autor}` : ''}</p>
                </li>
            ))}
        </ol>
    );
}
