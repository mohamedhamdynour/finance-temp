// ═══════════════════════════════════════════════════
//  SUPABASE & HELPERS
// ═══════════════════════════════════════════════════
let SB_URL=localStorage.getItem('sb_url')||'';
let SB_KEY=localStorage.getItem('sb_key')||'';
let supabaseClient=null;
let authSession=null;

function authHeaders(){
  const token=authSession?.access_token||SB_KEY;
  return{'Content-Type':'application/json','apikey':SB_KEY,'Authorization':'Bearer '+token,'Prefer':'return=representation'};
}
const api=async(path,method='GET',body=null)=>{
  const r=await fetch(SB_URL+'/rest/v1/'+path,{method,headers:authHeaders(),...(body?{body:JSON.stringify(body)}:{})});
  if(r.status===204)return null;
  const j=await r.json();
  if(!r.ok)throw new Error(JSON.stringify(j));
  return j;
};
const sbGet=(t,q='')=>api(t+q);
const sbPost=(t,b)=>api(t,'POST',b);
const sbPatch=(t,id,b)=>api(t+'?id=eq.'+id,'PATCH',b);
const sbDel=(t,id)=>api(t+'?id=eq.'+id,'DELETE');
const sbUpsert=async(t,b)=>{
  const r=await fetch(SB_URL+'/rest/v1/'+t,{method:'POST',headers:{...authHeaders(),'Prefer':'return=representation,resolution=merge-duplicates'},body:JSON.stringify(b)});
  const j=await r.json();if(!r.ok)throw new Error(JSON.stringify(j));return j;
};
// XSS-safe HTML escape
const escapeHtml=(s)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function showAuthError(id,msg){const el=document.getElementById(id);if(el)el.textContent=msg;}
function setAuthTab(tab){
  document.getElementById('auth-tab-login').classList.toggle('active',tab==='login');
  document.getElementById('auth-tab-signup').classList.toggle('active',tab==='signup');
  document.getElementById('auth-form-login').classList.toggle('hidden',tab!=='login');
  document.getElementById('auth-form-signup').classList.toggle('hidden',tab!=='signup');
  showAuthError('auth-error','');
}
function showAuthLoading(on){
  document.getElementById('auth-loading').classList.toggle('hidden',!on);
  document.getElementById('auth-step-connect').classList.toggle('hidden',on||!!SB_URL);
  document.getElementById('auth-step-login').classList.toggle('hidden',on||!SB_URL);
}
async function connectSupabase(){
  const url=document.getElementById('conn-url').value.trim().replace(/\/+$/,'');
  const key=document.getElementById('conn-key').value.trim();
  showAuthError('conn-error','');
  if(!url||!/^https?:\/\/.+/i.test(url))return showAuthError('conn-error','أدخل رابط Supabase صحيح (مثال: https://xxxx.supabase.co)');
  if(!key||key.length<20)return showAuthError('conn-error','أدخل المفتاح العام (anon key) الصحيح');
  SB_URL=url;SB_KEY=key;
  localStorage.setItem('sb_url',url);localStorage.setItem('sb_key',key);
  try{
    supabaseClient=window.supabase.createClient(SB_URL,SB_KEY);
  }catch(e){return showAuthError('conn-error','تعذّر الاتصال: '+e.message);}
  document.getElementById('auth-step-connect').classList.add('hidden');
  document.getElementById('auth-step-login').classList.remove('hidden');
}
function disconnectSupabase(){
  if(!confirm('هتحتاج تدخل رابط ومفتاح Supabase تاني. متابعة؟'))return;
  localStorage.removeItem('sb_url');localStorage.removeItem('sb_key');
  SB_URL='';SB_KEY='';supabaseClient=null;authSession=null;
  document.getElementById('conn-url').value='';document.getElementById('conn-key').value='';
  document.getElementById('auth-step-login').classList.add('hidden');
  document.getElementById('auth-step-connect').classList.remove('hidden');
}
async function doSignup(){
  const username=document.getElementById('signup-username').value.trim();
  const email=document.getElementById('signup-email').value.trim();
  const password=document.getElementById('signup-password').value;
  const password2=document.getElementById('signup-password2').value;
  showAuthError('auth-error','');
  if(!username)return showAuthError('auth-error','أدخل اسم المستخدم');
  if(!email)return showAuthError('auth-error','أدخل البريد الإلكتروني');
  if(!password||password.length<6)return showAuthError('auth-error','كلمة المرور 6 أحرف على الأقل');
  if(password!==password2)return showAuthError('auth-error','كلمتا المرور غير متطابقتين');
  showAuthLoading(true);
  try{
    const{data,error}=await supabaseClient.auth.signUp({email,password,options:{data:{username}}});
    if(error)throw error;
    if(data.session){authSession=data.session;await onAuthed();}
    else{
      showAuthLoading(false);
      showAuthError('auth-error','تم إنشاء الحساب — تحقق من بريدك الإلكتروني لتأكيد الحساب قبل الدخول (أو عطّل "Confirm email" من إعدادات Supabase Auth لو عايز الدخول المباشر).');
      setAuthTab('login');
    }
  }catch(e){showAuthLoading(false);showAuthError('auth-error',e.message||'تعذّر إنشاء الحساب')}
}
async function doLogin(){
  const email=document.getElementById('login-email').value.trim();
  const password=document.getElementById('login-password').value;
  showAuthError('auth-error','');
  if(!email||!password)return showAuthError('auth-error','أدخل البريد وكلمة المرور');
  showAuthLoading(true);
  try{
    const{data,error}=await supabaseClient.auth.signInWithPassword({email,password});
    if(error)throw error;
    authSession=data.session;
    await onAuthed();
  }catch(e){showAuthLoading(false);showAuthError('auth-error','بيانات الدخول غير صحيحة، أو الحساب غير مؤكد بعد')}
}
async function doLogout(){
  if(!confirm('تسجيل الخروج؟'))return;
  try{if(supabaseClient)await supabaseClient.auth.signOut();}catch(e){}
  authSession=null;location.reload();
}
async function onAuthed(){
  document.getElementById('auth-gate').classList.add('hidden');
  document.getElementById('main-app').classList.remove('hidden');
  const uEl=document.getElementById('sidebar-username');
  if(uEl)uEl.textContent=authSession?.user?.user_metadata?.username||authSession?.user?.email||'';
  await loadAppSettings();
  applyBranding();
  populateAllCurrencySelects();updateCurrencyLabels();
  await loadAll();
  autoFetchExchangeRates(false);autoFetchMetalPrices(false);
}
async function initAuthGate(){
  if(!SB_URL||!SB_KEY){document.getElementById('auth-step-connect').classList.remove('hidden');return;}
  document.getElementById('conn-url').value=SB_URL;document.getElementById('conn-key').value=SB_KEY;
  try{
    supabaseClient=window.supabase.createClient(SB_URL,SB_KEY);
    const{data}=await supabaseClient.auth.getSession();
    if(data?.session){
      authSession=data.session;
      supabaseClient.auth.onAuthStateChange((_event,session)=>{authSession=session;});
      await onAuthed();
      return;
    }
  }catch(e){}
  document.getElementById('auth-step-login').classList.remove('hidden');
}

// ═══ Branding: dynamic title & sidebar from exchange_name ═══
function applyBranding(){
  const rawName=(APP_SETTINGS&&APP_SETTINGS.exchange_name||'').trim();
  const displayName=rawName||'محفظتي';
  const docTitle=`${displayName} — Finance Portfolio Tracker`;
  document.title=docTitle;
  const lt=document.getElementById('sidebar-logo-title');if(lt)lt.textContent=displayName;
  const ls=document.getElementById('sidebar-logo-sub');if(ls)ls.textContent='Finance Portfolio Tracker';
  const bn=document.getElementById('brand-name');if(bn)bn.textContent=displayName;
}

async function sbPostResilient(table,body,optionalFields){
  try{return await sbPost(table,body);}
  catch(e){
    const msg=e.message||'';
    const isMissingColumn=/PGRST204|schema cache|column .* does not exist/i.test(msg);
    if(isMissingColumn&&optionalFields.length){
      console.warn(`[${table}] retrying without optional columns: ${optionalFields.join(', ')}`);
      const stripped=body.map(row=>{const r={...row};optionalFields.forEach(f=>delete r[f]);return r;});
      const result=await sbPost(table,stripped);
      window.__schemaWarnings=window.__schemaWarnings||new Set();
      optionalFields.forEach(f=>window.__schemaWarnings.add(table+'.'+f));
      return result;
    }
    throw e;
  }
}

let DB={banks:[],bankTxns:[],stockTxns:[],stockPrices:[],metalTxns:[],metalPrices:[],certs:[],dividends:[],recurring:[],goals:[],exchangeRates:[],snapshots:[],debts:[],debtPayments:[]};
const MARKET_COLORS={'EGX':'badge-blue','TADAWUL':'badge-green','ADX':'badge-teal','NYSE':'badge-purple','NASDAQ':'badge-purple','CRYPTO':'badge-gold'};
const MARKET_NAMES={'EGX':'مصر','TADAWUL':'السعودية','ADX':'الإمارات','NYSE':'NYSE','NASDAQ':'NASDAQ','CRYPTO':'كريبتو'};
let UI={activePage:'dashboard',activeBankId:null,globalPeriod:'1y',customFrom:null,customTo:null,bankSort:'desc',bankTxnFilter:'ALL',recurringFilter:'ALL'};
let CHARTS={};
let editCtx={table:null,id:null};

const N2=(v)=>isNaN(+v)?0:+v;
function baseCur(){return(typeof APP_SETTINGS!=='undefined'&&APP_SETTINGS&&APP_SETTINGS.base_currency)||'EGP';}
const fmt=(v,cur)=>new Intl.NumberFormat('ar-EG',{minimumFractionDigits:2,maximumFractionDigits:2}).format(N2(v))+' '+(cur||baseCur());
const fmtN=(v,d=2)=>new Intl.NumberFormat('ar-EG',{minimumFractionDigits:d,maximumFractionDigits:d}).format(N2(v));
const fmtK=(v)=>{const a=Math.abs(N2(v));return a>=1e6?(N2(v)/1e6).toFixed(1)+'M '+baseCur():a>=1e3?(N2(v)/1e3).toFixed(1)+'K '+baseCur():fmt(v)};
const pct=(v,t)=>t&&N2(t)>0?((N2(v)/N2(t))*100).toFixed(1)+'%':'0%';
const pctN=(v,t)=>t&&N2(t)>0?(N2(v)/N2(t))*100:0;
const today=()=>new Date().toISOString().slice(0,10);
const sign=(v)=>N2(v)>=0?'+':'';
const cls=(v)=>N2(v)>=0?'pos':'neg';
const periodStart=(p)=>{
  if(p==='custom')return UI.customFrom||'2000-01-01';
  if(p==='all')return '2000-01-01';
  const d=new Date();
  if(p==='3m')d.setMonth(d.getMonth()-3);
  else if(p==='6m')d.setMonth(d.getMonth()-6);
  else if(p==='1y')d.setFullYear(d.getFullYear()-1);
  else if(p==='2y')d.setFullYear(d.getFullYear()-2);
  else if(p==='3y')d.setFullYear(d.getFullYear()-3);
  else if(p==='5y')d.setFullYear(d.getFullYear()-5);
  return d.toISOString().slice(0,10);
};
const periodEnd=(p)=>p==='custom'?(UI.customTo||today()):today();
const filterByPeriod=(arr,p,dateField='date')=>{
  const s=periodStart(p),e=periodEnd(p);
  return arr.filter(r=>r[dateField]>=s&&r[dateField]<=e);
};
const getRate=(cur)=>{if(!cur||cur==='EGP')return 1;const r=DB.exchangeRates.find(x=>x.currency===cur);return r?N2(r.rate):1};
const BANK_PALETTE=['#3b82f6','#0d9488','#d97706','#7c3aed','#e11d48','#0891b2','#16a34a','#ea580c','#6366f1','#ec4899','#14b8a6','#f59e0b'];
const getBankColor=(bankId)=>{
  const b=DB.banks.find(x=>x.id===bankId);
  if(!b)return'#3b82f6';
  if(b.color&&b.color.startsWith('#'))return b.color;
  return BANK_PALETTE[Math.abs([...b.name].reduce((a,c)=>a+c.charCodeAt(0),0))%BANK_PALETTE.length];
};
const bankColorDot=(bankId,size=8)=>{const c=getBankColor(bankId);return`<span style="display:inline-block;width:${size}px;height:${size}px;border-radius:50%;background:${c};flex-shrink:0;margin-left:3px"></span>`};
const toEGP=(amt,cur)=>{
  const amtInEGP=N2(amt)*getRate(cur||'EGP');
  const bc=baseCur();
  if(bc==='EGP')return amtInEGP;
  const baseRate=getRate(bc);
  return baseRate>0?amtInEGP/baseRate:amtInEGP;
};

function getHoldings(marketFilter){
  const h={};
  const txns=marketFilter&&marketFilter!=='ALL'
    ?DB.stockTxns.filter(t=>t.market===marketFilter||(t.market||'EGX')===marketFilter)
    :DB.stockTxns;
  [...txns].sort((a,b)=>a.date>b.date?1:a.date<b.date?-1:a.id-b.id).forEach(t=>{
    if(!h[t.symbol])h[t.symbol]={name:t.name,type:t.sec_type||'سهم',qty:0,totalCost:0,market:t.market||'EGX',currency:t.price_currency||'EGP'};
    if(t.type==='شراء'){h[t.symbol].qty=+(h[t.symbol].qty+N2(t.quantity)).toFixed(6);h[t.symbol].totalCost=+(h[t.symbol].totalCost+N2(t.net)).toFixed(4);}
    else if(t.type==='بيع'){
      const avg=h[t.symbol].qty>0?h[t.symbol].totalCost/h[t.symbol].qty:0;
      const soldQty=Math.min(N2(t.quantity),h[t.symbol].qty);
      h[t.symbol].qty=+(h[t.symbol].qty-soldQty).toFixed(6);
      h[t.symbol].totalCost=+(h[t.symbol].totalCost-avg*soldQty).toFixed(4);
      if(h[t.symbol].qty<0.0001){h[t.symbol].qty=0;h[t.symbol].totalCost=0;}
    }
  });
  Object.values(h).forEach(v=>{v.avgPrice=v.qty>0.0001?v.totalCost/v.qty:0});
  return Object.fromEntries(Object.entries(h).filter(([,v])=>v.qty>0.0001));
}
function getMetalHoldings(){
  const h={};
  [...DB.metalTxns].sort((a,b)=>a.date>b.date?1:a.date<b.date?-1:a.id-b.id).forEach(t=>{
    const metalType=t.metal_type||'معدن';
    const metalTitle=t.notes&&t.notes.trim()?t.notes.trim():'';
    const key=metalTitle?metalType+'|'+metalTitle:metalType;
    if(!h[key])h[key]={metal_type:metalType,title:metalTitle,weight:0,totalCost:0,transactions:[]};
    if(t.op==='شراء'){
      h[key].weight+=N2(t.weight);
      h[key].totalCost+=N2(t.net);
      h[key].transactions.push(t.id);
    }else if(t.op==='بيع'){
      const avg=h[key].weight>0?h[key].totalCost/h[key].weight:0;
      const sw=Math.min(N2(t.weight),h[key].weight);
      h[key].weight-=sw;h[key].totalCost-=avg*sw;
      if(h[key].weight<0.0001){h[key].weight=0;h[key].totalCost=0}
    }
  });
  Object.values(h).forEach(v=>{v.avgPrice=v.weight>0.0001?v.totalCost/v.weight:0});
  return Object.fromEntries(Object.entries(h).filter(([,v])=>v.weight>0.0001));
}
function getStockPrice(sym){const p=DB.stockPrices.find(x=>x.symbol===sym);return p?N2(p.current_price):0}
function calcNextPayoutDate(cert){
  const now=new Date(),issued=new Date(cert.issued_date),mat=new Date(cert.maturity_date);
  if(now>=mat)return null;
  const payout=cert.payout_type||'سنوي';
  const periodDays={'يومي':1,'أسبوعي':7,'شهري':30.4375,'سنوي':365.25}[payout]||365.25;
  const elapsedDays=(now-issued)/86400000;
  const completedPeriods=Math.floor(Math.max(0,elapsedDays)/periodDays);
  const nextDate=new Date(issued.getTime()+(completedPeriods+1)*periodDays*86400000);
  return nextDate<=mat?nextDate:mat;
}
function getMetalPrice(type){const p=DB.metalPrices.find(x=>x.metal_type===type);return p?N2(p.price_per_gram):0}

function calcTotals(){
  const h=getHoldings(),mh=getMetalHoldings();
  const totalBanks=DB.banks.reduce((a,b)=>a+toEGP(N2(b.balance),b.currency),0);
  const stocksVal=Object.entries(h).reduce((a,[s,v])=>a+v.qty*(getStockPrice(s)||v.avgPrice),0);
  const stocksCost=Object.values(h).reduce((a,v)=>a+v.totalCost,0);
  const metalsVal=Object.entries(mh).reduce((a,[t,v])=>a+v.weight*(getMetalPrice(t)||v.avgPrice),0);
  const metalsCost=Object.values(mh).reduce((a,v)=>a+v.totalCost,0);
  const certsTotal=DB.certs.reduce((a,c)=>a+N2(c.amount),0);
  const certsInterest=DB.certs.reduce((a,c)=>a+N2(c.total_interest),0);
  const certsPaid=DB.certs.reduce((a,c)=>a+N2(c.interest_paid),0);
  const divTotal=DB.dividends.reduce((a,d)=>a+N2(d.amount),0);
  const debtsOwed=DB.debts.filter(d=>d.type==='دين علي').reduce((a,d)=>a+N2(d.remaining),0);
  const debtsOwing=DB.debts.filter(d=>d.type==='دين لي').reduce((a,d)=>a+N2(d.remaining),0);
  const grand=totalBanks+stocksVal+metalsVal+certsTotal;
  const pnlStocks=stocksVal-stocksCost,pnlMetals=metalsVal-metalsCost;
  const totalPnl=pnlStocks+pnlMetals+certsPaid+divTotal;
  return{h,mh,totalBanks,stocksVal,stocksCost,metalsVal,metalsCost,certsTotal,certsInterest,certsPaid,divTotal,debtsOwed,debtsOwing,pnlStocks,pnlMetals,totalPnl,grand};
}

// Charts
const isDark=()=>document.body.classList.contains('dark');
const gc=()=>isDark()?'#1e2d47':'#e8edf5';
const tc=()=>isDark()?'#4a6080':'#7a8ba8';
const PALETTE=['#1a56db','#0d9488','#d97706','#7c3aed','#e11d48','#0891b2','#c2410c','#059669','#9333ea','#0369a1'];
function destroyChart(key){if(CHARTS[key]){try{CHARTS[key].destroy()}catch(e){}CHARTS[key]=null}}
function mkPie(id,labels,data,colors){
  destroyChart(id);const cv=document.getElementById(id);if(!cv)return;
  CHARTS[id]=new Chart(cv,{type:'doughnut',data:{labels,datasets:[{data,backgroundColor:colors,borderWidth:3,borderColor:isDark()?'#0f1729':'#fff',hoverOffset:8}]},options:{responsive:true,maintainAspectRatio:true,cutout:'62%',animation:{duration:500},plugins:{legend:{position:'bottom',labels:{color:tc(),font:{size:11,family:'Cairo'},padding:14,usePointStyle:true}},tooltip:{callbacks:{label:ctx=>`${ctx.label}: ${fmt(ctx.raw)} (${pct(ctx.raw,data.reduce((a,b)=>a+b,0))})`}}}}});
}
function mkBar(id,labels,datasets,stacked=false){
  destroyChart(id);const cv=document.getElementById(id);if(!cv)return;
  CHARTS[id]=new Chart(cv,{type:'bar',data:{labels,datasets},options:{responsive:true,maintainAspectRatio:true,animation:{duration:400},scales:{x:{stacked,grid:{display:false},ticks:{color:tc(),font:{size:10,family:'Cairo'}}},y:{stacked,grid:{color:gc()},ticks:{color:tc(),font:{size:10,family:'Cairo'},callback:v=>Math.abs(v)>=1e6?(v/1e6).toFixed(1)+'M':Math.abs(v)>=1e3?(v/1e3).toFixed(0)+'K':v}}},plugins:{legend:{labels:{color:tc(),font:{size:11,family:'Cairo'},usePointStyle:true}},tooltip:{callbacks:{label:ctx=>`${ctx.dataset.label||''}: ${fmt(ctx.raw)}`}}}}});
}
function mkLine(id,labels,datasets){
  destroyChart(id);const cv=document.getElementById(id);if(!cv)return;
  CHARTS[id]=new Chart(cv,{type:'line',data:{labels,datasets},options:{responsive:true,maintainAspectRatio:true,animation:{duration:600},interaction:{mode:'index',intersect:false},scales:{x:{grid:{display:false},ticks:{color:tc(),font:{size:10,family:'Cairo'},maxTicksLimit:8}},y:{grid:{color:gc()},ticks:{color:tc(),font:{size:10,family:'Cairo'},callback:v=>Math.abs(v)>=1e6?(v/1e6).toFixed(1)+'M':Math.abs(v)>=1e3?(v/1e3).toFixed(0)+'K':v}}},plugins:{legend:{labels:{color:tc(),font:{size:11,family:'Cairo'},usePointStyle:true}},tooltip:{callbacks:{label:ctx=>`${ctx.dataset.label}: ${fmt(ctx.raw)}`}}}}});
}
function mkHBar(id,labels,data,colors){
  destroyChart(id);const cv=document.getElementById(id);if(!cv)return;
  CHARTS[id]=new Chart(cv,{type:'bar',data:{labels,datasets:[{data,backgroundColor:colors,borderRadius:6}]},options:{indexAxis:'y',responsive:true,maintainAspectRatio:true,animation:{duration:400},plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>`${fmt(ctx.raw)}`}}},scales:{x:{grid:{color:gc()},ticks:{color:tc(),font:{size:10,family:'Cairo'},callback:v=>Math.abs(v)>=1e6?(v/1e6).toFixed(1)+'M':v}},y:{grid:{display:false},ticks:{color:tc(),font:{size:11,family:'Cairo'}}}}}});
}

// ═══ NOTIFICATIONS ═══
function buildNotifications(){
  const notes=[];
  const now=new Date();
  const T=calcTotals();
  DB.certs.forEach(c=>{
    const mat=new Date(c.maturity_date),days=Math.ceil((mat-now)/86400000);
    if(days<0)notes.push({type:'danger',icon:'alert-circle',title:'شهادة منتهية',body:`${c.name} انتهت منذ ${Math.abs(days)} يوم — يجب اتخاذ إجراء`});
    else if(days<=30)notes.push({type:'warn',icon:'clock',title:'شهادة قريبة الاستحقاق',body:`${c.name} تستحق خلال ${days} يوم`});
    const rem=Math.max(0,+c.total_interest-(+c.interest_paid));
    if(rem/Math.max(1,+c.total_interest)>0.8&&days>0)notes.push({type:'info',icon:'dollar-sign',title:'عائد شهادة مستحق',body:`${c.name}: عائد متبقي ${rem.toFixed(0)} ${baseCur()} يمكن صرفه`});
  });
  DB.banks.filter(b=>+b.min_balance>0&&+b.balance<+b.min_balance).forEach(b=>{
    notes.push({type:'warn',icon:'credit-card',title:'رصيد منخفض',body:`${b.name}: الرصيد ${b.balance} أقل من الحد الأدنى ${b.min_balance}`});
  });
  DB.debts.filter(d=>d.due_date&&new Date(d.due_date)<now&&+d.remaining>0).forEach(d=>{
    const daysLate=Math.ceil((now-new Date(d.due_date))/86400000);
    notes.push({type:'danger',icon:'alert-triangle',title:'دين/التزام متأخر',body:`${d.name}: متأخر ${daysLate} يوم | متبقي ${(+d.remaining).toFixed(0)} ${baseCur()}`});
  });
  DB.debts.filter(d=>d.due_date&&+d.remaining>0).forEach(d=>{
    const days=Math.ceil((new Date(d.due_date)-now)/86400000);
    if(days>0&&days<=30)notes.push({type:'warn',icon:'calendar',title:'موعد سداد قريب',body:`${d.name}: يستحق خلال ${days} يوم | متبقي ${(+d.remaining).toFixed(0)} ${baseCur()}`});
  });
  DB.recurring.filter(r=>{const n=nextRecDate(r);return n<=new Date().toISOString().slice(0,10)}).forEach(r=>{
    notes.push({type:'info',icon:'refresh-cw',title:'عملية متكررة مستحقة',body:`${r.name} (${r.type}) بقيمة ${r.amount} ${baseCur()}`});
  });
  const{pnlStocks,pnlMetals,stocksCost,metalsCost}=T;
  if(stocksCost>0&&pnlStocks/stocksCost<-0.15)notes.push({type:'warn',icon:'trending-down',title:'خسارة في الأسهم',body:`خسارة ${(pnlStocks/stocksCost*100).toFixed(1)}% على محفظة الأسهم — تحقق من قراراتك`});
  if(metalsCost>0&&pnlMetals/metalsCost<-0.10)notes.push({type:'warn',icon:'trending-down',title:'خسارة في المعادن',body:`خسارة ${(pnlMetals/metalsCost*100).toFixed(1)}% على محفظة المعادن`});
  return notes;
}
function updateNotificationBell(){
  const notes=buildNotifications();
  const bell=document.getElementById('notif-bell');
  const badge=document.getElementById('notif-badge');
  if(!bell)return;
  if(notes.length>0){badge.style.display='flex';badge.textContent=notes.length>9?'9+':notes.length;badge.style.background=notes.some(n=>n.type==='danger')?'var(--red)':'var(--gold)'}
  else{badge.style.display='none'}
}
function toggleNotifications(){
  const panel=document.getElementById('notif-panel');
  if(!panel)return;
  const isOpen=panel.classList.contains('open');
  document.querySelectorAll('.notif-panel').forEach(p=>p.classList.remove('open'));
  if(!isOpen){panel.classList.add('open');renderNotifications();}
}
function renderNotifications(){
  const notes=buildNotifications();
  const container=document.getElementById('notif-list');
  if(!container)return;
  const iconPaths={
    'alert-circle':'<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
    'clock':'<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    'dollar-sign':'<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>',
    'credit-card':'<rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/>',
    'alert-triangle':'<path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
    'calendar':'<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
    'refresh-cw':'<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>',
    'trending-down':'<polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/>'
  };
  const colors={danger:'var(--red)',warn:'var(--gold)',info:'var(--blue)'};
  const bgs={danger:'var(--red-l)',warn:'var(--gold-l)',info:'var(--blue-l)'};
  container.innerHTML=notes.length?notes.map(n=>`
    <div style="display:flex;gap:10px;padding:10px 14px;border-bottom:.5px solid var(--border);align-items:flex-start">
      <div style="width:30px;height:30px;border-radius:8px;background:${bgs[n.type]};color:${colors[n.type]};display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${iconPaths[n.icon]||''}</svg>
      </div>
      <div style="flex:1;min-width:0">
        <div style="font-size:12px;font-weight:800;color:${colors[n.type]};margin-bottom:2px">${escapeHtml(n.title)}</div>
        <div style="font-size:11px;color:var(--muted);line-height:1.4">${escapeHtml(n.body)}</div>
      </div>
    </div>
  `).join(''):`<div style="padding:24px;text-align:center;color:var(--muted);font-size:12px">لا توجد تنبيهات حالياً</div>`;
}
document.addEventListener('click',e=>{
  const panel=document.getElementById('notif-panel');
  const bell=document.getElementById('notif-bell');
  if(panel&&bell&&!panel.contains(e.target)&&!bell.contains(e.target))panel.classList.remove('open');
});

// ═══ CERT ACCRUED INTEREST ═══
function calcAccruedInterest(cert){
  const now=new Date(),issued=new Date(cert.issued_date),mat=new Date(cert.maturity_date);
  if(now>=mat) return N2(cert.total_interest);
  const elapsed=Math.max(0,(now-issued)/86400000);
  const total=Math.max(1,(mat-issued)/86400000);
  return N2(cert.total_interest)*elapsed/total;
}
function fixCertTableHeader(){
  const thead=document.querySelector('#page-certs table thead tr');
  if(thead&&!document.getElementById('cert-th-accrued')){
    const th=document.createElement('th');th.id='cert-th-accrued';th.textContent='مستحق حتى اليوم';
    const ths=thead.querySelectorAll('th');
    if(ths.length>7)thead.insertBefore(th,ths[8]);
    else thead.appendChild(th);
  }
}

// ═══ LOAD & SAVE ═══
async function saveSnapshot(){
  const t=calcTotals();
  const snap={snapshot_date:today(),total_banks:t.totalBanks,total_stocks:t.stocksVal,total_metals:t.metalsVal,total_certs:t.certsTotal,grand_total:t.grand};
  try{await sbUpsert('portfolio_snapshots',snap)}catch(e){}
}
async function loadAll(){
  try{
    document.getElementById('sidebar-sync').innerHTML='<span class="sync-dot"></span> جاري التحميل...';
    const [banks,bankTxns,stockTxns,stockPrices,metalTxns,metalPrices,certs,dividends,recurring,goals,exRates,snapshots,debts,debtPayments]=await Promise.all([
      sbGet('banks','?order=id&limit=5000'),
      sbGet('bank_transactions','?order=date.desc,id.desc&limit=50000'),
      sbGet('stock_transactions','?order=date.asc,id.asc&limit=50000'),
      sbGet('stock_prices','?order=symbol&limit=5000'),
      sbGet('metal_transactions','?order=date.asc,id.asc&limit=20000'),
      sbGet('metal_prices','?order=metal_type&limit=1000'),
      sbGet('certificates','?order=issued_date.asc&limit=5000'),
      sbGet('dividends','?order=date.desc&limit=20000'),
      sbGet('recurring_transactions','?order=id&limit=5000'),
      sbGet('financial_goals','?order=id&limit=1000'),
      sbGet('exchange_rates','?order=currency&limit=1000'),
      sbGet('portfolio_snapshots','?order=snapshot_date.asc&limit=10000'),
      sbGet('debts','?order=id&limit=5000'),
      sbGet('debt_payments','?order=date.desc,id.desc&limit=20000')
    ]);
    DB={banks,bankTxns,stockTxns,stockPrices,metalTxns,metalPrices,certs,dividends,recurring,goals,exchangeRates:exRates,snapshots,debts,debtPayments};
    if(!UI.activeBankId&&banks.length)UI.activeBankId=banks[0].id;
    await saveSnapshot();
    updateBadges();renderPage();updateNotificationBell();fixCertTableHeader();
    const t=calcTotals();
    document.getElementById('sidebar-total').textContent=fmt(t.grand);
    if(typeof runIntegrityCheck==='function')setTimeout(runIntegrityCheck,3000);
    const ps=document.getElementById('global-period-select');
    if(ps&&UI.globalPeriod)ps.value=UI.globalPeriod;
    document.getElementById('sidebar-sync').innerHTML='<span class="sync-dot"></span> آخر تحديث: '+new Date().toLocaleTimeString('ar-EG');
  }catch(e){
    console.error('loadAll error:',e);
    const msg=e.message||'خطأ غير معروف';
    toast('خطأ في الاتصال: '+msg,false);
    document.getElementById('sidebar-sync').innerHTML='<span class="sync-dot err"></span> '+escapeHtml(msg.slice(0,40));
    const content=document.getElementById('main-content');
    if(content){
      const errDiv=document.getElementById('global-error-banner')||document.createElement('div');
      errDiv.id='global-error-banner';
      errDiv.style='background:var(--red-l);border:.5px solid var(--red);border-radius:var(--radius);padding:14px 18px;margin-bottom:16px;color:var(--red-d);font-size:13px;font-weight:700;display:flex;justify-content:space-between;align-items:center';
      errDiv.innerHTML=`<span>فشل الاتصال بقاعدة البيانات: ${escapeHtml(msg)}</span><button onclick="loadAll()" style="background:var(--red);color:#fff;border:none;padding:6px 14px;border-radius:6px;cursor:pointer;font-size:12px;font-family:inherit;font-weight:700">إعادة المحاولة</button>`;
      if(!document.getElementById('global-error-banner'))content.insertBefore(errDiv,content.firstChild);
    }
  }
}

// ═══ NAVIGATION ═══
const PAGE_TITLES={dashboard:['لوحة التحكم','نظرة شاملة على محفظتك'],banks:['الحسابات البنكية','إدارة أرصدتك وحركاتك'],stocks:['الأسهم والصناديق','تتبع حيازاتك وأرباحك'],metals:['المعادن الثمينة','الذهب والفضة والبلاتين'],certs:['الشهادات الادخارية','عوائدك الثابتة'],debts:['الديون والالتزامات','ما عليك وما لك'],recurring:['العمليات المتكررة','أتمتة معاملاتك'],goals:['الأهداف المالية','خططك المستقبلية'],prices:['تحديث الأسعار','أسعار السوق الحالية'],reports:['التقارير والتحليل','تحليل شامل لمحفظتك'],zakat:['الزكاة','حساب الزكاة الشرعية على أموالك'],settings:['الإعدادات','ضبط متغيرات المحفظة']};
function nav(page){
  Object.keys(CHARTS).forEach(k=>{if(k.startsWith(UI.activePage))destroyChart(k)});
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  document.getElementById('page-'+page)?.classList.add('active');
  document.querySelector(`.nav-item[data-page="${page}"]`)?.classList.add('active');
  UI.activePage=page;
  const titles=PAGE_TITLES[page]||[page,''];
  document.getElementById('topbar-title').textContent=titles[0];
  document.getElementById('topbar-sub').textContent=titles[1];
  renderPage();
}
function renderPage(){
  const p=UI.activePage;
  try{
    if(p==='dashboard')renderDashboard();
    else if(p==='banks')renderBanks();
    else if(p==='stocks')renderStocks();
    else if(p==='metals')renderMetals();
    else if(p==='certs')renderCerts();
    else if(p==='debts')renderDebts();
    else if(p==='recurring')renderRecurring();
    else if(p==='goals')renderGoals();
    else if(p==='prices')renderPrices();
    else if(p==='reports')renderReports();
    else if(p==='zakat')renderZakat();
    else if(p==='settings')renderSettings();
  }catch(e){
    console.error('renderPage error on page ['+p+']:',e);
    toast('خطأ في عرض الصفحة: '+e.message,false);
  }
}
function toggleSidebar(){document.getElementById('sidebar').classList.toggle('collapsed')}
function setPeriodFromSelect(p){
  UI.globalPeriod=p;
  localStorage.setItem('globalPeriod',p);
  const customEl=document.getElementById('global-custom-range');
  if(customEl)customEl.classList.toggle('hidden',p!=='custom');
  if(p!=='custom')renderPage();
}
function applyGlobalCustomRange(){
  const from=document.getElementById('global-date-from').value;
  const to=document.getElementById('global-date-to').value;
  if(!from||!to)return alert('اختر تاريخ البداية والنهاية');
  if(from>to)return alert('تاريخ البداية لازم يكون قبل تاريخ النهاية');
  UI.customFrom=from;UI.customTo=to;UI.globalPeriod='custom';
  renderPage();
}
function setBankSort(dir){UI.bankSort=dir;renderBanks();}
function getCertAlerts(){
  const now=new Date(),soon=[],expired=[];
  DB.certs.forEach(c=>{
    const mat=new Date(c.maturity_date),days=Math.ceil((mat-now)/86400000);
    if(days<0)expired.push({...c,daysLeft:days});else if(days<=30)soon.push({...c,daysLeft:days});
  });
  return{soon,expired};
}
function updateBadges(){
  const{soon,expired}=getCertAlerts();const total=soon.length+expired.length;
  ['nb-cert','nb-dash'].forEach(id=>{const el=document.getElementById(id);if(!el)return;if(total>0){el.style.display='flex';el.textContent=total;el.className='nav-badge'+(expired.length?' ':'warn ')}else el.style.display='none'});
}
function kpi(label,value,sub,color,icon,trend=null){
  const trendHtml=trend!==null?`<div class="kpi-trend ${trend>=0?'up':'down'}"><svg viewBox="0 0 24 24"><polyline points="${trend>=0?'18 15 12 9 6 15':'6 9 12 15 18 9'}"/></svg>${Math.abs(trend).toFixed(1)}%</div>`:'';
  return`<div class="kpi" style="border-right:3px solid ${color}">
    <div class="kpi-accent" style="background:${color}"></div>
    <div class="kpi-header">
      <div class="kpi-icon" style="background:${color}18;color:${color}">${icon}</div>
      ${trendHtml}
    </div>
    <div class="kpi-label">${escapeHtml(label)}</div>
    <div class="kpi-value" style="color:${color}">${value}</div>
    ${sub?`<div class="kpi-sub">${sub}</div>`:''}
  </div>`;
}
function svgIcon(paths,w=17){return`<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`}
function typeTag(type){
  const m={'إيداع':'tag-dep','سحب':'tag-wit','تحويل وارد':'tag-tr','تحويل صادر':'tag-wit','رصيد افتتاحي':'tag-init','شراء':'tag-buy','بيع':'tag-sell','أرباح':'tag-div','عائد شهادة':'tag-div'};
  return`<span class="tag ${m[type]||'tag-open'}">${escapeHtml(type)}</span>`;
}
function bankOptHtml(b){
  if(b.is_active===false)return'';
  const cur=b.currency||'EGP';
  const color=getBankColor(b.id);
  return`<option value="${b.id}" data-color="${color}">⬤ ${escapeHtml(b.name)}${b.bank_code?' ('+escapeHtml(b.bank_code)+')':''} | ${fmtN(N2(b.balance),2)} ${cur}</option>`;
}
function bankOptHtmlAll(b){
  const cur=b.currency||'EGP';
  return`<option value="${b.id}">${b.is_active===false?'[مؤرشف] ':''} ${escapeHtml(b.name)}${b.bank_code?' ('+escapeHtml(b.bank_code)+')':''} | ${fmtN(N2(b.balance),2)} ${cur}</option>`;
}
function populateSelect(id,extra=''){
  const el=document.getElementById(id);if(!el)return;
  el.innerHTML=(extra||'')+DB.banks.map(bankOptHtml).join('');
  const applyColor=()=>{const c=getBankColor(+el.value);if(+el.value){el.style.borderRightColor=c;el.style.borderRightWidth='3px';}else{el.style.borderRightColor='';el.style.borderRightWidth='';}};
  el.removeEventListener('change',el._colorFn);el._colorFn=applyColor;el.addEventListener('change',applyColor);applyColor();
}
function certOptHtml(c){return`<option value="${c.id}">${escapeHtml(c.name)} — ${escapeHtml(c.bank_name||'')} | ${fmt(c.amount)}</option>`}
function previewBox(rows,color='var(--green-l)',borderColor='var(--green)'){
  return`<div class="preview-box" style="border-color:${borderColor};margin-top:10px">${rows.map((r,i)=>`<div class="preview-row${i===rows.length-1?' total':''}"><span class="preview-label">${r[0]}</span><span class="preview-val" style="${r[2]||''}">${r[1]}</span></div>`).join('')}</div>`;
}
function nextRecDate(r){
  const last=r.last_applied?new Date(r.last_applied):new Date(r.start_date);
  const next=new Date(last);
  if(r.freq==='monthly')next.setMonth(next.getMonth()+1);
  else if(r.freq==='weekly')next.setDate(next.getDate()+7);
  else if(r.freq==='yearly')next.setFullYear(next.getFullYear()+1);
  return next.toISOString().slice(0,10);
}

