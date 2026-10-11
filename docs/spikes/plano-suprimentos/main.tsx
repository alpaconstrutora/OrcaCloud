/**
 * Harness: Engenharia › Planejamento › Suprimentos — Plano de Suprimentos em abas
 * (§19.1) + StandardTable (pedido de 11/10/2026).
 *
 * `SupplyPanel` de produção. Só o `procurementService` é trocado (listar e gerar
 * devolvem dados fabricados) — nada vai ao banco. `?vazio` = plano não gerado.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../../index.css';
import { procurementService } from '../../../services/procurementService';
import { SupplyPanel } from '../../../components/schedule/SupplyPanel';

const dia = (n: number) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().split('T')[0]; };
const base = { organizationId: 'o', projectId: 'p', isStale: false, netRequiredQty: 0, leadTimeDays: 7 };
const ITENS = [
    ['1379', 'Cimento Portland composto CP II-32', 'Alvenaria de vedação de blocos cerâmicos', 'kg', 4210.5, -6, 'pending', 3925.5],
    ['370', 'Areia média — posto jazida/fornecedor (retirado na jazida, sem transporte)', 'Contrapiso em argamassa traço 1:4', 'm3', 38.2, -2, 'pending', 4583.4],
    ['34', 'Aço CA-50, 10,0 mm, vergalhão', 'Armação de pilar ou viga de estrutura convencional', 'kg', 1820, 3, 'quoted', 14742],
    ['4721', 'Pedra britada n. 1 (9,5 a 19 mm)', 'Concreto fck = 25 MPa, traço 1:2,3:2,7', 'm3', 22.4, 5, 'ordered', 2984.32],
    ['7271', 'Bloco cerâmico vazado para alvenaria de vedação, 9 x 19 x 19 cm', 'Alvenaria de vedação de blocos cerâmicos', 'un', 12500, 18, 'pending', 11875],
    ['1213', 'Carpinteiro de formas', 'Montagem e desmontagem de fôrma de pilares', 'h', 320, 24, 'pending', 9216],
    ['7356', 'Tinta acrílica premium, cor branco fosco', 'Pintura látex acrílica', 'l', 180, 62, 'pending', 4914],
    ['', 'Telha cerâmica tipo romana', 'Cobertura em telha cerâmica', 'un', 2400, null, 'pending', 6480],
    ['11964', 'Porta de madeira para pintura, semi-oca, 80 x 210 cm', 'Kit de porta de madeira', 'un', 14, -1, 'received', 5040],
].map(([code, desc, ativ, un, qtd, dias, status, total], i) => ({
    ...base, id: `i${i}`, inputCode: code || undefined, inputDescription: desc, sourceBudgetItemDesc: ativ, inputUnit: un,
    requiredQty: qtd, suggestedBuyDate: dias == null ? undefined : dia(dias as number), status, estimatedTotal: total,
})) as any[];

const vazio = new URLSearchParams(location.search).has('vazio');
(window as any).__geracoes = 0;
(procurementService as any).listPlanItems = async () => (vazio && (window as any).__geracoes === 0 ? [] : ITENS);
(procurementService as any).generatePlan = async () => { (window as any).__geracoes++; return { inserted: ITENS.length }; };

createRoot(document.getElementById('raiz')!).render(
    // O mesmo contêiner da vista Suprimentos em FinancialSchedule.tsx (sem card em volta).
    <div className="space-y-6"><div><SupplyPanel organizationId="o" projectId="p" onNavigateToProcurement={() => {}} /></div></div>
);
