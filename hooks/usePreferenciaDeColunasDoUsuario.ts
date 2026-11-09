import React from 'react';
import { useStore } from '../store/useStore';
import { tableColumnPreferencesService, type TableColumnPreference } from '../services/tableColumnPreferencesService';
import type { useTableColumns } from '../components/ui/TableUtils';

/** Espera depois da última mudança antes de gravar — arrastar/ligar várias colunas vira UMA gravação. */
const ESPERA_PARA_GRAVAR_MS = 800;

type TabelaDeColunas = Pick<
  ReturnType<typeof useTableColumns>,
  'visibleColumns' | 'sortColumn' | 'sortDirection' | 'columnOrder' | 'knownColumns' | 'aplicarPreferencia'
>;

/**
 * Colunas visíveis, ordem arrastada e ordenação da tabela como escolha do USUÁRIO
 * (banco, `user_table_column_preferences`), não só do navegador — pedido de 09/11/2026
 * em Meus Fornecedores. Plano: docs/planos/2026-11-09-fornecedores-colunas-salvas-e-filtro-e-ou.md
 *
 * - Ao abrir: lê a linha do usuário para `storageKey`; se existe, ela vence o
 *   localStorage (que continua sendo o cache que pinta a tela antes da leitura).
 * - Depois de lida: toda mudança é gravada sozinha, sem botão. Sem linha no banco,
 *   a primeira gravação leva o que o navegador já tinha — a escolha antiga não se perde.
 * - Leitura que falha NÃO libera a gravação: gravar sem ter lido apagaria a escolha
 *   feita em outro computador com o estado deste navegador.
 * - Sem usuário logado (sem e-mail): fica só o localStorage, como antes.
 *
 * Independe de organização (a preferência é da pessoa) — REGRA #5 não se aplica.
 */
export function usePreferenciaDeColunasDoUsuario(tabela: TabelaDeColunas, storageKey: string): void {
  const email = useStore(s => s.currentProfile?.email ?? null);
  const [lida, setLida] = React.useState(false);
  const ultimaGravada = React.useRef<string | null>(null);
  const { aplicarPreferencia } = tabela;

  React.useEffect(() => {
    setLida(false);
    if (!email) return;
    let cancelado = false;
    (async () => {
      try {
        const pref = await tableColumnPreferencesService.get(email, storageKey);
        if (cancelado) return;
        if (pref) aplicarPreferencia(pref);
        setLida(true);
      } catch (err) {
        console.error(`[usePreferenciaDeColunasDoUsuario] Não foi possível ler a preferência de colunas (${storageKey}):`, err);
      }
    })();
    return () => { cancelado = true; };
  }, [email, storageKey, aplicarPreferencia]);

  const pref: TableColumnPreference = {
    visibleColumns: tabela.visibleColumns,
    sortColumn: tabela.sortColumn,
    sortDirection: tabela.sortDirection,
    columnOrder: tabela.columnOrder,
    knownColumns: tabela.knownColumns,
  };
  const json = JSON.stringify(pref);

  React.useEffect(() => {
    if (!email || !lida || json === ultimaGravada.current) return;
    const t = setTimeout(() => {
      ultimaGravada.current = json;
      tableColumnPreferencesService.save(email, storageKey, JSON.parse(json) as TableColumnPreference).catch(err => {
        // Deixa a próxima mudança tentar de novo.
        ultimaGravada.current = null;
        console.error(`[usePreferenciaDeColunasDoUsuario] Não foi possível gravar a preferência de colunas (${storageKey}):`, err);
      });
    }, ESPERA_PARA_GRAVAR_MS);
    return () => clearTimeout(t);
  }, [email, storageKey, lida, json]);
}
