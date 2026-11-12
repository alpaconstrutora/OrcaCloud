// services/imovibRealizadoService.ts
//
// O realizado de um estudo vinculado (item 10.4 do plano
// docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md): o financeiro mensal
// das obras do empreendimento e as vendas reais dos imóveis dele. Arquivo próprio
// (e não imovibService) porque lê quatro outros serviços. Tudo da ORGANIZAÇÃO DO
// ESTUDO: obra ou negociação de outra organização não entra.

import type { ImovibStudy, Empreendimento } from '../types';
import { empreendimentoService } from './empreendimentoService';
import { empreendimentoLinksService } from './empreendimentoLinksService';
import { opuraAnalyticsService } from './opuraAnalyticsService';
import { commercialService } from './commercialService';
import { vendasPorMesDoEmpreendimento, type SaleDeal, type SaleProperty } from '../lib/salesAnalysis';

export interface RealizadoDoEstudo {
    obras: { id: string; nome: string }[];
    /** Por mês ('AAAA-MM'), somado entre as obras. */
    financeiro: { mes: string; entradas: number; saidas: number }[];
    vendas: { mes: string; unidades: number; valor: number }[];
}

export const imovibRealizadoService = {
    async doEstudo(study: ImovibStudy): Promise<RealizadoDoEstudo> {
        const empId = study.estrutura?.origem === 'empreendimento' ? study.estrutura.empreendimento_id : undefined;
        if (!empId) throw new Error('O estudo não está vinculado a um empreendimento.');
        const org = study.organization_id;

        const [emp, propriedades, negociacoes, mapa] = await Promise.all([
            empreendimentoService.getById(empId),
            commercialService.listProperties(org),
            commercialService.listDeals(undefined, org),
            empreendimentoService.mapPropertiesToEmpreendimentos(org, 'SALE'),
        ]);
        if (!emp) throw new Error('Empreendimento do estudo não encontrado.');

        const snapshot = await empreendimentoLinksService.getSnapshot(emp as Empreendimento, org);
        const obras = snapshot.obras.filter(o => !o.missing).map(o => ({ id: o.id, nome: o.label }));
        const meses = (await Promise.all(obras.map(o => opuraAnalyticsService.obraMensal(org, o.id)))).flat();
        const porMes = new Map<string, { entradas: number; saidas: number }>();
        for (const m of meses) {
            const k = String(m.mes).slice(0, 7);
            const a = porMes.get(k) ?? { entradas: 0, saidas: 0 };
            a.entradas += Number(m.entradas) || 0;
            a.saidas += Number(m.saidas) || 0;
            porMes.set(k, a);
        }

        const vendas = vendasPorMesDoEmpreendimento({
            properties: propriedades as unknown as SaleProperty[],
            deals: (negociacoes as unknown as SaleDeal[]).filter(d => d.type === 'SALE'),
            empreendimentoByProperty: mapa,
        }, empId);

        return {
            obras,
            financeiro: [...porMes.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([mes, v]) => ({ mes, ...v })),
            vendas,
        };
    },
};