// ═══ MODALS ═══
function openModal(id){const el=document.getElementById(id);if(!el)return;el.classList.add('open');initModal(id);}
function closeModal(id){document.getElementById(id)?.classList.remove('open')}
document.querySelectorAll('.overlay').forEach(o=>o.addEventListener('click',e=>{if(e.target===o)o.classList.remove('open')}));
function initModal(id){
  const t=today();
  const setV=(elId,val)=>{const el=document.getElementById(elId);if(el)el.value=val;};
  const clrPrev=(elId)=>{const el=document.getElementById(elId);if(el)el.innerHTML='';};
  if(id==='modal-dep'){populateSelect('ed-bank');setV('ed-date',t);setV('ed-amount','');setV('ed-notes','');document.getElementById('ed-txn-id').value='';clrPrev('dep-preview');}
  if(id==='modal-wit'){populateSelect('ew-bank');setV('ew-date',t);setV('ew-amount','');setV('ew-notes','');document.getElementById('ew-txn-id').value='';clrPrev('wit-preview');}
  if(id==='modal-transfer'){populateSelect('etr-from');populateSelect('etr-to');setV('etr-date',t);setV('etr-amount','');setV('etr-notes','');setV('etr-fee','0');clrPrev('transfer-preview');}
  if(id==='modal-buy'){populateSelect('ebuy-bank');setV('ebuy-date',t);if(!document.getElementById('ebuy-id').value){setV('ebuy-sym','');setV('ebuy-name','');setV('ebuy-qty','');setV('ebuy-price','');setV('ebuy-comm','0.5');setV('ebuy-comm-fixed','0');setV('ebuy-notes-field','');clrPrev('buy-preview');}}
  if(id==='modal-sell'){populateSelect('esell-bank');setV('esell-date',t);populateSellSyms();setV('esell-qty','');setV('esell-price','');setV('esell-comm','0.5');setV('esell-comm-fixed','0');setV('esell-notes','');clrPrev('sell-preview');document.getElementById('esell-id').value='';}
  if(id==='modal-metal-buy'){populateSelect('emb-bank');setV('emb-date',t);if(!document.getElementById('emb-id').value){populateMetalTypeSelect();setV('emb-metal-custom','');document.getElementById('emb-metal-custom')?.classList.add('hidden');populateCurrencySelect('emb-currency');const mcSel=document.getElementById('emb-currency');if(mcSel)mcSel.value=baseCur();setV('emb-notes','');setV('emb-weight','');setV('emb-price','');setV('emb-manuf','0');setV('emb-fixed','0');clrPrev('metal-buy-preview');}}
  if(id==='modal-metal-sell'){populateSelect('ems-bank');setV('ems-date',t);populateMetalSellTypes();setV('ems-weight','');setV('ems-price','');setV('ems-cashback','0');clrPrev('metal-sell-preview');document.getElementById('ems-id').value='';}
  if(id==='modal-cert-add'){populateSelect('ecert-bank');setV('ecert-date',t);if(!document.getElementById('ecert-id').value){setV('ecert-name','');setV('ecert-bank-name','');setV('ecert-amount','');setV('ecert-rate','');clrPrev('cert-preview');populateCurrencySelect('ecert-currency');const cSel=document.getElementById('ecert-currency');if(cSel)cSel.value=baseCur();document.getElementById('modal-cert-title').textContent='شهادة ادخارية جديدة';}}
  if(id==='modal-cert-break'){populateSelect('ecb-bank');setV('ecb-date',t);setV('ecb-fee','0');setV('ecb-notes','');const sel=document.getElementById('ecb-cert');if(sel)sel.innerHTML=DB.certs.map(c=>`<option value="${c.id}">${escapeHtml(c.name)} — ${escapeHtml(c.bank_name||'')} | ${fmt(c.amount)}</option>`).join('');clrPrev('cert-break-preview');}
  if(id==='modal-cert-payout'){populateSelect('ecp-bank');setV('ecp-date',t);setV('ecp-amount','');document.getElementById('ecp-cert-id').value='';const infoEl=document.getElementById('ecp-info');if(infoEl)infoEl.innerHTML='';}
  if(id==='modal-dividend'){populateSelect('ediv-bank','<option value="">— لا يوجد —</option>');setV('ediv-date',t);setV('ediv-sym','');setV('ediv-amount','');setV('ediv-notes','');setV('ediv-shares','');document.getElementById('ediv-id').value='';const cashRadio=document.querySelector('input[name="ediv-mode"][value="cash"]');if(cashRadio)cashRadio.checked=true;setDividendMode('cash');}
  if(id==='modal-debt-add'){populateSelect('edebt-bank','<option value="">— لا يوجد —</option>');setV('edebt-start',t);setV('edebt-due','');if(!document.getElementById('edebt-id').value){setV('edebt-name','');setV('edebt-party','');setV('edebt-rate','0');setV('edebt-amount','');setV('edebt-remaining','');setV('edebt-notes','');document.getElementById('modal-debt-title').textContent='إضافة دين / التزام';}}
  if(id==='modal-debt-pay'){populateSelect('edp-bank','<option value="">— لا يوجد —</option>');setV('edp-date',t);setV('edp-amount','');setV('edp-notes','');const ds=document.getElementById('edp-debt');if(ds)ds.innerHTML=DB.debts.map(d=>`<option value="${d.id}">${escapeHtml(d.name)} | متبقي: ${fmt(d.remaining)}</option>`).join('');}
  if(id==='modal-recurring-add'){populateSelect('erec-bank','<option value="">— اختياري —</option>');setV('erec-start',t);if(!document.getElementById('erec-id').value){setV('erec-name','');setV('erec-amount','');document.getElementById('modal-rec-title').textContent='عملية متكررة جديدة';}}
  if(id==='modal-goal-add'){setV('egoal-name','');setV('egoal-target','');const cat=document.getElementById('egoal-cat');if(cat)cat.selectedIndex=0;}
  if(id==='modal-add-bank'){
    if(!document.getElementById('eb-id').value){
      setV('eb-name','');setV('eb-code','');
      populateCurrencySelect('eb-currency');const cSel=document.getElementById('eb-currency');if(cSel)cSel.value=baseCur();
      setV('eb-account','');setV('eb-min','0');setV('eb-opening','0');setV('eb-notes','');
      const usedColors=DB.banks.map(b=>b.color).filter(Boolean);
      const nextColor=BANK_PALETTE.find(c=>!usedColors.includes(c))||BANK_PALETTE[DB.banks.length%BANK_PALETTE.length];
      const colorEl=document.getElementById('eb-color');if(colorEl)colorEl.value=nextColor;
      const activeEl=document.getElementById('eb-active');if(activeEl)activeEl.checked=true;
      document.getElementById('modal-add-bank-title').textContent='حساب بنكي جديد';
    }
    const swatches=document.getElementById('bank-color-swatches');
    if(swatches&&!swatches.children.length){
      BANK_PALETTE.forEach(c=>{
        const s=document.createElement('div');
        s.style=`width:22px;height:22px;border-radius:4px;background:${c};cursor:pointer;border:2px solid transparent;transition:.15s;flex-shrink:0`;
        s.onclick=()=>{document.getElementById('eb-color').value=c;document.querySelectorAll('#bank-color-swatches div').forEach(x=>x.style.borderColor='transparent');s.style.borderColor='rgba(255,255,255,0.8)'};
        s.onmouseover=()=>s.style.transform='scale(1.2)';s.onmouseleave=()=>s.style.transform='';
        swatches.appendChild(s);
      });
    }
  }
}
function populateSellSyms(){
  const h=getHoldings();
  const marketNames={'EGX':'مصر','TADAWUL':'السعودية','ADX':'الإمارات','NYSE':'NYSE','NASDAQ':'NASDAQ','CRYPTO':'كريبتو'};
  document.getElementById('esell-sym').innerHTML=Object.entries(h).map(([s,v])=>{
    const mkt=v.market||'EGX';const cur=v.currency||'EGP';
    return`<option value="${s}">${s} (${marketNames[mkt]||mkt}) — ${escapeHtml(v.name)} | الكمية: ${fmtN(v.qty,4)} | متوسط: ${fmtN(v.avgPrice,4)} ${cur}</option>`;
  }).join('')||'<option value="">لا توجد حيازات</option>';
  const selEl=document.getElementById('esell-sym');
  if(selEl)selEl.onchange=()=>updateSellPreview();
}
function quickSellStock(sym){openModal('modal-sell');setTimeout(()=>{const el=document.getElementById('esell-sym');if(el){el.value=sym;updateSellPreview();}},30);}
function quickSellMetal(key){openModal('modal-metal-sell');setTimeout(()=>{const el=document.getElementById('ems-type');if(el){el.value=key;updateMetalSellPreview();}},30);}
function populateMetalSellTypes(){
  const mh=getMetalHoldings();
  const entries=Object.entries(mh).filter(([,v])=>v.weight>0.001);
  document.getElementById('ems-type').innerHTML=entries.length?
    entries.map(([key,v])=>{
      const baseType=v.metal_type.split('|')[0].trim();
      const label=v.title?`${baseType} — ${v.title}`:baseType;
      return`<option value="${key}">${escapeHtml(label)} | ${fmtN(v.weight,3)} جم | متوسط: ${fmtN(v.avgPrice,2)} ${baseCur()}/جم</option>`;
    }).join('')
    :'<option value="">لا توجد معادن مملوكة</option>';
}
function updateDepPreview(){
  const bid=+document.getElementById('ed-bank').value,amt=N2(document.getElementById('ed-amount').value);
  const b=DB.banks.find(x=>x.id===bid);if(!b||!amt){document.getElementById('dep-preview').innerHTML='';return}
  const after=N2(b.balance)+amt;
  document.getElementById('dep-preview').innerHTML=previewBox([['الرصيد الحالي',fmt(b.balance)+' '+b.currency],['المبلغ المُضاف','+'+fmt(amt),'color:var(--green)'],['الرصيد بعد العملية',fmt(after)+' '+b.currency,'color:var(--green);font-weight:900']]);
}
function updateWitPreview(){
  const bid=+document.getElementById('ew-bank').value,amt=N2(document.getElementById('ew-amount').value);
  const b=DB.banks.find(x=>x.id===bid);if(!b||!amt){document.getElementById('wit-preview').innerHTML='';return}
  const after=N2(b.balance)-amt,ok=after>=0;
  document.getElementById('wit-preview').innerHTML=previewBox([['الرصيد الحالي',fmt(b.balance)+' '+b.currency],['المبلغ المسحوب','-'+fmt(amt),'color:var(--red)'],['الرصيد بعد العملية',fmt(after)+' '+b.currency,ok?'color:var(--green);font-weight:900':'color:var(--red);font-weight:900']])+(!ok?`<div style="color:var(--red);font-size:11px;margin-top:6px;font-weight:700">الرصيد غير كافٍ</div>`:'');
}
function updateTransferPreview(){
  const fromId=+document.getElementById('etr-from').value,toId=+document.getElementById('etr-to').value;
  const amt=N2(document.getElementById('etr-amount').value);
  const from=DB.banks.find(x=>x.id===fromId),to=DB.banks.find(x=>x.id===toId);
  if(!from||!to||!amt){document.getElementById('transfer-preview').innerHTML='';return}
  const fromCur=from.currency||'EGP',toCur=to.currency||'EGP';
  const egpAmt=toEGP(amt,fromCur);
  const toAmt=toCur===fromCur?amt:(toCur==='EGP'?egpAmt:egpAmt/getRate(toCur));
  const fromAfter=N2(from.balance)-amt,ok=fromAfter>=0;
  document.getElementById('transfer-preview').innerHTML=previewBox([
    [`من: ${from.name}`,`${fmt(from.balance)} ${fromCur} ← ${fmt(fromAfter)} ${fromCur}`,fromAfter>=0?'color:var(--green)':'color:var(--red)'],
    [`إلى: ${to.name}`,`${fmt(N2(to.balance))} ${toCur} ← ${fmt(N2(to.balance)+toAmt)} ${toCur}`,'color:var(--blue)'],
    fromCur!==toCur?['المبلغ المُحوَّل',`${fmtN(toAmt,2)} ${toCur} (بسعر ${fmtN(getRate(fromCur))} = 1 ${fromCur})`,'color:var(--muted)']:null
  ].filter(Boolean))+(!ok?`<div style="color:var(--red);font-size:11px;margin-top:6px;font-weight:700">الرصيد في ${from.name} غير كافٍ</div>`:'');
}
function updateBuyPreview(){
  const q=N2(document.getElementById('ebuy-qty').value),p=N2(document.getElementById('ebuy-price').value);
  const c=N2(document.getElementById('ebuy-comm').value),cf=N2(document.getElementById('ebuy-comm-fixed').value);
  if(!q||!p){document.getElementById('buy-preview').innerHTML='';return}
  const total=q*p,comm=total*c/100,net=total+comm+cf;
  document.getElementById('buy-preview').innerHTML=previewBox([['الإجمالي',fmt(total)],['العمولة ('+c+'%)','+'+fmt(comm),'color:var(--red)'],cf>0?['عمولة ثابتة','+'+fmt(cf),'color:var(--red)']:null,['الصافي المدفوع',fmt(net),'color:var(--blue);font-weight:900']].filter(Boolean));
}
function updateSellPreview(){
  const sym=document.getElementById('esell-sym').value,q=N2(document.getElementById('esell-qty').value),p=N2(document.getElementById('esell-price').value);
  const c=N2(document.getElementById('esell-comm').value),cf=N2(document.getElementById('esell-comm-fixed').value);
  if(!sym||!q||!p){document.getElementById('sell-preview').innerHTML='';return}
  const h=getHoldings(),hld=h[sym];if(!hld)return;
  const total=q*p,comm=total*c/100,net=total-comm-cf,profit=net-hld.avgPrice*q;
  const newQty=hld.qty-q,newCost=hld.totalCost-hld.avgPrice*q,newAvg=newQty>0?newCost/newQty:0;
  const qOk=q<=hld.qty;
  document.getElementById('sell-preview').innerHTML=previewBox([
    ['الإجمالي',fmt(total)],['العمولة ('+c+'%)','-'+fmt(comm),'color:var(--red)'],
    cf>0?['عمولة ثابتة','-'+fmt(cf),'color:var(--red)']:null,
    ['الصافي المستلم',fmt(net),'color:var(--green);font-weight:900'],
    ['ربح / خسارة هذه الصفقة',sign(profit)+fmt(profit),profit>=0?'color:var(--green);font-weight:800':'color:var(--red);font-weight:800'],
    ['متوسط التكلفة الجديد بعد البيع',newQty>0?fmtN(newAvg)+' '+baseCur():'لا يوجد مخزون','color:var(--purple)']
  ].filter(Boolean))+(!qOk?`<div style="color:var(--red);font-size:11px;margin-top:6px;font-weight:700">الكمية (${q}) أكبر من المملوك (${fmtN(hld.qty,2)})</div>`:'');
}
function updateMetalBuyPreview(){
  const w=N2(document.getElementById('emb-weight').value),p=N2(document.getElementById('emb-price').value);
  const mf=N2(document.getElementById('emb-manuf').value),cf=N2(document.getElementById('emb-fixed').value);
  if(!w||!p){document.getElementById('metal-buy-preview').innerHTML='';return}
  const total=w*p,manuf=mf*w,net=total+manuf+cf;
  document.getElementById('metal-buy-preview').innerHTML=previewBox([['الإجمالي ('+fmtN(w,3)+' جم × '+fmtN(p)+' '+baseCur()+')',fmt(total)],manuf>0?['رسوم التصنيع','+'+fmt(manuf),'color:var(--red)']:null,cf>0?['عمولة ثابتة','+'+fmt(cf),'color:var(--red)']:null,['الصافي المدفوع',fmt(net),'color:var(--gold);font-weight:900'],['تكلفة الجرام الفعلية',fmtN(w>0?net/w:0)+' '+baseCur()+'/جم','color:var(--muted)']].filter(Boolean));
}
function updateMetalSellPreview(){
  const type=document.getElementById('ems-type').value,w=N2(document.getElementById('ems-weight').value),p=N2(document.getElementById('ems-price').value),cb=N2(document.getElementById('ems-cashback').value);
  if(!type||!w||!p){document.getElementById('metal-sell-preview').innerHTML='';return}
  const mh=getMetalHoldings(),hld=mh[type];if(!hld)return;
  const net=w*p+cb,wOk=w<=hld.weight;
  const pnl=net-hld.avgPrice*w;
  document.getElementById('metal-sell-preview').innerHTML=previewBox([['الإجمالي',fmt(w*p)],cb>0?['كاش باك','+'+fmt(cb),'color:var(--green)']:null,['الصافي المستلم',fmt(net),'color:var(--green);font-weight:900'],['ربح / خسارة',sign(pnl)+fmt(pnl),pnl>=0?'color:var(--green);font-weight:800':'color:var(--red);font-weight:800'],['الوزن المملوك',fmtN(hld.weight,3)+' جم',wOk?'':'color:var(--red)']].filter(Boolean))+(!wOk?`<div style="color:var(--red);font-size:11px;margin-top:6px;font-weight:700">الوزن أكبر من المملوك</div>`:'');
}
function updateCertPreview(){
  const amount=N2(document.getElementById('ecert-amount').value),rate=N2(document.getElementById('ecert-rate').value);
  const dur=N2(document.getElementById('ecert-dur').value),payout=document.getElementById('ecert-payout').value;
  if(!amount||!rate){document.getElementById('cert-preview').innerHTML='';return}
  const totalInt=amount*rate/100*dur;
  const periodsMap={'سنوي':dur,'شهري':dur*12,'أسبوعي':dur*52,'يومي':dur*365};
  const periods=periodsMap[payout]||dur;
  const perPeriod=periods>0?totalInt/periods:0;
  document.getElementById('cert-preview').innerHTML=previewBox([['الفائدة السنوية',fmt(amount*rate/100),'color:var(--green)'],['العائد لكل '+payout,fmt(perPeriod),'color:var(--purple)'],['إجمالي الفائدة ('+dur+' سنة)',fmt(totalInt),'color:var(--green)'],['القيمة الإجمالية عند الاستحقاق',fmt(amount+totalInt),'color:var(--purple);font-weight:900']]);
}
function updateCertBreakPreview(){
  const certId=+document.getElementById('ecb-cert').value,fee=N2(document.getElementById('ecb-fee').value);
  const breakDate=document.getElementById('ecb-date').value;
  const cert=DB.certs.find(c=>c.id===certId);if(!cert){document.getElementById('cert-break-preview').innerHTML='';return}
  const now=new Date(breakDate||today()),issued=new Date(cert.issued_date),mat=new Date(cert.maturity_date);
  const isEarly=now<mat;
  const daysHeld=Math.max(0,Math.ceil((now-issued)/86400000));
  const totalDays=Math.max(1,Math.ceil((mat-issued)/86400000));
  const earnedInterest=isEarly?(N2(cert.total_interest)*daysHeld/totalDays):N2(cert.total_interest);
  const alreadyPaid=N2(cert.interest_paid);
  const remainingInterest=Math.max(0,earnedInterest-alreadyPaid);
  const refund=N2(cert.amount)+remainingInterest-fee;
  document.getElementById('cert-break-preview').innerHTML=previewBox([
    ['المبلغ الأصلي',fmt(cert.amount)],
    ['عائد مستحق ('+daysHeld+' يوم)',fmt(remainingInterest),'color:var(--green)'],
    fee>0?['رسوم الكسر','-'+fmt(fee),'color:var(--red)']:null,
    isEarly?['ملاحظة','كسر قبل الاستحقاق — عائد جزئي فقط','color:var(--gold)']:null,
    ['المبلغ المسترد',fmt(Math.max(0,refund)),refund>=N2(cert.amount)?'color:var(--green);font-weight:900':'color:var(--gold);font-weight:900']
  ].filter(Boolean));
  window._certBreakRefund=Math.max(0,refund);
  window._certBreakEarnedInt=remainingInterest;
}

// ═══ BANK ACTIONS ═══
async function saveBank(){
  const id=document.getElementById('eb-id').value;
  const name=document.getElementById('eb-name').value.trim();
  const bank_code=document.getElementById('eb-code').value.trim();
  const type=document.getElementById('eb-type').value;
  const currency=(document.getElementById('eb-currency').value.trim()||'EGP').toUpperCase();
  const account_no=document.getElementById('eb-account').value.trim();
  const min_balance=N2(document.getElementById('eb-min').value);
  const opening=N2(document.getElementById('eb-opening').value);
  const notes=document.getElementById('eb-notes').value.trim();
  const color=document.getElementById('eb-color')?.value||'#3b82f6';
  const is_active=document.getElementById('eb-active')?.checked!==false;
  if(!name)return alert('أدخل اسم البنك');
  try{
    if(id){
      await sbPatch('banks',id,{name,bank_code,type,currency,account_no,min_balance,notes,color,is_active});
      toast('تم تعديل الحساب ✓');
    }else{
      const res=await sbPost('banks',[{name,bank_code,type,currency,account_no,balance:opening,min_balance,notes,color,is_active:true}]);
      if(opening>0&&res?.[0]?.id){
        await sbPost('bank_transactions',[{bank_id:res[0].id,type:'رصيد افتتاحي',amount:opening,balance_after:opening,date:today(),notes:'رصيد افتتاحي'}]);
      }
      toast('تم إضافة الحساب ✓');
    }
    closeModal('modal-add-bank');await loadAll();
  }catch(e){toast('خطأ: '+e.message,false)}
}
function editBank(id){
  const b=DB.banks.find(x=>x.id===id);if(!b)return;
  document.getElementById('eb-id').value=b.id;
  document.getElementById('eb-name').value=b.name;
  document.getElementById('eb-code').value=b.bank_code||'';
  document.getElementById('eb-type').value=b.type;
  populateCurrencySelect('eb-currency');
  const bCurSel=document.getElementById('eb-currency');
  if(bCurSel){
    if(b.currency&&!currencyCodes().includes(b.currency))bCurSel.insertAdjacentHTML('beforeend',`<option value="${b.currency}">${b.currency} (غير مُدرج في الإعدادات)</option>`);
    bCurSel.value=b.currency||baseCur();
  }
  document.getElementById('eb-account').value=b.account_no||'';
  document.getElementById('eb-min').value=b.min_balance||0;
  document.getElementById('eb-opening').value=b.balance;
  document.getElementById('eb-notes').value=b.notes||'';
  const colorEl=document.getElementById('eb-color');if(colorEl)colorEl.value=b.color||'#3b82f6';
  const activeEl=document.getElementById('eb-active');if(activeEl)activeEl.checked=b.is_active!==false;
  document.getElementById('modal-add-bank-title').textContent='تعديل الحساب';
  openModal('modal-add-bank');
}
async function toggleBankStatus(id){
  const b=DB.banks.find(x=>x.id===id);if(!b)return;
  const newStatus=b.is_active===false;
  const msg=newStatus?`تفعيل حساب "${b.name}"؟`:`أرشفة حساب "${b.name}"؟ سيختفي من قوائم العمليات الجديدة لكن سجلاته محفوظة`;
  if(!confirm(msg))return;
  try{await sbPatch('banks',id,{is_active:newStatus});toast(newStatus?'تم تفعيل الحساب ✓':'تم أرشفة الحساب ✓');await loadAll()}catch(e){toast('خطأ: '+e.message,false)}
}
async function deleteBank(id){
  const b=DB.banks.find(x=>x.id===id);
  if(!confirm(`حذف حساب "${b?.name}" نهائياً؟ لا يمكن التراجع.`))return;
  try{await sbDel('banks',id);toast('تم الحذف');await loadAll()}catch(e){toast('خطأ: '+e.message,false)}
}
async function doDeposit(){
  const editId=document.getElementById('ed-txn-id')?.value;
  const bid=+document.getElementById('ed-bank').value;
  const amt=N2(document.getElementById('ed-amount').value);
  const dt=document.getElementById('ed-date').value||today();
  const notes=document.getElementById('ed-notes')?.value||'';
  const cat=document.getElementById('ed-category')?.value||'';
  if(!amt||amt<=0)return alert('أدخل مبلغ صحيح');
  if(!bid)return alert('اختر حساباً');
  const bank=DB.banks.find(b=>b.id===bid);if(!bank)return alert('الحساب غير موجود');
  try{
    if(editId){
      await sbPatch('bank_transactions',editId,{amount:amt,date:dt,notes,category:cat});
      await recomputeBankBalance(bid);
      closeModal('modal-dep');document.getElementById('ed-txn-id').value='';toast('تم التعديل');
    }else{
      const newBal=+(N2(bank.balance)+amt).toFixed(4);
      await sbPost('bank_transactions',[{bank_id:bid,type:'إيداع',amount:amt,balance_after:newBal,date:dt,notes,category:cat}]);
      await sbPatch('banks',bid,{balance:newBal});
      closeModal('modal-dep');toast('تم الإيداع');
    }
    await loadAll();
  }catch(e){console.error('doDeposit:',e);toast('خطأ: '+e.message,false)}
}
async function doWithdraw(){
  const editId=document.getElementById('ew-txn-id')?.value;
  const bid=+document.getElementById('ew-bank').value;
  const amt=N2(document.getElementById('ew-amount').value);
  const dt=document.getElementById('ew-date').value||today();
  const notes=document.getElementById('ew-notes')?.value||'';
  const cat=document.getElementById('ew-category')?.value||'';
  if(!amt||amt<=0)return alert('أدخل مبلغ صحيح');
  if(!bid)return alert('اختر حساباً');
  const bank=DB.banks.find(b=>b.id===bid);if(!bank)return alert('الحساب غير موجود');
  if(editId){
    const oldTxn=DB.bankTxns.find(t=>t.id===+editId);
    const availableBal=oldTxn&&oldTxn.bank_id===bid?N2(bank.balance)+N2(oldTxn.amount):N2(bank.balance);
    if(availableBal<amt)return alert('الرصيد غير كافٍ: '+fmt(availableBal));
  }else if(N2(bank.balance)<amt)return alert('الرصيد غير كافٍ: '+fmt(bank.balance));
  try{
    if(editId){
      await sbPatch('bank_transactions',editId,{amount:amt,date:dt,notes,category:cat});
      await recomputeBankBalance(bid);
      closeModal('modal-wit');document.getElementById('ew-txn-id').value='';toast('تم التعديل');
    }else{
      const newBal=+(N2(bank.balance)-amt).toFixed(4);
      await sbPost('bank_transactions',[{bank_id:bid,type:'سحب',amount:amt,balance_after:newBal,date:dt,notes,category:cat}]);
      await sbPatch('banks',bid,{balance:newBal});
      closeModal('modal-wit');toast('تم السحب');
    }
    await loadAll();
  }catch(e){console.error('doWithdraw:',e);toast('خطأ: '+e.message,false)}
}
async function doTransfer(){
  const fromId=+document.getElementById('etr-from').value;
  const toId=+document.getElementById('etr-to').value;
  const amt=N2(document.getElementById('etr-amount').value);
  const fee=N2(document.getElementById('etr-fee')?.value||0);
  const dt=document.getElementById('etr-date').value||today();
  const notes=document.getElementById('etr-notes')?.value||'';
  if(!fromId||!toId)return alert('اختر الحسابين');
  if(fromId===toId)return alert('الحسابان متطابقان');
  if(!amt||amt<=0)return alert('أدخل مبلغ صحيح');
  const from=DB.banks.find(b=>b.id===fromId),to=DB.banks.find(b=>b.id===toId);
  if(!from||!to)return alert('أحد الحسابين غير موجود');
  const fromCur=from.currency||'EGP',toCur=to.currency||'EGP';
  const egpAmt=toEGP(amt,fromCur);
  const totalDeducted=amt+fee;
  if(toEGP(N2(from.balance),fromCur)<toEGP(totalDeducted,fromCur))
    return alert(`الرصيد غير كافٍ في ${from.name}`);
  const toAmt=toCur===fromCur?amt:(toCur==='EGP'?egpAmt:egpAmt/getRate(toCur));
  const rateNote=fromCur!==toCur?`\nسعر الصرف: 1 ${fromCur} = ${fmtN(getRate(fromCur),4)} EGP | ${fmtN(amt,2)} ${fromCur} = ${fmtN(toAmt,2)} ${toCur}`:
    (fee>0?`\nرسوم التحويل: ${fmtN(fee,2)} ${fromCur}`:'');
  const uNote=notes?notes+'\n':'';
  const fromNote=`${uNote}تحويل إلى: ${to.name}${rateNote}`;
  const toNote=`${uNote}تحويل من: ${from.name}${rateNote}`;
  try{
    const fromNewBal=+(N2(from.balance)-totalDeducted).toFixed(4);
    const toNewBal=+(N2(to.balance)+toAmt).toFixed(4);
    const fromTxn=await sbPost('bank_transactions',[{bank_id:fromId,type:'تحويل صادر',amount:amt,balance_after:fromNewBal,date:dt,notes:fromNote,category:'تحويل'}]);
    const fromTxnId=fromTxn?.[0]?.id||null;
    if(fee>0)await sbPost('bank_transactions',[{bank_id:fromId,type:'سحب',amount:fee,balance_after:fromNewBal,date:dt,notes:`رسوم تحويل إلى ${to.name}`,category:'رسوم'}]);
    const toTxn=await sbPost('bank_transactions',[{bank_id:toId,type:'تحويل وارد',amount:toAmt,balance_after:toNewBal,date:dt,notes:toNote,category:'تحويل',linked_transfer_id:fromTxnId}]);
    const toTxnId=toTxn?.[0]?.id||null;
    if(fromTxnId&&toTxnId)await sbPatch('bank_transactions',fromTxnId,{linked_transfer_id:toTxnId});
    await sbPatch('banks',fromId,{balance:fromNewBal});
    await sbPatch('banks',toId,{balance:toNewBal});
    await recomputeBankBalance(fromId);
    await recomputeBankBalance(toId);
    closeModal('modal-transfer');toast('تم التحويل');await loadAll();
  }catch(e){console.error('doTransfer:',e);toast('خطأ: '+e.message,false);}
}
async function deleteBankTxn(id){
  const txn=DB.bankTxns.find(t=>t.id===id);
  if(!txn||!confirm('حذف هذه الحركة؟'))return;
  const bankId=txn.bank_id;
  try{
    let linkedBankId=null;
    if(txn.linked_transfer_id){
      const linked=DB.bankTxns.find(t=>t.id===txn.linked_transfer_id);
      if(linked){linkedBankId=linked.bank_id;await sbDel('bank_transactions',linked.id);}
    }
    await sbDel('bank_transactions',id);
    await recomputeBankBalance(bankId);
    if(linkedBankId&&linkedBankId!==bankId)await recomputeBankBalance(linkedBankId);
    toast('تم الحذف');await loadAll();
  }catch(e){console.error('deleteBankTxn:',e);toast('خطأ: '+e.message,false)}
}
async function recomputeBankBalance(bankId){
  if(!bankId)return;
  try{
    const txns=await sbGet('bank_transactions','?bank_id=eq.'+bankId+'&order=date.asc,id.asc&limit=50000');
    if(!txns||!txns.length){await sbPatch('banks',bankId,{balance:0});return;}
    const CREDIT=['إيداع','تحويل وارد','رصيد افتتاحي','عائد شهادة','أرباح'];
    let running=0;const updates=[];
    for(const t of txns){
      const eff=CREDIT.includes(t.type)?+N2(t.amount):-N2(t.amount);
      running=+(running+eff).toFixed(4);
      if(Math.abs(N2(t.balance_after)-running)>0.005)updates.push(sbPatch('bank_transactions',t.id,{balance_after:running}));
    }
    if(updates.length)await Promise.all(updates);
    await sbPatch('banks',bankId,{balance:running});
  }catch(e){console.error('recomputeBankBalance:',e);}
}

function editBankTxn(id){
  const t=DB.bankTxns.find(x=>x.id===id);if(!t)return;
  editCtx={table:'bank_transactions',id};
  const bank=DB.banks.find(b=>b.id===t.bank_id);
  const isDeposit=['إيداع','تحويل وارد','رصيد افتتاحي','عائد شهادة'].includes(t.type);
  const catOpts=isDeposit
    ?'<option value="">— اختر —</option><option value="مرتب">مرتب</option><option value="عائد استثماري">عائد استثماري</option><option value="مكافأة">مكافأة</option><option value="أرباح أسهم">أرباح أسهم</option><option value="عائد شهادة">عائد شهادة</option><option value="تحويل">تحويل وارد</option><option value="أخرى - إيداع">أخرى</option>'
    :'<option value="">— اختر —</option><option value="مصروفات منزلية">مصروفات منزلية</option><option value="فواتير">فواتير</option><option value="تعليم">تعليم</option><option value="صحة">صحة</option><option value="استثمار">استثمار</option><option value="تحويل صادر">تحويل صادر</option><option value="سداد دين">سداد دين</option><option value="أخرى - سحب">أخرى</option>';
  document.getElementById('edit-modal-title').textContent='تعديل حركة بنكية';
  document.getElementById('edit-modal-body').innerHTML=`
    <div style="padding:10px 12px;background:var(--surface2);border-radius:var(--radius-sm);margin-bottom:12px;font-size:12px">
      الحساب: <strong>${escapeHtml(bank?.name||'—')}</strong> | العملة: <strong style="color:var(--blue)">${bank?.currency||'EGP'}</strong>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">التاريخ</label><input class="form-control" type="date" id="edt-date" value="${t.date}"></div>
      <div class="form-group"><label class="form-label">النوع</label>
        <select class="form-control" id="edt-type">
          <option ${t.type==='إيداع'?'selected':''}>إيداع</option>
          <option ${t.type==='سحب'?'selected':''}>سحب</option>
          <option ${t.type==='تحويل وارد'?'selected':''}>تحويل وارد</option>
          <option ${t.type==='تحويل صادر'?'selected':''}>تحويل صادر</option>
          <option ${t.type==='عائد شهادة'?'selected':''}>عائد شهادة</option>
          <option ${t.type==='رصيد افتتاحي'?'selected':''}>رصيد افتتاحي</option>
        </select>
      </div>
    </div>
    <div class="form-group"><label class="form-label">المبلغ (${bank?.currency||'EGP'})</label><input class="form-control" type="number" step="0.01" id="edt-amount" value="${t.amount}"></div>
    <div class="form-group"><label class="form-label">الفئة</label><select class="form-control" id="edt-cat">${catOpts}</select></div>
    <div class="form-group"><label class="form-label">ملاحظات</label><textarea class="form-control" id="edt-notes" rows="3" style="resize:vertical">${escapeHtml(t.notes||'')}</textarea></div>
    <div class="form-hint" style="margin-top:4px">الرصيد بعد العملية يُحسب تلقائياً عند الحفظ ✓</div>
  `;
  setTimeout(()=>{const cs=document.getElementById('edt-cat');if(cs&&t.category)cs.value=t.category},0);
  openModal('modal-edit');
}

