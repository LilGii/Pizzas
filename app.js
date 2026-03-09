// ─────────────────────────────────────────────────────────────────────────────
//  app.js — PizzaFlow
//
//  Las credenciales de Firebase se inyectan desde variables de entorno de Vercel.
//  En local crea un archivo .env.local con los valores (ver README).
//  NUNCA subas .env.local a git — ya está en .gitignore.
// ─────────────────────────────────────────────────────────────────────────────

import { initializeApp }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
         signOut, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, deleteDoc,
         doc, query, where, orderBy, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ──────────────────────────────────────────────────────────
//  CONFIG — valores inyectados por Vercel en build time.
//  Vercel expone solo las vars con prefijo VITE_ / PUBLIC_
//  al bundle estático. Aquí usamos el patrón recomendado
//  para proyectos estáticos sin bundler: un archivo
//  /public/env.js generado por vercel.json (ver abajo).
// ──────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey:            window.__ENV__.FIREBASE_API_KEY,
  authDomain:        window.__ENV__.FIREBASE_AUTH_DOMAIN,
  projectId:         window.__ENV__.FIREBASE_PROJECT_ID,
  storageBucket:     window.__ENV__.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: window.__ENV__.FIREBASE_MESSAGING_SENDER_ID,
  appId:             window.__ENV__.FIREBASE_APP_ID,
  measurementId:     window.__ENV__.FIREBASE_MEASUREMENT_ID,
};

const fbApp = initializeApp(firebaseConfig);
const auth  = getAuth(fbApp);
const db    = getFirestore(fbApp);

// ── chart refs ──
let chartLine=null, chartDonut=null, chartBar=null, chartPie=null;
// ── pending delete ──
let pendingDel = null;

