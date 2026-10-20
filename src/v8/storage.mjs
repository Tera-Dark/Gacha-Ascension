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
export {SAVE_KEY,BACKUP_KEY};
