export interface CodeLevelStyle {
    indent: number;
    nameCls: string;
    codeCls: string;
}

export type CodeHierarchyTheme = 'slate' | 'gray';

export function getCodeLevel(code?: string | null): number {
    if (!code) return 0;
    const trimmed = code.trim();
    if (!trimmed) return 0;
    return trimmed.split('.').length;
}

const SLATE_STYLES: CodeLevelStyle[] = [
    // level 0 (sem código)
    { indent: 0,  codeCls: 'bg-slate-100 text-slate-400',                              nameCls: 'text-xs font-medium text-slate-600' },
    // level 1 (ex: 1)
    { indent: 0,  codeCls: 'bg-slate-800 text-white',                                  nameCls: 'text-xs font-black text-slate-900' },
    // level 2 (ex: 1.1)
    { indent: 12, codeCls: 'bg-emerald-100 text-emerald-700',                          nameCls: 'text-xs font-bold text-slate-800' },
    // level 3 (ex: 1.1.1)
    { indent: 24, codeCls: 'bg-slate-100 text-slate-500',                              nameCls: 'text-xs font-semibold text-slate-600' },
    // level 4 (ex: 1.1.1.1)
    { indent: 36, codeCls: 'bg-slate-50 text-slate-400 border border-slate-200',       nameCls: 'text-[11px] font-medium text-slate-400' },
];

const GRAY_STYLES: CodeLevelStyle[] = [
    { indent: 0,  codeCls: 'bg-gray-100 text-gray-500',                                nameCls: 'text-sm font-bold text-gray-900' },
    { indent: 0,  codeCls: 'bg-gray-800 text-white',                                   nameCls: 'text-sm font-black text-gray-900' },
    { indent: 16, codeCls: 'bg-blue-100 text-blue-700',                                nameCls: 'text-sm font-bold text-gray-800' },
    { indent: 32, codeCls: 'bg-gray-100 text-gray-400',                                nameCls: 'text-xs font-semibold text-gray-500' },
    { indent: 48, codeCls: 'bg-gray-50 text-gray-300 border border-gray-200',          nameCls: 'text-xs font-medium text-gray-400' },
];

export function getCodeLevelStyle(code?: string | null, theme: CodeHierarchyTheme = 'slate'): CodeLevelStyle {
    const styles = theme === 'gray' ? GRAY_STYLES : SLATE_STYLES;
    const level = getCodeLevel(code);
    return styles[Math.min(level, styles.length - 1)];
}

export function sortByCode<T extends { code?: string | null; name: string }>(items: T[]): T[] {
    return [...items].sort((a, b) => {
        const aCode = a.code?.trim();
        const bCode = b.code?.trim();
        if (!aCode && !bCode) return a.name.localeCompare(b.name, 'pt-BR');
        if (!aCode) return 1;
        if (!bCode) return -1;
        return aCode.localeCompare(bCode, 'pt-BR', { numeric: true });
    });
}
