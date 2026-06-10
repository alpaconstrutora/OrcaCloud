import React, { useEffect, useState, useRef } from 'react';
import { reformasService } from '../services/reformasService';
import { reformasExportService } from '../services/reformasExportService';
import { ReformaDiario, ReformaProjeto } from '../types';
import { Mic, MicOff, Camera, Calendar, CloudSun, Loader2, Sparkles, BookOpen, Trash2, Plus, FileDown } from 'lucide-react';

interface ReformasDiariosProps {
  userId: string;
}

const ReformasDiarios: React.FC<ReformasDiariosProps> = ({ userId }) => {
  const [loading, setLoading] = useState(true);
  const [reformaId, setReformaId] = useState('');
  const [diarios, setDiarios] = useState<ReformaDiario[]>([]);
  const [projetoAtivo, setProjetoAtivo] = useState<ReformaProjeto | null>(null);
  const [exportingId, setExportingId] = useState<string | null>(null);

  // Estado de criação
  const [isRecording, setIsRecording] = useState(false);
  const [transcription, setTranscription] = useState('');
  const [manualNotes, setManualNotes] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [clima, setClima] = useState('Ensolarado');
  const [temperatura, setTemperatura] = useState('24°C');
  const [generatingReport, setGeneratingReport] = useState(false);
  
  // Web Speech API
  const recognitionRef = useRef<any>(null);

  const loadData = async () => {
    const active = localStorage.getItem('opura_reformas_ativa');
    if (!active) {
      setLoading(false);
      return;
    }
    setReformaId(active);

    try {
      setLoading(true);
      const [diariosData, projetosData] = await Promise.all([
        reformasService.listDiariosByReforma(active),
        reformasService.listProjetos(userId)
      ]);
      setDiarios(diariosData);
      
      const currentProj = projetosData.find(p => p.id === active) || null;
      setProjetoAtivo(currentProj);
    } catch (err) {
      console.error('Erro ao buscar diários:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Inicializar Reconhecimento de Voz
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const rec = new SpeechRecognition();
        rec.continuous = true;
        rec.interimResults = true;
        rec.lang = 'pt-BR';

        rec.onresult = (event: any) => {
          let current = '';
          for (let i = event.resultIndex; i < event.results.length; i++) {
            current += event.results[i][0].transcript;
          }
          setTranscription(current);
        };

        rec.onerror = (e: any) => {
          console.error('Speech recognition error:', e);
          setIsRecording(false);
        };

        recognitionRef.current = rec;
      }
    }
  }, []);

  const toggleRecording = () => {
    if (!recognitionRef.current) {
      alert('Reconhecimento de voz não suportado neste navegador. Digite suas notas manualmente.');
      return;
    }

    if (isRecording) {
      recognitionRef.current.stop();
      setIsRecording(false);
    } else {
      setTranscription('');
      recognitionRef.current.start();
      setIsRecording(true);
    }
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    for (let i = 0; i < files.length; i++) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setPhotos(prev => [...prev, event.target!.result as string]);
        }
      };
      reader.readAsDataURL(files[i]);
    }
  };

  const removePhoto = (index: number) => {
    setPhotos(prev => prev.filter((_, i) => i !== index));
  };

  // Gerar e Salvar o Diário
  const handleGenerateReport = async () => {
    const textInput = (transcription + ' ' + manualNotes).trim();
    if (!textInput && photos.length === 0) {
      alert('Por favor, relate o avanço da obra por voz ou por texto antes de salvar.');
      return;
    }

    try {
      setGeneratingReport(true);

      // Gerador Local Estruturado de Markdown (IA Fallback)
      const dateStr = new Date().toLocaleDateString('pt-BR');
      let markdown = `# Diário de Obra — ${dateStr}\n\n`;
      markdown += `**Clima:** ${clima} | **Temperatura:** ${temperatura}\n\n`;
      markdown += `### 🚧 Avanço e Atividades Realizadas\n`;
      
      if (transcription.trim()) {
        markdown += `- ${transcription.trim()}\n`;
      }
      if (manualNotes.trim()) {
        markdown += `- ${manualNotes.trim()}\n`;
      }
      if (!transcription.trim() && !manualNotes.trim()) {
        markdown += `- Registro diário realizado através de evidências fotográficas.\n`;
      }

      if (photos.length > 0) {
        markdown += `\n### 📸 Evidências Fotográficas\n`;
        markdown += `Anexado(s) ${photos.length} registro(s) de avanço visual da reforma no canteiro de obras.\n`;
      }

      await reformasService.saveDiario({
        user_id: userId,
        reforma_id: reformaId,
        data_registro: new Date().toISOString().split('T')[0],
        resumo_markdown: markdown,
        fotos_urls: photos,
        audio_transcrito: transcription || undefined,
        clima,
        temperatura
      });

      // Limpar campos
      setTranscription('');
      setManualNotes('');
      setPhotos([]);
      
      // Recarregar histórico
      const updated = await reformasService.listDiariosByReforma(reformaId);
      setDiarios(updated);
    } catch (err: any) {
      alert('Erro ao salvar diário: ' + err.message);
    } finally {
      setGeneratingReport(false);
    }
  };

  const handleExportDiario = async (diario: ReformaDiario, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!projetoAtivo) {
      alert('Não foi possível carregar os dados da reforma ativa para exportar.');
      return;
    }

    try {
      setExportingId(diario.id);
      await reformasExportService.exportDiarioPdf(diario, projetoAtivo);
    } catch (err: any) {
      alert('Erro ao exportar relatório em PDF: ' + err.message);
    } finally {
      setExportingId(null);
    }
  };

  const handleDeleteDiario = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Deseja realmente excluir este diário de obra?')) return;

    try {
      setLoading(true);
      await reformasService.deleteDiario(id);
      const updated = await reformasService.listDiariosByReforma(reformaId);
      setDiarios(updated);
    } catch (err: any) {
      alert('Erro ao excluir: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!reformaId) {
    return (
      <div className="text-center py-20 px-6">
        <BookOpen className="w-12 h-12 text-slate-650 mx-auto mb-4" />
        <h3 className="text-sm font-bold text-slate-300">Selecione uma Reforma</h3>
        <p className="text-xs text-slate-500 mt-1 max-w-[200px] mx-auto">Vá para o Painel e selecione ou cadastre uma reforma para registrar o diário.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-8 min-h-[400px]">
        <Loader2 className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mb-3 text-orange-500" />
        <span className="text-xs font-black uppercase tracking-widest text-slate-400">Carregando Diários...</span>
      </div>
    );
  }

  return (
    <div className="p-5 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-black text-white tracking-tight">Diário de Obra</h1>
        <p className="text-xs font-semibold text-slate-400">Relatórios de avanço multimodal</p>
      </div>

      {/* Relator de Diário */}
      <div className="bg-[#0D1224] p-5 border border-white/5 rounded-3xl space-y-4 shadow-xl">
        <span className="text-[10px] font-black uppercase tracking-widest text-orange-500 flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 animate-pulse" />
          Registrar Progresso de Hoje
        </span>

        {/* Gravador de Voz */}
        <div className="flex flex-col items-center justify-center py-6 bg-[#070913] border border-white/5 rounded-2xl relative overflow-hidden">
          <button
            type="button"
            onClick={toggleRecording}
            className={`w-16 h-16 rounded-full flex items-center justify-center transition-all ${
              isRecording 
                ? 'bg-rose-600 text-white animate-pulse shadow-lg shadow-rose-600/30' 
                : 'bg-orange-500/10 text-orange-400 border border-orange-500/20 hover:bg-orange-500/20 active:scale-95'
            }`}
          >
            {isRecording ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
          </button>
          <span className="text-[10px] font-bold text-slate-400 mt-3 uppercase tracking-wider">
            {isRecording ? 'Gravando e Transcrevendo...' : 'Clique para Falar'}
          </span>

          {transcription && (
            <p className="mt-4 px-4 text-xs text-slate-300 text-center italic max-h-24 overflow-y-auto font-medium leading-relaxed">
              "{transcription}"
            </p>
          )}
        </div>

        {/* Notas Manuais adicionais */}
        <div className="space-y-1.5">
          <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400">Notas Manuais ou Observações</label>
          <textarea
            value={manualNotes}
            onChange={(e) => setManualNotes(e.target.value)}
            className="w-full h-20 bg-[#070913] border border-white/5 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-orange-500 resize-none font-medium"
            placeholder="Digite detalhes extras da obra ou impedimentos..."
          />
        </div>

        {/* Fotos upload */}
        <div className="space-y-2">
          <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400">Evidências Visuais (Fotos)</label>
          <div className="flex flex-wrap gap-2.5">
            {/* Botão Câmera */}
            <label className="w-14 h-14 bg-[#070913] border border-white/5 hover:border-orange-500/30 rounded-xl flex items-center justify-center cursor-pointer transition-all active:scale-95 shrink-0">
              <Camera className="w-5 h-5 text-slate-400" />
              <input type="file" accept="image/*" multiple onChange={handlePhotoUpload} className="hidden" />
            </label>

            {photos.map((url, idx) => (
              <div key={idx} className="w-14 h-14 rounded-xl border border-white/5 overflow-hidden relative group shrink-0">
                <img src={url} alt="Evidência" className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => removePhoto(idx)}
                  className="absolute inset-0 bg-black/60 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Trash2 className="w-4 h-4 text-rose-500" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Clima e Temperatura inputs rápidos */}
        <div className="grid grid-cols-2 gap-3 bg-[#070913] p-3 border border-white/5 rounded-xl">
          <div className="flex items-center gap-2">
            <CloudSun className="w-4 h-4 text-slate-400 shrink-0" />
            <input
              type="text"
              value={clima}
              onChange={(e) => setClima(e.target.value)}
              className="bg-transparent text-xs text-white outline-none font-medium w-full"
              placeholder="Clima"
            />
          </div>
          <div className="flex items-center gap-2 border-l border-white/5 pl-3">
            <span className="text-slate-400 text-xs font-bold shrink-0">🌡️</span>
            <input
              type="text"
              value={temperatura}
              onChange={(e) => setTemperatura(e.target.value)}
              className="bg-transparent text-xs text-white outline-none font-medium w-full"
              placeholder="Temp"
            />
          </div>
        </div>

        {/* Botão Gerar */}
        <button
          onClick={handleGenerateReport}
          disabled={generatingReport}
          className="w-full py-3 bg-gradient-to-tr from-orange-600 to-amber-500 text-white text-xs font-black uppercase tracking-widest rounded-xl transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {generatingReport ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Sincronizando...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              Salvar Diário de Obra
            </>
          )}
        </button>
      </div>

      {/* Histórico Cronológico de Diários */}
      <div className="space-y-3.5">
        <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">Histórico de Relatórios</h2>
        {diarios.length === 0 ? (
          <div className="text-center py-8 border border-dashed border-white/5 rounded-3xl bg-white/5 px-4 text-xs text-slate-500">
            Nenhum diário registrado para esta reforma ainda.
          </div>
        ) : (
          <div className="space-y-4">
            {diarios.map(d => (
              <div key={d.id} className="bg-[#0D1224] p-4 border border-white/5 rounded-2xl space-y-3">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-2 text-xs font-bold text-white">
                    <Calendar className="w-4 h-4 text-orange-500 shrink-0" />
                    <span>{new Date(d.data_registro).toLocaleDateString('pt-BR')}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={(e) => handleExportDiario(d, e)}
                      disabled={exportingId === d.id}
                      className="p-1.5 bg-white/5 hover:bg-orange-950/20 text-slate-400 hover:text-orange-500 rounded-lg transition-colors border border-white/5 disabled:opacity-50"
                      title="Exportar Diário em PDF"
                    >
                      {exportingId === d.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-orange-500" />
                      ) : (
                        <FileDown className="w-3.5 h-3.5" />
                      )}
                    </button>
                    <button
                      onClick={(e) => handleDeleteDiario(d.id, e)}
                      className="p-1.5 bg-white/5 hover:bg-rose-950/20 text-slate-400 hover:text-rose-500 rounded-lg transition-colors border border-white/5"
                      title="Excluir Diário"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="text-xs text-slate-300 leading-relaxed font-medium bg-[#070913] p-3 border border-white/5 rounded-xl whitespace-pre-wrap">
                  {d.resumo_markdown}
                </div>

                {d.fotos_urls && d.fotos_urls.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {d.fotos_urls.map((photo, idx) => (
                      <div key={idx} className="w-12 h-12 rounded-lg border border-white/5 overflow-hidden shrink-0">
                        <img src={photo} alt="Evidência registrada" className="w-full h-full object-cover" />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ReformasDiarios;
