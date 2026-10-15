/* Observing log: planning, sky view, framing, horizons, sessions and photo auto-fill.
   Loaded before the main script; everything here runs only when called from it. */
"use strict";

/* ---------- horizon and coordinates ---------- */
const HZ_DIRS=["N","NE","E","SE","S","SW","W","NW"];
function hzOn(){return!!(S.set.hz&&S.set.hz.some(x=>x>0))}
function hzAlt(az){const h=S.set.hz;if(!h)return 0;const p=(((az%360)+360)%360)/45,i=Math.floor(p)%8,t=p-Math.floor(p);return h[i]*(1-t)+h[(i+1)%8]*t}
function limitAt(az){return Math.max(S.set.minAlt||0,hzAlt(az))}
function azOf(ra,dec,lst,lat){const h=(lst-ra)*15*RAD,d=dec*RAD,f=lat*RAD;return((Math.atan2(-Math.cos(d)*Math.sin(h),Math.sin(d)*Math.cos(f)-Math.cos(d)*Math.cos(h)*Math.sin(f))/RAD)+360)%360}
function lstAt(t,lon){const d=jd(t)-2451545;return(((18.697374558+24.06570982441908*d+lon/15)%24)+24)%24}
function angSep(r1,d1,r2,d2){const a=r1*15*RAD,b=r2*15*RAD,c=d1*RAD,e=d2*RAD;return Math.acos(Math.max(-1,Math.min(1,Math.sin(c)*Math.sin(e)+Math.cos(c)*Math.cos(e)*Math.cos(a-b))))/RAD}
function obsLoc(){return{lat:S.set.lat,lon:S.set.lon==null?defLon():S.set.lon}}
function posAt(o,t){if(o.ss&&window.Astronomy){try{const e=Astronomy.EquatorFromVector(Astronomy.GeoVector(o.body,new Date(t),true));return{ra:e.ra,dec:e.dec}}catch(e){}}return{ra:o.ra,dec:o.dec}}
const pad2=n=>String(n).padStart(2,"0");
const dstr=d=>d.getFullYear()+"-"+pad2(d.getMonth()+1)+"-"+pad2(d.getDate());
function tonightStr(){const d=new Date(Date.now()-12*3600e3);return dstr(d)}

/* ---------- one night at the observing site ---------- */
const NCACHE={};
function nightAt(ds){
  const L=obsLoc();if(L.lat==null||!ds)return null;
  const id=[ds,L.lat,L.lon,S.set.minAlt,(S.set.hz||[]).join(":")].join("|");if(NCACHE[id])return NCACHE[id];
  const p=ds.split("-"),base=new Date(+p[0],p[1]-1,+p[2],12,0,0,0).getTime(),A=window.Astronomy,smp=[];
  for(let i=0;i<=144;i++){const t=base+i*600e3,lst=lstAt(t,L.lon),sp=sunPos(jd(t)-2451545);let m={ra:0,dec:-90};
    if(A){try{const e=A.EquatorFromVector(A.GeoVector("Moon",new Date(t),true));m={ra:e.ra,dec:e.dec}}catch(e){}}
    smp.push({t,lst,sun:altOf(sp.ra,sp.dec,lst,L.lat),m,moon:altOf(m.ra,m.dec,lst,L.lat)})}
  const darkAlt=smp.some(x=>x.sun<-18)?-18:smp.some(x=>x.sun<-12)?-12:-6;
  const N={id,ds,base,mid:base+12*3600e3,lat:L.lat,lon:L.lon,smp,darkAlt,obj:{},ev:{}};
  if(A){try{const ob=new A.Observer(L.lat,L.lon,0),b=new Date(base),q=f=>{try{const r=f();return r?r.date.getTime():null}catch(e){return null}};
    N.ev.sunset=q(()=>A.SearchRiseSet("Sun",ob,-1,b,1));N.ev.sunrise=q(()=>A.SearchRiseSet("Sun",ob,+1,new Date(N.ev.sunset||base),1));
    N.ev.dusk=q(()=>A.SearchAltitude("Sun",ob,-1,b,1,-18));N.ev.dawn=q(()=>A.SearchAltitude("Sun",ob,+1,new Date(N.ev.dusk||N.ev.sunset||base),1,-18));
    N.ev.moonrise=q(()=>A.SearchRiseSet("Moon",ob,+1,b,1));N.ev.moonset=q(()=>A.SearchRiseSet("Moon",ob,-1,b,1));
    N.moonLit=A.Illumination("Moon",new Date(N.mid)).phase_fraction}catch(e){}}
  N.moonless=smp.filter(x=>x.sun<-18&&x.moon<0).length*10;
  N.darkMin=smp.filter(x=>x.sun<-18).length*10;
  return NCACHE[id]=N}
function objNight(o,N){
  if(!N||o.lunar)return null;if(N.obj[o.key])return N.obj[o.key];
  const P=posAt(o,N.mid),alts=[];let peak=-90,pt=N.mid,up=0,first=null,last=null;
  for(const x of N.smp){const a=altOf(P.ra,P.dec,x.lst,N.lat);alts.push(a);if(x.sun<N.darkAlt){if(a>peak){peak=a;pt=x.t}if(a>limitAt(azOf(P.ra,P.dec,x.lst,N.lat))){up+=10;if(first==null)first=x.t;last=x.t}}}
  const ms=N.smp.reduce((b,x)=>Math.abs(x.t-pt)<Math.abs(b.t-pt)?x:b,N.smp[0]);
  return N.obj[o.key]={alts,peak,pt,up,first,last,sep:angSep(P.ra,P.dec,ms.m.ra,ms.m.dec),moonUp:ms.moon>0,ra:P.ra,dec:P.dec}}
function moonText(o){
  if(o.lunar||(o.ss&&o.body==="Moon"&&o.lab==="Moon"))return"";const N=nightAt(tonightStr());if(!N)return"";const r=objNight(o,N);if(!r)return"";
  const lit=N.moonLit!=null?Math.round(N.moonLit*100)+"% lit":"";
  return`${Math.round(r.sep)}° away, ${lit}${r.moonUp?"":", below the horizon at its best"}`}
