// components/condominio/larguraTabela.ts
// Soma das larguras das colunas VISÍVEIS de uma tabela redimensionável.
//
// §6.1: com `table-layout: fixed` a `<table>` leva `width` = soma exata das
// colunas, nunca `w-full` — em 100% o navegador redistribui a sobra e arrastar
// uma borda redimensiona a vizinha errada. A folga que sobra fica toda no
// `<col />` espaçador (§6.1.1), que só funciona junto de `minWidth: '100%'`.
import type { useResizableColumns } from '../ui/TableUtils';

export function larguraTabela(
    cols: ReturnType<typeof useResizableColumns>,
    chaves: readonly string[],
    visiveis: readonly string[],
): number {
    return chaves.filter(k => visiveis.includes(k)).reduce((acc, k) => acc + cols.getWidth(k), 0);
}
