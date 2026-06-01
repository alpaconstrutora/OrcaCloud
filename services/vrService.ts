import { supabase } from '../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface VrRegra {
    id: string;
    org_id: string;
    project_id: string | null;
    nome: string;
    tipo: 'refeicao' | 'alimentacao' | 'ambos';
    valor_diario: number;
    desconto_folha_pct: number;
    gera_sabado: boolean;
    gera_domingo: boolean;
    gera_feriado: boolean;
    desconta_falta: boolean;
    desconta_ferias: boolean;
    desconta_afastamento: boolean;
    ativo: boolean;
    created_at: string;
    updated_at: string;
}

export interface VrFeriado {
    id: string;
    org_id: string;
    data: string;
    descricao: string;
    escopo: 'nacional' | 'estadual' | 'municipal' | 'obra';
    project_id: string | null;
    created_at: string;
}

export interface VrCalculo {
    id: string;
    org_id: string;
    regra_id: string;
    employee_id: string;
    project_id: string | null;
    mes_referencia: string;
    dias_uteis: number;
    dias_faltas: number;
    dias_ferias: number;
    dias_afastamento: number;
    dias_outros: number;
    dias_elegiveis: number;
    valor_diario: number;
    valor_bruto: number;
    desconto_folha: number;
    valor_liquido: number;
    status: 'rascunho' | 'aprovado' | 'pago' | 'cancelado';
    aprovado_por: string | null;
    aprovado_em: string | null;
    observacao: string | null;
    created_at: string;
    updated_at: string;
    // joins
    employee_name?: string;
    regra_nome?: string;
    project_name?: string;
}

export interface VrAjuste {
    id: string;
    calculo_id: string;
    campo: string;
    valor_antes: number | null;
    valor_depois: number | null;
    motivo: string;
    usuario_id: string | null;
    created_at: string;
}

