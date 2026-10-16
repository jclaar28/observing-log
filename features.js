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
function nightVerdict(N){const h=N.moonless/60,lit=N.moonLit||0;
  if(!N.ev.dusk)return"No full darkness: a night for the Moon, planets and double stars.";
  if(h>=6)return"A long moonless night, good for galaxies and faint nebulae.";
  if(h>=3)return`About ${Math.round(h)} hours without the Moon. Save the faint targets for then.`;
  if(lit>.6)return"A bright Moon most of the night. Good for the Moon itself, planets, double stars and clusters, or narrowband imaging.";
  return"Little moonless darkness. Bright clusters, planets and double stars will show best."}
function nightTitle(ds){const t=tonightStr();const d=new Date(ds+"T12:00"),full=d.toLocaleDateString(undefined,{weekday:"long",month:"long",day:"numeric"});
  return ds===t?"Tonight, "+full:full}
function renderPlan(){
  const el=$("planView");
  if(S.set.lat==null){el.dataset.built="";el.innerHTML=`<div class="lhero"><h2>Plan</h2><p>Pick a night and build a plan for it.</p></div><p class="empty">Set your latitude in Settings to plan a night. Longitude makes the times more accurate.</p>`;return}
  if(!S.pDate)S.pDate=tonightStr();
  const N=nightAt(S.pDate),B=bState();
  if(!el.dataset.built){el.dataset.built="1";el.innerHTML=`<div class="lhero phd"><div><h2>Plan</h2><p>Pick a night, then build a plan for it.</p></div>${S.canWrite?'<button class="btn" data-act="sessStart">Start session</button>':""}</div>
    <div class="nights" id="pNights"></div>
    <div class="phero"><p class="pnt" id="pNightT"></p><p class="pverd" id="pVerd"></p><p class="pfacts" id="pFacts"></p><p class="pfacts" id="pPlanets"></p></div>
    <div class="secrow"><h3 class="lsec">Your plan</h3><button class="btn" data-act="bOpen" id="bOpenBtn">Build a plan</button></div>
    <div id="bOut"></div>
    <div class="badd" id="bAddWrap"><div class="addwrap"><input id="bAdd" autocomplete="off" autocapitalize="off" enterkeyhint="done" placeholder="Add an object: M13, Ring Nebula, Saturn" aria-label="Add objects to your plan"></div><button class="btn" data-act="bAddBtn">Add</button></div>
    <div class="chartbox" id="pChartBox"><svg id="pChart" viewBox="0 0 960 320" role="img"></svg></div>
    <h3 class="lsec">Sky view</h3>
    <div class="tools"><input type="range" id="skyT" min="0" max="144" step="1" aria-label="Time"><span id="skyTl"></span><label class="check"><input type="checkbox" id="skyLines" checked> Constellation lines</label></div>
    <div class="skybox"><svg id="skySvg" viewBox="0 0 640 640" role="img" aria-label="All-sky view"></svg></div>
    <p class="ihint">Looking straight up: north at the top, east on the left. Your planned objects are marked. Tap one to open it.</p>`}
  // week strip, with any other date at the end
  let nh="";const t0=new Date(Date.now()-12*3600e3),days=[];
  for(let i=0;i<7;i++){const d=new Date(t0);d.setDate(d.getDate()+i);days.push(dstr(d))}
  for(const[i,ds]of days.entries()){const d=new Date(ds+"T12:00"),M=nightAt(ds),q=M?Math.min(1,M.moonless/600):0;
    nh+=`<button data-act="pNight" data-d="${ds}" aria-pressed="${ds===S.pDate}"><b>${i===0?"Tonight":d.toLocaleDateString(undefined,{weekday:"short",day:"numeric"})}</b><span>${M&&M.moonLit!=null?Math.round(M.moonLit*100)+"% moon":""}</span><span>${M?fmtDur(M.moonless*60)+" dark":""}</span><i class="nq"><i style="width:${Math.round(q*100)}%"></i></i></button>`}
  const other=!days.includes(S.pDate);
  $("pNights").innerHTML=nh+`<label class="pother${other?" on":""}"><b>${other?new Date(S.pDate+"T12:00").toLocaleDateString(undefined,{month:"short",day:"numeric"}):"Other night"}</b><input type="date" id="pDate" value="${S.pDate}" aria-label="Pick another night"></label>`;
  // night summary
  const ev=N.ev;$("pNightT").textContent=nightTitle(S.pDate);$("pVerd").textContent=nightVerdict(N);
  $("pFacts").innerHTML=[ev.dusk?`<b>Dark</b> ${fmtT(ev.dusk)} – ${fmtT(ev.dawn)}`:"<b>No full darkness</b>",`<b>Moon</b> ${esc(moonLine(N))}`,`<b>Moonless</b> ${N.moonless?fmtDur(N.moonless*60):"none"}`,`<b>Sunset</b> ${fmtT(ev.sunset)}`,`<b>Sunrise</b> ${fmtT(ev.sunrise)}`].map(x=>`<span>${x}</span>`).join("");
  const pl=(CATS.S?CATS.S.rows:[]).filter(o=>o.tlong==="Planet"&&o.mag!=null&&o.mag<8).map(o=>({o,r:objNight(o,N)})).filter(x=>x.r&&x.r.up>=30).sort((a,b)=>a.r.pt-b.r.pt);
  $("pPlanets").innerHTML=pl.length?`<b>Planets</b> `+pl.map(x=>`<button class="linkish" data-act="open" data-key="${esc(x.o.key)}">${esc(x.o.lab)}</button> best ${fmtT(x.r.pt)}`).join(", "):"<b>Planets</b> none up in darkness";
  // the plan
  renderPlanList(N);
  const rows=B.picks.map(p=>({o:BYKEY[p.key],r:BYKEY[p.key]&&objNight(BYKEY[p.key],N)})).filter(x=>x.r);
  $("pChartBox").hidden=!rows.length;if(rows.length)drawPlanChart(N,rows);
  $("bOpenBtn").textContent="Build a new plan";$("bOpenBtn").hidden=!B.picks.length;
  S.planRowsCache=rows;
  const sl=$("skyT"),i0=N.smp.findIndex(x=>x.sun<-12),i1=N.smp.length-1-[...N.smp].reverse().findIndex(x=>x.sun<-12);
  sl.min=Math.max(0,i0-6);sl.max=Math.min(144,i1+6);
  if(S.skyIdx==null||S.skyDate!==S.pDate){const now=Date.now(),k=N.smp.findIndex(x=>x.t>=now);S.skyIdx=k>=+sl.min&&k<=+sl.max?k:Math.min(+sl.max,Math.max(+sl.min,60));S.skyDate=S.pDate}
  sl.value=S.skyIdx;drawSky(N)}
