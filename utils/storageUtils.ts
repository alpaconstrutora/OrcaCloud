/**
 * Sanitizes a filename for use as a storage key in Supabase.
 * Removes accents, replaces spaces and special characters with underscores,
 * and collapses multiple underscores.
 */
export const sanitizeFileName = (fileName: string): string => {
    // 1. Normalize NFD to separate accents from characters
    // 2. Remove characters in the 'Mark' category (accents)
    const normalized = fileName.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    // 3. Replace non-alphanumeric (except dots and dashes) with underscores
    const sanitized = normalized.replace(/[^a-zA-Z0-9.-]/g, '_');

    // 4. Collapse multiple underscores and return
    return sanitized.replace(/_+/g, '_');
};