// ═══ STOCK ACTIONS ═══
function autoFillStock(){
  const sym=document.getElementById('ebuy-sym').value.trim().toUpperCase();
  if(!sym)return;
  const existingTxn=DB.stockTxns.filter(t=>t.symbol===sym).sort((a,b)=>b.date>a.date?1:-1)[0];
  const existingPrice=DB.stockPrices.find(p=>p.symbol===sym);
  if(existingTxn){
    const nameEl=document.getElementById('ebuy-name');
    if(nameEl&&!nameEl.value)nameEl.value=existingTxn.name||'';
    if(existingTxn.sec_type){const el=document.getElementById('ebuy-type');if(el)el.value=existingTxn.sec_type;}
    if(existingTxn.market){const el=document.getElementById('ebuy-market');if(el)el.value=existingTxn.market;}
    if(existingTxn.price_currency){const el=document.getElementById('ebuy-currency');if(el)el.value=existingTxn.price_currency;}
    if(existingTxn.quantity&&existingTxn.price&&existingTxn.commission){
      const rate=N2(existingTxn.commission)/(N2(existingTxn.quantity)*N2(existingTxn.price))*100;
      const el=document.getElementById('ebuy-comm');if(el)el.value=rate.toFixed(3);
    }
    if(existingTxn.bank_id){const el=document.getElementById('ebuy-bank');if(el)setTimeout(()=>el.value=existingTxn.bank_id,60);}
  }
  const cp=existingPrice?.current_price||getStockPrice(sym);
  if(cp){const el=document.getElementById('ebuy-price');if(el&&!el.value)el.value=fmtN(cp,2);}
}
async function doBuy(){
  const isEdit=document.getElementById('ebuy-id').value;
  const sym=document.getElementById('ebuy-sym').value.toUpperCase().trim();
  const name=document.getElementById('ebuy-name').value.trim();
  const sec_type=document.getElementById('ebuy-type').value;
  const market=document.getElementById('ebuy-market')?.value||'EGX';
  const price_currency=document.getElementById('ebuy-currency')?.value||'EGP';
  const qty=N2(document.getElementById('ebuy-qty').value),price=N2(document.getElementById('ebuy-price').value);
  const commPct=N2(document.getElementById('ebuy-comm').value),commFixed=N2(document.getElementById('ebuy-comm-fixed').value);
  const dt=document.getElementById('ebuy-date').value||today(),bankId=+document.getElementById('ebuy-bank').value;
  const userNotes=document.getElementById('ebuy-notes-field')?.value||'';
  if(!sym||!name||!qty||!price)return alert('أكمل البيانات المطلوبة');
  if(!bankId)return alert('اختر حساباً بنكياً');
  const total=qty*price,commission=total*commPct/100,net=total+commission+commFixed;
  const bank=DB.banks.find(b=>b.id===bankId);
  if(!bank)return alert('الحساب غير موجود');
  const bankCur=bank.currency||'EGP';
  if(price_currency!==bankCur)return alert(`عملة السهم (${price_currency}) لا تطابق عملة الحساب البنكي "${bank.name}" (${bankCur}).`);
  const oldForEdit=isEdit?DB.stockTxns.find(t=>t.id===+isEdit):null;
  let availableBal=N2(bank.balance);
  if(oldForEdit&&oldForEdit.bank_id===bankId)availableBal+=N2(oldForEdit.net);
  if(toEGP(availableBal,bankCur)<toEGP(net,bankCur))return alert('الرصيد غير كافٍ: '+fmt(availableBal)+' '+bankCur);
  try{
    if(isEdit){
      const old=oldForEdit;
      const oldBankId=old?.bank_id;
      const buyAutoNote=`سعر الشراء: ${fmtN(price)} ج.م/سهم${commFixed>0?' | عمولة ثابتة: '+fmtN(commFixed)+' ج.م':''}`;
      const buyNote=userNotes?userNotes+'\n'+buyAutoNote:buyAutoNote;
      await sbPatch('stock_transactions',isEdit,{symbol:sym,name,sec_type,quantity:qty,price,total,commission,net,date:dt,commission_fixed:commFixed,bank_id:bankId,notes:buyNote});
      if(old?.bank_transaction_id){
        await sbPatch('bank_transactions',old.bank_transaction_id,{bank_id:bankId,amount:net,date:dt,notes:'شراء '+sym+'\n'+buyNote});
      }
      await recomputeBankBalance(bankId);
      if(oldBankId&&oldBankId!==bankId)await recomputeBankBalance(oldBankId);
      toast('تم التعديل ✓');
    }else{
      const newBal=N2(bank.balance)-net;
      const bt=await sbPost('bank_transactions',[{bank_id:bankId,type:'سحب',amount:net,balance_after:newBal,date:dt,notes:'شراء '+sym}]);
      await sbPatch('banks',bankId,{balance:newBal});
      const buyAutoNote=`سعر الشراء: ${fmtN(price)} ج.م/سهم${commFixed>0?' | عمولة ثابتة: '+fmtN(commFixed)+' ج.م':''}`;
      const buyNote=userNotes?userNotes+'\n'+buyAutoNote:buyAutoNote;
      await sbPostResilient('stock_transactions',[{bank_id:bankId,type:'شراء',symbol:sym,name,sec_type,market,price_currency,quantity:qty,price,total,commission,net,date:dt,commission_fixed:commFixed,bank_transaction_id:bt?.[0]?.id||null,notes:buyNote}],['market','price_currency']);
      await sbUpsert('stock_prices',{symbol:sym,name,sec_type,current_price:getStockPrice(sym)||price,updated_at:new Date().toISOString()});
      toast('تم الشراء ✓');
    }
    closeModal('modal-buy');document.getElementById('ebuy-id').value='';await loadAll();
  }catch(e){toast('خطأ: '+e.message,false)}
}
async function doSell(){
  const sym=document.getElementById('esell-sym').value;
  const qty=N2(document.getElementById('esell-qty').value),price=N2(document.getElementById('esell-price').value);
  const commPct=N2(document.getElementById('esell-comm').value),commFixed=N2(document.getElementById('esell-comm-fixed').value);
  const dt=document.getElementById('esell-date').value||today(),bankId=+document.getElementById('esell-bank').value;
  const userSellNotes=document.getElementById('esell-notes')?.value||'';
  if(!sym||!qty||!price)return alert('أكمل البيانات');
  if(!bankId)return alert('اختر حساباً بنكياً');
  const h=getHoldings();if(!h[sym])return alert('الورقة المالية غير مملوكة');
  if(qty>h[sym].qty+0.0001)return alert(`الكمية (${fmtN(qty,2)}) أكبر من المملوك (${fmtN(h[sym].qty,2)})`);
  const total=qty*price,commission=total*commPct/100,net=total-commission-commFixed;
  const profit=net-h[sym].avgPrice*qty;
  const bank=DB.banks.find(b=>b.id===bankId);if(!bank)return alert('الحساب غير موجود');
  try{
    const autoNote=`سعر البيع: ${fmtN(price)} ج.م/وحدة | متوسط التكلفة: ${fmtN(h[sym].avgPrice)} ج.م | ر/خ: ${sign(profit)}${fmtN(profit)} ج.م`;
    const notesFull=userSellNotes?userSellNotes+'\n'+autoNote:autoNote;
    const newBal=+(N2(bank.balance)+net).toFixed(4);
    const bt=await sbPost('bank_transactions',[{bank_id:bankId,type:'إيداع',amount:net,balance_after:newBal,date:dt,notes:`بيع ${sym}${userSellNotes?' | '+userSellNotes:''}\n${autoNote}`,category:'بيع أسهم'}]);
    const btId=bt?.[0]?.id||null;
    await sbPost('stock_transactions',[{bank_id:bankId,type:'بيع',symbol:sym,name:h[sym].name,sec_type:h[sym].type,quantity:qty,price,total,commission,net,profit,date:dt,commission_fixed:commFixed,bank_transaction_id:btId,notes:notesFull}]);
    await sbPatch('banks',bankId,{balance:newBal});
    closeModal('modal-sell');toast('تم البيع');await loadAll();
  }catch(e){console.error('doSell:',e);toast('خطأ: '+e.message,false)}
}
async function deleteStockTxn(id){
  const txn=DB.stockTxns.find(t=>t.id===id);
  if(!txn||!confirm('حذف هذه العملية وعكس أثرها البنكي؟'))return;
  try{
    let bankId=null;
    if(txn.bank_transaction_id){
      const bt=DB.bankTxns.find(t=>t.id===txn.bank_transaction_id);
      if(bt){bankId=bt.bank_id;await sbDel('bank_transactions',bt.id);}
    }
    await sbDel('stock_transactions',id);
    if(bankId)await recomputeBankBalance(bankId);
    toast('تم الحذف');await loadAll();
  }catch(e){console.error('deleteStockTxn:',e);toast('خطأ: '+e.message,false)}
}
function editStockTxn(id){
  const t=DB.stockTxns.find(x=>x.id===id);if(!t)return;
  const h=getHoldings();
  if(t.type==='شراء'){
    document.getElementById('ebuy-id').value=t.id;
    document.getElementById('ebuy-sym').value=t.symbol;
    document.getElementById('ebuy-name').value=t.name;
    document.getElementById('ebuy-type').value=t.sec_type||'سهم';
    document.getElementById('ebuy-qty').value=t.quantity;
    document.getElementById('ebuy-price').value=t.price;
    const commRate=N2(t.quantity)&&N2(t.price)?((N2(t.commission)/(N2(t.quantity)*N2(t.price)))*100).toFixed(3):'0.5';
    document.getElementById('ebuy-comm').value=commRate;
    document.getElementById('ebuy-comm-fixed').value=t.commission_fixed||0;
    document.getElementById('ebuy-date').value=t.date;
    populateSelect('ebuy-bank');
    setTimeout(()=>{document.getElementById('ebuy-bank').value=t.bank_id||''},50);
    document.getElementById('buy-preview').innerHTML='';
    openModal('modal-buy');
  }else{
    editCtx={table:'stock_transactions',id};
    document.getElementById('edit-modal-title').textContent='تعديل عملية بيع أسهم';
    document.getElementById('edit-modal-body').innerHTML=`
      <div style="padding:10px 12px;background:var(--surface2);border-radius:var(--radius-sm);margin-bottom:12px;font-size:12px">
        ${escapeHtml(t.symbol)} — ${escapeHtml(t.name)} | النوع: <strong style="color:var(--red)">بيع</strong>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">التاريخ</label><input class="form-control" type="date" id="edt-date" value="${t.date}"></div>
        <div class="form-group"><label class="form-label">الكمية</label><input class="form-control" type="number" step="0.001" id="edt-qty" value="${t.quantity}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">السعر (ج.م)</label><input class="form-control" type="number" step="0.01" id="edt-price" value="${t.price}"></div>
        <div class="form-group"><label class="form-label">العمولة (ج.م)</label><input class="form-control" type="number" step="0.01" id="edt-commission" value="${t.commission}"></div>
      </div>
      <div class="form-group"><label class="form-label">ملاحظات</label><input class="form-control" id="edt-notes" value="${escapeHtml(t.notes||'')}"></div>
    `;
    openModal('modal-edit');
  }
}
function addMoreStock(sym){
  const h=getHoldings();const hld=h[sym];if(!hld)return;
  const lastBuy=[...DB.stockTxns].filter(t=>t.symbol===sym&&t.type==='شراء').sort((a,b)=>b.date>a.date?1:-1)[0];
  const currentPrice=getStockPrice(sym)||hld.avgPrice;
  document.getElementById('ebuy-id').value='';
  document.getElementById('ebuy-sym').value=sym;
  document.getElementById('ebuy-name').value=hld.name;
  document.getElementById('ebuy-type').value=hld.type||lastBuy?.sec_type||'سهم';
  const mktEl=document.getElementById('ebuy-market');
  if(mktEl)mktEl.value=hld.market||lastBuy?.market||'EGX';
  const curEl=document.getElementById('ebuy-currency');
  if(curEl)curEl.value=hld.currency||lastBuy?.price_currency||'EGP';
  document.getElementById('ebuy-qty').value='';
  document.getElementById('ebuy-price').value=currentPrice>0?fmtN(currentPrice,2):'';
  const lastComm=lastBuy&&N2(lastBuy.quantity)&&N2(lastBuy.price)?
    ((N2(lastBuy.commission)/(N2(lastBuy.quantity)*N2(lastBuy.price)))*100).toFixed(3):'0.5';
  document.getElementById('ebuy-comm').value=lastComm;
  document.getElementById('ebuy-comm-fixed').value=lastBuy?.commission_fixed||0;
  document.getElementById('ebuy-date').value=today();
  populateSelect('ebuy-bank');
  if(lastBuy?.bank_id)setTimeout(()=>{document.getElementById('ebuy-bank').value=lastBuy.bank_id},50);
  document.getElementById('buy-preview').innerHTML='';
  openModal('modal-buy');
}

// ═══ METAL ACTIONS ═══
async function doMetalBuy(){
  const typeSel=document.getElementById('emb-metal-type')?.value;
  const metal_type=typeSel==='__custom__'?(document.getElementById('emb-metal-custom')?.value?.trim()||''):(typeSel||'ذهب 21');
  const metal_title=document.getElementById('emb-notes')?.value?.trim()||'';
  const weight=N2(document.getElementById('emb-weight').value),price_per_gram=N2(document.getElementById('emb-price').value);
  const currency=document.getElementById('emb-currency')?.value||baseCur();
  const manuf_per_gram=N2(document.getElementById('emb-manuf').value),cf=N2(document.getElementById('emb-fixed').value);
  const dt=document.getElementById('emb-date').value||today(),bankId=+document.getElementById('emb-bank').value;
  if(!metal_type||!weight||!price_per_gram)return alert('أكمل البيانات: نوع المعدن والوزن والسعر');
  if(!bankId)return alert('اختر حساباً بنكياً');
  const total=weight*price_per_gram;
  const manufacturing=manuf_per_gram*weight;
  const net=total+manufacturing+cf;
  const bank=DB.banks.find(b=>b.id===bankId);if(!bank)return alert('الحساب غير موجود');
  const bankCur=bank.currency||'EGP';
  if(currency!==bankCur)return alert(`عملة الشراء (${currency}) لا تطابق عملة الحساب (${bankCur}).`);
  if(toEGP(N2(bank.balance),bankCur)<toEGP(net,bankCur))return alert('الرصيد غير كافٍ');
  try{
    const autoNote=`نوع: ${metal_type}${metal_title?' — '+metal_title:''} | سعر الجرام: ${fmtN(price_per_gram)} ${currency}${manufacturing>0?' | تصنيع: '+fmtN(manuf_per_gram,2)+' '+currency+'/جم':''}`;
    const newBal=+(N2(bank.balance)-net).toFixed(4);
    const bt=await sbPost('bank_transactions',[{bank_id:bankId,type:'سحب',amount:net,balance_after:newBal,date:dt,notes:`شراء ${metal_type}${metal_title?' ('+metal_title+')':''}\n${autoNote}`,category:'شراء معادن'}]);
    const btId=bt?.[0]?.id||null;
    await sbPostResilient('metal_transactions',[{bank_id:bankId,op:'شراء',metal_type,weight,price_per_gram,currency,total,manufacturing,cashback:0,net,date:dt,notes:metal_title,commission_fixed:cf,bank_transaction_id:btId}],['currency']);
    await sbPatch('banks',bankId,{balance:newBal});
    if(!getMetalPrice(metal_type))await sbUpsert('metal_prices',{metal_type,price_per_gram,updated_at:new Date().toISOString()});
    closeModal('modal-metal-buy');toast('تم الشراء');await loadAll();
  }catch(e){console.error('doMetalBuy:',e);toast('خطأ: '+e.message,false)}
}
async function doMetalSell(){
  const metalKey=document.getElementById('ems-type').value;
  const weight=N2(document.getElementById('ems-weight').value),price_per_gram=N2(document.getElementById('ems-price').value);
  const cashback=N2(document.getElementById('ems-cashback').value),dt=document.getElementById('ems-date').value||today();
  const bankId=+document.getElementById('ems-bank').value;
  if(!metalKey||!weight||!price_per_gram)return alert('أكمل البيانات');
  if(!bankId)return alert('اختر حساباً بنكياً');
  const keyParts=metalKey.split('|');
  const metal_type=keyParts[0];
  const metal_title=keyParts[1]||'';
  const mh=getMetalHoldings();
  if(!mh[metalKey])return alert('الحيازة غير موجودة');
  const hld=mh[metalKey];
  if(weight>hld.weight+0.0001)return alert(`الوزن (${fmtN(weight,3)}جم) أكبر من المملوك (${fmtN(hld.weight,3)}جم)`);
  const total=weight*price_per_gram,net=total+cashback;
  const pnl=net-hld.avgPrice*weight;
  const bank=DB.banks.find(b=>b.id===bankId);if(!bank)return alert('الحساب غير موجود');
  try{
    const autoNote=`نوع: ${metal_type}${metal_title?' — '+metal_title:''} | سعر البيع: ${fmtN(price_per_gram)} ج.م/جم | متوسط التكلفة: ${fmtN(hld.avgPrice)} ج.م/جم | ر/خ: ${sign(pnl)}${fmtN(pnl)} ج.م`;
    const newBal=+(N2(bank.balance)+net).toFixed(4);
    const bt=await sbPost('bank_transactions',[{bank_id:bankId,type:'إيداع',amount:net,balance_after:newBal,date:dt,notes:`بيع ${metal_type}${metal_title?' ('+metal_title+')':''}\n${autoNote}`,category:'بيع معادن'}]);
    const btId=bt?.[0]?.id||null;
    await sbPost('metal_transactions',[{bank_id:bankId,op:'بيع',metal_type,weight,price_per_gram,total,manufacturing:0,cashback,net,date:dt,notes:metal_title,bank_transaction_id:btId}]);
    await sbPatch('banks',bankId,{balance:newBal});
    closeModal('modal-metal-sell');toast('تم البيع');await loadAll();
  }catch(e){console.error('doMetalSell:',e);toast('خطأ: '+e.message,false)}
}
async function deleteMetalTxn(id){
  const txn=DB.metalTxns.find(t=>t.id===id);
  if(!txn||!confirm('حذف هذه العملية وعكس أثرها البنكي؟'))return;
  try{
    let bankId=null;
    if(txn.bank_transaction_id){
      const bt=DB.bankTxns.find(t=>t.id===txn.bank_transaction_id);
      if(bt){bankId=bt.bank_id;await sbDel('bank_transactions',bt.id);}
    }
    await sbDel('metal_transactions',id);
    if(bankId)await recomputeBankBalance(bankId);
    toast('تم الحذف');await loadAll();
  }catch(e){console.error('deleteMetalTxn:',e);toast('خطأ: '+e.message,false)}
}
function editMetalTxn(id){
  const t=DB.metalTxns.find(x=>x.id===id);if(!t)return;
  editCtx={table:'metal_transactions',id};
  const isBuy=t.op==='شراء';
  const manufPerGram=N2(t.weight)>0?N2(t.manufacturing)/N2(t.weight):0;
  document.getElementById('edit-modal-title').innerHTML='تعديل عملية معادن';
  document.getElementById('edit-modal-body').innerHTML=`
    <div class="form-row">
      <div class="form-group"><label class="form-label">التاريخ</label><input class="form-control" type="date" id="edt-date" value="${t.date}"></div>
      <div class="form-group"><label class="form-label">النوع</label><select class="form-control" id="edt-op"><option ${t.op==='شراء'?'selected':''}>شراء</option><option ${t.op==='بيع'?'selected':''}>بيع</option></select></div>
    </div>
    <div class="form-group"><label class="form-label">اسم المعدن</label><input class="form-control" id="edt-metal" value="${escapeHtml(t.metal_type)}"></div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">الوزن (جم)</label><input class="form-control" type="number" step="0.001" id="edt-weight" value="${t.weight}"></div>
      <div class="form-group"><label class="form-label">سعر/جم (ج.م)</label><input class="form-control" type="number" step="0.01" id="edt-price" value="${t.price_per_gram}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">تصنيع/جم</label><input class="form-control" type="number" step="0.01" id="edt-manuf" value="${isBuy?fmtN(manufPerGram,4):0}" ${isBuy?'':'disabled'}></div>
      <div class="form-group"><label class="form-label">${isBuy?'عمولة ثابتة':'كاش باك'}</label><input class="form-control" type="number" step="0.01" id="edt-extra" value="${isBuy?N2(t.commission_fixed):N2(t.cashback)}"></div>
    </div>
    <div class="form-group"><label class="form-label">الحساب البنكي المرتبط</label><select class="form-control" id="edt-bank-id"></select></div>
    <div class="form-group"><label class="form-label">ملاحظات</label><input class="form-control" id="edt-notes" value="${escapeHtml(t.notes||'')}"></div>
    <div class="form-hint" style="margin-top:4px">الصافي والرصيد البنكي يُحسبان ويُحدَّثان تلقائياً عند الحفظ</div>
  `;
  populateSelect('edt-bank-id');
  setTimeout(()=>{const el=document.getElementById('edt-bank-id');if(el)el.value=t.bank_id||''},0);
  openModal('modal-edit');
}

// ═══ CERT ACTIONS ═══
async function saveCert(){
  const id=document.getElementById('ecert-id').value;
  const name=document.getElementById('ecert-name').value.trim();
  const bank_name=document.getElementById('ecert-bank-name').value.trim();
  const amount=N2(document.getElementById('ecert-amount').value);
  const currency=document.getElementById('ecert-currency')?.value||baseCur();
  const rate=N2(document.getElementById('ecert-rate').value);
  const duration=N2(document.getElementById('ecert-dur').value);
  const issued=document.getElementById('ecert-date').value||today();
  const payout_type=document.getElementById('ecert-payout').value;
  const bankId=+document.getElementById('ecert-bank').value;
  if(!name||!amount||!rate)return alert('أكمل البيانات');
  const mat=new Date(issued);mat.setFullYear(mat.getFullYear()+duration);
  const maturity_date=mat.toISOString().slice(0,10);
  const total_interest=+(amount*rate/100*duration).toFixed(4);
  try{
    if(id){
      const orig=DB.certs.find(c=>c.id===+id);
      await sbPatch('certificates',id,{name,bank_name,amount,currency,rate,duration,issued_date:issued,maturity_date,total_interest,payout_type});
      if(orig?.bank_transaction_id&&(N2(orig.amount)!==amount||orig.issued_date!==issued)){
        await sbPatch('bank_transactions',orig.bank_transaction_id,{amount,date:issued,notes:'شراء شهادة: '+name});
        if(orig.bank_id)await recomputeBankBalance(orig.bank_id);
      }
      closeModal('modal-cert-add');document.getElementById('ecert-id').value='';toast('تم التعديل');
    }else{
      if(!bankId)return alert('اختر الحساب البنكي');
      const bank=DB.banks.find(b=>b.id===bankId);if(!bank)return alert('الحساب غير موجود');
      const bankCur=bank.currency||'EGP';
      if(currency!==bankCur)return alert(`عملة الشراء (${currency}) لا تطابق عملة الحساب (${bankCur}).`);
      if(toEGP(N2(bank.balance),bankCur)<toEGP(amount,bankCur))return alert('الرصيد غير كافٍ');
      const newBal=+(N2(bank.balance)-amount).toFixed(4);
      const bt=await sbPost('bank_transactions',[{bank_id:bankId,type:'سحب',amount,balance_after:newBal,date:issued,notes:'شراء شهادة: '+name,category:'شهادة ادخارية'}]);
      await sbPatch('banks',bankId,{balance:newBal});
      const btId=bt?.[0]?.id||null;
      await sbPostResilient('certificates',[{bank_id:bankId,name,bank_name,amount,currency,rate,duration,issued_date:issued,maturity_date,total_interest,payout_type,interest_paid:0,bank_transaction_id:btId}],['currency']);
      closeModal('modal-cert-add');document.getElementById('ecert-id').value='';toast('تم إضافة الشهادة');
    }
    await loadAll();
  }catch(e){console.error('saveCert:',e);toast('خطأ: '+e.message,false)}
}
async function doCertBreak(){
  const certId=+document.getElementById('ecb-cert').value;
  const dt=document.getElementById('ecb-date').value||today();
  const fee=N2(document.getElementById('ecb-fee').value);
  const bankId=+document.getElementById('ecb-bank').value;
  const notes=document.getElementById('ecb-notes')?.value||'';
  const cert=DB.certs.find(c=>c.id===certId);
  if(!cert)return alert('اختر شهادة');
  if(!bankId)return alert('اختر حساباً بنكياً');
  const now=new Date(dt),issued=new Date(cert.issued_date),mat=new Date(cert.maturity_date);
  const isEarly=now<mat;
  const daysHeld=Math.max(0,Math.ceil((now-issued)/86400000));
  const totalDays=Math.max(1,Math.ceil((mat-issued)/86400000));
  const earnedInterest=isEarly?+(N2(cert.total_interest)*daysHeld/totalDays).toFixed(4):N2(cert.total_interest);
  const alreadyPaid=N2(cert.interest_paid);
  const remainingInterest=Math.max(0,earnedInterest-alreadyPaid);
  const refund=Math.max(0,N2(cert.amount)+remainingInterest-fee);
  if(!confirm(`كسر شهادة "${cert.name}"؟\nالمبلغ المسترد: ${fmt(refund)}`))return;
  const bank=DB.banks.find(b=>b.id===bankId);if(!bank)return alert('الحساب غير موجود');
  try{
    const newBal=+(N2(bank.balance)+refund).toFixed(4);
    const notesFull=`كسر شهادة: ${cert.name} | أصل: ${fmt(cert.amount)} | فائدة: ${fmt(remainingInterest)} | رسوم: ${fmt(fee)}${notes?' | '+notes:''}${isEarly?' | كسر مبكر':''}`;
    await sbPost('bank_transactions',[{bank_id:bankId,type:'إيداع',amount:refund,balance_after:newBal,date:dt,notes:notesFull,category:'كسر شهادة'}]);
    await sbPatch('banks',bankId,{balance:newBal});
    const originalBankId=cert.bank_id;
    if(cert.bank_transaction_id){try{await sbDel('bank_transactions',cert.bank_transaction_id);}catch(e){}}
    await sbDel('certificates',certId);
    await recomputeBankBalance(bankId);
    if(originalBankId&&originalBankId!==bankId)await recomputeBankBalance(originalBankId);
    closeModal('modal-cert-break');toast('تم كسر الشهادة');await loadAll();
  }catch(e){console.error('doCertBreak:',e);toast('خطأ: '+e.message,false)}
}
function getCertPayoutSchedule(cert){
  const payout=cert.payout_type||'سنوي';
  const periodDays={'يومي':1,'أسبوعي':7,'شهري':30.4375,'سنوي':365.25}[payout]||365.25;
  const issued=new Date(cert.issued_date),maturity=new Date(cert.maturity_date);
  const totalDays=Math.max(1,(maturity-issued)/86400000);
  const totalPeriods=Math.ceil(totalDays/periodDays);
  const perPeriod=N2(cert.total_interest)/Math.max(1,totalPeriods);
  const elapsedDays=(new Date()-issued)/86400000;
  const completedPeriods=Math.min(totalPeriods,Math.floor(Math.max(0,elapsedDays)/periodDays));
  const alreadyPaid=N2(cert.interest_paid);
  const alreadyPaidPeriods=perPeriod>0?Math.round(alreadyPaid/perPeriod):0;
  const unpaidPeriods=[];
  for(let i=alreadyPaidPeriods+1;i<=completedPeriods;i++){
    const dueDate=new Date(issued.getTime()+i*periodDays*86400000);
    const isLast=i===totalPeriods;
    let amt=perPeriod;
    if(isLast){const paidSoFar=perPeriod*(i-1);amt=Math.max(0,N2(cert.total_interest)-paidSoFar);}
    unpaidPeriods.push({period:i,date:dueDate.toISOString().slice(0,10),amount:+amt.toFixed(4)});
  }
  return{payout,periodDays,totalPeriods,perPeriod,completedPeriods,alreadyPaidPeriods,unpaidPeriods};
}
function setCertPayoutMode(mode){
  const singleWrap=document.getElementById('ecp-mode-single-wrap'),scheduleWrap=document.getElementById('ecp-mode-schedule-wrap');
  document.getElementById('ecp-single-fields').classList.toggle('hidden',mode==='schedule');
  document.getElementById('ecp-schedule-fields').classList.toggle('hidden',mode!=='schedule');
  document.getElementById('ecp-submit-btn').textContent=mode==='schedule'?' تسجيل كل الدفعات المستحقة':' صرف العائد';
  if(singleWrap)singleWrap.style.borderColor=mode==='single'?'var(--green)':'var(--border2)';
  if(scheduleWrap)scheduleWrap.style.borderColor=mode==='schedule'?'var(--green)':'var(--border2)';
  if(mode==='schedule'){
    const certId=+document.getElementById('ecp-cert-id').value;
    const cert=DB.certs.find(c=>c.id===certId);if(!cert)return;
    const sched=getCertPayoutSchedule(cert);
    const preview=document.getElementById('ecp-schedule-preview');
    preview.innerHTML=sched.unpaidPeriods.length?sched.unpaidPeriods.map(p=>
      `<div style="display:flex;justify-content:space-between;padding:5px 2px;font-size:12px;border-bottom:.5px solid var(--border)"><span>دفعة رقم ${p.period} — ${p.date}</span><strong class="pos">${fmt(p.amount)}</strong></div>`
    ).join('')+`<div style="display:flex;justify-content:space-between;padding:6px 2px;font-size:12.5px;font-weight:800;margin-top:4px"><span>الإجمالي (${sched.unpaidPeriods.length} دفعة)</span><span>${fmt(sched.unpaidPeriods.reduce((a,p)=>a+p.amount,0))}</span></div>`
      :`<div style="text-align:center;color:var(--muted);font-size:12px;padding:10px">لا توجد دفعات مستحقة غير مُسجَّلة</div>`;
  }
}
function openCertPayout(certId){
  const cert=DB.certs.find(c=>c.id===certId);if(!cert)return;
  document.getElementById('ecp-cert-id').value=certId;
  const accrued=calcAccruedInterest(cert);
  const alreadyPaid=N2(cert.interest_paid);
  const canCollect=Math.max(0,accrued-alreadyPaid);
  const nextDate=calcNextPayoutDate(cert);
  const payout=cert.payout_type||'سنوي';
  const periodDays={'يومي':1,'أسبوعي':7,'شهري':30.4375,'سنوي':365.25}[payout]||365.25;
  const totalDays=Math.max(1,(new Date(cert.maturity_date)-new Date(cert.issued_date))/86400000);
  const totalPeriods=Math.ceil(totalDays/periodDays);
  const perPeriod=N2(cert.total_interest)/Math.max(1,totalPeriods);
  const elapsedDays=(new Date()-new Date(cert.issued_date))/86400000;
  const completedPeriods=Math.floor(Math.max(0,elapsedDays)/periodDays);
  document.getElementById('ecp-info').innerHTML=`
    <div style="font-weight:800;font-size:14px;margin-bottom:10px">${escapeHtml(cert.name)}
      <span class="badge badge-blue" style="font-size:10px;margin-right:6px">${payout}</span>
    </div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:10px">
      <div style="padding:10px;background:var(--blue-l);border-radius:8px;text-align:center">
        <div style="font-size:10px;color:var(--muted);margin-bottom:4px">فترات مكتملة</div>
        <div style="font-weight:900;font-size:18px;color:var(--blue)">${completedPeriods}</div>
        <div style="font-size:9.5px;color:var(--muted)">من ${totalPeriods} فترة</div>
      </div>
      <div style="padding:10px;background:var(--green-l);border-radius:8px;text-align:center">
        <div style="font-size:10px;color:var(--muted);margin-bottom:4px">مستحق للصرف الآن</div>
        <div style="font-weight:900;font-size:18px;color:var(--green)">${fmt(canCollect)}</div>
        <div style="font-size:9.5px;color:var(--muted)">${completedPeriods} × ${fmtN(perPeriod,2)}</div>
      </div>
      <div style="padding:10px;background:var(--gold-l);border-radius:8px;text-align:center">
        <div style="font-size:10px;color:var(--muted);margin-bottom:4px">الدفعة القادمة</div>
        <div style="font-weight:900;font-size:14px;color:var(--gold)">${nextDate?nextDate.toLocaleDateString('ar-EG',{day:'numeric',month:'short'}):'عند الاستحقاق'}</div>
        <div style="font-size:9.5px;color:var(--muted)">${fmt(perPeriod)}</div>
      </div>
    </div>
    <div style="font-size:11px;color:var(--muted);padding:8px;background:var(--surface2);border-radius:6px">
      مُصرَّف سابقاً: <strong>${fmt(alreadyPaid)}</strong> | 
      إجمالي الفوائد: <strong>${fmt(N2(cert.total_interest))}</strong> | 
      متبقي: <strong style="color:var(--gold)">${fmt(Math.max(0,N2(cert.total_interest)-alreadyPaid))}</strong>
    </div>
  `;
  document.getElementById('ecp-amount').value=canCollect>0?canCollect.toFixed(2):'';
  populateSelect('ecp-bank');
  if(cert.bank_id)document.getElementById('ecp-bank').value=cert.bank_id;
  document.getElementById('ecp-date').value=today();
  const singleRadio=document.querySelector('input[name="ecp-mode"][value="single"]');if(singleRadio)singleRadio.checked=true;
  setCertPayoutMode('single');
  openModal('modal-cert-payout');
}
async function doCertPayout(){
  const certId=+document.getElementById('ecp-cert-id').value;
  const bankId=+document.getElementById('ecp-bank').value;
  const mode=document.querySelector('input[name="ecp-mode"]:checked')?.value||'single';
  const cert=DB.certs.find(c=>c.id===certId);if(!cert)return alert('الشهادة غير موجودة');
  if(!bankId)return alert('اختر حساباً بنكياً');
  const bank=DB.banks.find(b=>b.id===bankId);if(!bank)return alert('الحساب غير موجود');
  if(mode==='schedule'){
    const sched=getCertPayoutSchedule(cert);
    if(!sched.unpaidPeriods.length)return alert('لا توجد دفعات مستحقة');
    try{
      let runningBal=N2(bank.balance);
      let runningPaid=N2(cert.interest_paid);
      for(const p of sched.unpaidPeriods){
        runningBal=+(runningBal+p.amount).toFixed(4);
        runningPaid=+(runningPaid+p.amount).toFixed(4);
        await sbPost('bank_transactions',[{bank_id:bankId,type:'عائد شهادة',amount:p.amount,balance_after:runningBal,date:p.date,notes:'عائد شهادة: '+cert.name+' | '+cert.payout_type+' | دفعة رقم '+p.period,category:'عائد شهادة'}]);
      }
      await sbPatch('banks',bankId,{balance:runningBal});
      await sbPatch('certificates',certId,{interest_paid:runningPaid});
      await recomputeBankBalance(bankId);
      closeModal('modal-cert-payout');toast(`تم تسجيل ${sched.unpaidPeriods.length} دفعة`);await loadAll();
    }catch(e){console.error('doCertPayout(schedule):',e);toast('خطأ: '+e.message,false)}
    return;
  }
  const amount=N2(document.getElementById('ecp-amount').value);
  const dt=document.getElementById('ecp-date').value||today();
  if(!amount||amount<=0)return alert('أدخل مبلغ العائد');
  const remaining=Math.max(0,N2(cert.total_interest)-N2(cert.interest_paid));
  if(amount>remaining+0.01)return alert(`المبلغ (${fmt(amount)}) أكبر من المتاح (${fmt(remaining)})`);
  try{
    const newBal=+(N2(bank.balance)+amount).toFixed(4);
    await sbPost('bank_transactions',[{bank_id:bankId,type:'عائد شهادة',amount,balance_after:newBal,date:dt,notes:'عائد شهادة: '+cert.name+' | '+cert.payout_type,category:'عائد شهادة'}]);
    await sbPatch('banks',bankId,{balance:newBal});
    await sbPatch('certificates',certId,{interest_paid:+(N2(cert.interest_paid)+amount).toFixed(4)});
    closeModal('modal-cert-payout');toast('تم صرف العائد');await loadAll();
  }catch(e){console.error('doCertPayout:',e);toast('خطأ: '+e.message,false)}
}
function openBulkCertPayout(){
  if(!DB.certs.length)return alert('لا توجد شهادات');
  document.getElementById('bcp-date').value=today();
  const singleRadio=document.querySelector('input[name="bcp-mode"][value="single"]');if(singleRadio)singleRadio.checked=true;
  setBulkCertMode('single');
  openModal('modal-bulk-cert-payout');
}
function setBulkCertMode(mode){
  const singleWrap=document.getElementById('bcp-mode-single-wrap'),scheduleWrap=document.getElementById('bcp-mode-schedule-wrap');
  document.getElementById('bcp-date-wrap').classList.toggle('hidden',mode==='schedule');
  if(singleWrap)singleWrap.style.borderColor=mode==='single'?'var(--green)':'var(--border2)';
  if(scheduleWrap)scheduleWrap.style.borderColor=mode==='schedule'?'var(--green)':'var(--border2)';
  renderBulkCertList(mode);
}
function renderBulkCertList(mode){
  mode=mode||document.querySelector('input[name="bcp-mode"]:checked')?.value||'single';
  const listEl=document.getElementById('bcp-list');
  if(mode==='single'){
    const items=DB.certs.map(c=>{
      const remaining=Math.max(0,N2(c.total_interest)-N2(c.interest_paid));
      const accrued=calcAccruedInterest(c);
      const available=Math.max(0,Math.min(remaining,accrued));
      return{c,available};
    }).filter(x=>x.available>0.01);
    listEl.innerHTML=items.length?items.map(({c,available})=>`
      <div style="display:flex;align-items:center;gap:10px;padding:9px 10px;border-bottom:.5px solid var(--border)">
        <input type="checkbox" class="bcp-check" data-cert="${c.id}" checked style="width:17px;height:17px;flex-shrink:0">
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;font-size:12.5px">${escapeHtml(c.name)}</div>
          <div style="font-size:10.5px;color:var(--muted)">${escapeHtml(c.bank_name||'—')} · مستحق حتى اليوم: ${fmt(available)}</div>
        </div>
        <input type="number" step="0.01" class="form-control bcp-amount" data-cert="${c.id}" value="${available.toFixed(2)}" style="width:110px;padding:6px 8px;font-size:12px">
      </div>`).join(''):`<div style="text-align:center;color:var(--muted);font-size:12px;padding:20px">لا توجد عوائد مستحقة</div>`;
  }else{
    const items=DB.certs.map(c=>({c,sched:getCertPayoutSchedule(c)})).filter(x=>x.sched.unpaidPeriods.length>0);
    listEl.innerHTML=items.length?items.map(({c,sched})=>`
      <div style="display:flex;align-items:center;gap:10px;padding:9px 10px;border-bottom:.5px solid var(--border)">
        <input type="checkbox" class="bcp-check" data-cert="${c.id}" checked style="width:17px;height:17px;flex-shrink:0">
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;font-size:12.5px">${escapeHtml(c.name)}</div>
          <div style="font-size:10.5px;color:var(--muted)">${escapeHtml(c.bank_name||'—')} · ${sched.unpaidPeriods.length} دفعة مستحقة</div>
        </div>
        <div style="font-weight:800;color:var(--green);font-size:12.5px">${fmt(sched.unpaidPeriods.reduce((a,p)=>a+p.amount,0))}</div>
      </div>`).join(''):`<div style="text-align:center;color:var(--muted);font-size:12px;padding:20px">لا توجد دفعات مستحقة</div>`;
  }
}
async function doBulkCertPayout(){
  const mode=document.querySelector('input[name="bcp-mode"]:checked')?.value||'single';
  const checked=[...document.querySelectorAll('.bcp-check:checked')].map(el=>+el.dataset.cert);
  if(!checked.length)return alert('اختر شهادة واحدة على الأقل');
  const banksToRecompute=new Set();
  let doneCerts=0,donePayments=0,skipped=[];
  try{
    if(mode==='single'){
      const dt=document.getElementById('bcp-date').value||today();
      for(const certId of checked){
        const cert=DB.certs.find(c=>c.id===certId);if(!cert)continue;
        const amountEl=document.querySelector(`.bcp-amount[data-cert="${certId}"]`);
        const amount=N2(amountEl?.value);
        if(!amount||amount<=0){skipped.push(cert.name);continue;}
        if(!cert.bank_id){skipped.push(cert.name+' (بدون حساب)');continue;}
        const bank=DB.banks.find(b=>b.id===cert.bank_id);if(!bank){skipped.push(cert.name);continue;}
        const newBal=+(N2(bank.balance)+amount).toFixed(4);
        await sbPost('bank_transactions',[{bank_id:cert.bank_id,type:'عائد شهادة',amount,balance_after:newBal,date:dt,notes:'عائد شهادة: '+cert.name+' | '+cert.payout_type+' | صرف إجمالي',category:'عائد شهادة'}]);
        await sbPatch('banks',cert.bank_id,{balance:newBal});
        await sbPatch('certificates',certId,{interest_paid:+(N2(cert.interest_paid)+amount).toFixed(4)});
        banksToRecompute.add(cert.bank_id);
        doneCerts++;donePayments++;
      }
    }else{
      for(const certId of checked){
        const cert=DB.certs.find(c=>c.id===certId);if(!cert)continue;
        const sched=getCertPayoutSchedule(cert);
        if(!sched.unpaidPeriods.length)continue;
        if(!cert.bank_id){skipped.push(cert.name);continue;}
        const bank=DB.banks.find(b=>b.id===cert.bank_id);if(!bank){skipped.push(cert.name);continue;}
        let runningBal=N2(bank.balance),runningPaid=N2(cert.interest_paid);
        for(const p of sched.unpaidPeriods){
          runningBal=+(runningBal+p.amount).toFixed(4);
          runningPaid=+(runningPaid+p.amount).toFixed(4);
          await sbPost('bank_transactions',[{bank_id:cert.bank_id,type:'عائد شهادة',amount:p.amount,balance_after:runningBal,date:p.date,notes:'عائد شهادة: '+cert.name+' | '+cert.payout_type+' | دفعة رقم '+p.period,category:'عائد شهادة'}]);
          donePayments++;
        }
        await sbPatch('banks',cert.bank_id,{balance:runningBal});
        await sbPatch('certificates',certId,{interest_paid:runningPaid});
        banksToRecompute.add(cert.bank_id);
        doneCerts++;
      }
    }
    for(const bid of banksToRecompute)await recomputeBankBalance(bid);
    closeModal('modal-bulk-cert-payout');
    toast(`تم صرف العائد لـ ${doneCerts} شهادة (${donePayments} حركة)${skipped.length?' — تخطّي: '+skipped.join(', '):''}`);
    await loadAll();
  }catch(e){console.error('doBulkCertPayout:',e);toast('خطأ: '+e.message,false)}
}
function editCert(id){
  const c=DB.certs.find(x=>x.id===id);if(!c)return;
  document.getElementById('ecert-id').value=c.id;
  document.getElementById('ecert-name').value=c.name;
  document.getElementById('ecert-bank-name').value=c.bank_name||'';
  document.getElementById('ecert-amount').value=c.amount;
  document.getElementById('ecert-rate').value=c.rate;
  document.getElementById('ecert-dur').value=c.duration;
  document.getElementById('ecert-payout').value=c.payout_type||'سنوي';
  document.getElementById('ecert-date').value=c.issued_date;
  document.getElementById('modal-cert-title').textContent='تعديل الشهادة';
  populateSelect('ecert-bank');
  document.getElementById('cert-preview').innerHTML='';
  setTimeout(()=>{document.getElementById('ecert-bank').value=c.bank_id||'';updateCertPreview();},50);
  openModal('modal-cert-add');
}
async function deleteCert(id){
  const cert=DB.certs.find(c=>c.id===id);
  if(!cert||!confirm('حذف هذه الشهادة؟'))return;
  try{
    if(cert.bank_transaction_id){try{await sbDel('bank_transactions',cert.bank_transaction_id)}catch(e){}}
    await sbDel('certificates',id);
    if(cert.bank_id)await recomputeBankBalance(cert.bank_id);
    toast('تم الحذف');await loadAll();
  }catch(e){toast('خطأ: '+e.message,false)}
}

