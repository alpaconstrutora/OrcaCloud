// Chave PIX — validar, normalizar, deduzir o tipo e mascarar.
//
// Plano: docs/planos/2026-10-16-asaas-pendencias-e-pix.md (item 3.2).
// Roda no navegador (cadastros) e na Edge `asaas-payment` (o servidor
// revalida tudo antes de mandar dinheiro). Import com extensão `.ts`: o
// mesmo padrão de utils/boletoTexto.ts → lib/validators.ts (Deno + Vite).
//
// Tipos do cadastro (CHECK em supplier_bank_accounts / employee_bank_accounts):
//   cpf | cnpj | email | telefone | aleatoria
// Tipos da Asaas (POST /v3/transfers, pixAddressKeyType — doc oficial 17/10/2026):
//   CPF | CNPJ | EMAIL | PHONE | EVP

import { validateCPF, validateCNPJ } from '../lib/validators.ts';

export type TipoChavePix = 'cpf' | 'cnpj' | 'email' | 'telefone' | 'aleatoria';
export type TipoChaveAsaas = 'CPF' | 'CNPJ' | 'EMAIL' | 'PHONE' | 'EVP';

export const TIPOS_CHAVE_PIX: { value: TipoChavePix; label: string }[] = [
    { value: 'cpf', label: 'CPF' },
    { value: 'cnpj', label: 'CNPJ' },
    { value: 'email', label: 'E-mail' },
    { value: 'telefone', label: 'Telefone' },
    { value: 'aleatoria', label: 'Chave aleatória' },
];

const PARA_ASAAS: Record<TipoChavePix, TipoChaveAsaas> = {
    cpf: 'CPF', cnpj: 'CNPJ', email: 'EMAIL', telefone: 'PHONE', aleatoria: 'EVP',
};

export function tipoParaAsaas(tipo: TipoChavePix): TipoChaveAsaas {
    return PARA_ASAAS[tipo];
}

export interface ResultadoChave {
    ok: boolean;
    /** Como a Asaas espera: CPF/CNPJ só dígitos, e-mail minúsculo, telefone +55DDNNNNNNNNN, EVP minúsculo. */
    chave: string;
    motivo: string | null;
}

const EVP = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const so = (s: string) => s.replace(/\D/g, '');

