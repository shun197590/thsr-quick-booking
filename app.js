(() => {
"use strict";

const BOOKING_URL = "https://irs.thsrc.com.tw/IMINT/";
const STORE = "thsr-quick-booking-flagship-v1";
const PREFS = "thsr-quick-booking-prefs-v1";
const ID_PREF_KEY = "thsr-identity-pref-v1";
const ID_SECURE_KEY = "thsr-identity-secure-v1";
const ID_SESSION_KEY = "thsr-identity-session-v1";
const stations = ["南港","台北","板橋","桃園","新竹","苗栗","台中","彰化","雲林","嘉義","台南","左營"];
const statusList = ["計畫中","待開賣","待訂票","已訂位","已付款","已取票","已取消"];
const $ = id => document.getElementById(id);

let state = { trips: [], targetId: "" };
let sentReminders = new Set();
let wakeLock = null;
let audioCtx = null;
let unlockedIdentity = "";

function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,8)}
function esc(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]))}
function nowISO(){return new Date().toISOString()}
function localDateTimeValue(d){const z=n=>String(n).padStart(2,"0");return d.getFullYear()+"-"+z(d.getMonth()+1)+"-"+z(d.getDate())+"T"+z(d.getHours())+":"+z(d.getMinutes())}
function fmtDate(v){if(!v)return"";const d=new Date(v.length===10?v+"T00:00:00":v);if(Number.isNaN(d.getTime()))return v;return new Intl.DateTimeFormat("zh-TW",{year:"numeric",month:"2-digit",day:"2-digit"}).format(d)}
function fmtDateTime(v){if(!v)return"";const d=new Date(v);if(Number.isNaN(d.getTime()))return v;return new Intl.DateTimeFormat("zh-TW",{year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false}).format(d)}
function saveState(){localStorage.setItem(STORE,JSON.stringify(state))}
function loadState(){try{const v=JSON.parse(localStorage.getItem(STORE)||"null");if(v&&Array.isArray(v.trips))state=v}catch(e){}}
function currentTarget(){return state.trips.find(t=>t.id===state.targetId)||null}
function passengerTotal(t){return ["adultCount","childCount","seniorCount","disabledCount","studentCount"].reduce((sum,k)=>sum+(Number(t[k])||0),0)}
function passengerText(t){return [["全票",t.adultCount],["孩童票",t.childCount],["敬老票",t.seniorCount],["愛心票",t.disabledCount],["大學生",t.studentCount]].filter(x=>Number(x[1])>0).map(x=>x[0]+"×"+x[1]).join("、")||"未設定"}
function assistantRuleText(t){const rule=t.trainRule||"after";if(rule==="specific"){const trains=[t.trainNo1,t.trainNo2,t.trainNo3].filter(Boolean);return"指定車次 "+(trains.join(" → ")||"未填")}if(rule==="nearest")return"最接近 "+(t.departTime||"指定時間")+"（±"+(t.timeTolerance||60)+"分）";return(t.departTime||"指定時間")+" 後第一班（容許 "+(t.timeTolerance||60)+"分）"}
function tripSummary(t){if(!t)return"";return ["【台灣高鐵快速訂票行程】","行程："+t.origin+" → "+t.destination,"去程："+t.departDate+" "+t.departTime,t.tripType==="roundtrip"?"回程："+t.returnDate+" "+t.returnTime:"","乘客："+passengerText(t),"車廂："+t.carClass,"選車規則："+assistantRuleText(t),t.saleOpenAt?"開賣提醒："+fmtDateTime(t.saleOpenAt):"",t.reservationCode?"訂位代號："+t.reservationCode:"",t.paymentDeadline?"付款期限："+fmtDateTime(t.paymentDeadline):"",t.note?"備註："+t.note:""].filter(Boolean).join("\n")}
async function copyText(text,statusEl,okText="已複製"){if(!text){if(statusEl)statusEl.textContent="目前沒有可複製的資料";return false}try{await navigator.clipboard.writeText(text)}catch(e){const ta=document.createElement("textarea");ta.value=text;document.body.appendChild(ta);ta.select();document.execCommand("copy");ta.remove()}if(statusEl){statusEl.textContent="✓ "+okText;setTimeout(()=>statusEl.textContent="",2200)}return true}
function validateTrip(t){if(!t.origin||!t.destination)return"請選擇出發站與到達站";if(t.origin===t.destination)return"出發站與到達站不可相同";if(!t.departDate||!t.departTime)return"請填寫去程日期與時間";if(t.tripType==="roundtrip"&&(!t.returnDate||!t.returnTime))return"去回程請填寫回程日期與時間";if(t.tripType==="roundtrip"&&new Date(t.returnDate+"T"+t.returnTime)<new Date(t.departDate+"T"+t.departTime))return"回程時間不可早於去程";const total=passengerTotal(t);if(total<1)return"至少需有 1 位乘客";if(t.tripType==="roundtrip"&&total>5)return"依官方網路訂票規則，去回程每一方向最多 5 張，請將乘客總數調整為 5 人以下";if(t.tripType==="oneway"&&total>10)return"依官方網路訂票規則，單筆交易至多 10 張乘車票";return""}