function moonWarn(r,N){return r&&r.moonUp&&(N.moonLit||0)>.4&&r.sep<35}

/* ---------- optics and framing ---------- */
function gearByName(n){return S.gear.find(g=>g.name===n)}
function rigOptics(r){
  let fl=0,fac=1,cam=null;for(const n of rigItems(r)){const g=gearByName(n);if(!g)continue;
    if(g.type==="Telescope"&&g.fl)fl=g.fl;if((g.type==="Reducer or flattener"||g.type==="Barlow")&&g.fac)fac*=g.fac;if(g.type==="Camera"&&g.sw&&g.sh)cam=g}
  if(!fl||!cam)return null;const f=fl*fac;
  return{fl:f,w:2*Math.atan(cam.sw/2/f)/RAD,h:2*Math.atan(cam.sh/2/f)/RAD,scale:cam.px?206.265*cam.px/f:null}}
function sizeOf(o){
  const keys=[o.key].concat(EQ[o.key]||[]);let s="";for(const k of keys){if(INFO[k]&&INFO[k].size){s=INFO[k].size;break}}if(!s)s=o.size||"";
  const n=(s.match(/[\d.]+/g)||[]).map(Number);if(!n.length)return null;return[n[0]/60,(n[1]||n[0])/60]}
const fmtDeg=d=>d>=1?d.toFixed(1)+"°":Math.round(d*60)+"'";
function framingHTML(o){
  if(o.ss||o.lunar)return"";
  const rigs=S.rigs.map(r=>({r,op:rigOptics(r)})).filter(x=>x.op);
  if(!rigs.length)return`<section class="framing" id="framingBox"><h4>Framing</h4><p class="ihint">To see how this object fits your camera, add a focal length to a telescope and a sensor size to a camera in Settings, then save them together as a rig.</p></section>`;
  let cur=rigs.find(x=>x.r.name===S.frameRig)||rigs[0];S.frameRig=cur.r.name;const op=cur.op,sz=sizeOf(o)||[0,0];
  const ow=sz[0],oh=sz[1];
  const panels=(a,b)=>Math.max(1,Math.ceil(a*1.1/(op.w*.9)))*Math.max(1,Math.ceil(b*1.1/(op.h*.9)));
  const p0=[Math.max(1,Math.ceil(ow*1.1/(op.w*.9))),Math.max(1,Math.ceil(oh*1.1/(op.h*.9)))],p1=[Math.max(1,Math.ceil(oh*1.1/(op.w*.9))),Math.max(1,Math.ceil(ow*1.1/(op.h*.9)))];
  const best=p0[0]*p0[1]<=p1[0]*p1[1]?p0:p1;S.frameMosaic=best;
  const fov=Math.min(30,Math.max(.25,Math.max(op.w*best[0],op.h*best[1],ow,oh,op.w)*1.45));S.frameFov=fov;
  const url=`https://alasky.cds.unistra.fr/hips-image-services/hips2fits?hips=${encodeURIComponent("CDS/P/DSS2/color")}&width=640&height=640&fov=${fov.toFixed(3)}&projection=TAN&coordsys=icrs&ra=${(o.ra*15).toFixed(5)}&dec=${o.dec.toFixed(5)}&format=jpg`;
  const txt=`Field ${fmtDeg(op.w)} × ${fmtDeg(op.h)} at ${Math.round(op.fl)} mm${op.scale?`, ${op.scale.toFixed(2)}"/pixel`:""}. `+(ow?`Object about ${fmtDeg(ow)} × ${fmtDeg(oh)}. `+(best[0]*best[1]===1?"Fits in one frame.":`Needs a ${best[0]} × ${best[1]} mosaic.`):"");
  return`<section class="framing" id="framingBox"><h4>Framing</h4>
    <div class="ftools"><label>Rig <select id="frameRig">${rigs.map(x=>`<option${x===cur?" selected":""}>${esc(x.r.name)}</option>`).join("")}</select></label>
    <label>Rotation <input type="range" id="frameRot" min="0" max="180" step="5" value="${S.frameRot||0}"> <span id="frameRotV">${S.frameRot||0}°</span></label></div>
    <p class="ihint">${esc(txt)}</p>
    <figure class="fframe"><img alt="Sky survey image around ${esc(dn(o))}" src="${url}" onerror="this.parentNode.classList.add('noimg')"><svg viewBox="0 0 100 100" id="frameOv" aria-hidden="true">${frameOverlay()}</svg><span class="noimgmsg">The sky image needs an internet connection.</span></figure>
    <p class="ihint">Sky image: DSS2 colour survey via the CDS hips2fits service. North is up, east is left.</p></section>`}
function frameOverlay(){
  const r=S.rigs.find(x=>x.name===S.frameRig),op=r&&rigOptics(r);if(!op)return"";const fov=S.frameFov,m=S.frameMosaic||[1,1],rot=S.frameRot||0;
  const w=op.w/fov*100,h=op.h/fov*100,sx=w*.9,sy=h*.9,tw=sx*(m[0]-1)+w,th=sy*(m[1]-1)+h;let s="";
  for(let i=0;i<m[0];i++)for(let j=0;j<m[1];j++)s+=`<rect class="fr" x="${(50-tw/2+i*sx).toFixed(2)}" y="${(50-th/2+j*sy).toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}"/>`;
  const o=BYKEY[S.detail],sz=o&&sizeOf(o);const el=sz?`<ellipse class="fobj" cx="50" cy="50" rx="${(sz[0]/fov*50).toFixed(2)}" ry="${(sz[1]/fov*50).toFixed(2)}"/>`:"";
  return el+`<g transform="rotate(${rot} 50 50)">${s}</g>`}

