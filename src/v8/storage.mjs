import {SAVE_KEY,createSave,validateSave,migrateSave} from "./engine.mjs";
const BACKUP_KEY=SAVE_KEY+"-backup";
export function readGame(c,storage=globalThis.localStorage,{readOnly=false}={}){
 if(!storage)return {state:createSave(),status:"memory"};
 const raw=storage.getItem(SAVE_KEY);
 if(!raw)return {state:createSave(),status:"new"};
 try{
  const upgraded=migrateSave(JSON.parse(raw),c);
  if(upgraded.migrated&&!readOnly){
   const base=SAVE_KEY+"-schema"+JSON.parse(raw).schemaVersion+"-backup";let key=base,index=1;
   while(storage.getItem(key)!==null)key=base+"-"+index++;
   try{storage.setItem(key,raw);storage.setItem(SAVE_KEY,JSON.stringify(upgraded.state))}
   catch(error){return {state:upgraded.state,status:'blocked',message:'升级备份或保存失败：'+error.message,raw}}
   return {state:upgraded.state,status:"migrated",backupKey:key};
  }
  return {state:upgraded.state,status:"restored"};
 }
 catch(error){return {state:null,status:"invalid",message:error.message,raw}}
}
export function writeGame(s,c,storage=globalThis.localStorage){
 validateSave(s,c);
 if(storage)storage.setItem(SAVE_KEY,JSON.stringify(s));
}
export function parseImport(raw,c){
 if(typeof raw!=="string"||raw.length>2*1024*1024)throw Error("存档文件需小于2MB");
 const upgraded=migrateSave(JSON.parse(raw),c);validateSave(upgraded.state,c);
 return upgraded.state;
}
/** Validate first and back up exact current bytes before replacing the active slot. */
export function importGame(raw,c,storage=globalThis.localStorage){
 const state=parseImport(raw,c);
 if(!storage)throw Error("当前没有可用的浏览器存储");
 const old=storage.getItem(SAVE_KEY);let backupKey=null;
 if(old!==null){
  const base=SAVE_KEY+"-before-import";backupKey=base;let i=1;
  while(storage.getItem(backupKey)!==null)backupKey=base+"-"+i++;
  storage.setItem(backupKey,old);
 }
 if([8,9].includes(JSON.parse(raw).schemaVersion)){
  const base=SAVE_KEY+"-schema"+JSON.parse(raw).schemaVersion+"-import-backup";let key=base,i=1;
  while(storage.getItem(key)!==null)key=base+"-"+i++;
  storage.setItem(key,raw);
 }
 storage.setItem(SAVE_KEY,JSON.stringify(state));return {state,backupKey};
}
export function backupAndReset(c,storage=globalThis.localStorage){
 const old=storage?.getItem(SAVE_KEY);
 if(old)storage.setItem(BACKUP_KEY,old);
 const fresh=createSave();
 writeGame(fresh,c,storage);
 return fresh;
}
/** Explicit recovery only: preserve the original invalid raw bytes before starting fresh.
 * Never overwrite an existing backup and never silently reset a save on load.
 */
export function recoverInvalidSave(c,storage=globalThis.localStorage){
 if(!storage)throw Error("当前没有可用的浏览器存储");
 const raw=storage.getItem(SAVE_KEY);
 if(raw===null)throw Error("没有需要恢复的存档");
 try{validateSave(JSON.parse(raw),c)}
 catch{
  const base=SAVE_KEY+"-invalid-recovery";
  let key=base,index=1;
  while(storage.getItem(key)!==null)key=base+"-"+index++;
  // If backup storage is full, abort without touching the original save.
  storage.setItem(key,raw);
  const fresh=createSave();
  writeGame(fresh,c,storage);
  return {state:fresh,backupKey:key};
 }
 throw Error("当前存档可以正常读取，无需重置");
}
export {SAVE_KEY,BACKUP_KEY};
