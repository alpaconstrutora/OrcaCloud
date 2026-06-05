import React from 'react';
import { AlertTriangle, FileCode } from 'lucide-react';

interface Props {
    migrations: string[];
    feature: string;
}

/**
 * Exibe um banner quando tabelas necessárias ainda não foram criadas no Supabase.
 * Guia o admin a aplicar as migrations pendentes.
 */
const MigrationBanner: React.FC<Props> = ({ migrations, feature }) => (
    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 space-y-3">
        <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 text-amber-700 rounded-xl">
                <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
                <p className="text-sm font-bold text-amber-900">Configuração necessária — {feature}</p>
                <p className="text-xs text-amber-700 mt-0.5">
                    As tabelas deste módulo ainda não foram criadas no banco de dados.
                </p>
            </div>
        </div>
        <div className="bg-white border border-amber-100 rounded-xl p-4 space-y-2">
            <p className="text-xs font-bold text-gray-600 flex items-center gap-2">
                <FileCode className="w-4 h-4" />
                Aplique no Supabase Dashboard → SQL Editor:
            </p>
            <ul className="space-y-1">
                {migrations.map(m => (
                    <li key={m} className="text-xs font-mono text-amber-800 bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-100">
                        {m}
                    </li>
                ))}
            </ul>
        </div>
    </div>
);

export const isTableMissing = (err: unknown): boolean => {
    const e = err as any;
    return e?.code === 'PGRST205' || e?.code === '42P01' || String(e?.message).includes('schema cache');
};

export default MigrationBanner;