function maskIdentity(v){
  const s=String(v||"").trim();
  if(!s)return "未保存";
  if(s.length<=4)return "••••";
  return s.slice(0,2)+"•".repeat(Math.max(2,s.length-4))+s.slice(-2);
}
function validateTaiwanId(id){
  const v=String(id||"").trim().toUpperCase();
  if(!/^[A-Z][12]\d{8}$/.test(v))return false;
  const map={A:10,B:11,C:12,D:13,E:14,F:15,G:16,H:17,I:34,J:18,K:19,L:20,M:21,N:22,O:35,P:23,Q:24,R:25,S:26,T:27,U:28,V:29,W:32,X:30,Y:31,Z:33};
  const code=map[v[0]];
  const nums=v.slice(1).split("").map(Number);
  let sum=Math.floor(code/10)+(code%10)*9;
  const weights=[8,7,6,5,4,3,2,1,1];
  nums.forEach((n,i)=>sum+=n*weights[i]);
  return sum%10===0;
}
function bytesToB64(bytes){
  let s="";bytes.forEach(b=>s+=String.fromCharCode(b));return btoa(s);
}
function b64ToBytes(s){
  const raw=atob(s);return Uint8Array.from(raw,c=>c.charCodeAt(0));
}
async function deriveIdentityKey(passphrase,salt){
  const enc=new TextEncoder();
  const material=await crypto.subtle.importKey("raw",enc.encode(passphrase),"PBKDF2",false,["deriveKey"]);
  return crypto.subtle.deriveKey(
    {name:"PBKDF2",salt,iterations:180000,hash:"SHA-256"},
    material,{name:"AES-GCM",length:256},false,["encrypt","decrypt"]
  );
}
async function encryptIdentity(value,passphrase){
  if(!window.crypto?.subtle)throw new Error("此瀏覽器不支援 Web Crypto 加密");
  const enc=new TextEncoder();
  const salt=crypto.getRandomValues(new Uint8Array(16));
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const key=await deriveIdentityKey(passphrase,salt);
  const cipher=new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv},key,enc.encode(value)));
  return {v:1,salt:bytesToB64(salt),iv:bytesToB64(iv),cipher:bytesToB64(cipher),mask:maskIdentity(value)};
}
async function decryptIdentity(obj,passphrase){
  if(!window.crypto?.subtle)throw new Error("此瀏覽器不支援 Web Crypto 解密");
  const salt=b64ToBytes(obj.salt),iv=b64ToBytes(obj.iv),cipher=b64ToBytes(obj.cipher);
  const key=await deriveIdentityKey(passphrase,salt);
  const plain=await crypto.subtle.decrypt({name:"AES-GCM",iv},key,cipher);
  return new TextDecoder().decode(plain);
}
function getIdentityPrefs(){
  try{
    return JSON.parse(localStorage.getItem(ID_PREF_KEY)||"{}");
  }catch(e){return{}}
}
function saveIdentityPrefs(){
  const p={
    storageMode:$("identityStorageMode").value,
    fillMode:$("identityFillMode").value,
    identityType:$("identityType").value
  };
  localStorage.setItem(ID_PREF_KEY,JSON.stringify(p));
}
function updateIdentityModeUI(){
  const enc=$("identityStorageMode").value==="encrypted";
  document.querySelectorAll(".encrypted-only").forEach(el=>el.classList.toggle("hidden",!enc));
  refreshIdentityBadge();
}
function refreshIdentityBadge(){
  const mode=$("identityStorageMode").value;
  let text="未保存",klass="badge badge-neutral";
  if(mode==="session" && (sessionStorage.getItem(ID_SESSION_KEY)||unlockedIdentity)){
    text="本次暫存";klass="badge badge-amber";
  }else if(mode==="encrypted"){
    try{
      const obj=JSON.parse(localStorage.getItem(ID_SECURE_KEY)||"null");
      if(obj){text=unlockedIdentity?"已解鎖":"已加密保存";klass="badge badge-green";}
    }catch(e){}
  }else if(mode==="none" && $("identityNumber").value){
    text="僅目前畫面";klass="badge badge-blue";
  }
  $("identityBadge").textContent=text;
  $("identityBadge").className=klass;
}
function loadIdentitySettings(){
  const p=getIdentityPrefs();
  $("identityStorageMode").value=p.storageMode||"none";
  $("identityFillMode").value=p.fillMode||"prompt";
  $("identityType").value=p.identityType||"twid";
  if($("identityStorageMode").value==="session"){
    const v=sessionStorage.getItem(ID_SESSION_KEY)||"";
    $("identityNumber").value=v;
    unlockedIdentity=v;
  }else if($("identityStorageMode").value==="encrypted"){
    $("identityNumber").value="";
    unlockedIdentity="";
    try{
      const obj=JSON.parse(localStorage.getItem(ID_SECURE_KEY)||"null");
      if(obj)$("identityStatus").textContent="已找到本機加密資料："+(obj.mask||"已保存")+"；請輸入解鎖碼後按「解鎖」。";
    }catch(e){}
  }
  updateIdentityModeUI();
  renderAutofillSummary();
}
async function saveIdentitySettings(){
  const mode=$("identityStorageMode").value;
  const fillMode=$("identityFillMode").value;
  let value=$("identityNumber").value.trim().toUpperCase();
  const type=$("identityType").value;
  saveIdentityPrefs();

  if(value && type==="twid" && !validateTaiwanId(value)){
    $("identityStatus").textContent="身分證格式或檢查碼不正確，請確認後再儲存。";
    return;
  }

  if(mode==="none"){
    sessionStorage.removeItem(ID_SESSION_KEY);
    localStorage.removeItem(ID_SECURE_KEY);
    unlockedIdentity=value;
    $("identityStatus").textContent=value?"✓ 僅保留在目前畫面，不寫入瀏覽器儲存空間":"✓ 已設定為不保存";
  }else if(mode==="session"){
    if(!value){$("identityStatus").textContent="請先輸入身分證資料";return;}
    localStorage.removeItem(ID_SECURE_KEY);
    sessionStorage.setItem(ID_SESSION_KEY,value);
    unlockedIdentity=value;
    $("identityStatus").textContent="✓ 已設定為本次暫存；一般不會寫入長期 localStorage";
  }else if(mode==="encrypted"){
    if(!value){$("identityStatus").textContent="請先輸入要加密保存的身分證資料";return;}
    const pass=$("identityPassphrase").value;
    if(pass.length<6){$("identityStatus").textContent="加密解鎖碼至少需要 6 碼";return;}
    try{
      const obj=await encryptIdentity(value,pass);
      localStorage.setItem(ID_SECURE_KEY,JSON.stringify(obj));
      sessionStorage.removeItem(ID_SESSION_KEY);
      unlockedIdentity=value;
      $("identityNumber").value=value;
      $("identityStatus").textContent="✓ 身分證已使用 AES-GCM 加密保存於此裝置："+obj.mask;
    }catch(e){
      $("identityStatus").textContent="加密保存失敗："+e.message;
    }
  }
  refreshIdentityBadge();
  renderAutofillSummary();
}
async function unlockIdentity(){
  const pass=$("identityPassphrase").value;
  if(!pass){$("identityStatus").textContent="請輸入本機加密解鎖碼";return;}
  try{
    const obj=JSON.parse(localStorage.getItem(ID_SECURE_KEY)||"null");
    if(!obj){$("identityStatus").textContent="目前沒有已加密保存的身分證資料";return;}
    const value=await decryptIdentity(obj,pass);
    unlockedIdentity=value;
    $("identityNumber").value=value;
    $("identityStatus").textContent="✓ 已解鎖："+maskIdentity(value);
    refreshIdentityBadge();
    renderAutofillSummary();
  }catch(e){
    unlockedIdentity="";
    $("identityStatus").textContent="解鎖失敗，請確認解鎖碼。";
  }
}
function clearIdentityData(){
  if(!confirm("確定清除本機已保存／暫存的身分證資料？"))return;
  sessionStorage.removeItem(ID_SESSION_KEY);
  localStorage.removeItem(ID_SECURE_KEY);
  unlockedIdentity="";
  $("identityNumber").value="";
  $("identityPassphrase").value="";
  $("identityStatus").textContent="✓ 身分證資料已清除";
  refreshIdentityBadge();
  renderAutofillSummary();
}
async function copyIdentity(){
  const value=$("identityNumber").value.trim()||unlockedIdentity||sessionStorage.getItem(ID_SESSION_KEY)||"";
  if(!value){$("identityStatus").textContent="目前沒有可複製的身分證資料";return;}
  await copyText(value,$("identityStatus"),"已複製身分證；使用後建議再複製其他文字覆蓋剪貼簿");
}
function identityForAutofill(){
  return $("identityNumber").value.trim()||unlockedIdentity||sessionStorage.getItem(ID_SESSION_KEY)||"";
}
function renderAutofillSummary(){
  if(!$("autofillSummary"))return;
  const t=currentTarget();
  const fillMode=$("identityFillMode")?.value||"prompt";
  const id=identityForAutofill();
  const identityText=fillMode==="off"?"身分證不帶入":fillMode==="prompt"?"身分證執行時詢問":("身分證自動預填："+(id?maskIdentity(id):"尚未準備"));
  $("autofillSummary").textContent=t
    ? `${t.origin} → ${t.destination}｜${fmtDate(t.departDate)} ${t.departTime}｜${passengerText(t)}｜${assistantRuleText(t)}｜${identityText}`
    : "尚未設定主攻行程。";
}
function jsQuote(v){return JSON.stringify(String(v??""))}

