/**
 * Fotos do book: a mesma escolha no book e no service que as baixa.
 */
import type { CreditRoomVersion } from '../../types/creditRoom';
import type { SnapshotEmpreendimentoItem } from '../creditRoomSnapshot';
import { MAX_FOTOS } from './base';

/** Capa primeiro, depois as fotos; sem repetir; no máximo 4. */
export function fotosDoEmpreendimento(e: Pick<SnapshotEmpreendimentoItem, 'capa' | 'fotos'>): string[] {
    const urls = [e.capa, ...(e.fotos ?? []).map(f => f.url)].filter((u): u is string => !!u);
    return [...new Set(urls)].slice(0, MAX_FOTOS);
}

/** Todas as URLs de imagem que o book pode usar (a foto da capa é uma delas). */
export function urlsDasFotosDoBook(versao: CreditRoomVersion): string[] {
    const urls = (versao.snapshot.empreendimentos ?? []).flatMap(fotosDoEmpreendimento);
    return [...new Set(urls)];
}

/** Foto da capa: a capa do empreendimento da operação, ou a 1ª capa com imagem. */
export function fotoDaCapa(versao: CreditRoomVersion, imagens: Record<string, string>): string | null {
    const emps = versao.snapshot.empreendimentos ?? [];
    const doRoom = emps.find(e => e.id === versao.snapshot.empreendimento?.id);
    const ordem = [...(doRoom ? [doRoom] : []), ...emps.filter(e => e !== doRoom)];
    for (const e of ordem) if (e.capa && imagens[e.capa]) return imagens[e.capa];
    return null;
}
