import React from 'react';
import { ImovibStudy, ImovibStudyUpdate } from '../types';
import { imovibService } from '../services/imovibService';
import { useImovibMath } from '../hooks/useImovibMath';
import { useToast } from '../hooks/useToast';
import ImovibCurvaDeVendasCard from './ImovibCurvaDeVendasCard';
import ImovibPerfilDeRecebimentoCard from './ImovibPerfilDeRecebimentoCard';
import ImovibDistratoCard from './ImovibDistratoCard';

interface ImovibReceitasFormProps {
    study: ImovibStudy;
    onDataChanged: () => void;
    /** Vai para a aba "Espelho de vendas" (de onde sai o VGV). */
    onIrParaEspelho?: () => void;
}

const formatBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

/**
 * Aba Receitas do estudo: curva de vendas, perfil de recebimento, distrato e inadimplência. O espelho de vendas
 * (de onde sai o VGV) tem aba própria desde 20/11/2026 (plano 2026-11-20-imovib-espelho-aba-tabela-padrao). Nasceu da divisão de "Receitas e
 * Capital" (decisão D7 do plano docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md).
 * Tudo grava ao sair do campo.
 */
const ImovibReceitasForm: React.FC<ImovibReceitasFormProps> = ({ study, onDataChanged, onIrParaEspelho }) => {
    const math = useImovibMath(study);
    const { showToast } = useToast();

    const salvar = async (campos: ImovibStudyUpdate) => {
        try {
            await imovibService.updateStudy(study.id, campos);
            onDataChanged();
        } catch (e) {
            console.error('Falha ao salvar as premissas de receita', campos, e);
            showToast(`Erro ao salvar as premissas de receita: ${(e as Error).message}`, 'error');
        }
    };

    return (
        <div className="space-y-6">
            <p className="text-sm text-gray-700">
                VGV <span className="font-semibold text-gray-900 tabular-nums">{math.vgvTotal > 0 ? formatBRL(math.vgvTotal) : '—'}</span>, do{' '}
                <button type="button" onClick={onIrParaEspelho} className="text-blue-600 hover:underline font-medium">Espelho de vendas</button>
                {' '}— as premissas abaixo distribuem esse valor no tempo.
            </p>
            <ImovibCurvaDeVendasCard study={study} math={math} salvar={salvar} />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <ImovibPerfilDeRecebimentoCard study={study} salvar={salvar} />
                <ImovibDistratoCard study={study} salvar={salvar} />
            </div>
        </div>
    );
};

export default ImovibReceitasForm;
