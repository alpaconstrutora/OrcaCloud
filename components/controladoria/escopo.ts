import React from 'react';
import { useStore } from '../../store/useStore';
import { financialReportService } from '../../services/financialReportService';
import type { RegimeContabil } from '../../types/financial';
import { anoCorrente } from '../../utils/periodoControladoria';

// Escopo ÚNICO das seis abas da Controladoria — período, regime e obra
// (plano docs/planos/2026-11-14-controladoria-critica.md, passo 2; decisão do
// usuário: "Um período para todas"). Antes cada aba tinha o próprio e trocar de
// aba voltava para 01/01–31/12; quem lia DRE e Balancete do mesmo mês tinha de
// redigitar as datas e lembrar o regime de cada uma.
//
// Não vai para localStorage de propósito: um período velho reaberto semanas depois
// mostraria números de um recorte que o usuário não pediu hoje — a mesma classe de
// defeito que o passo 1 fechou. Sobrevive à troca de aba, não ao recarregar.

export interface ObraOpcao { project_id: string; project_name: string; code: string | null }

export interface EscopoControladoria {
    de: string;
    ate: string;
    regime: RegimeContabil;
    /** '' = todas as obras. */
    obraId: string;
    obras: ObraOpcao[];
    setDe: (v: string) => void;
    setAte: (v: string) => void;
    setRegime: (v: RegimeContabil) => void;
    setObra: (id: string) => void;
}

export function useEscopoControladoria(orgId: string | null): EscopoControladoria {
    const obraDoTopo = useStore(s => s.projectId);
    const [de, setDe] = React.useState(() => anoCorrente().de);
    const [ate, setAte] = React.useState(() => anoCorrente().ate);
    const [regime, setRegime] = React.useState<RegimeContabil>('CAIXA');
    const [obraId, setObraId] = React.useState('');
    const [obras, setObras] = React.useState<ObraOpcao[]>([]);
    // Depois que o usuário escolhe uma obra aqui, a do topo não a sobrescreve mais.
    const escolheuObra = React.useRef(false);

    React.useEffect(() => {
        let vivo = true;
        financialReportService.listObras(orgId)
            .then(lista => {
                if (!vivo) return;
                setObras(lista);
                setObraId(atual => {
                    // Obra de outra organização não fica selecionada às escondidas.
                    if (atual && !lista.some(o => o.project_id === atual)) return '';
                    // A obra aberta no topo é o ponto de partida — só se for OBRA
                    // (o topo também abre orçamento/planejamento, que não são obra).
                    if (!escolheuObra.current && !atual && obraDoTopo && lista.some(o => o.project_id === obraDoTopo)) {
                        return obraDoTopo;
                    }
                    return atual;
                });
            })
            .catch(e => console.error('[Controladoria] obras', e));
        return () => { vivo = false; };
    }, [orgId, obraDoTopo]);

    const setObra = React.useCallback((id: string) => {
        escolheuObra.current = true;
        setObraId(id);
    }, []);

    return { de, ate, regime, obraId, obras, setDe, setAte, setRegime, setObra };
}
