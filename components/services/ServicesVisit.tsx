import React, { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { ArrowLeft, Camera, MapPin, Plus, Check, X, Trash2 } from 'lucide-react';
import { servicesCommercialService, ServiceVisit } from '../../services/servicesCommercialService';

interface ChecklistItem { item: string; ok: boolean; note: string }

const DEFAULT_CHECKLIST: ChecklistItem[] = [
  { item: 'Acesso ao local', ok: false, note: '' },
  { item: 'Condições estruturais', ok: false, note: '' },
  { item: 'Instalações elétricas', ok: false, note: '' },
  { item: 'Instalações hidráulicas', ok: false, note: '' },
  { item: 'Medições realizadas', ok: false, note: '' },
];

interface Props {
  opportunityId: string;
  organizationId: string;
  onBack: () => void;
}

const INPUT = 'w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500';

const ServicesVisit: React.FC<Props> = ({ opportunityId, organizationId, onBack }) => {
  const [visit, setVisit] = useState<ServiceVisit | null>(null);
  const [checklist, setChecklist] = useState<ChecklistItem[]>(DEFAULT_CHECKLIST);
  const [observations, setObservations] = useState('');
  const [newItem, setNewItem] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [photos, setPhotos] = useState<Array<{ path: string; url: string; caption: string }>>([]);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    servicesCommercialService.getVisit(opportunityId).then(v => {
      if (v) {
        setVisit(v);
        setChecklist(v.checklist.length > 0 ? v.checklist : DEFAULT_CHECKLIST);
        setObservations(v.observations ?? '');
        if (v.latitude && v.longitude) setLocation({ lat: v.latitude, lng: v.longitude });
      }
    });
  }, [opportunityId]);

  const loadPhotoUrls = useCallback(async (visitPhotos: NonNullable<typeof visit>['photos']) => {
    if (!visitPhotos?.length) return;
    const resolved = await Promise.all(
      visitPhotos.map(async p => {
        const { data } = await supabase.storage
          .from('services-visits')
          .createSignedUrl(p.storage_path, 3600);
        return { path: p.storage_path, url: data?.signedUrl ?? '', caption: p.caption ?? '' };
      })
    );
    setPhotos(resolved);
  }, []);

  useEffect(() => {
    if (visit?.photos?.length) loadPhotoUrls(visit.photos);
  }, [visit, loadPhotoUrls]);

  const getLocation = () => {
    navigator.geolocation.getCurrentPosition(pos =>
      setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude })
    );
  };

  const toggleCheck = (i: number) =>
    setChecklist(prev => prev.map((c, idx) => idx === i ? { ...c, ok: !c.ok } : c));

  const updateNote = (i: number, note: string) =>
    setChecklist(prev => prev.map((c, idx) => idx === i ? { ...c, note } : c));

  const addItem = () => {
    if (!newItem.trim()) return;
    setChecklist(prev => [...prev, { item: newItem.trim(), ok: false, note: '' }]);
    setNewItem('');
  };

  const removeItem = (i: number) =>
    setChecklist(prev => prev.filter((_, idx) => idx !== i));

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const visitId = visit?.id ?? 'pending';
      const path = await servicesCommercialService.uploadVisitPhoto(organizationId, visitId, file);
      const { data } = await supabase.storage
        .from('services-visits')
        .createSignedUrl(path, 3600);
      setPhotos(prev => [...prev, { path, url: data?.signedUrl ?? '', caption: '' }]);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const saved = await servicesCommercialService.upsertVisit({
        id: visit?.id,
        opportunity_id: opportunityId,
        organization_id: organizationId,
        checklist,
        observations: observations || null,
        status: 'completed',
        performed_at: new Date().toISOString(),
        latitude: location?.lat ?? null,
        longitude: location?.lng ?? null,
      } as Parameters<typeof servicesCommercialService.upsertVisit>[0]);
      setVisit(saved);

      for (const photo of photos.filter(p => !visit?.photos?.some(vp => vp.storage_path === p.path))) {
        await servicesCommercialService.addVisitPhoto({
          visit_id: saved.id,
          organization_id: organizationId,
          storage_path: photo.path,
          caption: photo.caption || null,
          taken_at: new Date().toISOString(),
        });
      }
      onBack();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
          <ArrowLeft size={20} />
        </button>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Visita Técnica</h2>
      </div>

      {/* Geolocalização */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Localização</span>
          <button onClick={getLocation} className="flex items-center gap-1.5 text-xs text-blue-600 hover:underline">
            <MapPin size={13} /> Capturar GPS
          </button>
        </div>
        {location && (
          <p className="text-xs text-gray-500 mt-1">
            {location.lat.toFixed(6)}, {location.lng.toFixed(6)}
          </p>
        )}
      </div>

      {/* Checklist */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 divide-y divide-gray-50 dark:divide-gray-700">
        <div className="px-4 py-3 font-medium text-sm text-gray-700 dark:text-gray-300">Checklist</div>
        {checklist.map((c, i) => (
          <div key={i} className="px-4 py-3 space-y-1.5">
            <div className="flex items-center gap-3">
              <button onClick={() => toggleCheck(i)} className={`w-5 h-5 rounded flex items-center justify-center shrink-0 transition-colors ${c.ok ? 'bg-green-500' : 'border-2 border-gray-300 dark:border-gray-600'}`}>
                {c.ok && <Check size={12} className="text-white" />}
              </button>
              <span className={`text-sm flex-1 ${c.ok ? 'line-through text-gray-400' : 'text-gray-900 dark:text-white'}`}>{c.item}</span>
              <button onClick={() => removeItem(i)} className="text-gray-300 hover:text-red-400">
                <Trash2 size={14} />
              </button>
            </div>
            <input
              className="ml-8 w-[calc(100%-2.5rem)] text-xs rounded border border-gray-200 dark:border-gray-700 bg-transparent px-2 py-1 text-gray-600 dark:text-gray-400"
              placeholder="Observação..."
              value={c.note}
              onChange={e => updateNote(i, e.target.value)}
            />
          </div>
        ))}
        <div className="px-4 py-3 flex gap-2">
          <input
            className="flex-1 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent px-3 py-1.5 text-gray-900 dark:text-white"
            placeholder="Adicionar item..."
            value={newItem}
            onChange={e => setNewItem(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addItem()}
          />
          <button onClick={addItem} className="text-blue-600 hover:text-blue-700">
            <Plus size={18} />
          </button>
        </div>
      </div>

      {/* Fotos */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Fotos</span>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1.5 text-xs text-blue-600 hover:underline disabled:opacity-50"
          >
            <Camera size={13} /> {uploading ? 'Enviando...' : 'Adicionar foto'}
          </button>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoUpload} />
        </div>
        {photos.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {photos.map((p, i) => (
              <div key={i} className="aspect-square rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-700">
                {p.url ? <img src={p.url} alt="" className="w-full h-full object-cover" /> : null}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Observações */}
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Observações gerais</label>
        <textarea className={INPUT} rows={4} value={observations} onChange={e => setObservations(e.target.value)} />
      </div>

      <button
        onClick={save}
        disabled={saving}
        className="w-full py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
      >
        {saving ? 'Salvando...' : 'Salvar visita'}
      </button>
    </div>
  );
};

export default ServicesVisit;
