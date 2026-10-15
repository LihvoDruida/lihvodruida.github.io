export class SnapshotCache<T>{
 private value?:{data:T;at:number};private pending?:Promise<{data:T;at:number}>;private retryAt=0;private failures=0;
 constructor(private ttl:number,private maxStale:number,private now=()=>Date.now()){}
 async get(load:()=>Promise<T>){
  if(this.value&&this.now()-this.value.at<this.ttl)return {...this.value,stale:false};
  if(this.now()<this.retryAt){if(this.value&&this.now()-this.value.at<this.maxStale)return {...this.value,stale:true};throw new Error('bridge_backoff');}
  if(!this.pending)this.pending=load().then(data=>{this.value={data,at:this.now()};this.failures=0;return this.value;}).catch(error=>{this.failures++;this.retryAt=this.now()+Math.min(60000,2000*2**Math.min(this.failures,5));throw error;}).finally(()=>{this.pending=undefined;});
  try{return {...await this.pending,stale:false};}catch(error){if(this.value&&this.now()-this.value.at<this.maxStale)return {...this.value,stale:true};throw error;}
 }
}
