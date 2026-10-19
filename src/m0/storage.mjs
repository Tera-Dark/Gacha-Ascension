import {createM0Save,validateM0Save,M0_SAVE_KEY} from "./state.mjs";

const BACKUP_KEY=M0_SAVE_KEY+"-backup";
export function loadM0Save(storage=globalThis.localStorage) {
  if(!storage) return {state:createM0Save(),status:"memory"};
  let raw=storage.getItem(M0_SAVE_KEY);
  if(!raw)return {state:createM0Save(),status:"new"};
  try {
    const parsed=JSON.parse(raw);
    if(parsed && parsed.schemaVersion===1 && parsed.txSequence===undefined){
      // Early M0 experimental save: retain progress, archive old receipt IDs,
      // and move to bounded monotonically sequenced transactions.
      storage.setItem(BACKUP_KEY,raw);
      parsed.txSequence=0;
      parsed.receipts={};
      parsed.receiptOrder=[];
      validateM0Save(parsed);
      storage.setItem(M0_SAVE_KEY,JSON.stringify(parsed));
      return {state:parsed,status:"migrated"};
    }
    return {state:validateM0Save(parsed),status:"restored"};
  }catch(error){return {state:createM0Save(),status:"invalid",error:String(error)};}
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
