import React from 'react';

/** Máximo de dígitos digitáveis (999.999.999.999,99) — evita estourar a precisão do Number. */
const MAX_DIGITOS = 14;

/**
 * Digitação "por centavos": só os dígitos importam e os dois últimos são os centavos.
 * "4210" → "42.10"; "5" → "0.05". Devolve string decimal com ponto (o formato que o
 * estado dos formulários e `Number()` já usam) ou '' se não sobrou dígito.
 *
 * Com `permitirNegativo`, um "-" em qualquer posição deixa o valor negativo ("-4210" →
 * "-42.10"; apagar o "-" volta a positivo) e o "-" sozinho é preservado como '-', para
 * que dê para começar a digitar pelo sinal. Saldo de conta é o caso: pode estar negativo.
 */
export function digitosParaDecimal(texto: string, permitirNegativo = false): string {
    const negativo = permitirNegativo && texto.includes('-');
    const digitos = texto.replace(/\D/g, '').replace(/^0+/, '').slice(0, MAX_DIGITOS);
    if (!digitos) return negativo ? '-' : '';
    const valor = (parseInt(digitos, 10) / 100).toFixed(2);
    return negativo ? `-${valor}` : valor;
}

/**
 * "42.10" → "42,10"; "1234.5" → "1.234,50"; '' / null / undefined / inválido → ''.
 * Aceita número direto (estado numérico). 0 numérico aparece vazio (placeholder
 * "0,00") — o mesmo que os formulários faziam com `value={n || ''}`.
 */
export function decimalParaExibicao(valor: string | number | null | undefined): string {
    if (valor === '' || valor == null) return '';
    if (valor === '-') return '-';
    const n = Number(valor);
    if (typeof valor === 'number' && n === 0) return '';
    if (!Number.isFinite(n)) return '';
    return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface MoneyCentsInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
    /** Decimal com ponto ("42.10"), número, ou vazio — aceita o estado string ou numérico do formulário. */
    value: string | number | null | undefined;
    /** Sempre devolve decimal com ponto ("42.10") ou '' se não há dígito. Estado numérico: `v => setN(v === '' ? 0 : Number(v))`. */
    onChange: (valor: string) => void;
    /** Aceita "-" (ver `digitosParaDecimal`); pode devolver '-' enquanto só o sinal foi digitado. */
    permitirNegativo?: boolean;
}

/** Campo de valor em R$ sem vírgula: o usuário digita 4210 e o campo mostra 42,10. */
const MoneyCentsInput: React.FC<MoneyCentsInputProps> = ({ value, onChange, placeholder = '0,00', permitirNegativo = false, ...props }) => (
    <input
        {...props}
        type="text"
        // O teclado numérico do celular não tem "-".
        inputMode={permitirNegativo ? 'text' : 'numeric'}
        autoComplete="off"
        placeholder={placeholder}
        value={decimalParaExibicao(value)}
        onChange={e => onChange(digitosParaDecimal(e.target.value, permitirNegativo))}
    />
);

export default MoneyCentsInput;
