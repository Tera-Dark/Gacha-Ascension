import {SAVE_KEY,createSave,validateSave} from "./engine.mjs";
const BACKUP_KEY=SAVE_KEY+"-backup";
export function readGame(c,storage=globalThis.localStorage){
 if(!storage)return {state:createSave(),status:"memory"};
 const raw=storage.getItem(SAVE_KEY);
 if(!raw)return {state:createSave(),status:"new"};
 try{return {state:validateSave(JSON.parse(raw),c),status:"restored"}}
 catch(error){return {state:null,status:"invalid",message:error.message,raw}}
}
export function writeGame(s,c,storage=globalThis.localStorage){
 validateSave(s,c);
 if(storage)storage.setItem(SAVE_KEY,JSON.stringify(s));
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
