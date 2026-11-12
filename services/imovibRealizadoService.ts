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
import { supabase } from '../lib/supabase';
import { vendasPorMesDoEmpreendimento, vendidasSemNegociacao, type SaleDeal, type SaleProperty } from '../lib/salesAnalysis';

export interface RealizadoDoEstudo {
    /** Obras do empreendimento na organização do estudo. */
    obras: { id: string; nome: string }[];
    /** Obras vinculadas ao empreendimento que são de outra organização: ficam fora. */
    obrasDeOutraOrganizacao: string[];
    /** Por mês ('AAAA-MM'), somado entre as obras — só lançamentos CONCILIADOS (fn_opura_obra_mensal). */
    financeiro: { mes: string; entradas: number; saidas: number }[];
    /** Lançado nas obras e ainda não conciliado (a função devolve à parte): fica fora do realizado. */
    aConciliar: { entradas: number; saidas: number };
    vendas: { mes: string; unidades: number; valor: number }[];
    /** Unidades vendidas sem negociação (sem data): ficam fora das vendas por mês. */
    vendidasSemNegociacao: number;
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
        const vinculadas = snapshot.obras.filter(o => !o.missing).map(o => ({ id: o.id, nome: o.label }));
        // Só as obras da organização do estudo (o vínculo do empreendimento não traz a organização da obra).
        const { data: orgs, error } = vinculadas.length
            ? await supabase.from('projects').select('id, organization_id').in('id', vinculadas.map(o => o.id))
            : { data: [], error: null };
        if (error) throw new Error(`Falha ao ler as obras: ${error.message}`);
        const orgDa = new Map(((orgs ?? []) as { id: string; organization_id: string }[]).map(o => [o.id, o.organization_id]));
        const obras = vinculadas.filter(o => orgDa.get(o.id) === org);
        const obrasDeOutraOrganizacao = vinculadas.filter(o => orgDa.get(o.id) !== org).map(o => o.nome);
        const meses = (await Promise.all(obras.map(o => opuraAnalyticsService.obraMensal(org, o.id)))).flat();
        const aConciliar = { entradas: 0, saidas: 0 };
        const porMes = new Map<string, { entradas: number; saidas: number }>();
        for (const m of meses) {
            aConciliar.entradas += Number(m.entradas_prev) || 0;
            aConciliar.saidas += Number(m.saidas_prev) || 0;
            const k = String(m.mes).slice(0, 7);
            const a = porMes.get(k) ?? { entradas: 0, saidas: 0 };
            a.entradas += Number(m.entradas) || 0;
            a.saidas += Number(m.saidas) || 0;
            porMes.set(k, a);
        }

        const entrada = {
            properties: propriedades as unknown as SaleProperty[],
            deals: (negociacoes as unknown as SaleDeal[]).filter(d => d.type === 'SALE'),
            empreendimentoByProperty: mapa,
        };

        return {
            obras,
            obrasDeOutraOrganizacao,
            financeiro: [...porMes.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([mes, v]) => ({ mes, ...v })),
            aConciliar,
            vendas: vendasPorMesDoEmpreendimento(entrada, empId),
            vendidasSemNegociacao: vendidasSemNegociacao(entrada, empId),
        };
    },
};
