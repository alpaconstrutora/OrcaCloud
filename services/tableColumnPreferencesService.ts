import { supabase } from '../lib/supabase';

export interface TableColumnPreference {
  visibleColumns: string[];
  sortColumn: string | null;
  sortDirection: 'asc' | 'desc';
}

/**
 * Preferência de colunas visíveis por usuário (não por navegador) — mesma chave
 * (`storageKey`) já usada em `useTableColumns` para o localStorage. Independente
 * de organização: o usuário quer o mesmo layout de colunas em qualquer org.
 *
 * user_email sempre normalizado para minúsculo aqui (leitura e escrita) — a RLS
 * já compara via lower() (mesmo padrão usado em outras tabelas deste projeto),
 * mas sem normalizar também na aplicação, duas chamadas com capitalização
 * diferente do mesmo e-mail criariam duas linhas (a UNIQUE é case-sensitive).
 */
export const tableColumnPreferencesService = {
  async get(userEmail: string, storageKey: string): Promise<TableColumnPreference | null> {
    const { data, error } = await supabase
      .from('user_table_column_preferences')
      .select('visible_columns, sort_column, sort_direction')
      .eq('user_email', userEmail.toLowerCase())
      .eq('storage_key', storageKey)
      .maybeSingle();

    if (error) {
      console.error('[TableColumnPreferencesService] Erro ao carregar preferência de colunas:', error);
      throw new Error(`Erro ao carregar preferência de colunas: ${error.message}`);
    }
    if (!data) return null;

    return {
      visibleColumns: (data.visible_columns as string[]) || [],
      sortColumn: data.sort_column,
      sortDirection: (data.sort_direction as 'asc' | 'desc') || 'asc',
    };
  },

  async save(userEmail: string, storageKey: string, pref: TableColumnPreference): Promise<void> {
    const { error } = await supabase
      .from('user_table_column_preferences')
      .upsert(
        {
          user_email: userEmail.toLowerCase(),
          storage_key: storageKey,
          visible_columns: pref.visibleColumns,
          sort_column: pref.sortColumn,
          sort_direction: pref.sortDirection,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_email,storage_key' }
      );

    if (error) {
      console.error('[TableColumnPreferencesService] Erro ao salvar preferência de colunas:', error);
      throw new Error(`Erro ao salvar preferência de colunas: ${error.message}`);
    }
  },
};