/* ---------- planning page ---------- */
function planSources(){
  const o=[["plan","Planned objects"]];
  for(const c of CURATED)o.push(["cur:"+c.id,c.name]);for(const l of S.lists)o.push(["my:"+l.id,l.name]);
  for(const k of Object.keys(CATS))if(k!=="L")o.push([k,CATS[k].name]);return o}
function planRows(src){
  if(src==="plan")return Object.keys(S.plan).map(k=>BYKEY[k]).filter(Boolean);
  const v=S.view;S.view=src;const c=curList();S.view=v;if(!c)return[];
  return c.big?c.rows.filter(o=>o.mag!=null&&o.mag<=11):c.rows}
function fmtT(t){return t?fmtTime(t):"–"}
function renderPlan(){
  const el=$("planView");
  if(S.set.lat==null){el.innerHTML=`<h2>Plan a night</h2><p class="empty">Set your latitude in Settings to plan a night. Longitude makes the times more accurate.</p>`;return}
  if(!S.pDate)S.pDate=tonightStr();if(!S.pSrc)S.pSrc=Object.keys(S.plan).length?"plan":"cur:astro-top";
  const N=nightAt(S.pDate);
  if(!el.dataset.built){el.dataset.built="1";el.innerHTML=`<div class="phead"><h2>Plan a night</h2>
    <div class="acts"><input type="date" id="pDate" aria-label="Night of"><button class="btn" data-act="pToday">Tonight</button>${S.canWrite?'<button class="btn primary" data-act="sessStart">Start session</button>':""}</div></div>
    <div class="nights" id="pNights"></div><dl class="facts" id="pFacts"></dl>
    <div class="tools"><select id="pSrc" aria-label="Objects to plan from"></select><span class="xf" id="pFilters"></span><label class="check"><input type="checkbox" id="pWell" checked> Only objects up for an hour or more in darkness</label></div>
    <div class="chartbox"><svg id="pChart" viewBox="0 0 960 320" role="img"></svg></div>
    <div id="pRows"></div>
    <h2 class="skyh">Sky view</h2>
    <div class="tools"><input type="range" id="skyT" min="0" max="144" step="1" aria-label="Time"><span id="skyTl"></span><label class="check"><input type="checkbox" id="skyLines" checked> Constellation lines</label></div>
    <div class="skybox"><svg id="skySvg" viewBox="0 0 640 640" role="img" aria-label="All-sky view"></svg></div>
    <p class="ihint">Looking straight up: north at the top, east on the left. Tap an object to open it.</p>`}
  $("pDate").value=S.pDate;
  $("pSrc").innerHTML=planSources().map(([v,n])=>`<option value="${esc(v)}"${v===S.pSrc?" selected":""}>${esc(n)}${v==="plan"?` (${Object.keys(S.plan).length})`:""}</option>`).join("");
  // seven nights
  let nh="";const t0=new Date(Date.now()-12*3600e3);
  for(let i=0;i<7;i++){const d=new Date(t0);d.setDate(d.getDate()+i);const ds=dstr(d),M=nightAt(ds);
    nh+=`<button data-act="pNight" data-d="${ds}" aria-pressed="${ds===S.pDate}"><b>${d.toLocaleDateString(undefined,{weekday:"short",day:"numeric"})}</b><span>${M&&M.moonLit!=null?Math.round(M.moonLit*100)+"% moon":""}</span><span>${M?fmtDur(M.moonless*60)+" moonless":""}</span></button>`}
  $("pNights").innerHTML=nh;
  const ev=N.ev,f=[["Sunset",fmtT(ev.sunset)],["Dark",ev.dusk?fmtT(ev.dusk)+" – "+fmtT(ev.dawn):"No full darkness"],["Sunrise",fmtT(ev.sunrise)],
    ["Moon",moonLine(N)],["Moonless darkness",N.moonless?fmtDur(N.moonless*60):"None"]];
  $("pFacts").innerHTML=f.map(r=>`<div><dt>${r[0]}</dt><dd>${esc(r[1])}</dd></div>`).join("");
  // rows
  const g=grouped(true),sess=S.session&&S.session.active?S.session:null;
  const src=planRows(S.pSrc);$("pFilters").innerHTML=filterHTML(true,src);
  let rows=src.filter(o=>extraFilter(o,true)).map(o=>({o,r:objNight(o,N)})).filter(x=>x.r);
  if($("pWell").checked)rows=rows.filter(x=>x.r.up>=60);
  if(planRowsBig())rows=rows.sort((a,b)=>b.r.up-a.r.up||(a.o.mag||99)-(b.o.mag||99)).slice(0,60);
  rows.sort((a,b)=>a.r.pt-b.r.pt);
  if(!S.pChart||S.pChartSrc!==S.pSrc+S.pDate+filterSig()){S.pChart=new Set(rows.slice(0,6).map(x=>x.o.key));S.pChartSrc=S.pSrc+S.pDate+filterSig()}
  $("pRows").innerHTML=rows.length?rows.map(({o,r})=>{const w=moonWarn(r,N),done=g[o.key],inS=sess&&(g[o.key]||[]).some(e=>e.session===sess.id);
    return`<div class="prow${done?" seen":""}"><button class="pname" data-act="open" data-key="${esc(o.key)}">${esc(dn(o))}${o.name?` <small>${esc(o.name)}</small>`:""}</button>
      <span class="pmeta">${esc(o.tlong||TYPES[o.type][0])}${done?", observed":""}${inS?", logged this session":""}</span>
      <span>Best ${fmtT(r.pt)} at ${Math.round(r.peak)}°</span>
      <span>${r.up?`Up ${fmtT(r.first)} – ${fmtT(r.last)} (${fmtDur(r.up*60)})`:"Not above your horizon in darkness"}</span>
      <span class="${w?"warn":""}">Moon ${Math.round(r.sep)}° away${w?", bright and close":""}</span>
      <button class="btn quiet" data-act="pChartT" data-key="${esc(o.key)}" aria-pressed="${S.pChart.has(o.key)}">On chart</button></div>`}).join("")
    :`<p class="empty">No objects from this list are well placed that night. Try another list or turn off the filter.</p>`;
  drawPlanChart(N,rows.filter(x=>S.pChart.has(x.o.key)));
  // sky view slider
  const sl=$("skyT"),i0=N.smp.findIndex(x=>x.sun<-12),i1=N.smp.length-1-[...N.smp].reverse().findIndex(x=>x.sun<-12);
  sl.min=Math.max(0,i0-6);sl.max=Math.min(144,i1+6);
  if(S.skyIdx==null||S.skyDate!==S.pDate){const now=Date.now(),k=N.smp.findIndex(x=>x.t>=now);S.skyIdx=k>=+sl.min&&k<=+sl.max?k:Math.min(+sl.max,Math.max(+sl.min,60));S.skyDate=S.pDate}
  sl.value=S.skyIdx;S.planRowsCache=rows;drawSky(N)}
