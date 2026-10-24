import {dispatch,validateSave} from './engine.mjs';
/** One immutable end time, one reducer call, one 24-hour cap. No storage in worker. */
export function restoreSession(state,catalog,now){
 validateSave(state,catalog);
 return dispatch(state,catalog,{type:'RESTORE_SESSION',seq:state.seq+1,now});
}
if(typeof WorkerGlobalScope!=='undefined'&&globalThis instanceof WorkerGlobalScope){
 globalThis.onmessage=event=>{
  try{globalThis.postMessage({ok:true,out:restoreSession(event.data.state,event.data.catalog,event.data.now)})}
  catch(error){globalThis.postMessage({ok:false,error:error.message})}
 };
}
