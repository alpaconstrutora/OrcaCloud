import * as XLSX from 'xlsx';
// @ts-ignore — file-saver não tem tipos no projeto (mesmo padrão de services/exportService.ts)
import { saveAs } from 'file-saver';
import { Client } from '../types';

/**
 * Exportação/importação de Meus Clientes em Excel.
 *
 * O cabeçalho é a MESMA lista nos dois sentidos (`IMPORT_COLUMNS`): quem exporta,
 * edita e reimporta não precisa renomear nada. As duas colunas exclusivas da
 * exportação (`EXPORT_ONLY_COLUMNS`) são derivadas — organização e vínculo de
 * empreendimento não se cadastram por planilha, então o import as ignora.
 */

/** Colunas que a importação lê. A ordem aqui é a ordem da planilha. */
export const IMPORT_COLUMNS = [
    'Código',
    'Nome',
    'Tipo de pessoa',
    'Tipo de cliente',
    'CPF/CNPJ',
    'E-mail',
    'Telefone',
    'CEP',
    'Logradouro',
    'Número',
    'Bairro',
    'Cidade',
    'UF',
    'Status',
    'Portal',
] as const;

/** Só na exportação — dado derivado, sem contrapartida na importação. */
const EXPORT_ONLY_COLUMNS = ['Organização', 'Empreendimentos vinculados'] as const;

export type ClientImportColumn = typeof IMPORT_COLUMNS[number];

/** Uma linha da planilha, já normalizada para os nomes de coluna canônicos. */
export type ClientSheetRow = Partial<Record<ClientImportColumn, string>>;

/**
 * Aceita o cabeçalho canônico e alguns apelidos comuns (acento perdido, nome do
 * campo do banco). Sem isso, uma planilha salva por outro programa — que troca
 * "Código" por "Codigo" — chega com todas as colunas vazias e sem dizer por quê.
 */
const HEADER_ALIASES: Record<string, ClientImportColumn> = {
    'codigo': 'Código',
    'code': 'Código',
    'nome': 'Nome',
    'cliente': 'Nome',
    'name': 'Nome',
    'tipo de pessoa': 'Tipo de pessoa',
    'tipo': 'Tipo de pessoa',
    'type': 'Tipo de pessoa',
    'tipo de cliente': 'Tipo de cliente',
    'categoria': 'Tipo de cliente',
    'category': 'Tipo de cliente',
    'cpf/cnpj': 'CPF/CNPJ',
    'cpf': 'CPF/CNPJ',
    'cnpj': 'CPF/CNPJ',
    'documento': 'CPF/CNPJ',
    'document': 'CPF/CNPJ',
    'e-mail': 'E-mail',
    'email': 'E-mail',
    'telefone': 'Telefone',
    'phone': 'Telefone',
    'cep': 'CEP',
    'zip_code': 'CEP',
    'logradouro': 'Logradouro',
    'endereco': 'Logradouro',
    'endereço': 'Logradouro',
    'address': 'Logradouro',
    'numero': 'Número',
    'número': 'Número',
    'address_number': 'Número',
    'bairro': 'Bairro',
    'neighborhood': 'Bairro',
    'cidade': 'Cidade',
    'city': 'Cidade',
    'uf': 'UF',
    'estado': 'UF',
    'state': 'UF',
    'status': 'Status',
    'portal': 'Portal',
    'portais': 'Portal',
};

function canonicalHeader(raw: string): ClientImportColumn | null {
    const limpo = raw.trim();
    if ((IMPORT_COLUMNS as readonly string[]).includes(limpo)) return limpo as ClientImportColumn;
    return HEADER_ALIASES[limpo.toLowerCase()] ?? null;
}

/**
 * Lê a primeira aba do arquivo e devolve as linhas com o cabeçalho normalizado.
 * Coluna desconhecida é descartada em silêncio (planilha real costuma trazer
 * colunas de controle do usuário).
 */