function moonLine(N){const ev=N.ev,end=N.base+86400e3,inN=t=>t&&t>N.base&&t<end,parts=[];
  if(N.moonLit!=null)parts.push(Math.round(N.moonLit*100)+"% lit");
  const evs=[["rises",ev.moonrise],["sets",ev.moonset]].filter(x=>inN(x[1])).sort((a,b)=>a[1]-b[1]);
  if(evs.length)parts.push(evs.map(x=>x[0]+" "+fmtTime(x[1])).join(", "));else{const m=N.smp[72];parts.push(m.moon>0?"up all night":"down all night")}
  return parts.join(", ")}
function planRowsBig(){const v=S.pSrc;return v==="N"||v==="I"}
function drawPlanChart(N,rows){
  const W=960,H=320,L=40,R=16,T=12,B=30,smp=N.smp,i0=Math.max(0,smp.findIndex(x=>x.sun<0)-3),i1=Math.min(144,smp.length-[...smp].reverse().findIndex(x=>x.sun<0)+2);
  const t0=smp[i0].t,t1=smp[i1].t,x=t=>L+(t-t0)/(t1-t0)*(W-L-R),y=a=>T+(90-Math.max(0,Math.min(90,a)))/90*(H-T-B);
  let s="";
  for(let i=i0;i<i1;i++){const z=smp[i].sun,c=z<-18?"pdark":z<-12?"pnaut":z<-6?"pcivil":"";if(c)s+=`<rect class="${c}" x="${x(smp[i].t).toFixed(1)}" y="${T}" width="${(x(smp[i+1].t)-x(smp[i].t)+.5).toFixed(1)}" height="${H-T-B}"/>`}
  for(const a of[0,30,60,90])s+=`<line class="grid" x1="${L}" x2="${W-R}" y1="${y(a)}" y2="${y(a)}"/><text x="${L-6}" y="${y(a)+4}" text-anchor="end">${a}°</text>`;
  if(S.set.minAlt)s+=`<line class="plim" x1="${L}" x2="${W-R}" y1="${y(S.set.minAlt)}" y2="${y(S.set.minAlt)}"/>`;
  for(let i=i0;i<=i1;i+=6){const d=new Date(smp[i].t);if(d.getMinutes()===0)s+=`<text x="${x(smp[i].t)}" y="${H-10}" text-anchor="middle">${d.toLocaleTimeString(undefined,{hour:"numeric"})}</text>`}
  const line=(arr,cls)=>{let d="",pen=false;for(let i=i0;i<=i1;i++){const a=arr[i];if(a>-2){d+=(pen?"L":"M")+x(smp[i].t).toFixed(1)+" "+y(a).toFixed(1);pen=true}else pen=false}return d?`<path class="${cls}" d="${d}"/>`:""};
  s+=line(smp.map(z=>z.moon),"pmoon");
  const placed=[];
  for(const{o,r}of rows){s+=line(r.alts,"pline");if(r.peak<=0)continue;const lx=x(r.pt),w=dn(o).length*6.5+6;let ly=y(r.peak)-6;
    for(let k=0;k<8&&placed.some(p=>Math.abs(p[0]-lx)<(p[2]+w)/2&&Math.abs(p[1]-ly)<13);k++)ly+=k%2?-26*((k+1)/2):13*(k+1);
    placed.push([lx,ly,w]);s+=`<text class="plab" x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="middle">${esc(dn(o))}</text>`}
  const now=Date.now();if(now>t0&&now<t1)s+=`<line class="pnow" x1="${x(now)}" x2="${x(now)}" y1="${T}" y2="${H-B}"/>`;
  $("pChart").innerHTML=s;$("pChart").setAttribute("aria-label",`Altitude through the night for ${rows.length} objects, with the Moon dashed`)}

/* ---------- sky view ---------- */
let SKY=null;
function skyData(){if(SKY)return SKY;const st=(window.SKY_STARS||"").split(";").map(x=>x.split(",").map(Number)).filter(a=>a.length===3);
  const ln=(window.SKY_LINES||"").split(";").map(s=>s.split(" ").map(p=>p.split(",").map(Number)));
  const nm=(window.SKY_NAMES||"").split(";").map(x=>{const p=x.split(",");return[+p[0],+p[1],p.slice(2).join(",")]});
  const lb=(window.SKY_LABELS||"").split(";").map(x=>{const p=x.split(",");return[+p[0],+p[1],p.slice(2).join(",")]});
  return SKY={st,ln,nm,lb}}
