export class SnapshotCache<T>{
 private value?:{data:T;at:number};private pending?:Promise<{data:T;at:number}>;private retryAt=0;private failures=0;private lastError:unknown;private generation=0;
 constructor(private ttl:number,private maxStale:number,private now=()=>Date.now()){}
 invalidate(){this.generation++;this.value=undefined;this.pending=undefined;this.retryAt=0;this.failures=0;this.lastError=undefined;}
 fallback(error:unknown):{data:T;at:number;stale:boolean}{if(this.value&&this.now()-this.value.at<this.maxStale)return {...this.value,stale:true};throw error;}
 async get(load:()=>Promise<T>):Promise<{data:T;at:number;stale:boolean}>{
  const generation=this.generation;
  if(this.value&&this.now()-this.value.at<this.ttl)return {...this.value,stale:false};
  if(this.now()<this.retryAt)return this.fallback(this.lastError||new Error('bridge_backoff'));
  if(!this.pending){
   const pending=Promise.resolve().then(load).then(data=>{const value={data,at:this.now()};if(generation===this.generation){this.value=value;this.failures=0;this.retryAt=0;this.lastError=undefined;}return value;}).catch(error=>{if(generation===this.generation){this.lastError=error;this.failures++;this.retryAt=this.now()+Math.min(60000,2000*2**Math.min(this.failures,5));}throw error;}).finally(()=>{if(this.pending===pending)this.pending=undefined;});
   this.pending=pending;
  }
  try{const value=await this.pending;if(generation!==this.generation)return this.get(load);return {...value,stale:false};}
  catch(error){if(generation!==this.generation)return this.get(load);return this.fallback(error);}
 }
}
