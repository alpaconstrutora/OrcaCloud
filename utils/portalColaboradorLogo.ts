/**
 * Logo da empresa no Portal do Colaborador, guardado no aparelho pela versão.
 *
 * `organizations.logo_url` é a imagem embutida (data URI, 80–134 KB medidos em
 * 27/10/2026), e o portal abre pelo celular, muitas vezes em rede de canteiro.
 * O resumo traz só a versão (md5 do logo); o logo em si é baixado uma vez e
 * reaproveitado até a empresa trocá-lo. Uma entrada só: a versão nova
 * sobrescreve a anterior, nada se acumula.
 *
 * Armazenamento pode faltar (aba anônima, bloqueado, cheio): aí busca a cada
 * abertura, como antes, sem quebrar.
 */
const CHAVE_LOGO = 'portal-colaborador:logo';

export async function logoDoPortal(versao: string, buscar: () => Promise<string | null>): Promise<string | null> {
    try {
        const guardado = JSON.parse(window.localStorage.getItem(CHAVE_LOGO) ?? 'null');
        if (guardado?.versao === versao && typeof guardado.dados === 'string') return guardado.dados;
    } catch { /* sem armazenamento ou entrada corrompida: busca */ }

    const dados = await buscar();
    if (dados) {
        try { window.localStorage.setItem(CHAVE_LOGO, JSON.stringify({ versao, dados })); } catch { /* só nesta abertura */ }
    }
    return dados;
}