function drawSky(N){
  const idx=S.skyIdx,x0=N.smp[idx];if(!x0)return;$("skyTl").textContent=fmtTime(x0.t)+(x0.sun>-6?", twilight":x0.sun>-18?", partial darkness":"");
  const W=640,cx=320,cy=320,R=290,lat=N.lat,lst=x0.lst,D=skyData(),lines=$("skyLines").checked;
  const P=(ra,dec)=>{const a=altOf(ra,dec,lst,lat),z=azOf(ra,dec,lst,lat),r=R*(90-a)/90;return{a,x:cx-r*Math.sin(z*RAD),y:cy-r*Math.cos(z*RAD)}};
  let s=`<circle class="skybg" cx="${cx}" cy="${cy}" r="${R}"/>`;
  for(const a of[30,60])s+=`<circle class="skyring" cx="${cx}" cy="${cy}" r="${R*(90-a)/90}"/>`;
  if(hzOn()){let d="";for(let z=0;z<=360;z+=5){const r=R*(90-hzAlt(z))/90;d+=(z?"L":"M")+(cx-r*Math.sin(z*RAD)).toFixed(1)+" "+(cy-r*Math.cos(z*RAD)).toFixed(1)}
    s+=`<path class="skyground" fill-rule="evenodd" d="M${cx-R} ${cy}A${R} ${R} 0 1 0 ${cx+R} ${cy}A${R} ${R} 0 1 0 ${cx-R} ${cy}Z${d}Z"/>`}
  if(lines)for(const seg of D.ln){let d="",pen=false;for(const p of seg){const q=P(p[0],p[1]);if(q.a>-3){d+=(pen?"L":"M")+q.x.toFixed(1)+" "+q.y.toFixed(1);pen=true}else pen=false}if(d)s+=`<path class="skyline" d="${d}"/>`}
  for(const t of D.st){const q=P(t[0],t[1]);if(q.a<0)continue;s+=`<circle class="skystar" cx="${q.x.toFixed(1)}" cy="${q.y.toFixed(1)}" r="${Math.max(.55,2.9-.42*t[2]).toFixed(2)}"/>`}
  if(lines)for(const t of D.lb){const q=P(t[0],t[1]);if(q.a>8)s+=`<text class="skycon" x="${q.x.toFixed(1)}" y="${q.y.toFixed(1)}" text-anchor="middle">${esc(t[2])}</text>`}
  for(const t of D.nm){const q=P(t[0],t[1]);if(q.a>4)s+=`<text class="skyname" x="${(q.x+4).toFixed(1)}" y="${(q.y-3).toFixed(1)}">${esc(t[2])}</text>`}
  const g=grouped(true),shown=new Set();
  for(const o of(S.planRowsCache||[]).map(x=>x.o).concat(Object.keys(S.plan).map(k=>BYKEY[k]).filter(Boolean))){if(shown.has(o.key)||o.ss||o.lunar)continue;shown.add(o.key);const q=P(o.ra,o.dec);if(q.a<0)continue;
    s+=`<g class="o${g[o.key]?" seen":S.plan[o.key]?" plan":""}" data-act="open" data-key="${esc(o.key)}" transform="translate(${q.x.toFixed(1)} ${q.y.toFixed(1)})"><title>${esc(dn(o)+(o.name?" "+o.name:""))}</title><circle r="10" fill="transparent"/>${sym(o.type)}<text class="skyobj" x="8" y="-6">${esc(dn(o))}</text></g>`}
  if(CATS.S)for(const o of CATS.S.rows){if(o.body!==o.lab||o.lab==="Sun"&&x0.sun<0)continue;const p=posAt(o,x0.t),q=P(p.ra,p.dec);if(q.a<0)continue;
    s+=`<g class="splan" data-act="open" data-key="${o.key}" transform="translate(${q.x.toFixed(1)} ${q.y.toFixed(1)})"><circle r="${o.lab==="Moon"?8:4.5}"/><text x="9" y="4">${esc(o.lab)}</text></g>`}
  for(const[l,z]of[["N",0],["E",90],["S",180],["W",270]]){const r=R+16;s+=`<text class="skycard" x="${(cx-r*Math.sin(z*RAD)).toFixed(1)}" y="${(cy-r*Math.cos(z*RAD)+5).toFixed(1)}" text-anchor="middle">${l}</text>`}
  $("skySvg").innerHTML=s}

/* ---------- sessions ---------- */
function sessActive(){return S.session&&S.session.active?S.session:null}
function renderSessBar(){
  const el=$("sessBar"),ss=sessActive();el.hidden=!ss||!S.canWrite;if(el.hidden)return;
  const g=grouped(true),n=S.obs.filter(o=>o.session===ss.id).length,next=(ss.plan||[]).find(k=>BYKEY[k]&&!(g[k]||[]).some(e=>e.session===ss.id));
  el.innerHTML=`<span><b>Session</b> ${esc(fmtDate(ss.date))}${ss.site?" at "+esc(ss.site):""}, ${n} logged${next?`. Next: <button class="linkish" data-act="open" data-key="${esc(next)}">${esc(dn(BYKEY[next]))}</button>`:""}</span>
    <span class="acts" style="margin:0"><button class="btn" data-act="new">Log observation</button><button class="btn quiet" data-act="sessEdit">Edit</button><button class="btn quiet" data-act="sessEnd">End session</button></span>`}
function openSess(edit){
  const ss=edit?sessActive():null,v=(id,x)=>{$(id).value=x==null?"":x};
  $("sessTitle").textContent=ss?"Edit session":"Start a session";
  v("sDate2",ss?ss.date:(S.view==="plan"&&S.pDate)||tonightStr());v("sSite2",ss?ss.site:(S.obs[0]&&S.obs.slice().sort((a,b)=>(b.created||0)-(a.created||0))[0].site)||"");
  $("sRig2").innerHTML='<option value="">No saved rig</option>'+S.rigs.map(r=>`<option>${esc(r.name)}</option>`).join("");v("sRig2",ss?ss.rig:"");
  v("sKind2",ss?ss.kind:"imaged");v("sBortle2",ss?ss.bortle:"");v("sSqm2",ss?ss.sqm:"");v("sSee2",ss?ss.seeing:"");v("sTra2",ss?ss.transp:"");v("sNotes2",ss?ss.notes:"");
  $("sessPlan").hidden=!!ss||S.view!=="plan";$("sessPlanTxt").textContent=S.view==="plan"&&S.planRowsCache?`Use the ${S.planRowsCache.length} objects on this plan as the session's checklist`:"";
  $("sessDlg").showModal()}