// ═══ DIVIDEND ACTIONS ═══
async function saveDividend(){
  const id=document.getElementById('ediv-id').value;
  const sym=document.getElementById('ediv-sym').value.toUpperCase().trim();
  const mode=document.querySelector('input[name="ediv-mode"]:checked')?.value||'cash';
  const dt=document.getElementById('ediv-date').value||today();
  const notes=document.getElementById('ediv-notes')?.value||'';
  if(!sym)return alert('أدخل كود السهم');
  if(mode==='stock'&&!id){
    const sharesQty=N2(document.getElementById('ediv-shares').value);
    if(!sharesQty||sharesQty<=0)return alert('أدخل عدد الأسهم المستلمة');
    const h=getHoldings();
    const existing=h[sym];
    try{
      await sbPostResilient('stock_transactions',[{symbol:sym,name:existing?.name||sym,sec_type:existing?.type||'سهم',market:existing?.market||'EGX',price_currency:existing?.currency||'EGP',type:'شراء',quantity:sharesQty,price:0,total:0,commission:0,net:0,date:dt,bank_id:null,notes:'أسهم منحة (توزيع أرباح عيني)'+(notes?' | '+notes:'')}],['market','price_currency']);
      closeModal('modal-dividend');document.getElementById('ediv-id').value='';toast(`تم إضافة ${fmtN(sharesQty,4)} سهم منحة`);await loadAll();
    }catch(e){console.error('saveDividend(stock):',e);toast('خطأ: '+e.message,false)}
    return;
  }
  const amt=N2(document.getElementById('ediv-amount').value);
  const bankId=+document.getElementById('ediv-bank').value||null;
  if(!amt)return alert('أكمل البيانات: المبلغ');
  try{
    if(id){
      const orig=DB.dividends.find(d=>d.id===+id);
      const banksToRecompute=new Set();
      if(orig?.bank_transaction_id){
        const bt=DB.bankTxns.find(t=>t.id===orig.bank_transaction_id);
        if(bankId){
          await sbPatch('bank_transactions',orig.bank_transaction_id,{bank_id:bankId,type:'إيداع',amount:amt,date:dt,notes:'أرباح موزعة: '+sym+(notes?' | '+notes:''),category:'أرباح أسهم'});
          if(bt?.bank_id)banksToRecompute.add(bt.bank_id);
          banksToRecompute.add(bankId);
        }else{
          await sbDel('bank_transactions',orig.bank_transaction_id);
          if(bt?.bank_id)banksToRecompute.add(bt.bank_id);
        }
        await sbPatch('dividends',id,{symbol:sym,amount:amt,date:dt,notes,bank_id:bankId||null});
      }else if(bankId){
        const bank=DB.banks.find(b=>b.id===bankId);
        const nb=bank?+(N2(bank.balance)+amt).toFixed(4):0;
        const bt=await sbPost('bank_transactions',[{bank_id:bankId,type:'إيداع',amount:amt,balance_after:nb,date:dt,notes:'أرباح موزعة: '+sym+(notes?' | '+notes:''),category:'أرباح أسهم'}]);
        await sbPatch('dividends',id,{symbol:sym,amount:amt,date:dt,notes,bank_id:bankId,bank_transaction_id:bt?.[0]?.id||null});
        banksToRecompute.add(bankId);
      }else{
        await sbPatch('dividends',id,{symbol:sym,amount:amt,date:dt,notes,bank_id:null});
      }
      for(const bid of banksToRecompute)await recomputeBankBalance(bid);
      toast('تم التعديل');
    }else{
      let btId=null;
      if(bankId){
        const bank=DB.banks.find(b=>b.id===bankId);
        if(bank){
          const nb=+(N2(bank.balance)+amt).toFixed(4);
          const bt=await sbPost('bank_transactions',[{bank_id:bankId,type:'إيداع',amount:amt,balance_after:nb,date:dt,notes:'أرباح موزعة: '+sym+(notes?' | '+notes:''),category:'أرباح أسهم'}]);
          btId=bt?.[0]?.id||null;
          await sbPatch('banks',bankId,{balance:nb});
        }
      }
      await sbPost('dividends',[{symbol:sym,amount:amt,date:dt,bank_id:bankId||null,notes,bank_transaction_id:btId}]);
      toast('تم الحفظ');
    }
    closeModal('modal-dividend');document.getElementById('ediv-id').value='';await loadAll();
  }catch(e){console.error('saveDividend:',e);toast('خطأ: '+e.message,false)}
}
function setDividendMode(mode){
  const cashWrap=document.getElementById('ediv-mode-cash-wrap'),stockWrap=document.getElementById('ediv-mode-stock-wrap');
  document.getElementById('ediv-amount-wrap').classList.toggle('hidden',mode==='stock');
  document.getElementById('ediv-shares-wrap').classList.toggle('hidden',mode!=='stock');
  document.getElementById('ediv-bank-wrap').classList.toggle('hidden',mode==='stock');
  if(cashWrap){cashWrap.style.borderColor=mode==='cash'?'var(--green)':'var(--border2)';cashWrap.style.background=mode==='cash'?'var(--green-l)':'transparent';}
  if(stockWrap){stockWrap.style.borderColor=mode==='stock'?'var(--green)':'var(--border2)';stockWrap.style.background=mode==='stock'?'var(--green-l)':'transparent';}
}
function editDividend(id){
  const d=DB.dividends.find(x=>x.id===id);if(!d)return;
  document.getElementById('ediv-id').value=d.id;
  document.getElementById('ediv-sym').value=d.symbol;
  document.getElementById('ediv-amount').value=d.amount;
  document.getElementById('ediv-date').value=d.date;
  document.getElementById('ediv-notes').value=d.notes||'';
  populateSelect('ediv-bank','<option value="">— لا يوجد —</option>');
  setTimeout(()=>{document.getElementById('ediv-bank').value=d.bank_id||''},50);
  openModal('modal-dividend');
}
async function deleteDividend(id){
  if(!confirm('حذف هذا التوزيع؟'))return;
  try{
    const div=DB.dividends.find(d=>d.id===id);
    let bankId=null;
    if(div?.bank_transaction_id){
      const bt=DB.bankTxns.find(t=>t.id===div.bank_transaction_id);
      if(bt){bankId=bt.bank_id;await sbDel('bank_transactions',bt.id);}
    }
    await sbDel('dividends',id);
    if(bankId)await recomputeBankBalance(bankId);
    toast('تم الحذف');await loadAll();
  }catch(e){toast('خطأ: '+e.message,false)}
}

// ═══ RECURRING ═══
async function saveRecurring(){
  const id=document.getElementById('erec-id').value;
  const name=document.getElementById('erec-name').value.trim();
  const type=document.getElementById('erec-type').value;
  const freq=document.getElementById('erec-freq').value;
  const amount=N2(document.getElementById('erec-amount').value);
  const bankId=+document.getElementById('erec-bank').value||null;
  const start=document.getElementById('erec-start').value||today();
  if(!name||!amount)return alert('أكمل البيانات');
  try{
    if(id){await sbPatch('recurring_transactions',id,{name,type,freq,amount,bank_id:bankId||null,start_date:start});}
    else{await sbPost('recurring_transactions',[{name,type,freq,amount,bank_id:bankId||null,start_date:start}]);}
    closeModal('modal-recurring-add');document.getElementById('erec-id').value='';toast('تم الحفظ');await loadAll();
  }catch(e){console.error('saveRecurring:',e);toast('خطأ: '+e.message,false)}
}
function editRecurring(id){
  const r=DB.recurring.find(x=>x.id===id);if(!r)return;
  document.getElementById('erec-id').value=r.id;
  document.getElementById('erec-name').value=r.name;
  document.getElementById('erec-type').value=r.type;
  document.getElementById('erec-freq').value=r.freq;
  document.getElementById('erec-amount').value=r.amount;
  document.getElementById('erec-start').value=r.start_date;
  populateSelect('erec-bank','<option value="">— اختياري —</option>');
  setTimeout(()=>{document.getElementById('erec-bank').value=r.bank_id||''},50);
  document.getElementById('modal-rec-title').textContent='تعديل العملية المتكررة';
  openModal('modal-recurring-add');
}
async function applyRecurringCore(r,next){
  const bank=DB.banks.find(b=>b.id===r.bank_id);if(!bank)throw new Error('الحساب غير موجود لعملية: '+r.name);
  if(r.type==='سحب'&&N2(bank.balance)<N2(r.amount))throw new Error('الرصيد غير كافٍ لعملية: '+r.name);
  const isIn=r.type==='إيداع';
  const newBal=+(N2(bank.balance)+(isIn?N2(r.amount):-N2(r.amount))).toFixed(4);
  await sbPost('bank_transactions',[{bank_id:r.bank_id,type:r.type,amount:r.amount,balance_after:newBal,date:next,notes:r.name+' (متكرر)',category:'متكرر'}]);
  await sbPatch('banks',r.bank_id,{balance:newBal});
  await sbPatch('recurring_transactions',r.id,{last_applied:next});
}
async function applyRecurring(id){
  const r=DB.recurring.find(x=>x.id===id);if(!r)return;
  const next=nextRecDate(r);
  if(next>today())return alert('موعد التطبيق القادم: '+next);
  if(!r.bank_id)return alert('لا يوجد حساب مرتبط');
  if(!confirm(`تطبيق "${r.name}" بمبلغ ${fmt(r.amount)} بتاريخ ${next}؟`))return;
  try{await applyRecurringCore(r,next);toast('تم التطبيق');await loadAll();}
  catch(e){console.error('applyRecurring:',e);toast('خطأ: '+e.message,false)}
}
async function applyAllRecurring(){
  const due=DB.recurring.filter(r=>{const n=nextRecDate(r);return n<=today()&&r.bank_id});
  if(!due.length)return alert('لا توجد عمليات مستحقة اليوم');
  if(!confirm(`تطبيق ${due.length} عملية متكررة دفعة واحدة؟`))return;
  let done=0,failed=[];
  for(const r of due){try{await applyRecurringCore(r,nextRecDate(r));done++;}catch(e){failed.push(r.name+': '+e.message);}}
  toast(failed.length?`تم تطبيق ${done} من ${due.length}`:`تم تطبيق ${done} عملية بنجاح`);
  await loadAll();
}
async function deleteRecurring(id){if(!confirm('حذف هذه العملية المتكررة؟'))return;try{await sbDel('recurring_transactions',id);toast('تم الحذف');await loadAll()}catch(e){toast('خطأ: '+e.message,false)}}

// ═══ DEBT ACTIONS ═══
async function saveDebt(){
  const id=document.getElementById('edebt-id').value;
  const name=document.getElementById('edebt-name').value.trim();
  const party=document.getElementById('edebt-party').value.trim();
  const type=document.getElementById('edebt-type').value;
  const rate=N2(document.getElementById('edebt-rate').value);
  const amount=N2(document.getElementById('edebt-amount').value);
  const remaining=N2(document.getElementById('edebt-remaining').value)||amount;
  const start=document.getElementById('edebt-start').value||today();
  const due=document.getElementById('edebt-due').value;
  const bankId=+document.getElementById('edebt-bank').value||null;
  const notes=document.getElementById('edebt-notes').value.trim();
  if(!name||!amount)return alert('أكمل البيانات');
  try{
    if(id){await sbPatch('debts',id,{name,party,type,rate,amount,remaining,start_date:start,due_date:due||null,bank_id:bankId||null,notes});}
    else{await sbPost('debts',[{name,party,type,rate,amount,remaining,start_date:start,due_date:due||null,bank_id:bankId||null,notes}]);}
    closeModal('modal-debt-add');document.getElementById('edebt-id').value='';toast('تم الحفظ');await loadAll();
  }catch(e){console.error('saveDebt:',e);toast('خطأ: '+e.message,false)}
}
function editDebt(id){
  const d=DB.debts.find(x=>x.id===id);if(!d)return;
  document.getElementById('edebt-id').value=d.id;
  document.getElementById('edebt-name').value=d.name;
  document.getElementById('edebt-party').value=d.party||'';
  document.getElementById('edebt-type').value=d.type;
  document.getElementById('edebt-rate').value=d.rate||0;
  document.getElementById('edebt-amount').value=d.amount;
  document.getElementById('edebt-remaining').value=d.remaining;
  document.getElementById('edebt-start').value=d.start_date||today();
  document.getElementById('edebt-due').value=d.due_date||'';
  document.getElementById('edebt-notes').value=d.notes||'';
  populateSelect('edebt-bank','<option value="">— لا يوجد —</option>');
  document.getElementById('modal-debt-title').textContent='تعديل الدين / الالتزام';
  setTimeout(()=>{document.getElementById('edebt-bank').value=d.bank_id||''},50);
  openModal('modal-debt-add');
}
async function saveDebtPayment(){
  const debtId=+document.getElementById('edp-debt').value;
  const amount=N2(document.getElementById('edp-amount').value);
  const dt=document.getElementById('edp-date').value||today();
  const bankId=+document.getElementById('edp-bank').value||null;
  const notes=document.getElementById('edp-notes').value.trim();
  if(!debtId||!amount)return alert('أكمل البيانات');
  const debt=DB.debts.find(d=>d.id===debtId);if(!debt)return alert('الدين غير موجود');
  if(amount>N2(debt.remaining)+0.01)return alert(`المبلغ (${fmt(amount)}) أكبر من المتبقي (${fmt(debt.remaining)})`);
  try{
    const newRemaining=Math.max(0,+(N2(debt.remaining)-amount).toFixed(4));
    let btId=null;
    if(bankId){
      const bank=DB.banks.find(b=>b.id===bankId);if(!bank)return alert('الحساب غير موجود');
      if(debt.type==='دين علي'){
        if(N2(bank.balance)<amount)return alert('الرصيد غير كافٍ');
        const nb=+(N2(bank.balance)-amount).toFixed(4);
        const bt=await sbPost('bank_transactions',[{bank_id:bankId,type:'سحب',amount,balance_after:nb,date:dt,notes:'سداد دين: '+debt.name+(notes?' | '+notes:''),category:'سداد دين'}]);
        btId=bt?.[0]?.id||null;
        await sbPatch('banks',bankId,{balance:nb});
      }else{
        const nb=+(N2(bank.balance)+amount).toFixed(4);
        const bt=await sbPost('bank_transactions',[{bank_id:bankId,type:'إيداع',amount,balance_after:nb,date:dt,notes:'استرداد دين: '+debt.name+(notes?' | '+notes:''),category:'استرداد دين'}]);
        btId=bt?.[0]?.id||null;
        await sbPatch('banks',bankId,{balance:nb});
      }
    }
    await sbPost('debt_payments',[{debt_id:debtId,bank_id:bankId||null,amount,date:dt,notes,bank_transaction_id:btId}]);
    await sbPatch('debts',debtId,{remaining:newRemaining});
    if(bankId)await recomputeBankBalance(bankId);
    closeModal('modal-debt-pay');toast('تم تسجيل الدفعة');await loadAll();
  }catch(e){console.error('saveDebtPayment:',e);toast('خطأ: '+e.message,false)}
}
async function deleteDebtPayment(id){
  const p=DB.debtPayments.find(x=>x.id===id);
  if(!p||!confirm('حذف هذه الدفعة؟'))return;
  try{
    const debt=DB.debts.find(d=>d.id===p.debt_id);
    let bankId=null;
    if(p.bank_transaction_id){
      const bt=DB.bankTxns.find(t=>t.id===p.bank_transaction_id);
      if(bt){bankId=bt.bank_id;await sbDel('bank_transactions',bt.id);}
    }
    await sbDel('debt_payments',id);
    if(debt){
      const restored=debt.type==='دين علي'?N2(debt.remaining)+N2(p.amount):N2(debt.remaining)-N2(p.amount);
      await sbPatch('debts',debt.id,{remaining:Math.max(0,+restored.toFixed(4))});
    }
    if(bankId)await recomputeBankBalance(bankId);
    toast('تم الحذف');await loadAll();
  }catch(e){console.error('deleteDebtPayment:',e);toast('خطأ: '+e.message,false)}
}
async function deleteDebt(id){if(!confirm('حذف هذا الدين؟'))return;try{await sbDel('debts',id);toast('تم الحذف');await loadAll()}catch(e){toast('خطأ: '+e.message,false)}}

// ═══ GOALS ═══
async function saveGoal(){
  const name=document.getElementById('egoal-name').value.trim(),target=N2(document.getElementById('egoal-target').value),cat=document.getElementById('egoal-cat').value;
  if(!name||!target)return alert('أكمل البيانات');
  try{await sbPost('financial_goals',[{name,target,category:cat}]);closeModal('modal-goal-add');toast('تم الحفظ ✓');await loadAll()}catch(e){toast('خطأ: '+e.message,false)}
}
async function deleteGoal(id){if(!confirm('حذف هذا الهدف؟'))return;try{await sbDel('financial_goals',id);toast('تم الحذف');await loadAll()}catch(e){toast('خطأ: '+e.message,false)}}
function editGoal(id){
  const g=DB.goals.find(x=>x.id===id);if(!g)return;
  editCtx={table:'financial_goals',id};
  document.getElementById('edit-modal-title').innerHTML='تعديل الهدف المالي';
  document.getElementById('edit-modal-body').innerHTML=`
    <div class="form-group"><label class="form-label">اسم الهدف *</label><input class="form-control" id="edt-goal-name" value="${escapeHtml(g.name)}"></div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">المبلغ المستهدف *</label><input class="form-control" type="number" id="edt-goal-target" value="${g.target}"></div>
      <div class="form-group"><label class="form-label">الفئة</label><select class="form-control" id="edt-goal-cat"><option value="all" ${g.category==='all'?'selected':''}>كل المحفظة</option><option value="banks" ${g.category==='banks'?'selected':''}>البنوك</option><option value="stocks" ${g.category==='stocks'?'selected':''}>الأسهم</option><option value="metals" ${g.category==='metals'?'selected':''}>المعادن</option><option value="certs" ${g.category==='certs'?'selected':''}>الشهادات</option></select></div>
    </div>
  `;
  openModal('modal-edit');
}

// ═══ GENERIC EDIT ═══
async function saveEdit(){
  const{table,id}=editCtx;if(!table||!id)return;
  if(table==='financial_goals'){
    const name=document.getElementById('edt-goal-name').value.trim();
    const target=N2(document.getElementById('edt-goal-target').value);
    const cat=document.getElementById('edt-goal-cat').value;
    if(!name||!target)return alert('أكمل البيانات');
    try{await sbPatch('financial_goals',id,{name,target,category:cat});closeModal('modal-edit');editCtx={table:null,id:null};toast('تم تعديل الهدف ✓');await loadAll()}catch(e){toast('خطأ: '+e.message,false)}
    return;
  }
  try{
    let body={};
    const banksToRecompute=new Set();
    if(table==='bank_transactions'){
      const dt=document.getElementById('edt-date').value;
      const type=document.getElementById('edt-type').value;
      const amount=N2(document.getElementById('edt-amount').value);
      const notes=document.getElementById('edt-notes').value;
      const cat=document.getElementById('edt-cat')?.value||'';
      const old=DB.bankTxns.find(t=>t.id===+id);
      if(!amount||amount<=0){toast('أدخل مبلغ صحيح',false);return;}
      if(old?.bank_id)banksToRecompute.add(old.bank_id);
      body={date:dt,type,amount,notes,category:cat};
    }else if(table==='stock_transactions'){
      const qty=N2(document.getElementById('edt-qty').value);
      const price=N2(document.getElementById('edt-price').value);
      const commission=N2(document.getElementById('edt-commission').value);
      const total=qty*price;
      const net=total-commission;
      const orig=DB.stockTxns.find(t=>t.id===+id);
      const h=getHoldings();
      const sym=orig?.symbol;
      const dt=document.getElementById('edt-date').value;
      const avgCost=h[sym]?.avgPrice||orig?.price||0;
      const profit=net-avgCost*qty;
      body={date:dt,quantity:qty,price,total,commission,net,profit,notes:document.getElementById('edt-notes')?.value||''};
      if(orig?.bank_transaction_id){
        await sbPatch('bank_transactions',orig.bank_transaction_id,{amount:net,date:dt,notes:(orig.type==='بيع'?'بيع ':'شراء ')+sym});
        if(orig.bank_id)banksToRecompute.add(orig.bank_id);
      }
    }else if(table==='metal_transactions'){
      const w=N2(document.getElementById('edt-weight').value);
      const p=N2(document.getElementById('edt-price').value);
      const op=document.getElementById('edt-op').value;
      const extra=N2(document.getElementById('edt-extra')?.value||0);
      const manufPerGram=op==='شراء'?N2(document.getElementById('edt-manuf').value):0;
      const manufacturing=manufPerGram*w;
      const commissionFixed=op==='شراء'?extra:0;
      const cashback=op==='بيع'?extra:0;
      const total=w*p;
      const net=op==='شراء'?total+manufacturing+commissionFixed:total+cashback;
      const bankSel=document.getElementById('edt-bank-id');
      const orig=DB.metalTxns.find(t=>t.id===+id);
      const bankId=bankSel&&bankSel.value?+bankSel.value:(orig?.bank_id||null);
      const dt=document.getElementById('edt-date').value;
      const metal_type=document.getElementById('edt-metal').value;
      body={date:dt,op,metal_type,weight:w,price_per_gram:p,total,manufacturing,commission_fixed:commissionFixed,cashback,net,bank_id:bankId,notes:document.getElementById('edt-notes')?.value||''};
      if(orig?.bank_transaction_id){
        const linkedBt=DB.bankTxns.find(t=>t.id===orig.bank_transaction_id);
        const newBtType=op==='شراء'?'سحب':'إيداع';
        await sbPatch('bank_transactions',orig.bank_transaction_id,{bank_id:bankId||linkedBt?.bank_id,type:newBtType,amount:net,date:dt,notes:(op==='شراء'?'شراء ':'بيع ')+metal_type});
        if(linkedBt?.bank_id)banksToRecompute.add(linkedBt.bank_id);
        if(bankId)banksToRecompute.add(bankId);
      }else if(bankId){banksToRecompute.add(bankId);}
    }
    await sbPatch(table,id,body);
    for(const bid of banksToRecompute)await recomputeBankBalance(bid);
    closeModal('modal-edit');editCtx={table:null,id:null};toast('تم حفظ التعديلات ✓');await loadAll();
  }catch(e){toast('خطأ: '+e.message,false)}
}

// ═══ PRICES ═══
async function saveStockPrices(){
  const h=getHoldings();const syms=[...new Set([...DB.stockPrices.map(p=>p.symbol),...Object.keys(h)])];
  try{
    for(const sym of syms){
      const el=document.getElementById('sp-'+sym);if(!el)continue;const p=N2(el.value);if(!p)continue;
      const info=DB.stockPrices.find(x=>x.symbol===sym)||{name:h[sym]?.name||sym,sec_type:h[sym]?.type||'سهم'};
      await sbUpsert('stock_prices',{symbol:sym,name:info.name,sec_type:info.sec_type,current_price:p,updated_at:new Date().toISOString()});
    }
    toast('تم حفظ أسعار الأسهم ✓');await loadAll();
  }catch(e){toast('خطأ: '+e.message,false)}
}
async function cleanOrphanStockPrices(){
  const h=getHoldings();const validSyms=new Set(Object.keys(h));
  const orphans=DB.stockPrices.filter(p=>!validSyms.has(p.symbol)&&!DB.stockTxns.find(t=>t.symbol===p.symbol));
  for(const o of orphans)try{await api('stock_prices?symbol=eq.'+encodeURIComponent(o.symbol),'DELETE')}catch(e){}
  if(orphans.length){toast('تم حذف '+orphans.length+' رموز غير موجودة');await loadAll()}
}
async function saveMetalPrices(){
  try{
    for(const p of DB.metalPrices){const el=document.getElementById('mp-'+encodeID(p.metal_type));if(!el)continue;const pr=N2(el.value);if(!pr)continue;await sbUpsert('metal_prices',{metal_type:p.metal_type,price_per_gram:pr,updated_at:new Date().toISOString()})}
    toast('تم حفظ أسعار المعادن ✓');await loadAll();
  }catch(e){toast('خطأ: '+e.message,false)}
}
async function saveExchangeRate(cur){
  const el=document.getElementById('exr-'+cur);if(!el)return;const rate=N2(el.value);if(!rate)return alert('أدخل سعر صرف صحيح');
  try{await sbUpsert('exchange_rates',{currency:cur,rate,updated_at:new Date().toISOString()});toast('تم حفظ سعر '+cur+' ✓');await loadAll()}catch(e){toast('خطأ: '+e.message,false)}
}
async function autoFetchExchangeRates(manual=false){
  const currencies=[...new Set(DB.banks.map(b=>b.currency||'EGP').filter(c=>c!=='EGP'))];
  if(!currencies.length){if(manual)alert('لا توجد حسابات بعملات أجنبية');return;}
  const todayStr=today();
  if(!manual&&localStorage.getItem('lastFxFetchDate')===todayStr)return;
  const btn=document.getElementById('fx-fetch-btn');
  if(btn){btn.disabled=true;btn.innerHTML='جاري الجلب...';}
  let updated=0,failed=[];
  for(const cur of currencies){
    try{
      const res=await fetch(`https://open.er-api.com/v6/latest/${cur}`);
      if(!res.ok)throw new Error('network');
      const data=await res.json();
      const rate=data?.rates?.EGP;
      if(data?.result==='success'&&rate){
        await sbUpsert('exchange_rates',{currency:cur,rate:+N2(rate).toFixed(4),updated_at:new Date().toISOString()});
        updated++;
      }else failed.push(cur);
    }catch(e){failed.push(cur);}
  }
  localStorage.setItem('lastFxFetchDate',todayStr);
  if(btn){btn.disabled=false;}
  if(updated>0){toast(`تم تحديث ${updated} عملة تلقائيًا${failed.length?' (تعذّر: '+failed.join(', ')+')':''}`);await loadAll();}
  else if(manual){alert('تعذّر جلب الأسعار');}
}
function saveGoldApiKey(){
  const key=document.getElementById('st-goldapi-key').value.trim();
  APP_SETTINGS.goldapi_key=key;
  persistAppSettings();
  toast(key?'تم حفظ المفتاح':'تم مسح المفتاح');
}
function extractGramPrice(apiData,metalTypeLabel){
  const oz2gram=v=>v?v/31.1034768:null;
  const t=metalTypeLabel.replace(/\s+/g,'');
  const karatMap={
    'ذهب24':apiData.price_gram_24k,'ذهب24قيراط':apiData.price_gram_24k,
    'ذهب22قيراط':apiData.price_gram_22k,
    'ذهب21':apiData.price_gram_21k,'ذهب21قيراط':apiData.price_gram_21k,
    'ذهب18':apiData.price_gram_18k,'ذهب18قيراط':apiData.price_gram_18k,
    'جنيهذهب':apiData.price_gram_21k,
    'سبيكةذهب':apiData.price_gram_24k,
    'فضة':apiData.price_gram_24k||oz2gram(apiData.price)
  };
  return karatMap[t]||null;
}
async function autoFetchMetalPrices(manual=false){
  const apiKey=APP_SETTINGS.goldapi_key;
  if(!apiKey){if(manual)alert('أدخل مفتاح GoldAPI.io أولاً');return;}
  const todayStr=today();
  if(!manual&&localStorage.getItem('lastMetalFetchDate')===todayStr)return;
  const mh=getMetalHoldings();
  const heldTypes=[...new Set(Object.values(mh).filter(v=>v.weight>0.001).map(v=>(v.metal_type||'').split('|')[0].trim()))].filter(Boolean);
  if(!heldTypes.length){if(manual)alert('لا توجد معادن مملوكة');return;}
  const isSilver=t=>t.includes('فضة');
  const isGold=t=>!isSilver(t);
  const needGold=heldTypes.some(isGold),needSilver=heldTypes.some(isSilver);
  const cur=baseCur();
  const btn=document.getElementById('metal-fetch-btn');
  const statusEl=document.getElementById('st-metal-fetch-status');
  if(btn){btn.disabled=true;}
  if(statusEl)statusEl.textContent='جاري الجلب...';
  let goldData=null,silverData=null,errors=[];
  try{
    if(needGold){
      const r=await fetch(`https://www.goldapi.io/api/XAU/${cur}`,{headers:{'x-access-token':apiKey,'Content-Type':'application/json'}});
      if(r.ok)goldData=await r.json();else errors.push('XAU: HTTP '+r.status);
    }
    if(needSilver){
      const r=await fetch(`https://www.goldapi.io/api/XAG/${cur}`,{headers:{'x-access-token':apiKey,'Content-Type':'application/json'}});
      if(r.ok)silverData=await r.json();else errors.push('XAG: HTTP '+r.status);
    }
  }catch(e){errors.push('تعذّر الاتصال: '+e.message);}
  let updated=0,skipped=[];
  for(const t of heldTypes){
    const data=isSilver(t)?silverData:goldData;
    if(!data){skipped.push(t);continue;}
    const gramPrice=extractGramPrice(data,t);
    if(gramPrice){await sbUpsert('metal_prices',{metal_type:t,price_per_gram:+N2(gramPrice).toFixed(2),updated_at:new Date().toISOString()});updated++;}
    else skipped.push(t);
  }
  localStorage.setItem('lastMetalFetchDate',todayStr);
  if(btn){btn.disabled=false;}
  if(updated>0){
    toast(`تم تحديث ${updated} نوع معدن`);
    if(statusEl)statusEl.innerHTML=`<span style="color:var(--green)">✓ آخر تحديث: ${todayStr} — ${updated} نوع</span>`;
    await loadAll();
  }else{
    const msg=errors.length?errors.join(' | '):'لم يتم العثور على سعر مطابق';
    if(statusEl)statusEl.innerHTML=`<span style="color:var(--red)">✗ ${msg}</span>`;
    if(manual)alert('تعذّر التحديث: '+msg);
  }
}
const encodeID=s=>s.replace(/[^a-zA-Z0-9\u0600-\u06FF]/g,'_');