function buildAutofillBookmarklet(){
  const t=currentTarget();
  if(!t)throw new Error("請先設定主攻行程");
  const fillMode=$("identityFillMode").value;
  let idValue="";
  if(fillMode==="prefill"){
    idValue=identityForAutofill();
    if(!idValue)throw new Error("已選擇身分證自動預填，但目前尚未準備或解鎖身分證資料");
  }
  const data={
    v:2,tripType:t.tripType,origin:t.origin,destination:t.destination,
    departDate:t.departDate,departTime:t.departTime,returnDate:t.returnDate||"",returnTime:t.returnTime||"",
    adultCount:t.adultCount||0,childCount:t.childCount||0,seniorCount:t.seniorCount||0,
    disabledCount:t.disabledCount||0,studentCount:t.studentCount||0,
    carClass:t.carClass||"不限",seatPreference:t.seatPreference||"不限",
    assistLevel:t.assistLevel||"select",trainRule:t.trainRule||"after",
    trainNo1:t.trainNo1||"",trainNo2:t.trainNo2||"",trainNo3:t.trainNo3||"",
    timeTolerance:Number(t.timeTolerance)||60,autoNextAfterTrain:t.autoNextAfterTrain||"stop",
    identityFillMode:fillMode,identity:idValue
  };
  const payload=JSON.stringify(data);
  const code=`(function(){
const KEY='THSR_PWA_AUTO_V2';
const D=${payload};
try{sessionStorage.setItem(KEY,JSON.stringify(D))}catch(e){}
const P=(()=>{try{return JSON.parse(sessionStorage.getItem(KEY)||'null')||D}catch(e){return D}})();
function norm(s){return String(s||'').replace(/\\s+/g,'').toLowerCase()}
function vis(e){if(!e)return false;const r=e.getBoundingClientRect();return r.width>0&&r.height>0}
function textOf(e){let s=(e.innerText||'')+' '+(e.textContent||'')+' '+(e.name||'')+' '+(e.id||'')+' '+(e.placeholder||'')+' '+(e.getAttribute?.('aria-label')||'');if(e.id){try{const l=document.querySelector('label[for="'+CSS.escape(e.id)+'"]');if(l)s+=' '+(l.innerText||'')}catch(x){}}let p=e.parentElement;for(let i=0;i<2&&p;i++,p=p.parentElement)s+=' '+(p.innerText||'');return norm(s)}
function fire(e){['input','change','blur'].forEach(t=>e.dispatchEvent(new Event(t,{bubbles:true})))}
function setNativeValue(e,v){const proto=Object.getPrototypeOf(e),desc=Object.getOwnPropertyDescriptor(proto,'value');if(desc&&desc.set)desc.set.call(e,v);else e.value=v;fire(e)}
function findInput(keys){const els=[...document.querySelectorAll('input:not([type=hidden]):not([type=radio]):not([type=checkbox]):not([type=file]),textarea')].filter(vis);return els.find(e=>keys.some(k=>textOf(e).includes(norm(k))))||null}
function fillInput(keys,val){if(val===undefined||val===null||val==='')return false;const e=findInput(keys);if(!e)return false;e.focus();setNativeValue(e,String(val));return true}
function chooseSelect(keys,val){if(val===undefined||val===null||val==='')return false;for(const e of [...document.querySelectorAll('select')].filter(vis)){if(!keys.some(k=>textOf(e).includes(norm(k))))continue;const target=norm(val);const opt=[...e.options].find(o=>norm(o.textContent).includes(target)||norm(o.value)===target);if(opt){e.value=opt.value;fire(e);return true}}return false}
function clickText(words,exclude=[]){const arr=Array.isArray(words)?words:[words];for(const e of [...document.querySelectorAll('button,a,input[type=button],input[type=submit],label,[role=button]')].filter(vis)){const t=norm(e.innerText||e.value||e.textContent||'');if(exclude.some(x=>t.includes(norm(x))))continue;if(arr.some(w=>t===norm(w)||t.includes(norm(w)))){e.click();return true}}return false}
function selectRadioByText(val){if(!val)return false;for(const r of [...document.querySelectorAll('input[type=radio]')].filter(vis)){if(textOf(r).includes(norm(val))){r.click();fire(r);return true}}return clickText(val)}
function hmToMin(v){const m=String(v||'').match(/(\\d{1,2}):(\\d{2})/);return m?Number(m[1])*60+Number(m[2]):null}
function parseRowTime(txt){const m=String(txt||'').match(/\\b([01]?\\d|2[0-3]):([0-5]\\d)\\b/);return m?Number(m[1])*60+Number(m[2]):null}
function rowTrainNo(txt){const m=String(txt||'').match(/(?:車次|班次)?\\s*([0-9]{3,4})\\b/);return m?m[1]:''}
function candidateRows(){return [...document.querySelectorAll('tr,li,.train,.train-row,.result-row,.ticket-row,.card,[role=row]')].filter(e=>{if(!vis(e))return false;const t=e.innerText||e.textContent||'';return /\\b([01]?\\d|2[0-3]):[0-5]\\d\\b/.test(t)&&t.length<1200})}
function chooseTrain(){const rows=candidateRows();if(!rows.length)return{ok:false,msg:'尚未偵測到車次結果'};let chosen=null;if(P.trainRule==='specific'){const wanted=[P.trainNo1,P.trainNo2,P.trainNo3].map(x=>String(x||'').replace(/^0+/,'')).filter(Boolean);for(const w of wanted){chosen=rows.find(r=>{const no=rowTrainNo(r.innerText||r.textContent||'').replace(/^0+/,'');return no===w||norm(r.innerText).includes(norm(w))});if(chosen)break}}else{const target=hmToMin(P.departTime),tol=Number(P.timeTolerance)||60;const scored=rows.map(r=>{const tm=parseRowTime(r.innerText||r.textContent||'');if(tm===null||target===null)return null;let score;if(P.trainRule==='after'){const delta=tm-target;if(delta<0||delta>tol)return null;score=delta}else{const delta=Math.abs(tm-target);if(delta>tol)return null;score=delta}return{r,score,tm}}).filter(Boolean).sort((a,b)=>a.score-b.score);chosen=scored[0]?.r||null}if(!chosen)return{ok:false,msg:'沒有符合預設選車規則的車次，請手動選擇'};const radio=chosen.querySelector('input[type=radio],input[type=checkbox]'),btn=chosen.querySelector('button,[role=button]');if(radio){radio.click();fire(radio)}else if(btn)btn.click();else chosen.click();chosen.style.outline='3px solid #d71920';chosen.scrollIntoView({behavior:'smooth',block:'center'});return{ok:true,msg:'已依規則選擇車次；請核對畫面'}}
function hasFinalDanger(){const body=norm(document.body.innerText||'');return['確認訂位','確認送出','完成訂位','立即付款','信用卡付款','付款資訊','交易確認'].some(x=>body.includes(norm(x)))}
function hasCaptcha(){const body=norm(document.body.innerText||'');return body.includes('驗證碼')||!!document.querySelector('img[src*="captcha" i],input[name*="captcha" i],input[id*="captcha" i]')}
function showPanel(msg){let p=document.getElementById('thsr-pwa-helper-v2');if(!p){p=document.createElement('div');p.id='thsr-pwa-helper-v2';p.style.cssText='position:fixed;z-index:2147483647;left:12px;right:12px;bottom:12px;background:#101820;color:#fff;border:2px solid #d71920;border-radius:14px;padding:12px;font:14px/1.5 system-ui;box-shadow:0 8px 30px rgba(0,0,0,.35)';const close=document.createElement('button');close.textContent='關閉助手';close.style.cssText='float:right;background:#fff;color:#111;border:0;border-radius:8px;padding:7px 10px;font-weight:700';close.onclick=()=>p.remove();p.appendChild(close);const title=document.createElement('b');title.textContent='高鐵 v2.0 半自動訂位助手';title.style.display='block';title.style.marginBottom='5px';p.appendChild(title);const s=document.createElement('div');s.id='thsr-pwa-helper-status';p.appendChild(s);document.body.appendChild(p)}const s=document.getElementById('thsr-pwa-helper-status');if(s)s.textContent=msg}
function fillStage(){let n=0;n+=chooseSelect(['出發站','起程站','起站','起程','from'],P.origin)?1:0;n+=chooseSelect(['到達站','迄站','終點','到站','to'],P.destination)?1:0;if(!n){n+=clickText(P.origin)?1:0;n+=clickText(P.destination)?1:0}n+=fillInput(['去程日期','乘車日期','出發日期','departdate'],P.departDate)?1:0;n+=fillInput(['去程時間','出發時間','departtime'],P.departTime)?1:0;if(P.tripType==='roundtrip'){selectRadioByText('去回程');n+=fillInput(['回程日期','returndate'],P.returnDate)?1:0;n+=fillInput(['回程時間','returntime'],P.returnTime)?1:0}else selectRadioByText('單程');n+=chooseSelect(['全票','成人','adult'],String(P.adultCount))?1:0;n+=chooseSelect(['孩童','兒童','child'],String(P.childCount))?1:0;n+=chooseSelect(['敬老','senior'],String(P.seniorCount))?1:0;n+=chooseSelect(['愛心','disabled'],String(P.disabledCount))?1:0;n+=chooseSelect(['大學生','student'],String(P.studentCount))?1:0;if(P.carClass&&P.carClass!=='不限')selectRadioByText(P.carClass);if(P.seatPreference&&P.seatPreference!=='不限')selectRadioByText(P.seatPreference);let id=P.identity||'';if(P.identityFillMode==='prompt'&&!id)id=prompt('請輸入本次訂票的身分證／證件號碼：')||'';if(P.identityFillMode!=='off'&&id)n+=fillInput(['身分證','身分證字號','證件號碼','證號','idno','idnumber'],id)?1:0;return n}
function run(){if(hasFinalDanger()){showPanel('已偵測到最終確認／付款階段。助手依安全設定停止，請您本人逐項核對後操作。');return}if(hasCaptcha()){showPanel('偵測到驗證碼／人工驗證。請先由您本人完成，完成後可再次執行助手。');return}const n=fillStage();if(P.assistLevel==='fill'){showPanel('已嘗試填入 '+n+' 個欄位。模式為只自動填表，請核對後手動繼續。');return}const rows=candidateRows();if(rows.length){if(P.assistLevel==='select'){const r=chooseTrain();if(!r.ok){showPanel(r.msg);return}if(P.autoNextAfterTrain==='next'){setTimeout(()=>{if(hasFinalDanger()){showPanel('已到最終確認附近，助手停止。');return}const ok=clickText(['下一步','下一頁','繼續'],['確認','送出','付款','完成']);showPanel(ok?'已選車並嘗試進入下一步；若換頁請再按一次助手。':'已選車，未找到安全的下一步按鈕，請手動繼續。')},500)}else showPanel(r.msg+'；依設定停下讓您確認。')}else showPanel('已偵測到車次結果；目前模式不自動選車，請手動選擇。');return}const clicked=clickText(['查詢','搜尋','開始查詢','車次查詢','查詢車次'],['取消','返回']);if(clicked){showPanel('已填表並嘗試送出查詢，正在等待車次結果…');let tries=0;const timer=setInterval(()=>{tries++;if(hasFinalDanger()){clearInterval(timer);showPanel('偵測到確認階段，助手停止。');return}const rs=candidateRows();if(rs.length||tries>30){clearInterval(timer);if(rs.length&&P.assistLevel==='select'){const r=chooseTrain();showPanel(r.msg+(r.ok?'；請核對後再繼續。':''))}else if(rs.length)showPanel('車次結果已出現，請手動選車。');else showPanel('等待車次結果逾時，請檢查官網畫面後再次執行助手。')}},500)}else showPanel('已嘗試填入 '+n+' 個欄位，但未安全辨識到查詢按鈕。請手動按查詢；下一頁可再次執行助手。')}
showPanel('助手已啟動，正在辨識目前頁面…');run();
})();`;
  return "javascript:"+code.replace(/\n/g,"").replace(/\s{2,}/g," ");
}

