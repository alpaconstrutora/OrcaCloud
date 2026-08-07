import { supabase } from '../lib/supabase';
import { vacancyStats, netAbsorption, type StatusEvent, type VacancyStats } from '../lib/rentalVacancy';

/**
 * KPIs de tempo de vacância, a partir do log `commercial_property_status_events`
 * (Fase 1 de docs/planos/2026-08-06-kpis-locacao-primitivas.md).
 *
 * ⚠️ A migration desta tabela NÃO sobe no deploy — o Vercel publica só o
 * front-end, e as partes em `supabase/migrations/aplicar_20270901000000/`
 * precisam ser aplicadas à mão. Por isso todo este serviço trata "tabela ainda
 * não existe" como estado NORMAL, devolvendo `null`, e a tela simplesmente não
 * mostra os indicadores. Sem isso, o deploy do front quebraria a aba Análise
 * inteira em qualquer ambiente onde a migration ainda não rodou.
 */

/** Postgres `undefined_table` e o equivalente do PostgREST (cache de schema). */
const MISSING_TABLE_CODES = new Set(['42P01', 'PGRST205', 'PGRST202']);

const isMissingTable = (error: { code?: string; message?: string } | null): boolean => {
    if (!error) return false;
    if (error.code && MISSING_TABLE_CODES.has(error.code)) return true;
    const message = (error.message || '').toLowerCase();
    return message.includes('does not exist') || message.includes('schema cache');
};

export interface RentalVacancyMetrics extends VacancyStats {
    /** Locações menos desocupações nos últimos 30 dias. */
    netAbsorption30d: { rented: number; vacated: number; net: number };
}

export const rentalVacancyService = {
    /**
     * `null` = indicador indisponível (migration não aplicada). É diferente de
     * zero, que significa "medido, e não há unidade vaga" — a tela não pode
     * confundir os dois e mostrar "0 dias de vacância" quando na verdade não
     * mediu nada.
     *
     * `organizationId` nulo = "Todas as organizações": não filtra e deixa a RLS
     * recortar (REGRA #5). Nunca bloquear o carregamento por causa dele.
     */
    async getVacancyMetrics(
        organizationId?: string | null,
        buildingId?: string | null
    ): Promise<RentalVacancyMetrics | null> {
        try {
            let query = supabase
                .from('commercial_property_status_events')
                .select('property_id, from_status, to_status, changed_at, source')
                .order('changed_at', { ascending: true });

            if (organizationId) query = query.eq('organization_id', organizationId);

            // Dentro de um edifício, só as unidades dele. Duas consultas em vez
            // de join porque o log não guarda `parent_id` — ele é do imóvel, e
            // duplicá-lo no evento criaria um segundo lugar para ficar errado
            // quando a unidade muda de prédio.
            if (buildingId) {
                const { data: units, error: unitsError } = await supabase
                    .from('commercial_properties')
                    .select('id')
                    .eq('parent_id', buildingId);
                if (unitsError) throw unitsError;
                const ids = (units || []).map(u => u.id as string);
                if (ids.length === 0) return null;
                query = query.in('property_id', ids);
            }

            const { data, error } = await query;

            if (error) {
                if (isMissingTable(error)) {
                    console.info(
                        '[RentalVacancy] Tabela de histórico de status ainda não existe — ' +
                        'aplicar supabase/migrations/aplicar_20270901000000/ (partes 1 a 4). ' +
                        'Os KPIs de vacância ficam ocultos até lá.'
                    );
                    return null;
                }
                throw error;
            }

            const events = (data || []) as StatusEvent[];
            if (events.length === 0) {
                // Tabela existe e está vazia — sintoma típico de as partes 1 a 3
                // terem rodado e a 4 (backfill) não. Visualmente é idêntico a
                // "tabela ausente" (KPIs ocultos), então a mensagem precisa
                // separar os dois casos, ou o diagnóstico vira adivinhação.
                console.info(
                    '[RentalVacancy] Log de status existe, mas está vazio. ' +
                    'Falta rodar a parte 4 (backfill) de aplicar_20270901000000/, ' +
                    'ou a organização/edifício filtrado não tem imóveis.'
                );
                return null;
            }

            const now = new Date();
            const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000);

            return {
                ...vacancyStats(events, now),
                netAbsorption30d: netAbsorption(events, thirtyDaysAgo, now),
            };
        } catch (err) {
            console.error('[RentalVacancy] Erro ao carregar métricas de vacância:', err);
            return null;
        }
    },
};
