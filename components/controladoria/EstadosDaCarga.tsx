import React from 'react';
import { AlertCircle } from 'lucide-react';

// Estados de carga das seis abas da Controladoria — o mesmo desenho da
// `FalhaDaFaixa` do Dashboard financeiro (guia §4.5.1/§28.5: uma mensagem com
// "Tentar de novo", nunca tela em branco nem número velho).

/** A consulta falhou. Substitui os números: não sobra dado de outro recorte. */
export const FalhaDeCarga: React.FC<{ oQue: string; onRetry: () => void }> = ({ oQue, onRetry }) => (
    <div role="alert" className="bg-white rounded-[10px] border border-gray-100 shadow-sm px-4 py-6 text-sm text-gray-600 text-center">
        Não foi possível carregar {oQue}.{' '}
        <button
            type="button"
            onClick={onRetry}
            className="text-blue-600 hover:text-blue-800 font-medium rounded-[4px] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
        >
            Tentar de novo
        </button>
    </div>
);

/** O período na tela não pode ser consultado (data incompleta, início depois do fim).
 *  A aba não consulta e não mostra números — diz o que falta. */
export const PeriodoInvalido: React.FC<{ motivo: string }> = ({ motivo }) => (
    <div role="status" className="bg-white rounded-[10px] border border-gray-100 shadow-sm px-4 py-6 text-sm text-gray-600 text-center flex items-center justify-center gap-2">
        <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" aria-hidden="true" />
        {motivo}
    </div>
);
