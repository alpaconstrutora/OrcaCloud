/**
 * Runs multiple labeled promises in parallel, preserving partial results.
 * Unlike Promise.all, a single rejection does not discard all results.
 *
 * Returns every resolved value at its original index (or the provided fallback
 * for any rejection) along with the labels of all failed operations.
 */
export interface SettledResult<T> {
    values: T[];
    failedLabels: string[];
}

export async function collectSettled<T>(
    tasks: Array<{ label: string; promise: Promise<T>; fallback: T }>,
): Promise<SettledResult<T>> {
    const results = await Promise.allSettled(tasks.map(t => t.promise));

    const values: T[] = [];
    const failedLabels: string[] = [];

    for (let i = 0; i < results.length; i++) {
        const r = results[i];
        if (r.status === 'fulfilled') {
            values.push(r.value);
        } else {
            console.error(`[collectSettled] "${tasks[i].label}" failed:`, r.reason);
            values.push(tasks[i].fallback);
            failedLabels.push(tasks[i].label);
        }
    }

    return { values, failedLabels };
}

/** Builds a user-facing error message from a list of failed operation labels. */
export function buildPartialFailureMessage(failedLabels: string[]): string {
    if (failedLabels.length === 0) return '';
    if (failedLabels.length === 1) {
        return `Não foi possível carregar: ${failedLabels[0]}. Os demais dados foram carregados normalmente.`;
    }
    const listed = failedLabels.join(', ');
    return `Não foi possível carregar alguns dados (${listed}). Verifique sua conexão e tente novamente.`;
}
