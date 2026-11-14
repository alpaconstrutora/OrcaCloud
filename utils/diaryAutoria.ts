import type { DiaryAutor, DiaryEntry } from '../types/diary';

/**
 * Textos de autoria de um registro do Diário de Obra — "Registrado por <nome>"
 * e, se editado, "editado por <nome> em DD/MM HH:MM" (hora local).
 *
 * Quem carimba é o banco (`_diary_upsert_core`, aplicar_20271113300000): o app
 * logado e o link do celular passam por ele, então o nome é sempre de quem
 * gravou de fato. Registro antigo, sem carimbo, não mostra nada — não se
 * inventa autor. Uso interno: o Portal do Cliente não exibe (nem recebe) isto.
 */
export interface TextoAutoria {
    registrado?: string;
    editado?: string;
}

function nomeDe(autor: DiaryAutor | null | undefined): string | null {
    if (!autor || typeof autor !== 'object') return null;
    const nome = typeof autor.nome === 'string' ? autor.nome.trim() : '';
    return nome || null;
}

const dois = (n: number) => String(n).padStart(2, '0');

/** DD/MM HH:MM na hora local; '' se a data não for válida. */
export function formatarMomentoAutoria(iso: string | null | undefined): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return `${dois(d.getDate())}/${dois(d.getMonth() + 1)} ${dois(d.getHours())}:${dois(d.getMinutes())}`;
}

export function textoAutoria(entry: Pick<DiaryEntry, 'registradoPor' | 'editadoPor'> | null | undefined): TextoAutoria {
    const out: TextoAutoria = {};
    if (!entry) return out;
    const registrou = nomeDe(entry.registradoPor);
    if (registrou) out.registrado = `Registrado por ${registrou}`;
    const editou = nomeDe(entry.editadoPor);
    if (editou) {
        const quando = formatarMomentoAutoria(entry.editadoPor?.em);
        out.editado = quando ? `editado por ${editou} em ${quando}` : `editado por ${editou}`;
    }
    return out;
}

/**
 * As linhas a exibir, em ordem: ["Registrado por A", "editado por B em …"];
 * registro antigo editado depois do carimbo: ["Editado por B em …"] (sozinha,
 * começa com maiúscula). Sem autoria: [].
 */
export function linhasAutoria(entry: Pick<DiaryEntry, 'registradoPor' | 'editadoPor'> | null | undefined): string[] {
    const { registrado, editado } = textoAutoria(entry);
    if (registrado) return editado ? [registrado, editado] : [registrado];
    return editado ? [editado.charAt(0).toUpperCase() + editado.slice(1)] : [];
}