function buildDiagnosticBookmarklet(){
  const code=`(function(){
function v(e){const r=e.getBoundingClientRect();return r.width>0&&r.height>0}
function clean(s){return String(s||'').replace(/\\s+/g,' ').trim()}
const fields=[...document.querySelectorAll('input,select,textarea')].filter(v).slice(0,120).map((e,i)=>({i,tag:e.tagName,type:e.type||'',name:e.name||'',id:e.id||'',placeholder:e.placeholder||'',aria:e.getAttribute('aria-label')||'',options:e.tagName==='SELECT'?[...e.options].slice(0,20).map(o=>clean(o.textContent)):undefined}));
const buttons=[...document.querySelectorAll('button,a,input[type=button],input[type=submit],[role=button]')].filter(v).slice(0,120).map((e,i)=>({i,tag:e.tagName,id:e.id||'',name:e.name||'',text:clean(e.innerText||e.value||e.textContent||'').slice(0,160)}));
const out='【THSR 官網頁面診斷】\\nURL：'+location.href+'\\n\\n【欄位】\\n'+JSON.stringify(fields,null,2)+'\\n\\n【按鈕】\\n'+JSON.stringify(buttons,null,2);
if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(out).then(()=>alert('診斷結果已複製。請貼回 ChatGPT。')).catch(()=>prompt('請複製以下診斷結果：',out))}else prompt('請複製以下診斷結果：',out);
})();`;
  return "javascript:"+code.replace(/\n/g,"").replace(/\s{2,}/g," ");
}
async function copyDiagnosticBookmarklet(){const code=buildDiagnosticBookmarklet();$("autofillCode").textContent=code;await copyText(code,$("autofillStatus"),"已複製官網診斷工具")}
async function copyAutofillBookmarklet(){
  const fillMode=$("identityFillMode").value;
  if(fillMode==="prefill"){
    const id=identityForAutofill();
    if(!id){$("autofillStatus").textContent="請先準備／解鎖身分證資料";return}
    const ok=confirm("「自動預填」會把身分證明文嵌入這次產生的助手程式並放入剪貼簿／書籤。若重視隱私，建議改選「執行時再詢問」。確定繼續嗎？");
    if(!ok)return;
  }
  try{const code=buildAutofillBookmarklet();$("autofillCode").textContent=code;await copyText(code,$("autofillStatus"),"已複製 v2 半自動訂位助手")}catch(e){$("autofillStatus").textContent=e.message}
}

