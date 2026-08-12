// components/empreendimento/CriarObraDoEmpreendimento.tsx
//
// "Criar obra a partir do empreendimento": abre o ProjectModal padrão do app já
// pré-preenchido com nome, organização e endereço do empreendimento; ao salvar,
// cria a obra e a vincula (obra principal do empreendimento, ou obra da torre).
//
// Por que uma instância LOCAL do ProjectModal e não o modal global do App.tsx:
// aquele é controlado por store (`isProjectModalOpen`/`projectModalMode`), não
// aceita callback de "criado" e só usa `initialData` no modo edit — não haveria
// como pré-preencher nem saber qual obra vincular depois.
//
// A gravação usa `projectService.saveProject` (e NÃO
// `empreendimentoService.createObraForTower`, que insere direto no Supabase e por
// isso não gera código sequencial via `get_next_project_code` nem valida nome
// duplicado).
import React from 'react';
import ProjectModal, { NewProjectData } from '../ProjectModal';
import { useStore } from '../../store/useStore';
import { projectService } from '../../services/projectService';
import { empreendimentoLinksService } from '../../services/empreendimentoLinksService';
import { Empreendimento, ProjectSettings } from '../../types';
import { INITIAL_PROJECT_SETTINGS, BASE_CUB_RATES, CUB_STANDARDS_DATA } from '../../constants';

/** Onde a obra recém-criada vai ser pendurada. */
export type CriarObraTarget =
  | { kind: 'EMPREENDIMENTO' }
  | { kind: 'TORRE'; towerId: string; towerName: string };

interface Props {
  empreendimento: Empreendimento;
  target: CriarObraTarget;
  onClose: () => void;
  /** Chamado depois de criar E vincular. */
  onCreated: (projectId: string, projectName: string) => void;
  onError: (message: string) => void;
}

export const CriarObraDoEmpreendimento: React.FC<Props> = ({
  empreendimento: emp, target, onClose, onCreated, onError,
}) => {
  const { organizations, fetchProjects } = useStore();

  const prefill = React.useMemo<NewProjectData>(() => ({
    ...(INITIAL_PROJECT_SETTINGS as unknown as NewProjectData),
    name: target.kind === 'TORRE' ? `${emp.name} — Torre ${target.towerName}` : emp.name,
    classification: 'OBRA',
    // Organização do empreendimento: tudo abaixo dele nasce na mesma organização.
    organizationId: emp.organization_id,
    // Endereço de divulgação; se estiver vazio, cai no do terreno.
    street: emp.endereco_street || emp.terreno_street || '',
    number: emp.endereco_number || emp.terreno_number || '',
    complement: emp.endereco_complement || emp.terreno_complement || '',
    neighborhood: emp.endereco_neighborhood || emp.terreno_neighborhood || '',
    city: emp.endereco_city || emp.terreno_city || '',
    state: emp.endereco_state || emp.terreno_state || 'SP',
    zipCode: emp.endereco_zip_code || emp.terreno_zip_code || '',
  }), [emp, target]);

  const handleSubmit = async (data: NewProjectData) => {
    try {
      // Mesma derivação de `cubRate` do caminho normal de criação
      // (hooks/useProjectOperations.ts) — o modal coleta localidade e padrão.
      const baseRate = BASE_CUB_RATES[data.location as keyof typeof BASE_CUB_RATES] || 2000.00;
      const multiplier = CUB_STANDARDS_DATA[data.standard as keyof typeof CUB_STANDARDS_DATA]?.multiplier || 1.0;
      const settings = {
        ...INITIAL_PROJECT_SETTINGS,
        ...data,
        classification: 'OBRA',
        cubRate: baseRate * multiplier,
        // Se o usuário trocar a organização no formulário, respeitamos a escolha
        // dele; o default já chega como a do empreendimento.
        organizationId: data.organizationId || emp.organization_id,
      } as ProjectSettings;

      const saved = await projectService.saveProject({
        name: settings.name,
        settings,
        budget: [],
      });
      if (!saved?.id) throw new Error('A obra não retornou um id.');

      if (target.kind === 'TORRE') {
        await empreendimentoLinksService.linkTowerObra(target.towerId, saved.id);
      } else {
        await empreendimentoLinksService.setObraPrincipal(emp.id, saved.id);
      }

      // A obra nova precisa entrar no store para aparecer nos seletores de obra.
      fetchProjects(organizations);
      onCreated(saved.id, settings.name);
    } catch (err: any) {
      onError(`Erro ao criar a obra: ${err.message}`);
    }
  };

  return (
    <ProjectModal
      isOpen
      mode="create"
      initialClassification="OBRA"
      initialData={prefill}
      organizationId={emp.organization_id}
      organizations={organizations.map(o => ({ id: o.id, name: o.name }))}
      onClose={onClose}
      onSubmit={handleSubmit}
    />
  );
};

export default CriarObraDoEmpreendimento;
