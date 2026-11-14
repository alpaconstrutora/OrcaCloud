/**
 * PIX Copia e Cola (BR Code estático, padrão EMV do Banco Central) do ÒPURA Pro.
 *
 * Até 14/11/2026 a chave era montada por PALPITE em `ProServicoView.tsx`: qualquer
 * valor com 11 dígitos e um "-" ou "(" virava telefone `+55…`. Todo CPF digitado com
 * máscara gerava um QR que o banco do cliente recusava — ou que apontava para o
 * celular de outra pessoa. Agora o TIPO cadastrado em Ajustes decide, e a chave é
 * validada antes de virar código: chave inválida não gera QR, gera o motivo.
 *
 * Testes: `__tests__/pixCopiaECola.test.ts`.
 */
import type { ProPixKeyType } from '../types';

export type ResultadoChavePix = { ok: true; chave: string } | { ok: false; motivo: string };
export type ResultadoPayloadPix = { ok: true; payload: string; chave: string } | { ok: false; motivo: string };

export const ROTULO_TIPO_CHAVE_PIX: Record<ProPixKeyType, string> = {
  CPF: 'CPF',
  CNPJ: 'CNPJ',
  EMAIL: 'E-mail',
  CELULAR: 'Celular',
  ALEATORIA: 'Chave aleatória',
};

export const EXEMPLO_CHAVE_PIX: Record<ProPixKeyType, string> = {
  CPF: '000.000.000-00',
  CNPJ: '00.000.000/0000-00',
  EMAIL: 'voce@email.com',
  CELULAR: '(65) 99999-9999',
  ALEATORIA: '123e4567-e89b-12d3-a456-426614174000',
};

/** CRC-16/CCITT-FALSE (polinômio 0x1021, início 0xFFFF), exigido no campo 63 do BR Code. */
export function crc16Pix(texto: string): string {
  let crc = 0xffff;
  for (let i = 0; i < texto.length; i++) {
    crc ^= texto.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

const soDigitos = (s: string) => s.replace(/\D/g, '');

function cpfValido(cpf: string): boolean {
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  const dv = (base: string, pesoInicial: number) => {
    let soma = 0;
    for (let i = 0; i < base.length; i++) soma += Number(base[i]) * (pesoInicial - i);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  const d1 = dv(cpf.slice(0, 9), 10);
  const d2 = dv(cpf.slice(0, 10), 11);
  return d1 === Number(cpf[9]) && d2 === Number(cpf[10]);
}

/** Aceita o CNPJ numérico e o alfanumérico (Receita, a partir de 2026): valor do caractere = código − 48. */
function cnpjValido(cnpj: string): boolean {
  if (!/^[0-9A-Z]{12}\d{2}$/.test(cnpj) || /^(\d)\1{13}$/.test(cnpj)) return false;
  const dv = (base: string) => {
    const pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let soma = 0;
    for (let i = 0; i < base.length; i++) soma += (base.charCodeAt(i) - 48) * pesos[i];
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  const d1 = dv(cnpj.slice(0, 12));
  const d2 = dv(cnpj.slice(0, 13));
  return d1 === Number(cnpj[12]) && d2 === Number(cnpj[13]);
}

/** Converte a chave digitada no formato que o DICT espera, conforme o tipo. Nunca adivinha o tipo. */
export function normalizarChavePix(tipo: ProPixKeyType | null | undefined, chaveDigitada: string | null | undefined): ResultadoChavePix {
  const bruta = (chaveDigitada || '').trim();
  if (!bruta) return { ok: false, motivo: 'Chave Pix não cadastrada.' };
  if (!tipo) return { ok: false, motivo: 'Escolha o tipo da chave Pix em Ajustes.' };

  switch (tipo) {
    case 'CPF': {
      const cpf = soDigitos(bruta);
      if (cpf.length !== 11) return { ok: false, motivo: 'O CPF precisa ter 11 dígitos.' };
      if (!cpfValido(cpf)) return { ok: false, motivo: 'Esse CPF não confere: revise os números.' };
      return { ok: true, chave: cpf };
    }
    case 'CNPJ': {
      const cnpj = bruta.toUpperCase().replace(/[./\-\s]/g, '');
      if (cnpj.length !== 14) return { ok: false, motivo: 'O CNPJ precisa ter 14 caracteres.' };
      if (!cnpjValido(cnpj)) return { ok: false, motivo: 'Esse CNPJ não confere: revise os números.' };
      return { ok: true, chave: cnpj };
    }
    case 'CELULAR': {
      let num = soDigitos(bruta);
      if ((num.length === 12 || num.length === 13) && num.startsWith('55')) num = num.slice(2);
      if (num.length !== 11) return { ok: false, motivo: 'Informe o celular com DDD: (65) 99999-9999.' };
      if (num[2] !== '9') return { ok: false, motivo: 'Chave de celular começa com 9 depois do DDD.' };
      return { ok: true, chave: `+55${num}` };
    }
    case 'EMAIL': {
      const email = bruta.toLowerCase();
      if (email.length > 77 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return { ok: false, motivo: 'Esse e-mail não parece válido.' };
      }
      return { ok: true, chave: email };
    }
    case 'ALEATORIA': {
      const evp = bruta.toLowerCase();
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(evp)) {
        return { ok: false, motivo: 'A chave aleatória tem 36 caracteres, com hífens (copie do app do banco).' };
      }
      return { ok: true, chave: evp };
    }
    default:
      return { ok: false, motivo: 'Tipo de chave Pix desconhecido.' };
  }
}

/** Mostra a chave como a pessoa a reconhece (com máscara). Não valida. */
export function formatarChavePixParaExibir(tipo: ProPixKeyType | null | undefined, chave: string): string {
  const d = soDigitos(chave);
  if (tipo === 'CPF' && d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  if (tipo === 'CNPJ' && chave.length === 14) {
    const c = chave.toUpperCase();
    return `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}`;
  }
  if (tipo === 'CELULAR') {
    const n = d.startsWith('55') && d.length === 13 ? d.slice(2) : d;
    if (n.length === 11) return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`;
  }
  return chave;
}

/** Campos 59/60 do BR Code: maiúsculas, sem acento, só letras/números/espaço. */
function textoEmv(s: string, max: number): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
    .slice(0, max)
    .trim();
}

const campo = (id: string, valor: string) => `${id}${valor.length.toString().padStart(2, '0')}${valor}`;

export function montarPixCopiaECola(args: {
  tipo: ProPixKeyType | null | undefined;
  chave: string | null | undefined;
  valor: number;
  nome: string;
  cidade: string;
}): ResultadoPayloadPix {
  const r = normalizarChavePix(args.tipo, args.chave);
  if (!r.ok) return r;

  const nome = textoEmv(args.nome, 25) || 'RECEBEDOR';
  const cidade = textoEmv(args.cidade, 15) || 'BRASIL';
  const valor = Number.isFinite(args.valor) && args.valor > 0 ? args.valor.toFixed(2) : '';

  const semCrc =
    campo('00', '01') +
    campo('26', campo('00', 'br.gov.bcb.pix') + campo('01', r.chave)) +
    campo('52', '0000') +
    campo('53', '986') +
    (valor ? campo('54', valor) : '') +
    campo('58', 'BR') +
    campo('59', nome) +
    campo('60', cidade) +
    campo('62', campo('05', '***')) +
    '6304';

  return { ok: true, payload: semCrc + crc16Pix(semCrc), chave: r.chave };
}