async function saveSess(e){
  e.preventDefault();const old=sessActive(),site=$("sSite2").value.trim(),st=S.sites.find(x=>x.name===site),rig=$("sRig2").value,r=S.rigs.find(x=>x.name===rig);
  const ss=Object.assign({},old||{id:newId(),started:Date.now(),plan:$("sessUsePlan").checked&&S.view==="plan"?(S.planRowsCache||[]).map(x=>x.o.key):[]},{active:true,date:$("sDate2").value||tonightStr(),site,rig,items:r?rigItems(r):[],kind:$("sKind2").value,
    bortle:+$("sBortle2").value||(st&&st.bortle)||null,sqm:parseFloat($("sSqm2").value)||null,seeing:+$("sSee2").value||null,transp:+$("sTra2").value||null,notes:$("sNotes2").value.trim()});
  S.session=ss;putDoc("session",ss);$("sessDlg").close();render();toast(old?"Session updated.":"Session started. New observations use these details.")}
async function quickLog(key){
  const ss=sessActive();if(!ss||!db)return;
  const body={targets:[{key,label:labelOf(key)}],date:ss.date,kind:ss.kind||"imaged",site:ss.site||"",gear:"",rig:ss.rig||"",items:ss.items||[],subs:null,subLen:null,filter:"",bortle:ss.bortle||null,sqm:ss.sqm||null,seeing:ss.seeing||null,transp:ss.transp||null,exposure:"",notes:"",photos:[],created:Date.now(),session:ss.id};
  try{await db.collection("observations").add(body);toast(`Logged ${labelOf(key)}. Edit it later to add photos or notes.`)}catch(e){toast(explain(e))}}

/* ---------- photo and FITS auto-fill ---------- */
async function readExif(file){
  try{if(!/jpe?g$/i.test(file.type)&&!/\.jpe?g$/i.test(file.name))return null;const buf=await file.slice(0,262144).arrayBuffer(),v=new DataView(buf);if(v.getUint16(0)!==0xFFD8)return null;
    let o=2;while(o+10<v.byteLength){const m=v.getUint16(o),len=v.getUint16(o+2);if(m===0xFFE1&&v.getUint32(o+4)===0x45786966)return parseTiff(v,o+10);if((m&0xFF00)!==0xFF00)break;o+=2+len}}catch(e){}return null}
function parseTiff(v,s){
  const le=v.getUint16(s)===0x4949,g16=p=>v.getUint16(p,le),g32=p=>v.getUint32(p,le),SZ={1:1,2:1,3:2,4:4,5:8,7:1,9:4,10:8};
  const rd=(off,tags)=>{const n=g16(s+off);for(let i=0;i<n;i++){const e=s+off+2+i*12,tag=g16(e),type=g16(e+2),cnt=g32(e+4),ptr=cnt*(SZ[type]||1)>4?s+g32(e+8):e+8;let val;
      if(type===2){let t="";for(let k=0;k<cnt;k++){const c=v.getUint8(ptr+k);if(!c)break;t+=String.fromCharCode(c)}val=t.trim()}
      else if(type===3)val=g16(ptr);else if(type===4)val=g32(ptr);else if(type===5)val=g32(ptr+4)?g32(ptr)/g32(ptr+4):0;else if(type===10)val=v.getInt32(ptr+4,le)?v.getInt32(ptr,le)/v.getInt32(ptr+4,le):0;tags[tag]=val}};
  const t0={},ex={};rd(g32(s+4),t0);if(t0[0x8769])rd(t0[0x8769],ex);
  return{make:t0[0x010F],model:t0[0x0110],date:ex[0x9003]||t0[0x0132],exp:ex[0x829A],iso:ex[0x8827],fl:ex[0x920A]}}
function nightOf(d){const x=new Date(d.getTime());if(x.getHours()<12)x.setDate(x.getDate()-1);return dstr(x)}
function fmtExp(e){return e>=1?(Math.round(e*10)/10)+" s":"1/"+Math.round(1/e)+" s"}
function autoNote(parts,extra){const h=$("fAuto");h.hidden=false;h.innerHTML=(parts.length?"Filled in from "+esc(extra.src)+": "+esc(parts.join(", "))+".":"")+(extra.html||"")}
async function exifFill(files){
  for(const f of files){const x=await readExif(f);if(!x)continue;const parts=[];
    if(x.date&&!F.dateTouched){const m=/^(\d{4}):(\d\d):(\d\d) (\d\d):(\d\d)/.exec(x.date);if(m){$("fDate").value=nightOf(new Date(+m[1],m[2]-1,+m[3],+m[4],+m[5]));parts.push("date");formHints()}}
    if(x.exp&&!$("fExp").value.trim()){$("fExp").value=[fmtExp(x.exp),x.iso?"ISO "+x.iso:"",x.fl?Math.round(x.fl)+" mm":""].filter(Boolean).join(", ");parts.push("exposure")}
    if(x.exp>=1&&!$("fLen").value){$("fLen").value=Math.round(x.exp*10)/10;formHints()}
    const cam=[x.make,x.model].filter(Boolean);if(cam.length&&!$("fGear").value.trim()&&!F.items.size){$("fGear").value=x.model&&x.make&&x.model.startsWith(x.make)?x.model:cam.join(" ");parts.push("camera")}
    if(parts.length){autoNote(parts,{src:"the photo"});return}}}
function fitsHeader(text){const h={};for(let i=0;i+80<=text.length;i+=80){const c=text.slice(i,i+80),k=c.slice(0,8).trim();if(k==="END")break;if(c.slice(8,10)!=="= ")continue;
  let v=c.slice(10).trim();if(v[0]==="'"){const j=v.indexOf("'",1);v=v.slice(1,j<0?undefined:j).trim()}else{v=v.split("/")[0].trim();const n=Number(v);if(v!==""&&!isNaN(n))v=n;else if(v==="T"||v==="F")v=v==="T"}h[k]=v}return h}