function fillStations(){const options='<option value="">請選擇</option>'+stations.map(s=>`<option value="${s}">${s}</option>`).join("");$("origin").innerHTML=options;$("destination").innerHTML=options}
function collectForm(){return{id:$("editingId").value||uid(),tripName:$("tripName").value.trim(),tripType:$("tripType").value,origin:$("origin").value,destination:$("destination").value,departDate:$("departDate").value,departTime:$("departTime").value,returnDate:$("returnDate").value,returnTime:$("returnTime").value,carClass:$("carClass").value,saleOpenAt:$("saleOpenAt").value,assistLevel:$("assistLevel").value,trainRule:$("trainRule").value,trainNo1:$("trainNo1").value.trim(),trainNo2:$("trainNo2").value.trim(),trainNo3:$("trainNo3").value.trim(),timeTolerance:Number($("timeTolerance").value)||60,seatPreference:$("seatPreference").value,autoNextAfterTrain:$("autoNextAfterTrain").value,adultCount:Number($("adultCount").value)||0,childCount:Number($("childCount").value)||0,seniorCount:Number($("seniorCount").value)||0,disabledCount:Number($("disabledCount").value)||0,studentCount:Number($("studentCount").value)||0,status:$("tripStatus").value,reservationCode:$("reservationCode").value.trim(),paymentDeadline:$("paymentDeadline").value,note:$("note").value.trim()}}
function clearForm(){$("editingId").value="";$("tripName").value="";$("tripType").value="oneway";$("origin").value="";$("destination").value="";$("departDate").value="";$("departTime").value="09:00";$("returnDate").value="";$("returnTime").value="18:00";$("carClass").value="不限";$("saleOpenAt").value="";$("assistLevel").value="select";$("trainRule").value="after";$("trainNo1").value="";$("trainNo2").value="";$("trainNo3").value="";$("timeTolerance").value=60;$("seatPreference").value="不限";$("autoNextAfterTrain").value="stop";$("adultCount").value=1;["childCount","seniorCount","disabledCount","studentCount"].forEach(id=>$(id).value=0);$("tripStatus").value="計畫中";$("reservationCode").value="";$("paymentDeadline").value="";$("note").value="";toggleReturnFields();updatePassengerHint();$("formStatus").textContent=""}
function loadTripToForm(id){const t=state.trips.find(x=>x.id===id);if(!t)return;Object.keys(t).forEach(k=>{const el=$(k);if(el)el.value=t[k]});$("editingId").value=t.id;$("tripType").value=t.tripType||"oneway";toggleReturnFields();updatePassengerHint();$("tripFormCard").scrollIntoView({behavior:"smooth",block:"start"});$("formStatus").textContent="正在編輯："+(t.tripName||t.origin+" → "+t.destination)}
function toggleReturnFields(){const show=$("tripType").value==="roundtrip";document.querySelectorAll(".return-field").forEach(el=>el.style.display=show?"flex":"none")}
function updatePassengerHint(){const t=collectForm();const total=passengerTotal(t);const limit=t.tripType==="roundtrip"?5:10;$("passengerHint").textContent=`目前共 ${total} 位；此行程模式建議上限 ${limit} 位。`}
function saveTrip(){const t=collectForm();const err=validateTrip(t);if(err){$("formStatus").textContent=err;return}const i=state.trips.findIndex(x=>x.id===t.id);if(i>=0){t.createdAt=state.trips[i].createdAt;t.updatedAt=nowISO();state.trips[i]=t}else{t.createdAt=nowISO();t.updatedAt=nowISO();state.trips.push(t)}if(!state.targetId)state.targetId=t.id;saveState();$("formStatus").textContent=i>=0?"✓ 行程已更新":"✓ 行程已新增";clearForm();renderAll()}
function deleteTrip(id){const t=state.trips.find(x=>x.id===id);if(!t)return;if(!confirm(`確定刪除「${t.tripName||t.origin+" → "+t.destination}」？`))return;state.trips=state.trips.filter(x=>x.id!==id);if(state.targetId===id)state.targetId=state.trips[0]?.id||"";saveState();renderAll()}
function duplicateTrip(id){const t=state.trips.find(x=>x.id===id);if(!t)return;const copy={...t,id:uid(),tripName:(t.tripName||t.origin+"-"+t.destination)+" 複製",status:"計畫中",reservationCode:"",paymentDeadline:"",createdAt:nowISO(),updatedAt:nowISO()};state.trips.push(copy);saveState();renderAll()}
function setTarget(id){state.targetId=id;sentReminders.clear();saveState();renderAll();$("targetCard").scrollIntoView({behavior:"smooth",block:"start"})}
function setStatus(id,status){const t=state.trips.find(x=>x.id===id);if(!t)return;t.status=status;t.updatedAt=nowISO();saveState();renderAll()}
function statusBadgeClass(status){if(["已付款","已取票"].includes(status))return"badge-green";if(["待開賣","待訂票","已訂位"].includes(status))return"badge-amber";if(status==="已取消")return"badge-neutral";return"badge-blue"}

