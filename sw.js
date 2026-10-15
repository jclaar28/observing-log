/* Observing log service worker: keeps the app working offline. Bump VERSION when files change. */
const VERSION="observing-log-v11";
const SHELL=["./","index.html","local.js","jszip.min.js","ngc.js","names.js","ic.js","astronomy.js","sky.js","features.js","manifest.webmanifest","icon-192.png","icon-512.png","icon-maskable-512.png"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(VERSION).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==VERSION).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener("fetch",e=>{
  const req=e.request,url=new URL(req.url);
  if(req.method!=="GET")return;
  if(req.mode==="navigate"){ // newest page when online, cached copy when offline
    e.respondWith(fetch(req).then(r=>{const c=r.clone();caches.open(VERSION).then(x=>x.put("index.html",c));return r}).catch(()=>caches.match("index.html")));return;
  }
  if(url.origin===location.origin){e.respondWith(caches.match(req).then(hit=>hit||fetch(req)));return}
  if(/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)){ // fonts: cached copy first, refreshed in the background
    e.respondWith(caches.open(VERSION+"-fonts").then(c=>c.match(req).then(hit=>{const net=fetch(req).then(r=>{c.put(req,r.clone());return r}).catch(()=>hit);return hit||net})));
  }
});
