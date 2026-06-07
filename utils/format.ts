export const fmtBRL = (v: number | null | undefined): string => {
    if (v == null) return '—';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v);
};

export const fmtPct = (v: number | null | undefined): string =>
    v == null ? '—' : `${v.toFixed(1)}%`;

export const fmtM2 = (v: number | null | undefined): string =>
    v == null ? '—' : `${new Intl.NumberFormat('pt-BR').format(v)} m²`;
