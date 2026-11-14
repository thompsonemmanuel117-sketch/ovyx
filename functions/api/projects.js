import { authenticateRequest } from '../_lib/firebase.js';
import {
  getFirestoreDocument,
  getFirestoreData,
  getFirestoreDocumentAtPath,
  getFirestoreDataAtPath,
  setFirestoreDocumentAtPath,
  deleteFirestoreDocumentAtPath,
  listFirestoreSubcollectionDocuments,
} from './_lib/firebase-admin.js';
import { readJson, jsonResponse, requestId } from './_lib/http.js';

const DEFAULT_WORKSPACE_ID = 'personal';
function cleanWorkspaceId(value) {
  const id = String(value ?? '').trim().slice(0, 120);
  if (!/^[A-Za-z0-9_-]{1,120}$/.test(id)) throw Object.assign(new Error('The selected workspace could not be identified.'), { status: 400, code: 'INVALID_WORKSPACE_ID' });
  return id;
}
function projectWorkspaceId(project) {
  const value = String(project?.workspaceId || '').trim().slice(0, 120);
  return /^[A-Za-z0-9_-]{1,120}$/.test(value) ? value : DEFAULT_WORKSPACE_ID;
}
function ownedWorkspace(workspace, uid, email) {
  return Boolean(workspace && String(workspace.ownerUid || '').trim() === uid && String(workspace.ownerEmail || '').trim().toLowerCase() === email);
}
async function assertWorkspaceAccess(env, uid, email, workspaceId, { allowArchived = true } = {}) {
  if (workspaceId === DEFAULT_WORKSPACE_ID) return;
  const workspace = await getFirestoreDataAtPath(env, ['users', uid, 'workspaces', workspaceId]);
  if (!ownedWorkspace(workspace, uid, email) || (!allowArchived && workspace.status === 'archived')) {
    throw Object.assign(new Error('Workspace not found or unavailable.'), { status: 404, code: 'WORKSPACE_NOT_FOUND' });
  }
}

async function sharedProjectMembership(env, uid, pid) {
  const rows = await listFirestoreSubcollectionDocuments(env, 'users', uid, 'shared_projects', 1000);
  return rows.find(row => row.data?.projectId === pid && row.data?.status === 'active')?.data || null;
}

const MAX_PROJECT_BYTES = 950_000;

function clean(value,max=320){return String(value??'').trim().slice(0,max);}
function projectId(value){
  const id=clean(value,120);
  if(!/^[A-Za-z0-9_-]{1,120}$/.test(id))throw Object.assign(new Error('The selected app could not be identified.'),{status:400,code:'INVALID_PROJECT_ID'});
  return id;
}
function payload(value){
  if(!value||typeof value!=='object'||Array.isArray(value))throw Object.assign(new Error('App details are required to continue.'),{status:400,code:'PROJECT_REQUIRED'});
  const copy=JSON.parse(JSON.stringify(value));
  delete copy.ownerUid;delete copy.ownerEmail;
  return copy;
}
function pathFor(email,id){return `users/${email}/projects/${id}`;}

