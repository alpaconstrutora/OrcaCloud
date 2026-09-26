// utils/condominioIdentidade.ts
// Como um condomínio se chama na tela: nome + código, sem repetir o código
// quando ele já está no nome.
//
// Morava em `components/condominio/CondominioDetail.tsx`. Saiu de lá em
// 25/09/2026 porque a tela de detalhe do rateio também precisa dela, e
// importá-la do componente que importa a tela fecharia um ciclo de módulos.
// Função pura, com teste próprio — o lugar dela é `utils/`.

/**
 * Nome do condomínio com o código, SEM repetir o que o nome já diz.
 *
 * Na base os condomínios se chamam "010 - Galeria Altavista": concatenar o
 * `code` produzia "010 - Galeria Altavista · 010 · …", e código repetido faz o
 * leitor procurar uma diferença que não existe.
 *
 * ⚠️ A comparação é por BORDA, não `includes`: com `includes`, o código "10"
 * seria dado como presente dentro de "Bloco 100" e sumiria justamente de quem
 * precisa dele. A borda é "não alfanumérico" em vez de uma lista de
 * separadores — a lista deixava passar "Galeria Altavista (010)", e toda lista
 * desse tipo esquece um caractere.
 *
 * O `code` é escapado porque vem digitado: um código "C+1" viraria
 * quantificador e derrubaria o cabeçalho inteiro com SyntaxError.
 */
export const identidadeDoCondominio = (name?: string | null, code?: string | null): string => {
    const nome = (name || '').trim();
    const cod = (code || '').trim();
    if (!cod) return nome;
    const escapado = cod.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const borda = '[^0-9A-Za-zÀ-ÿ]';
    const jaNoNome = new RegExp(`(^|${borda})${escapado}($|${borda})`).test(nome);
    return jaNoNome ? nome : `${nome} · ${cod}`;
};
