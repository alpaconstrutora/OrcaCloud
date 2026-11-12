import React, { useEffect, useState } from 'react';
import { Ruler } from 'lucide-react';
import { ImovibStudy } from '../types';
import { imovibService } from '../services/imovibService';
import type { AreaEquivalenteDaPlanta } from '../utils/imovibAreaEquivalente';

interface Props {
    study: ImovibStudy;
    /** Custo de obra do motor — o mesmo da DRE da Estática. */
    custoObra: number;
    /** A área do custo de obra não tem área comum (resultado.produto.custoSemAreaComum). */
    custoSemAreaComum: boolean;
}

const formatArea = (v: number) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(v) + ' m²';
const formatM2 = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v) + '/m²';

/**
 * Área equivalente NBR 12721 (item 8.2 do plano 2026-11-11): lida do quadro
 * congelado numa versão publicada da Planta Inteligente do empreendimento. O
 * estudo não recalcula a norma; sem quadro, "Não medido" — nunca zero.
 */
const ImovibAreaEquivalenteCard: React.FC<Props> = ({ study, custoObra, custoSemAreaComum }) => {
    const plantaId = study.estrutura?.origem === 'empreendimento' ? study.estrutura.blueprint_study_id ?? null : null;
    const [area, setArea] = useState<AreaEquivalenteDaPlanta | null>(null);
    const [carregando, setCarregando] = useState(!!plantaId);
    const [erro, setErro] = useState<string | null>(null);

    useEffect(() => {
        if (!plantaId) { setArea(null); setCarregando(false); return; }
        let vivo = true;
        setArea(null);
        setCarregando(true);
        setErro(null);
        imovibService.areaEquivalenteDaPlanta(plantaId)
            .then(r => { if (vivo) setArea(r); })
            .catch(e => { if (vivo) { setArea(null); setErro(e instanceof Error ? e.message : 'Falha ao ler o quadro NBR 12721.'); } })
            .finally(() => { if (vivo) setCarregando(false); });
        return () => { vivo = false; };
    }, [plantaId]);

    const linkDaPlanta = plantaId
        ? <a href={`#/blueprint?studyId=${plantaId}`} className="text-indigo-600 hover:underline">Planta Inteligente</a>
        : null;

    let explicacao: React.ReactNode;
    if (!study.estrutura || study.estrutura.origem !== 'empreendimento') {
        explicacao = 'Para medir, vincule o estudo a um empreendimento com Planta Inteligente (Premissas › Identificação).';
    } else if (!plantaId) {
        explicacao = 'O empreendimento vinculado não tem Planta Inteligente.';
    } else if (carregando) {
        explicacao = 'Lendo o quadro da Planta…';
    } else if (erro) {
        explicacao = erro;
    } else if (!area) {
        explicacao = <>Nenhuma versão publicada com os quadros NBR 12721. Publique a versão em "Áreas NBR 12721" na {linkDaPlanta}.</>;
    } else {
        explicacao = <>Quadro I da {linkDaPlanta}, versão {area.revisao} · {area.situacao.toLowerCase()}.</>;
    }

    return (
        <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
                <div className="p-2 bg-blue-50 text-blue-600 rounded-[6px]">
                    <Ruler className="w-4 h-4" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">Área equivalente (NBR 12721)</h3>
            </div>
            <div className="px-6 py-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                    <span className="text-xs font-semibold text-gray-500">Área equivalente total</span>
                    <div className="text-xl font-semibold text-gray-900 mt-1">{area ? formatArea(area.total) : 'Não medido'}</div>
                </div>
                <div>
                    <span className="text-xs font-semibold text-gray-500">Custo de obra por m² equivalente</span>
                    <div className="text-xl font-semibold text-gray-900 mt-1">{area && custoObra > 0 ? formatM2(custoObra / area.total) : '—'}</div>
                </div>
            </div>
            <div className="px-6 pb-4 space-y-1">
                <p className="text-xs text-gray-600">{explicacao}</p>
                {area && custoObra <= 0 && (
                    <p className="text-xs text-gray-600">Sem custo de obra no estudo (Orçamento › Por torre).</p>
                )}
                {area && custoObra > 0 && custoSemAreaComum && (
                    <p className="text-xs text-amber-700">O custo de obra do estudo foi calculado sem área comum (as tipologias não têm área comum cadastrada); o custo por m² equivalente fica subestimado.</p>
                )}
                {area?.status === 'failed' && (
                    <p className="text-xs text-amber-700">O quadro desta versão tem pendência bloqueante; corrija na Planta e publique de novo.</p>
                )}
            </div>
        </div>
    );
};

export default ImovibAreaEquivalenteCard;
