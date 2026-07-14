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
type Size = 'md' | 'sm';

const KIND_DEFAULTS: Record<ActionKind, { Icon: React.ComponentType<{ className?: string }>; title: string; tone: Tone }> = {
  download:  { Icon: Download,         title: 'Download',      tone: 'neutral' },
  edit:      { Icon: Pencil,           title: 'Editar',        tone: 'neutral' },
  settings:  { Icon: Settings,         title: 'Editar',        tone: 'neutral' },
  history:   { Icon: History,          title: 'Histórico',     tone: 'neutral' },
  delete:    { Icon: Trash2,           title: 'Excluir',       tone: 'danger' },
  view:      { Icon: Eye,              title: 'Ver detalhes',  tone: 'neutral' },
  share:     { Icon: Share2,           title: 'Compartilhar',  tone: 'attention' },
  qrcode:    { Icon: QrCode,           title: 'Etiqueta QR Code', tone: 'neutral' },
  move:      { Icon: CornerDownRight,  title: 'Mover',         tone: 'neutral' },
  duplicate: { Icon: Copy,             title: 'Duplicar',      tone: 'neutral' },
  annotate:  { Icon: Pencil,           title: 'Anotar',        tone: 'neutral' },
};

const TONE_CLASSES: Record<Tone, string> = {
  neutral:   'border-gray-200 text-gray-500 hover:text-blue-600 hover:border-blue-200',
  attention: 'border-gray-200 text-gray-500 hover:text-orange-600 hover:border-orange-200',
  danger:    'border-red-100 text-red-500 hover:bg-red-50',
};

// `md` é o canônico (§9.2). `sm` existe só para células de tabela já
// deliberadamente compactas (ex: BankReconciliation modo "compacto") —
// não usar por padrão, só quando a linha já era menor que o normal.
const SIZE_CLASSES: Record<Size, { button: string; icon: string }> = {
  md: { button: 'p-1.5', icon: 'w-4 h-4' },
  sm: { button: 'p-1', icon: 'w-3.5 h-3.5' },
};

const BASE = 'bg-white border rounded-[6px] shadow-sm transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none disabled:active:scale-100';

export interface ActionIconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  kind: ActionKind;
  title?: string;
  icon?: React.ReactNode;
  tone?: Tone;
  size?: Size;
}

const ActionIconButton = React.forwardRef<HTMLButtonElement, ActionIconButtonProps>(
  ({ kind, title, icon, tone, size = 'md', className = '', ...props }, ref) => {
    const defaults = KIND_DEFAULTS[kind];
    const resolvedTone = tone || defaults.tone;
    const sizeClasses = SIZE_CLASSES[size];
    return (
      <button
        ref={ref}
        type="button"
        title={title ?? defaults.title}
        className={`${BASE} ${sizeClasses.button} ${TONE_CLASSES[resolvedTone]} ${className}`}
        {...props}
      >
        {icon ?? <defaults.Icon className={sizeClasses.icon} />}
      </button>
    );
  }
);

ActionIconButton.displayName = 'ActionIconButton';

export default ActionIconButton;