function moonLine(N){const ev=N.ev,end=N.base+86400e3,inN=t=>t&&t>N.base&&t<end,parts=[];
  if(N.moonLit!=null)parts.push(Math.round(N.moonLit*100)+"% lit");
  const evs=[["rises",ev.moonrise],["sets",ev.moonset]].filter(x=>inN(x[1])).sort((a,b)=>a[1]-b[1]);
  if(evs.length)parts.push(evs.map(x=>x[0]+" "+fmtTime(x[1])).join(", "));else{const m=N.smp[72];parts.push(m.moon>0?"up all night":"down all night")}
  return parts.join(", ")}
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
  const bk=bPlanKeys();$("sessPlan").hidden=!!ss||!bk;$("sessPlanTxt").textContent=bk?`Use the ${bk.length} object${bk.length===1?"":"s"} in your plan as the session's checklist`:"";
  $("sessDlg").showModal()}
async function saveSess(e){
  e.preventDefault();const old=sessActive(),site=$("sSite2").value.trim(),st=S.sites.find(x=>x.name===site),rig=$("sRig2").value,r=S.rigs.find(x=>x.name===rig);
  const ss=Object.assign({},old||{id:newId(),started:Date.now(),plan:$("sessUsePlan").checked?(bPlanKeys()||[]):[]},{active:true,date:$("sDate2").value||tonightStr(),site,rig,items:r?rigItems(r):[],kind:$("sKind2").value,
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
  $("planView").addEventListener("change",e=>{if(bChange(e))return;const id=e.target.id;
    if(id==="pDate"&&e.target.value){S.pDate=e.target.value;renderPlan()}else if(id==="skyLines"){const N=nightAt(S.pDate);if(N)drawSky(N)}});
  $("planView").addEventListener("input",e=>{if(e.target.id==="bAdd"){SUG.bAdd=SUG.fTarget;suggestFor(e.target);return}if(e.target.id==="skyT"){S.skyIdx=+e.target.value;const N=nightAt(S.pDate);if(N)drawSky(N)}});
  $("buildDlg").addEventListener("change",bChange);
  $("planView").addEventListener("keydown",e=>{if(e.target.id==="bAdd"&&e.key==="Enter"){e.preventDefault();featureAct("bAddBtn",e.target)}});
  $("planView").addEventListener("pointerdown",e=>{if(e.target.closest("[data-sg]"))e.preventDefault()});
  $("planView").addEventListener("click",e=>{const b=e.target.closest("[data-sg]");if(!b||b.dataset.sg!=="bAdd")return;e.stopPropagation();$("bAdd").value=b.dataset.v;featureAct("bAddBtn",b)},true);
  $("detail").addEventListener("change",e=>{if(e.target.id==="frameRig"){S.frameRig=e.target.value;const o=BYKEY[S.detail];if(o){$("framingBox").outerHTML=framingHTML(o)}}});
  $("detail").addEventListener("input",e=>{if(e.target.id==="frameRot"){S.frameRot=+e.target.value;$("frameRotV").textContent=S.frameRot+"°";$("frameOv").innerHTML=frameOverlay()}});
  document.addEventListener("change",e=>{const k=e.target.dataset&&e.target.dataset.f;if(!k)return;S["f_"+k]=e.target.value;render()});
  $("gType").addEventListener("change",gearFields);gearFields()}
function gearFields(){const t=$("gType").value;$("gfTel").hidden=t!=="Telescope";$("gfCam").hidden=t!=="Camera";$("gfFac").hidden=!/Reducer|Barlow/.test(t)}
async function featureAct(act,a){
  if(act==="bAddBtn"){const i=$("bAdd");if(i&&i.value.trim()){bAdd(i.value);i.value="";const u=document.getElementById("sg-bAdd");if(u)u.hidden=true;renderPlan()}return true}
  if(/^b[A-Z]/.test(act)&&await bAct(act,a))return true;
  switch(act){
    case"fClear":S.f_season=S.f_scope=S.f_frame=S.f_type="";render();return true;
    case"pToday":S.pDate=tonightStr();renderPlan();return true;
    case"pNight":S.pDate=a.dataset.d;renderPlan();return true;
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
  if(o.ds){if(S.f_frame)return false;if(S.f_scope){const ap=+S.f_scope;if(!splitsWith(o,ap)||o.magB>limMag(ap)+2)return false}
    if(S.f_season){const m=bestMonth(o),now=new Date().getMonth();if(S.f_season==="now"?Math.min((m-now+12)%12,(now-m+12)%12)>1:!SEASONS[S.f_season].includes(m))return false}return true}
  if(S.f_season){const m=bestMonth(o),now=new Date().getMonth();
    if(S.f_season==="now"?Math.min((m-now+12)%12,(now-m+12)%12)>1:!SEASONS[S.f_season].includes(m))return false}
  if(S.f_scope&&(o.mag==null||o.mag>limMag(+S.f_scope)))return false;
  if(S.f_frame){const r=S.rigs.find(x=>x.name===S.f_frame),op=r&&rigOptics(r),sz=sizeOf(o);if(!op||!sz)return false;
    const[a,b]=[Math.max(sz[0],sz[1]),Math.min(sz[0],sz[1])],W=Math.max(op.w,op.h),H=Math.min(op.w,op.h);
    if(a>W*.95||b>H*.95||a<W*.15)return false}
  return true}
const splitNeed=o=>116/o.sep*(Math.abs(o.magB-o.mag)>2?1.6:1)*1.3;
const splitsWith=(o,ap)=>ap<=50?o.sep>=25:splitNeed(o)<=ap;
function splitText(o){const need=splitNeed(o);
  if(o.sep>=25)return"Binoculars or any telescope";if(need<=60)return"Any small telescope";const mm=Math.ceil(need/10)*10;return`About ${mm} mm (${(mm/25.4).toFixed(mm<100?1:0)}-inch) or larger, in steady seeing`}
function filterSig(){return[S.f_season,S.f_scope,S.f_frame,S.f_type].join("|")}

/* ---------- assisted list builder ---------- */
const BGOALS=[["show","Showpieces"],["outreach","Public outreach: bright crowd-pleasers"],["unseen","Things I haven't observed"],["list","Work through a list"],["challenge","A challenge for my equipment"]];
const BPER={visual:[[10,"10 min"],[15,"15 min"],[20,"20 min"],[30,"30 min"],[45,"45 min"]],imaged:[[30,"30 min"],[60,"1 hour"],[90,"1.5 hours"],[120,"2 hours"],[180,"3 hours"],[240,"4 hours"]]};
const BLEN=[[60,"1 hour"],[90,"1.5 hours"],[120,"2 hours"],[180,"3 hours"],[240,"4 hours"],[0,"Until dawn"]];
function bState(){if(S.B)return S.B;const tel=S.gear.find(g=>g.type==="Telescope"&&g.ap),rig=S.rigs.find(r=>rigOptics(r));
  return S.B={count:"",method:"visual",scope:tel?String(tel.ap):"200",rig:rig?rig.name:"",per:15,len:180,start:null,goal:"show",src:"cur:visual",skipSeen:false,mix:true,moon:true,planets:true,seed:0,picks:[],skip:new Set(),chart:true}}
function rng(a){return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
function bWindow(N,B){const smp=N.smp,i0=smp.findIndex(x=>x.sun<-6),iE=smp.length-1-[...smp].reverse().findIndex(x=>x.sun<-6);
  const dark=B.method==="imaged"&&smp.some(x=>x.sun<-18)?smp.findIndex(x=>x.sun<-18):smp.findIndex(x=>x.sun<-12),dawn=smp.length-1-[...smp].reverse().findIndex(x=>x.sun<-12);
  let st=B.start;if(st==null||st<i0||st>iE){st=dark>=0?Math.ceil(dark/3)*3:i0;const now=Date.now(),k=smp.findIndex(x=>x.t>=now);if(k>st&&k<dawn-6)st=Math.ceil(k/3)*3}
  const end=B.len?Math.min(st+B.len/10,iE):Math.max(st+6,dawn);return{i0,iE,st,end,dawn}}
function bCurCount(){if(S.curCnt)return S.curCnt;const c={};for(const id in CUR)for(const k of CUR[id].order.keys())for(const x of keysOf(k))c[x]=(c[x]||0)+1;return S.curCnt=c}
function bAp(B){return B.method==="visual"?+B.scope||200:null}
function bPool(B){
  let rows;if(B.goal==="list")rows=planRows(B.src);else{rows=[].concat(CATS.M.rows,CATS.C.rows,CATS.D?CATS.D.rows:[],CATS.S?CATS.S.rows:[]);for(const id in CUR)rows=rows.concat(CUR[id].rows);
    for(const k of["N","I"])if(CATS[k])rows=rows.concat(CATS[k].rows.filter(o=>o.name&&o.mag!=null&&o.mag<=11))}
  const seen=new Set(),out=[],g=grouped(true),ap=bAp(B),op=B.method==="imaged"&&B.rig?rigOptics(S.rigs.find(r=>r.name===B.rig)||{}):null;
  for(const o of rows){if(!o||o.lunar||seen.has(o.key))continue;keysOf(o.key).forEach(k=>seen.add(k));
    if(B.skip.has(o.key)||(B.skipSeen||B.goal==="unseen")&&g[o.key])continue;
    if(o.ss){if(B.method==="imaged"||!B.planets||!/^(Planet|Moon)$/.test(o.tlong)||o.mag==null||o.mag>limMag(ap)-1)continue}
    else if(o.ds){if(B.method==="imaged"||!splitsWith(o,ap)||o.magB>limMag(ap)+1)continue}
    else if(B.method==="visual"){if(o.mag==null||o.mag>limMag(ap)-(o.type==="G"?2:1))continue}
    else{if(o.mag!=null&&o.mag>12)continue;if(op){const sz=sizeOf(o);if(sz){const f=Math.max(sz[0],sz[1])/Math.max(op.w,op.h);if(f>1.4||f<.03)continue;o._fit=f}else o._fit=null}}
    out.push(o)}
  return out}
function bBase(o,B,N){const pop=bCurCount()[o.key]||0,m=o.mag==null?(o.ss?-2:9):o.mag,ap=bAp(B),why=[];let s=0;
  const planet=o.ss&&o.tlong==="Planet",bright=/^(Jupiter|Saturn|Venus|Mars)$/.test(o.lab);
  if(B.goal==="challenge"){const lim=ap?limMag(ap)-(o.type==="G"?1.5:.8):12;s=4-Math.abs(lim-m)*1.2+(CUR.herschel400&&CUR.herschel400.order.has(o.key)?1.5:0)-pop*.4;if(o.ss)s-=6;if(lim-m<1.5)why.push("near the limit of your equipment")}
  else if(B.goal==="outreach"){s=1.2*pop+(o.name?1:0)+Math.max(-4,(8-m))*.9;if(o.ss)s+=o.lab==="Moon"?7:bright?7:planet?2:0;if(o.ds&&o.col)s+=2;if(o.type==="G"&&m>8.5)s-=3;if(o.type==="SNR")s-=2;
    if(o.ss&&(bright||o.lab==="Moon"))why.push("a crowd favourite");else if(o.ds&&o.col)why.push(o.col);else if(m<6)why.push("bright and easy")}
  else{s=1.6*pop+(o.name?1:0)+Math.max(-3,(9-m))*.5;if(o.ss)s+=o.lab==="Moon"||bright?4:planet?1:0;if(o.ds&&o.col)s+=1;if(B.goal==="list")s=s*.3;
    if(pop>=3&&B.goal!=="list")why.push(`on ${pop} curated lists`)}
  if(B.method==="imaged"&&o._fit!=null){const f=o._fit;if(f>=.15&&f<=.75){s+=2;why.push(`fills ${Math.round(f*100)}% of the frame`)}else if(f>1){s-=2;why.push("needs a mosaic")}else if(f<.08)s-=1.5}
  if(B.method==="imaged"&&(N.moonLit||0)>.4&&/^(N|SNR)$/.test(o.type)){s+=1.5;why.push("good with a narrowband filter in moonlight")}
  if(!grouped(true)[o.key]&&B.goal!=="unseen")s+=.3;else if(B.goal==="unseen")why.push("not yet observed");
  return{s,why}}
const BMOONF={G:1,N:1,SNR:1,PN:.4,GC:.4,OC:.2,O:.5};
function bSlotFit(o,r,N,B,a,b){const smp=N.smp,need=o.ss||o.ds?-6:B.method==="imaged"?Math.max(N.darkAlt,-18):-12;let ok=0,sum=0,n=0;
  for(let i=a;i<b;i++){const x=smp[i];if(!x)break;n++;const al=r.alts[i];sum+=al;if(x.sun<need&&al>Math.max(limitAt(azOf(r.ra,r.dec,x.lst,N.lat))+(o.ss?0:3),o.ss?10:o.ds?0:B.method==="imaged"?20:15))ok++}
  if(!n||ok/n<.75)return null;const alt=sum/n,later=r.alts[Math.min(b+12,smp.length-1)];
  let s=Math.min(alt,60)/20;if(later<alt&&later<limitAt(0)+15)s+=.8;
  let moonPen=0;const mi=Math.floor((a+b)/2);if(B.moon&&smp[mi]&&smp[mi].moon>0){let f=BMOONF[o.type]||0;if(B.method==="imaged"&&/^(N|SNR)$/.test(o.type))f*=.3;moonPen=f*(N.moonLit||0)*Math.max(0,(70-r.sep)/70)*5}
  return{s:s-moonPen,alt,moonPen}}
/* how many objects: a suggested count from the window and method, unless the user picks one; time per object follows from it */
function bAuto(B,span){const h=span/6;return B.method==="visual"?Math.min(12,Math.max(3,Math.round(h*3))):Math.min(4,Math.max(1,Math.round(h/1.5)))}
function bSync(N,B){const W=bWindow(N,B),span=Math.max(1,W.end-W.st);B.nAuto=bAuto(B,span);const n=+B.count||B.nAuto;B.per=Math.max(10,Math.floor(span/n)*10);return W}
const fmtEach=m=>m>=60?(m%60?Math.floor(m/60)+" h "+m%60+" min":m/60+" h"):m+" min";
function bSlots(N,B){bSync(N,B);const W=bWindow(N,B),k=Math.max(1,Math.round(B.per/10));return{W,k,n:Math.max(1,Math.min(40,+B.count||B.nAuto,Math.floor((W.end-W.st)/k)))}}
function bFit(key,N,B,W,k,i){const o=BYKEY[key],r=o&&objNight(o,N);return r?bSlotFit(o,r,N,B,W.st+i*k,W.st+(i+1)*k):null}
function bFreeSlot(key,N,B,taken){const{W,k,n}=bSlots(N,B);let best=-1,bs=-1e9;for(let i=0;i<n;i++){if(taken.has(i))continue;const f=bFit(key,N,B,W,k,i),v=f?f.s:-50-Math.abs(i-bBest(key,N,W,k));if(v>bs){bs=v;best=i}}
  if(best<0){best=n;while(taken.has(best))best++}return best}
function bBuild(keepAll){
  const B=bState(),N=nightAt(S.pDate);if(!N)return;const{W,k,n}=bSlots(N,B),sig=W.st+"|"+k;
  if(B.sig!==sig){for(const p of B.picks)p.slot=null;B.sig=sig}
  const r=rng(B.seed*7919+1),jit=B.seed?2.2:0,pool=bPool(B).map(o=>({o,r:objNight(o,N)})).filter(x=>x.r&&x.r.up>0);
  const base={};for(const x of pool)base[x.o.key]=bBase(x.o,B,N);
  const kept=B.picks.filter(p=>keepAll||p.pin),used=new Set(kept.flatMap(p=>keysOf(p.key))),taken=new Set(),types={};
  for(const p of kept)if(p.slot!=null&&!taken.has(p.slot))taken.add(p.slot);else p.slot=null;
  for(const p of kept)if(p.slot==null){p.slot=bFreeSlot(p.key,N,B,taken);taken.add(p.slot)}
  for(const p of kept){const o=BYKEY[p.key];if(o)types[o.type]=(types[o.type]||0)+1}
  const picks=kept.slice();
  for(let i=0;i<n;i++){if(taken.has(i))continue;let best=null,bs=-1e9,bf=null;
    for(const x of pool){if(used.has(x.o.key))continue;const f=bSlotFit(x.o,x.r,N,B,W.st+i*k,W.st+(i+1)*k);if(!f)continue;
      const v=base[x.o.key].s+f.s-(B.mix?1.4*(types[x.o.type]||0)*(x.o.type==="G"?1.2:1):0)+(jit?r()*jit:0);if(v>bs){bs=v;best=x;bf=f}}
    if(best){keysOf(best.o.key).forEach(q=>used.add(q));types[best.o.type]=(types[best.o.type]||0)+1;picks.push({key:best.o.key,slot:i,pin:false,why:base[best.o.key].why.slice(),moon:bf.moonPen>1})}}
  B.picks=picks.sort((a,b)=>a.slot-b.slot);B.built=true;B.chart=true}
function bSwap(i){const B=bState(),p=B.picks[i];if(!p)return;B.skip.add(p.key);const pins=new Map(B.picks.map(q=>[q.key,q.pin]));B.picks.splice(i,1);
  const s0=B.seed;B.seed=s0||Math.floor(Math.random()*1e6);bBuild(true);B.seed=s0;for(const q of B.picks)q.pin=pins.has(q.key)?pins.get(q.key):false}
function bAdd(text){const B=bState(),N=nightAt(S.pDate);if(!N)return;const keys=[],bad=[];
  for(const part of text.split(/[,;\n]+/)){if(!part.trim())continue;for(const t of parseTargets(part)){if(BYKEY[t.key])keys.push(t.key);else bad.push(part.trim())}}
  let n=0;const taken=new Set(B.picks.map(p=>p.slot));
  for(const k of keys){if(B.picks.some(p=>keysOf(p.key).includes(k)))continue;B.skip.delete(k);const sl=bFreeSlot(k,N,B,taken);taken.add(sl);B.picks.push({key:k,slot:sl,pin:true,why:["added by you"]});n++}
  B.picks.sort((a,b)=>a.slot-b.slot);if(n)planSave();
  toast((n?`Added ${n} to your plan.`:keys.length?"Already in your plan.":"")+(bad.length?` Not found: ${[...new Set(bad)].join(", ")}.`:""))}
function bBest(key,N,W,k){const o=BYKEY[key],r=o&&objNight(o,N);if(!r)return 0;let bi=W.st,ba=-99;for(let i=W.st;i<=W.end;i++)if(r.alts[i]>ba){ba=r.alts[i];bi=i}return Math.round((bi-W.st)/k)}
function bOpt(v,cur,label){return`<option value="${esc(String(v))}"${String(v)===String(cur)?" selected":""}>${esc(label)}</option>`}
function renderBuildForm(N){
  const B=bState(),W=bWindow(N,B),el=$("bForm");if(!el)return;B.start=W.st;
  const times=[];for(let i=W.i0;i<=W.iE;i+=3)times.push(i);if(!times.includes(W.st))times.push(W.st),times.sort((a,b)=>a-b);
  const fo=filterOpts(),scopes=fo.scope.filter(x=>x[0]),rigs=S.rigs.filter(r=>rigOptics(r)),pins=B.picks.filter(p=>p.pin).length,room=bSlots(N,B).n;
  el.innerHTML=`<p class="hint" style="margin:0 0 12px">${esc(nightTitle(S.pDate))}. ${fmtTime(N.smp[W.st].t)} to ${fmtTime(N.smp[Math.min(W.end,N.smp.length-1)].t)}, ${room} object${room===1?"":"s"}, about ${fmtEach(B.per)} each.</p>
  <div class="bgrid">
    <label>Start<select id="bStart">${times.map(i=>bOpt(i,W.st,fmtTime(N.smp[i].t))).join("")}</select></label>
    <label>For<select id="bLen">${BLEN.map(([v,n])=>bOpt(v,B.len,n)).join("")}</select></label>
    <label>Observing<select id="bMethod">${bOpt("visual",B.method,"Visually")}${bOpt("imaged",B.method,"Imaging")}</select></label>
    ${B.method==="visual"?`<label>With<select id="bScope">${scopes.map(([v,n])=>bOpt(v,B.scope,n)).join("")}</select></label>`
      :`<label>Rig<select id="bRig">${bOpt("",B.rig,rigs.length?"Any, don't check framing":"No rig with focal length and sensor")}${rigs.map(r=>bOpt(r.name,B.rig,r.name)).join("")}</select></label>`}
    <label>How many objects<input id="bCount" type="number" min="1" max="40" step="1" inputmode="numeric" value="${esc(String(B.count||""))}" placeholder="Suggested: ${B.nAuto}"></label>
    <label>Aim<select id="bGoal">${BGOALS.map(([v,n])=>bOpt(v,B.goal,n)).join("")}</select></label>
    ${B.goal==="list"?`<label>List<select id="bSrc">${planSources().filter(x=>x[0]!=="plan").map(([v,n])=>bOpt(v,B.src,n)).join("")}</select></label>`:""}
  </div>
  <div class="bchecks">
    ${B.goal!=="unseen"?`<label class="check"><input type="checkbox" id="bSeen"${B.skipSeen?" checked":""}> Skip objects I've observed</label>`:""}
    <label class="check"><input type="checkbox" id="bMix"${B.mix?" checked":""}> Mix object types</label>
    <label class="check"><input type="checkbox" id="bMoon"${B.moon?" checked":""}> Keep away from the Moon</label>
    ${B.method==="visual"?`<label class="check"><input type="checkbox" id="bPlanets"${B.planets?" checked":""}> Include the Moon and planets</label>`:""}
    ${pins?`<label class="check"><input type="checkbox" id="bKeepPins"${B.keepPins!==false?" checked":""}> Keep the ${pins} object${pins===1?"":"s"} marked Keep</label>`:""}
  </div>
  ${B.method==="imaged"&&!rigs.length?`<p class="hint">Add focal length and sensor size to a rig in Settings to check framing.</p>`:""}`}
function bReslot(N,B){bSync(N,B);const W=bWindow(N,B),sig=W.st+"|"+Math.max(1,Math.round(B.per/10));
  if(B.sig!==sig||B.picks.some(p=>p.slot==null)){const t=new Set();if(B.sig!==sig)for(const p of B.picks)p.slot=null;for(const p of B.picks)if(p.slot!=null)t.add(p.slot);
    for(const p of B.picks)if(p.slot==null){p.slot=bFreeSlot(p.key,N,B,t);t.add(p.slot)}B.picks.sort((a,b)=>a.slot-b.slot);B.sig=sig}}
function renderPlanList(N){
  const B=bState(),W=bWindow(N,B),out=$("bOut");bReslot(N,B);
  if(!B.picks.length){out.innerHTML=`<div class="empty pempty"><p>Nothing planned for this night yet.</p><p><button class="btn primary" data-act="bOpen">Build a plan</button></p><p class="hint">Or add objects below, or tap Plan on any object in Lists.</p></div>`;return}
  const{k,n}=bSlots(N,B),g=grouped(true),ts=B.picks.map(p=>W.st+p.slot*k);
  const over=Math.max(0,...B.picks.map(p=>p.slot+1))-n,free=n-B.picks.filter(p=>p.slot<n).length;
  out.innerHTML=`<p class="hint">${fmtTime(N.smp[W.st].t)} to ${fmtTime(N.smp[Math.min(W.end,N.smp.length-1)].t)}, about ${fmtEach(B.per)} each. <button class="linkish" data-act="bOpen">Change</button></p>
    <ol class="blist">${B.picks.map((p,i)=>{const o=BYKEY[p.key];if(!o)return"";const r=objNight(o,N),a=ts[i],x=N.smp[Math.min(a,N.smp.length-1)];
      const al=r?r.alts[Math.min(a+Math.floor(k/2),N.smp.length-1)]:null,low=al!=null&&x&&al<limitAt(azOf(r.ra,r.dec,x.lst,N.lat));
      const why=(p.why||[]).concat(p.moon?["Moon is close"]:[]),seen=g[o.key];
      return`<li class="brow${p.pin?" pinned":""}"><span class="bt">${x?fmtTime(x.t):""}</span>
        <span class="bn"><button class="pname" data-act="open" data-key="${esc(o.key)}">${esc(dn(o))}${o.name?` <small>${esc(o.name)}</small>`:""}</button>
        <span class="pmeta">${esc(o.tlong||TYPES[o.type][0])}${o.con?" in "+esc(CON[o.con]||o.con):""}${al!=null?`, <span class="${low?"warn":""}">${low?"below your horizon then":Math.round(al)+"° up"}</span>`:""}${seen?", observed":""}${why.length?". "+esc(why.join(", ").replace(/^./,c=>c.toUpperCase())):""}</span></span>
        <span class="bacts"><button class="btn quiet" data-act="bPin" data-i="${i}" aria-pressed="${!!p.pin}" title="Keep this one when you reroll or rebuild">Keep</button><button class="btn quiet" data-act="bSwap" data-i="${i}" title="Replace with another suggestion">Swap</button><button class="btn quiet" data-act="bDrop" data-i="${i}" aria-label="Remove ${esc(dn(o))}">Remove</button></span></li>`}).join("")}</ol>
    ${over>0?`<p class="hint warn">This runs ${fmtDur(over*k*600)} past your end time.</p>`:free>0?`<p class="hint">${free} slot${free===1?"":"s"} free. <button class="linkish" data-act="bFill">Fill with suggestions</button></p>`:""}
    <div class="acts"><button class="btn" data-act="bReroll" title="New suggestions, keeping the ones marked Keep">Reroll</button>
      ${S.canWrite?`<button class="btn" data-act="bSave">Save as a list</button>`:""}<button class="btn quiet" data-act="bClear">Clear plan</button></div>`}
function bChange(e){const B=bState(),t=e.target,id=t.id;if(!id||!/^b[A-Z]/.test(id))return false;
  const m={bStart:["start",Number],bLen:["len",Number],bMethod:["method",String],bScope:["scope",String],bRig:["rig",String],bCount:["count",v=>{const n=Math.round(+v);return n>0?String(Math.min(40,n)):""}],bGoal:["goal",String],bSrc:["src",String]};
  if(m[id])B[m[id][0]]=m[id][1](t.value);else if(id==="bSeen")B.skipSeen=t.checked;else if(id==="bMix")B.mix=t.checked;else if(id==="bMoon")B.moon=t.checked;else if(id==="bPlanets")B.planets=t.checked;else if(id==="bKeepPins")B.keepPins=t.checked;else return false;
  if(id==="bMethod"){B.count="";B.start=null}const N=nightAt(S.pDate);if(N)renderBuildForm(N);return true}
function bSaveName(){const B=bState(),d=new Date(S.pDate+"T12:00");return`${d.toLocaleDateString(undefined,{month:"short",day:"numeric"})}: ${(BGOALS.find(x=>x[0]===B.goal)||["",""])[1].split(":")[0]}`}
async function bAct(act,a){const B=bState(),i=+a.dataset.i;
  switch(act){
    case"bOpen":{const N=nightAt(S.pDate);if(!N)return true;B.keepPins=true;renderBuildForm(N);$("buildDlg").showModal();return true}
    case"bClose":$("buildDlg").close();return true;
    case"bBuild":B.skip=new Set();B.seed=0;B.picks=B.keepPins!==false?B.picks.filter(p=>p.pin):[];bBuild(false);$("buildDlg").close();
      if(!B.picks.length)toast("Nothing suitable is up then. Try a later start, a longer window or a different aim.");break;
    case"bReroll":B.seed=(B.seed||0)+1;for(const p of B.picks)if(!p.pin)B.skip.add(p.key);bBuild(false);if(B.picks.filter(p=>!p.pin).length===0){B.skip=new Set(B.picks.map(p=>p.key));bBuild(false)}break;
    case"bFill":bBuild(true);break;
    case"bPin":if(B.picks[i])B.picks[i].pin=!B.picks[i].pin;break;
    case"bSwap":bSwap(i);break;
    case"bDrop":if(B.picks[i]){B.skip.add(B.picks[i].key);B.picks.splice(i,1)}break;
    case"bClear":if(a.dataset.confirm){B.picks=[];B.skip=new Set()}else{a.dataset.confirm="1";a.textContent="Confirm clear";setTimeout(()=>{if(a.isConnected){a.textContent="Clear plan";delete a.dataset.confirm}},4000);return true}break;
    case"bSave":{const l={id:newId(),name:bSaveName(),desc:`Planned for the night of ${fmtDate(S.pDate)}, in suggested order.`,items:B.picks.map(p=>p.key),created:Date.now(),src:"plan"};
      if(await saveList(l)){S.lists=S.lists.concat(l);toast(`Saved to My lists as "${l.name}".`)}return true}
    default:return false}
  planSave();renderPlan();return true}
/* the plan is stored as one document and mirrored into S.plan for markers and the Planned filter */
function planSave(){const B=bState();S.plan={};S.planT=Date.now();for(const p of B.picks)S.plan[p.key]=1;
  putDoc("plan",{t:S.planT,keys:B.picks.map(p=>p.key),items:B.picks.map(p=>({key:p.key,slot:p.slot,pin:!!p.pin,why:p.why||[],moon:!!p.moon})),sig:B.sig||"",
    cfg:{method:B.method,scope:B.scope,rig:B.rig,count:B.count||"",len:B.len,goal:B.goal,src:B.src,skipSeen:B.skipSeen,mix:B.mix,moon:B.moon,planets:B.planets}})}
function planLoad(v){if(S.planT&&!(v.t>S.planT))return;const B=bState();S.plan={};if(v.t)S.planT=v.t;
  B.picks=(v.items||(v.keys||[]).map(k=>({key:k,slot:null,pin:true}))).filter(p=>p&&BYKEY[p.key]).map(p=>Object.assign({},p));
  for(const p of B.picks)S.plan[p.key]=1;if(v.cfg)Object.assign(B,v.cfg);B.sig=v.sig||null}
function planToggle(k){const B=bState();const i=B.picks.findIndex(p=>keysOf(p.key).includes(k));
  if(i>=0){B.picks.splice(i,1);toast(`Removed ${labelOf(k)} from your plan.`)}
  else{const N=nightAt(S.pDate||tonightStr());let sl=null;if(N){const t=new Set(B.picks.map(p=>p.slot));sl=bFreeSlot(k,N,B,t)}B.skip.delete(k);
    B.picks.push({key:k,slot:sl,pin:true,why:["added by you"]});B.picks.sort((a,b)=>(a.slot??99)-(b.slot??99));toast(`Added ${labelOf(k)} to your plan.`)}
  planSave()}
function bPlanKeys(){const B=S.B;return B&&B.picks.length?B.picks.map(p=>p.key):null}
