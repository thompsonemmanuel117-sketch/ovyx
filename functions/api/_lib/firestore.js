import {
  firestoreDocumentToJs,
  getFirestoreDocument,
  getFirestoreData,
  listFirestoreDocuments,
  setFirestoreDocument,
  createFirestoreDocument,
  setFirestoreDocumentIfCurrent,
} from './firebase-admin.js';

function pathParts(pathLike){
  if(Array.isArray(pathLike))return pathLike.map(x=>String(x||'').trim()).filter(Boolean);
  return String(pathLike||'').split('/').map(x=>x.trim()).filter(Boolean);
}
function assertDocumentPath(pathLike){
  const parts=pathParts(pathLike);
  if(parts.length<2||parts.length%2!==0)throw new Error('Firestore document path must contain collection/document pairs.');
  return parts;
}
export async function firestoreGet(env,pathLike){
  const parts=assertDocumentPath(pathLike);
  return getFirestoreData(env,parts.slice(0,-1).join('/'),parts.at(-1));
}
export async function firestoreSet(env,pathLike,data){
  const parts=assertDocumentPath(pathLike);
  return setFirestoreDocument(env,parts.slice(0,-1).join('/'),parts.at(-1),data,{merge:true});
}
export async function firestoreCreate(env,pathLike,data){
  const parts=assertDocumentPath(pathLike);
  return createFirestoreDocument(env,parts.slice(0,-1).join('/'),parts.at(-1),data);
}
export {
  firestoreDocumentToJs,
  getFirestoreDocument,
  getFirestoreData,
  listFirestoreDocuments,
  setFirestoreDocument,
  createFirestoreDocument,
  setFirestoreDocumentIfCurrent,
};
