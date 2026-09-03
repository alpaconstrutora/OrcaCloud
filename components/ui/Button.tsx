import React from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

const VARIANT: Record<ButtonVariant, string> = {
  primary:   'bg-blue-600 text-white hover:bg-blue-700 shadow-sm hover:shadow-md',
  secondary: 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50',
  ghost:     'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
  danger:    'bg-red-600 text-white hover:bg-red-700 shadow-sm hover:shadow-md',
};

const SIZE: Record<ButtonSize, string> = {
  sm:   'h-8 px-3 text-xs gap-1.5',
  // `md` é o default e segue o §17 ao pé da letra (h-9 px-3.5 text-[13px]).
  md:   'h-9 px-3.5 text-[13px] gap-1.5',
  lg:   'h-11 px-6 text-sm gap-2',
  icon: 'h-9 w-9 p-0',
};

// §16/§17 do docs/ui_ux_guia_unificado.md: radius 6px e `font-medium`, sem caixa
// alta nem `tracking-widest`. A BASE anterior (`rounded-xl font-black uppercase
// tracking-widest`) era o CTA pesado que o guia deprecou — e como vinha de
// dentro da primitiva, contaminava telas que pareciam migradas no próprio diff:
// nenhuma classe fora do padrão aparecia no JSX delas. Cinco telas de
// Configurações já tinham contornado trocando <Button> por <button> inline;
// corrigir aqui remove a razão de existir daquele contorno.
const BASE =
  'inline-flex items-center justify-center rounded-[6px] font-medium ' +
  'transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', className = '', ...props }, ref) => (
    <button
      ref={ref}
      className={`${BASE} ${VARIANT[variant]} ${SIZE[size]} ${className}`}
      {...props}
    />
  )
);

Button.displayName = 'Button';

export default Button;
