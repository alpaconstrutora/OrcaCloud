// services/unitOccupancyService.ts
// Ocupações da unidade — ÒPURA Pós-Entrega, F0.
// Plano: docs/planos/2026-08-13-opura-condominios-avaliacao.md
//
// Propriedade ≠ ocupação ≠ responsabilidade financeira. Uma LINHA por papel;
// encerrar preenche `ended_at` em vez de apagar, porque ocupação é histórico
// ("quem morava aqui em março?" só tem resposta se a linha antiga sobreviver).
//
// A organização NÃO é escrita por aqui: o trigger `trg_unit_occupancies_org`
// deriva do empreendimento dono da unidade e levanta exceção se a tela mandar
// outra (CLAUDE.md regra #5 — filho herda a org do pai).

import { supabase } from '../lib/supabase';
import type {
    UnitOccupancy,
    UnitOccupancyInsert,
    UnitOccupancyRow,
    UnitOccupancyUpdate,
} from '../types/empreendimento';

// Colunas explícitas, nunca `select('*')` — feedback_select_narrowing.
const OCCUPANCY_COLS =
    'id, unit_id, client_id, organization_id, role, started_at, ended_at, notes, created_at, updated_at';

/** Traduz os erros do banco em frases que o usuário resolve sozinho (UI_PATTERNS §6.4). */
export function traduzirErroOcupacao(mensagem: string, nomePessoa?: string): string {
    if (mensagem.includes('uidx_unit_occupancies_um_responsavel')) {
        return 'Esta unidade já tem um responsável financeiro ativo. Encerre a ocupação atual antes de definir outro — só pode haver um por unidade.';
    }
    if (mensagem.includes('uidx_unit_occupancies_vigente')) {
        return `${nomePessoa || 'Esta pessoa'} já tem uma ocupação ativa nesta unidade com o mesmo papel.`;
    }
    if (mensagem.includes('Filho herda a org do pai')) {
        return 'A unidade pertence a outra organização. Recarregue a página e tente de novo.';
    }
    if (mensagem.includes('unit_occupancies_periodo_valido')) {
        return 'A data de saída não pode ser anterior à data de entrada.';
    }
    if (mensagem.includes('unit_occupancies_client_fk')) {
        return 'A pessoa selecionada não existe mais. Recarregue a lista de clientes.';
    }
    return mensagem;
}

export const unitOccupancyService = {
    /**
     * Ocupações de um empreendimento inteiro, já resolvidas com nome da pessoa e
     * da unidade. Duas consultas em vez de um join aninhado: `empreendimento_units`
     * não tem `organization_id`, então o PostgREST não consegue recortar a árvore
     * inteira sozinho — e o join implícito devolveria a unidade sem a torre.
     */
    async listByEmpreendimento(
        unitIds: string[],
        unitLabels: Record<string, { unitName: string; towerName: string; fracao?: number | null }>,
        opts?: { incluirEncerradas?: boolean },
    ): Promise<UnitOccupancyRow[]> {
        if (unitIds.length === 0) return [];

        let query = supabase
            .from('unit_occupancies')
            .select(OCCUPANCY_COLS)
            .in('unit_id', unitIds)
            .order('started_at', { ascending: false })
            // Desempate determinístico: só `started_at` empata entre ocupações
            // cadastradas no mesmo dia e a ordem oscila entre carregamentos (§6.7).
            .order('id', { ascending: false });

        if (!opts?.incluirEncerradas) query = query.is('ended_at', null);

        const { data, error } = await query;
        if (error) throw new Error(`Falha ao carregar ocupações: ${error.message}`);

        const ocupacoes = (data || []) as UnitOccupancy[];
        if (ocupacoes.length === 0) return [];

        const clientIds = [...new Set(ocupacoes.map(o => o.client_id))];
        const { data: clientes, error: erroClientes } = await supabase
            .from('clients')
            .select('id, name, document, email')
            .in('id', clientIds);
        if (erroClientes) throw new Error(`Falha ao carregar pessoas: ${erroClientes.message}`);

        const porCliente = new Map((clientes || []).map(c => [c.id, c]));

        return ocupacoes.map(o => {
            const c = porCliente.get(o.client_id);
            const label = unitLabels[o.unit_id];
            return {
                ...o,
                // Cliente excluído com ocupação viva não deve existir (FK RESTRICT),
                // mas se aparecer é melhor a linha existir e denunciar do que sumir.
                _client_name: c?.name || '(pessoa não encontrada)',
                _client_document: c?.document ?? null,
                _client_email: c?.email ?? null,
                _unit_name: label?.unitName || '—',
                _tower_name: label?.towerName || '—',
                _fracao_ideal: label?.fracao ?? null,
            };
        });
    },

    async create(payload: UnitOccupancyInsert): Promise<UnitOccupancy> {
        const { data, error } = await supabase
            .from('unit_occupancies')
            .insert(payload)
            .select(OCCUPANCY_COLS)
            .single();
        if (error) throw new Error(traduzirErroOcupacao(error.message));
        return data as UnitOccupancy;
    },

    async update(id: string, patch: UnitOccupancyUpdate): Promise<UnitOccupancy> {
        const { data, error } = await supabase
            .from('unit_occupancies')
            .update(patch)
            .eq('id', id)
            .select(OCCUPANCY_COLS)
            .single();
        if (error) throw new Error(traduzirErroOcupacao(error.message));
        return data as UnitOccupancy;
    },

    /**
     * Encerrar ≠ excluir. É a operação normal quando alguém sai — mantém o
     * histórico e libera o invariante de responsável financeiro único
     * (UI_PATTERNS §6.3: em ERP, DELETE físico destrói auditoria).
     */
    async encerrar(id: string, dataSaida: string): Promise<UnitOccupancy> {
        return this.update(id, { ended_at: dataSaida });
    },

    /** Só para corrigir cadastro errado — não para registrar saída (use `encerrar`). */
    async remove(id: string): Promise<void> {
        const { error } = await supabase.from('unit_occupancies').delete().eq('id', id);
        if (error) throw new Error(traduzirErroOcupacao(error.message));
    },
};
