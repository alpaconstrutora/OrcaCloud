/**
 * ARRASTAR AS UNIDADES NA PLANTA BAIXA (28/10/2026): *"Implemente uma terceira forma de posicionar as unidades além
 * das setas e da posição. Essa terceira forma seria clicar, segurar e arrastar para a posição desejada na planta"*.
 * Decisões do usuário: arrasta na planta 2D; quem arrasta escolhe se vale para o PAVIMENTO ou para a COLUNA inteira
 * (107 leva junto 207, 307…); gravado no Empreendimento (`empreendimento_units.vaga_na_planta`, e a torre passa a
 * "Arrastado na planta").
 *
 * Soltar a unidade A sobre a B TROCA as duas de vaga. O arrasto parte do que está na tela: todas as unidades do
 * andar gravam a vaga em que aparecem (o andar nunca arrastado estava pela posição). Na COLUNA, cada andar com as
 * mesmas unidades — o mesmo número delas e os mesmos finais — copia a vaga de cada final.
 *
 * Puro: sem React, sem Supabase.
 */

export type AlcanceDoArrasto = 'PAVIMENTO' | 'COLUNA';

export interface UnidadeNaVaga {
  id: string | null;
  nome: string;
  /** A vaga em que a unidade aparece agora (0..n−1). */
  vaga: number;
  /** A vaga gravada hoje (null = nenhuma) — só o que muda é gravado. */
  vagaGravada?: number | null;
}

export interface UnidadeDoAndar {
  id: string | null;
  nome: string;
  vagaGravada?: number | null;
}

export interface GravacaoDeVaga {
  id: string;
  vaga: number;
}

/** O "final" da unidade, o que a liga às de cima e de baixo: 107 → "07"; "Loja 3" → "3"; sem número, o nome. */
export function finalDaUnidade(nome: string): string {
  const digitos = nome.match(/\d+/g)?.join('') ?? '';
  if (!digitos) return nome.trim().toUpperCase();
  return digitos.length >= 3 ? digitos.slice(-2) : digitos;
}

/** As vagas depois de soltar `de` sobre `para` (as chaves são o id, ou o nome sem id): as duas trocam. */
export function trocarVagas(andar: readonly UnidadeNaVaga[], de: string, para: string): Map<string, number> {
  const chave = (u: UnidadeNaVaga) => u.id ?? u.nome;
  const out = new Map(andar.map((u) => [chave(u), u.vaga]));
  const a = out.get(de);
  const b = out.get(para);
  if (a === undefined || b === undefined || de === para) return out;
  out.set(de, b);
  out.set(para, a);
  return out;
}

/**
 * O que gravar ao soltar `de` sobre `para` no andar mostrado: as vagas do andar (todas as que mudam) e, na COLUNA,
 * as dos outros andares com as mesmas unidades (mesmo número delas, mesmos finais, sem final repetido).
 */
export function gravacoesDoArrasto(
  andar: readonly UnidadeNaVaga[],
  de: string,
  para: string,
  alcance: AlcanceDoArrasto,
  outrosAndares: readonly (readonly UnidadeDoAndar[])[] = [],
): GravacaoDeVaga[] {
  const novas = trocarVagas(andar, de, para);
  const out: GravacaoDeVaga[] = [];
  const porFinal = new Map<string, number>();
  for (const u of andar) {
    const vaga = novas.get(u.id ?? u.nome)!;
    porFinal.set(finalDaUnidade(u.nome), vaga);
    if (u.id && u.vagaGravada !== vaga) out.push({ id: u.id, vaga });
  }
  if (alcance === 'PAVIMENTO' || porFinal.size !== andar.length) return out;

  const jaGravados = new Set(andar.map((u) => u.id));
  for (const outro of outrosAndares) {
    if (outro.length !== andar.length) continue;
    const finais = outro.map((u) => finalDaUnidade(u.nome));
    if (new Set(finais).size !== finais.length || finais.some((f) => !porFinal.has(f))) continue;
    outro.forEach((u, k) => {
      if (!u.id || jaGravados.has(u.id)) return;
      const vaga = porFinal.get(finais[k])!;
      if (u.vagaGravada !== vaga) out.push({ id: u.id, vaga });
    });
  }
  return out;
}
