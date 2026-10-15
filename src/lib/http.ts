/** Enforce actual bytes even for chunked bodies without Content-Length. */
export async function boundedText(body:ReadableStream<Uint8Array>|null,maxBytes:number):Promise<string>{
 if(!body)throw new Error('empty_body');
 const reader=body.getReader();const chunks:Uint8Array[]=[];let size=0;
 try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>maxBytes)throw new Error('body_limit');chunks.push(value);}}
 finally{await reader.cancel().catch(()=>{});}
 return Buffer.concat(chunks).toString('utf8');
}
