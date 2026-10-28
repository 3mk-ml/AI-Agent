import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync, unlinkSync } from 'node:fs';
import { randomBytes, createCipheriv } from 'node:crypto';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import { sign, verify, equalSecret, hashPassword, checkPassword } from './core.mjs';
import { appUrl, fields, settings } from './config';

const runtime = (name: string) => path.join(process.cwd(), '.runtime', name);
export function secret() { const value = process.env.SESSION_SECRET || (existsSync(runtime('session.key')) ? readFileSync(runtime('session.key'),'utf8').trim() : ''); if(value.length < 32) throw new Error('Run npm run setup before starting AgentFlow.'); return value; }
export function adminExists() { return existsSync(runtime('admin.json')); }
export function assertOrigin(req: NextRequest) { if(req.headers.get('origin') !== new URL(appUrl()).origin) throw Object.assign(new Error('Invalid request origin. Open the configured APP_URL.'),{status:403}); }
export function operator(req: NextRequest) { const token = req.cookies.get('af_operator')?.value; const user = token ? verify(token,secret(),'operator') : null; if(!user || !adminExists()) throw Object.assign(new Error('Sign in to continue.'),{status:401}); return user; }
export function customer(req: NextRequest) { const value = req.cookies.get('af_customer')?.value; const c = value ? verify(value,secret(),'customer') : null; if(!c) throw Object.assign(new Error('Start a new customer session.'),{status:401}); return c; }
export function cookie(response: NextResponse, name: string, token: string, seconds: number) { response.cookies.set(name,token,{httpOnly:true,secure:new URL(appUrl()).protocol==='https:',sameSite:'strict',path:'/',maxAge:seconds}); return response; }
export function login(password: string) { if(!adminExists()) throw Object.assign(new Error('Complete first-run setup.'),{status:409}); const data = JSON.parse(readFileSync(runtime('admin.json'),'utf8')); if(!checkPassword(password,data.hash)) throw Object.assign(new Error('Incorrect password.'),{status:401}); return sign({purpose:'operator',role:'admin'},secret(),8*3600); }
export function setupAdmin(token: string, password: string) {
 if(adminExists()) throw Object.assign(new Error('Administrator already exists.'),{status:409});
 const p=runtime('bootstrap.token'); if(!existsSync(p) || !equalSecret(token,readFileSync(p,'utf8').trim())) throw Object.assign(new Error('Incorrect setup token. Run npm run setup.'),{status:403});
 writeFileSync(runtime('admin.json'),JSON.stringify({hash:hashPassword(password)}),{mode:0o600,flag:'wx'}); unlinkSync(p);
}
export function saveSettings(input: Record<string,unknown>) {
 const values=settings();
 for(const key of fields) { const value=input[key]; if(typeof value==='string' && value.trim()) { if(value.length>20000) throw new Error('Setting is too long'); values[key]=value.trim(); } }
 // Secrets are never returned by a GET endpoint. The key stays outside Git.
 mkdirSync(runtime(''),{recursive:true}); const key=readFileSync(runtime('master.key'));
 const iv=randomBytes(12), cipher=createCipheriv('aes-256-gcm',key,iv);
 const data=Buffer.concat([cipher.update(JSON.stringify(values),'utf8'),cipher.final()]);
 const target=runtime('settings.enc'); const tmp=target+'.tmp';
 writeFileSync(tmp,JSON.stringify({iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:data.toString('base64')}),{mode:0o600}); renameSync(tmp,target);
}
const attempts=new Map<string,{count:number,until:number}>();
export function authLimit(key: string) { const now=Date.now(); let entry=attempts.get(key); if(!entry || entry.until<now) { entry={count:0,until:now+60000}; attempts.set(key,entry); } if(++entry.count>10) throw Object.assign(new Error('Too many attempts. Try again in a minute.'),{status:429}); }
export function requireToken(req: NextRequest, header: string, expected: string) { if(!equalSecret(req.headers.get(header),expected)) throw Object.assign(new Error('Unauthorized service request.'),{status:401}); }
