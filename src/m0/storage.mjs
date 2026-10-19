import {createM0Save,validateM0Save,M0_SAVE_KEY} from "./state.mjs";

const BACKUP_KEY=M0_SAVE_KEY+"-backup";
export function loadM0Save(storage=globalThis.localStorage) {
  if(!storage) return {state:createM0Save(),status:"memory"};
  let raw=storage.getItem(M0_SAVE_KEY);
  if(!raw)return {state:createM0Save(),status:"new"};
  try {return {state:validateM0Save(JSON.parse(raw)),status:"restored"};}
  catch(error){return {state:createM0Save(),status:"invalid",error:String(error)};}
}
export function saveM0Save(state,storage=globalThis.localStorage) {
  validateM0Save(state);
  if(!storage)throw Error("Local storage unavailable");
  storage.setItem(M0_SAVE_KEY,JSON.stringify(state));
  return true;
}
export function resetM0Save(storage=globalThis.localStorage,seed=123456789){
  if(!storage)throw Error("Local storage unavailable");
  const previous=storage.getItem(M0_SAVE_KEY);
  const fresh=createM0Save(seed);
  // Backup the previous M0 file; never touch the legacy v0.1 storage namespace.
  if(previous!==null) storage.setItem(BACKUP_KEY,previous);
  saveM0Save(fresh,storage);
  return fresh;
}
export {BACKUP_KEY};