// ═══ RENDER: DASHBOARD ═══
function renderDashboard(){
  const T=calcTotals();
  const{grand,totalBanks,stocksVal,stocksCost,metalsVal,metalsCost,certsTotal,certsPaid,divTotal,pnlStocks,pnlMetals,totalPnl,debtsOwed}=T;
  const invested=stocksCost+metalsCost+certsTotal;
  const roi=invested>0?totalPnl/invested*100:0;
  const retS=stocksCost>0?pnlStocks/stocksCost*100:0,retM=metalsCost>0?pnlMetals/metalsCost*100:0;
  document.getElementById('dash-kpis').innerHTML=
    kpi('إجمالي المحفظة',fmt(grand),`${DB.banks.length} حسابات، ${Object.keys(T.h).length} أسهم`,'var(--blue)',svgIcon('<path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>'),roi)+
    kpi('الأرصدة البنكية',fmt(totalBanks),pct(totalBanks,grand)+' من المحفظة','var(--teal)',svgIcon('<path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>'))+
    kpi('الأسهم والصناديق',fmt(stocksVal),sign(pnlStocks)+fmt(pnlStocks)+(retS?` (${sign(retS)}${retS.toFixed(1)}%)`:''),retS>=0?'var(--green)':'var(--red)',svgIcon('<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>'),retS||null)+
    kpi('المعادن الثمينة',fmt(metalsVal),sign(pnlMetals)+fmt(pnlMetals)+(retM?` (${sign(retM)}${retM.toFixed(1)}%)`:''),retM>=0?'var(--gold)':'var(--red)',svgIcon('<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>'),retM||null)+
    kpi('الشهادات الادخارية',fmt(certsTotal),'مُصرف: '+fmt(certsPaid),'var(--purple)',svgIcon('<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>'))+
    kpi('العائد الإجمالي',fmt(totalPnl),roi.toFixed(2)+'% على رأس المال',totalPnl>=0?'var(--green)':'var(--red)',svgIcon('<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>'),roi||null)+
    (debtsOwed>0?kpi('التزامات/ديون',fmt(debtsOwed),'مجموع ما عليك من ديون','var(--red)',svgIcon('<path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78"/>')):'');
  // ═══ FIXED: dashboard alerts (was showing "..." before) ═══
  const{soon,expired}=getCertAlerts();
  let alertsHtml='';
  if(expired.length)alertsHtml+=`<div class="alert alert-danger">
    <div class="alert-icon"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg></div>
    <div class="alert-content">
      <div class="alert-title">شهادات منتهية — يجب اتخاذ إجراء فوري</div>
      <div class="alert-body">${expired.map(c=>escapeHtml(c.name)+(c.bank_name?' ('+escapeHtml(c.bank_name)+')':'')+' — انتهت منذ '+Math.abs(c.daysLeft)+' يوم').join(' | ')}</div>
    </div>
  </div>`;
  if(soon.length)alertsHtml+=`<div class="alert alert-warn">
    <div class="alert-icon"><svg viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg></div>
    <div class="alert-content">
      <div class="alert-title">شهادات تستحق خلال 30 يوم</div>
      <div class="alert-body">${soon.map(c=>escapeHtml(c.name)+': '+c.daysLeft+' يوم').join(' | ')}</div>
    </div>
  </div>`;
  const lowBal=DB.banks.filter(b=>N2(b.min_balance)>0&&N2(b.balance)<N2(b.min_balance));
  if(lowBal.length)alertsHtml+=`<div class="alert alert-warn">
    <div class="alert-icon"><svg viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg></div>
    <div class="alert-content">
      <div class="alert-title">حسابات تحت الحد الأدنى</div>
      <div class="alert-body">${lowBal.map(b=>escapeHtml(b.name)+': '+b.balance+' أقل من '+b.min_balance).join(' | ')}</div>
    </div>
  </div>`;
  document.getElementById('dash-alerts').innerHTML=alertsHtml;
  renderRecent();
  renderDashCharts(T);
  renderDashMovers(T);
  if(DB.goals.length){
    let gh='<div class="card"><div class="card-header"><div class="card-title">الأهداف المالية</div></div><div class="card-body">';
    DB.goals.forEach(g=>{
      let cur=grand;
      if(g.category==='banks')cur=totalBanks;else if(g.category==='stocks')cur=stocksVal;else if(g.category==='metals')cur=metalsVal;else if(g.category==='certs')cur=certsTotal;
      const p=Math.min(pctN(cur,g.target),100);
      gh+=`<div class="goal-card" style="margin-bottom:8px"><div class="goal-header"><div><div class="goal-name">${escapeHtml(g.name)}</div><div class="goal-meta">${g.category==='all'?'كل المحفظة':g.category}</div></div><div style="text-align:left"><div class="goal-pct">${p.toFixed(0)}%</div><div class="goal-stats">${fmt(cur)} / ${fmt(g.target)}</div></div></div><div class="prog-wrap"><div class="prog-bar" style="width:${p}%;background:${p>=100?'var(--green)':p>=70?'var(--teal)':'var(--purple)'}"></div></div></div>`;
    });
    gh+='</div></div>';
    document.getElementById('dash-goals-section').innerHTML=gh;
  }else document.getElementById('dash-goals-section').innerHTML='';
}
function renderDashMovers(T){
  const container=document.getElementById('dash-movers');
  if(!container)return;
  const rows=[];
  Object.entries(T.h).forEach(([sym,v])=>{
    const cp=getStockPrice(sym)||v.avgPrice,cv=v.qty*cp,pnl=cv-v.totalCost,ret=v.totalCost?pnl/v.totalCost*100:0;
    rows.push({label:sym,sub:v.name,ret,pnl,cv});
  });
  Object.entries(T.mh).forEach(([key,v])=>{
    const bt=v.metal_type||key.split('|')[0];const cp=getMetalPrice(bt)||v.avgPrice,cv=v.weight*cp,pnl=cv-v.totalCost,ret=v.totalCost?pnl/v.totalCost*100:0;
    rows.push({label:bt,sub:v.title||'معدن',ret,pnl,cv});
  });
  if(!rows.length){container.innerHTML='';return;}
  const sorted=[...rows].sort((a,b)=>b.ret-a.ret);
  const gainers=sorted.filter(r=>r.ret>0).slice(0,4);
  const losers=sorted.filter(r=>r.ret<0).slice(-4).reverse();
  const rowHtml=r=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:.5px solid var(--border)">
    <div><div style="font-weight:800;font-size:12.5px">${escapeHtml(r.label)}</div><div style="font-size:10px;color:var(--muted)">${escapeHtml(r.sub||'')}</div></div>
    <div style="text-align:left"><div class="${cls(r.ret)}" style="font-weight:800;font-size:12.5px;direction:ltr">${sign(r.ret)}${r.ret.toFixed(1)}%</div><div class="${cls(r.pnl)}" style="font-size:10px;direction:ltr">${sign(r.pnl)}${fmt(r.pnl)}</div></div>
  </div>`;
  container.innerHTML=`
    <div class="card">
      <div class="card-header"><div class="card-title"><div class="card-title-icon" style="background:var(--green-l);color:var(--green)"><svg viewBox="0 0 24 24"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg></div>أكبر الرابحين</div></div>
      <div class="card-body">${gainers.length?gainers.map(rowHtml).join(''):'<div style="text-align:center;color:var(--muted);font-size:12px;padding:16px">لا توجد حيازات رابحة حالياً</div>'}</div>
    </div>
    <div class="card">
      <div class="card-header"><div class="card-title"><div class="card-title-icon" style="background:var(--red-l);color:var(--red)"><svg viewBox="0 0 24 24"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg></div>أكبر الخاسرين</div></div>
      <div class="card-body">${losers.length?losers.map(rowHtml).join(''):'<div style="text-align:center;color:var(--muted);font-size:12px;padding:16px">لا توجد حيازات خاسرة حالياً</div>'}</div>
    </div>`;
}
function renderRecent(){
  const limit=Math.min(Math.max(+document.getElementById('recent-count-input')?.value||25,1),200);
  const pStart=periodStart(UI.globalPeriod||'1y');
  const NEG=['سحب','تحويل صادر','بيع'];
  const all=[
    ...DB.bankTxns.filter(t=>t.date>=pStart).map(t=>{const b=DB.banks.find(x=>x.id===t.bank_id);return{date:t.date,type:t.type,cat:t.category||'',amt:t.amount,src:b?.name||'بنك',notes:(t.notes||'').split('\n')[0],bankId:t.bank_id};}),
    ...DB.stockTxns.filter(t=>t.date>=pStart).map(t=>({date:t.date,type:t.type,cat:MARKET_NAMES[t.market||'EGX']||'أسهم',amt:t.net,src:t.symbol,notes:t.name,bankId:t.bank_id})),
    ...DB.metalTxns.filter(t=>t.date>=pStart).map(t=>({date:t.date,type:t.op,cat:'معادن',amt:t.net,src:t.metal_type+(t.notes?' — '+t.notes:''),notes:'',bankId:t.bank_id})),
    ...DB.dividends.filter(t=>t.date>=pStart).map(d=>({date:d.date,type:'أرباح',cat:'توزيعات',amt:d.amount,src:d.symbol,notes:d.notes,bankId:d.bank_id})),
  ].sort((a,b)=>b.date>a.date?1:-1).slice(0,limit);
  document.getElementById('dash-recent').innerHTML=all.length?all.map(t=>{
    const color=t.bankId?getBankColor(t.bankId):'var(--muted)';
    const dot=t.bankId?`<span style="width:6px;height:6px;border-radius:50%;background:${color};display:inline-block;flex-shrink:0"></span>`:'';
    return`<tr><td style="font-size:11.5px">${t.date}</td><td>${typeTag(t.type)}</td><td>${t.cat?`<span class="badge badge-gray" style="font-size:9px">${escapeHtml(t.cat)}</span>`:''}</td><td class="td-num ${NEG.includes(t.type)?'neg':'pos'}" style="direction:ltr">${NEG.includes(t.type)?'-':'+'}${fmt(t.amt)}</td><td style="display:flex;align-items:center;gap:4px;font-weight:700;font-size:12px">${dot}${escapeHtml(t.src)}</td><td class="muted" style="font-size:11px;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(t.notes||'—')}</td></tr>`;
  }).join(''):`<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--muted)">لا توجد عمليات في الفترة</td></tr>`;
}
function renderDashCharts(T){
  const{grand,totalBanks,stocksVal,metalsVal,certsTotal}=T;
  const pieData=[{l:'البنوك',v:totalBanks,c:'#1a56db'},{l:'الأسهم',v:stocksVal,c:'#0d9488'},{l:'المعادن',v:metalsVal,c:'#d97706'},{l:'الشهادات',v:certsTotal,c:'#7c3aed'}].filter(d=>d.v>0);
  setTimeout(()=>{
    mkPie('dash-pie',pieData.map(d=>d.l),pieData.map(d=>d.v),pieData.map(d=>d.c));
    const snaps=filterByPeriod(DB.snapshots,UI.globalPeriod||'1y','snapshot_date');
    if(snaps.length>1){
      const snapLabels=snaps.map(s=>{const d=new Date(s.snapshot_date);return d.toLocaleDateString('ar-EG',{month:'short',day:'numeric'})});
      mkLine('dash-line',snapLabels,[{label:'إجمالي المحفظة',data:snaps.map(s=>N2(s.grand_total)),borderColor:'#1a56db',backgroundColor:'rgba(26,86,219,0.08)',fill:true,tension:.4,pointRadius:snaps.length<30?2:0,borderWidth:2}]);
      mkLine('dash-stacked',snapLabels,[
        {label:'بنوك',data:snaps.map(s=>N2(s.total_banks)),borderColor:'#1a56db',backgroundColor:'rgba(26,86,219,0.15)',fill:true,tension:.4,pointRadius:0},
        {label:'أسهم',data:snaps.map(s=>N2(s.total_stocks)),borderColor:'#0d9488',backgroundColor:'rgba(13,148,136,0.15)',fill:true,tension:.4,pointRadius:0},
        {label:'معادن',data:snaps.map(s=>N2(s.total_metals)),borderColor:'#d97706',backgroundColor:'rgba(217,119,6,0.15)',fill:true,tension:.4,pointRadius:0},
        {label:'شهادات',data:snaps.map(s=>N2(s.total_certs)),borderColor:'#7c3aed',backgroundColor:'rgba(124,58,237,0.15)',fill:true,tension:.4,pointRadius:0},
      ]);
    }
  },50);
}

// ═══ BANKS ═══
function fmtBankAmt(amount,bankId){
  const bank=DB.banks.find(b=>b.id===bankId);
  const cur=bank?.currency||'EGP';
  return `${new Intl.NumberFormat('ar-EG',{minimumFractionDigits:2,maximumFractionDigits:2}).format(+amount||0)} ${cur}`;
}
function renderBankTable(){
  const CREDIT=['إيداع','تحويل وارد','رصيد افتتاحي','عائد شهادة','أرباح'];
  const isAll=UI.activeBankId==='ALL';
  const theadEl=document.getElementById('bank-txns-thead');
  if(isAll){
    const activeBanksList=DB.banks.filter(b=>b.is_active!==false);
    const totalEGP=activeBanksList.reduce((a,b)=>a+toEGP(N2(b.balance),b.currency||'EGP'),0);
    document.getElementById('bank-table-title').innerHTML=`<span style="display:inline-flex;align-items:center;gap:7px;flex-wrap:wrap"><strong>كل الحسابات (${activeBanksList.length})</strong><span style="color:var(--muted)">|</span><span style="font-weight:900">${fmt(totalEGP)}</span></span>`;
    if(theadEl)theadEl.innerHTML=`<tr><th>التاريخ</th><th>الحساب</th><th>النوع</th><th>الفئة</th><th>المبلغ</th><th>ملاحظات</th><th></th></tr>`;
    let txns=DB.bankTxns.slice();
    txns=filterByPeriod(txns,UI.globalPeriod||'1y');
    const typeCounts={};
    txns.forEach(t=>{typeCounts[t.type]=(typeCounts[t.type]||0)+1;});
    const filterDefs=[{key:'ALL',label:'الكل',count:txns.length}];
    Object.keys(typeCounts).sort((a,b)=>typeCounts[b]-typeCounts[a]).forEach(t=>filterDefs.push({key:t,label:t,count:typeCounts[t]}));
    const filtersEl=document.getElementById('bank-txn-filters');
    if(filtersEl)filtersEl.innerHTML=filterDefs.map(f=>`<button class="btn btn-xs ${UI.bankTxnFilter===f.key?'btn-primary':'btn-outline'}" onclick="setBankTxnFilter('${f.key.replace(/'/g,"\\'")}')">${escapeHtml(f.label)} <span style="opacity:.7">(${f.count})</span></button>`).join('');
    if(UI.bankTxnFilter!=='ALL')txns=txns.filter(t=>t.type===UI.bankTxnFilter);
    txns=[...txns].sort((a,b)=>b.date>a.date?1:b.date<a.date?-1:b.id-a.id);
    document.getElementById('bank-txns-tbody').innerHTML=txns.length?txns.map(t=>{
      const b=DB.banks.find(x=>x.id===t.bank_id);
      const isIn=CREDIT.includes(t.type);
      const bColor=b?getBankColor(b.id):'var(--muted)';
      const noteLines=(t.notes||'').split('\n');
      return`<tr style="border-right:2px solid ${bColor}22">
        <td style="font-size:12px">${t.date}</td>
        <td>${b?bankColorDot(b.id)+'<span style="font-size:12px">'+escapeHtml(b.name)+'</span>':'<span class="muted">— محذوف —</span>'}</td>
        <td>${typeTag(t.type)}</td>
        <td>${t.category?`<span class="badge badge-gray" style="font-size:9.5px">${escapeHtml(t.category)}</span>`:''}</td>
        <td class="td-num ${isIn?'pos':'neg'}" style="direction:ltr;font-weight:700">${isIn?'+':'-'}${fmtBankAmt(t.amount,t.bank_id)}</td>
        <td style="max-width:180px"><div style="font-size:11.5px">${escapeHtml(noteLines[0]||'—')}</div>${noteLines.length>1?`<div style="font-size:10px;color:var(--muted);margin-top:2px">${escapeHtml(noteLines.slice(1).join(' | '))}</div>`:''}</td>
        <td class="td-actions">
          <button class="btn-icon edit" onclick="editBankTxn(${t.id})"><svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
          <button class="btn-icon danger" onclick="deleteBankTxn(${t.id})"><svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg></button>
        </td>
      </tr>`;
    }).join(''):`<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--muted)">لا توجد عمليات في الفترة</td></tr>`;
    return;
  }
  if(theadEl)theadEl.innerHTML=`<tr><th>التاريخ</th><th>النوع</th><th>الفئة</th><th>المبلغ</th><th>الرصيد بعد</th><th>ملاحظات</th><th></th></tr>`;
  const bank=DB.banks.find(b=>b.id===UI.activeBankId);
  if(!bank){document.getElementById('bank-txns-tbody').innerHTML=`<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--muted)">اختر حساباً</td></tr>`;return;}
  const bankColor=getBankColor(bank.id);const cur=bank.currency||'EGP';
  document.getElementById('bank-table-title').innerHTML=`<span style="display:inline-flex;align-items:center;gap:7px;flex-wrap:wrap"><span style="width:12px;height:12px;border-radius:50%;background:${bankColor};flex-shrink:0"></span><strong style="color:${bankColor}">${escapeHtml(bank.name)}</strong>${bank.bank_code?`<span class="badge badge-gray">${escapeHtml(bank.bank_code)}</span>`:''}<span style="color:var(--muted)">|</span><span style="font-weight:900;color:${bankColor}">${fmtN(N2(bank.balance),2)} ${cur}</span>${bank.is_active===false?'<span class="badge badge-gray">مؤرشف</span>':''}</span>`;
  let txns=DB.bankTxns.filter(t=>t.bank_id===UI.activeBankId);
  txns=filterByPeriod(txns,UI.globalPeriod||'1y');
  const typeCounts={};
  txns.forEach(t=>{typeCounts[t.type]=(typeCounts[t.type]||0)+1;});
  const filterDefs=[{key:'ALL',label:'الكل',count:txns.length}];
  Object.keys(typeCounts).sort((a,b)=>typeCounts[b]-typeCounts[a]).forEach(t=>filterDefs.push({key:t,label:t,count:typeCounts[t]}));
  const filtersEl=document.getElementById('bank-txn-filters');
  if(filtersEl)filtersEl.innerHTML=filterDefs.map(f=>`<button class="btn btn-xs ${UI.bankTxnFilter===f.key?'btn-primary':'btn-outline'}" onclick="setBankTxnFilter('${f.key.replace(/'/g,"\\'")}')">${escapeHtml(f.label)} <span style="opacity:.7">(${f.count})</span></button>`).join('');
  if(UI.bankTxnFilter!=='ALL')txns=txns.filter(t=>t.type===UI.bankTxnFilter);
  document.getElementById('bank-txns-tbody').innerHTML=txns.length?txns.map(t=>{
    const isIn=CREDIT.includes(t.type);
    const noteLines=(t.notes||'').split('\n');
    return`<tr style="border-right:2px solid ${bankColor}22">
      <td style="font-size:12px">${t.date}</td><td>${typeTag(t.type)}</td>
      <td>${t.category?`<span class="badge badge-gray" style="font-size:9.5px">${escapeHtml(t.category)}</span>`:''}</td>
      <td class="td-num ${isIn?'pos':'neg'}" style="direction:ltr;font-weight:700">${isIn?'+':'-'}${fmtBankAmt(t.amount,t.bank_id)}</td>
      <td class="td-num" style="direction:ltr;font-weight:900;color:${bankColor}">${fmtBankAmt(t.balance_after,t.bank_id)}</td>
      <td style="max-width:200px"><div style="font-size:11.5px">${escapeHtml(noteLines[0]||'—')}</div>${noteLines.length>1?`<div style="font-size:10px;color:var(--muted);margin-top:2px">${escapeHtml(noteLines.slice(1).join(' | '))}</div>`:''}</td>
      <td class="td-actions">
        <button class="btn-icon edit" onclick="editBankTxn(${t.id})"><svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
        <button class="btn-icon danger" onclick="deleteBankTxn(${t.id})"><svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg></button>
      </td>
    </tr>`;
  }).join(''):`<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--muted)">لا توجد عمليات في الفترة</td></tr>`;
}
function renderBanks(){
  const T=calcTotals();
  const{totalBanks,grand}=T;
  const baseBalances=DB.banks.filter(b=>(b.currency||'EGP')===baseCur()).reduce((a,b)=>a+N2(b.balance),0);
  const fgn=totalBanks-baseBalances;
  const pStart=periodStart(UI.globalPeriod||'1y');
  const periodTxns=DB.bankTxns.filter(t=>t.date>=pStart);
  const totalDeposits=periodTxns.filter(t=>['إيداع','تحويل وارد','رصيد افتتاحي','عائد شهادة'].includes(t.type)).reduce((a,t)=>a+N2(t.amount),0);
  const totalWithdrawals=periodTxns.filter(t=>['سحب','تحويل صادر'].includes(t.type)).reduce((a,t)=>a+N2(t.amount),0);
  const lowBal=DB.banks.filter(b=>N2(b.min_balance)>0&&N2(b.balance)<N2(b.min_balance)).length;
  document.getElementById('bank-kpis').innerHTML=
    kpi('إجمالي الأرصدة',fmt(totalBanks),pct(totalBanks,grand)+' من المحفظة','var(--teal)',svgIcon('<path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>'))+
    kpi('عدد الحسابات',DB.banks.length,'','var(--blue)',svgIcon('<rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/>'))+
    kpi('أرصدة بـ'+baseCur(),fmt(baseBalances),baseCur(),'var(--green)',svgIcon('<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>'))+
    (fgn>0?kpi('عملات أجنبية (محوّلة)',fmt(fgn),'محوّلة إلى '+baseCur(),'var(--gold)',svgIcon('<path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>')):'')+
    kpi('إجمالي الإيداعات',fmt(totalDeposits),'في الفترة المحددة','var(--green)',svgIcon('<path d="M12 5v14M5 12l7 7 7-7"/>'),null)+
    kpi('إجمالي السحوبات',fmt(totalWithdrawals),'في الفترة المحددة','var(--red)',svgIcon('<path d="M12 19V5M5 12l7-7 7 7"/>'),null)+
    (lowBal>0?kpi('حسابات دون الحد',lowBal,'تحتاج انتباهاً','var(--gold)',svgIcon('<path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>'),null):'');
  const activeBanksList=DB.banks.filter(b=>b.is_active!==false)
    .sort((a,b)=>{
      const av=toEGP(N2(a.balance),a.currency||'EGP'),bv=toEGP(N2(b.balance),b.currency||'EGP');
      return UI.bankSort==='asc'?av-bv:bv-av;
    });
  const archivedBanksList=DB.banks.filter(b=>b.is_active===false);
  const renderCard=(b,archived=false)=>{
    const balEGP=toEGP(N2(b.balance),b.currency||'EGP');
    const isLow=N2(b.min_balance)>0&&N2(b.balance)<N2(b.min_balance);
    const isNeg=N2(b.balance)<0;
    const bankColor=getBankColor(b.id);
    const typeColors={جاري:'var(--blue)',توفير:'var(--green)',استثماري:'var(--purple)',بورصة:'var(--gold)',كاش:'var(--teal)'};
    const typeBg={جاري:'var(--blue-l)',توفير:'var(--green-l)',استثماري:'var(--purple-l)',بورصة:'var(--gold-l)',كاش:'var(--teal-l)'};
    const typeIcons={
      جاري:'<rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/>',
      توفير:'<path d="M19 5c-1.5 0-2.8 1.4-3 2-3.5-1.5-11-.3-11 5 0 1.8 0 3 2 4.5V20a1 1 0 001 1h2v-2h3v2h3v-2h1c.5 0 1-.5 1-1v-2.3c1-.5 1.7-1.2 2-1.7h1v-4h-1a5.5 5.5 0 00-1.5-3.5L21 5h-2z"/>',
      استثماري:'<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>',
      بورصة:'<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
      كاش:'<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>'
    };
    const share=totalBanks>0?Math.max(0,Math.min(100,balEGP/totalBanks*100)):0;
    return`<div class="info-card type-${b.type}${isLow?' warn':''}${isNeg?' danger':''}${archived?' bank-archived':''}">
      <div class="info-card-strip" style="background:linear-gradient(90deg,${bankColor},${bankColor}55)"></div>
      <div class="info-card-body">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
          <div style="display:flex;align-items:center;gap:8px;min-width:0">
            <span style="width:34px;height:34px;border-radius:9px;background:${bankColor}22;color:${bankColor};display:flex;align-items:center;justify-content:center;flex-shrink:0"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${typeIcons[b.type]||typeIcons['جاري']}</svg></span>
            <div style="min-width:0">
              <div style="color:var(--text);font-weight:800;font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(b.name)}</div>
              <div style="font-size:10.5px;color:var(--muted)">${escapeHtml(b.bank_code||'')}${b.account_no?' • '+escapeHtml(b.account_no):''}</div>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
            ${archived?'<span class="badge badge-gray">مؤرشف</span>':''}
            <span class="badge" style="background:${typeBg[b.type]||'var(--surface2)'};color:${typeColors[b.type]||'var(--muted)'}">${escapeHtml(b.type)}</span>
          </div>
        </div>
        <div>
          <div style="font-size:22px;font-weight:900;color:${isNeg?'var(--red)':isLow?'var(--gold)':'var(--text)'}">${fmtN(N2(b.balance),2)}<span style="font-size:12px;font-weight:700;color:var(--muted);margin-right:5px">${b.currency||'EGP'}</span></div>
          ${b.currency&&b.currency!=='EGP'?`<div style="font-size:11px;color:var(--muted)">≈ ${fmt(balEGP)}</div>`:''}
        </div>
        <div>
          <div style="height:4px;background:var(--surface2);border-radius:2px;overflow:hidden"><div style="height:100%;width:${share}%;background:${bankColor};border-radius:2px"></div></div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px">
            <span style="font-size:10px;color:var(--muted)">${share.toFixed(1)}% من إجمالي البنوك</span>
            ${isLow?`<span style="font-size:10px;color:var(--gold);font-weight:700">أقل من الحد الأدنى</span>`:''}
          </div>
        </div>
        ${b.notes?`<div style="font-size:10.5px;color:var(--muted);padding-top:8px;border-top:.5px solid var(--border)">${escapeHtml(b.notes)}</div>`:''}
      </div>
      <div class="info-card-footer">
        ${!archived?`<button class="btn btn-xs btn-success" onclick="quickDep(${b.id})" title="إيداع">+</button>
        <button class="btn btn-xs btn-gold" onclick="quickWit(${b.id})" title="سحب">-</button>`:''}
        <button class="btn-icon" onclick="toggleBankStatus(${b.id})" title="${archived?'تفعيل':'أرشفة'}" style="color:${archived?'var(--green)':'var(--muted)'}">
          ${archived?'<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>':'<svg viewBox="0 0 24 24"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"/></svg>'}
        </button>
        <button class="btn-icon edit" onclick="editBank(${b.id})"><svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
        <button class="btn-icon danger" onclick="deleteBank(${b.id})"><svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg></button>
      </div>
    </div>`;
  };
  let cardsHtml=activeBanksList.map(b=>renderCard(b,false)).join('');
  if(archivedBanksList.length){
    cardsHtml+=`<div style="grid-column:1/-1;padding:8px 0;font-size:10px;color:var(--muted);font-weight:800;text-transform:uppercase;letter-spacing:.8px;border-top:.5px solid var(--border);margin-top:4px">الحسابات المؤرشفة (${archivedBanksList.length})</div>`;
    cardsHtml+=archivedBanksList.map(b=>renderCard(b,true)).join('');
  }
  document.getElementById('bank-cards').innerHTML=cardsHtml||`<div class="empty-state"><p>لا توجد حسابات. أضف حساباً جديداً</p></div>`;
  const activeBanks=DB.banks.filter(b=>b.is_active!==false);
  const archivedBanks=DB.banks.filter(b=>b.is_active===false);
  const allTabBanks=[...activeBanks,...archivedBanks];
  const totalBanksEGP=activeBanks.reduce((a,b)=>a+toEGP(N2(b.balance),b.currency||'EGP'),0);
  document.getElementById('bank-tabs').innerHTML=
    `<div class="tab ${UI.activeBankId==='ALL'?'active':''}" data-bank-tab="ALL" onclick="switchBankTab('ALL')" style="display:flex;align-items:center;gap:5px;font-weight:800">كل الحسابات <span style="opacity:.7;font-weight:400">(${fmt(totalBanksEGP)})</span></div>`+
    allTabBanks.map(b=>{
    const dot=`<span style="width:7px;height:7px;border-radius:50%;background:${getBankColor(b.id)};flex-shrink:0;display:inline-block"></span>`;
    return`<div class="tab ${b.id===UI.activeBankId?'active':''} ${b.is_active===false?'bank-archived':''}" data-bank-tab="${b.id}" onclick="switchBankTab(${b.id})" style="display:flex;align-items:center;gap:5px">${dot}${escapeHtml(b.name)}${b.is_active===false?' (مؤرشف)':''}</div>`;
  }).join('');
  renderBankTable();
}
function quickDep(bankId){populateSelect('ed-bank');document.getElementById('ed-bank').value=bankId;document.getElementById('ed-date').value=today();document.getElementById('ed-amount').value='';document.getElementById('dep-preview').innerHTML='';openModal('modal-dep')}
function quickWit(bankId){populateSelect('ew-bank');document.getElementById('ew-bank').value=bankId;document.getElementById('ew-date').value=today();document.getElementById('ew-amount').value='';document.getElementById('wit-preview').innerHTML='';openModal('modal-wit')}
function setBankTxnFilter(v){UI.bankTxnFilter=v;renderBankTable();}
function switchBankTab(id){UI.activeBankId=id;UI.bankTxnFilter='ALL';document.querySelectorAll('#bank-tabs .tab').forEach(t=>{t.classList.toggle('active',t.dataset.bankTab===String(id))});renderBankTable()}

// ═══ INSIGHTS CARD (used by stocks & metals) ═══
function renderInsightsCard(items,label,colorFn,valueFn,nameFn){
  if(!items.length)return'';
  const sorted=[...items].sort((a,b)=>valueFn(b)-valueFn(a));
  const best=sorted[0],worst=sorted[sorted.length-1];
  return`<div class="card" style="margin-bottom:16px">
    <div class="card-header"><div class="card-title">📊 تحليل الأداء — ${label}</div></div>
    <div class="card-body" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px">
      <div style="padding:12px;background:var(--green-l);border-radius:10px;border:.5px solid rgba(13,148,136,.2)">
        <div style="font-size:10px;color:var(--muted);font-weight:800;text-transform:uppercase;margin-bottom:6px">أفضل أداء</div>
        <div style="font-weight:900;font-size:15px;color:var(--green)">${escapeHtml(nameFn(best))}</div>
        <div style="font-size:12px;color:var(--muted);margin-top:3px">${(valueFn(best)>=0?'+':'')+valueFn(best).toFixed(2)+'%'}</div>
      </div>
      <div style="padding:12px;background:var(--red-l);border-radius:10px;border:.5px solid rgba(225,29,72,.2)">
        <div style="font-size:10px;color:var(--muted);font-weight:800;text-transform:uppercase;margin-bottom:6px">أحتاج مراجعة</div>
        <div style="font-weight:900;font-size:15px;color:var(--red)">${escapeHtml(nameFn(worst))}</div>
        <div style="font-size:12px;color:var(--muted);margin-top:3px">${(valueFn(worst)>=0?'+':'')+valueFn(worst).toFixed(2)+'%'}</div>
      </div>
      ${sorted.map((item)=>`<div style="padding:10px;background:var(--surface2);border-radius:8px;display:flex;justify-content:space-between;align-items:center"><span style="font-weight:700;font-size:12px">${escapeHtml(nameFn(item))}</span><span style="font-weight:800;font-size:13px;color:${colorFn(item)}">${(valueFn(item)>=0?'+':'')+valueFn(item).toFixed(1)}%</span></div>`).join('')}
    </div>
  </div>`;
}

// ═══ STOCKS ═══
function renderStocks(){
  const mf=typeof activeStockMarket!=='undefined'?activeStockMarket:'ALL';
  const h=getHoldings(mf==='ALL'?null:mf);
  const hAll=getHoldings(null);
  const T=calcTotals();const{grand}=T;
  const fSV=Object.entries(h).reduce((a,[s,v])=>a+v.qty*(getStockPrice(s)||v.avgPrice),0);
  const fSC=Object.values(h).reduce((a,v)=>a+v.totalCost,0);
  const fPnl=fSV-fSC;const fRet=fSC>0?fPnl/fSC*100:0;
  const {stocksVal,stocksCost,pnlStocks}=T;const retS=stocksCost>0?pnlStocks/stocksCost*100:0;
  const realPnl=DB.stockTxns.filter(t=>t.type==='بيع'&&t.profit!=null&&(mf==='ALL'||(t.market||'EGX')===mf)).reduce((a,t)=>a+N2(t.profit),0);
  const symToMarket={};
  DB.stockTxns.forEach(t=>{if(t.symbol&&!symToMarket[t.symbol])symToMarket[t.symbol]=t.market||'EGX';});
  const divTotalFiltered=DB.dividends.filter(d=>mf==='ALL'||(symToMarket[d.symbol]||'EGX')===mf).reduce((a,d)=>a+N2(d.amount),0);
  const useV=mf==='ALL'?stocksVal:fSV,useC=mf==='ALL'?stocksCost:fSC,usePnl=mf==='ALL'?pnlStocks:fPnl,useRet=mf==='ALL'?retS:fRet;
  document.getElementById('stock-kpis').innerHTML=
    kpi('القيمة السوقية',fmt(useV),pct(useV,grand)+' من المحفظة','var(--blue)',svgIcon('<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/>'),null)+
    kpi('رأس المال',fmt(useC),'التكلفة الإجمالية','var(--muted)',svgIcon('<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>'),null)+
    kpi('ر/خ غير محقق',fmt(usePnl),(useRet>=0?'+':'')+useRet.toFixed(2)+'%',usePnl>=0?'var(--green)':'var(--red)',svgIcon('<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/>'),useRet)+
    kpi('أرباح محققة',fmt(realPnl),'من صفقات البيع'+(mf!=='ALL'?' — '+(MARKET_NAMES[mf]||mf):''),realPnl>=0?'var(--teal)':'var(--red)',svgIcon('<polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>'),null)+
    kpi('أرباح موزعة',fmt(divTotalFiltered),'توزيعات مستلمة'+(mf!=='ALL'?' — '+(MARKET_NAMES[mf]||mf):''),'var(--purple)',svgIcon('<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>'),null)+
    kpi('إجمالي العائد',fmt(usePnl+realPnl+divTotalFiltered),'غير محقق + محقق + توزيعات',(usePnl+realPnl+divTotalFiltered)>=0?'var(--green)':'var(--red)',svgIcon('<line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/>'),null)+
    kpi('أوراق مالية',Object.keys(h).length+(mf!=='ALL'?' / '+Object.keys(hAll).length:''),mf!=='ALL'?'حيازات في '+(MARKET_NAMES[mf]||mf):'حيازات حالية','var(--teal)',svgIcon('<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/>'),null);
  const holdingsSorted=Object.entries(h).map(([sym,v])=>{
    const cp=getStockPrice(sym)||v.avgPrice,cv=v.qty*cp;
    return[sym,v,cv];
  }).sort((a,b)=>b[2]-a[2]);
  document.getElementById('holdings-cards').innerHTML=holdingsSorted.length?
    holdingsSorted.map(([sym,v,cv])=>{
      const cp=getStockPrice(sym)||v.avgPrice,pnlV=cv-v.totalCost,ret=v.totalCost?(pnlV/v.totalCost*100):0;
      const mkt=v.market||'EGX';const cur=v.currency||'EGP';
      const win=pnlV>=0;
      return`<div class="info-card">
        <div class="info-card-strip" style="background:${win?'var(--green)':'var(--red)'}"></div>
        <div class="info-card-body">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
            <div style="min-width:0">
              <div style="font-weight:900;font-size:15px">${escapeHtml(sym)}</div>
              <div style="font-size:10.5px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(v.name)}</div>
            </div>
            <div style="display:flex;gap:4px;flex-shrink:0"><span class="badge ${MARKET_COLORS[mkt]||'badge-gray'}" style="font-size:9px">${MARKET_NAMES[mkt]||mkt}</span></div>
          </div>
          <div>
            <div style="font-size:20px;font-weight:900">${fmt(cv)}</div>
            <div style="display:flex;align-items:center;gap:6px;font-size:12px" class="${cls(pnlV)}"><strong>${sign(pnlV)}${fmt(pnlV)}</strong><span>(${sign(ret)}${ret.toFixed(2)}%)</span></div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:11px;color:var(--muted);background:var(--surface2);border-radius:8px;padding:8px">
            <div>الكمية<div style="color:var(--text);font-weight:700">${fmtN(v.qty,4)}</div></div>
            <div>متوسط التكلفة<div style="color:var(--text);font-weight:700">${fmtN(v.avgPrice,4)} ${cur}</div></div>
            <div>السعر الحالي<div style="color:var(--gold);font-weight:700">${fmtN(cp,4)} ${cur}</div></div>
            <div>من المحفظة<div style="color:var(--text);font-weight:700">${pct(cv,grand)}</div></div>
          </div>
        </div>
        <div class="info-card-footer">
          <button class="btn btn-xs btn-success" onclick="addMoreStock('${sym}')" title="إضافة">+ إضافة</button>
          <button class="btn btn-xs btn-danger" onclick="quickSellStock('${sym}')" title="بيع">بيع</button>
        </div>
      </div>`;
    }).join('')
    :`<div class="empty-state" style="padding:32px;text-align:center;color:var(--muted);grid-column:1/-1"><p>لا توجد حيازات${mf!=='ALL'?' في سوق '+mf:''}. ابدأ بشراء ورقة مالية</p></div>`;
  let txns=filterByPeriod([...DB.stockTxns].filter(t=>mf==='ALL'||(t.market||'EGX')===mf).reverse(),UI.globalPeriod||'1y');
  document.getElementById('stock-txns-tbody').innerHTML=txns.length?txns.map(t=>{
    const bc=getBankColor(t.bank_id);const bank=DB.banks.find(b=>b.id===t.bank_id);
    return`<tr style="border-right:2px solid ${bc}22">
      <td>${t.date}</td><td>${typeTag(t.type)}</td>
      <td class="td-sym" style="font-weight:900">${escapeHtml(t.symbol)}</td>
      <td class="muted" style="font-size:11px">${escapeHtml(t.name)}</td>
      <td><span class="badge ${MARKET_COLORS[t.market||'EGX']||'badge-gray'}" style="font-size:9px">${MARKET_NAMES[t.market||'EGX']||t.market||'EGX'}</span></td>
      <td class="td-num">${fmtN(N2(t.quantity),4)}</td>
      <td class="td-num">${fmtN(N2(t.price),4)} ${t.price_currency||'EGP'}</td>
      <td class="td-num">${fmt(t.total)}</td>
      <td class="td-num muted">${fmt(t.commission)}</td>
      <td class="td-num" style="font-weight:800">${fmt(t.net)}</td>
      <td class="td-num ${t.profit!=null?cls(t.profit):''}">${t.profit!=null?sign(t.profit)+fmt(t.profit):'—'}</td>
      <td><span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;padding:2px 6px;border-radius:6px;border:1.5px solid ${bc}40"><span style="width:6px;height:6px;border-radius:50%;background:${bc}"></span>${escapeHtml(bank?.name||'—')}</span></td>
      <td class="td-actions">
        <button class="btn-icon edit" onclick="editStockTxn(${t.id})"><svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
        <button class="btn-icon danger" onclick="deleteStockTxn(${t.id})"><svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg></button>
      </td>
    </tr>`;
  }).join(''):`<tr><td colspan="13" style="text-align:center;padding:24px;color:var(--muted)">لا توجد عمليات في الفترة</td></tr>`;
  // Insights card
  const insightsEl=document.getElementById('stocks-insights');
  if(insightsEl){
    const items=Object.entries(h).map(([sym,v])=>{
      const cp=getStockPrice(sym)||v.avgPrice,cv=v.qty*cp,pnl=cv-v.totalCost;
      return{sym,ret:v.totalCost?pnl/v.totalCost*100:0};
    });
    insightsEl.innerHTML=renderInsightsCard(items,'الأسهم',x=>x.ret>=0?'var(--green)':'var(--red)',x=>x.ret,x=>x.sym);
  }
  // Heatmap
  if(typeof renderStockHeatmap==='function'){
    let el=document.getElementById('stocks-heatmap');
    if(!el){el=document.createElement('div');el.id='stocks-heatmap';const f=document.querySelector('#page-stocks .card');if(f)f.parentNode.insertBefore(el,f);}
    if(el)renderStockHeatmap(h,el);
  }
  if(typeof renderDividends==='function')renderDividends();
}