function sexa(v,hours){if(typeof v==="number")return v;const p=String(v).trim().split(/[\s:]+/).map(Number);if(!p.length||isNaN(p[0]))return null;const sg=/^-/.test(String(v).trim())?-1:1;const d=Math.abs(p[0])+(p[1]||0)/60+(p[2]||0)/3600;return sg*d*(hours?15:1)}
async function fitsFill(files){
  const frames=[];for(const f of files){try{const buf=await f.slice(0,2880*16).arrayBuffer(),txt=new TextDecoder("latin1").decode(buf);if(!/^SIMPLE\s*=/.test(txt))continue;const h=fitsHeader(txt);
    if(h.IMAGETYP&&!/light/i.test(h.IMAGETYP))continue;frames.push(h)}catch(e){}}
  if(!frames.length){autoNote([],{src:"",html:"No FITS light frames were found in those files."});return}
  const parts=[],h0=frames[0],groups={};for(const h of frames){const k=(h.FILTER||"")+"|"+(h.EXPTIME??h.EXPOSURE??"");groups[k]=(groups[k]||0)+1}
  const dates=frames.map(h=>h["DATE-OBS"]).filter(Boolean).map(d=>new Date(/Z$|[+-]\d\d:?\d\d$/.test(d)?d:d+"Z")).filter(d=>!isNaN(d)).sort((a,b)=>a-b);
  if(dates.length&&!F.dateTouched){$("fDate").value=nightOf(dates[0]);parts.push("date")}
  const gk=Object.keys(groups);
  if(gk.length===1){const[fl,ex]=gk[0].split("|");$("fSubs").value=groups[gk[0]];if(ex)$("fLen").value=+ex;if(fl&&!$("fFilter").value.trim())$("fFilter").value=fl;parts.push("subs")}
  else{const sum=gk.map(k=>{const[fl,ex]=k.split("|");return`${fl||"no filter"} ${groups[k]}×${ex} s`}).join(", ");$("fExp").value=[$("fExp").value.trim(),sum].filter(Boolean).join("; ");parts.push("sub sets by filter")}
  const extra=[h0.GAIN!=null?"gain "+h0.GAIN:"",h0.OFFSET!=null?"offset "+h0.OFFSET:"",h0["CCD-TEMP"]!=null?Math.round(h0["CCD-TEMP"])+" °C":""].filter(Boolean).join(", ");
  if(extra&&!$("fExp").value.includes("gain"))$("fExp").value=[$("fExp").value.trim(),extra].filter(Boolean).join("; ");
  const eq=[h0.TELESCOP,h0.INSTRUME].filter(Boolean).join(", ");if(eq&&!$("fGear").value.trim()&&!F.items.size){$("fGear").value=eq;parts.push("equipment")}
  formHints();
  let html="",added=0;
  if(h0.OBJECT){for(const t of parseTargets(String(h0.OBJECT)))if(BYKEY[t.key]&&!F.targets.some(x=>x.key===t.key)){F.targets.push(t);added++}if(added){chips();parts.push("target")}}
  const ra=h0.CRVAL1!=null&&h0.CTYPE1&&/RA/.test(h0.CTYPE1)?h0.CRVAL1:h0.RA!=null?sexa(h0.RA,false):h0.OBJCTRA!=null?sexa(h0.OBJCTRA,true):null;
  const de=h0.CRVAL2!=null&&h0.CTYPE2&&/DEC/.test(h0.CTYPE2)?h0.CRVAL2:h0.DEC!=null?sexa(h0.DEC,false):h0.OBJCTDEC!=null?sexa(h0.OBJCTDEC,false):null;
  if(ra!=null&&de!=null){let rad=.75;if(h0.FOCALLEN&&h0.XPIXSZ&&h0.NAXIS1&&h0.NAXIS2){const sc=206.265*h0.XPIXSZ/h0.FOCALLEN/3600;rad=Math.hypot(h0.NAXIS1,h0.NAXIS2)*sc/2}
    const near=[];for(const k in BYKEY){const o=BYKEY[k];if(o.ss||o.lunar||o.ra==null)continue;const d=angSep(ra/15,de,o.ra,o.dec);if(d<rad)near.push({o,d})}
    near.sort((a,b)=>((a.o.mag??15)-(b.o.mag??15))||a.d-b.d);const pick=near.filter(x=>!F.targets.some(t=>keysOf(t.key).includes(x.o.key))).slice(0,6);
    if(pick.length)html=` Objects in this field: ${pick.map(x=>`<button type="button" class="linkish" data-act="addTgt" data-key="${esc(x.o.key)}">${esc(dn(x.o)+(x.o.name?" "+x.o.name:""))}</button>`).join(", ")}. Tap to add.`}
  autoNote(parts,{src:frames.length+" FITS header"+(frames.length>1?"s":""),html})}

/* ---------- wiring ---------- */
function featuresInit(){
  $("hzGrid").innerHTML=HZ_DIRS.map((d,i)=>`<label class="hzc"><span>${d}</span><input type="number" id="hz${i}" min="0" max="60" step="1" inputmode="numeric" value="0"></label>`).join("");
  for(let i=0;i<8;i++)$("hz"+i).addEventListener("change",saveSet);
  $("sessForm").addEventListener("submit",saveSess);
  $("fDate").addEventListener("input",()=>{F.dateTouched=true});
  $("fFits").addEventListener("change",e=>{const fs=[...e.target.files];e.target.value="";if(fs.length)fitsFill(fs)});
  $("planView").addEventListener("change",e=>{const id=e.target.id;
    if(id==="pDate"&&e.target.value){S.pDate=e.target.value;renderPlan()}else if(id==="pSrc"){S.pSrc=e.target.value;renderPlan()}else if(id==="pWell")renderPlan();else if(id==="skyLines"){const N=nightAt(S.pDate);if(N)drawSky(N)}});
  $("planView").addEventListener("input",e=>{if(e.target.id==="skyT"){S.skyIdx=+e.target.value;const N=nightAt(S.pDate);if(N)drawSky(N)}});
  $("detail").addEventListener("change",e=>{if(e.target.id==="frameRig"){S.frameRig=e.target.value;const o=BYKEY[S.detail];if(o){$("framingBox").outerHTML=framingHTML(o)}}});
  $("detail").addEventListener("input",e=>{if(e.target.id==="frameRot"){S.frameRot=+e.target.value;$("frameRotV").textContent=S.frameRot+"°";$("frameOv").innerHTML=frameOverlay()}});
  document.addEventListener("change",e=>{const k=e.target.dataset&&e.target.dataset.f;if(!k)return;S["f_"+k]=e.target.value;render()});
  $("gType").addEventListener("change",gearFields);gearFields()}
