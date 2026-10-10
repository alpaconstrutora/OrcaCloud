import type { DiaryActivity } from '../types/diary';

/**
 * Atividade do diário "não prevista no cronograma" (2026-10-10).
 *
 * A marcação é explícita (`unplanned: true`), não derivada da falta de vínculo:
 * o app mobile não tem como vincular item, então toda atividade lançada nele
 * nasce sem `itemId` sem ser, por isso, não prevista.
 */
export const isUnplannedActivity = (a: Pick<DiaryActivity, 'unplanned'>): boolean => a.unplanned === true;

/**
 * Marca/desmarca. Marcar solta o vínculo: não prevista nunca tem `itemId`, senão
 * o salvar do diário ainda empurraria a evolução dela para o cronograma.
 * Desmarcar não inventa vínculo — quem escolhe o item é o usuário.
 */
export const setUnplanned = (a: DiaryActivity, unplanned: boolean): DiaryActivity =>
    unplanned ? { ...a, unplanned: true, itemId: '' } : { ...a, unplanned: false };

/**
 * A atividade corresponde a este item do orçamento? Por id, ou (legado) pela
 * descrição idêntica à do item. A não prevista nunca casa — nem por descrição:
 * uma avulsa com o mesmo nome de um item não pode contar como avanço dele.
 */
export const activityMatchesBudgetItem = (
    a: Pick<DiaryActivity, 'itemId' | 'description' | 'unplanned'>,
    item: { id: string; sinapiItem?: { description?: string } },
): boolean => {
    if (isUnplannedActivity(a)) return false;
    if (a.itemId && a.itemId === item.id) return true;
    const desc = a.description?.trim();
    const itemDesc = item.sinapiItem?.description?.trim();
    return !!desc && !!itemDesc && desc === itemDesc;
};

/** Quantas atividades da entrada são não previstas. */
export const countUnplanned = (activities: DiaryActivity[] | undefined): number =>
    (activities || []).filter(isUnplannedActivity).length;
