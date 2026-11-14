import { supabase } from '../lib/supabase';
import { rentalExecutiveService, type RentalExecutiveRaw } from './rentalExecutiveService';
import type { AnalysisMeasurement, AnalysisServiceContract } from '../lib/serviceContractAnalysis';

/**
 * Carga da aba Contratos de Serviço › Análise — o BRUTO, sem agregar. As contas
 * são puras (`lib/serviceContractAnalysis.ts`) e rodam no cliente, por balde.
 * Plano: docs/planos/2026-11-13-contratos-servico-aba-analise.md.
 *
 * Três consultas, e cada uma falha do seu jeito:
 * - contratos + parcelas (`rentalExecutiveService.loadRaw`, domínio `SERVICOS` —
 *   o mesmo caminho de Locações e Vendas, com o prefixo composto de
 *   `reference_id` já resolvido): falha de verdade LANÇA — sem contrato não há aba;
 * - medições: falha vira `null` ("não medido"), o resto da aba segue;
 * - nomes dos clientes: falha vira mapa vazio — o balde mostra "Cliente sem nome".
 *
 * Org: `null` = "Todas" — não filtra e a RLS recorta (REGRA #5).
 */

const IN_CHUNK = 150;
const chunk = <T,>(arr: T[], size: number): T[][] => {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
};

export interface ServiceContractsAnalysisRaw {
    contracts: AnalysisServiceContract[];
    receivablesByContract: RentalExecutiveRaw['receivablesByContract'] | null;
    measurements: AnalysisMeasurement[] | null;
    clientNames: Map<string, string>;
}

const carregarMedicoes = async (contractIds: string[]): Promise<AnalysisMeasurement[] | null> => {
    const out: AnalysisMeasurement[] = [];
    try {
        for (const lote of chunk(contractIds, IN_CHUNK)) {
            const { data, error } = await supabase
                .from('contract_measurements')
                .select('contract_id, status, total_value')
                .in('contract_id', lote);
            if (error) throw error;
            out.push(...((data || []) as AnalysisMeasurement[]));
        }
        return out;
    } catch (err) {
        console.error('[ServiceContractsAnalysis] Erro ao carregar medições:', err);
        return null;
    }
};

const carregarNomesDosClientes = async (clientIds: string[]): Promise<Map<string, string>> => {
    const nomes = new Map<string, string>();
    try {
        for (const lote of chunk(clientIds, IN_CHUNK)) {
            const { data, error } = await supabase.from('clients').select('id, name').in('id', lote);
            if (error) throw error;
            for (const c of (data || []) as { id: string; name: string | null }[]) {
                if (c.name?.trim()) nomes.set(c.id, c.name.trim());
            }
        }
    } catch (err) {
        console.error('[ServiceContractsAnalysis] Erro ao carregar clientes:', err);
    }
    return nomes;
};

export const serviceContractAnalysisService = {
    async load(organizationId: string | null): Promise<ServiceContractsAnalysisRaw> {
        const raw = await rentalExecutiveService.loadRaw(organizationId, null, { throwOnError: true, domain: 'SERVICOS' });
        // `null` = tabela ausente ou sem permissão: aba vazia, sem cobrança medida.
        const contracts = (raw?.contracts ?? []) as AnalysisServiceContract[];
        const ids = contracts.map(c => c.id);
        const clientIds = [...new Set(contracts.map(c => c.client_id).filter((id): id is string => !!id))];
        const [measurements, clientNames] = await Promise.all([
            ids.length ? carregarMedicoes(ids) : Promise.resolve([] as AnalysisMeasurement[]),
            clientIds.length ? carregarNomesDosClientes(clientIds) : Promise.resolve(new Map<string, string>()),
        ]);
        return {
            contracts,
            receivablesByContract: raw ? raw.receivablesByContract : null,
            measurements,
            clientNames,
        };
    },
};
