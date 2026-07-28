import React, { useState, useEffect } from 'react';
import { Plus, FolderGit2, Calendar, User, ChevronRight, PenTool, Edit2, Trash2 } from 'lucide-react';
import Button from '../ui/Button';
import { OpuraElectricalProject } from '../../types/electrical';
import { electricalProjectService } from '../../services/electricalProjectService';

interface ElectricalProjectsViewProps {
  organizationId?: string;
  projectId?: string;
  obras?: { id: string; name: string }[];
  setProjectId?: (id: string | null) => void;
  onChangeView: (view: string) => void;
  // This helps to pass the selected electrical project ID to the editor
  onSelectProject: (id: string) => void;
}

const ElectricalProjectsView: React.FC<ElectricalProjectsViewProps> = ({ organizationId, projectId, obras, setProjectId, onChangeView, onSelectProject }) => {
  const [projects, setProjects] = useState<OpuraElectricalProject[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProjects();
  }, [organizationId, projectId]);

  const loadProjects = async () => {
    setLoading(true);
    try {
      const data = await electricalProjectService.listProjects(organizationId, projectId);
      setProjects(data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!organizationId) {
      alert('Você precisa selecionar uma organização.');
      return;
    }
    if (!projectId) {
      alert('Você precisa selecionar uma obra/projeto no topo da tela antes de criar um projeto elétrico.');
      return;
    }
    
    const name = prompt('Nome do projeto elétrico (ex: Elétrica Torre A):');
    if (!name) return;

    try {
      const newProj = await electricalProjectService.createProject({
        organizationId: organizationId,
        projectId: projectId,
        name,
        status: 'draft',
      });
      // Cria a versão inicial
      await electricalProjectService.createVersion({
        organizationId: organizationId,
        electricalProjectId: newProj.id,
        versionNumber: 1,
        status: 'draft',
        isLocked: false,
      });
      
      loadProjects();
    } catch (error: any) {
      console.error(error);
      alert('Erro ao criar projeto elétrico: ' + (error.message || 'Desconhecido'));
    }
  };

  const openEditor = (id: string) => {
    onSelectProject(id);
    onChangeView('electrical-editor');
  };

  const handleEdit = async (e: React.MouseEvent, id: string, currentName: string) => {
    e.stopPropagation();
    const newName = prompt('Novo nome do projeto:', currentName);
    if (!newName || newName === currentName) return;
    try {
      await electricalProjectService.updateProject(id, { name: newName });
      loadProjects();
    } catch (error) {
      console.error(error);
      alert('Erro ao atualizar projeto.');
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!window.confirm('Tem certeza que deseja excluir este projeto elétrico? Essa ação não pode ser desfeita.')) return;
    try {
      await electricalProjectService.deleteProject(id);
      loadProjects();
    } catch (error) {
      console.error(error);
      alert('Erro ao excluir projeto.');
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
            <FolderGit2 className="w-8 h-8 text-blue-600" />
            Projetos Elétricos
          </h1>
          <p className="text-slate-500 text-sm mt-1.5 font-medium">
            Gerencie plantas, ambientes e pontos elétricos.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {(obras && obras.length > 0) && (
            <select
              className="h-10 px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={projectId || ''}
              onChange={(e) => setProjectId?.(e.target.value)}
            >
              <option value="">Selecione uma Obra...</option>
              {obras.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          )}
          <Button variant="primary" onClick={handleCreate} className="flex items-center gap-2 rounded-[1rem]">
            <Plus className="w-4 h-4" />
            Novo Projeto Elétrico
          </Button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400">Carregando...</div>
        ) : projects.length === 0 ? (
          <div className="p-12 flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mb-4">
              <PenTool className="w-8 h-8 text-blue-500" />
            </div>
            <h3 className="text-lg font-bold text-slate-800">Nenhum projeto elétrico</h3>
            <p className="text-slate-500 max-w-sm mt-2 mb-6">
              Você ainda não criou nenhum projeto elétrico para esta obra. Clique no botão acima para começar.
            </p>
            <Button variant="secondary" onClick={handleCreate} className="rounded-xl">
              Criar Primeiro Projeto
            </Button>
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500 font-bold">
                <th className="p-4">Nome do Projeto</th>
                <th className="p-4">Status</th>
                <th className="p-4">Líder Técnico</th>
                <th className="p-4">Data de Criação</th>
                <th className="p-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {projects.map((proj) => (
                <tr key={proj.id} className="hover:bg-slate-50/50 transition-colors group cursor-pointer" onClick={() => openEditor(proj.id)}>
                  <td className="p-4">
                    <div className="font-bold text-slate-800">{proj.name}</div>
                    <div className="text-xs text-slate-400">{proj.tensionType || 'Tensão não definida'}</div>
                  </td>
                  <td className="p-4">
                    <span className="px-2 py-1 bg-amber-50 text-amber-700 rounded-md text-xs font-bold border border-amber-100">
                      {proj.status.toUpperCase()}
                    </span>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-2 text-slate-600 text-sm">
                      <User className="w-4 h-4 text-slate-400" />
                      {proj.technicalLead || 'Não atribuído'}
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-2 text-slate-600 text-sm">
                      <Calendar className="w-4 h-4 text-slate-400" />
                      {new Date(proj.createdAt).toLocaleDateString()}
                    </div>
                  </td>
                  <td className="p-4 text-right">
                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={(e) => handleEdit(e, proj.id, proj.name)}
                        className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Editar Nome"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={(e) => handleDelete(e, proj.id)}
                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Excluir Projeto"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); openEditor(proj.id); }}
                        className="p-2 text-blue-600 hover:bg-blue-50 border border-transparent rounded-lg transition-colors ml-2"
                        title="Abrir Editor"
                      >
                        <ChevronRight className="w-5 h-5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default ElectricalProjectsView;