function renderTrips(){const filter=$("statusFilter").value,targetId=state.targetId;let list=state.trips.slice();if(filter!=="all")list=list.filter(t=>t.status===filter);$("tripCount").textContent=state.trips.length+" 筆";$("tripList").innerHTML="";if(!list.length){$("tripList").innerHTML='<div class="empty">尚無符合條件的行程。</div>';return}list.forEach(t=>{const div=document.createElement("div");div.className="trip"+(t.id===targetId?" target":"");const title=esc(t.tripName||"未命名行程"),route=esc(t.origin)+" → "+esc(t.destination);const travel=`${esc(fmtDate(t.departDate))} ${esc(t.departTime)}`+(t.tripType==="roundtrip"?` ｜ 回程 ${esc(fmtDate(t.returnDate))} ${esc(t.returnTime)}`:"");const sale=t.saleOpenAt?`開賣提醒：${esc(fmtDateTime(t.saleOpenAt))}`:"未設定開賣提醒";const autoRule=`助手：${esc(t.assistLevel||"select")}｜${esc(assistantRuleText(t))}`;const res=t.reservationCode?` ｜ 訂位代號：${esc(t.reservationCode)}`:"";div.innerHTML=`<div><div class="trip-title">${title}</div><div class="route-line">${route}</div><div class="trip-meta">${travel}<br>${sale}<br>${autoRule}<br>${esc(passengerText(t))} ｜ ${esc(t.carClass)}${res}</div><div class="trip-badges"><span class="badge ${statusBadgeClass(t.status)}">${esc(t.status)}</span>${t.id===targetId?'<span class="badge badge-red">目前主攻</span>':""}</div></div><div class="trip-actions"><button class="btn soft mini action-target" data-id="${t.id}" ${t.id===targetId?"disabled":""}>${t.id===targetId?"主攻中":"設為主攻"}</button><button class="btn accent mini action-book" data-id="${t.id}">官方訂票</button><button class="btn soft mini action-edit" data-id="${t.id}">編輯</button><button class="btn soft mini action-dup" data-id="${t.id}">複製行程</button><select class="action-status" data-id="${t.id}">${statusList.map(s=>`<option value="${s}" ${s===t.status?"selected":""}>${s}</option>`).join("")}</select><button class="btn danger mini action-delete" data-id="${t.id}">刪除</button></div>`;$("tripList").appendChild(div)});document.querySelectorAll(".action-target").forEach(b=>b.onclick=()=>setTarget(b.dataset.id));document.querySelectorAll(".action-book").forEach(b=>b.onclick=()=>bookTrip(b.dataset.id));document.querySelectorAll(".action-edit").forEach(b=>b.onclick=()=>loadTripToForm(b.dataset.id));document.querySelectorAll(".action-dup").forEach(b=>b.onclick=()=>duplicateTrip(b.dataset.id));document.querySelectorAll(".action-delete").forEach(b=>b.onclick=()=>deleteTrip(b.dataset.id));document.querySelectorAll(".action-status").forEach(s=>s.onchange=()=>setStatus(s.dataset.id,s.value))}
function renderTarget(){const t=currentTarget(),panel=$("targetPanel");if(!t){$("targetRoute").textContent="尚未設定行程";$("targetMeta").textContent="先在下方新增行程。";$("targetStatusBadge").textContent="尚未設定";$("targetStatusBadge").className="badge badge-neutral";["cdDays","cdHours","cdMinutes","cdSeconds"].forEach(id=>$(id).textContent="--");$("countdownLabel").textContent="尚未設定開賣提醒時間";panel.className="target-panel";renderQuickCopy();return}$("targetRoute").textContent=t.origin+" → "+t.destination;$("targetMeta").textContent=[t.tripName,"去程 "+fmtDate(t.departDate)+" "+t.departTime,t.tripType==="roundtrip"?"回程 "+fmtDate(t.returnDate)+" "+t.returnTime:"",passengerText(t),t.carClass].filter(Boolean).join(" ｜ ");$("targetStatusBadge").textContent=t.status;$("targetStatusBadge").className="badge "+statusBadgeClass(t.status);renderCountdown();renderQuickCopy()}
function renderCountdown(){const t=currentTarget(),panel=$("targetPanel");if(!t||!t.saleOpenAt){["cdDays","cdHours","cdMinutes","cdSeconds"].forEach(id=>$(id).textContent="--");$("countdownLabel").textContent="未設定開賣／搶票提醒時間";panel.className="target-panel";return}const ms=new Date(t.saleOpenAt).getTime()-Date.now();if(["已付款","已取票"].includes(t.status)){["cdDays","cdHours","cdMinutes","cdSeconds"].forEach(id=>$(id).textContent="00");$("countdownLabel").textContent="此行程已完成主要訂票流程";panel.className="target-panel done";return}if(ms<=0){["cdDays","cdHours","cdMinutes","cdSeconds"].forEach(id=>$(id).textContent="00");$("countdownLabel").textContent="設定的開賣／搶票時間已到";panel.className="target-panel open";triggerReminder("open",0,t);return}const total=Math.floor(ms/1000),d=Math.floor(total/86400),h=Math.floor((total%86400)/3600),m=Math.floor((total%3600)/60),s=total%60;$("cdDays").textContent=String(d).padStart(2,"0");$("cdHours").textContent=String(h).padStart(2,"0");$("cdMinutes").textContent=String(m).padStart(2,"0");$("cdSeconds").textContent=String(s).padStart(2,"0");if(ms<=10*60*1000){panel.className="target-panel ready";$("countdownLabel").textContent="已進入開賣前 10 分鐘準備模式"}else{panel.className="target-panel";$("countdownLabel").textContent="距離設定的開賣／搶票時間"}[["30",30,$("rem30").checked],["10",10,$("rem10").checked],["5",5,$("rem5").checked],["1",1,$("rem1").checked]].forEach(([key,min,on])=>{if(on&&ms<=min*60000&&ms>(min*60000-1500))triggerReminder(key,min,t)})}
function renderQuickCopy(){const t=currentTarget(),box=$("quickCopyList");box.innerHTML="";if(!t){box.innerHTML='<div class="empty">設定主攻行程後，這裡會出現快速複製欄位。</div>';return}const items=[["出發站",t.origin],["到達站",t.destination],["去程日期",t.departDate],["去程時間",t.departTime],["乘客",passengerText(t)],["車廂",t.carClass]];if(t.tripType==="roundtrip")items.push(["回程日期",t.returnDate],["回程時間",t.returnTime]);if(t.reservationCode)items.push(["訂位代號",t.reservationCode]);items.forEach(([label,value])=>{const div=document.createElement("div");div.className="quick";div.innerHTML=`<div><b>${esc(label)}</b><span>${esc(value||"未設定")}</span></div><button class="btn soft mini">複製</button>`;div.querySelector("button").onclick=()=>copyText(value,$("targetStatus"),"已複製"+label);box.appendChild(div)})}
function renderAll(){renderTrips();renderTarget();renderAutofillSummary()}
async function bookTrip(id){const t=state.trips.find(x=>x.id===id);if(!t)return;await copyText(tripSummary(t),$("targetStatus"),"已複製行程摘要");window.open(BOOKING_URL,"_blank","noopener")}
async function bookTarget(){const t=currentTarget();if(!t){$("targetStatus").textContent="請先設定主攻行程";return}try{if($("identityFillMode").value==="prefill"&&!identityForAutofill()){$("targetStatus").textContent="身分證設定為自動預填，但目前尚未準備／解鎖；請先處理身分證資料。";return}const helper=buildAutofillBookmarklet();await copyText(helper,$("targetStatus"),"已複製 v2 訂位助手；官網開啟後請執行您的高鐵訂位助手書籤");window.open(BOOKING_URL,"_blank","noopener")}catch(e){$("targetStatus").textContent=e.message}}
function sortBySale(){state.trips.sort((a,b)=>{const A=a.saleOpenAt?new Date(a.saleOpenAt).getTime():Infinity,B=b.saleOpenAt?new Date(b.saleOpenAt).getTime():Infinity;return A-B});saveState();renderTrips()}
function sortByTravel(){state.trips.sort((a,b)=>new Date(a.departDate+"T"+a.departTime)-new Date(b.departDate+"T"+b.departTime));saveState();renderTrips()}
function regularOpenReference(){
  const input=$("departDate");
  const today=new Date();
  const target=new Date(today.getFullYear(),today.getMonth(),today.getDate()+28);
  const z=n=>String(n).padStart(2,"0");
  const value=target.getFullYear()+"-"+z(target.getMonth()+1)+"-"+z(target.getDate());
  input.value=value;
  input.dispatchEvent(new Event("input",{bubbles:true}));
  input.dispatchEvent(new Event("change",{bubbles:true}));
  $("formStatus").textContent=`✓ 已計算今日＋28天：${value}，已帶入去程日期；可直接確認或改選日期`;
  setTimeout(()=>{
    try{
      if(typeof input.showPicker==="function") input.showPicker();
      else{input.focus();input.click();}
    }catch(e){
      input.focus();
    }
  },80);
}