// ═══ METALS ═══
function renderMetals(){
  const mh=getMetalHoldings();const T=calcTotals();
  const{metalsVal,metalsCost,pnlMetals,grand}=T;
  const retM=metalsCost>0?pnlMetals/metalsCost*100:0;
  document.getElementById('metal-kpis').innerHTML=
    kpi('القيمة السوقية',fmt(metalsVal),pct(metalsVal,grand)+' من المحفظة','var(--gold)',svgIcon('<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>'),null)+
    kpi('إجمالي التكلفة',fmt(metalsCost),'رأس المال المستثمر','var(--muted)',svgIcon('<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>'),null)+
    kpi('ربح / خسارة',fmt(pnlMetals),(retM>=0?'+':'')+retM.toFixed(2)+'%',pnlMetals>=0?'var(--gold)':'var(--red)',svgIcon('<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>'),retM)+
    kpi('حيازات نشطة',Object.keys(mh).length,'أنواع مختلفة','var(--teal)',svgIcon('<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/>'),null);
  document.getElementById('metal-holdings-cards').innerHTML=Object.keys(mh).length?
    Object.entries(mh).map(([key,v])=>{
      const baseType=(v.metal_type||key.split('|')[0]).trim();
      const cp=getMetalPrice(baseType)||v.avgPrice;
      const curVal=v.weight*cp;
      return[key,v,baseType,cp,curVal];
    }).sort((a,b)=>b[4]-a[4]).map(([key,v,baseType,cp,curVal])=>{
      const pnlVal=curVal-v.totalCost,ret=v.totalCost?(pnlVal/v.totalCost*100):0;
      const win=pnlVal>=0;
      return`<div class="info-card">
        <div class="info-card-strip" style="background:${win?'var(--green)':'var(--red)'}"></div>
        <div class="info-card-body">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
            <div style="min-width:0">
              <div style="font-weight:900;font-size:15px;color:var(--gold)">${escapeHtml(baseType)}</div>
              <div style="font-size:10.5px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(v.title||'—')}</div>
            </div>
          </div>
          <div>
            <div style="font-size:20px;font-weight:900">${fmt(curVal)}</div>
            <div style="display:flex;align-items:center;gap:6px;font-size:12px" class="${cls(pnlVal)}"><strong>${sign(pnlVal)}${fmt(pnlVal)}</strong><span>(${sign(ret)}${ret.toFixed(2)}%)</span></div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:11px;color:var(--muted);background:var(--surface2);border-radius:8px;padding:8px">
            <div>الوزن<div style="color:var(--text);font-weight:700">${fmtN(v.weight,3)} جم</div></div>
            <div>متوسط/جم<div style="color:var(--text);font-weight:700">${fmtN(v.avgPrice,2)} ج.م</div></div>
            <div>السعر الحالي/جم<div style="color:var(--gold);font-weight:700">${fmtN(cp,2)} ج.م</div></div>
            <div>من المحفظة<div style="color:var(--text);font-weight:700">${pct(curVal,grand)}</div></div>
          </div>
        </div>
        <div class="info-card-footer">
          <button class="btn btn-xs btn-success" onclick="addMoreMetal('${baseType.replace(/'/g,"\\'")}','${(v.title||'').replace(/'/g,"\\'")}')">+ إضافة</button>
          <button class="btn btn-xs btn-danger" onclick="quickSellMetal('${key.replace(/'/g,"\\'")}')">بيع</button>
        </div>
      </div>`;
    }).join('')
    :`<div class="empty-state" style="padding:32px;text-align:center;color:var(--muted);grid-column:1/-1"><p>لا توجد معادن مملوكة</p></div>`;
  const running={};
  const txnsWithPnl=[...DB.metalTxns].sort((a,b)=>a.date>b.date?1:a.date<b.date?-1:a.id-b.id).map(t=>{
    const key=(t.notes?.trim())?t.metal_type+'|'+t.notes.trim():t.metal_type;
    if(!running[key])running[key]={w:0,cost:0};
    let pnl=null;
    if(t.op==='شراء'){running[key].w+=N2(t.weight);running[key].cost+=N2(t.net);}
    else{
      const avg=running[key].w>0?running[key].cost/running[key].w:0;
      pnl=N2(t.net)-avg*N2(t.weight);
      const sw=Math.min(N2(t.weight),running[key].w);
      running[key].w-=sw;running[key].cost-=avg*sw;
    }
    return{...t,_pnl:pnl};
  });
  let txns=filterByPeriod([...txnsWithPnl].reverse(),UI.globalPeriod||'1y');
  document.getElementById('metal-txns-tbody').innerHTML=txns.length?txns.map(t=>{
    const bc=getBankColor(t.bank_id);const bank=DB.banks.find(b=>b.id===t.bank_id);
    return`<tr style="border-right:2px solid ${bc}22">
      <td>${t.date}</td><td>${typeTag(t.op)}</td>
      <td><div style="font-weight:700;color:var(--gold)">${escapeHtml((t.metal_type||'').split('|')[0])}</div>${t.notes?`<div style="font-size:10px;color:var(--muted)">${escapeHtml(t.notes)}</div>`:''}</td>
      <td class="td-num">${fmtN(N2(t.weight),3)} جم</td>
      <td class="td-num">${fmtN(N2(t.price_per_gram),2)} ج.م</td>
      <td class="td-num">${fmt(t.total)}</td>
      <td class="td-num" style="color:var(--red)">${N2(t.manufacturing)>0?fmt(t.manufacturing):'—'}</td>
      <td class="td-num" style="color:var(--green)">${N2(t.cashback)>0?fmt(t.cashback):'—'}</td>
      <td class="td-num" style="font-weight:800">${fmt(t.net)}</td>
      <td class="td-num ${t._pnl!=null?cls(t._pnl):''}">${t._pnl!=null?sign(t._pnl)+fmt(t._pnl):'—'}</td>
      <td><span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;padding:2px 6px;border-radius:6px;border:1.5px solid ${bc}40"><span style="width:6px;height:6px;border-radius:50%;background:${bc}"></span>${escapeHtml(bank?.name||'—')}</span></td>
      <td class="td-actions">
        <button class="btn-icon edit" onclick="editMetalTxn(${t.id})"><svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
        <button class="btn-icon danger" onclick="deleteMetalTxn(${t.id})"><svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg></button>
      </td>
    </tr>`;
  }).join(''):`<tr><td colspan="12" style="text-align:center;padding:24px;color:var(--muted)">لا توجد عمليات في الفترة</td></tr>`;
  // Insights
  const insightsEl=document.getElementById('metals-insights');
  if(insightsEl){
    const items=Object.entries(mh).map(([key,v])=>{
      const bt=v.metal_type||key.split('|')[0];const cp=getMetalPrice(bt)||v.avgPrice,cv=v.weight*cp,pnl=cv-v.totalCost;
      return{label:v.title?v.metal_type+' — '+v.title:bt,ret:v.totalCost?pnl/v.totalCost*100:0};
    });
    insightsEl.innerHTML=renderInsightsCard(items,'المعادن',x=>x.ret>=0?'var(--green)':'var(--red)',x=>x.ret,x=>x.label);
  }
}
function addMoreMetal(metalType,metalTitle){
  openModal('modal-metal-buy');
  setTimeout(()=>{
    populateMetalTypeSelect(metalType);
    document.getElementById('emb-notes').value=metalTitle||'';
    document.getElementById('emb-weight').value='';document.getElementById('emb-price').value='';
    document.getElementById('emb-manuf').value='0';document.getElementById('emb-fixed').value='0';
    populateSelect('emb-bank');
    const lastTxn=[...DB.metalTxns].filter(t=>t.metal_type===metalType).sort((a,b)=>b.date>a.date?1:-1)[0];
    if(lastTxn&&lastTxn.bank_id)document.getElementById('emb-bank').value=lastTxn.bank_id;
    document.getElementById('metal-buy-preview').innerHTML='';
  },30);
}

// ═══ CERTS ═══
function renderCerts(){
  const T=calcTotals();const{certsTotal,grand}=T;
  const alerts=getCertAlerts();
  const totalInt=DB.certs.reduce((a,c)=>a+N2(c.total_interest),0);
  const totalPaid=DB.certs.reduce((a,c)=>a+N2(c.interest_paid),0);
  const todayAccrued=DB.certs.reduce((a,c)=>a+calcAccruedInterest(c),0);
  document.getElementById('cert-kpis').innerHTML=
    kpi('إجمالي الشهادات',fmt(certsTotal),pct(certsTotal,grand)+' من المحفظة','var(--purple)',svgIcon('<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>'),null)+
    kpi('مستحق حتى اليوم',fmt(todayAccrued),(todayAccrued/Math.max(1,totalInt)*100).toFixed(1)+'% من الإجمالي','var(--blue)',svgIcon('<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>'),null)+
    kpi('إجمالي الفوائد المتوقعة',fmt(totalInt),'على مدى المدد كاملة','var(--green)',svgIcon('<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/>'),null)+
    kpi('فوائد تم صرفها',fmt(totalPaid),(totalPaid/Math.max(1,totalInt)*100).toFixed(1)+'% من الإجمالي','var(--teal)',svgIcon('<polyline points="20 6 9 17 4 12"/>'),null)+
    kpi('فوائد متبقية',fmt(totalInt-totalPaid),'لم يتم صرفها بعد','var(--gold)',svgIcon('<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>'),null)+
    kpi('تستحق قريباً',alerts.soon.length+alerts.expired.length,alerts.expired.length?'منتهية: '+alerts.expired.length:'خلال 30 يوم',alerts.expired.length?'var(--red)':'var(--gold)',svgIcon('<path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>'),null);
  let alertsHtml='';
  if(alerts.expired.length)alertsHtml+=`<div class="alert alert-danger"><div class="alert-icon"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg></div><div class="alert-content"><div class="alert-title">شهادات منتهية — يجب اتخاذ إجراء فوري</div><div class="alert-body">${alerts.expired.map(c=>escapeHtml(c.name)+' ('+escapeHtml(c.bank_name||'')+') انتهت منذ '+Math.abs(c.daysLeft)+' يوم').join(' | ')}</div></div></div>`;
  if(alerts.soon.length)alertsHtml+=`<div class="alert alert-warn"><div class="alert-icon"><svg viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg></div><div class="alert-content"><div class="alert-title">تستحق خلال 30 يوم</div><div class="alert-body">${alerts.soon.map(c=>escapeHtml(c.name)+': '+c.daysLeft+' يوم').join(' | ')}</div></div></div>`;
  document.getElementById('cert-alerts').innerHTML=alertsHtml;
  const now=new Date();
  document.getElementById('cert-cards').innerHTML=DB.certs.length?DB.certs.map(c=>{
    const mat=new Date(c.maturity_date),days=Math.ceil((mat-now)/86400000);
    const isExpired=days<0,isSoon=days>=0&&days<=30;
    const periodsMap={'سنوي':N2(c.duration),'شهري':N2(c.duration)*12,'أسبوعي':N2(c.duration)*52,'يومي':N2(c.duration)*365};
    const periods=periodsMap[c.payout_type||'سنوي']||N2(c.duration);
    const perPeriod=periods>0?N2(c.total_interest)/periods:0;
    const remaining=Math.max(0,N2(c.total_interest)-N2(c.interest_paid));
    const accrued=calcAccruedInterest(c);
    const paidPct=N2(c.total_interest)>0?Math.min(100,N2(c.interest_paid)/N2(c.total_interest)*100):0;
    const statusColor=isExpired?'var(--red)':isSoon?'var(--gold)':'var(--purple)';
    const statusLabel=isExpired?'منتهية':isSoon?days+' يوم للاستحقاق':'نشطة';
    return`<div class="info-card">
      <div class="info-card-strip" style="background:${statusColor}"></div>
      <div class="info-card-body">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
          <div style="min-width:0">
            <div style="font-weight:800;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(c.name)}</div>
            <div style="font-size:10.5px;color:var(--muted)">${escapeHtml(c.bank_name||'—')} • ${c.payout_type||'سنوي'}</div>
          </div>
          <span class="badge" style="background:${statusColor}22;color:${statusColor};font-weight:800;white-space:nowrap">${statusLabel}</span>
        </div>
        <div>
          <div style="font-size:20px;font-weight:900;color:var(--purple)">${fmt(c.amount)}</div>
          <div style="font-size:11px;color:var(--muted)">فائدة ${c.rate}% • ${c.duration} سنة (${c.issued_date} → ${c.maturity_date})</div>
        </div>
        <div>
          <div style="display:flex;justify-content:space-between;font-size:10.5px;color:var(--muted);margin-bottom:3px"><span>عائد مُصرف: ${paidPct.toFixed(0)}%</span><span>متبقي: ${fmt(remaining)}</span></div>
          <div class="prog-wrap"><div class="prog-bar" style="width:${paidPct}%;background:var(--teal)"></div></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:11px;color:var(--muted);background:var(--surface2);border-radius:8px;padding:8px">
          <div>مستحق حتى اليوم<div style="color:var(--blue);font-weight:700">${fmt(accrued)}</div></div>
          <div>العائد الدوري<div style="color:var(--green);font-weight:700">${fmt(perPeriod)}</div></div>
          <div>عائد مُصرف<div style="color:var(--teal);font-weight:700">${fmt(c.interest_paid)}</div></div>
          <div>إجمالي الفائدة<div style="color:var(--green);font-weight:700">+${fmt(c.total_interest)}</div></div>
        </div>
      </div>
      <div class="info-card-footer">
        <button class="btn btn-xs btn-success" onclick="openCertPayout(${c.id})">صرف عائد</button>
        <button class="btn-icon edit" onclick="editCert(${c.id})"><svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
        <button class="btn-icon danger" onclick="deleteCert(${c.id})"><svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg></button>
      </div>
    </div>`;
  }).join(''):`<div class="empty-state" style="padding:32px;text-align:center;color:var(--muted);grid-column:1/-1"><p>لا توجد شهادات</p></div>`;
  const certLogEl=document.getElementById('cert-log-tbody');
  if(certLogEl){
    const certEvents=DB.bankTxns.filter(t=>
      t.category==='عائد شهادة'||t.category==='كسر شهادة'||
      (t.notes&&(t.notes.includes('شهادة')||t.notes.includes('عائد')))&&['سحب','إيداع','عائد شهادة'].includes(t.type)
    ).concat(DB.bankTxns.filter(t=>t.type==='عائد شهادة'));
    const seen=new Set();
    const uniqueEvents=certEvents.filter(t=>{if(seen.has(t.id))return false;seen.add(t.id);return true});
    uniqueEvents.sort((a,b)=>b.date>a.date?1:-1);
    certLogEl.innerHTML=uniqueEvents.length?uniqueEvents.slice(0,50).map(t=>{
      const bank=DB.banks.find(b=>b.id===t.bank_id);
      const opType=t.type==='عائد شهادة'?'صرف عائد':t.category==='كسر شهادة'?'كسر شهادة':t.type==='سحب'?'إنشاء شهادة':t.type==='إيداع'?'عائد / كسر':'—';
      return`<tr>
        <td>${t.date}</td><td class="muted">${escapeHtml(t.notes?.split('\n')[0]||'—')}</td>
        <td><span class="badge ${t.type==='إيداع'||t.type==='عائد شهادة'?'badge-green':'badge-purple'}">${opType}</span></td>
        <td class="td-num ${t.type==='إيداع'||t.type==='عائد شهادة'?'pos':'neg'}" style="direction:ltr">${t.type==='إيداع'||t.type==='عائد شهادة'?'+':'-'}${fmt(t.amount)}</td>
        <td>${bankColorDot(t.bank_id)}${escapeHtml(bank?.name||'—')}</td>
        <td class="muted" style="font-size:11px;max-width:180px;white-space:pre-wrap">${escapeHtml(t.notes||'—')}</td>
      </tr>`;
    }).join(''):`<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--muted)">لا توجد عمليات مسجلة</td></tr>`;
  }
}

// ═══ DEBTS ═══
function renderDebts(){
  const T=calcTotals();
  document.getElementById('debt-kpis').innerHTML=
    kpi('ديون عليّ',fmt(T.debtsOwed),'مجموع الالتزامات','var(--red)',svgIcon('<path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78"/>'),null)+
    kpi('ديون لي',fmt(T.debtsOwing),'مجموع المستحقات لي','var(--green)',svgIcon('<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/>'),null)+
    kpi('صافي الوضع',fmt(T.debtsOwing-T.debtsOwed),'للي × عليّ',T.debtsOwing>=T.debtsOwed?'var(--green)':'var(--red)',svgIcon('<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>'),null)+
    kpi('عدد الالتزامات',DB.debts.length,'إجمالي العقود','var(--muted)',svgIcon('<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>'),null);
  if(!DB.debts.length){document.getElementById('debts-list').innerHTML=`<div class="empty-state" style="padding:48px;text-align:center;color:var(--muted)"><p>لا توجد ديون أو التزامات مسجلة</p></div>`;return}
  document.getElementById('debts-list').innerHTML=DB.debts.map(d=>{
    const now=new Date(),due=d.due_date?new Date(d.due_date):null;
    const isOverdue=due&&now>due&&N2(d.remaining)>0;
    const daysLeft=due?Math.ceil((due-now)/86400000):null;
    const pctPaid=N2(d.amount)>0?pctN(N2(d.amount)-N2(d.remaining),N2(d.amount)):0;
    const payments=DB.debtPayments.filter(p=>p.debt_id===d.id);
    const stripColor=isOverdue?'var(--red)':d.type==='دين علي'?'var(--gold)':'var(--green)';
    return`<div class="debt-card${isOverdue?' overdue':''}" style="border-top:3px solid ${stripColor};padding-top:13px">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px">
        <div>
          <div style="font-weight:800;font-size:15px;color:var(--text)">${escapeHtml(d.name)}</div>
          <div style="font-size:11px;color:var(--muted);margin-top:3px">${escapeHtml(d.party||'')} • ${escapeHtml(d.type)} ${d.rate>0?'• فائدة '+d.rate+'%':''}</div>
        </div>
        <div style="text-align:left">
          <div style="font-size:20px;font-weight:900;color:${d.type==='دين علي'?'var(--red)':'var(--green)'}">${fmt(d.remaining)}</div>
          <div style="font-size:11px;color:var(--muted)">من أصل ${fmt(d.amount)}</div>
        </div>
      </div>
      <div class="prog-wrap lg" style="margin-bottom:10px"><div class="prog-bar" style="width:${Math.min(pctPaid,100)}%;background:${pctPaid>=100?'var(--green)':'var(--teal)'}"></div></div>
      <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--muted);margin-bottom:10px;flex-wrap:wrap;gap:4px">
        <span>مدفوع: ${pctPaid.toFixed(0)}%</span>
        ${d.start_date?`<span>البداية: ${d.start_date}</span>`:''}
        ${d.due_date?`<span style="${isOverdue?'color:var(--red);font-weight:700':''}">الاستحقاق: ${d.due_date}${daysLeft!==null?' ('+Math.abs(daysLeft)+(daysLeft<0?' يوم مضى':' يوم متبقي')+')':''}</span>`:''}
        ${payments.length?`<span>${payments.length} دفعة</span>`:''}
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn btn-xs btn-success" onclick="openDebtPay(${d.id})">دفعة</button>
        <button class="btn btn-xs btn-outline" onclick="editDebt(${d.id})">تعديل</button>
        <button class="btn btn-xs btn-danger" onclick="deleteDebt(${d.id})">حذف</button>
      </div>
      ${d.notes?`<div style="font-size:11px;color:var(--muted);margin-top:8px;padding-top:8px;border-top:.5px solid var(--border)">${escapeHtml(d.notes)}</div>`:''}
    </div>`;
  }).join('');
  const paymentsLogEl=document.getElementById('debts-payments-log');
  if(paymentsLogEl){
    if(DB.debtPayments.length){
      paymentsLogEl.innerHTML=`<div class="card" style="margin-top:16px">
        <div class="card-header"><div class="card-title">سجل الدفعات</div></div>
        <div class="card-body no-pad"><div class="table-wrap"><table>
          <thead><tr><th>التاريخ</th><th>الدين / الالتزام</th><th>المبلغ</th><th>الحساب</th><th>ملاحظات</th><th></th></tr></thead>
          <tbody>${[...DB.debtPayments].sort((a,b)=>b.date>a.date?1:-1).map(p=>{
            const debt=DB.debts.find(d=>d.id===p.debt_id);
            const bank=DB.banks.find(b=>b.id===p.bank_id);
            return '<tr><td>'+p.date+'</td><td style="font-weight:700">'+escapeHtml(debt?.name||'—')+'</td><td class="td-num pos" style="direction:ltr">'+fmt(p.amount)+'</td><td class="muted">'+(p.bank_id?bankColorDot(p.bank_id)+escapeHtml(bank?.name||'—'):'—')+'</td><td class="muted">'+escapeHtml(p.notes||'—')+'</td><td><button class="btn-icon danger" onclick="deleteDebtPayment('+p.id+')"><svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg></button></td></tr>';
          }).join('')}</tbody>
        </table></div></div>
      </div>`;
    } else {
      paymentsLogEl.innerHTML='';
    }
  }
}
function openDebtPay(debtId){
  populateSelect('edp-bank','<option value="">— لا يوجد —</option>');
  document.getElementById('edp-debt').innerHTML=DB.debts.map(d=>`<option value="${d.id}" ${d.id===debtId?'selected':''}>${escapeHtml(d.name)} | متبقي: ${fmt(d.remaining)}</option>`).join('');
  document.getElementById('edp-date').value=today();document.getElementById('edp-amount').value='';document.getElementById('edp-notes').value='';
  openModal('modal-debt-pay');
}

// ═══ DIVIDENDS ═══
function renderDividends(){
  const total=DB.dividends.reduce((a,d)=>a+N2(d.amount),0);
  const bySymbol={};DB.dividends.forEach(d=>{if(!bySymbol[d.symbol])bySymbol[d.symbol]=0;bySymbol[d.symbol]+=N2(d.amount)});
  const top=Object.entries(bySymbol).sort((a,b)=>b[1]-a[1])[0];
  document.getElementById('div-kpis').innerHTML=
    kpi('إجمالي التوزيعات',fmt(total),'','var(--purple)',svgIcon('<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>'),null)+
    kpi('عدد التوزيعات',DB.dividends.length,'','var(--blue)',svgIcon('<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>'),null)+
    (top?kpi('أعلى مصدر',fmt(top[1]),top[0],'var(--green)',svgIcon('<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/>'),null):'');
  document.getElementById('div-tbody').innerHTML=DB.dividends.length?DB.dividends.map(d=>`<tr>
    <td>${d.date}</td><td class="td-sym">${escapeHtml(d.symbol)}</td>
    <td style="color:var(--green);font-weight:700">${fmt(d.amount)}</td>
    <td class="muted">${d.bank_id?bankColorDot(d.bank_id)+escapeHtml(DB.banks.find(b=>b.id===d.bank_id)?.name||'—'):'—'}</td>
    <td class="muted">${escapeHtml(d.notes||'—')}</td>
    <td class="td-actions">
      <button class="btn-icon edit" onclick="editDividend(${d.id})"><svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
      <button class="btn-icon danger" onclick="deleteDividend(${d.id})"><svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg></button>
    </td>
  </tr>`).join(''):`<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--muted)">لا توجد توزيعات</td></tr>`;
}
function setRecurringFilter(v){UI.recurringFilter=v;renderRecurring();}
function renderRecurring(){
  const freqLabel={monthly:'شهري',weekly:'أسبوعي',yearly:'سنوي'};
  const freqMonthlyFactor={monthly:1,weekly:4.345,yearly:1/12};
  const typeIcons={
    'إيداع':'<path d="M12 5v14M5 12l7 7 7-7"/>',
    'سحب':'<path d="M12 19V5M5 12l7-7 7 7"/>'
  };
  const now=today();
  const items=DB.recurring.map(r=>{
    const next=nextRecDate(r);
    const daysUntil=Math.ceil((new Date(next)-new Date(now))/86400000);
    const isDue=next<=now;
    return{...r,next,daysUntil,isDue};
  });
  const activeCount=items.length;
  const dueCount=items.filter(i=>i.isDue).length;
  const monthlyTotal=items.filter(i=>i.type==='إيداع').reduce((a,i)=>a+N2(i.amount)*(freqMonthlyFactor[i.freq]||1),0)
    -items.filter(i=>i.type==='سحب').reduce((a,i)=>a+N2(i.amount)*(freqMonthlyFactor[i.freq]||1),0);
  document.getElementById('recurring-kpis').innerHTML=
    kpi('عمليات نشطة',activeCount,'إجمالي العمليات المتكررة المسجلة','var(--teal)',svgIcon('<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/>'),null)+
    kpi('مستحق الآن',dueCount,dueCount>0?'يحتاج تطبيق':'كل شيء محدَّث','var(--gold)',svgIcon('<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>'),null)+
    kpi('الأثر الشهري الصافي',fmt(monthlyTotal),'بعد تسوية الإيداعات والسحوبات على أساس شهري',monthlyTotal>=0?'var(--green)':'var(--red)',svgIcon('<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>'),null);
  const filterDefs=[
    {key:'ALL',label:'الكل',count:items.length},
    {key:'DUE',label:'مستحق الآن',count:dueCount},
    {key:'إيداع',label:'إيداعات',count:items.filter(i=>i.type==='إيداع').length},
    {key:'سحب',label:'سحوبات',count:items.filter(i=>i.type==='سحب').length},
  ];
  document.getElementById('recurring-filter-tabs').innerHTML=filterDefs.map(f=>`<div class="tab ${UI.recurringFilter===f.key?'active':''}" onclick="setRecurringFilter('${f.key}')">${escapeHtml(f.label)} (${f.count})</div>`).join('');
  let filtered=items;
  if(UI.recurringFilter==='DUE')filtered=items.filter(i=>i.isDue);
  else if(UI.recurringFilter==='إيداع'||UI.recurringFilter==='سحب')filtered=items.filter(i=>i.type===UI.recurringFilter);
  filtered.sort((a,b)=>a.next<b.next?-1:1);
  if(!filtered.length){
    document.getElementById('recurring-cards').innerHTML=`<div class="empty-state" style="padding:48px;text-align:center;color:var(--muted);grid-column:1/-1"><p>لا توجد عمليات متكررة${UI.recurringFilter!=='ALL'?' في هذا التصنيف':''}</p></div>`;
    return;
  }
  document.getElementById('recurring-cards').innerHTML=filtered.map(r=>{
    const isIn=r.type==='إيداع';
    const bank=DB.banks.find(b=>b.id===r.bank_id);
    const statusBadge=r.isDue
      ?`<span class="badge" style="background:var(--green-l);color:var(--green);font-weight:800">مستحق الآن</span>`
      :r.daysUntil<=3?`<span class="badge" style="background:var(--gold-l);color:var(--gold);font-weight:800">خلال ${r.daysUntil} يوم</span>`
      :`<span class="badge badge-gray">بعد ${r.daysUntil} يوم</span>`;
    return`<div class="info-card">
      <div class="info-card-strip" style="background:${isIn?'var(--green)':'var(--red)'}"></div>
      <div class="info-card-body">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
          <div style="display:flex;align-items:center;gap:8px;min-width:0">
            <span style="width:34px;height:34px;border-radius:9px;background:${isIn?'var(--green-l)':'var(--red-l)'};color:${isIn?'var(--green)':'var(--red)'};display:flex;align-items:center;justify-content:center;flex-shrink:0"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${typeIcons[r.type]||''}</svg></span>
            <div style="min-width:0">
              <div style="font-weight:800;font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(r.name)}</div>
              <div style="font-size:10.5px;color:var(--muted)">${freqLabel[r.freq]||r.freq}</div>
            </div>
          </div>
          ${statusBadge}
        </div>
        <div style="font-size:20px;font-weight:900;color:${isIn?'var(--green)':'var(--red)'}">${isIn?'+':'-'}${fmt(r.amount)}</div>
        <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--muted)"><span>${bank?bankColorDot(bank.id)+escapeHtml(bank.name):'— بدون حساب —'}</span><span>القادم: ${r.next}</span></div>
        ${r.last_applied?`<div style="font-size:10px;color:var(--muted)">آخر تطبيق: ${r.last_applied}</div>`:`<div style="font-size:10px;color:var(--muted)">لم يُطبَّق بعد</div>`}
      </div>
      <div class="info-card-footer">
        <button class="btn btn-xs ${r.isDue?'btn-success':'btn-outline'}" onclick="applyRecurring(${r.id})" ${!r.isDue?'disabled':''}>تطبيق</button>
        <button class="btn-icon edit" onclick="editRecurring(${r.id})"><svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
        <button class="btn-icon danger" onclick="deleteRecurring(${r.id})"><svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg></button>
      </div>
    </div>`;
  }).join('');
}
function renderGoals(){
  const T=calcTotals();
  if(!DB.goals.length){document.getElementById('goals-list').innerHTML=`<div class="empty-state" style="padding:48px;text-align:center;color:var(--muted)"><p>لا توجد أهداف مالية. أضف هدفاً جديداً</p></div>`;return}
  document.getElementById('goals-list').innerHTML=DB.goals.map(g=>{
    let cur=T.grand;
    if(g.category==='banks')cur=T.totalBanks;else if(g.category==='stocks')cur=T.stocksVal;else if(g.category==='metals')cur=T.metalsVal;else if(g.category==='certs')cur=T.certsTotal;
    const p=Math.min(pctN(cur,g.target),100),rem=Math.max(0,N2(g.target)-cur);
    const goalColor=p>=100?'var(--green)':p>=70?'var(--teal)':'var(--purple)';
    return`<div class="goal-card" style="border-top:3px solid ${goalColor};padding-top:13px">
      <div class="goal-header">
        <div><div class="goal-name">${escapeHtml(g.name)}</div><div class="goal-meta">${g.category==='all'?'كل المحفظة':g.category==='banks'?'البنوك':g.category==='stocks'?'الأسهم':g.category==='metals'?'المعادن':'الشهادات'}</div></div>
        <div style="text-align:left"><div class="goal-pct">${p.toFixed(1)}%</div><div class="goal-stats">${fmt(cur)} / ${fmt(g.target)}</div></div>
      </div>
      <div class="prog-wrap lg" style="margin-bottom:8px"><div class="prog-bar" style="width:${p}%;background:${goalColor}"></div></div>
      <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--muted)">
        <span>${p<100?'متبقي '+fmt(rem):'✓ تم تحقيق الهدف!'}</span>
        <div style="display:flex;gap:4px">
          <button class="btn-icon edit" onclick="editGoal(${g.id})"><svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
          <button class="btn-icon danger" onclick="deleteGoal(${g.id})"><svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg></button>
        </div>
      </div>
    </div>`;
  }).join('');
}
function renderPrices(){
  const h=getHoldings();
  const heldSyms=Object.keys(h);
  const orphanSyms=DB.stockPrices.map(p=>p.symbol).filter(s=>!h[s]);
  const rowHtml=(sym,isHeld)=>{
    const p=DB.stockPrices.find(x=>x.symbol===sym);
    return`<div class="price-item">
      <div>
        <div class="price-item-label">${escapeHtml(sym)}${!isHeld?` <span style="font-size:9.5px;color:var(--red);font-weight:700;background:var(--red-l);padding:1px 5px;border-radius:4px">مُباع بالكامل</span>`:''}</div>
        <div class="price-item-sub">${escapeHtml(p?.name||h[sym]?.name||'')} ${!isHeld?'— <button class="btn btn-xs btn-danger" onclick="removeOrphanStock(\''+sym+'\')">حذف</button>':''}</div>
      </div>
      <input class="price-input" type="number" step="0.01" id="sp-${sym}" value="${p?.current_price||''}" placeholder="0.00">
    </div>`;
  };
  document.getElementById('stock-prices-list').innerHTML=
    (heldSyms.length?heldSyms.map(s=>rowHtml(s,true)).join(''):`<div style="color:var(--muted);font-size:12px;padding:12px">لا توجد أسهم مملوكة حالياً</div>`)
    +(orphanSyms.length?`<details style="margin-top:10px"><summary style="cursor:pointer;font-size:11px;color:var(--muted);font-weight:700;padding:6px 0">أسعار قديمة لأسهم مُباعة (${orphanSyms.length})</summary>${orphanSyms.map(s=>rowHtml(s,false)).join('')}</details>`:'');
  const mh=getMetalHoldings();
  const heldTypes=new Set(Object.values(mh).filter(v=>v.weight>0.001).map(v=>v.metal_type.split('|')[0].trim()));
  const allDbTypes=new Set(DB.metalPrices.map(p=>p.metal_type));
  DB.metalTxns.forEach(t=>{if(t.metal_type)allDbTypes.add(t.metal_type.split('|')[0].trim())});
  const orphanTypes=[...allDbTypes].filter(t=>!heldTypes.has(t)).sort();
  const heldTypeList=[...heldTypes].sort();
  const metalRowHtml=(type,isHeld)=>{
    const p=DB.metalPrices.find(x=>x.metal_type===type);
    const holdingsCount=Object.values(mh).filter(v=>v.metal_type.split('|')[0].trim()===type&&v.weight>0.001).length;
    return`<div class="price-item">
      <div>
        <div class="price-item-label" style="color:${isHeld?'var(--gold)':'var(--muted)'}">${escapeHtml(type)}${!isHeld?` <span style="font-size:9.5px;color:var(--red);font-weight:700;background:var(--red-l);padding:1px 5px;border-radius:4px">مُباع</span>`:''}</div>
        <div class="price-item-sub">${holdingsCount>0?holdingsCount+' حيازة نشطة':''}${p?.updated_at?' | '+new Date(p.updated_at).toLocaleDateString('ar-EG'):''}</div>
      </div>
      <input class="price-input" type="number" step="0.01" id="mp-${encodeID(type)}" value="${p?.price_per_gram||''}" placeholder="ج.م/جرام">
    </div>`;
  };
  document.getElementById('metal-prices-list').innerHTML=
    (heldTypeList.length?heldTypeList.map(t=>metalRowHtml(t,true)).join(''):`<div style="color:var(--muted);font-size:12px;padding:12px">لا توجد معادن مملوكة حالياً</div>`)
    +(orphanTypes.length?`<details style="margin-top:10px"><summary style="cursor:pointer;font-size:11px;color:var(--muted);font-weight:700;padding:6px 0">أسعار قديمة (${orphanTypes.length})</summary>${orphanTypes.map(t=>metalRowHtml(t,false)).join('')}</details>`:'');
  const currencies=[...new Set(DB.banks.map(b=>b.currency||'EGP').filter(c=>c!=='EGP'))];
  const lastFx=localStorage.getItem('lastFxFetchDate');
  const fxStatusHtml=`<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;padding:10px 2px;margin-bottom:6px;border-bottom:.5px solid var(--border)">
    <div style="font-size:11px;color:var(--muted)">${lastFx===today()?'✓ تم التحديث التلقائي اليوم ('+lastFx+')':lastFx?'آخر تحديث تلقائي: '+lastFx:'لم يتم التحديث التلقائي بعد'}</div>
    <button class="btn btn-xs btn-teal" onclick="autoFetchExchangeRates(true)" id="fx-fetch-btn">جلب الأسعار الآن</button>
  </div>`;
  document.getElementById('exchange-rates-list').innerHTML=currencies.length?
    fxStatusHtml+currencies.map(cur=>{const r=DB.exchangeRates.find(x=>x.currency===cur);return`<div class="price-item"><div><div class="price-item-label">${escapeHtml(cur)} → EGP</div><div class="price-item-sub">آخر تحديث: ${r?.updated_at?new Date(r.updated_at).toLocaleDateString('ar-EG'):'—'}</div></div><div style="display:flex;gap:6px;align-items:center"><input class="price-input" type="number" step="0.0001" id="exr-${cur}" value="${r?.rate||''}" placeholder="مثال: 49.5"><button class="btn btn-xs btn-teal" onclick="saveExchangeRate('${cur}')">حفظ يدوي</button></div></div>`}).join(''):`<div style="color:var(--muted);font-size:12px;padding:12px">لا توجد حسابات بعملات أجنبية</div>`;
}
async function removeOrphanStock(sym){
  if(!confirm(`حذف سعر ${sym}؟`))return;
  try{await api('stock_prices?symbol=eq.'+encodeURIComponent(sym),'DELETE');toast('تم الحذف');await loadAll()}catch(e){toast('خطأ: '+e.message,false)}
}

