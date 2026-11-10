/**
 * Busca da lista de Colaboradores: nome, função ou CPF (com ou sem máscara).
 *
 * O CPF só entra quando o termo tem dígito. Antes, um termo só de letras virava
 * '' do lado do CPF, e `qualquer.includes('')` é sempre true: buscar
 * "Cristiano" continuava listando todo mundo.
 */
export function casaBuscaColaborador(
    e: { name: string; role?: string | null; cpf?: string | null },
    termo: string,
): boolean {
    if (!termo) return true;
    const t = termo.toLowerCase();
    if (e.name.toLowerCase().includes(t) || (e.role || '').toLowerCase().includes(t)) return true;
    const digitos = termo.replace(/\D/g, '');
    return digitos !== '' && (e.cpf || '').replace(/\D/g, '').includes(digitos);
}