function savePrefs(){localStorage.setItem(PREFS,JSON.stringify({rem30:$("rem30").checked,rem10:$("rem10").checked,rem5:$("rem5").checked,rem1:$("rem1").checked,notify:$("notifyToggle").checked,vibrate:$("vibrateToggle").checked,wake:$("wakeToggle").checked,sound:$("soundToggle").checked}))}
function loadPrefs(){try{const p=JSON.parse(localStorage.getItem(PREFS)||"{}");["rem30","rem10","rem5","rem1"].forEach(id=>{if(id in p)$(id).checked=!!p[id]});if("notify"in p)$("notifyToggle").checked=!!p.notify;if("vibrate"in p)$("vibrateToggle").checked=!!p.vibrate;if("wake"in p)$("wakeToggle").checked=!!p.wake;if("sound"in p)$("soundToggle").checked=!!p.sound}catch(e){}}
async function requestNotify(){if(!("Notification"in window)){ $("reminderStatus").textContent="此瀏覽器不支援網頁通知";return}const p=await Notification.requestPermission();$("notifyToggle").checked=p==="granted";savePrefs();$("reminderStatus").textContent=p==="granted"?"✓ 已允許通知":"通知權限未開啟"}
function beep(times=1){try{if(!audioCtx)audioCtx=new(window.AudioContext||window.webkitAudioContext)();for(let i=0;i<times;i++){const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.connect(g);g.connect(audioCtx.destination);o.frequency.value=880;g.gain.value=.07;o.start(audioCtx.currentTime+i*.35);o.stop(audioCtx.currentTime+i*.35+.18)}}catch(e){}}
function triggerReminder(key,mins,t){const token=t.id+":"+key;if(sentReminders.has(token))return;sentReminders.add(token);const title=mins===0?"高鐵搶票時間到了":`距離高鐵搶票提醒還有 ${mins} 分鐘`,body=t.origin+" → "+t.destination+"｜"+fmtDate(t.departDate)+" "+t.departTime;if($("notifyToggle").checked&&"Notification"in window&&Notification.permission==="granted"){try{new Notification(title,{body,icon:"./icon-192.png"})}catch(e){}}if($("vibrateToggle").checked&&navigator.vibrate)navigator.vibrate(mins===0?[300,120,300,120,500]:[180,100,180]);if($("soundToggle").checked)beep(mins===0?3:1);$("reminderStatus").textContent=title+"｜"+body;setTimeout(()=>$("reminderStatus").textContent="",4500)}
function testReminder(){if($("notifyToggle").checked&&"Notification"in window&&Notification.permission==="granted"){try{new Notification("高鐵極速訂票提醒測試",{body:"提醒功能測試成功",icon:"./icon-192.png"})}catch(e){}}if($("vibrateToggle").checked&&navigator.vibrate)navigator.vibrate([180,100,180]);if($("soundToggle").checked)beep(1);$("reminderStatus").textContent="✓ 已執行提醒測試"}
async function updateWake(){savePrefs();if($("wakeToggle").checked){if("wakeLock"in navigator){try{wakeLock=await navigator.wakeLock.request("screen");$("reminderStatus").textContent="✓ 已啟用保持螢幕喚醒";wakeLock.addEventListener("release",()=>{wakeLock=null})}catch(e){$("reminderStatus").textContent="無法啟用螢幕喚醒，可能是瀏覽器限制"}}else $("reminderStatus").textContent="此瀏覽器不支援保持螢幕喚醒"}else if(wakeLock){try{await wakeLock.release()}catch(e){}wakeLock=null}}
document.addEventListener("visibilitychange",async()=>{if(document.visibilityState==="visible"&&$("wakeToggle").checked&&!wakeLock)await updateWake()});

