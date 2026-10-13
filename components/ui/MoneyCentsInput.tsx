import React from 'react';

/** Máximo de dígitos digitáveis (999.999.999.999,99) — evita estourar a precisão do Number. */
const MAX_DIGITOS = 14;

/**
 * Digitação "por centavos": só os dígitos importam e os dois últimos são os centavos.
 * "4210" → "42.10"; "5" → "0.05". Devolve string decimal com ponto (o formato que o
 * estado dos formulários e `Number()` já usam) ou '' se não sobrou dígito.
 */
export function digitosParaDecimal(texto: string): string {
    const digitos = texto.replace(/\D/g, '').replace(/^0+/, '').slice(0, MAX_DIGITOS);
    if (!digitos) return '';
    return (parseInt(digitos, 10) / 100).toFixed(2);
}

/** "42.10" → "42,10"; "1234.5" → "1.234,50"; '' (ou inválido) → ''. */
export function decimalParaExibicao(valor: string): string {
    if (valor === '') return '';
    const n = Number(valor);
    if (!Number.isFinite(n)) return '';
    return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface MoneyCentsInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
    /** Decimal com ponto ("42.10") ou '' — o mesmo formato de `<input type="number">`. */
    value: string;
    onChange: (valor: string) => void;
}

/** Campo de valor em R$ sem vírgula: o usuário digita 4210 e o campo mostra 42,10. */
const MoneyCentsInput: React.FC<MoneyCentsInputProps> = ({ value, onChange, placeholder = '0,00', ...props }) => (
    <input
        {...props}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder={placeholder}
        value={decimalParaExibicao(value)}
        onChange={e => onChange(digitosParaDecimal(e.target.value))}
    />
);

export default MoneyCentsInput;
