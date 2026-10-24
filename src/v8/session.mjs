import {SAVE_KEY} from './storage.mjs';
/** Web Locks owns the whole session, including migration, import and reset.
 * Byte comparison also catches edits by older clients that ignore the lock. */
export async function openSession(storage=globalThis.localStorage,locks=globalThis.navigator?.locks){
 let owned=false,release=null,expected=storage.getItem(SAVE_KEY);
 if(locks)await new Promise((resolve,reject)=>{
  locks.request(SAVE_KEY+'-writer',{ifAvailable:true},async lock=>{
   if(!lock){resolve();return}
   owned=true;resolve();await new Promise(r=>{release=r});owned=false;
  }).catch(reject);
 });
 const assert=()=>{
  if(!owned)throw Error('此页面为只读：请关闭其他游戏页面，再接管存档');
  if(storage.getItem(SAVE_KEY)!==expected){owned=false;release?.();throw Error('存档已被其他页面修改，已停止保存；请重新载入')}
 };
 return {
  get writable(){return owned},
  assert,
  storage:{getItem:key=>storage.getItem(key),setItem:(key,value)=>{assert();storage.setItem(key,value);if(key===SAVE_KEY)expected=value}},
  close:()=>{owned=false;release?.()},
  supported:!!locks
 };
}
