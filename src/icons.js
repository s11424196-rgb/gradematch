const paths={
 sliders:'<path d="M4 7h7m4 0h5M4 17h2m4 0h10"/><circle cx="13" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
 sparkles:'<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z"/><path d="m20 2 .7 2.3L23 5l-2.3.7L20 8l-.7-2.3L17 5l2.3-.7Z"/>',
 upload:'<path d="M12 16V3m-5 5 5-5 5 5M4 15v5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5"/>',
 download:'<path d="M12 3v13m-5-5 5 5 5-5M4 16v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/>',
 image:'<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 5-5 4 4 4-7 5 8"/>',
 shield:'<path d="M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6Z"/><path d="m8 12 3 3 5-6"/>',
 chevron:'<path d="m8 5 7 7-7 7"/>',
 down:'<path d="m6 9 6 6 6-6"/>',
 reset:'<path d="M3 10a9 9 0 1 1 1 8M3 4v6h6"/>',
 compare:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 2v20m-5-10h2m6 0h2"/>',
 sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
 palette:'<path d="M12 3a9 9 0 1 0 0 18h1a2 2 0 0 0 1-3.7 1.5 1.5 0 0 1 1-2.8h2A4 4 0 0 0 21 10c0-4-4-7-9-7Z"/><circle cx="7.5" cy="10" r=".7"/><circle cx="11" cy="6.5" r=".7"/><circle cx="16" cy="8" r=".7"/>',
 info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/>',
 check:'<path d="m5 12 4 4L19 6"/>',
 expand:'<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
 close:'<path d="m6 6 12 12M6 18 18 6"/>',
 lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
 cube:'<path d="m12 2 9 5v10l-9 5-9-5V7Zm0 10 9-5M3 7l9 5v10"/>',
  leaf:'<path d="M20 3C6 1 2 8 5 15c5 9 17 4 15-12ZM5 20 16 9"/>'
  ,undo:'<path d="M9 7 4 12l5 5"/><path d="M4 12h10a6 6 0 0 1 6 6"/>'
  ,redo:'<path d="m15 7 5 5-5 5"/><path d="M20 12H10a6 6 0 0 0-6 6"/>'
  ,panel:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M8 4v16"/>'
  ,cursor:'<path d="m5 3 5 17 2-7 7-2Z"/>'
  ,minus:'<path d="M5 12h14"/>'
  ,plus:'<path d="M12 5v14M5 12h14"/>'
  ,fit:'<path d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4"/>'
  ,mouse:'<rect x="7" y="3" width="10" height="18" rx="5"/><path d="M12 3v5"/>'
  ,'eye-off':'<path d="m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.2A10.5 10.5 0 0 1 12 5c5 0 8.5 4 9 7-.2 1.5-1.1 2.8-2.3 3.9M6.2 6.2C4.3 7.3 3.2 9 3 12c.3 1.7 1.6 3.4 3.5 4.7"/>'
  ,arrow:'<path d="M5 12h13m-5-5 5 5-5 5"/>'
  ,alert:'<path d="M12 3 2.8 19a1 1 0 0 0 .9 1.5h16.6a1 1 0 0 0 .9-1.5Z"/><path d="M12 9v4m0 3v.1"/>'
};
export const icon=(name,cls='')=>`<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]||paths.image}</svg>`;