// ═══ REPORTS ═══
function renderReports(){
  const{pStart,pEnd}=getReportPeriodBounds();
  const PT=calcTotalsForPeriod(pStart,pEnd);
  const{h,mh,grand,totalBanks,stocksVal,stocksCost,metalsVal,metalsCost,certsTotal,certsPaid,divTotal,pnlStocks,pnlMetals,totalPnl,debtsOwed,debtsOwing,realizedStockPnl,cashIn,cashOut}=PT;
  const invested=stocksCost+metalsCost+certsTotal;
  const roi=invested>0?totalPnl/invested*100:0;
  const retS=stocksCost>0?pnlStocks/stocksCost*100:0;
  const retM=metalsCost>0?pnlMetals/metalsCost*100:0;
  const periodLabel=pStart+' — '+pEnd;
  const lu=document.getElementById('r-last-update');
  if(lu)lu.textContent=new Date().toLocaleString('ar-EG')+' | الفترة: '+periodLabel;
  document.getElementById('report-kpis').innerHTML=
    kpi('إجمالي المحفظة',fmt(grand),'القيمة السوقية الحالية','var(--blue)',svgIcon('<path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>'),roi)+
    kpi('رأس المال المستثمر',fmt(invested+totalBanks),'إجمالي ما تم ضخه','var(--muted)',svgIcon('<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>'),null)+
    kpi('العائد الصافي',fmt(totalPnl),(roi>=0?'+':'')+roi.toFixed(2)+'% ROI',totalPnl>=0?'var(--green)':'var(--red)',svgIcon('<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/>'),roi)+
    kpi('دخل الفترة',fmt(certsPaid+divTotal+realizedStockPnl),'عوائد + توزيعات + مبيعات','var(--teal)',svgIcon('<polyline points="20 6 9 17 4 12"/>'),null)+
    (debtsOwed>0?kpi('صافي الثروة',fmt(grand-debtsOwed),'المحفظة ناقص الالتزامات',grand-debtsOwed>=0?'var(--green)':'var(--red)',svgIcon('<path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78"/>'),null):'');
  const catEl=document.getElementById('r-category-cards');
  if(catEl)catEl.innerHTML=[
    {l:'البنوك',v:totalBanks,p:grand?totalBanks/grand*100:0,sub:DB.banks.filter(b=>b.is_active!==false).length+' حساب',c:'var(--teal)',pnl:null},
    {l:'الأسهم',v:stocksVal,p:grand?stocksVal/grand*100:0,sub:(retS>=0?'+':'')+retS.toFixed(1)+'% عائد',c:retS>=0?'var(--green)':'var(--red)',pnl:pnlStocks},
    {l:'المعادن',v:metalsVal,p:grand?metalsVal/grand*100:0,sub:(retM>=0?'+':'')+retM.toFixed(1)+'% عائد',c:retM>=0?'var(--gold)':'var(--red)',pnl:pnlMetals},
    {l:'الشهادات',v:certsTotal,p:grand?certsTotal/grand*100:0,sub:'مُصرَّف: '+fmt(certsPaid),c:'var(--purple)',pnl:certsPaid>0?certsPaid:null},
  ].map(c=>`<div class="card" style="border-right:3px solid ${c.c};margin-bottom:0"><div class="card-body" style="padding:14px">
    <div style="font-size:10px;color:var(--muted);font-weight:800;letter-spacing:.5px;margin-bottom:6px">${c.l}</div>
    <div style="font-size:20px;font-weight:900;color:${c.c};margin-bottom:4px">${fmt(c.v)}</div>
    <div style="display:flex;justify-content:space-between;margin-bottom:6px"><span style="font-size:11px;color:var(--muted)">${c.sub}</span><span style="font-size:13px;font-weight:900;color:${c.c}">${c.p.toFixed(1)}%</span></div>
    <div class="prog-wrap"><div class="prog-bar" style="width:${Math.min(c.p,100)}%;background:${c.c}"></div></div>
    ${c.pnl!=null?`<div style="font-size:11px;margin-top:6px;font-weight:700;color:${c.pnl>=0?'var(--green)':'var(--red)'}">${c.pnl>=0?'ربح':'خسارة'}: ${fmt(Math.abs(c.pnl))}</div>`:''}
  </div></div>`).join('');
  const stEl=document.getElementById('r-stocks-alloc');
  if(stEl)stEl.innerHTML=Object.entries(h).length?Object.entries(h).map(([s,v],i)=>{
    const cp=getStockPrice(s)||v.avgPrice,cv=v.qty*cp,p=stocksVal?cv/stocksVal*100:0,pnl=cv-v.totalCost;
    return`<div class="alloc-row"><div class="alloc-dot" style="background:${PALETTE[i%PALETTE.length]}"></div><div class="alloc-label">${escapeHtml(s)} — ${escapeHtml(v.name)}</div><div class="alloc-prog"><div class="prog-wrap"><div class="prog-bar" style="width:${Math.min(p,100)}%;background:${PALETTE[i%PALETTE.length]}"></div></div></div><div class="alloc-pct">${p.toFixed(1)}%</div><div class="alloc-val ${pnl>=0?'pos':'neg'}">${pnl>=0?'+':''}${fmtK(pnl)}</div></div>`;
  }).join(''):`<div style="color:var(--muted);font-size:12px;padding:12px">لا توجد أسهم في هذه الفترة</div>`;
  const mtEl=document.getElementById('r-metals-alloc');
  if(mtEl)mtEl.innerHTML=Object.entries(mh).length?Object.entries(mh).map(([t,v],i)=>{
    const bt=v.metal_type||t.split('|')[0];const cp=getMetalPrice(bt)||v.avgPrice,cv=v.weight*cp,p=metalsVal?cv/metalsVal*100:0,pnl=cv-v.totalCost;
    return`<div class="alloc-row"><div class="alloc-dot" style="background:${['#d97706','#f59e0b','#b45309','#92400e'][i%4]}"></div><div class="alloc-label">${escapeHtml(v.title?bt+' — '+v.title:bt)}</div><div class="alloc-prog"><div class="prog-wrap"><div class="prog-bar" style="width:${Math.min(p,100)}%;background:#d97706"></div></div></div><div class="alloc-pct">${p.toFixed(1)}%</div><div class="alloc-val ${pnl>=0?'pos':'neg'}">${pnl>=0?'+':''}${fmtK(pnl)}</div></div>`;
  }).join(''):`<div style="color:var(--muted);font-size:12px;padding:12px">لا توجد معادن</div>`;
  const debtsEl=document.getElementById('r-debts-section');
  if(debtsEl){
    if(DB.debts.length){
      const now=new Date();
      debtsEl.innerHTML=`<div class="grid-2">
        <div class="card"><div class="card-header"><div class="card-title">جدول الاستحقاق</div></div>
        <div class="card-body no-pad"><div class="table-wrap"><table><thead><tr><th>الدين</th><th>الطرف</th><th style="direction:ltr;text-align:left">المتبقي</th><th>الاستحقاق</th><th>الحالة</th></tr></thead>
        <tbody>${DB.debts.map(d=>{const due=d.due_date?new Date(d.due_date):null;const ov=due&&now>due&&+d.remaining>0;const dl=due?Math.ceil((due-now)/86400000):null;return`<tr class="${ov?'tr-negative':''}"><td style="font-weight:700">${escapeHtml(d.name)}</td><td class="muted">${escapeHtml(d.party||'—')}</td><td class="td-num ${d.type==='دين علي'?'neg':'pos'}" style="direction:ltr;font-weight:800">${d.type==='دين علي'?'-':'+'}${fmt(d.remaining)}</td><td>${d.due_date||'—'}</td><td style="font-size:11px;font-weight:700;color:${ov?'var(--red)':dl&&dl<=30?'var(--gold)':'var(--green)'}">${ov?'متأخر '+Math.abs(dl)+' يوم':dl!==null?dl+' يوم':'—'}</td></tr>`}).join('')}</tbody>
        </table></div></div></div>
        <div class="card"><div class="card-header"><div class="card-title">القدرة على السداد</div></div>
        <div class="card-body">
          <div style="font-size:18px;font-weight:900;margin-bottom:8px;color:${totalBanks>=debtsOwed?'var(--green)':'var(--red)'}">${totalBanks>=debtsOwed?'يمكن السداد':'السيولة غير كافية'}</div>
          <div style="font-size:12px;color:var(--muted);margin-bottom:8px">السيولة: ${fmt(totalBanks)} | الديون: ${fmt(debtsOwed)}</div>
          <div class="prog-wrap" style="height:10px;margin-bottom:10px"><div class="prog-bar" style="width:${Math.min(totalBanks/Math.max(1,debtsOwed)*100,100)}%;background:${totalBanks>=debtsOwed?'var(--green)':'var(--red)'}"></div></div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            <div style="padding:10px;background:var(--red-l);border-radius:8px;text-align:center"><div style="font-weight:800;color:var(--red);font-size:16px">${fmt(debtsOwed)}</div><div style="color:var(--muted);font-size:11px">ديون عليّ</div></div>
            <div style="padding:10px;background:var(--green-l);border-radius:8px;text-align:center"><div style="font-weight:800;color:var(--green);font-size:16px">${fmt(debtsOwing)}</div><div style="color:var(--muted);font-size:11px">ديون لي</div></div>
          </div>
          <div style="margin-top:8px;padding:8px;background:var(--surface2);border-radius:8px;font-size:11px;text-align:center">نسبة الدين للمحفظة: <strong style="color:${debtsOwed/Math.max(1,grand)>0.3?'var(--red)':'var(--green)'}">${(debtsOwed/Math.max(1,grand)*100).toFixed(1)}%</strong></div>
        </div></div>
      </div>`;
    } else debtsEl.innerHTML='';
  }
  let fs='';
  fs+=`<tr class="tr-section"><td colspan="7" style="padding:8px 14px">الحسابات البنكية — ${fmt(totalBanks)}</td></tr>`;
  DB.banks.forEach(b=>{const bv=toEGP(N2(b.balance),b.currency||'EGP');const bc=getBankColor(b.id);fs+=`<tr><td style="padding-right:28px"><span style="display:inline-flex;align-items:center;gap:5px"><span style="width:7px;height:7px;border-radius:50%;background:${bc};display:inline-block"></span>${escapeHtml(b.name)}${b.bank_code?' ('+escapeHtml(b.bank_code)+')':''} <span style="font-size:10px;color:var(--muted)">${b.currency||'EGP'}</span></span></td><td class="td-num" style="direction:ltr">—</td><td class="td-num" style="direction:ltr;font-weight:700">${fmt(bv)}</td><td>—</td><td>—</td><td style="text-align:center">${pct(bv,totalBanks)}</td><td style="text-align:center">${pct(bv,grand)}</td></tr>`;});
  fs+=`<tr class="fs-subtotal"><td>المجموع — بنوك</td><td style="direction:ltr">—</td><td class="td-num" style="direction:ltr;font-weight:900">${fmt(totalBanks)}</td><td>—</td><td>—</td><td style="text-align:center">100%</td><td style="text-align:center;font-weight:800">${pct(totalBanks,grand)}</td></tr>`;
  if(Object.keys(h).length){
    fs+=`<tr class="tr-section"><td colspan="7" style="padding:8px 14px">الأسهم والصناديق — ${(retS>=0?'+':'')+retS.toFixed(2)}%</td></tr>`;
    Object.entries(h).forEach(([sym,v])=>{const cp=getStockPrice(sym)||v.avgPrice,cv=v.qty*cp,pnl=cv-v.totalCost,ret=v.totalCost?pnl/v.totalCost*100:0;fs+=`<tr><td style="padding-right:28px;font-weight:700;color:var(--blue)">${escapeHtml(sym)} — ${escapeHtml(v.name)} <span class="badge ${MARKET_COLORS[v.market||'EGX']||'badge-gray'}" style="font-size:8px">${MARKET_NAMES[v.market||'EGX']||v.market}</span></td><td class="td-num" style="direction:ltr">${fmt(v.totalCost)}</td><td class="td-num" style="direction:ltr;font-weight:700">${fmt(cv)}</td><td class="td-num ${cls(pnl)}" style="direction:ltr">${sign(pnl)}${fmt(pnl)}</td><td class="td-num ${cls(ret)}" style="direction:ltr">${sign(ret)}${ret.toFixed(2)}%</td><td style="text-align:center">${pct(cv,stocksVal)}</td><td style="text-align:center">${pct(cv,grand)}</td></tr>`;});
    fs+=`<tr class="fs-subtotal"><td>المجموع — أسهم</td><td class="td-num" style="direction:ltr">${fmt(stocksCost)}</td><td class="td-num" style="direction:ltr">${fmt(stocksVal)}</td><td class="td-num ${cls(pnlStocks)}" style="direction:ltr">${sign(pnlStocks)}${fmt(pnlStocks)}</td><td class="td-num ${cls(retS)}" style="direction:ltr">${sign(retS)}${retS.toFixed(2)}%</td><td style="text-align:center">100%</td><td style="text-align:center;font-weight:800">${pct(stocksVal,grand)}</td></tr>`;
  }
  if(Object.keys(mh).length){
    const retM2=metalsCost>0?pnlMetals/metalsCost*100:0;
    fs+=`<tr class="tr-section"><td colspan="7" style="padding:8px 14px">المعادن الثمينة — ${(retM2>=0?'+':'')+retM2.toFixed(2)}%</td></tr>`;
    Object.entries(mh).forEach(([t,v])=>{const bt=v.metal_type||t.split('|')[0];const cp=getMetalPrice(bt)||v.avgPrice,cv=v.weight*cp,pnl=cv-v.totalCost,ret=v.totalCost?pnl/v.totalCost*100:0;fs+=`<tr><td style="padding-right:28px;font-weight:700;color:var(--gold)">${escapeHtml(v.title?v.metal_type+' — '+v.title:bt)}</td><td class="td-num" style="direction:ltr">${fmt(v.totalCost)}</td><td class="td-num" style="direction:ltr;font-weight:700">${fmt(cv)}</td><td class="td-num ${cls(pnl)}" style="direction:ltr">${sign(pnl)}${fmt(pnl)}</td><td class="td-num ${cls(ret)}" style="direction:ltr">${sign(ret)}${ret.toFixed(2)}%</td><td style="text-align:center">${pct(cv,metalsVal)}</td><td style="text-align:center">${pct(cv,grand)}</td></tr>`;});
    fs+=`<tr class="fs-subtotal"><td>المجموع — معادن</td><td class="td-num" style="direction:ltr">${fmt(metalsCost)}</td><td class="td-num" style="direction:ltr">${fmt(metalsVal)}</td><td class="td-num ${cls(pnlMetals)}" style="direction:ltr">${sign(pnlMetals)}${fmt(pnlMetals)}</td><td class="td-num ${cls(retM2)}" style="direction:ltr">${sign(retM2)}${retM2.toFixed(2)}%</td><td style="text-align:center">100%</td><td style="text-align:center;font-weight:800">${pct(metalsVal,grand)}</td></tr>`;
  }
  if(DB.certs.length){
    fs+=`<tr class="tr-section"><td colspan="7" style="padding:8px 14px">الشهادات الادخارية — مُصرَّف في الفترة: ${fmt(certsPaid)}</td></tr>`;
    DB.certs.forEach(c=>{const rc=N2(c.amount)>0?N2(c.interest_paid)/N2(c.amount)*100:0;fs+=`<tr><td style="padding-right:28px;font-weight:700;color:var(--purple)">${escapeHtml(c.name)}${c.bank_name?' — '+escapeHtml(c.bank_name):''}</td><td class="td-num" style="direction:ltr">${fmt(c.amount)}</td><td class="td-num" style="direction:ltr;font-weight:700">${fmt(N2(c.amount)+N2(c.interest_paid))}</td><td class="td-num ${N2(c.interest_paid)>0?'pos':''}" style="direction:ltr">${N2(c.interest_paid)>0?'+'+fmt(c.interest_paid):'—'}</td><td class="td-num ${rc>0?'pos':''}" style="direction:ltr">${rc>0?rc.toFixed(2)+'%':'—'}</td><td style="text-align:center">${pct(N2(c.amount),certsTotal)}</td><td style="text-align:center">${pct(N2(c.amount),grand)}</td></tr>`;});
    fs+=`<tr class="fs-subtotal"><td>المجموع — شهادات</td><td class="td-num" style="direction:ltr">${fmt(certsTotal)}</td><td class="td-num" style="direction:ltr">${fmt(certsTotal+certsPaid)}</td><td class="td-num pos" style="direction:ltr">+${fmt(certsPaid)}</td><td>—</td><td style="text-align:center">100%</td><td style="text-align:center;font-weight:800">${pct(certsTotal,grand)}</td></tr>`;
  }
  if(DB.debts.length){
    fs+=`<tr class="tr-section"><td colspan="7" style="padding:8px 14px">الديون والالتزامات</td></tr>`;
    DB.debts.forEach(d=>{const io=d.type==='دين علي';fs+=`<tr><td style="padding-right:28px;font-weight:700;color:${io?'var(--red)':'var(--green)'}">${escapeHtml(d.name)}${d.party?' — '+escapeHtml(d.party):''}</td><td class="td-num" style="direction:ltr">${fmt(d.amount)}</td><td class="td-num ${io?'neg':'pos'}" style="direction:ltr;font-weight:700">${io?'-':'+'}${fmt(d.remaining)}</td><td>—</td><td>—</td><td>—</td><td>—</td></tr>`;});
    fs+=`<tr class="fs-subtotal"><td>صافي الديون</td><td>—</td><td class="td-num ${cls(debtsOwing-debtsOwed)}" style="direction:ltr">${sign(debtsOwing-debtsOwed)}${fmt(Math.abs(debtsOwing-debtsOwed))}</td><td colspan="4"></td></tr>`;
  }
  fs+=`<tr class="fs-grand"><td>صافي الثروة — ${periodLabel}</td><td class="td-num" style="direction:ltr;font-size:13px">${fmt(invested+totalBanks)}</td><td class="td-num" style="direction:ltr;font-size:14px;font-weight:900">${fmt(grand-debtsOwed)}</td><td class="td-num ${cls(totalPnl)}" style="direction:ltr">${sign(totalPnl)}${fmt(totalPnl)}</td><td class="td-num ${cls(roi)}" style="direction:ltr">${sign(roi)}${roi.toFixed(2)}%</td><td colspan="2" style="text-align:center;color:var(--muted);font-size:11px">الفترة: ${periodLabel}</td></tr>`;
  document.getElementById('r-detail-tbody').innerHTML=fs;
  const realizedTotal=divTotal+certsPaid+realizedStockPnl;
  const unrealizedTotal=pnlStocks+pnlMetals;
  const netIncome=realizedTotal+unrealizedTotal;
  const incRow=(label,val,indent=false,bold=false)=>`<tr class="${bold?'fs-subtotal':''}"><td style="${indent?'padding-right:28px':'font-weight:700'}">${label}</td><td class="td-num ${cls(val)}" style="direction:ltr;${bold?'font-weight:800':''}">${sign(val)}${fmt(Math.abs(val))}</td></tr>`;
  let inc='<tr class="tr-section"><td colspan="2" style="padding:8px 14px">الدخل المحقق (Realized)</td></tr>';
  inc+=incRow('توزيعات أرباح الأسهم المستلمة',divTotal,true);
  inc+=incRow('عوائد الشهادات الادخارية المصروفة',certsPaid,true);
  inc+=incRow('أرباح/خسائر محققة من بيع الأسهم',realizedStockPnl,true);
  inc+=incRow('إجمالي الدخل المحقق',realizedTotal,false,true);
  inc+='<tr class="tr-section"><td colspan="2" style="padding:8px 14px">التغير في القيمة السوقية (غير محقق)</td></tr>';
  inc+=incRow('أرباح/خسائر غير محققة — الأسهم',pnlStocks,true);
  inc+=incRow('أرباح/خسائر غير محققة — المعادن',pnlMetals,true);
  inc+=incRow('إجمالي التغير غير المحقق',unrealizedTotal,false,true);
  inc+=`<tr class="fs-grand"><td>صافي الدخل الإجمالي — ${periodLabel}</td><td class="td-num ${cls(netIncome)}" style="direction:ltr;font-size:14px;font-weight:900">${sign(netIncome)}${fmt(Math.abs(netIncome))}</td></tr>`;
  document.getElementById('r-income-tbody').innerHTML=inc;
  const netCashFlow=cashIn-cashOut;
  const bTxnsForCF=DB.bankTxns.filter(t=>t.date>=pStart&&t.date<=pEnd);
  const CREDIT_TYPES=['إيداع','تحويل وارد','رصيد افتتاحي','عائد شهادة','أرباح'];
  const inflowByCat={},outflowByCat={};
  bTxnsForCF.forEach(t=>{
    const bucket=CREDIT_TYPES.includes(t.type)?inflowByCat:outflowByCat;
    bucket[t.type]=(bucket[t.type]||0)+N2(t.amount);
  });
  const catRow=(label,val)=>`<tr><td style="padding-right:28px;color:var(--muted);font-size:12px">${escapeHtml(label)}</td><td class="td-num" style="direction:ltr;font-size:12px">${fmt(val)}</td></tr>`;
  let cf=`<tr class="tr-section" style="background:var(--green-l)"><td colspan="2" style="padding:9px 14px;color:var(--green);font-weight:800">↓ التدفقات الداخلة</td></tr>`;
  cf+=Object.keys(inflowByCat).length?Object.entries(inflowByCat).sort((a,b)=>b[1]-a[1]).map(([t,v])=>catRow(t,v)).join(''):catRow('لا توجد حركات داخلة',0);
  cf+=incRow('إجمالي التدفقات الداخلة',cashIn,false,true);
  cf+=`<tr class="tr-section" style="background:var(--red-l)"><td colspan="2" style="padding:9px 14px;color:var(--red);font-weight:800">↑ التدفقات الخارجة</td></tr>`;
  cf+=Object.keys(outflowByCat).length?Object.entries(outflowByCat).sort((a,b)=>b[1]-a[1]).map(([t,v])=>catRow(t,v)).join(''):catRow('لا توجد حركات خارجة',0);
  cf+=incRow('إجمالي التدفقات الخارجة',-cashOut,false,true);
  cf+=`<tr class="fs-grand"><td>صافي التدفق النقدي — ${periodLabel}</td><td class="td-num ${cls(netCashFlow)}" style="direction:ltr;font-size:14px;font-weight:900">${sign(netCashFlow)}${fmt(Math.abs(netCashFlow))}</td></tr>`;
  cf+=`<tr><td style="color:var(--muted);font-size:11px;padding-top:10px">رصيد البنوك الحالي</td><td class="td-num" style="direction:ltr;color:var(--muted);font-size:11px">${fmt(totalBanks)}</td></tr>`;
  document.getElementById('r-cashflow-tbody').innerHTML=cf;
  if(typeof updateReportCurrencyCard==='function')updateReportCurrencyCard();
  setTimeout(()=>renderReportCharts(PT),60);
}
function renderReportCharts(PT){
  const{h,mh,grand,totalBanks,stocksVal,metalsVal,certsTotal,pnlStocks,pnlMetals,certsPaid,divTotal,realizedStockPnl}=PT;
  const{pStart:rStart,pEnd:rEnd}=getReportPeriodBounds();
  const pd=[{l:'البنوك',v:totalBanks,c:'#1a56db'},{l:'الأسهم',v:stocksVal,c:'#0d9488'},{l:'المعادن',v:metalsVal,c:'#d97706'},{l:'الشهادات',v:certsTotal,c:'#7c3aed'}].filter(d=>d.v>0);
  if(pd.length)mkPie('r-pie',pd.map(d=>d.l),pd.map(d=>d.v),pd.map(d=>d.c));
  const pi=[{l:'أسهم (غير محقق)',v:pnlStocks},{l:'معادن (غير محقق)',v:pnlMetals},{l:'أسهم محقق',v:realizedStockPnl},{l:'شهادات مُصرَّفة',v:certsPaid},{l:'أرباح موزعة',v:divTotal}].filter(x=>Math.abs(x.v)>0.01);
  if(pi.length)mkBar('r-pnl',pi.map(x=>x.l),[{label:'ر/خ',data:pi.map(x=>x.v),backgroundColor:pi.map(x=>x.v>=0?'rgba(13,148,136,.85)':'rgba(225,29,72,.85)'),borderRadius:8,borderSkipped:false}]);
  const snaps=DB.snapshots.filter(s=>s.snapshot_date>=rStart&&s.snapshot_date<=rEnd);
  if(snaps.length>1)mkLine('r-line',snaps.map(s=>{const d=new Date(s.snapshot_date);return d.toLocaleDateString('ar-EG',{month:'short',day:'numeric'})}),[
    {label:'الإجمالي',data:snaps.map(s=>N2(s.grand_total)),borderColor:'#1a56db',backgroundColor:'rgba(26,86,219,.08)',fill:true,tension:.4,pointRadius:snaps.length<40?2:0,borderWidth:2},
    {label:'البنوك',data:snaps.map(s=>N2(s.total_banks)),borderColor:'#0891b2',fill:false,tension:.4,pointRadius:0,borderWidth:1.5,borderDash:[4,4]},
    {label:'الأسهم',data:snaps.map(s=>N2(s.total_stocks)),borderColor:'#0d9488',fill:false,tension:.4,pointRadius:0,borderWidth:1.5,borderDash:[4,4]},
  ]);
  if(Object.keys(h).length){
    const ent=Object.entries(h);
    const sv=ent.map(([s,v])=>{const cp=getStockPrice(s)||v.avgPrice;return+(v.qty*cp-v.totalCost).toFixed(2)});
    if(sv.some(v=>Math.abs(v)>0.01))mkBar('r-stocks-pnl',ent.map(([s])=>s),[{label:'ر/خ',data:sv,backgroundColor:sv.map(v=>v>=0?'#0d9488':'#e11d48'),borderRadius:6}]);
  }
  if(Object.keys(mh).length){
    const me=Object.entries(mh);
    const mv=me.map(([t,v])=>{const bt=v.metal_type||t.split('|')[0];const cp=getMetalPrice(bt)||v.avgPrice;return+(v.weight*cp-v.totalCost).toFixed(2)});
    if(mv.some(v=>Math.abs(v)>0.01))mkBar('r-metals-pnl',me.map(([t,v])=>v.title?v.metal_type+'—'+v.title:v.metal_type||t.split('|')[0]),[{label:'ر/خ',data:mv,backgroundColor:mv.map(v=>v>=0?'#d97706':'#e11d48'),borderRadius:6}]);
  }
  if(DB.certs.length){
    const sorted=[...DB.certs].sort((a,b)=>a.maturity_date>b.maturity_date?1:-1);
    destroyChart('r-certs');const cv=document.getElementById('r-certs');
    if(cv)CHARTS['r-certs']=new Chart(cv,{type:'bar',data:{labels:sorted.map(c=>c.name),datasets:[{label:'الأصل',data:sorted.map(c=>N2(c.amount)),backgroundColor:'#7c3aed',borderRadius:4,stack:'s'},{label:'مُصرَّف',data:sorted.map(c=>N2(c.interest_paid)),backgroundColor:'#0d9488',borderRadius:4,stack:'s'},{label:'متبقي',data:sorted.map(c=>Math.max(0,N2(c.total_interest)-N2(c.interest_paid))),backgroundColor:'rgba(124,58,237,.25)',borderRadius:4,stack:'s'}]},options:{indexAxis:'y',responsive:true,maintainAspectRatio:true,plugins:{legend:{labels:{color:tc(),font:{family:'Cairo',size:11}}}},scales:{x:{stacked:true,grid:{color:gc()},ticks:{color:tc(),font:{family:'Cairo',size:10},callback:v=>Math.abs(v)>=1e6?(v/1e6).toFixed(1)+'M':Math.abs(v)>=1e3?(v/1e3).toFixed(0)+'K':v}},y:{stacked:true,grid:{display:false},ticks:{color:tc(),font:{family:'Cairo',size:10}}}}}});
  }
  const bd=DB.banks.filter(b=>b.is_active!==false&&toEGP(N2(b.balance),b.currency||'EGP')>0);
  if(bd.length)mkPie('r-banks',bd.map(b=>b.name),bd.map(b=>toEGP(N2(b.balance),b.currency||'EGP')),bd.map(b=>getBankColor(b.id)));
  const months=[],deps=[],withs=[];
  const ep=UI.globalPeriod||'1y';
  let dateList=[];
  if(ep==='custom'&&UI.customFrom&&UI.customTo){
    const s=new Date(UI.customFrom),e=new Date(UI.customTo);
    const c=new Date(s.getFullYear(),s.getMonth(),1);
    while(c<=e){dateList.push(new Date(c));c.setMonth(c.getMonth()+1);}
  }else{
    const mb=ep==='3m'?3:ep==='6m'?6:ep==='1y'?12:ep==='2y'?24:ep==='5y'?60:120;
    for(let j=mb-1;j>=0;j--){const d=new Date();d.setMonth(d.getMonth()-j);if(d.toISOString().slice(0,7)>=rStart.slice(0,7))dateList.push(new Date(d));}
  }
  const CREDIT=['إيداع','تحويل وارد','عائد شهادة','أرباح'];
  dateList.forEach(d=>{
    const ym=d.getFullYear()+'-'+(d.getMonth()+1).toString().padStart(2,'0');
    months.push(new Intl.DateTimeFormat('ar-EG',{month:'short',year:'2-digit'}).format(d));
    const mt=DB.bankTxns.filter(t=>t.date&&t.date.startsWith(ym));
    deps.push(mt.filter(t=>CREDIT.includes(t.type)).reduce((a,t)=>a+N2(t.amount),0));
    withs.push(mt.filter(t=>!CREDIT.includes(t.type)).reduce((a,t)=>a+N2(t.amount),0));
  });
  if(months.length)mkBar('r-activity',months,[{label:'واردات',data:deps,backgroundColor:'rgba(13,148,136,.85)',borderRadius:6,borderSkipped:false},{label:'صادرات',data:withs,backgroundColor:'rgba(225,29,72,.85)',borderRadius:6,borderSkipped:false}]);
}

// ═══ PDF / DARK / BACKUP / TOAST ═══
async function exportPDF(){
  try{
    renderReports();
    const T=calcTotals();
    const {pStart,pEnd}=getReportPeriodBounds();
    const title=(APP_SETTINGS.exchange_name||'تقرير المحفظة المالية');
    const cur=baseCur();
    const table=(head,rows)=>`<table><thead><tr>${head.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows||`<tr><td colspan="${head.length}" class="c">لا توجد بيانات</td></tr>`}</tbody></table>`;
    const sec=(t,inner)=>`<section><h2>${t}</h2>${inner}</section>`;
    const kv=(k,v,cls='')=>`<tr><td>${k}</td><td class="n ${cls}">${v}</td></tr>`;
    const summary=table(['البند','القيمة ('+cur+')'],
      kv('إجمالي الثروة',fmt(T.grand),'b')+kv('الحسابات البنكية والنقد',fmt(T.totalBanks))+kv('الأسهم والصناديق',fmt(T.stocksVal))+
      kv('المعادن الثمينة',fmt(T.metalsVal))+kv('الشهادات الادخارية',fmt(T.certsTotal))+
      kv('ديون لك',fmt(T.debtsOwing))+kv('ديون عليك',fmt(-T.debtsOwed),'neg'));
    const banks=table(['الحساب','النوع','العملة','الرصيد','المقابل ('+cur+')'],
      DB.banks.filter(b=>b.is_active!==false).map(b=>`<tr><td>${escapeHtml(b.name)}</td><td>${b.type}</td><td>${b.currency||baseCur()}</td><td class="n">${fmtN(b.balance)}</td><td class="n">${fmt(toEGP(N2(b.balance),b.currency||'EGP'))}</td></tr>`).join(''));
    const h=getHoldings();
    const stocks=table(['الكود','الاسم','الكمية','متوسط التكلفة','السعر الحالي','القيمة','ر/خ'],
      Object.entries(h).map(([s,v])=>{const cp=getStockPrice(s)||v.avgPrice,cv=v.qty*cp,pl=cv-v.totalCost;
        return`<tr><td>${escapeHtml(s)}</td><td>${escapeHtml(v.name)}</td><td class="n">${fmtN(v.qty,4)}</td><td class="n">${fmtN(v.avgPrice,4)}</td><td class="n">${fmtN(cp,4)}</td><td class="n">${fmt(cv)}</td><td class="n ${pl>=0?'pos':'neg'}">${pl>=0?'+':''}${fmt(pl)}</td></tr>`;}).join(''));
    const mh=getMetalHoldings();
    const metals=table(['النوع','العنوان','الوزن (جم)','متوسط/جم','السعر الحالي/جم','القيمة','ر/خ'],
      Object.entries(mh).filter(([,v])=>v.weight>0.001).map(([k,v])=>{const bt=(v.metal_type||k.split('|')[0]).trim(),cp=getMetalPrice(bt)||v.avgPrice,cv=v.weight*cp,pl=cv-v.totalCost;
        return`<tr><td>${escapeHtml(bt)}</td><td>${escapeHtml(v.title||'—')}</td><td class="n">${fmtN(v.weight,3)}</td><td class="n">${fmtN(v.avgPrice)}</td><td class="n">${fmtN(cp)}</td><td class="n">${fmt(cv)}</td><td class="n ${pl>=0?'pos':'neg'}">${pl>=0?'+':''}${fmt(pl)}</td></tr>`;}).join(''));
    const certs=table(['الشهادة','البنك','المبلغ','الفائدة %','الإصدار','الاستحقاق','عائد مُصرف','إجمالي الفائدة'],
      DB.certs.map(c=>`<tr><td>${escapeHtml(c.name)}</td><td>${escapeHtml(c.bank_name||'—')}</td><td class="n">${fmt(c.amount)}</td><td class="n">${c.rate}%</td><td>${c.issued_date}</td><td>${c.maturity_date}</td><td class="n">${fmt(c.interest_paid)}</td><td class="n">${fmt(c.total_interest)}</td></tr>`).join(''));
    const detail=`<table><thead><tr><th>البند</th><th>التكلفة</th><th>القيمة الحالية</th><th>ر/خ</th><th>عائد %</th><th>من الفئة</th><th>من المحفظة</th></tr></thead><tbody>${document.getElementById('r-detail-tbody').innerHTML}</tbody></table>`;
    const income=`<table><tbody>${document.getElementById('r-income-tbody').innerHTML}</tbody></table>`;
    const cashflow=`<table><tbody>${document.getElementById('r-cashflow-tbody').innerHTML}</tbody></table>`;
    const css=`@page{size:A4;margin:14mm 12mm}*{box-sizing:border-box}body{font-family:'Segoe UI',Tahoma,'Noto Naskh Arabic',Arial,sans-serif;color:#111827;direction:rtl;font-size:11px;line-height:1.55;margin:0}header{border-bottom:3px solid #1a56db;padding-bottom:10px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:flex-end}header h1{margin:0;font-size:22px;color:#1a56db}header .meta{font-size:10.5px;color:#4b5563;text-align:left;direction:ltr}section{margin-bottom:16px;break-inside:auto}h2{font-size:13.5px;margin:0 0 6px;padding:5px 10px;background:#eff6ff;border-right:4px solid #1a56db;color:#1e3a8a;break-after:avoid}table{width:100%;border-collapse:collapse;font-size:10.5px}th{background:#f3f4f6;text-align:right;padding:5px 7px;border:1px solid #d1d5db;font-weight:800}td{padding:4px 7px;border:1px solid #e5e7eb;vertical-align:top}tr{break-inside:avoid}.n,.td-num{text-align:left;direction:ltr;white-space:nowrap}.c{text-align:center;color:#6b7280}.b{font-weight:900}.pos{color:#15803d}.neg{color:#b91c1c}.tr-section td,.tr-section{background:#f9fafb;font-weight:800}.fs-grand td{background:#eff6ff;font-weight:900;border-top:2px solid #1a56db}.fs-subtotal td{font-weight:800;background:#f9fafb}footer{margin-top:10px;padding-top:6px;border-top:1px solid #d1d5db;font-size:9.5px;color:#6b7280;text-align:center}`;
    const doc=`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${escapeHtml(title)} — ${today()}</title><style>${css}</style></head><body>
      <header><div><h1>${escapeHtml(title)}</h1><div style="color:#4b5563">تقرير مالي شامل — العملة الأساسية: ${cur}</div></div>
      <div class="meta">Period: ${pStart} → ${pEnd}<br>Generated: ${new Date().toLocaleString('en-GB')}</div></header>
      ${sec('١. ملخص المحفظة',summary)}
      ${sec('٢. الحسابات البنكية',banks)}
      ${sec('٣. القائمة المالية التفصيلية',detail)}
      ${sec('٤. قائمة الدخل',income)}
      ${sec('٥. قائمة التدفقات النقدية',cashflow)}
      ${sec('٦. حيازات الأسهم والصناديق',stocks)}
      ${sec('٧. المعادن الثمينة',metals)}
      ${sec('٨. الشهادات الادخارية',certs)}
      <footer>تم إنشاء هذا التقرير آليًا — الأرقام حتى ${today()}</footer>
    </body></html>`;
    const old=document.getElementById('print-frame');if(old)old.remove();
    const fr=document.createElement('iframe');fr.id='print-frame';
    fr.style.cssText='position:fixed;right:-9999px;bottom:0;width:0;height:0;border:0';
    document.body.appendChild(fr);
    fr.contentDocument.open();fr.contentDocument.write(doc);fr.contentDocument.close();
    setTimeout(()=>{fr.contentWindow.focus();fr.contentWindow.print();},400);
    toast('اختر "حفظ كـ PDF" من نافذة الطباعة');
  }catch(e){console.error('exportPDF:',e);toast('خطأ في التصدير: '+e.message,false)}
}
function toggleDark(){
  document.body.classList.toggle('dark');
  const dk=document.body.classList.contains('dark');
  document.querySelectorAll('select,input').forEach(s=>s.style.colorScheme=dk?'dark':'light');
  localStorage.setItem('darkMode',dk?'1':'0');
  const sunPath='<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>';
  const moonPath='<path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>';
  const iconPath=dk?sunPath:moonPath;
  ['dark-icon','topbar-dark-icon'].forEach(id=>{const el=document.getElementById(id);if(el)el.innerHTML=iconPath});
  const dt=document.getElementById('dark-text');if(dt)dt.textContent=dk?'نهاري':'ليلي';
  setTimeout(()=>renderPage(),50);
}
function initDark(){
  const savedDark=localStorage.getItem('darkMode')==='1';
  if(savedDark){
    document.body.classList.add('dark');
    document.querySelectorAll('select,input').forEach(s=>s.style.colorScheme='dark');
    const sunPath='<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>';
    ['dark-icon','topbar-dark-icon'].forEach(id=>{const el=document.getElementById(id);if(el)el.innerHTML=sunPath});
    const dt=document.getElementById('dark-text');if(dt)dt.textContent='نهاري';
  }
  const savedPeriod=localStorage.getItem('globalPeriod')||'1y';
  UI.globalPeriod=savedPeriod;
  const ps=document.getElementById('global-period-select');
  if(ps)ps.value=savedPeriod;
}
async function exportBackup(){
  try{
    const tables=['banks','bank_transactions','stock_transactions','stock_prices','metal_transactions','metal_prices','certificates','dividends','recurring_transactions','financial_goals','exchange_rates','portfolio_snapshots','debts','debt_payments'];
    const data={};for(const t of tables)data[t]=await sbGet(t,'?order=id&limit=100000');
    const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='portfolio_backup_'+today()+'.json';a.click();
    toast('تم تصدير النسخة الاحتياطية ✓');
  }catch(e){toast('خطأ: '+e.message,false)}
}
// ═══ FIXED: importBackup with correct delete/insert order + bulk delete ═══
async function importBackup(input){
  const file=input.files[0];if(!file)return;
  try{
    const text=await file.text(),data=JSON.parse(text);
    if(!confirm('سيتم مسح البيانات الحالية. متابعة؟'))return;
    // 1) Delete children first (order matters for FK)
    const deleteOrder=['financial_goals','recurring_transactions','dividends','debt_payments','debts','certificates','metal_transactions','stock_transactions','bank_transactions','exchange_rates','stock_prices','metal_prices','portfolio_snapshots','banks'];
    for(const table of deleteOrder){
      if(!data[table])continue;
      const ex=await sbGet(table,'?select=id&limit=100000');
      if(ex&&ex.length){
        // Bulk delete in chunks of 500 to avoid URL length limits
        for(let i=0;i<ex.length;i+=500){
          const chunk=ex.slice(i,i+500).map(r=>r.id).join(',');
          try{await api(table+'?id=in.('+chunk+')','DELETE')}catch(e){console.warn('bulk del '+table+':',e.message)}
        }
      }
    }
    // 2) Insert parents first (reverse order)
    const insertOrder=['banks','portfolio_snapshots','metal_prices','stock_prices','exchange_rates','bank_transactions','stock_transactions','metal_transactions','certificates','debts','debt_payments','dividends','recurring_transactions','financial_goals'];
    for(const table of insertOrder){
      if(!data[table]||!data[table].length)continue;
      // Insert in chunks of 200 to keep request size reasonable
      for(let i=0;i<data[table].length;i+=200){
        const chunk=data[table].slice(i,i+200);
        await sbPost(table,chunk);
      }
    }
    toast('تم الاستيراد بنجاح ✓');await loadAll();
  }catch(e){console.error('importBackup:',e);toast('خطأ في الاستيراد: '+e.message,false)}
  input.value='';
}
function toast(msg,ok=true){
  const t=document.getElementById('toast');const icon=document.querySelector('.toast svg');
  document.getElementById('toast-msg').textContent=msg;
  t.className='toast show '+(ok?'ok':'err');
  icon.innerHTML=ok?'<polyline points="20 6 9 17 4 12"/>':'<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>';
  clearTimeout(t._to);t._to=setTimeout(()=>t.classList.remove('show'),3000);
}