// ─────────────────────────────────────────────────
//  UTILS
// ─────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const fmt = n => new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN'}).format(n);
const todayStr = () => new Date().toISOString().split('T')[0];
const safe = s => String(s).replace(/[<>"'`]/g,'').trim().substring(0,400);

function spin(on){ $('loading').classList.toggle('active',on); }

function toast(msg, type='success'){
  const el = $('toast');
  el.textContent = msg;
  el.className = `show ${type}`;
  setTimeout(()=>{ el.className=''; }, 3200);
}

// ─────────────────────────────────────────────────
//  AUTH HELPERS
// ─────────────────────────────────────────────────
const AUTH_ERRORS = {
  'auth/user-not-found':      'Correo no registrado.',
  'auth/wrong-password':      'Contraseña incorrecta.',
  'auth/invalid-email':       'Correo inválido.',
  'auth/email-already-in-use':'El correo ya está registrado.',
  'auth/weak-password':       'Contraseña muy débil (mín. 6 caracteres).',
  'auth/invalid-credential':  'Credenciales incorrectas.',
  'auth/too-many-requests':   'Demasiados intentos. Intenta más tarde.',
  'auth/network-request-failed':'Sin conexión a internet.',
};
const authErr = code => AUTH_ERRORS[code] || 'Error: ' + code;

// ─────────────────────────────────────────────────
//  AUTH ACTIONS
// ─────────────────────────────────────────────────
window.switchTab = tab => {
  $('form-login').style.display    = tab==='login'    ? '' : 'none';
  $('form-register').style.display = tab==='register' ? '' : 'none';
  $('tab-login').classList.toggle('active',    tab==='login');
  $('tab-register').classList.toggle('active', tab==='register');
  $('l-err').textContent = ''; $('r-err').textContent = '';
};

window.doLogin = async () => {
  const email = $('l-email').value.trim();
  const pass  = $('l-pass').value;
  $('l-err').textContent = '';
  if(!email||!pass){ $('l-err').textContent='Completa todos los campos.'; return; }
  spin(true);
  try { await signInWithEmailAndPassword(auth, email, pass); }
  catch(e){ $('l-err').textContent = authErr(e.code); }
  finally { spin(false); }
};

window.doRegister = async () => {
  const name  = $('r-name').value.trim();
  const email = $('r-email').value.trim();
  const pass  = $('r-pass').value;
  const pass2 = $('r-pass2').value;
  $('r-err').textContent = '';
  if(!name||!email||!pass){ $('r-err').textContent='Completa todos los campos.'; return; }
  if(pass.length<6){ $('r-err').textContent='La contraseña debe tener al menos 6 caracteres.'; return; }
  if(pass!==pass2){ $('r-err').textContent='Las contraseñas no coinciden.'; return; }
  spin(true);
  try {
    await createUserWithEmailAndPassword(auth, email, pass);
    toast('Cuenta creada exitosamente 🎉');
  }
  catch(e){ $('r-err').textContent = authErr(e.code); }
  finally { spin(false); }
};

window.doLogout = async () => { await signOut(auth); toast('Sesión cerrada'); };

onAuthStateChanged(auth, user => {
  if(user){
    $('auth-screen').style.display = 'none';
    $('app').style.display = 'block';
    $('u-avatar').textContent = (user.displayName||user.email||'?')[0].toUpperCase();
    $('u-email').textContent  = user.email;
    $('f-date').value = todayStr();
    loadDash();
  } else {
    $('auth-screen').style.display = 'flex';
    $('app').style.display = 'none';
  }
});

// ─────────────────────────────────────────────────
//  NAV
// ─────────────────────────────────────────────────
window.goTo = (name, btn) => {
  document.querySelectorAll('.section').forEach(s=>s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  $('sec-'+name).classList.add('active');
  btn.classList.add('active');
  if(name==='historial') loadHist();
  if(name==='reportes')  loadRep();
  if(name==='dashboard') loadDash();
};

// ─────────────────────────────────────────────────
//  FORM
// ─────────────────────────────────────────────────
window.setType = type => {
  $('f-type').value = type;
  $('btn-inc').className = 'type-btn' + (type==='income'  ? ' active income'  : '');
  $('btn-exp').className = 'type-btn' + (type==='expense' ? ' active expense' : '');
};

window.saveTxn = async () => {
  const user = auth.currentUser;
  if(!user){ toast('No autenticado','error'); return; }
  const amount   = parseFloat($('f-amount').value);
  const date     = $('f-date').value;
  const type     = $('f-type').value;
  const category = $('f-category').value;
  const desc     = safe($('f-desc').value);
  const notes    = safe($('f-notes').value);
  if(!amount||amount<=0){ toast('Ingresa un monto válido','error'); return; }
  if(!date){ toast('Selecciona una fecha','error'); return; }
  spin(true);
  $('btn-save').disabled = true;
  try {
    await addDoc(collection(db,'transactions'),{
      uid: user.uid, amount, date, type,
      category: safe(category), desc, notes,
      createdAt: serverTimestamp()
    });
    toast('Movimiento registrado ✓');
    $('f-amount').value=''; $('f-desc').value=''; $('f-notes').value='';
    $('f-date').value=todayStr(); setType('income');
  }
  catch(e){ toast('Error al guardar: '+e.message,'error'); }
  finally { spin(false); $('btn-save').disabled=false; }
};

// ─────────────────────────────────────────────────
//  FETCH  (filtros del lado cliente — seguro por uid)
// ─────────────────────────────────────────────────
async function fetchTxns(fromD, toD, typeF, catF){
  const user = auth.currentUser;
  if(!user) return [];
  const q = query(
    collection(db,'transactions'),
    where('uid','==',user.uid),
    orderBy('date','desc')
  );
  const snap = await getDocs(q);
  let rows = snap.docs.map(d=>({id:d.id,...d.data()}));
  if(fromD) rows = rows.filter(r=>r.date>=fromD);
  if(toD)   rows = rows.filter(r=>r.date<=toD);
  if(typeF) rows = rows.filter(r=>r.type===typeF);
  if(catF)  rows = rows.filter(r=>r.category===catF);
  return rows;
}

// ─────────────────────────────────────────────────
//  DELETE
// ─────────────────────────────────────────────────
window.openDel = id => { pendingDel=id; $('del-modal').classList.add('active'); };
document.getElementById('cancel-del').onclick = () => {
  pendingDel=null; $('del-modal').classList.remove('active');
};
document.getElementById('confirm-del').onclick = async () => {
  if(!pendingDel) return;
  spin(true);
  try {
    await deleteDoc(doc(db,'transactions',pendingDel));
    toast('Movimiento eliminado');
    $('del-modal').classList.remove('active');
    pendingDel=null;
    loadDash(); loadHist();
  }
  catch(e){ toast('Error al eliminar','error'); }
  finally{ spin(false); }
};

// ─────────────────────────────────────────────────
//  TABLE RENDERER
// ─────────────────────────────────────────────────
function renderTable(txns, wrapId){
  const el = $(wrapId);
  if(!txns.length){
    el.innerHTML='<div class="empty-state"><div class="empty-icon">📋</div>No hay movimientos para mostrar.</div>';
    return;
  }
  const rows = txns.map(t=>`
    <tr>
      <td>${t.date}</td>
      <td><span class="badge ${t.type}"><span class="badge-dot"></span>${t.type==='income'?'Ingreso':'Egreso'}</span></td>
      <td><span class="cat-tag">${t.category||'—'}</span></td>
      <td>${t.desc||'—'}</td>
      <td class="amount-${t.type}">${fmt(t.amount)}</td>
      <td>
        <button class="btn-del" title="Eliminar" onclick="openDel('${t.id}')">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14H6L5 6"/>
            <path d="M10 11v6M14 11v6M9 6V4h6v2"/>
          </svg>
        </button>
      </td>
    </tr>`).join('');
  el.innerHTML=`
    <table class="txn-table">
      <thead><tr>
        <th>Fecha</th><th>Tipo</th><th>Categoría</th>
        <th>Descripción</th><th>Monto</th><th></th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// ─────────────────────────────────────────────────
//  DASHBOARD
// ─────────────────────────────────────────────────
window.loadDash = async () => {
  spin(true);
  try {
    const txns = await fetchTxns($('d-from').value, $('d-to').value);
    const inc = txns.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0);
    const exp = txns.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0);
    const bal = inc - exp;

    $('k-income').textContent   = fmt(inc);
    $('k-expense').textContent  = fmt(exp);
    $('k-balance').textContent  = fmt(bal);
    $('k-income-n').textContent  = txns.filter(t=>t.type==='income').length  + ' entradas';
    $('k-expense-n').textContent = txns.filter(t=>t.type==='expense').length + ' salidas';
    $('k-total').textContent    = txns.length;

    const bc = $('k-bal-card'), bl = $('k-bal-lbl'), bv = $('k-balance');
    if(bal>0){  bc.className='kpi-card bal-pos'; bl.textContent='🟢 Ganancia';           bv.style.color='#2980B9'; }
    else if(bal<0){ bc.className='kpi-card bal-neg'; bl.textContent='🔴 Pérdida';        bv.style.color='#E67E22'; }
    else { bc.className='kpi-card bal-pos'; bl.textContent='⚖️ Punto de equilibrio';     bv.style.color='#2980B9'; }

    const dm={};
    txns.forEach(t=>{ if(!dm[t.date])dm[t.date]={income:0,expense:0}; dm[t.date][t.type]+=t.amount; });
    const dates=Object.keys(dm).sort().slice(-14);
    if(chartLine) chartLine.destroy();
    chartLine=new Chart($('lineChart'),{
      type:'line',
      data:{ labels:dates, datasets:[
        {label:'Ingresos',data:dates.map(d=>dm[d]?.income||0), borderColor:'#27AE60',backgroundColor:'rgba(39,174,96,.1)',tension:.4,fill:true},
        {label:'Egresos', data:dates.map(d=>dm[d]?.expense||0),borderColor:'#C0392B',backgroundColor:'rgba(192,57,43,.1)',tension:.4,fill:true}
      ]},
      options:{plugins:{legend:{position:'bottom'}},scales:{y:{beginAtZero:true}}}
    });

    if(chartDonut) chartDonut.destroy();
    chartDonut=new Chart($('donutChart'),{
      type:'doughnut',
      data:{labels:['Ingresos','Egresos'],datasets:[{data:[inc,exp],backgroundColor:['#27AE60','#C0392B'],borderWidth:0}]},
      options:{plugins:{legend:{position:'bottom'}},cutout:'65%'}
    });

    renderTable(txns.slice(0,10),'recent-wrap');
  }
  catch(e){ toast('Error cargando dashboard','error'); console.error(e); }
  finally{ spin(false); }
};
window.clearDash=()=>{ $('d-from').value=''; $('d-to').value=''; loadDash(); };

// ─────────────────────────────────────────────────
//  HISTORIAL
// ─────────────────────────────────────────────────
window.loadHist = async () => {
  spin(true);
  try {
    const txns=await fetchTxns($('h-from').value,$('h-to').value,$('h-type').value,$('h-cat').value);
    renderTable(txns,'hist-wrap');
  } catch(e){ toast('Error','error'); } finally{ spin(false); }
};
window.clearHist=()=>{ ['h-from','h-to','h-type','h-cat'].forEach(id=>$(id).value=''); loadHist(); };

// ─────────────────────────────────────────────────
//  REPORTES
// ─────────────────────────────────────────────────
const PIE_COLORS = ['#C0392B','#E74C3C','#922B21','#CB4335','#A93226','#884EA0','#2471A3','#17A589','#D4AC0D','#1E8449'];

window.loadRep = async () => {
  spin(true);
  try {
    const txns=await fetchTxns($('r-from').value,$('r-to').value);
    const inc=txns.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0);
    const exp=txns.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0);
    const bal=inc-exp;

    $('rp-income').textContent  = fmt(inc);
    $('rp-expense').textContent = fmt(exp);
    $('rp-balance').textContent = fmt(bal);
    $('rp-balance').style.color = bal>=0?'var(--green)':'var(--red)';

    const catInc={}, catExp={};
    txns.forEach(t=>{
      if(t.type==='income')  catInc[t.category]=(catInc[t.category]||0)+t.amount;
      if(t.type==='expense') catExp[t.category]=(catExp[t.category]||0)+t.amount;
    });
    const allCats=[...new Set([...Object.keys(catInc),...Object.keys(catExp)])];

    if(chartBar) chartBar.destroy();
    chartBar=new Chart($('barChart'),{
      type:'bar',
      data:{
        labels:allCats.length?allCats:['Sin datos'],
        datasets:[
          {label:'Ingresos',data:allCats.map(c=>catInc[c]||0), backgroundColor:'rgba(39,174,96,.75)'},
          {label:'Egresos', data:allCats.map(c=>catExp[c]||0), backgroundColor:'rgba(192,57,43,.75)'}
        ]
      },
      options:{plugins:{legend:{position:'bottom'}},scales:{y:{beginAtZero:true}}}
    });

    const expCats=Object.keys(catExp);
    if(chartPie) chartPie.destroy();
    chartPie=new Chart($('pieChart'),{
      type:'pie',
      data:{
        labels:expCats.length?expCats:['Sin egresos'],
        datasets:[{data:expCats.length?expCats.map(c=>catExp[c]):[1],backgroundColor:PIE_COLORS,borderWidth:0}]
      },
      options:{plugins:{legend:{position:'bottom'}}}
    });

    if(!allCats.length){
      $('cat-wrap').innerHTML='<div class="empty-state"><div class="empty-icon">📊</div>Sin datos para el período seleccionado.</div>';
    } else {
      const rows=allCats.map(c=>{
        const net=(catInc[c]||0)-(catExp[c]||0);
        return `<tr>
          <td><span class="cat-tag">${c}</span></td>
          <td class="amount-income">${catInc[c]?fmt(catInc[c]):'—'}</td>
          <td class="amount-expense">${catExp[c]?fmt(catExp[c]):'—'}</td>
          <td style="font-weight:600;color:${net>=0?'var(--green)':'var(--red)'}">${fmt(net)}</td>
        </tr>`;
      }).join('');
      $('cat-wrap').innerHTML=`
        <table class="txn-table">
          <thead><tr><th>Categoría</th><th>Ingresos</th><th>Egresos</th><th>Neto</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>`;
    }
  }
  catch(e){ toast('Error al generar reporte','error'); console.error(e); }
  finally{ spin(false); }
};
window.clearRep=()=>{ $('r-from').value=''; $('r-to').value=''; loadRep(); };
