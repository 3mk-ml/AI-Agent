export class RemoteError extends Error {
 constructor(message: string, public status=502, public retryAfter=0, public ambiguous=false) { super(message); }
}
export async function remoteJson(url: string, init: RequestInit={}, timeout=30000): Promise<any> {
 let r: Response;
 try { r=await fetch(url,{...init,redirect:'error',signal:AbortSignal.timeout(timeout),cache:'no-store'}); }
 catch { throw new RemoteError('Remote request timed out or connection failed. Delivery may be unknown.',502,0,true); }
 const text=await r.text(); let data:any={}; try{data=JSON.parse(text);}catch{if(r.ok)throw new RemoteError('Remote service returned a non-JSON response.',502,0,true);}
 if(!r.ok) throw new RemoteError(`Remote service returned HTTP ${r.status}. Check credentials, quota and provider diagnostics.`,r.status,Number(r.headers.get('retry-after')||0),r.status>=500);
 return data;
}
export function jsonHeaders(token?: string) { return {'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})}; }
