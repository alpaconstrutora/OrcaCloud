import { supabase } from '../lib/supabase';
import { empreendimentoService } from './empreendimentoService';
import { empreendimentoLinksService } from './empreendimentoLinksService';
import { curvaDoCronograma, CronogramaDaObra } from '../utils/imovibCurvas';
import type { Empreendimento } from '../types/empreendimento';

/**
 * Curva de desembolso do planejamento das obras do empreendimento vinculado
 * (item 5.4 do plano docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md).
 * Só leitura: o botão do CAPEX copia o resultado para o estudo (cópia; mudar o
 * planejamento depois não muda o estudo). Arquivo próprio porque
 * empreendimentoService já importa o imovibService.
 *
 * Lê `settings.schedule` dos projetos de PLANEJAMENTO das obras; sem nenhum com
 * desembolso, das próprias obras (nunca os dois: contaria em dobro).
 */
export async function curvaDoPlanejamentoDaObra(
    empreendimentoId: string,
    organizationId?: string | null,
): Promise<{ percentuais: number[]; primeiroMes: string; projetos: number } | { motivo: string }> {
    const emp = await empreendimentoService.getById(empreendimentoId);
    if (!emp) return { motivo: 'Empreendimento não encontrado.' };
    const snap = await empreendimentoLinksService.getSnapshot(emp as Empreendimento, organizationId);
    const ids = (lista: { id: string; missing?: boolean }[]) => lista.filter(l => !l.missing).map(l => l.id);
    const planejamentos = ids(snap.planejamentos);
    const obras = ids(snap.obras);
    if (!planejamentos.length && !obras.length) return { motivo: 'O empreendimento não tem obra vinculada.' };

    const { data, error } = await supabase.from('projects').select('id, settings').in('id', [...planejamentos, ...obras]);
    if (error) throw new Error(`Falha ao ler o planejamento das obras: ${error.message}`);
    const cronogramaDe = (id: string) => (data ?? []).find(p => p.id === id)?.settings?.schedule as CronogramaDaObra | undefined;
    const comDesembolso = (lista: string[]) => lista.map(cronogramaDe).filter((s): s is CronogramaDaObra => !!s?.distributions?.some(d => Number(d.value) > 0));

    const dosPlanejamentos = comDesembolso(planejamentos);
    const usados = dosPlanejamentos.length ? dosPlanejamentos : comDesembolso(obras);
    const curva = curvaDoCronograma(usados);
    if (!curva) return { motivo: 'As obras do empreendimento não têm cronograma físico-financeiro com valores.' };
    return { ...curva, projetos: usados.length };
}