// ═══ STOCK HEATMAP ═══
function renderStockHeatmap(h,container){
  if(typeof container==='string')container=document.getElementById(container);
  if(!container)return;
  container.innerHTML='';
  const entries=Object.entries(h);if(!entries.length)return;
  const T=calcTotals();
  const items=entries.map(([sym,v])=>{
    const cp=getStockPrice(sym)||v.avgPrice,curVal=v.qty*cp,pnl=curVal-v.totalCost,ret=v.totalCost?pnl/v.totalCost*100:0;
    return{sym,name:v.name,curVal,ret,pnl,share:T.stocksVal>0?curVal/T.stocksVal*100:0};
  }).sort((a,b)=>b.curVal-a.curVal);
  const getColor=(ret)=>{
    if(ret>15)return{bg:'#065f46',text:'#a7f3d0'};
    if(ret>8) return{bg:'#0d9488',text:'#ccfbf1'};
    if(ret>3) return{bg:'#14b8a6',text:'#f0fdfa'};
    if(ret>0) return{bg:'#2dd4bf',text:'#134e4a'};
    if(ret===0)return{bg:'#64748b',text:'#f1f5f9'};
    if(ret>-3) return{bg:'#f87171',text:'#450a0a'};
    if(ret>-8) return{bg:'#ef4444',text:'#ffe4e6'};
    if(ret>-15)return{bg:'#dc2626',text:'#fee2e2'};
    return          {bg:'#7f1d1d',text:'#fecaca'};
  };
  const card=document.createElement('div');card.className='card';card.style='margin-bottom:16px';
  const totalVal=items.reduce((a,x)=>a+x.curVal,0)||1;
  const BOX_W=760,BOX_H=220;
  function squarify(items,x,y,w,h){
    if(!items.length)return[];
    if(items.length===1){return[{...items[0],x,y,w,h}];}
    const splitH=w>=h;
    const half=Math.floor(items.length/2);
    const firstHalf=items.slice(0,half||1);
    const secondHalf=items.slice(half||1);
    const firstVal=firstHalf.reduce((a,x)=>a+x.curVal,0);
    const ratio=firstVal/totalVal;
    if(splitH){const w1=Math.max(60,w*ratio);return[...squarify(firstHalf,x,y,w1,h),...squarify(secondHalf,x+w1,y,w-w1,h)];}
    else{const h1=Math.max(40,h*ratio);return[...squarify(firstHalf,x,y,w,h1),...squarify(secondHalf,x,y+h1,w,h-h1)];}
  }
  const layout=squarify(items,0,0,BOX_W,BOX_H);
  const cells=layout.map(item=>{
    const c=getColor(item.ret);
    const fs=Math.max(10,Math.min(16,Math.sqrt(item.w*item.h)/7));
    const showRet=item.h>36&&item.w>50;
    const showVal=item.h>54&&item.w>70;
    const leftPct=(item.x/BOX_W*100).toFixed(3),topPct=(item.y/BOX_H*100).toFixed(3);
    const wPct=(Math.max(4,item.w-3)/BOX_W*100).toFixed(3),hPct=(Math.max(4,item.h-3)/BOX_H*100).toFixed(3);
    return`<div title="${escapeHtml(item.name)}" style="position:absolute;left:${leftPct}%;top:${topPct}%;width:${wPct}%;height:${hPct}%;background:${c.bg};border-radius:6px;padding:5px 6px;overflow:hidden;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,.25)">
      <div style="font-weight:900;color:${c.text};font-size:${fs}px;line-height:1.1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;width:100%;text-align:center">${escapeHtml(item.sym)}</div>
      ${showRet?`<div style="font-weight:700;color:${c.text};font-size:${Math.max(9,fs-2)}px;opacity:.92">${item.ret>=0?'+':''}${item.ret.toFixed(1)}%</div>`:''}
      ${showVal?`<div style="color:${c.text};font-size:${Math.max(8,fs-3)}px;opacity:.75">${fmtK(item.curVal)}</div>`:''}
    </div>`;
  }).join('');
  const legend=['خسارة > 15%','خسارة','محايد','ربح','ربح > 15%'].map((label,i)=>{
    const colors=['#7f1d1d','#ef4444','#64748b','#14b8a6','#065f46'];
    return`<span style="display:flex;align-items:center;gap:4px;font-size:10.5px;color:var(--muted)"><span style="width:10px;height:10px;border-radius:2px;background:${colors[i]};flex-shrink:0"></span>${label}</span>`;
  }).join('');
  card.innerHTML=`<div class="card-header">
    <div class="card-title">خريطة حرارة الأسهم <span style="font-size:10px;color:var(--muted);font-weight:400">(الحجم = الحصة | اللون = العائد)</span></div>
    <div style="display:flex;gap:6px;flex-wrap:wrap">${legend}</div>
  </div>
  <div class="card-body" style="padding:10px">
    <div style="position:relative;width:100%;aspect-ratio:${BOX_W}/${BOX_H};overflow:hidden;border-radius:8px">${cells}</div>
  </div>`;
  container.appendChild(card);
}

// ═══ REPORT CURRENCY CARD ═══
function updateReportCurrencyCard(){
  const sel=document.getElementById('r-currency-sel');
  if(!sel)return;
  const toCur=sel.value||'EGP';
  const T=calcTotals();
  const knownCurs=['EGP','USD','EUR','GBP','SAR','AED'];
  const extraCurs=DB.exchangeRates.filter(r=>!knownCurs.includes(r.currency));
  if(extraCurs.length){
    extraCurs.forEach(r=>{
      if(!sel.querySelector(`option[value="${r.currency}"]`)){
        const opt=document.createElement('option');opt.value=r.currency;opt.textContent=r.currency;sel.appendChild(opt);
      }
    });
  }
  const egpToTarget=(egpAmt)=>{
    if(toCur==='EGP')return egpAmt;
    const rate=getRate(toCur);
    return rate>0?egpAmt/rate:egpAmt;
  };
  const fmtCur=(v)=>new Intl.NumberFormat('ar-EG',{minimumFractionDigits:2,maximumFractionDigits:2}).format(v)+' '+toCur;
  const categories=[
    {label:'إجمالي المحفظة',val:T.grand,color:'var(--blue)'},
    {label:'الأرصدة البنكية',val:T.totalBanks,color:'var(--teal)'},
    {label:'الأسهم',val:T.stocksVal,color:'var(--green)'},
    {label:'المعادن',val:T.metalsVal,color:'var(--gold)'},
    {label:'الشهادات',val:T.certsTotal,color:'var(--purple)'},
  ];
  const grid=document.getElementById('r-currency-grid');
  if(!grid)return;
  const rate=toCur==='EGP'?1:getRate(toCur);
  const rateDisplay=toCur!=='EGP'?`<div style="font-size:10px;color:var(--muted);margin-top:8px;padding:6px;background:var(--surface2);border-radius:6px">سعر الصرف: 1 ${toCur} = ${fmtN(rate,4)} ج.م</div>`:'';
  grid.innerHTML=categories.map(c=>{
    const converted=egpToTarget(c.val);
    const pct=c.label!=='إجمالي المحفظة'?T.grand>0?c.val/T.grand*100:0:0;
    return`<div style="padding:14px;border-radius:10px;border:.5px solid var(--border);background:var(--surface2);text-align:center">
      <div style="font-size:10px;color:var(--muted);font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">${c.label}</div>
      <div style="font-size:20px;font-weight:900;color:${c.color};letter-spacing:-.5px">${fmtN(converted,2)}</div>
      <div style="font-size:11px;color:var(--muted);margin-top:2px">${toCur}</div>
      ${c.label!=='إجمالي المحفظة'?`<div style="font-size:10px;color:var(--muted);margin-top:4px">${pct.toFixed(1)}% من المحفظة</div>`:''}
    </div>`;
  }).join('')+rateDisplay;
}

// ═══ INTEGRITY CHECK ═══
async function runIntegrityCheck(){
  let fixed=0;
  const bankTxnIds=new Set(DB.bankTxns.map(t=>t.id));
  const bankIds=new Set(DB.banks.map(b=>b.id));
  const CREDIT=['إيداع','تحويل وارد','رصيد افتتاحي','عائد شهادة','أرباح'];
  for(const t of DB.stockTxns){
    if(t.bank_transaction_id&&!bankTxnIds.has(t.bank_transaction_id)){
      try{await sbPatch('stock_transactions',t.id,{bank_transaction_id:null});fixed++;}catch(e){}
    }
  }
  for(const t of DB.metalTxns){
    if(t.bank_transaction_id&&!bankTxnIds.has(t.bank_transaction_id)){
      try{await sbPatch('metal_transactions',t.id,{bank_transaction_id:null});fixed++;}catch(e){}
    }
  }
  for(const c of DB.certs){
    if(c.bank_transaction_id&&!bankTxnIds.has(c.bank_transaction_id)){
      try{await sbPatch('certificates',c.id,{bank_transaction_id:null});fixed++;}catch(e){}
    }
  }
  for(const t of DB.bankTxns.filter(t=>!bankIds.has(t.bank_id))){
    try{await sbDel('bank_transactions',t.id);fixed++;}catch(e){}
  }
  for(const t of DB.bankTxns){
    if(t.linked_transfer_id&&!bankTxnIds.has(t.linked_transfer_id)){
      try{await sbPatch('bank_transactions',t.id,{linked_transfer_id:null});fixed++;}catch(e){}
    }
  }
  const affectedBanks=new Set(DB.bankTxns.map(t=>t.bank_id));
  for(const bankId of affectedBanks){
    try{
      const txns=DB.bankTxns.filter(t=>t.bank_id===bankId).sort((a,b)=>a.date>b.date?1:a.date<b.date?-1:a.id-b.id);
      let running=0,needsFix=false;
      for(const t of txns){
        const eff=CREDIT.includes(t.type)?N2(t.amount):-N2(t.amount);
        running=+(running+eff).toFixed(4);
        if(Math.abs(N2(t.balance_after)-running)>0.01)needsFix=true;
      }
      if(needsFix){await recomputeBankBalance(bankId);fixed++;}
    }catch(e){}
  }
  const usedSymbols=new Set(DB.stockTxns.map(t=>t.symbol));
  for(const p of DB.stockPrices){
    if(!usedSymbols.has(p.symbol)){
      try{await api('stock_prices?symbol=eq.'+encodeURIComponent(p.symbol),'DELETE');fixed++;}catch(e){}
    }
  }
  const usedMetalTypes=new Set(DB.metalTxns.map(t=>(t.metal_type||'').split('|')[0].trim()));
  for(const p of DB.metalPrices){
    if(!usedMetalTypes.has(p.metal_type)){
      try{await api('metal_prices?metal_type=eq.'+encodeURIComponent(p.metal_type),'DELETE');fixed++;}catch(e){}
    }
  }
  if(fixed>0){console.log('[Integrity] Fixed '+fixed);await loadAll();}
  else console.log('[Integrity] All checks passed ✓');
}

// ═══ STOCK MARKET FILTER ═══
let activeStockMarket='ALL';
function setStockMarket(market,el){
  activeStockMarket=market;
  document.querySelectorAll('#page-stocks .tab[data-market]').forEach(t=>t.classList.toggle('active',t.dataset.market===market));
  renderStocks();
}

function calcTotalsForPeriod(pStart,pEnd){
  const CREDIT=['إيداع','تحويل وارد','رصيد افتتاحي','عائد شهادة','أرباح'];
  const todayStr=today();const pe=pEnd||todayStr;
  const h={};
  [...DB.stockTxns].filter(t=>t.date<=pe).sort((a,b)=>a.date>b.date?1:a.date<b.date?-1:a.id-b.id).forEach(t=>{
    if(!h[t.symbol])h[t.symbol]={name:t.name,type:t.sec_type||'سهم',qty:0,totalCost:0,market:t.market||'EGX',currency:t.price_currency||'EGP'};
    if(t.type==='شراء'){h[t.symbol].qty+=N2(t.quantity);h[t.symbol].totalCost+=N2(t.net);}
    else if(t.type==='بيع'){const avg=h[t.symbol].qty>0?h[t.symbol].totalCost/h[t.symbol].qty:0;const sq=Math.min(N2(t.quantity),h[t.symbol].qty);h[t.symbol].qty-=sq;h[t.symbol].totalCost-=avg*sq;if(h[t.symbol].qty<0.001){h[t.symbol].qty=0;h[t.symbol].totalCost=0;}}
  });
  Object.values(h).forEach(v=>{v.avgPrice=v.qty>0.001?v.totalCost/v.qty:0});
  const hF=Object.fromEntries(Object.entries(h).filter(([,v])=>v.qty>0.001));
  const mh={};
  [...DB.metalTxns].filter(t=>t.date<=pe).sort((a,b)=>a.date>b.date?1:a.date<b.date?-1:a.id-b.id).forEach(t=>{
    const key=(t.notes?.trim())?t.metal_type+'|'+t.notes.trim():t.metal_type;
    if(!mh[key])mh[key]={metal_type:t.metal_type,title:(t.notes||'').trim(),weight:0,totalCost:0};
    if(t.op==='شراء'){mh[key].weight+=N2(t.weight);mh[key].totalCost+=N2(t.net);}
    else{const avg=mh[key].weight>0?mh[key].totalCost/mh[key].weight:0;const sw=Math.min(N2(t.weight),mh[key].weight);mh[key].weight-=sw;mh[key].totalCost-=avg*sw;if(mh[key].weight<0.001){mh[key].weight=0;mh[key].totalCost=0;}}
  });
  Object.values(mh).forEach(v=>{v.avgPrice=v.weight>0.001?v.totalCost/v.weight:0});
  const mhF=Object.fromEntries(Object.entries(mh).filter(([,v])=>v.weight>0.001));
  const bTxns=DB.bankTxns.filter(t=>t.date>=pStart&&t.date<=pe);
  const sTxns=DB.stockTxns.filter(t=>t.date>=pStart&&t.date<=pe);
  const mTxns=DB.metalTxns.filter(t=>t.date>=pStart&&t.date<=pe);
  const divs=DB.dividends.filter(t=>t.date>=pStart&&t.date<=pe);
  const certPayouts=bTxns.filter(t=>t.type==='عائد شهادة');
  const stocksVal=Object.entries(hF).reduce((a,[s,v])=>a+v.qty*(getStockPrice(s)||v.avgPrice),0);
  const stocksCost=Object.values(hF).reduce((a,v)=>a+v.totalCost,0);
  const metalsVal=Object.entries(mhF).reduce((a,[k,v])=>a+v.weight*(getMetalPrice(v.metal_type||k.split('|')[0])||v.avgPrice),0);
  const metalsCost=Object.values(mhF).reduce((a,v)=>a+v.totalCost,0);
  const totalBanks=DB.banks.reduce((a,b)=>a+toEGP(N2(b.balance),b.currency),0);
  const certsInPeriod=DB.certs.filter(c=>c.issued_date<=pe);
  const certsTotal=certsInPeriod.reduce((a,c)=>a+N2(c.amount),0);
  const certsInterest=certsInPeriod.reduce((a,c)=>a+N2(c.total_interest),0);
  const certsPaid=certPayouts.reduce((a,t)=>a+N2(t.amount),0);
  const divTotal=divs.reduce((a,d)=>a+N2(d.amount),0);
  const realizedStockPnl=sTxns.filter(t=>t.type==='بيع').reduce((a,t)=>a+N2(t.profit),0);
  const stockBought=sTxns.filter(t=>t.type==='شراء').reduce((a,t)=>a+N2(t.net),0);
  const cashIn=bTxns.filter(t=>CREDIT.includes(t.type)).reduce((a,t)=>a+N2(t.amount),0);
  const cashOut=bTxns.filter(t=>!CREDIT.includes(t.type)).reduce((a,t)=>a+N2(t.amount),0);
  const grand=totalBanks+stocksVal+metalsVal+certsTotal;
  const pnlStocks=stocksVal-stocksCost,pnlMetals=metalsVal-metalsCost;
  const totalPnl=pnlStocks+pnlMetals+certsPaid+divTotal;
  const debtsOwed=DB.debts.filter(d=>d.type==='دين علي').reduce((a,d)=>a+N2(d.remaining),0);
  const debtsOwing=DB.debts.filter(d=>d.type==='دين لي').reduce((a,d)=>a+N2(d.remaining),0);
  return{h:hF,mh:mhF,grand,totalBanks,stocksVal,stocksCost,metalsVal,metalsCost,certsTotal,certsInterest,certsPaid,divTotal,pnlStocks,pnlMetals,totalPnl,debtsOwed,debtsOwing,realizedStockPnl,stockBought,cashIn,cashOut,txnCount:bTxns.length+sTxns.length+mTxns.length,periodStart:pStart,periodEnd:pe};
}
function getReportPeriodBounds(){
  const p=UI.globalPeriod||'1y';
  if(p==='custom'&&UI.customFrom&&UI.customTo)return{pStart:UI.customFrom,pEnd:UI.customTo};
  return{pStart:periodStart(p),pEnd:today()};
}

// ═══ SETTINGS ═══
let APP_SETTINGS={exchange_name:'',base_currency:'EGP',currencies:[{code:'EGP',name:'الجنيه المصري'},{code:'USD',name:'دولار أمريكي'},{code:'SAR',name:'ريال سعودي'},{code:'AED',name:'درهم إماراتي'},{code:'EUR',name:'يورو'},{code:'GBP',name:'جنيه إسترليني'}],goldapi_key:'',zakat:{start_date:null,gold_price:null,silver_price:null,include:{}}};
let settingsBackend='local';
const CURRENCY_LABELS={EGP:'الجنيه المصري',SAR:'ريال سعودي',AED:'درهم إماراتي',USD:'دولار أمريكي',EUR:'يورو',GBP:'جنيه إسترليني',KWD:'دينار كويتي',QAR:'ريال قطري',BHD:'دينار بحريني',OMR:'ريال عماني',JOD:'دينار أردني'};
function normalizeCurrencies(){
  APP_SETTINGS.currencies=(APP_SETTINGS.currencies||[]).map(c=>
    typeof c==='string'?{code:c,name:CURRENCY_LABELS[c]||c}:{code:c.code,name:c.name||CURRENCY_LABELS[c.code]||c.code}
  );
}
function currencyName(code){const c=APP_SETTINGS.currencies.find(x=>x.code===code);return c?c.name:(CURRENCY_LABELS[code]||code);}
function currencyCodes(){return APP_SETTINGS.currencies.map(c=>c.code);}
async function loadAppSettings(){
  try{
    const rows=await sbGet('app_settings','?id=eq.1');
    if(rows&&rows.length&&rows[0].value){
      APP_SETTINGS={...APP_SETTINGS,...rows[0].value,zakat:{...APP_SETTINGS.zakat,...(rows[0].value.zakat||{})}};
      settingsBackend='supabase';
    }else{
      await sbPost('app_settings',[{id:1,value:APP_SETTINGS}]);
      settingsBackend='supabase';
    }
    normalizeCurrencies();
    return;
  }catch(e){}
  settingsBackend='local';
  try{
    const raw=localStorage.getItem('appSettings');
    if(raw)APP_SETTINGS={...APP_SETTINGS,...JSON.parse(raw)};
  }catch(e){}
  normalizeCurrencies();
}
async function persistAppSettings(){
  if(settingsBackend==='supabase'){
    try{await sbPatch('app_settings',1,{value:APP_SETTINGS});return;}catch(e){console.warn('supabase settings failed:',e.message);settingsBackend='local';}
  }
  try{localStorage.setItem('appSettings',JSON.stringify(APP_SETTINGS));}catch(e){}
}
const METAL_TYPES_BY_CURRENCY={
  EGP:['ذهب 24','ذهب 21','ذهب 18','جنيه ذهب','سبيكة ذهب','فضة'],
  SAR:['ذهب 24 قيراط','ذهب 22 قيراط','ذهب 21 قيراط','ذهب 18 قيراط','سبيكة ذهب','فضة'],
  AED:['ذهب 24 قيراط','ذهب 22 قيراط','ذهب 21 قيراط','ذهب 18 قيراط','سبيكة ذهب','فضة'],
  DEFAULT:['ذهب 24 قيراط','ذهب 22 قيراط','ذهب 21 قيراط','ذهب 18 قيراط','سبيكة ذهب','فضة']
};
function getMetalTypeList(){return METAL_TYPES_BY_CURRENCY[baseCur()]||METAL_TYPES_BY_CURRENCY.DEFAULT;}
function populateMetalTypeSelect(presetValue){
  const sel=document.getElementById('emb-metal-type');if(!sel)return;
  const list=getMetalTypeList();
  const cur=presetValue||sel.value;
  sel.innerHTML=list.map(t=>`<option>${t}</option>`).join('')+'<option value="__custom__">أخرى (تحديد يدوي)</option>';
  if(cur&&list.includes(cur))sel.value=cur;
  else if(cur){sel.insertAdjacentHTML('beforeend',`<option value="${cur}" selected>${escapeHtml(cur)}</option>`);}
  onMetalTypeChange();
}
function onMetalTypeChange(){
  const sel=document.getElementById('emb-metal-type');
  const customEl=document.getElementById('emb-metal-custom');
  if(!sel||!customEl)return;
  customEl.classList.toggle('hidden',sel.value!=='__custom__');
  updateMetalBuyPreview();
}
function populateCurrencySelect(id){
  const sel=document.getElementById(id);
  if(!sel)return;
  const cur=sel.value;
  const codes=currencyCodes();
  sel.innerHTML=APP_SETTINGS.currencies.map(c=>`<option value="${c.code}">${c.code} - ${escapeHtml(c.name)}</option>`).join('');
  if(cur&&codes.includes(cur))sel.value=cur;
  else if(codes.includes(baseCur()))sel.value=baseCur();
}
function populateAllCurrencySelects(){
  populateCurrencySelect('ebuy-currency');
  populateCurrencySelect('eb-currency');
  populateCurrencySelect('ecert-currency');
  populateCurrencySelect('emb-currency');
}
function updateCurrencyLabels(){
  document.querySelectorAll('.cur-unit').forEach(el=>el.textContent=baseCur());
}
function renderSettings(){
  const nameEl=document.getElementById('st-exchange-name');if(nameEl)nameEl.value=APP_SETTINGS.exchange_name||'';
  const goldKeyEl=document.getElementById('st-goldapi-key');if(goldKeyEl)goldKeyEl.value=APP_SETTINGS.goldapi_key||'';
  const baseSel=document.getElementById('st-base-currency');
  if(baseSel){
    baseSel.innerHTML=APP_SETTINGS.currencies.map(c=>`<option value="${c.code}">${c.code} - ${escapeHtml(c.name)}</option>`).join('');
    baseSel.value=baseCur();
  }
  const listEl=document.getElementById('st-currencies-list');
  if(listEl)listEl.innerHTML=APP_SETTINGS.currencies.map(c=>
    `<span class="badge badge-blue" style="display:inline-flex;align-items:center;gap:6px;padding:5px 10px;font-size:11.5px">
      <strong>${c.code}</strong> - <span contenteditable="true" spellcheck="false" style="outline:none;border-bottom:1px dashed currentColor" onblur="renameSettingsCurrency('${c.code}',this.textContent)">${escapeHtml(c.name)}</span>
      ${c.code!==baseCur()?`<span style="cursor:pointer;font-weight:900" onclick="removeSettingsCurrency('${c.code}')" title="حذف">×</span>`:''}
    </span>`
  ).join('');
  const modeEl=document.getElementById('st-storage-mode');
  if(modeEl)modeEl.innerHTML=settingsBackend==='supabase'
    ?'<span style="color:var(--green)">✓ الإعدادات متزامنة عبر قاعدة البيانات على كل أجهزتك</span>'
    :'<span style="color:var(--gold)">⚠ الإعدادات محفوظة على هذا الجهاز فقط. لمزامنتها، أنشئ جدول app_settings في Supabase.</span>';
  renderSchemaAlert();
}
const COLUMN_TYPE_HINTS={currency:'text',market:'text',price_currency:'text'};
function renderSchemaAlert(){
  const el=document.getElementById('st-live-schema-alert');if(!el)return;
  const warnings=window.__schemaWarnings?[...window.__schemaWarnings]:[];
  if(!warnings.length){el.innerHTML='<span style="color:var(--green)">✓ لا توجد تنبيهات — قاعدة البيانات متوافقة مع كل ميزات التطبيق الحالية.</span>';return;}
  const alterLines=warnings.map(w=>{
    const[table,col]=w.split('.');
    return`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${col} ${COLUMN_TYPE_HINTS[col]||'text'};`;
  });
  el.innerHTML=`
    <div style="color:var(--red);font-weight:800;margin-bottom:6px">⚠ قاعدة بياناتك ناقصة ${warnings.length} عمود:</div>
    <ul style="margin:0 0 8px 18px;padding:0">${warnings.map(w=>`<li><code>${escapeHtml(w)}</code></li>`).join('')}</ul>
    <div style="margin-bottom:6px">شغّل الكود ده مرة واحدة في Supabase SQL Editor:</div>
    <code style="font-size:10.5px;display:block;background:var(--surface2);padding:8px;border-radius:6px;direction:ltr;text-align:left;white-space:pre-line">${alterLines.join('\n')}</code>`;
}
async function saveGeneralSettings(){
  const oldBase=baseCur();
  APP_SETTINGS.exchange_name=document.getElementById('st-exchange-name').value.trim();
  const newBase=document.getElementById('st-base-currency').value||'EGP';
  APP_SETTINGS.base_currency=newBase;
  await persistAppSettings();
  applyBranding();           // ← update title/sidebar/topbar brand
  updateCurrencyLabels();
  populateAllCurrencySelects();
  if(newBase!==oldBase){
    toast('تم تغيير العملة الأساسية — جاري تحديث كل الأرقام...');
    await loadAll();
  }else{
    toast('تم الحفظ');
  }
}
function addSettingsCurrency(){
  const code=document.getElementById('st-new-currency-code').value.trim().toUpperCase();
  const name=document.getElementById('st-new-currency-name').value.trim();
  if(!code||code.length<3)return alert('أدخل كود عملة صحيح (3 أحرف مثل USD)');
  if(!name)return alert('أدخل اسم العملة');
  if(currencyCodes().includes(code))return alert('العملة موجودة بالفعل');
  APP_SETTINGS.currencies.push({code,name});
  document.getElementById('st-new-currency-code').value='';
  document.getElementById('st-new-currency-name').value='';
  persistAppSettings();renderSettings();populateAllCurrencySelects();
  toast('تمت الإضافة');
}
function renameSettingsCurrency(code,newName){
  newName=(newName||'').trim();
  const entry=APP_SETTINGS.currencies.find(c=>c.code===code);
  if(!entry||!newName||entry.name===newName)return;
  entry.name=newName;
  persistAppSettings();populateAllCurrencySelects();
}
function removeSettingsCurrency(code){
  if(code===baseCur())return alert('لا يمكن حذف العملة الأساسية الحالية');
  if(!confirm('حذف عملة '+code+'؟'))return;
  APP_SETTINGS.currencies=APP_SETTINGS.currencies.filter(x=>x.code!==code);
  persistAppSettings();renderSettings();populateAllCurrencySelects();
}

// ═══ ZAKAT ═══
function getZakatItems(){
  const T=calcTotals();
  return [
    {key:'banks',label:'أرصدة الحسابات البنكية والنقد',note:'نقود — تُزكّى كاملة',value:T.totalBanks,defaultInclude:true},
    {key:'stocks',label:'الأسهم والصناديق',note:'عروض تجارة — بالقيمة السوقية وقت الوجوب',value:T.stocksVal,defaultInclude:true},
    {key:'metals',label:'الذهب والفضة المُدَّخرة',note:'للادخار/الاستثمار',value:T.metalsVal,defaultInclude:true},
    {key:'certs_principal',label:'أصل الشهادات الادخارية',note:'مال مُدَّخر — يُزكّى أصله',value:T.certsTotal,defaultInclude:true},
    {key:'debts_owing',label:'ديون لك عند الغير',note:'تُزكّى إن كانت مرجوّة السداد',value:T.debtsOwing,defaultInclude:false},
    {key:'debts_owed',label:'ديون عليك (الحالّة فقط)',note:'تُخصم إن كانت مستحقة الأداء',value:-T.debtsOwed,defaultInclude:true},
  ];
}
const ymdLocal=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
function hijriParts(ds){
  const p=new Intl.DateTimeFormat('en-u-ca-islamic-umalqura',{year:'numeric',month:'numeric',day:'numeric'}).formatToParts(new Date(ds+'T12:00:00'));
  const g=t=>+String(p.find(x=>x.type===t).value).replace(/\D/g,'');
  return{y:g('year'),m:g('month'),d:g('day')};
}
function hijriLabel(ds){
  if(!ds)return '';
  return new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura',{year:'numeric',month:'long',day:'numeric'}).format(new Date(ds+'T12:00:00'));
}
function addHijriYear(ds){
  const hp=hijriParts(ds),start=new Date(ds+'T12:00:00');
  for(let i=350;i<=360;i++){
    const c=ymdLocal(new Date(start.getTime()+i*86400000)),p=hijriParts(c);
    if(p.y===hp.y+1&&p.m===hp.m&&p.d===hp.d)return c;
  }
  return ymdLocal(new Date(start.getTime()+354*86400000));
}
function previewZakatHijri(){
  const v=document.getElementById('zk-start-date').value,el=document.getElementById('zk-start-hijri');
  if(el)el.textContent=v?'يوافق: '+hijriLabel(v):'';
}
function zakatGoldPrice24(){
  const price=t=>{const p=DB.metalPrices.find(x=>x.metal_type===t);return p?N2(p.price_per_gram):0;};
  return price('ذهب 24')||price('ذهب 24 قيراط')||(price('ذهب 21')?price('ذهب 21')*24/21:0)||(price('ذهب 21 قيراط')?price('ذهب 21 قيراط')*24/21:0)||(price('ذهب 18')?price('ذهب 18')*24/18:0)||0;
}
function autofillZakatPrices(){
  const g=zakatGoldPrice24(),s=DB.metalPrices.find(x=>x.metal_type==='فضة');
  if(g)document.getElementById('zk-gold-price').value=g.toFixed(2);
  if(s)document.getElementById('zk-silver-price').value=N2(s.price_per_gram).toFixed(2);
  if(!g&&!s)return alert('لا توجد أسعار ذهب/فضة في المحفظة');
  saveZakatSettings();
}
function renderZakat(){
  const z=APP_SETTINGS.zakat||{};
  document.getElementById('zk-start-date').value=z.start_date||'';
  document.getElementById('zk-gold-price').value=z.gold_price||'';
  document.getElementById('zk-silver-price').value=z.silver_price||'';
  document.getElementById('zk-basis').value=z.basis||'gold';
  previewZakatHijri();
  document.getElementById('zakat-breakdown-tbody').innerHTML=getZakatItems().map(it=>{
    const included=z.include&&(it.key in z.include)?z.include[it.key]:it.defaultInclude;
    return`<tr><td style="font-size:12px"><div style="font-weight:700">${escapeHtml(it.label)}</div><div style="font-size:10px;color:var(--muted)">${escapeHtml(it.note)}</div></td>
      <td class="td-num" style="font-weight:700">${fmt(it.value)}</td>
      <td><input type="checkbox" ${included?'checked':''} onchange="toggleZakatInclude('${it.key}',this.checked)" style="width:18px;height:18px;cursor:pointer"></td></tr>`;
  }).join('');
  computeAndRenderZakat();
  renderZakatHistory();
}
function toggleZakatInclude(key,val){
  APP_SETTINGS.zakat.include=APP_SETTINGS.zakat.include||{};
  APP_SETTINGS.zakat.include[key]=val;
  persistAppSettings();computeAndRenderZakat();
}
function saveZakatSettings(){
  const z=APP_SETTINGS.zakat=APP_SETTINGS.zakat||{};
  z.start_date=document.getElementById('zk-start-date').value||null;
  z.gold_price=N2(document.getElementById('zk-gold-price').value)||null;
  z.silver_price=N2(document.getElementById('zk-silver-price').value)||null;
  z.basis=document.getElementById('zk-basis').value||'gold';
  persistAppSettings();toast('تم الحفظ');previewZakatHijri();computeAndRenderZakat();
}
function zakatState(){
  const z=APP_SETTINGS.zakat||{};
  const base=getZakatItems().reduce((a,it)=>a+((z.include&&(it.key in z.include)?z.include[it.key]:it.defaultInclude)?it.value:0),0);
  const nisabGold=z.gold_price?85*N2(z.gold_price):null,nisabSilver=z.silver_price?595*N2(z.silver_price):null;
  const basis=z.basis==='silver'?'silver':'gold';
  const nisab=basis==='silver'?nisabSilver:nisabGold;
  const nisabLabel=basis==='silver'?'595 جم فضة خالصة':'85 جم ذهب عيار 24';
  let hawl=null;
  if(z.start_date){
    const end=addHijriYear(z.start_date),now=today();
    const total=(new Date(end)-new Date(z.start_date))/86400000;
    const elapsed=(new Date(now)-new Date(z.start_date))/86400000;
    hawl={start:z.start_date,end,complete:now>=end,daysLeft:Math.ceil((new Date(end)-new Date(now))/86400000),pct:Math.max(0,Math.min(100,elapsed/total*100))};
  }
  const meets=nisab!==null&&base>=nisab;
  return{z,base,nisab,nisabLabel,hawl,meets,due:base>0?base*0.025:0,isDue:meets&&!!hawl&&hawl.complete};
}
function computeAndRenderZakat(){
  const S=zakatState(),{base,nisab,nisabLabel,hawl,meets,due,isDue}=S;
  document.getElementById('zakat-kpis').innerHTML=
    kpi('الوعاء الزكوي',fmt(base),'صافي الأموال بعد الديون','var(--teal)',svgIcon('<path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>'),null)+
    kpi('النصاب',nisab?fmt(nisab):'—',nisab?nisabLabel:'أدخل سعر الذهب','var(--gold)',svgIcon('<circle cx="12" cy="12" r="10"/>'),null)+
    kpi('الزكاة (٢٫٥٪)',fmt(due),meets?(isDue?'مستحقة الآن':'بلغ النصاب — بانتظار الحول'):'لم يبلغ النصاب',isDue?'var(--green)':'var(--muted)',svgIcon('<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>'),null);
  const hp=document.getElementById('zk-hawl-panel');
  hp.innerHTML=hawl?`
    <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;font-size:12px;margin-bottom:8px">
      <div><span style="color:var(--muted)">بداية الحول:</span> <strong>${hawl.start}</strong> <span style="color:var(--muted)">(${hijriLabel(hawl.start)})</span></div>
      <div><span style="color:var(--muted)">نهاية الحول:</span> <strong>${hawl.end}</strong> <span style="color:var(--muted)">(${hijriLabel(hawl.end)})</span></div>
    </div>
    <div class="prog-wrap lg"><div class="prog-bar" style="width:${hawl.pct}%;background:${hawl.complete?'var(--green)':'var(--gold)'}"></div></div>
    <div style="margin-top:8px;font-size:12px;font-weight:700;color:${hawl.complete?'var(--green)':'var(--gold)'}">${hawl.complete?'✓ اكتمل الحول':'متبقٍ '+hawl.daysLeft+' يوم على اكتمال الحول'}</div>
    <div class="form-hint">التقويم الهجري هنا (أم القرى) قد يختلف يومًا واحدًا عن رؤية الهلال في بلدك.</div>`
    :`<div style="color:var(--muted);font-size:12px">حدّد تاريخ بداية الحول (أول يوم بلغ فيه مالك النصاب) لحساب موعد الاستحقاق هجريًا.</div>`;
  document.getElementById('zakat-result').innerHTML=!nisab
    ?`<div style="padding:20px;text-align:center;color:var(--muted)">أدخل سعر الذهب (أو استخدم "تعبئة الأسعار") لحساب النصاب.</div>`
    :isDue?`<div style="text-align:center;padding:14px">
        <div style="font-size:13px;color:var(--muted)">الزكاة المستحقة</div>
        <div style="font-size:32px;font-weight:900;color:var(--green)">${fmt(due)}</div>
        <div style="font-size:12px;color:var(--muted);margin-top:4px">٢٫٥٪ من ${fmt(base)} — بلغ النصاب (${fmt(nisab)}) واكتمل الحول</div>
        <button class="btn btn-success" style="margin-top:14px" onclick="openZakatPay()">تسجيل إخراج الزكاة</button>
      </div>`
    :`<div style="text-align:center;padding:14px;color:var(--muted);font-size:13px">${!meets?'الوعاء ('+fmt(base)+') لم يبلغ النصاب ('+fmt(nisab)+').':(hawl?'بلغ الوعاء النصاب، والزكاة تجب عند اكتمال الحول ('+hawl.end+').':'بلغ الوعاء النصاب — حدّد تاريخ بداية الحول.')}</div>`;
}
function renderZakatHistory(){
  const h=(APP_SETTINGS.zakat&&APP_SETTINGS.zakat.history)||[];
  document.getElementById('zakat-history-tbody').innerHTML=h.length?[...h].reverse().map((r,i)=>`<tr>
    <td>${r.date}</td><td class="muted">${hijriLabel(r.date)}</td><td class="td-num pos" style="font-weight:800">${fmt(r.amount)}</td>
    <td class="td-num muted">${fmt(r.base)}</td><td>${escapeHtml(r.bank_name||'—')}</td>
    <td><button class="btn-icon danger" onclick="deleteZakatRecord(${h.length-1-i})"><svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg></button></td></tr>`).join('')
    :`<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--muted)">لم تُسجَّل زكاة بعد</td></tr>`;
}
function deleteZakatRecord(idx){
  if(!confirm('حذف هذا السطر من سجل الزكاة؟'))return;
  APP_SETTINGS.zakat.history.splice(idx,1);persistAppSettings();renderZakatHistory();
}
function openZakatPay(){
  const S=zakatState();
  document.getElementById('zpay-amount').value=S.due.toFixed(2);
  document.getElementById('zpay-date').value=today();
  populateSelect('zpay-bank');
  openModal('modal-zakat-pay');
}
async function doZakatPay(){
  const S=zakatState();
  const amount=N2(document.getElementById('zpay-amount').value),bankId=+document.getElementById('zpay-bank').value;
  const dt=document.getElementById('zpay-date').value||today();
  if(!amount||amount<=0)return alert('أدخل المبلغ');
  if(!bankId)return alert('اختر الحساب');
  const bank=DB.banks.find(b=>b.id===bankId);if(!bank)return alert('الحساب غير موجود');
  const perUnit=toEGP(1,bank.currency||'EGP')||1;
  const amtBank=+(amount/perUnit).toFixed(4);
  if(N2(bank.balance)<amtBank)return alert('الرصيد غير كافٍ');
  try{
    const newBal=+(N2(bank.balance)-amtBank).toFixed(4);
    await sbPost('bank_transactions',[{bank_id:bankId,type:'سحب',amount:amtBank,balance_after:newBal,date:dt,notes:'زكاة المال — حول '+(S.hawl?S.hawl.start+' → '+S.hawl.end:''),category:'زكاة'}]);
    await sbPatch('banks',bankId,{balance:newBal});
    await recomputeBankBalance(bankId);
    const z=APP_SETTINGS.zakat;z.history=z.history||[];
    z.history.push({date:dt,amount,base:S.base,bank_id:bankId,bank_name:bank.name,hawl_end:S.hawl?S.hawl.end:null});
    if(S.hawl)z.start_date=S.hawl.end;
    await persistAppSettings();
    closeModal('modal-zakat-pay');toast('تم تسجيل إخراج الزكاة');
    await loadAll();
  }catch(e){console.error('doZakatPay:',e);toast('خطأ: '+e.message,false)}
}

// ═══ INIT ═══
initDark();
initAuthGate();
