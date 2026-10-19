// components/ImovibVinculoEmpreendimento.tsx
//
// Premissas › Identificação › "Empreendimento vinculado". É daqui que a Viabilidade
// passa a LER a estrutura — torres, unidades e áreas que a Planta Inteligente envia
// ao empreendimento (plano docs/planos/2026-10-19-imovib-premissas-planta-inteligente.md).
//
// O vínculo é `empreendimentos.imovib_study_id`, o mesmo que o formulário do
// Empreendimento grava: um estudo, um empreendimento. Trocar muda o cálculo inteiro,
// por isso pede confirmação e grava na hora (não espera "Salvar Premissas").
import React, { useEffect, useState } from 'react';
import { Building2, ExternalLink, Loader2 } from 'lucide-react';
import { ImovibStudy } from '../types';
import { imovibService } from '../services/imovibService';
import { useConfirm } from './ui/confirm';
import { useToast } from '../hooks/useToast';
import { useImovibEdicao } from '../hooks/useImovibEdicao';

interface Props {
    study: ImovibStudy;
    onDataChanged: () => void;
}

type Opcao = { id: string; name: string; imovib_study_id: string | null };

const ImovibVinculoEmpreendimento: React.FC<Props> = ({ study, onDataChanged }) => {
    const confirm = useConfirm();
    const { showToast } = useToast();
    const { pode, motivo } = useImovibEdicao();
    const [opcoes, setOpcoes] = useState<Opcao[] | null>(null);
    const [gravando, setGravando] = useState(false);
    const estrutura = study.estrutura;
    const atual = estrutura?.origem === 'empreendimento' ? estrutura.empreendimento_id ?? '' : '';

    useEffect(() => {
        if (!study.organization_id) { setOpcoes([]); return; }
        imovibService.listarEmpreendimentosParaVincular(study.organization_id)
            .then(setOpcoes)
            .catch((e) => {
                console.error(e);
                setOpcoes([]);
                showToast(`Erro ao listar os empreendimentos: ${(e as Error).message}`, 'error');
            });
    }, [study.organization_id]);

    const trocar = async (destino: string) => {
        if (destino === atual) return;
        const nome = opcoes?.find(o => o.id === destino)?.name;
        const ok = await confirm({
            title: destino ? `Vincular a "${nome}"?` : 'Desvincular o empreendimento?',
            message: destino
                ? 'Blocos, tipologias e áreas do estudo passam a vir das torres e unidades deste empreendimento (as que a Planta Inteligente envia a ele). VGV, custo e fluxo são recalculados. Custo e preço por m² continuam sendo do estudo.'
                : 'O estudo volta a mostrar a estrutura antiga dele, só para leitura. VGV, custo e fluxo são recalculados.',
            confirmLabel: destino ? 'Vincular' : 'Desvincular',
            variant: 'warning',
        });
        if (!ok) return;
        setGravando(true);
        try {
            await imovibService.vincularEmpreendimento(study.id, destino || null);
            showToast(destino ? `Estudo vinculado a "${nome}".` : 'Empreendimento desvinculado.', 'success');
            onDataChanged();
        } catch (e) {
            console.error(e);
            showToast(`Erro ao ${destino ? 'vincular' : 'desvincular'}: ${(e as Error).message}`, 'error');
        } finally {
            setGravando(false);
        }
    };

    // Ocupado por outro estudo não entra na lista: tirar o vínculo de lá é de quem cuida daquele estudo.
    const disponiveis = (opcoes || []).filter(o => !o.imovib_study_id || o.imovib_study_id === study.id);
    const travado = !pode || gravando || opcoes === null;
    const porQue = !pode ? motivo : gravando ? 'Gravando o vínculo…' : opcoes === null ? 'Carregando os empreendimentos…' : undefined;

    return (
        <div className="space-y-3">
            <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Empreendimento vinculado</label>
                <div className="flex items-center gap-2">
                    <select
                        value={atual}
                        disabled={travado}
                        title={porQue}
                        onChange={(e) => trocar(e.target.value)}
                        className="h-9 w-full md:max-w-md px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-medium text-slate-700 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all cursor-pointer disabled:cursor-not-allowed"
                    >
                        <option value="">Nenhum (estrutura antiga do estudo, só leitura)</option>
                        {disponiveis.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                    </select>
                    {gravando && <Loader2 className="w-4 h-4 animate-spin text-slate-500" />}
                </div>
            </div>

            {estrutura?.origem === 'empreendimento' ? (
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 p-3 bg-slate-50 border border-slate-200 rounded-[10px] text-sm text-slate-700">
                    <span className="flex items-center gap-2 font-medium">
                        <Building2 className="w-4 h-4 text-indigo-500" />
                        {estrutura.empreendimento_nome}
                    </span>
                    <span>{estrutura.torres} torre(s) · {estrutura.unidades} unidade(s)</span>
                    <span>Terreno: {estrutura.terreno_area ? `${estrutura.terreno_area.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} m²` : 'não informado'}</span>
                    {estrutura.blueprint_study_id ? (
                        <button
                            type="button"
                            onClick={() => { window.location.hash = `#/blueprint?studyId=${estrutura.blueprint_study_id}`; }}
                            className="flex items-center gap-1.5 text-indigo-600 hover:text-indigo-700 font-medium"
                        >
                            <ExternalLink className="w-4 h-4" />
                            Abrir na Planta Inteligente
                        </button>
                    ) : (
                        <span className="text-slate-500">
                            Ainda sem planta: na Planta Inteligente, envie o estudo de massa a este empreendimento.
                        </span>
                    )}
                </div>
            ) : (
                <p className="text-sm text-slate-500">
                    Blocos, tipologias, terreno e zona vêm da Planta Inteligente, pelo empreendimento.
                    Sem vínculo, o estudo mostra a estrutura antiga dele, só para leitura.
                </p>
            )}
        </div>
    );
};

export default ImovibVinculoEmpreendimento;