/** DDDs em uso no Brasil (Anatel). "52", "20", "36"… não existem. */
const DDDS = new Set([
    11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28,
    31, 32, 33, 34, 35, 37, 38, 41, 42, 43, 44, 45, 46, 47, 48, 49,
    51, 53, 54, 55, 61, 62, 63, 64, 65, 66, 67, 68, 69,
    71, 73, 74, 75, 77, 79, 81, 82, 83, 84, 85, 86, 87, 88, 89,
    91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

/**
 * Valida a chave PARA O TIPO informado. Antes não havia validação nenhuma:
 * o cadastro aceitava "CPF" com 10 dígitos ou e-mail sem domínio, e o erro só
 * apareceria na Asaas — depois de o pagamento ter sido disparado.
 */
export function validarChavePix(tipo: TipoChavePix | string | null | undefined, chaveBruta: string | null | undefined): ResultadoChave {
    const bruta = (chaveBruta ?? '').trim();
    if (!bruta) return { ok: false, chave: '', motivo: 'Informe a chave PIX.' };

    switch (tipo) {
        case 'cpf': {
            const n = so(bruta);
            return validateCPF(n)
                ? { ok: true, chave: n, motivo: null }
                : { ok: false, chave: n, motivo: 'CPF inválido (confira os dígitos).' };
        }
        case 'cnpj': {
            const n = so(bruta);
            return validateCNPJ(n)
                ? { ok: true, chave: n, motivo: null }
                : { ok: false, chave: n, motivo: 'CNPJ inválido (confira os dígitos).' };
        }
        case 'email': {
            const e = bruta.toLowerCase();
            return EMAIL.test(e) && e.length <= 77
                ? { ok: true, chave: e, motivo: null }
                : { ok: false, chave: e, motivo: 'E-mail inválido.' };
        }
        case 'telefone': {
            let n = so(bruta);
            if (n.length === 13 && n.startsWith('55')) n = n.slice(2);
            // DDD (2) + celular com 9 (9 dígitos) ou fixo (8 dígitos).
            if (!/^[1-9][0-9](9\d{8}|[2-5]\d{7})$/.test(n) || !DDDS.has(Number(n.slice(0, 2)))) {
                return { ok: false, chave: bruta, motivo: 'Telefone inválido: use DDD + número (ex.: 11 91234-5678).' };
            }
            return { ok: true, chave: `+55${n}`, motivo: null };
        }
        case 'aleatoria': {
            const e = bruta.toLowerCase();
            return EVP.test(e)
                ? { ok: true, chave: e, motivo: null }
                : { ok: false, chave: e, motivo: 'Chave aleatória inválida (formato 8-4-4-4-12).' };
        }
        default:
            return { ok: false, chave: bruta, motivo: 'Escolha o tipo da chave PIX.' };
    }
}

/**
 * Tipo provável de uma chave guardada SEM tipo (company_partners.pix_chave,
 * employees.banco_pix antigos). Só devolve tipo quando a chave é válida para
 * ele — 11 dígitos é CPF se o DV conferir, senão telefone se tiver formato de
 * telefone; ambíguo ou inválido → null (o usuário escolhe).
 */
export function deduzirTipoChave(chaveBruta: string | null | undefined): TipoChavePix | null {
    const bruta = (chaveBruta ?? '').trim();
    if (!bruta) return null;
    if (bruta.includes('@')) return validarChavePix('email', bruta).ok ? 'email' : null;
    if (EVP.test(bruta.toLowerCase())) return 'aleatoria';
    if (bruta.startsWith('+')) return validarChavePix('telefone', bruta).ok ? 'telefone' : null;
    const n = so(bruta);
    if (n.length === 14) return validateCNPJ(n) ? 'cnpj' : null;
    if (n.length === 11) {
        // A máscara digitada desempata: "###.###.###-##" é CPF.
        if (/^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(bruta)) return validateCPF(n) ? 'cpf' : null;
        const cpf = validateCPF(n);
        const tel = validarChavePix('telefone', n).ok;
        if (cpf && !tel) return 'cpf';
        if (tel && !cpf) return 'telefone';
        return null; // ambíguo (raro) ou inválido
    }
    if (n.length === 10 || n.length === 13) return validarChavePix('telefone', n).ok ? 'telefone' : null;
    return null;
}

/** Para exibir: esconde o miolo, mantém o suficiente para o usuário reconhecer. */
export function mascararChave(tipo: TipoChavePix | string | null | undefined, chave: string | null | undefined): string {
    const c = (chave ?? '').trim();
    if (!c) return '—';
    if (tipo === 'cpf') {
        const n = so(c);
        return n.length === 11 ? `***.${n.slice(3, 6)}.${n.slice(6, 9)}-**` : '***';
    }
    if (tipo === 'cnpj') {
        const n = so(c);
        return n.length === 14 ? `${n.slice(0, 2)}.${n.slice(2, 5)}.***/****-${n.slice(12)}` : '***';
    }
    if (tipo === 'email') {
        const [u, d] = c.split('@');
        return d ? `${u.slice(0, 2)}***@${d}` : '***';
    }
    if (tipo === 'telefone') {
        const n = so(c);
        return n.length >= 4 ? `(**) *****-${n.slice(-4)}` : '***';
    }
    if (tipo === 'aleatoria') return `${c.slice(0, 8)}-****-****-****-${c.slice(-4)}`;
    return c.length > 6 ? `${c.slice(0, 3)}***${c.slice(-3)}` : '***';
}
