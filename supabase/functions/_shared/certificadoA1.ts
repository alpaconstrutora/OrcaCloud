/**
 * Leitura pura de dados do certificado A1 (ICP-Brasil), sem dependência de
 * runtime, para ser testada pelo Vitest (`__tests__/certificadoA1.test.ts`).
 *
 * Plano: docs/planos/2026-10-18-nfe-captura-automatica-sefaz.md, item 1.3.
 */

/**
 * OID 2.16.76.1.3.3 (CNPJ da pessoa jurídica titular, ICP-Brasil), codificado
 * em DER: 06 05 60 4C 01 03 03. Ele aparece no SubjectAltName como otherName,
 * seguido de uma string com os 14 dígitos.
 */
const OID_CNPJ_DER = '\x06\x05\x60\x4c\x01\x03\x03';

/**
 * CNPJ do titular a partir do certificado.
 *
 * @param derBinario certificado em DER como string binária (1 caractere = 1 byte),
 *                   o formato que o node-forge produz com `asn1.toDer(...).getBytes()`.
 * @param commonName CN do sujeito. Os e-CNPJ trazem "RAZÃO SOCIAL:CNPJ".
 * @returns 14 dígitos, ou null se o certificado não declara CNPJ.
 */
export function cnpjDoCertificado(derBinario: string, commonName?: string | null): string | null {
    const i = derBinario.indexOf(OID_CNPJ_DER);
    if (i >= 0) {
        // Depois do OID vêm as tags do valor ([0] explícito, OCTET/UTF8/PRINTABLE
        // STRING). Os 14 primeiros dígitos seguidos são o CNPJ.
        const depois = derBinario.slice(i + OID_CNPJ_DER.length, i + OID_CNPJ_DER.length + 40);
        const m = depois.match(/\d{14}/);
        if (m) return m[0];
    }
    const cn = (commonName ?? '').match(/:(\d{14})\s*$/);
    return cn ? cn[1] : null;
}

/** Só os dígitos do CNPJ; `null` se não sobrarem 14. */
export function digitosCnpj(v: string | null | undefined): string | null {
    const d = (v ?? '').replace(/\D/g, '');
    return d.length === 14 ? d : null;
}

/** Data `AAAA-MM-DD` no fuso de Brasília, para a coluna `date` da validade. */
export function dataBrasilia(d: Date): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d);
}