function gearFields(){const t=$("gType").value;$("gfTel").hidden=t!=="Telescope";$("gfCam").hidden=t!=="Camera";$("gfFac").hidden=!/Reducer|Barlow/.test(t)}
async function featureAct(act,a){
  switch(act){
    case"fClear":S.f_season=S.f_scope=S.f_frame=S.f_type="";render();return true;
    case"pToday":S.pDate=tonightStr();renderPlan();return true;
    case"pNight":S.pDate=a.dataset.d;renderPlan();return true;
    case"pChartT":{const k=a.dataset.key;if(S.pChart.has(k))S.pChart.delete(k);else S.pChart.add(k);renderPlan();return true}
    case"sessStart":openSess(false);return true;
    case"sessEdit":openSess(true);return true;
    case"sessEnd":if(a.dataset.confirm){S.session=null;putDoc("session",{active:false});render();toast("Session ended.")}else{a.dataset.confirm="1";a.textContent="Confirm end";setTimeout(()=>{if(a.isConnected){a.textContent="End session";delete a.dataset.confirm}},4000)}return true;
    case"closeSess":$("sessDlg").close();return true;
    case"quickLog":await quickLog(a.dataset.key);return true;
    case"fitsPick":$("fFits").click();return true;
    case"addTgt":{const k=a.dataset.key;if(!F.targets.some(t=>t.key===k)){F.targets.push({key:k,label:labelOf(k)});chips()}a.remove();return true}
    case"editGear":{const g=S.gear[+a.dataset.i];if(!g)return true;$("gType").value=g.type;gearFields();$("gName").value=g.name;$("gFl").value=g.fl||"";$("gAp").value=g.ap||"";$("gFac").value=g.fac||"";$("gSw").value=g.sw||"";$("gSh").value=g.sh||"";$("gPx").value=g.px||"";$("gName").focus();return true}
  }
  return false}

/* ---------- shared filters: season, telescope, rig, type ---------- */
function bestMonth(o){return new Date(2001,2,35+Math.round(((o.ra+12)%24)/24*365.25)).getMonth()}
const limMag=ap=>.7+5*Math.log10(ap);
const SEASONS={djf:[11,0,1],mam:[2,3,4],jja:[5,6,7],son:[8,9,10]};
function filterOpts(){
  const south=S.set.lat!=null&&S.set.lat<0;
  const season=[["","Any season"],["now","Best this month"],["djf",`Dec to Feb (${south?"summer":"winter"})`],["mam",`Mar to May (${south?"autumn":"spring"})`],["jja",`Jun to Aug (${south?"winter":"summer"})`],["son",`Sep to Nov (${south?"spring":"autumn"})`]];
  const scope=[["","Any telescope"]].concat(S.gear.filter(g=>g.type==="Telescope"&&g.ap).map(g=>[String(g.ap),`My ${g.name} (${g.ap} mm)`]),
    [["50","Binoculars, 50 mm"],["80","Small telescope, 80 mm"],["100","4-inch, 100 mm"],["150","6-inch, 150 mm"],["200","8-inch, 200 mm"],["250","10-inch, 250 mm"],["300","12-inch or larger"]]);
  const frame=[["","Any size"]].concat(S.rigs.filter(r=>rigOptics(r)).map(r=>[r.name,`Good fit for ${r.name}`]));
  return{season,scope,frame}}
function filterHTML(withType,rows){
  const o=filterOpts(),sel=(k,label,opts)=>`<select data-f="${k}" aria-label="${label}">${opts.map(([v,n])=>`<option value="${esc(v)}"${String(S["f_"+k]||"")===v?" selected":""}>${esc(n)}</option>`).join("")}</select>`;
  let h="";
  if(withType){const ts=[...new Set((rows||[]).map(x=>x.type))].filter(t=>TYPES[t]);h+=sel("type","Object type",[["","Any type"]].concat(ts.map(t=>[t,TYPES[t][1]])))}
  h+=sel("season","Season",o.season)+sel("scope","Telescope",o.scope);
  if(o.frame.length>1)h+=sel("frame","Framing",o.frame);
  const on=["season","scope","frame"].concat(withType?["type"]:[]).filter(k=>S["f_"+k]).length;
  if(on)h+=`<button class="btn quiet" data-act="fClear">Clear filters</button>`;
  return h}
function extraFilter(o,withType){
  if(withType&&S.f_type&&o.type!==S.f_type)return false;
  if(o.ss||o.lunar)return!(S.f_frame);
  if(S.f_season){const m=bestMonth(o),now=new Date().getMonth();
    if(S.f_season==="now"?Math.min((m-now+12)%12,(now-m+12)%12)>1:!SEASONS[S.f_season].includes(m))return false}
  if(S.f_scope&&(o.mag==null||o.mag>limMag(+S.f_scope)))return false;
  if(S.f_frame){const r=S.rigs.find(x=>x.name===S.f_frame),op=r&&rigOptics(r),sz=sizeOf(o);if(!op||!sz)return false;
    const[a,b]=[Math.max(sz[0],sz[1]),Math.min(sz[0],sz[1])],W=Math.max(op.w,op.h),H=Math.min(op.w,op.h);
    if(a>W*.95||b>H*.95||a<W*.15)return false}
  return true}
function filterSig(){return[S.f_season,S.f_scope,S.f_frame,S.f_type].join("|")}