export function parseClientSheet(buffer: ArrayBuffer): ClientSheetRow[] {
    const wb = XLSX.read(new Uint8Array(buffer), { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    if (!ws) return [];

    const brutas = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
    return brutas.map(bruta => {
        const linha: ClientSheetRow = {};
        for (const [chave, valor] of Object.entries(bruta)) {
            const coluna = canonicalHeader(chave);
            if (!coluna) continue;
            linha[coluna] = String(valor ?? '').trim();
        }
        return linha;
    });
}

/** Empreendimentos vinculados a um cliente, para a coluna derivada da exportação. */
export type EmpreendimentosPorCliente = (clientId: string) => { name: string }[];

export function exportClientsToExcel(
    clients: Client[],
    empreendimentosDoCliente: EmpreendimentosPorCliente,
    fileName = `clientes-${new Date().toISOString().slice(0, 10)}`,
): void {
    const linhas = clients.map(c => ({
        'Código': c.code || '',
        'Nome': c.name || '',
        'Tipo de pessoa': c.type || '',
        'Tipo de cliente': c.category || '',
        'CPF/CNPJ': c.document || '',
        'E-mail': c.email || '',
        'Telefone': c.phone || '',
        'CEP': c.zip_code || '',
        'Logradouro': c.address || '',
        'Número': c.address_number || '',
        'Bairro': c.neighborhood || '',
        'Cidade': c.city || '',
        'UF': c.state || '',
        'Status': c.status || 'Ativo',
        'Portal': c.portal || 'Nenhum',
        'Organização': c.organization_name || '',
        'Empreendimentos vinculados': empreendimentosDoCliente(c.id).map(e => e.name).join('; '),
    }));

    const ws = XLSX.utils.json_to_sheet(linhas, {
        header: [...IMPORT_COLUMNS, ...EXPORT_ONLY_COLUMNS] as string[],
    });
    ws['!cols'] = [...IMPORT_COLUMNS, ...EXPORT_ONLY_COLUMNS].map(col => ({
        wch: col === 'Nome' || col === 'E-mail' || col === 'Empreendimentos vinculados' ? 32 : 16,
    }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Clientes');
    const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    saveAs(new Blob([buffer], { type: 'application/octet-stream' }), `${fileName}.xlsx`);
}

/**
 * Planilha modelo do import — cabeçalho + uma linha de exemplo. Existe para o
 * usuário não ter que adivinhar o nome das colunas antes da primeira tentativa.
 */
export function downloadClientImportTemplate(): void {
    const exemplo: ClientSheetRow = {
        'Código': '001',
        'Nome': 'Construtora Exemplo Ltda',
        'Tipo de pessoa': 'PJ',
        'Tipo de cliente': 'Vendas',
        'CPF/CNPJ': '00.000.000/0001-00',
        'E-mail': 'contato@exemplo.com.br',
        'Telefone': '(31) 90000-0000',
        'CEP': '30000-000',
        'Logradouro': 'Av. Exemplo',
        'Número': '100',
        'Bairro': 'Centro',
        'Cidade': 'Belo Horizonte',
        'UF': 'MG',
        'Status': 'Ativo',
        'Portal': 'Nenhum',
    };

    const ws = XLSX.utils.json_to_sheet([exemplo], { header: [...IMPORT_COLUMNS] as string[] });
    ws['!cols'] = IMPORT_COLUMNS.map(col => ({ wch: col === 'Nome' || col === 'E-mail' ? 32 : 16 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Clientes');
    const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    saveAs(new Blob([buffer], { type: 'application/octet-stream' }), 'modelo-importacao-clientes.xlsx');
}

/** Só os dígitos — o casamento de cliente existente é por documento, não por formatação. */
export function onlyDigits(value: string | null | undefined): string {
    return (value || '').replace(/\D/g, '');
}

/**
 * Converte uma linha da planilha em payload de `clientService.saveClient`.
 * Campo vazio é OMITIDO, não gravado como string vazia: numa atualização, uma
 * coluna deixada em branco na planilha significa "não mexer", não "apagar".
 */
export function sheetRowToClient(linha: ClientSheetRow): Partial<Client> {
    const payload: Partial<Client> = {};
    const set = <K extends keyof Client>(chave: K, valor: string | undefined) => {
        if (valor) payload[chave] = valor as Client[K];
    };

    set('code', linha['Código']);
    set('name', linha['Nome']);
    set('document', linha['CPF/CNPJ']);
    set('email', linha['E-mail']);
    set('phone', linha['Telefone']);
    set('zip_code', linha['CEP']);
    set('address', linha['Logradouro']);
    set('address_number', linha['Número']);
    set('neighborhood', linha['Bairro']);
    set('city', linha['Cidade']);
    set('state', linha['UF']);
    set('category', linha['Tipo de cliente']);

    const tipo = (linha['Tipo de pessoa'] || '').toUpperCase();
    if (tipo.startsWith('PJ') || tipo.includes('JUR')) payload.type = 'PJ';
    else if (tipo.startsWith('PF') || tipo.includes('FÍS') || tipo.includes('FIS')) payload.type = 'PF';

    const status = (linha['Status'] || '').toLowerCase();
    if (status.startsWith('inativ')) payload.status = 'Inativo';
    else if (status.startsWith('ativ')) payload.status = 'Ativo';

    const portal = (linha['Portal'] || '').toLowerCase();
    if (portal.includes('portal')) payload.portal = 'Portal do Cliente';
    else if (portal.startsWith('nenhum') || portal === 'não' || portal === 'nao') payload.portal = 'Nenhum';

    return payload;
}
