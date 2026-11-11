import React from 'react';
import { ImovibStudy, ImovibStudyUpdate } from '../types';
import { imovibService } from '../services/imovibService';
import { useImovibMath } from '../hooks/useImovibMath';
import { useToast } from '../hooks/useToast';
import ImovibSalesMapTab from './ImovibSalesMapTab';
import ImovibCurvaDeVendasCard from './ImovibCurvaDeVendasCard';
import ImovibPerfilDeRecebimentoCard from './ImovibPerfilDeRecebimentoCard';
import ImovibDistratoCard from './ImovibDistratoCard';

interface ImovibReceitasFormProps {
    study: ImovibStudy;
    onDataChanged: () => void;
}

/**
 * Aba Receitas do estudo: espelho de vendas, curva de vendas, perfil de
 * recebimento, distrato e inadimplência. Nasceu da divisão de "Receitas e
 * Capital" (decisão D7 do plano docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md).
 * Tudo grava ao sair do campo.
 */
const ImovibReceitasForm: React.FC<ImovibReceitasFormProps> = ({ study, onDataChanged }) => {
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
            <ImovibSalesMapTab study={study} onDataChanged={onDataChanged} />
            <ImovibCurvaDeVendasCard study={study} math={math} salvar={salvar} />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <ImovibPerfilDeRecebimentoCard study={study} salvar={salvar} />
                <ImovibDistratoCard study={study} salvar={salvar} />
            </div>
        </div>
    );
};

export default ImovibReceitasForm;
