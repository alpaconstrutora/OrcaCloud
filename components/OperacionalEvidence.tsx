import React, { useState, useEffect, useRef } from 'react'
import { Upload, Image, FileText, Trash2, Loader2, AlertCircle, ExternalLink } from 'lucide-react'
import { supabase } from '../lib/supabase'

interface EvidenceFile {
  id: string
  file_type: 'photo' | 'document'
  file_url: string
  thumbnail_url: string | null
  gate: 'pre_start' | 'execution' | 'pre_completion' | 'free'
  description: string | null
  captured_at: string | null
  created_at: string
}

interface Props {
  workOrderId: string
  orgId: string
}

const GATE_LABELS: Record<string, string> = {
  pre_start: 'Pré-início',
  execution: 'Execução',
  pre_completion: 'Pré-conclusão',
  free: 'Livre',
}

const GATE_COLORS: Record<string, string> = {
  pre_start: 'bg-amber-100 text-amber-700',
  execution: 'bg-blue-100 text-blue-700',
  pre_completion: 'bg-purple-100 text-purple-700',
  free: 'bg-slate-100 text-slate-600',
}

const OperacionalEvidence: React.FC<Props> = ({ workOrderId, orgId }) => {
  const [files, setFiles] = useState<EvidenceFile[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [gate, setGate] = useState<'pre_start' | 'execution' | 'pre_completion' | 'free'>('execution')
  const [description, setDescription] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadFiles()
  }, [workOrderId])

  const loadFiles = async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error: fetchErr } = await supabase
        .from('evidence_files')
        .select('*')
        .eq('work_order_id', workOrderId)
        .order('created_at', { ascending: false })
      if (fetchErr) throw fetchErr
      setFiles(data ?? [])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar evidências')
    } finally {
      setLoading(false)
    }
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      const ext = file.name.split('.').pop() ?? 'bin'
      const path = `evidence/${orgId}/${workOrderId}/${Date.now()}.${ext}`
      const bucket = 'operational-evidence'

      const { error: upErr } = await supabase.storage.from(bucket).upload(path, file, { upsert: false })
      if (upErr) throw upErr

      const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(path)

      const isPhoto = file.type.startsWith('image/')
      const { error: insErr } = await supabase.from('evidence_files').insert({
        work_order_id: workOrderId,
        file_type: isPhoto ? 'photo' : 'document',
        file_url: urlData.publicUrl,
        gate,
        description: description || null,
        captured_at: new Date().toISOString(),
      })
      if (insErr) throw insErr

      setDescription('')
      if (fileRef.current) fileRef.current.value = ''
      await loadFiles()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao fazer upload')
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async (file: EvidenceFile) => {
    if (!confirm('Remover esta evidência?')) return
    setError(null)
    try {
      // Try to delete from storage
      const urlParts = file.file_url.split('/operational-evidence/')
      if (urlParts.length > 1) {
        await supabase.storage.from('operational-evidence').remove([urlParts[1]])
      }
      const { error: delErr } = await supabase.from('evidence_files').delete().eq('id', file.id)
      if (delErr) throw delErr
      await loadFiles()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao remover evidência')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
      </div>
    )
  }

  const photos = files.filter(f => f.file_type === 'photo')
  const docs = files.filter(f => f.file_type === 'document')

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-red-700 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Upload form */}
      <div className="bg-slate-50 rounded-2xl p-4 space-y-3 border border-slate-100">
        <p className="text-xs font-black text-slate-500 uppercase tracking-widest">Nova Evidência</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-bold text-slate-500">Etapa</label>
            <select
              value={gate}
              onChange={e => setGate(e.target.value as typeof gate)}
              className="mt-1 w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:outline-none focus:border-blue-400"
            >
              {Object.entries(GATE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500">Descrição</label>
            <input
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Opcional"
              className="mt-1 w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:outline-none focus:border-blue-400"
            />
          </div>
        </div>
        <div>
          <input ref={fileRef} type="file" accept="image/*,.pdf,.doc,.docx" onChange={handleUpload} className="hidden" id="ev-upload" />
          <label
            htmlFor="ev-upload"
            className={`flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed rounded-xl cursor-pointer transition-colors
              ${uploading ? 'border-slate-200 bg-slate-100 cursor-not-allowed' : 'border-blue-300 hover:border-blue-500 hover:bg-blue-50'}`}
          >
            {uploading ? (
              <><Loader2 className="w-4 h-4 animate-spin text-blue-600" /><span className="text-sm font-bold text-blue-600">Enviando...</span></>
            ) : (
              <><Upload className="w-4 h-4 text-blue-600" /><span className="text-sm font-bold text-blue-600">Selecionar arquivo (foto ou documento)</span></>
            )}
          </label>
        </div>
      </div>

      {/* Photos grid */}
      {photos.length > 0 && (
        <div>
          <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3">Fotos ({photos.length})</p>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {photos.map(f => (
              <div key={f.id} className="group relative rounded-2xl overflow-hidden border border-slate-100 aspect-square bg-slate-100">
                <img
                  src={f.thumbnail_url || f.file_url}
                  alt={f.description || 'Evidência'}
                  className="w-full h-full object-cover"
                  onError={e => { (e.target as HTMLImageElement).src = f.file_url }}
                />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2">
                  <a href={f.file_url} target="_blank" rel="noopener noreferrer"
                    className="text-white bg-blue-600/90 rounded-lg p-1.5 hover:bg-blue-700">
                    <ExternalLink className="w-4 h-4" />
                  </a>
                  <button onClick={() => handleDelete(f)}
                    className="text-white bg-red-600/90 rounded-lg p-1.5 hover:bg-red-700">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <div className="absolute bottom-0 left-0 right-0 bg-black/50 px-2 py-1">
                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${GATE_COLORS[f.gate]}`}>
                    {GATE_LABELS[f.gate]}
                  </span>
                  {f.description && <p className="text-xs text-white/80 truncate mt-0.5">{f.description}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Documents */}
      {docs.length > 0 && (
        <div>
          <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3">Documentos ({docs.length})</p>
          <div className="space-y-2">
            {docs.map(f => (
              <div key={f.id} className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-100 hover:border-slate-200 transition-colors">
                <div className="flex items-center gap-3">
                  <FileText className="w-5 h-5 text-slate-400 shrink-0" />
                  <div>
                    <p className="text-sm font-bold text-slate-800">{f.description || 'Documento'}</p>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${GATE_COLORS[f.gate]}`}>
                        {GATE_LABELS[f.gate]}
                      </span>
                      {f.captured_at && (
                        <span className="text-xs text-slate-400">
                          {new Date(f.captured_at).toLocaleDateString('pt-BR')}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <a href={f.file_url} target="_blank" rel="noopener noreferrer"
                    className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                    <ExternalLink className="w-4 h-4" />
                  </a>
                  <button onClick={() => handleDelete(f)}
                    className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {files.length === 0 && (
        <div className="flex flex-col items-center justify-center h-32 text-slate-300">
          <Image className="w-10 h-10 mb-2" />
          <p className="text-sm font-bold">Nenhuma evidência registrada</p>
        </div>
      )}
    </div>
  )
}

export default OperacionalEvidence
