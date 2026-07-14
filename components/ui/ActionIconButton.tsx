import React from 'react';
import {
  Download,
  Pencil,
  History,
  Trash2,
  Eye,
  Share2,
  QrCode,
  CornerDownRight,
  Copy,
  Settings,
} from 'lucide-react';

export type ActionKind =
  | 'download'
  | 'edit'
  | 'settings'
  | 'history'
  | 'delete'
  | 'view'
  | 'share'
  | 'qrcode'
  | 'move'
  | 'duplicate'
  | 'annotate';

type Tone = 'neutral' | 'attention' | 'danger';

const KIND_DEFAULTS: Record<ActionKind, { icon: React.ReactNode; title: string; tone: Tone }> = {
  download:  { icon: <Download className="w-4 h-4" />,         title: 'Download',      tone: 'neutral' },
  edit:      { icon: <Pencil className="w-4 h-4" />,            title: 'Editar',        tone: 'neutral' },
  settings:  { icon: <Settings className="w-4 h-4" />,          title: 'Editar',        tone: 'neutral' },
  history:   { icon: <History className="w-4 h-4" />,           title: 'Histórico',     tone: 'neutral' },
  delete:    { icon: <Trash2 className="w-4 h-4" />,            title: 'Excluir',       tone: 'danger' },
  view:      { icon: <Eye className="w-4 h-4" />,                title: 'Ver detalhes',  tone: 'neutral' },
  share:     { icon: <Share2 className="w-4 h-4" />,             title: 'Compartilhar',  tone: 'attention' },
  qrcode:    { icon: <QrCode className="w-4 h-4" />,             title: 'Etiqueta QR Code', tone: 'neutral' },
  move:      { icon: <CornerDownRight className="w-4 h-4" />,   title: 'Mover',         tone: 'neutral' },
  duplicate: { icon: <Copy className="w-4 h-4" />,               title: 'Duplicar',      tone: 'neutral' },
  annotate:  { icon: <Pencil className="w-4 h-4" />,             title: 'Anotar',        tone: 'neutral' },
};

const TONE_CLASSES: Record<Tone, string> = {
  neutral:   'border-gray-200 text-gray-500 hover:text-blue-600 hover:border-blue-200',
  attention: 'border-gray-200 text-gray-500 hover:text-orange-600 hover:border-orange-200',
  danger:    'border-red-100 text-red-500 hover:bg-red-50',
};

const BASE = 'p-1.5 bg-white border rounded-[6px] shadow-sm transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none disabled:active:scale-100';

export interface ActionIconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  kind: ActionKind;
  title?: string;
  icon?: React.ReactNode;
  tone?: Tone;
}

const ActionIconButton = React.forwardRef<HTMLButtonElement, ActionIconButtonProps>(
  ({ kind, title, icon, tone, className = '', ...props }, ref) => {
    const defaults = KIND_DEFAULTS[kind];
    const resolvedTone = tone || defaults.tone;
    return (
      <button
        ref={ref}
        type="button"
        title={title ?? defaults.title}
        className={`${BASE} ${TONE_CLASSES[resolvedTone]} ${className}`}
        {...props}
      >
        {icon ?? defaults.icon}
      </button>
    );
  }
);

ActionIconButton.displayName = 'ActionIconButton';

export default ActionIconButton;