function icsEsc(s){return String(s||"").replace(/\\/g,"\\\\").replace(/\n/g,"\\n").replace(/,/g,"\\,").replace(/;/g,"\\;")}
function icsUTC(v){const d=v instanceof Date?v:new Date(v),z=n=>String(n).padStart(2,"0");return d.getUTCFullYear()+z(d.getUTCMonth()+1)+z(d.getUTCDate())+"T"+z(d.getUTCHours())+z(d.getUTCMinutes())+z(d.getUTCSeconds())+"Z"}
function downloadICS(filename,summary,start,end,description,url,alarms=[]){const valarms=alarms.map(m=>`BEGIN:VALARM\r\nTRIGGER:-PT${m}M\r\nACTION:DISPLAY\r\nDESCRIPTION:${icsEsc(summary)}\r\nEND:VALARM`).join("\r\n");const content=`BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//THSR Quick Booking PWA//ZH-TW\r\nCALSCALE:GREGORIAN\r\nBEGIN:VEVENT\r\nUID:thsr-${Date.now()}@quick-booking\r\nDTSTAMP:${icsUTC(new Date())}\r\nDTSTART:${icsUTC(start)}\r\nDTEND:${icsUTC(end)}\r\nSUMMARY:${icsEsc(summary)}\r\nDESCRIPTION:${icsEsc(description)}\r\nURL:${url}\r\n${valarms}\r\nEND:VEVENT\r\nEND:VCALENDAR`;const blob=new Blob([content],{type:"text/calendar;charset=utf-8"}),u=URL.createObjectURL(blob),a=document.createElement("a");a.href=u;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(u),1500)}
function targetSaleCalendar(){const t=currentTarget();if(!t||!t.saleOpenAt){$("targetStatus").textContent="請先設定主攻行程的開賣提醒時間";return}const start=new Date(t.saleOpenAt),end=new Date(start.getTime()+15*60000);downloadICS("高鐵開賣提醒.ics","高鐵開賣｜"+t.origin+"→"+t.destination,start,end,tripSummary(t),BOOKING_URL,[30,10,5,1]);$("targetStatus").textContent="✓ 已產生開賣提醒行事曆檔"}
function targetTravelCalendar(){const t=currentTarget();if(!t)return;const start=new Date(t.departDate+"T"+t.departTime),end=new Date(start.getTime()+2*60*60000);downloadICS("高鐵乘車行程.ics","高鐵｜"+t.origin+"→"+t.destination,start,end,tripSummary(t),BOOKING_URL,[60,30]);$("targetStatus").textContent="✓ 已產生乘車行程行事曆檔"}

function exportData(){const payload={version:"flagship-v2.0",exportedAt:nowISO(),state,prefs:localStorage.getItem(PREFS)};const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json;charset=utf-8"}),u=URL.createObjectURL(blob),a=document.createElement("a");a.href=u;a.download="高鐵極速訂票PWA_備份.json";a.click();setTimeout(()=>URL.revokeObjectURL(u),1500);$("backupStatus").textContent="✓ 已匯出備份"}
function importData(file){const r=new FileReader();r.onload=()=>{try{const d=JSON.parse(r.result);if(!d?.state||!Array.isArray(d.state.trips))throw new Error("bad");state=d.state;saveState();if(d.prefs)localStorage.setItem(PREFS,d.prefs);loadPrefs();renderAll();$("backupStatus").textContent="✓ 備份已匯入"}catch(e){$("backupStatus").textContent="匯入失敗：不是本 PWA 的有效備份"}};r.readAsText(file)}
function resetAll(){if(!confirm("確定清除所有高鐵行程與設定？此動作無法復原。"))return;localStorage.removeItem(STORE);localStorage.removeItem(PREFS);localStorage.removeItem(ID_PREF_KEY);localStorage.removeItem(ID_SECURE_KEY);sessionStorage.removeItem(ID_SESSION_KEY);unlockedIdentity="";state={trips:[],targetId:""};clearForm();loadPrefs();loadIdentitySettings();renderAll();$("backupStatus").textContent="已清除全部資料"}

function bind(){
  $("tripType").onchange=()=>{toggleReturnFields();updatePassengerHint()};
  ["adultCount","childCount","seniorCount","disabledCount","studentCount"].forEach(id=>$(id).addEventListener("input",updatePassengerHint));
  document.querySelectorAll(".preset").forEach(b=>b.onclick=()=>{$("origin").value=b.dataset.from;$("destination").value=b.dataset.to});
  $("swapStations").onclick=()=>{const a=$("origin").value;$("origin").value=$("destination").value;$("destination").value=a};
  $("saveTrip").onclick=saveTrip;$("clearForm").onclick=clearForm;$("regularOpenRef").onclick=regularOpenReference;
  $("statusFilter").onchange=renderTrips;$("sortSale").onclick=sortBySale;$("sortTravel").onclick=sortByTravel;
  $("targetBookNow").onclick=bookTarget;$("targetCopySummary").onclick=()=>copyText(tripSummary(currentTarget()),$("targetStatus"),"已複製行程摘要");$("targetSaleCalendar").onclick=targetSaleCalendar;$("targetTravelCalendar").onclick=targetTravelCalendar;$("goTarget").onclick=()=>$("targetCard").scrollIntoView({behavior:"smooth",block:"start"});
  ["rem30","rem10","rem5","rem1","notifyToggle","vibrateToggle","soundToggle"].forEach(id=>$(id).addEventListener("change",savePrefs));$("wakeToggle").addEventListener("change",updateWake);$("requestNotify").onclick=requestNotify;$("testReminder").onclick=testReminder;
  
  $("identityStorageMode").addEventListener("change",()=>{saveIdentityPrefs();updateIdentityModeUI();renderAutofillSummary()});
  $("identityFillMode").addEventListener("change",()=>{saveIdentityPrefs();renderAutofillSummary()});
  $("identityType").addEventListener("change",saveIdentityPrefs);
  $("identityNumber").addEventListener("input",()=>{unlockedIdentity=$("identityNumber").value.trim();refreshIdentityBadge();renderAutofillSummary()});
  $("toggleIdentityVisibility").onclick=()=>{
    const input=$("identityNumber");
    input.type=input.type==="password"?"text":"password";
    $("toggleIdentityVisibility").textContent=input.type==="password"?"顯示":"隱藏";
  };
  $("saveIdentity").onclick=saveIdentitySettings;
  $("unlockIdentity").onclick=unlockIdentity;
  $("copyIdentity").onclick=copyIdentity;
  $("clearIdentity").onclick=clearIdentityData;
  $("copyAutofillBookmarklet").onclick=copyAutofillBookmarklet;$("copyDiagnosticBookmarklet").onclick=copyDiagnosticBookmarklet;
  $("toggleAutofillCode").onclick=()=>{$("autofillCode").style.display=$("autofillCode").style.display==="block"?"none":"block"};

  $("exportData").onclick=exportData;$("importDataBtn").onclick=()=>$("importFile").click();$("importFile").onchange=e=>{if(e.target.files[0])importData(e.target.files[0])};$("resetAll").onclick=resetAll;
  let deferredPrompt=null;window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();deferredPrompt=e});$("installBtn").onclick=async()=>{if(deferredPrompt){deferredPrompt.prompt();await deferredPrompt.userChoice;deferredPrompt=null}else $("installHelp").style.display=$("installHelp").style.display==="block"?"none":"block"};
}
function init(){fillStations();loadState();loadPrefs();bind();clearForm();loadIdentitySettings();renderAll();if("serviceWorker"in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("./service-worker.js"));setInterval(renderCountdown,1000)}
init();
})();
