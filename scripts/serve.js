import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
const root=resolve(process.argv.includes('--dist')?'dist':'.');
const port=Number(process.env.PORT||process.argv[process.argv.indexOf('--port')+1])||5173;
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.jpg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2','.wasm':'application/wasm'};
const requestHandler=async(req,res)=>{try{const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);let path=resolve(root,'.'+(pathname==='/'?'/index.html':pathname));if(!path.startsWith(root+sep))throw Error();if(pathname.startsWith('/images/')||pathname.startsWith('/fonts/'))path=resolve(root,process.argv.includes('--dist')?'.':'public','.'+pathname);const info=await stat(path);if(!info.isFile())throw Error();res.writeHead(200,{'Content-Type':types[extname(path)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});res.end(await readFile(path));}catch{if(!res.headersSent)res.writeHead(404);if(!res.writableEnded)res.end('Not found')}};
function listen(nextPort){const server=http.createServer(requestHandler);server.once('error',error=>{if(error.code==='EADDRINUSE'){console.warn(`Port ${nextPort} is already in use; trying ${nextPort+1}.`);listen(nextPort+1);}else throw error;});server.listen(nextPort,'0.0.0.0',()=>console.log(`GradeMatch → http://localhost:${nextPort}`));}
listen(port);
