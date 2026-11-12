import { supabase } from '../lib/supabase';
import { empreendimentoService } from './empreendimentoService';
import { empreendimentoLinksService } from './empreendimentoLinksService';
import { resolveProjectBudgetById } from './budgetResolver';
import { curvaDoCronograma, CronogramaDaObra, ItemDoOrcamentoDaObra } from '../utils/imovibCurvas';
import { isSystemProject } from '../utils/systemProjects';
import type { Empreendimento } from '../types/empreendimento';

/**
 * Curva de desembolso do planejamento das obras do empreendimento vinculado
 * (item 5.4 do plano docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md).
 * Só leitura: o botão do CAPEX copia o resultado para o estudo (cópia; mudar o
 * planejamento depois não muda o estudo). Arquivo próprio porque
 * empreendimentoService já importa o imovibService.
 *
 * Lê o cronograma (`settings.schedule`) e o orçamento (resolveProjectBudget — num
 * PLANEJAMENTO, o snapshot que o cronograma referencia) dos projetos de
 * PLANEJAMENTO das obras; sem nenhum com previsto, das próprias obras (nunca os
 * dois: contaria em dobro). Projeto de sistema nunca conta (CLAUDE.md, regra #2).
 */
export async function curvaDoPlanejamentoDaObra(
    empreendimentoId: string,
    organizationId?: string | null,
): Promise<{ percentuais: number[]; primeiroMes: string; projetos: number } | { motivo: string }> {
    const emp = await empreendimentoService.getById(empreendimentoId);
    if (!emp) return { motivo: 'Empreendimento não encontrado.' };
    const snap = await empreendimentoLinksService.getSnapshot(emp as Empreendimento, organizationId);
    const ids = (lista: { id: string; missing?: boolean }[]) => lista.filter(l => !l.missing).map(l => l.id);
    const candidatos = [...ids(snap.planejamentos), ...ids(snap.obras)];
    if (!candidatos.length) return { motivo: 'O empreendimento não tem obra vinculada.' };

    const { data, error } = await supabase.from('projects').select('id, name, settings').in('id', candidatos);
    if (error) throw new Error(`Falha ao ler o planejamento das obras: ${error.message}`);
    const linhas = (data ?? []).filter(p => !isSystemProject({ name: p.name, settings: p.settings }));

    const comPrevisto = async (lista: string[]) => {
        const obras: { schedule: CronogramaDaObra; budget: ItemDoOrcamentoDaObra[] }[] = [];
        for (const id of lista) {
            const schedule = linhas.find(p => p.id === id)?.settings?.schedule as CronogramaDaObra | undefined;
            if (!schedule) continue;
            const { budget } = await resolveProjectBudgetById(id);
            const obra = { schedule, budget: (budget ?? []) as unknown as ItemDoOrcamentoDaObra[] };
            if (curvaDoCronograma([obra])) obras.push(obra);
        }
        return obras;
    };

    const dosPlanejamentos = await comPrevisto(ids(snap.planejamentos));
    const usados = dosPlanejamentos.length ? dosPlanejamentos : await comPrevisto(ids(snap.obras));
    const curva = curvaDoCronograma(usados);
    if (!curva) return { motivo: 'As obras do empreendimento não têm cronograma com tarefas datadas e orçamento com valor.' };
    return { ...curva, projetos: usados.length };
}
