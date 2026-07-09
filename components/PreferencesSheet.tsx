import React from 'react';
import { Sun, Moon, MoonStar, SunMoon } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel } from './ui/sheet';

export type ThemeMode = 'light' | 'dark' | 'midnight' | 'auto';

interface PreferencesSheetProps {
  open: boolean;
  onClose: () => void;
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  resolvedThemeMode: 'light' | 'dark' | 'midnight';
  highContrast: boolean;
  setHighContrast: (value: boolean) => void;
}

// Miniatura de "app" usada dentro de cada card de tema, no espírito do
// seletor de aparência do ClickUp: barra de título com ícone laranja + linhas
// de texto simuladas, variando cor conforme a variante (light/dark/midnight).
const ThemeMock: React.FC<{ variant: 'light' | 'dark' | 'midnight' }> = ({ variant }) => {
  const bg = variant === 'light' ? 'bg-white' : variant === 'midnight' ? 'bg-[#0b0d12]' : 'bg-[#1c1f27]';
  const barStrong = variant === 'light' ? 'bg-slate-200' : 'bg-white/20';
  const barSoft = variant === 'light' ? 'bg-slate-150' : 'bg-white/10';
  const dot = variant === 'light' ? 'bg-slate-300' : 'bg-white/25';
  return (
    <div className={`flex h-full w-full flex-col gap-1.5 p-2.5 ${bg}`}>
      <div className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 shrink-0 rounded-[3px] bg-orange-500" />
        <span className={`h-1.5 flex-1 rounded-full ${barStrong}`} />
      </div>
      <div className="flex items-center gap-1.5">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
        <span className={`h-1.5 flex-1 rounded-full ${barSoft}`} />
      </div>
      <div className="flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-orange-500" />
        <span className={`h-1.5 w-2/3 rounded-full ${barSoft}`} />
      </div>
      <div className="flex items-center gap-1.5">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
        <span className={`h-1.5 w-1/2 rounded-full ${barSoft}`} />
      </div>
    </div>
  );
};

const THEME_CARDS: { mode: ThemeMode; label: string; icon: React.ElementType }[] = [
  { mode: 'light', label: 'Claro', icon: Sun },
  { mode: 'dark', label: 'Escuro', icon: Moon },
  { mode: 'auto', label: 'Automático', icon: SunMoon },
  { mode: 'midnight', label: 'Escuro Total', icon: MoonStar },
];

const ThemeCard: React.FC<{
  mode: ThemeMode;
  label: string;
  icon: React.ElementType;
  selected: boolean;
  resolvedThemeMode: 'light' | 'dark' | 'midnight';
  onSelect: () => void;
}> = ({ mode, label, icon: Icon, selected, resolvedThemeMode, onSelect }) => {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className="group flex flex-col items-center gap-2"
    >
      <div
        className={`h-20 w-full overflow-hidden rounded-xl border-2 shadow-sm transition-colors ${
          selected ? 'border-orange-500' : 'border-slate-200 group-hover:border-slate-300'
        }`}
      >
        {mode === 'auto' ? (
          <div className="flex h-full w-full">
            <div className="w-1/2 border-r border-slate-200/40"><ThemeMock variant="light" /></div>
            <div className="w-1/2"><ThemeMock variant="dark" /></div>
          </div>
        ) : (
          <ThemeMock variant={mode === 'midnight' ? 'midnight' : mode === 'dark' ? 'dark' : 'light'} />
        )}
      </div>
      <span className={`flex items-center gap-1.5 text-sm font-semibold ${selected ? 'text-slate-900' : 'text-slate-600'}`}>
        <Icon className="h-3.5 w-3.5" />
        {label}
        {mode === 'auto' && selected && (
          <span className="text-xs font-normal text-slate-400">({resolvedThemeMode === 'dark' ? 'escuro agora' : 'claro agora'})</span>
        )}
      </span>
    </button>
  );
};

export default function PreferencesSheet({
  open,
  onClose,
  themeMode,
  setThemeMode,
  resolvedThemeMode,
  highContrast,
  setHighContrast,
}: PreferencesSheetProps) {
  return (
    <Sheet open={open} onClose={onClose} size="lg">
      <SheetHeader onClose={onClose}>
        <SheetTitle>Preferências</SheetTitle>
        <SheetDescription>Personalize a aparência do Opura neste dispositivo.</SheetDescription>
      </SheetHeader>
      <SheetPanel className="px-6 py-6">
        <div className="space-y-8">
          <section>
            <h3 className="text-sm font-bold text-slate-900">Aparência</h3>
            <p className="mt-1 text-sm text-slate-500">
              Escolha o modo claro ou escuro, ou alterne o modo automaticamente com base nas configurações do sistema.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
              {THEME_CARDS.map(card => (
                <ThemeCard
                  key={card.mode}
                  mode={card.mode}
                  label={card.label}
                  icon={card.icon}
                  selected={themeMode === card.mode}
                  resolvedThemeMode={resolvedThemeMode}
                  onSelect={() => setThemeMode(card.mode)}
                />
              ))}
            </div>
          </section>

          <section className="flex items-start justify-between gap-4 border-t border-slate-100 pt-6">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Contraste</h3>
              <p className="mt-1 text-sm text-slate-500">Ative e desative texto e bordas de alto contraste.</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={highContrast}
              aria-label="Alto contraste para maior acessibilidade"
              onClick={() => setHighContrast(!highContrast)}
              className={`relative mt-0.5 flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                highContrast ? 'bg-orange-500' : 'bg-slate-200'
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                  highContrast ? 'translate-x-[22px]' : 'translate-x-[2px]'
                }`}
              />
            </button>
          </section>
          <p className="-mt-4 text-xs text-slate-400">Alto contraste para maior acessibilidade</p>
        </div>
      </SheetPanel>
    </Sheet>
  );
}
