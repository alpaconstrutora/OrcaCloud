// CSS do módulo Fiscal — light theme alinhado ao design system do OrçaCloud
export const FISCAL_CSS = `
  .fiscal-root *, .fiscal-root *::before, .fiscal-root *::after { box-sizing: border-box; }

  .fiscal-root {
    --fbg:        #ffffff;
    --fbg2:       #f9fafb;
    --fbg3:       #f3f4f6;
    --fborder:    #e5e7eb;
    --fborder2:   #d1d5db;
    --ftext:      #111827;
    --ftext2:     #6b7280;
    --ftext3:     #9ca3af;
    --faccent:    #2563eb;
    --faccent2:   #1d4ed8;
    --fgreen:     #16a34a;
    --fgreen-bg:  #f0fdf4;
    --famber:     #d97706;
    --famber-bg:  #fffbeb;
    --fred:       #dc2626;
    --fred-bg:    #fef2f2;
    --fpurple:    #7c3aed;
    --fpurple-bg: #f5f3ff;
    --fteal:      #0d9488;
    --fteal-bg:   #f0fdfa;
    --fradius:    8px;
    --fradius-lg: 12px;
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 14px;
    line-height: 1.5;
    background: #f9fafb;
    color: var(--ftext);
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  /* Scrollbar */
  .fiscal-root ::-webkit-scrollbar { width: 4px; }
  .fiscal-root ::-webkit-scrollbar-track { background: var(--fbg2); }
  .fiscal-root ::-webkit-scrollbar-thumb { background: var(--fborder2); border-radius: 4px; }

  /* Layout */
  .f-main { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
  .f-tab-content { flex: 1; overflow-y: auto; }

  /* Module Header */
  .f-module-header { background: #fff; border-bottom: 1px solid var(--fborder); padding: 20px 28px 0; flex-shrink: 0; }
  .f-module-title-row { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 16px; gap: 16px; }
  .f-module-title { font-size: 20px; font-weight: 800; letter-spacing: -0.4px; color: var(--ftext); margin: 0; }
  .f-module-sub { font-size: 13px; color: var(--ftext2); margin: 2px 0 0; }

  /* Pipeline health chips */
  .f-health-chips { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
  .f-health-chip { display: inline-flex; align-items: center; gap: 6px; background: var(--fbg2); border: 1px solid var(--fborder); border-radius: 20px; padding: 4px 12px; font-size: 12px; font-weight: 600; color: var(--ftext2); }
  .f-health-chip-warn { background: var(--famber-bg); border-color: #fde68a; color: var(--famber); }
  .f-health-chip-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }

  /* Tabs */
  .f-tabs { display: flex; gap: 2px; margin-top: 4px; }
  .f-tab { display: inline-flex; align-items: center; gap: 7px; padding: 10px 16px; border: none; background: none; font-size: 13px; font-weight: 600; color: var(--ftext2); cursor: pointer; border-bottom: 2px solid transparent; transition: all 0.15s; border-radius: 0; margin-bottom: -1px; }
  .f-tab:hover { color: var(--ftext); }
  .f-tab.active { color: var(--faccent); border-bottom-color: var(--faccent); }
  .f-tab svg { width: 15px; height: 15px; }

  /* Page */
  .f-page { padding: 28px 28px; max-width: 1100px; }
  .f-page-header { margin-bottom: 24px; }
  .f-page-title { font-size: 18px; font-weight: 800; letter-spacing: -0.4px; color: var(--ftext); }
  .f-page-sub { color: var(--ftext2); font-size: 13px; margin-top: 3px; }

  /* Card */
  .f-card { background: #fff; border: 1px solid var(--fborder); border-radius: var(--fradius-lg); padding: 24px; box-shadow: 0 1px 3px rgba(0,0,0,.04); }
  .f-card + .f-card { margin-top: 16px; }

  /* Badge */
  .f-badge { display: inline-flex; align-items: center; gap: 5px; padding: 3px 8px; border-radius: 20px; font-size: 11px; font-weight: 600; white-space: nowrap; }
  .f-badge-queued     { background: var(--fbg3); color: var(--ftext2); border: 1px solid var(--fborder); }
  .f-badge-processing { background: var(--famber-bg); color: var(--famber); border: 1px solid #fde68a; }
  .f-badge-parsed     { background: var(--fpurple-bg); color: var(--fpurple); border: 1px solid #ddd6fe; }
  .f-badge-completed  { background: var(--fgreen-bg); color: var(--fgreen); border: 1px solid #bbf7d0; }
  .f-badge-failed     { background: var(--fred-bg); color: var(--fred); border: 1px solid #fecaca; }
  .f-badge-dead_letter{ background: #fff1f2; color: #be123c; border: 1px solid #fecdd3; }
  .f-badge-duplicated { background: var(--fbg3); color: var(--ftext3); border: 1px solid var(--fborder); }
  .f-badge-normalized { background: var(--fteal-bg); color: var(--fteal); border: 1px solid #99f6e4; }

  /* Upload */
  .f-upload-zone { border: 2px dashed var(--fborder2); border-radius: var(--fradius-lg); padding: 56px 32px; text-align: center; cursor: pointer; transition: all 0.2s; background: #fff; }
  .f-upload-zone:hover, .f-upload-zone.dragging { border-color: var(--faccent); background: #eff6ff; }
  .f-upload-icon { width: 48px; height: 48px; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: var(--fradius-lg); display: flex; align-items: center; justify-content: center; margin: 0 auto 16px; color: var(--faccent); }
  .f-upload-title { font-size: 15px; font-weight: 700; margin-bottom: 6px; color: var(--ftext); }
  .f-upload-sub { color: var(--ftext2); font-size: 13px; margin-bottom: 20px; }
  .f-upload-btn { background: var(--faccent); color: #fff; border: none; padding: 10px 24px; border-radius: var(--fradius); font-size: 13px; font-weight: 700; cursor: pointer; transition: background 0.15s; }
  .f-upload-btn:hover { background: var(--faccent2); }
  .f-upload-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  /* Progress */
  .f-progress-bar { height: 4px; background: var(--fbg3); border-radius: 2px; overflow: hidden; margin-top: 10px; }
  .f-progress-fill { height: 100%; border-radius: 2px; transition: width 0.3s; }

  /* Table */
  .f-table-wrap { overflow-x: auto; }
  .f-table { width: 100%; border-collapse: collapse; }
  .f-table th { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--ftext3); font-weight: 700; padding: 10px 14px; text-align: left; border-bottom: 1px solid var(--fborder); white-space: nowrap; background: var(--fbg2); }
  .f-table td { padding: 12px 14px; border-bottom: 1px solid var(--fborder); font-size: 13px; vertical-align: middle; color: var(--ftext); }
  .f-table tr:last-child td { border-bottom: none; }
  .f-table tr:hover td { background: var(--fbg2); }

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
  .f-stat-card { background: #fff; border: 1px solid var(--fborder); border-radius: var(--fradius-lg); padding: 16px 20px; box-shadow: 0 1px 3px rgba(0,0,0,.04); }
  .f-stat-val { font-size: 28px; font-weight: 800; letter-spacing: -1px; line-height: 1; margin-bottom: 4px; color: var(--ftext); }
  .f-stat-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--ftext3); font-weight: 600; }

  /* Detail */
  .f-detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .f-detail-key { font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--ftext3); font-weight: 700; margin-bottom: 4px; }
  .f-detail-val { font-size: 14px; font-weight: 600; color: var(--ftext); }

  /* Section title */
  .f-section-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: var(--ftext2); margin-bottom: 16px; padding-bottom: 10px; border-bottom: 1px solid var(--fborder); }

  /* Filters */
  .f-filters { display: flex; gap: 8px; margin-bottom: 20px; flex-wrap: wrap; }
  .f-filter-chip { background: #fff; border: 1px solid var(--fborder); border-radius: 20px; padding: 5px 14px; font-size: 12px; font-weight: 600; color: var(--ftext2); cursor: pointer; transition: all 0.15s; }
  .f-filter-chip:hover { border-color: var(--faccent); color: var(--faccent); }
  .f-filter-chip.active { background: #eff6ff; border-color: #bfdbfe; color: var(--faccent); }

  /* Tag / Category */
  .f-tag { display: inline-block; background: var(--fbg3); border: 1px solid var(--fborder); border-radius: 4px; padding: 2px 7px; font-size: 10px; color: var(--ftext2); font-weight: 600; }
  .f-cat { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
  .f-cat-aço        { background: #fffbeb; color: #d97706; }
  .f-cat-concreto   { background: #f0fdf4; color: #16a34a; }
  .f-cat-elétrica   { background: #eff6ff; color: #2563eb; }
  .f-cat-hidráulica { background: #f0fdfa; color: #0d9488; }
  .f-cat-alvenaria  { background: #fff7ed; color: #ea580c; }
  .f-cat-material   { background: #faf5ff; color: #7c3aed; }
  .f-cat-equipamento{ background: #ecfeff; color: #0891b2; }

  /* Pipeline */
  .f-pipeline { display: flex; align-items: center; margin-bottom: 24px; }
  .f-pipe-step { flex: 1; text-align: center; position: relative; }
  .f-pipe-step:not(:last-child)::after { content: ''; position: absolute; right: 0; top: 50%; transform: translateY(-50%) translateY(-8px); width: 100%; height: 2px; background: var(--fborder); z-index: 0; }
  .f-pipe-dot { width: 36px; height: 36px; border-radius: 50%; border: 2px solid var(--fborder); background: #fff; display: flex; align-items: center; justify-content: center; margin: 0 auto 6px; font-size: 11px; font-weight: 700; position: relative; z-index: 1; }
  .f-pipe-dot.done   { border-color: var(--fgreen); background: var(--fgreen-bg); color: var(--fgreen); }
  .f-pipe-dot.active { border-color: var(--faccent); background: #eff6ff; color: var(--faccent); }
  .f-pipe-dot.error  { border-color: var(--fred); background: var(--fred-bg); color: var(--fred); }
  .f-pipe-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--ftext3); font-weight: 600; }

  /* Log */
  .f-log-entry { font-family: monospace; font-size: 11px; padding: 8px 12px; border-left: 2px solid var(--fborder); margin-bottom: 4px; background: var(--fbg2); border-radius: 0 4px 4px 0; }
  .f-log-time  { color: var(--ftext3); margin-right: 12px; }
  .f-log-ok   { border-color: var(--fgreen); }
  .f-log-err  { border-color: var(--fred); }
  .f-log-info { border-color: var(--faccent); }
  .f-log-warn { border-color: var(--famber); }

  /* Warning chip */
  .f-warning-chip { display: flex; align-items: flex-start; gap: 8px; background: var(--famber-bg); border: 1px solid #fde68a; border-radius: var(--fradius); padding: 8px 12px; margin-bottom: 6px; font-size: 12px; color: var(--famber); font-weight: 600; }

  /* Empty */
  .f-empty { text-align: center; padding: 60px 20px; color: var(--ftext3); }
  .f-empty svg { width: 48px; height: 48px; margin: 0 auto 12px; opacity: 0.3; }
  .f-empty-title { font-size: 14px; font-weight: 700; color: var(--ftext2); margin-bottom: 4px; }

  /* Toast */
  .f-toast { position: fixed; bottom: 24px; right: 24px; background: #fff; border: 1px solid var(--fborder); border-radius: var(--fradius-lg); padding: 14px 18px; font-size: 13px; font-weight: 600; z-index: 9999; display: flex; align-items: center; gap: 10px; box-shadow: 0 8px 32px rgba(0,0,0,.12); max-width: 380px; animation: fSlideUp 0.3s ease; color: var(--ftext); }
  .f-toast-ok  { border-left: 3px solid var(--fgreen); }
  .f-toast-err { border-left: 3px solid var(--fred); }
  @keyframes fSlideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
  @keyframes fSpin { to { transform: rotate(360deg); } }
  .f-spin { animation: fSpin 0.8s linear infinite; display: inline-block; }

  input[type=file].f-hidden { display: none; }
  .f-mono { font-family: monospace; font-size: 11px; }
  .f-truncate { max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
`;
