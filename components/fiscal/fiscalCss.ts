// CSS do design system do módulo Fiscal — dark theme self-contained
// Injetado via <style> tag no FiscalModule para não vazar no global
export const FISCAL_CSS = `
  .fiscal-root *, .fiscal-root *::before, .fiscal-root *::after { box-sizing: border-box; }

  .fiscal-root {
    --fbg:        #0d0f12;
    --fbg2:       #13161b;
    --fbg3:       #1a1e25;
    --fborder:    #252a34;
    --fborder2:   #2e3545;
    --ftext:      #e8eaf0;
    --ftext2:     #8b92a4;
    --ftext3:     #555e72;
    --faccent:    #4f8ef7;
    --faccent2:   #2563eb;
    --fgreen:     #22c55e;
    --fgreen-bg:  #052015;
    --famber:     #f59e0b;
    --famber-bg:  #1a1200;
    --fred:       #ef4444;
    --fred-bg:    #1a0606;
    --fpurple:    #a78bfa;
    --fpurple-bg: #0f0a1f;
    --fteal:      #2dd4bf;
    --fteal-bg:   #041714;
    --fradius:    6px;
    --fradius-lg: 10px;
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 14px;
    line-height: 1.5;
    background: var(--fbg);
    color: var(--ftext);
    height: 100%;
    display: flex;
  }

  /* Scrollbar */
  .fiscal-root ::-webkit-scrollbar { width: 4px; }
  .fiscal-root ::-webkit-scrollbar-track { background: var(--fbg); }
  .fiscal-root ::-webkit-scrollbar-thumb { background: var(--fborder2); border-radius: 4px; }

  /* Layout */
  .f-sidebar { width: 220px; flex-shrink: 0; background: var(--fbg2); border-right: 1px solid var(--fborder); display: flex; flex-direction: column; }
  .f-main { flex: 1; overflow-y: auto; }

  /* Sidebar */
  .f-logo { padding: 20px 20px 16px; border-bottom: 1px solid var(--fborder); }
  .f-logo-mark { font-size: 16px; font-weight: 800; letter-spacing: -0.5px; color: var(--ftext); }
  .f-logo-mark span { color: var(--faccent); }
  .f-logo-sub { font-family: monospace; font-size: 9px; color: var(--ftext3); text-transform: uppercase; letter-spacing: 2px; margin-top: 2px; }

  .f-nav { padding: 12px 8px; flex: 1; }
  .f-nav-section { font-family: monospace; font-size: 9px; color: var(--ftext3); text-transform: uppercase; letter-spacing: 1.5px; padding: 8px 12px 4px; }
  .f-nav-item { display: flex; align-items: center; gap: 10px; padding: 8px 12px; border-radius: var(--fradius); cursor: pointer; color: var(--ftext2); font-size: 13px; font-weight: 600; transition: all 0.15s; border: 1px solid transparent; }
  .f-nav-item:hover { background: var(--fbg3); color: var(--ftext); }
  .f-nav-item.active { background: var(--fbg3); color: var(--ftext); border-color: var(--fborder); }
  .f-nav-item svg { width: 16px; height: 16px; flex-shrink: 0; }

  .f-sidebar-footer { padding: 12px; border-top: 1px solid var(--fborder); }
  .f-health-card { background: var(--fbg3); border: 1px solid var(--fborder); border-radius: var(--fradius); padding: 12px; }
  .f-health-title { font-family: monospace; font-size: 9px; color: var(--ftext3); text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 10px; }
  .f-health-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
  .f-health-label { font-size: 11px; color: var(--ftext2); }
  .f-health-val { font-family: monospace; font-size: 11px; font-weight: 500; }

  /* Page */
  .f-page { padding: 32px 36px; max-width: 1100px; }
  .f-page-header { margin-bottom: 28px; }
  .f-page-title { font-size: 22px; font-weight: 800; letter-spacing: -0.5px; }
  .f-page-sub { color: var(--ftext2); font-size: 13px; margin-top: 4px; }

  /* Card */
  .f-card { background: var(--fbg2); border: 1px solid var(--fborder); border-radius: var(--fradius-lg); padding: 24px; }
  .f-card + .f-card { margin-top: 16px; }

  /* Badge */
  .f-badge { display: inline-flex; align-items: center; gap: 5px; padding: 3px 8px; border-radius: 4px; font-family: monospace; font-size: 10px; font-weight: 500; letter-spacing: 0.5px; white-space: nowrap; }
  .f-badge-queued     { background: var(--fbg3); color: var(--ftext2); border: 1px solid var(--fborder2); }
  .f-badge-processing { background: var(--famber-bg); color: var(--famber); border: 1px solid #3d2e00; }
  .f-badge-parsed     { background: var(--fpurple-bg); color: var(--fpurple); border: 1px solid #1f1440; }
  .f-badge-completed  { background: var(--fgreen-bg); color: var(--fgreen); border: 1px solid #0a3d1a; }
  .f-badge-failed     { background: var(--fred-bg); color: var(--fred); border: 1px solid #3d0f0f; }
  .f-badge-dead_letter{ background: #1a0a0a; color: #f87171; border: 1px solid #4d1515; }
  .f-badge-duplicated { background: var(--fbg3); color: var(--ftext3); border: 1px solid var(--fborder); }
  .f-badge-normalized { background: var(--fteal-bg); color: var(--fteal); border: 1px solid #0a2e2a; }

  /* Upload */
  .f-upload-zone { border: 2px dashed var(--fborder2); border-radius: var(--fradius-lg); padding: 56px 32px; text-align: center; cursor: pointer; transition: all 0.2s; }
  .f-upload-zone:hover, .f-upload-zone.dragging { border-color: var(--faccent); background: rgba(79,142,247,0.04); }
  .f-upload-icon { width: 48px; height: 48px; background: var(--fbg3); border: 1px solid var(--fborder2); border-radius: var(--fradius-lg); display: flex; align-items: center; justify-content: center; margin: 0 auto 16px; color: var(--faccent); }
  .f-upload-title { font-size: 16px; font-weight: 700; margin-bottom: 6px; }
  .f-upload-sub { color: var(--ftext2); font-size: 13px; margin-bottom: 20px; }
  .f-upload-btn { background: var(--faccent); color: #fff; border: none; padding: 10px 24px; border-radius: var(--fradius); font-size: 13px; font-weight: 700; cursor: pointer; transition: background 0.15s; }
  .f-upload-btn:hover { background: var(--faccent2); }

  /* Progress */
  .f-progress-bar { height: 3px; background: var(--fborder); border-radius: 2px; overflow: hidden; margin-top: 10px; }
  .f-progress-fill { height: 100%; border-radius: 2px; transition: width 0.3s; }

  /* Table */
  .f-table-wrap { overflow-x: auto; }
  .f-table { width: 100%; border-collapse: collapse; }
  .f-table th { font-family: monospace; font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: var(--ftext3); font-weight: 500; padding: 10px 14px; text-align: left; border-bottom: 1px solid var(--fborder); white-space: nowrap; }
  .f-table td { padding: 12px 14px; border-bottom: 1px solid var(--fborder); font-size: 13px; vertical-align: middle; }
  .f-table tr:last-child td { border-bottom: none; }
  .f-table tr:hover td { background: var(--fbg3); }

  /* Buttons */
  .f-btn { display: inline-flex; align-items: center; gap: 6px; padding: 7px 14px; border-radius: var(--fradius); font-size: 12px; font-weight: 700; cursor: pointer; border: 1px solid; transition: all 0.15s; background: none; }
  .f-btn-primary { background: var(--faccent); border-color: var(--faccent); color: #fff; }
  .f-btn-primary:hover { background: var(--faccent2); border-color: var(--faccent2); }
  .f-btn-ghost { border-color: var(--fborder2); color: var(--ftext2); }
  .f-btn-ghost:hover { color: var(--ftext); background: var(--fbg3); }
  .f-btn-sm { padding: 4px 10px; font-size: 11px; }
  .f-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  /* Stats */
  .f-stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px; }
  .f-stat-card { background: var(--fbg2); border: 1px solid var(--fborder); border-radius: var(--fradius-lg); padding: 16px 20px; }
  .f-stat-val { font-size: 28px; font-weight: 800; letter-spacing: -1px; line-height: 1; margin-bottom: 4px; }
  .f-stat-label { font-family: monospace; font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: var(--ftext3); }

  /* Detail */
  .f-detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .f-detail-key { font-family: monospace; font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: var(--ftext3); margin-bottom: 4px; }
  .f-detail-val { font-size: 14px; font-weight: 600; }

  /* Section title */
  .f-section-title { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: var(--ftext2); margin-bottom: 16px; padding-bottom: 10px; border-bottom: 1px solid var(--fborder); }

  /* Filters */
  .f-filters { display: flex; gap: 8px; margin-bottom: 20px; flex-wrap: wrap; }
  .f-filter-chip { background: var(--fbg3); border: 1px solid var(--fborder); border-radius: var(--fradius); padding: 6px 12px; font-size: 12px; font-weight: 600; color: var(--ftext2); cursor: pointer; transition: all 0.15s; }
  .f-filter-chip:hover { border-color: var(--fborder2); color: var(--ftext); }
  .f-filter-chip.active { background: rgba(79,142,247,0.1); border-color: var(--faccent); color: var(--faccent); }

  /* Tag / Category */
  .f-tag { display: inline-block; background: var(--fbg3); border: 1px solid var(--fborder); border-radius: 4px; padding: 2px 7px; font-family: monospace; font-size: 10px; color: var(--ftext2); }
  .f-cat { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
  .f-cat-aço        { background: #1a1000; color: #fbbf24; }
  .f-cat-concreto   { background: #0f1a0f; color: #86efac; }
  .f-cat-elétrica   { background: #0a0f2a; color: #93c5fd; }
  .f-cat-hidráulica { background: #0a1a1a; color: #5eead4; }
  .f-cat-alvenaria  { background: #1a100a; color: #fdba74; }
  .f-cat-material   { background: #1a0a1a; color: #d8b4fe; }
  .f-cat-equipamento{ background: #0a1a1a; color: #67e8f9; }

  /* Pipeline */
  .f-pipeline { display: flex; align-items: center; margin-bottom: 24px; }
  .f-pipe-step { flex: 1; text-align: center; position: relative; }
  .f-pipe-step:not(:last-child)::after { content: ''; position: absolute; right: 0; top: 50%; transform: translateY(-50%) translateY(-8px); width: 100%; height: 2px; background: var(--fborder); z-index: 0; }
  .f-pipe-dot { width: 36px; height: 36px; border-radius: 50%; border: 2px solid var(--fborder); background: var(--fbg2); display: flex; align-items: center; justify-content: center; margin: 0 auto 6px; font-family: monospace; font-size: 11px; position: relative; z-index: 1; }
  .f-pipe-dot.done   { border-color: var(--fgreen); background: var(--fgreen-bg); color: var(--fgreen); }
  .f-pipe-dot.active { border-color: var(--faccent); background: rgba(79,142,247,0.15); color: var(--faccent); }
  .f-pipe-dot.error  { border-color: var(--fred); background: var(--fred-bg); color: var(--fred); }
  .f-pipe-label { font-family: monospace; font-size: 9px; text-transform: uppercase; letter-spacing: 1px; color: var(--ftext3); }

  /* Log */
  .f-log-entry { font-family: monospace; font-size: 11px; padding: 8px 12px; border-left: 2px solid var(--fborder); margin-bottom: 4px; }
  .f-log-time  { color: var(--ftext3); margin-right: 12px; }
  .f-log-ok   { border-color: var(--fgreen); }
  .f-log-err  { border-color: var(--fred); }
  .f-log-info { border-color: var(--faccent); }
  .f-log-warn { border-color: var(--famber); }

  /* Warning chip */
  .f-warning-chip { display: flex; align-items: flex-start; gap: 8px; background: var(--famber-bg); border: 1px solid #3d2e00; border-radius: var(--fradius); padding: 8px 12px; margin-bottom: 6px; font-size: 12px; color: var(--famber); }

  /* Empty */
  .f-empty { text-align: center; padding: 60px 20px; color: var(--ftext3); }
  .f-empty svg { width: 48px; height: 48px; margin: 0 auto 12px; opacity: 0.3; }
  .f-empty-title { font-size: 14px; font-weight: 700; color: var(--ftext2); margin-bottom: 4px; }

  /* Toast */
  .f-toast { position: fixed; bottom: 24px; right: 24px; background: var(--fbg2); border: 1px solid var(--fborder2); border-radius: var(--fradius-lg); padding: 14px 18px; font-size: 13px; font-weight: 600; z-index: 9999; display: flex; align-items: center; gap: 10px; box-shadow: 0 8px 32px rgba(0,0,0,0.5); max-width: 380px; animation: fSlideUp 0.3s ease; }
  .f-toast-ok  { border-color: #0a3d1a; }
  .f-toast-err { border-color: #3d0f0f; }
  @keyframes fSlideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
  @keyframes fSpin { to { transform: rotate(360deg); } }
  .f-spin { animation: fSpin 0.8s linear infinite; display: inline-block; }

  input[type=file].f-hidden { display: none; }
  .f-mono { font-family: monospace; font-size: 11px; }
  .f-truncate { max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
`;
