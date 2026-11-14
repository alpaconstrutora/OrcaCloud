/**
 * Lê o ditado por voz do orçamento do ÒPURA Pro: valor, cliente e descrição.
 *
 * Desde 14/11/2026 (passo 5 da crítica de design): nomes com acento ("João",
 * "Conceição") — antes o padrão era `[a-zA-Z]` e cortava o nome; e um "para" solto
 * só vira cliente quando casa com um cliente CADASTRADO — antes "pintura de portão
 * para garagem" criava o cliente "garagem". Cliente novo só pelo explícito
 * "para o cliente X" / "para a cliente X".
 *
 * Testes: `__tests__/proDitado.test.ts`.
 */

type ClienteDoDitado = { id: string; nome: string };

export type Ditado = { valor: string; clienteId: string; novoClienteNome: string; descricao: string };

const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

function acharCliente(nome: string, clientes: ClienteDoDitado[]): ClienteDoDitado | undefined {
  const alvo = normalizar(nome);
  if (!alvo) return undefined;
  return clientes.find(c => {
    const n = normalizar(c.nome);
    return n === alvo || n.startsWith(`${alvo} `) || n.includes(` ${alvo}`);
  });
}

export function interpretarDitado(texto: string, clientes: ClienteDoDitado[]): Ditado {
  let resto = texto;
  let valor = '';
  let clienteId = '';
  let novoClienteNome = '';

  // 1. Valor: "350 reais" ou "R$ 120,50"
  const valorMatch = resto.match(/(\d+(?:[.,]\d+)?)\s*(?:reais|real)\b/i) || resto.match(/r\$\s*(\d+(?:[.,]\d+)?)/i);
  if (valorMatch) {
    valor = valorMatch[1].replace(',', '.');
    resto = resto.replace(valorMatch[0], ' ');
  }

  // 2a. Cliente explícito: "para o/a cliente <nome>" — pode ser cliente novo
  const explicito = resto.match(/\bpara\s+(?:o|a)\s+cliente\s+([\p{L}'’]+(?:\s+[\p{L}'’]+){0,3})/iu);
  if (explicito) {
    const nome = explicito[1].trim();
    const achado = acharCliente(nome, clientes);
    if (achado) clienteId = achado.id;
    else novoClienteNome = nome;
    resto = resto.replace(explicito[0], ' ');
  } else {
    // 2b. "para <nome>" só conta se casar com cliente cadastrado (do nome mais longo ao mais curto)
    for (const m of resto.matchAll(/\bpara\s+([\p{L}'’]+(?:\s+[\p{L}'’]+){0,2})/giu)) {
      const palavras = m[1].trim().split(/\s+/);
      for (let n = palavras.length; n >= 1; n--) {
        const candidato = palavras.slice(0, n).join(' ');
        const achado = acharCliente(candidato, clientes);
        if (achado) {
          clienteId = achado.id;
          resto = resto.replace(`${m[0].slice(0, m[0].indexOf(m[1]))}${candidato}`, ' ');
          break;
        }
      }
      if (clienteId) break;
    }
  }

  // 3. Descrição: o que sobrou, sem os comandos de abertura
  let descricao = resto
    .replace(/crie um orçamento de|orçamento de|criar orçamento para/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (descricao) descricao = descricao.charAt(0).toUpperCase() + descricao.slice(1);

  return { valor, clienteId, novoClienteNome, descricao };
}
