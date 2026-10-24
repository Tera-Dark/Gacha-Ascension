/** Cancellation and failure leave persistent and in-memory progress untouched. */
export function restoreInWorker(state,catalog,now,{signal}={}){
 return new Promise((resolve,reject)=>{
  if(signal?.aborted){reject(Error('恢复已取消，原存档保留'));return}
  const worker=new Worker(new URL('./restore-worker.mjs',import.meta.url),{type:'module'});
  let timeout;
  const abort=()=>finish(Error('恢复已取消，原存档保留'));
  const finish=(error,value)=>{clearTimeout(timeout);signal?.removeEventListener('abort',abort);worker.terminate();error?reject(error):resolve(value)};
  worker.onmessage=e=>e.data.ok?finish(null,e.data.out):finish(Error(e.data.error));
  worker.onerror=()=>finish(Error('后台恢复失败，原存档保留，请重试'));
  signal?.addEventListener('abort',abort,{once:true});
  timeout=setTimeout(()=>finish(Error('恢复超时，原存档保留，请重试')),120000);
  worker.postMessage({state,catalog,now});
 });
}
