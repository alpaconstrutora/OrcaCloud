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
//   4. grava o rascunho e vincula `empreendimentos.blueprint_study_id`.
//
// Se o passo 4 falhar, o estudo recém-criado é arquivado — não fica um estudo
// vazio e solto na lista.

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
    return { studyId: study.id, avisos: montado.avisos, contagem: montado.contagem };
  },
};
