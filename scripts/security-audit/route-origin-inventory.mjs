// Source inventory only. Inspect exported function, arrow, and common wrapper-form mutations.
// These machine/token-authenticated handlers do not rely on a browser's cookie session.
import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
const root='src/app/api',exceptions=new Set(['src/app/api/internal/email-dispatch/route.ts:POST','src/app/api/email/webhook/route.ts:POST','src/app/api/email/unsubscribe/route.ts:POST']);
const methods=new Set(['POST','PATCH','PUT','DELETE']);
async function* walk(dir){for(const e of await readdir(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())yield* walk(p);else if(e.name==='route.ts')yield p}}
let checked=0,exempt=0;const failures=[];
for await(const file of walk(root)){
 const source=await readFile(file,'utf8'),ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS), functions=new Map();
 for(const st of ast.statements)if(ts.isFunctionDeclaration(st)&&st.name)functions.set(st.name.text,st);
 function body(node){if(!node)return null;if(ts.isIdentifier(node))return body(functions.get(node.text));if(ts.isFunctionDeclaration(node)||ts.isArrowFunction(node)||ts.isFunctionExpression(node))return node.body;if(ts.isCallExpression(node)){for(const arg of node.arguments){const found=body(arg);if(found)return found}}return null}
 function examine(method,node){if(!methods.has(method))return;if(exceptions.has(`${file}:${method}`)){exempt++;return}checked++;const b=body(node);if(!b){failures.push(`${file}: ${method} unresolved export`);return}const prefix=b.getText(ast).slice(0,700);if(!prefix.includes('rejectCrossOrigin('))failures.push(`${file}: ${method} missing early guard`)}
 for(const st of ast.statements){const exported=st.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword);if(!exported)continue;if(ts.isFunctionDeclaration(st)&&st.name)examine(st.name.text,st);if(ts.isVariableStatement(st))for(const d of st.declarationList.declarations)if(ts.isIdentifier(d.name))examine(d.name.text,d.initializer)}
}
assert.ok(checked>=45,'unexpectedly few mutation handlers examined');if(failures.length){console.error('FAIL',failures.join('\n'));process.exitCode=1}else console.log(`PASS ${checked} function, arrow and wrapped mutation handlers have early origin guards; ${exempt} machine/token-authenticated exceptions`);
console.log('LIMIT: static source inventory only; dynamic re-exports, trusted proxies and hosted configuration remain outside its proof.');
