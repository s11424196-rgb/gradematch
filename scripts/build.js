import {mkdir,cp,copyFile,stat} from 'node:fs/promises';
await mkdir('dist',{recursive:true});
await copyFile('index.html','dist/index.html');
await cp('src','dist/src',{recursive:true});
await cp('public','dist',{recursive:true});
await mkdir('dist/node_modules/pdfjs-dist',{recursive:true});
await mkdir('dist/node_modules/mupdf',{recursive:true});
await cp('node_modules/pdfjs-dist/build','dist/node_modules/pdfjs-dist/build',{recursive:true});
for (const folder of ['cmaps','standard_fonts','wasm']) {
  try { await stat(`node_modules/pdfjs-dist/${folder}`); await cp(`node_modules/pdfjs-dist/${folder}`,`dist/node_modules/pdfjs-dist/${folder}`,{recursive:true}); } catch { /* Optional in some PDF.js releases. */ }
}
await cp('node_modules/mupdf/dist','dist/node_modules/mupdf/dist',{recursive:true});
console.log('Built static Paperline app in dist/ with PDF.js and MuPDF runtime assets.');
