/* Observing log — on-device storage for the installable app.
   Observations and settings live in IndexedDB "docs"; photos in "blobs". */
(function(){
  "use strict";
  const OPEN=new Promise((ok,no)=>{
    const r=indexedDB.open("observing-log",1);
    r.onupgradeneeded=()=>{const d=r.result;if(!d.objectStoreNames.contains("docs"))d.createObjectStore("docs");if(!d.objectStoreNames.contains("blobs"))d.createObjectStore("blobs")};
    r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error);
  });
  const toErr=e=>e&&e.name==="QuotaExceededError"?{code:"quota_exceeded"}:{code:"storage_error",message:String(e&&e.message||e)};
  function req(store,mode,fn){
    return OPEN.then(d=>new Promise((ok,no)=>{
      let t;try{t=d.transaction(store,mode)}catch(e){no(toErr(e));return}
      const r=fn(t.objectStore(store));let v;
      if(r)r.onsuccess=()=>{v=r.result};
      t.oncomplete=()=>ok(v);
      const fail=()=>no(toErr(t.error||(r&&r.error)));t.onerror=fail;t.onabort=fail;
    }));
  }
  const rid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,10);
  function snap(col){
    return OPEN.then(d=>new Promise((ok,no)=>{
      const out=[],t=d.transaction("docs"),c=t.objectStore("docs").openCursor(IDBKeyRange.bound(col+"/",col+"/￿"));
      c.onsuccess=()=>{const cur=c.result;if(!cur)return;const id=cur.key.slice(col.length+1),v=cur.value;
        if(!id.includes("/"))out.push({id,exists:true,data:()=>v,metadata:{hasPendingWrites:false}});cur.continue()};
      t.oncomplete=()=>ok({docs:out});t.onerror=()=>no(toErr(t.error));
    }));
  }
  const subs={};
  function notify(path){const col=path.slice(0,path.lastIndexOf("/"));for(const s of subs[col]||[])snap(col).then(s.cb,s.err)}
  function docRef(path){
    return{id:path.split("/").pop(),
      async set(v){await req("docs","readwrite",s=>s.put(JSON.parse(JSON.stringify(v)),path));notify(path)},
      async delete(){await req("docs","readwrite",s=>s.delete(path));notify(path)},
      async get(){const v=await req("docs","readonly",s=>s.get(path));return{id:path.split("/").pop(),exists:v!==undefined,data:()=>v}}};
  }
  const db={doc:docRef,collection:col=>({
    doc:id=>docRef(col+"/"+id),
    async add(v){const r=docRef(col+"/"+rid());await r.set(v);return r},
    onSnapshot(cb,err){const s={cb,err:err||(()=>{})};(subs[col]=subs[col]||[]).push(s);snap(col).then(cb,s.err);return()=>{subs[col]=subs[col].filter(x=>x!==s)}}
  })};
  const URLS=new Map();
  const track=(id,b)=>{const old=URLS.get(id);if(old)URL.revokeObjectURL(old);URLS.set(id,URL.createObjectURL(b))};
  const assets={
    async upload(b){const id=rid();await req("blobs","readwrite",s=>s.put(b,id));track(id,b);return{id,url:URLS.get(id),sizeBytes:b.size,contentType:b.type}},
    async delete(id){await req("blobs","readwrite",s=>s.delete(id));const u=URLS.get(id);if(u){URL.revokeObjectURL(u);URLS.delete(id)}}
  };
  const ready=(async()=>{
    try{if(navigator.storage&&navigator.storage.persist)await navigator.storage.persist()}catch(e){}
    await OPEN.then(d=>new Promise(ok=>{const t=d.transaction("blobs"),c=t.objectStore("blobs").openCursor();
      c.onsuccess=()=>{const cur=c.result;if(cur){track(cur.key,cur.value);cur.continue()}};t.oncomplete=ok;t.onerror=ok}));
  })();
  window.APP_USE=n=>ready.then(()=>n==="db"?db:n==="assets"?assets:null);
  window.APP_BLOB=id=>URLS.get(id)||"";
  window.APP_PLAT={
    app:true,zipUrl:"jszip.min.js",
    getBlob:id=>req("blobs","readonly",s=>s.get(id)).then(v=>v||null),
    hasBlob:id=>URLS.has(id),
    async putBlob(id,b){await req("blobs","readwrite",s=>s.put(b,id));track(id,b)},
    async saveFile(name,data){
      const file=new File([data],name,{type:"application/zip"});
      if(navigator.canShare&&navigator.canShare({files:[file]})&&confirm("Share the backup (for example to Google Drive)? Choose Cancel to save it to Downloads instead.")){
        try{await navigator.share({files:[file],title:name});return}catch(e){if(e&&e.name==="AbortError")throw{code:"declined"}}
      }
      const a=document.createElement("a");a.href=URL.createObjectURL(file);a.download=name;document.body.appendChild(a);a.click();a.remove();
      setTimeout(()=>URL.revokeObjectURL(a.href),60000);
    }
  };
})();