export async function onRequest(context){
  const id=requestId(context.request);
  try{
    const user=context.data?.user||await authenticateRequest(context.request,context.env);
    const uid=clean(user?.uid||user?.sub);
    const email=clean(user?.email,320).toLowerCase();
    if(!uid||!email)throw Object.assign(new Error('Please sign in with a verified email address.'),{status:401,code:'EMAIL_REQUIRED'});

    const method=context.request.method.toUpperCase();
    if(method==='GET'){
      const url=new URL(context.request.url);
      const requestedWorkspace=url.searchParams.get('workspaceId');
      const workspaceFilter=requestedWorkspace===null?null:cleanWorkspaceId(requestedWorkspace);
      const requestedProject=url.searchParams.get('projectId');
      if(workspaceFilter!==null)await assertWorkspaceAccess(context.env,uid,email,workspaceFilter);
      if(requestedProject){
        const pid=projectId(requestedProject);
        let project=await getFirestoreDataAtPath(context.env,['users',email,'projects',pid]);
        let accessRole='owner';
        if(!project||clean(project.ownerUid)!==uid||clean(project.ownerEmail).toLowerCase()!==email){
          const membership=await sharedProjectMembership(context.env,uid,pid);
          if(!membership||!['viewer','editor'].includes(membership.role))throw Object.assign(new Error('Project not found.'),{status:404,code:'PROJECT_NOT_FOUND'});
          project=await getFirestoreDataAtPath(context.env,['users',clean(membership.ownerEmail,320).toLowerCase(),'projects',pid]);
          if(!project||clean(project.ownerUid)!==clean(membership.ownerUid)||clean(project.ownerEmail).toLowerCase()!==clean(membership.ownerEmail).toLowerCase())throw Object.assign(new Error('Shared project is no longer available.'),{status:404,code:'PROJECT_NOT_FOUND'});
          accessRole=membership.role;
        }
        const normalized={...project,id:pid,workspaceId:projectWorkspaceId(project),sharingAccess:{role:accessRole,owner:accessRole==='owner'}};
        if(requestedWorkspace!==null&&accessRole==='owner'&&normalized.workspaceId!==workspaceFilter)throw Object.assign(new Error('Project not found in this workspace.'),{status:404,code:'PROJECT_NOT_FOUND'});
        if(requestedWorkspace!==null&&accessRole!=='owner'&&workspaceFilter!=='personal')throw Object.assign(new Error('Project not found in this workspace.'),{status:404,code:'PROJECT_NOT_FOUND'});
        return jsonResponse({ok:true,project:normalized,owner:{uid:clean(project.ownerUid),email:clean(project.ownerEmail).toLowerCase()},access:{role:accessRole}},200,{'X-OVYX-Request-ID':id,'Cache-Control':'no-store'});
      }
      const rows=await listFirestoreSubcollectionDocuments(context.env,'users',email,'projects',100);
      let projects=rows.map(item=>{const p=item.data||{};return {...p,id:item.id,workspaceId:projectWorkspaceId(p),sharingAccess:{role:'owner',owner:true}};}).filter(p=>clean(p.ownerUid)===uid&&clean(p.ownerEmail).toLowerCase()===email);
      if(workspaceFilter!==null)projects=projects.filter(project=>project.workspaceId===workspaceFilter);
      if(workspaceFilter===null||workspaceFilter===DEFAULT_WORKSPACE_ID){
        const memberships=await listFirestoreSubcollectionDocuments(context.env,'users',uid,'shared_projects',1000);
        for(const membershipRow of memberships){
          const membership=membershipRow.data||{};
          if(membership.status!=='active'||!['viewer','editor'].includes(membership.role))continue;
          const ownerEmail=clean(membership.ownerEmail,320).toLowerCase();
          const sharedId=projectId(membership.projectId);
          const shared=await getFirestoreDataAtPath(context.env,['users',ownerEmail,'projects',sharedId]);
          if(!shared||clean(shared.ownerUid)!==clean(membership.ownerUid)||clean(shared.ownerEmail).toLowerCase()!==ownerEmail)continue;
          if(projects.some(project=>project.id===sharedId&&clean(project.ownerEmail).toLowerCase()===ownerEmail))continue;
          projects.push({...shared,id:sharedId,workspaceId:DEFAULT_WORKSPACE_ID,sharingAccess:{role:membership.role,owner:false,ownerEmail}});
        }
      }
      return jsonResponse({ok:true,projects,owner:{uid,email},workspaceId:workspaceFilter},200,{'X-OVYX-Request-ID':id,'Cache-Control':'no-store'});
    }
    if(method==='DELETE'){
      const url=new URL(context.request.url);const pid=projectId(url.searchParams.get('projectId'));
      const existingDoc=await getFirestoreDocumentAtPath(context.env,['users',email,'projects',pid]);
      const existing=existingDoc?await getFirestoreDataAtPath(context.env,['users',email,'projects',pid]):null;
      if(!existing||clean(existing.ownerUid)!==uid||clean(existing.ownerEmail).toLowerCase()!==email)throw Object.assign(new Error('Project not found.'),{status:404,code:'PROJECT_NOT_FOUND'});
      await deleteFirestoreDocumentAtPath(context.env,['users',email,'projects',pid],existingDoc?.updateTime);
      return jsonResponse({ok:true,deleted:true,projectId:pid},200,{'X-OVYX-Request-ID':id});
    }
    if(method==='POST'){
      const body=await readJson(context.request,MAX_PROJECT_BYTES);
      const pid=projectId(body.projectId||body.project?.id||crypto.randomUUID().replace(/-/g,'').slice(0,24));
      const project=payload(body.project||body.data);
      let targetEmail=email;
      let existingDoc=await getFirestoreDocumentAtPath(context.env,['users',email,'projects',pid]);
      let existing=existingDoc?await getFirestoreDataAtPath(context.env,['users',email,'projects',pid]):null;
      let writeUid=uid;
      let sharedMembership=null;
      if(!existing){
        sharedMembership=await sharedProjectMembership(context.env,uid,pid);
        if(sharedMembership){
          if(sharedMembership.role!=='editor')throw Object.assign(new Error('You need editor access to change this shared project.'),{status:403,code:'PROJECT_EDIT_FORBIDDEN'});
          targetEmail=clean(sharedMembership.ownerEmail,320).toLowerCase();
          writeUid=clean(sharedMembership.ownerUid,256);
          existingDoc=await getFirestoreDocumentAtPath(context.env,['users',targetEmail,'projects',pid]);
          existing=existingDoc?await getFirestoreDataAtPath(context.env,['users',targetEmail,'projects',pid]):null;
        }
      }
      if(existing && (clean(existing.ownerUid)!==writeUid||clean(existing.ownerEmail).toLowerCase()!==targetEmail))throw Object.assign(new Error('This app cannot be saved under the current account.'),{status:409,code:'PROJECT_OWNERSHIP_CONFLICT'});
      const workspaceId=sharedMembership?projectWorkspaceId(existing):cleanWorkspaceId(body.workspaceId||project.workspaceId||existing?.workspaceId||DEFAULT_WORKSPACE_ID);
      if(!sharedMembership)await assertWorkspaceAccess(context.env,uid,email,workspaceId,{allowArchived:false});
      const now=new Date().toISOString();
      const brandProfile=await getFirestoreDataAtPath(context.env,['users',targetEmail,'brand_profile','config']).catch(()=>null);
      const stored={
        ...project,
        id:pid,
        workspaceId,
        ownerUid:writeUid,
        ownerEmail:targetEmail,
        brandProfileVersion:Number(brandProfile?.version||0)||0,
        brandProfileUpdatedAt:brandProfile?.updatedAt||null,
        createdAt:existing?.createdAt||now,
        updatedAt:now
      };
      await setFirestoreDocumentAtPath(context.env,['users',targetEmail,'projects',pid],stored,{merge:false,expectedUpdateTime:existingDoc?.updateTime||null});
      const activityId='update_'+uid.replace(/[^A-Za-z0-9_-]/g,'_').slice(0,80);
      const activityPath=['users',targetEmail,'projects',pid,'activity',activityId];
      const activityDoc=await getFirestoreDocumentAtPath(context.env,activityPath);
      await setFirestoreDocumentAtPath(context.env,activityPath,{
        event:'project_updated',actorUid:uid,actorEmail:email,
        actorName:clean(user.name||user.displayName||email,100),
        createdAt:now
      },{merge:false,expectedUpdateTime:activityDoc?.updateTime||null});
      return jsonResponse({ok:true,project:{...stored}},200,{'X-OVYX-Request-ID':id});
    }
    return jsonResponse({ok:false,error:'GET, POST or DELETE is required.',code:'METHOD_NOT_ALLOWED'},405,{'X-OVYX-Request-ID':id});
  }catch(error){
    return jsonResponse({ok:false,error:error?.message||'Your saved app request could not be completed. Please try again.',code:error?.code||'PROJECTS_FAILED'},error?.status||500,{'X-OVYX-Request-ID':id});
  }
}
