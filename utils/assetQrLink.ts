// utils/assetQrLink.ts — o link que o QR Code da etiqueta patrimonial carrega.
//
// Escanear a etiqueta abre a ficha do bem no app (decisão do usuário,
// 13/10/2026): `#/opura-assets?ativo=<id>`, o mesmo padrão de link direto da
// Planta (`#/blueprint?studyId=…`). Vai o ID, não o código: o código pode ser
// renumerado (já foi, em 13/10/2026) e o id nunca muda — a etiqueta continua
// válida. Sem sessão, o app pede login e mantém o endereço.

const PARAMETRO = 'ativo';
const VISTA = 'opura-assets';

/** URL absoluta que abre a ficha do ativo. `base` = origem + caminho do app, sem hash. */
export function linkDoAtivo(base: string, assetId: string): string {
    return `${base.replace(/#.*$/, '').replace(/\/+$/, '')}/#/${VISTA}?${PARAMETRO}=${encodeURIComponent(assetId)}`;
}

/** Id do ativo pedido pelo hash (`#/opura-assets?ativo=…`), ou null. */
export function ativoDoHash(hash: string): string | null {
    if (!hash.startsWith(`#/${VISTA}?`)) return null;
    const id = new URLSearchParams(hash.slice(hash.indexOf('?') + 1)).get(PARAMETRO);
    return id && id.trim() ? id.trim() : null;
}

/** O hash sem o pedido — para o link não reabrir a ficha ao voltar à lista. */
export const HASH_SEM_PEDIDO = `#/${VISTA}`;
