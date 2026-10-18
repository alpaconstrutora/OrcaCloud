export const fmtBRL = (v: number | null | undefined): string => {
    if (v == null) return '—';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v);
};

export const fmtPct = (v: number | null | undefined): string =>
    v == null ? '—' : `${v.toFixed(1)}%`;

export const fmtM2 = (v: number | null | undefined): string =>
    v == null ? '—' : `${new Intl.NumberFormat('pt-BR').format(v)} m²`;

/** CNPJ com máscara XX.XXX.XXX/XXXX-XX. Valor que não tem 14 dígitos volta como veio. */
export const fmtCnpj = (v: string | null | undefined): string => {
    if (!v) return '—';
    const d = v.replace(/\D/g, '');
    return d.length === 14
        ? `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
        : v;
};
