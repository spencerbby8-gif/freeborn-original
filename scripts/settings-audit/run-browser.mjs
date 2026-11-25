// CI orchestration only: fresh local fixture build server, no hosted credentials.
import {spawn} from 'node:child_process';import {setTimeout as delay} from 'node:timers/promises';
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','0.0.0.0','--port','3000'],{env:{...process.env,NEXT_PUBLIC_SUPABASE_URL:'https://fixture.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'fixture-anon'},stdio:'inherit'});
try{
 let ready=false;for(let n=0;n<100;n++){if(server.exitCode!==null)throw Error('Fixture server exited');try{await fetch('http://127.0.0.1:3000/auth');ready=true;break;}catch{await delay(200);}}
 if(!ready)throw Error('Fixture server did not become ready');
 for(const script of ['scripts/member-experience/browser.mjs','scripts/settings-audit/browser.mjs'])await new Promise((resolve,reject)=>{const child=spawn(process.execPath,[script],{env:process.env,stdio:'inherit'});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error('Browser acceptance failed: '+script)));});
}finally{server.kill('SIGTERM');}
