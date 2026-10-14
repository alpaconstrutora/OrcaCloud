// services/blueprintEstudoDoEmpreendimento.ts
//
// "Criar estudo de áreas (sem desenho)" a partir do Empreendimento (Fase 5 do
// plano docs/planos/2026-10-13-areas-nbr12721-na-planta.md). A montagem é pura
// (`utils/blueprintEstudoDoEmpreendimento.ts`); aqui só a ida ao banco:
//
//   1. lê o Empreendimento com torres, unidades e áreas comuns + pavimentos;
//   2. RECUSA se ele já tem estudo vinculado — sobrescrever o vínculo quebraria
//      o envio da massa/loteamento daquele estudo, sem ninguém ver;
//   3. cria o estudo na organização DO EMPREENDIMENTO (REGRA #5: o registro
//      tem dono; o seletor do topo não decide para onde vai);
//   4. grava o rascunho e vincula `empreendimentos.blueprint_study_id`;
//   5. (Fase 9) grava em cada unidade a chave da unidade da Planta que nasceu
//      dela — a devolução da fração já começa ligada.
//
// Se o passo 4 falhar, o estudo recém-criado é arquivado — não fica um estudo
// vazio e solto na lista.

import { supabase } from '../lib/supabase';
import { archiveStudy, createStudy, saveDraft } from './blueprintService';
import { empreendimentoService } from './empreendimentoService';
import { montarEstudoDoEmpreendimento, type EstudoDoEmpreendimento } from '../utils/blueprintEstudoDoEmpreendimento';
import type { EmpreendimentoFloor, EmpreendimentoWithChildren } from '../types/empreendimento';

export interface EstudoCriado {
  studyId: string;
  avisos: string[];
  contagem: EstudoDoEmpreendimento['contagem'];
}

export const blueprintEstudoDoEmpreendimento = {
  async criar(empreendimentoId: string): Promise<EstudoCriado> {
    const emp = (await empreendimentoService.getById(empreendimentoId, { includeChildren: true })) as EmpreendimentoWithChildren | null;
    if (!emp) throw new Error('Empreendimento não encontrado.');
    if (emp.blueprint_study_id) {
      throw new Error('Este empreendimento já tem um estudo da Planta vinculado — abra-o em vez de criar outro.');
    }

    const pavimentos = new Map<string, EmpreendimentoFloor[]>();
    await Promise.all(
      (emp.towers ?? []).map(async (t) => {
        pavimentos.set(t.id, await empreendimentoService.listFloors(t.id));
      }),
    );
    const montado = montarEstudoDoEmpreendimento(emp, pavimentos);

    const { study, branch } = await createStudy({ organizationId: emp.organization_id, name: `Áreas — ${emp.name}` });
    try {
      await saveDraft(branch.id, montado.model);
      await empreendimentoService.update(emp.id, { blueprint_study_id: study.id });
    } catch (e) {
      await archiveStudy(study.id).catch(() => undefined);
      throw e;
    }
    // O estudo já existe e está ligado: falhar aqui não o desfaz — a devolução propõe pelo número e a pessoa confirma.
    const avisos = [...montado.avisos];
    const gravacoes = await Promise.all(
      montado.chaves.map((c) => supabase.from('empreendimento_units').update({ blueprint_unidade_chave: c.chave }).eq('id', c.unitId)),
    ).catch((e: unknown) => [{ error: { message: e instanceof Error ? e.message : String(e) } }]);
    if (gravacoes.some((r) => r.error)) {
      avisos.push('Não foi possível gravar a ligação de todas as unidades com a Planta — ao levar as frações ao Empreendimento, confira os pares propostos.');
    }
    return { studyId: study.id, avisos, contagem: montado.contagem };
  },
};