export interface VrCalculoInput {
    orgId: string;
    regraId: string;
    employeeId: string;
    projectId: string | null;
    mesReferencia: Date;       // any date in the target month
    feriados: string[];        // ISO date strings 'YYYY-MM-DD'
    ausencias: Array<{         // from absences table
        tipo: string;
        data_inicio: string;
        data_fim: string;
        status: string;
    }>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function datesInMonth(year: number, month: number): Date[] {
    const dates: Date[] = [];
    const d = new Date(year, month, 1);
    while (d.getMonth() === month) {
        dates.push(new Date(d));
        d.setDate(d.getDate() + 1);
    }
    return dates;
}

function toIso(d: Date): string {
    return d.toISOString().slice(0, 10);
}

function absenceCoversDate(
    ausencia: { data_inicio: string; data_fim: string; status: string },
    iso: string
): boolean {
    if (!['APROVADO', 'SOLICITADO'].includes(ausencia.status)) return false;
    return iso >= ausencia.data_inicio && iso <= ausencia.data_fim;
}

// ─── Core calculator (pure, testable) ────────────────────────────────────────

export interface VrCalculoResult {
    dias_uteis: number;
    dias_faltas: number;
    dias_ferias: number;
    dias_afastamento: number;
    dias_outros: number;
    dias_elegiveis: number;
    valor_bruto: number;
    desconto_folha: number;
    valor_liquido: number;
}

export function calcularVrMensal(
    regra: Pick<VrRegra, 'valor_diario' | 'desconto_folha_pct' | 'gera_sabado' | 'gera_domingo' | 'gera_feriado' | 'desconta_falta' | 'desconta_ferias' | 'desconta_afastamento'>,
    year: number,
    month: number,           // 0-based
    feriadosSet: Set<string>,
    ausencias: Array<{ tipo: string; data_inicio: string; data_fim: string; status: string }>
): VrCalculoResult {
    const diasDoMes = datesInMonth(year, month);

    let diasUteis = 0;
    let diasFaltas = 0;
    let diasFerias = 0;
    let diasAfastamento = 0;
    let diasOutros = 0;
    let diasElegiveis = 0;

    for (const d of diasDoMes) {
        const dow = d.getDay();      // 0=dom, 6=sab
        const iso = toIso(d);
        const isFeriado = feriadosSet.has(iso);
        const isSabado = dow === 6;
        const isDomingo = dow === 0;

        // 1. Determina se o dia é elegível base (antes de ausências)
        let baseElegivel = true;
        if (isDomingo && !regra.gera_domingo) baseElegivel = false;
        if (isSabado && !regra.gera_sabado) baseElegivel = false;
        if (isFeriado && !regra.gera_feriado) baseElegivel = false;

        if (!baseElegivel) continue;
        diasUteis++;

        // 2. Verifica ausências
        const ausenciasDia = ausencias.filter(a => absenceCoversDate(a, iso));

        if (ausenciasDia.length === 0) {
            diasElegiveis++;
            continue;
        }

        // Classifica a ausência mais grave do dia
        const tipos = ausenciasDia.map(a => a.tipo);
        if (tipos.some(t => t === 'FERIAS')) {
            diasFerias++;
            if (!regra.desconta_ferias) diasElegiveis++;
        } else if (tipos.some(t => t === 'AFASTAMENTO_INSS' || t === 'LICENCA_MEDICA' || t === 'LICENCA_MATERNIDADE' || t === 'LICENCA_PATERNIDADE')) {
            diasAfastamento++;
            if (!regra.desconta_afastamento) diasElegiveis++;
        } else if (tipos.some(t => t === 'FALTA' || t === 'SUSPENSAO')) {
            diasFaltas++;
            if (!regra.desconta_falta) diasElegiveis++;
        } else {
            diasOutros++;
        }
    }

    const valorBruto = +(diasElegiveis * regra.valor_diario).toFixed(2);
    const descontoFolha = +(valorBruto * (regra.desconto_folha_pct / 100)).toFixed(2);
    const valorLiquido = +(valorBruto - descontoFolha).toFixed(2);

    return {
        dias_uteis: diasUteis,
        dias_faltas: diasFaltas,
        dias_ferias: diasFerias,
        dias_afastamento: diasAfastamento,
        dias_outros: diasOutros,
        dias_elegiveis: diasElegiveis,
        valor_bruto: valorBruto,
        desconto_folha: descontoFolha,
        valor_liquido: valorLiquido,
    };
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const vrService = {
    // ── Regras ────────────────────────────────────────────────────────────────

    async listRegras(orgId: string): Promise<VrRegra[]> {
        const { data, error } = await supabase
            .from('vr_regras')
            .select('*')
            .eq('org_id', orgId)
            .order('nome');
        if (error) throw error;
        return data ?? [];
    },

    async upsertRegra(regra: Partial<VrRegra> & { org_id: string }): Promise<VrRegra> {
        const { data, error } = await supabase
            .from('vr_regras')
            .upsert(regra)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    async deleteRegra(id: string): Promise<void> {
        const { error } = await supabase.from('vr_regras').delete().eq('id', id);
        if (error) throw error;
    },

    // ── Feriados ──────────────────────────────────────────────────────────────

    async listFeriados(orgId: string, ano?: number): Promise<VrFeriado[]> {
        let q = supabase.from('vr_feriados').select('*').eq('org_id', orgId).order('data');
        if (ano) {
            q = q.gte('data', `${ano}-01-01`).lte('data', `${ano}-12-31`);
        }
        const { data, error } = await q;
        if (error) throw error;
        return data ?? [];
    },

    async upsertFeriado(feriado: Omit<VrFeriado, 'id' | 'created_at'>): Promise<VrFeriado> {
        const { data, error } = await supabase
            .from('vr_feriados')
            .upsert(feriado, { onConflict: 'org_id,data,project_id' })
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    async deleteFeriado(id: string): Promise<void> {
        const { error } = await supabase.from('vr_feriados').delete().eq('id', id);
        if (error) throw error;
    },

    // ── Cálculos ──────────────────────────────────────────────────────────────

    async listCalculos(orgId: string, mes?: string): Promise<VrCalculo[]> {
        let q = supabase
            .from('vr_calculos')
            .select(`
                *,
                employees!employee_id(name),
                vr_regras!regra_id(nome),
                projects!project_id(name)
            `)
            .eq('org_id', orgId)
            .order('mes_referencia', { ascending: false });
        if (mes) q = q.eq('mes_referencia', mes);
        const { data, error } = await q;
        if (error) throw error;
        return (data ?? []).map((r: any) => ({
            ...r,
            employee_name: r.employees?.name ?? '',
            regra_nome: r.vr_regras?.nome ?? '',
            project_name: r.projects?.name ?? '',
        }));
    },

    async gerarCalculoMensal(input: VrCalculoInput): Promise<VrCalculo> {
        const { orgId, regraId, employeeId, projectId, mesReferencia, feriados, ausencias } = input;

        const { data: regra, error: regraErr } = await supabase
            .from('vr_regras')
            .select('*')
            .eq('id', regraId)
            .single();
        if (regraErr) throw regraErr;

        const year = mesReferencia.getFullYear();
        const month = mesReferencia.getMonth();
        const feriadosSet = new Set(feriados);

        const resultado = calcularVrMensal(regra as VrRegra, year, month, feriadosSet, ausencias);

        const mesIso = `${year}-${String(month + 1).padStart(2, '0')}-01`;

        const payload = {
            org_id: orgId,
            regra_id: regraId,
            employee_id: employeeId,
            project_id: projectId,
            mes_referencia: mesIso,
            valor_diario: regra.valor_diario,
            status: 'rascunho',
            ...resultado,
        };

        const { data, error } = await supabase
            .from('vr_calculos')
            .upsert(payload, { onConflict: 'org_id,employee_id,mes_referencia,regra_id' })
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    async aprovarCalculo(id: string): Promise<void> {
        const { error } = await supabase
            .from('vr_calculos')
            .update({ status: 'aprovado', aprovado_em: new Date().toISOString() })
            .eq('id', id);
        if (error) throw error;
    },

    async aprovarLote(ids: string[]): Promise<void> {
        const { error } = await supabase
            .from('vr_calculos')
            .update({ status: 'aprovado', aprovado_em: new Date().toISOString() })
            .in('id', ids);
        if (error) throw error;
    },

    async ajustarCalculo(
        calculoId: string,
        campo: 'dias_elegiveis' | 'valor_diario' | 'dias_faltas',
        valorDepois: number,
        motivo: string
    ): Promise<void> {
        const { data: atual, error: err1 } = await supabase
            .from('vr_calculos').select('*').eq('id', calculoId).single();
        if (err1) throw err1;

        const valorAntes: number = (atual as any)[campo] ?? 0;

        // Recalcula valor_bruto a partir dos campos atualizados
        const novoCampos: Record<string, number> = { [campo]: valorDepois };
        const diasElegiveis = campo === 'dias_elegiveis' ? valorDepois : atual.dias_elegiveis;
        const valorDiario = campo === 'valor_diario' ? valorDepois : atual.valor_diario;
        const valorBruto = +(diasElegiveis * valorDiario).toFixed(2);
        const descontoFolha = +(valorBruto * ((await supabase.from('vr_regras').select('desconto_folha_pct').eq('id', atual.regra_id).single()).data?.desconto_folha_pct ?? 0) / 100).toFixed(2);
        novoCampos['valor_bruto'] = valorBruto;
        novoCampos['desconto_folha'] = descontoFolha;
        novoCampos['valor_liquido'] = +(valorBruto - descontoFolha).toFixed(2);

        const { error: err2 } = await supabase
            .from('vr_calculos').update(novoCampos).eq('id', calculoId);
        if (err2) throw err2;

        await supabase.from('vr_ajustes').insert({
            calculo_id: calculoId,
            campo,
            valor_antes: valorAntes,
            valor_depois: valorDepois,
            motivo,
        });
    },

    async listAjustes(calculoId: string): Promise<VrAjuste[]> {
        const { data, error } = await supabase
            .from('vr_ajustes')
            .select('*')
            .eq('calculo_id', calculoId)
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data ?? [];
    },
};
