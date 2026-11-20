import React from 'react';
import { ImovibStudy, ImovibStudyUpdate } from '../types';
import { imovibService } from '../services/imovibService';
import { useImovibMath } from '../hooks/useImovibMath';
import { useToast } from '../hooks/useToast';
import ImovibCurvaDeVendasCard from './ImovibCurvaDeVendasCard';
import ImovibPerfilDeRecebimentoCard from './ImovibPerfilDeRecebimentoCard';
import ImovibDistratoCard from './ImovibDistratoCard';
import ImovibSalesMapTab from './ImovibSalesMapTab';
import { TabsBar, type TabsBarItem } from './ui/TabsBar';

interface ImovibReceitasFormProps {
    study: ImovibStudy;
    onDataChanged: () => void;
    /** Sub-aba aberta: o espelho de vendas (de onde sai o VGV) ou as seções de receita. */
    subAba: SubAbaReceitas;
    onSubAbaChange: (subAba: SubAbaReceitas) => void;
    /** Abre as Preferências do estudo (passa ao espelho). */
    onAbrirPreferencias?: () => void;
}

export type SubAbaReceitas = 'espelho' | 'curva';

const SUB_ABAS: TabsBarItem<SubAbaReceitas>[] = [
    { id: 'espelho', label: 'Espelho de vendas' },
    { id: 'curva', label: 'Curva, perfil e distrato' },
];

const formatBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

/**
 * Aba Receitas do estudo: curva de vendas, perfil de recebimento, distrato e inadimplência. O espelho de vendas
 * (de onde sai o VGV) tem aba própria desde 20/11/2026 (plano 2026-11-20-imovib-espelho-aba-tabela-padrao). Nasceu da divisão de "Receitas e
 * Capital" (decisão D7 do plano docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md).
 * Tudo grava ao sair do campo.
 */
const ImovibReceitasForm: React.FC<ImovibReceitasFormProps> = ({ study, onDataChanged, subAba, onSubAbaChange, onAbrirPreferencias }) => {
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
            <TabsBar<SubAbaReceitas> tabs={SUB_ABAS} value={subAba} onChange={onSubAbaChange} />
            {subAba === 'espelho' ? (
                <ImovibSalesMapTab study={study} onDataChanged={onDataChanged} onAbrirPreferencias={onAbrirPreferencias} />
            ) : (<>
            <p className="text-sm text-gray-700">
                VGV <span className="font-semibold text-gray-900 tabular-nums">{math.vgvTotal > 0 ? formatBRL(math.vgvTotal) : '—'}</span>, do{' '}
                <button type="button" onClick={() => onSubAbaChange('espelho')} className="text-blue-600 hover:underline font-medium">Espelho de vendas</button>
                {' '}— as premissas abaixo distribuem esse valor no tempo.
            </p>
            <ImovibCurvaDeVendasCard study={study} math={math} salvar={salvar} />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <ImovibPerfilDeRecebimentoCard study={study} salvar={salvar} />
                <ImovibDistratoCard study={study} salvar={salvar} />
            </div>
            </>)}
        </div>
    );
};

export default ImovibReceitasForm;
