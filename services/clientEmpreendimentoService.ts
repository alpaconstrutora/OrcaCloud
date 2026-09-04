import { supabase } from '../lib/supabase';

/**
 * Vínculo EXPLÍCITO Cliente ↔ Empreendimento (`client_empreendimentos`,
 * migration `aplicar_20270918000027`).
 *
 * ⚠️ Não é a única origem do que a coluna "Empreendimento Vinculado" mostra em
 * Meus Clientes. O outro caminho é DERIVADO — obra vinculada ao cliente
 * (`projects.settings.clientId`) resolvida até o empreendimento-pai por
 * `empreendimentoService.mapObrasToEmpreendimentos`. A tela soma os dois e
 * deduplica por id; este service cuida só do vínculo que o usuário escolhe à
 * mão no cadastro.
 */

export interface ClientEmpreendimentoRef {
    id: string;
    name: string;
}

export const clientEmpreendimentoService = {
    /**
     * Vínculos de VÁRIOS clientes numa consulta só — a lista de clientes chama
     * isto uma vez, não uma vez por linha.
     *
     * Chave ausente no retorno = cliente sem vínculo direto (não é erro).
     */
    async listByClients(clientIds: string[]): Promise<Record<string, ClientEmpreendimentoRef[]>> {
        const map: Record<string, ClientEmpreendimentoRef[]> = {};
        if (clientIds.length === 0) return map;

        const { data, error } = await supabase
            .from('client_empreendimentos')
            .select('client_id, empreendimento_id, empreendimentos:empreendimento_id(name)')
            .in('client_id', clientIds);

        if (error) throw error;

        for (const row of (data || []) as unknown as {
            client_id: string;
            empreendimento_id: string;
            empreendimentos: { name: string } | { name: string }[] | null;
        }[]) {
            // O embed do PostgREST vem como objeto (FK simples), mas a tipagem
            // gerada às vezes o descreve como array — normaliza os dois.
            const emp = Array.isArray(row.empreendimentos) ? row.empreendimentos[0] : row.empreendimentos;
            if (!emp) continue;   // empreendimento apagado entre a leitura e o join
            (map[row.client_id] ??= []).push({ id: row.empreendimento_id, name: emp.name });
        }

        for (const list of Object.values(map)) {
            list.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
        }
        return map;
    },

    /** Ids dos empreendimentos vinculados a um cliente — para preencher o formulário. */
    async listIdsByClient(clientId: string): Promise<string[]> {
        const { data, error } = await supabase
            .from('client_empreendimentos')
            .select('empreendimento_id')
            .eq('client_id', clientId);

        if (error) throw error;
        return (data || []).map(r => (r as { empreendimento_id: string }).empreendimento_id);
    },

    /**
     * Sincroniza o conjunto de vínculos de um cliente por DIFF — insere só o que
     * entrou, apaga só o que saiu.
     *
     * Apagar tudo e reinserir seria mais curto e estaria errado: `created_at`
     * de um vínculo que não mudou se perderia, e um erro no meio deixaria o
     * cliente sem nenhum vínculo em vez de com os antigos.
     */
    async setForClient(clientId: string, empreendimentoIds: string[]): Promise<void> {
        const atuais = await this.listIdsByClient(clientId);
        const alvo = new Set(empreendimentoIds);
        const antes = new Set(atuais);

        const inserir = empreendimentoIds.filter(id => !antes.has(id));
        const remover = atuais.filter(id => !alvo.has(id));

        if (inserir.length > 0) {
            const { error } = await supabase
                .from('client_empreendimentos')
                .insert(inserir.map(empreendimento_id => ({ client_id: clientId, empreendimento_id })));
            if (error) throw error;
        }

        if (remover.length > 0) {
            const { error } = await supabase
                .from('client_empreendimentos')
                .delete()
                .eq('client_id', clientId)
                .in('empreendimento_id', remover);
            if (error) throw error;
        }
    },
};
