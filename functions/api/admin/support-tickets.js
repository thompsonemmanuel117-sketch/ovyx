import { authenticateRequest, hasAdminClaim } from '../../_lib/firebase.js';
import { listFirestoreSubcollectionDocuments } from '../_lib/firebase-admin.js';
import { jsonResponse, requestId } from '../_lib/http.js';

const OWNER_EMAIL = 'ovyxsupportteam@gmail.com';

export async function onRequest(context) {
  const rid=requestId(context.request);
  try {
    const user=await authenticateRequest(context.request,context.env);
    const root=String(user?.email||'').toLowerCase()===OWNER_EMAIL;
    if(!root && !hasAdminClaim(user)) return jsonResponse({ok:false,error:'Administrator access required.',code:'ADMIN_REQUIRED'},403,{'X-OVYX-Request-ID':rid});
    if(context.request.method.toUpperCase()!=='GET') return jsonResponse({ok:false,error:'GET is required.',code:'METHOD_NOT_ALLOWED'},405,{'X-OVYX-Request-ID':rid});
    const rows=await listFirestoreSubcollectionDocuments(context.env,'support_tickets',null,null,100).catch(()=>[]);
    const tickets=rows.map(x=>x.data||{}).sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
    return jsonResponse({ok:true,tickets},200,{'X-OVYX-Request-ID':rid});
  } catch(error) {
    return jsonResponse({ok:false,error:error?.message||'Unable to load support tickets.',code:error?.code||'SUPPORT_ADMIN_FAILED'},error?.status||500,{'X-OVYX-Request-ID':rid});
  }
}