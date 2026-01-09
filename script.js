import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, collection, onSnapshot, deleteDoc, updateDoc, addDoc, query, orderBy } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyA3cRmakg2dV2YRuNV1fY7LE87artsLmB8",
  authDomain: "mi-web-db.firebaseapp.com",
  projectId: "mi-web-db",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
let usuarioActual = null;
let stockChart = null;

// --- LOGIN ---
window.iniciarSesion = async () => {
  const user = document.getElementById("login-user").value.trim().toLowerCase();
  const pass = document.getElementById("login-pass").value.trim();

  if (user === "admin" && pass === "1130") {
    cargarSesion({ id: "admin", rol: "admin" });
  } else {
    const snap = await getDoc(doc(db, "usuarios", user));
    if (snap.exists() && snap.data().pass === pass) {
      cargarSesion({ id: user, ...snap.data() });
    } else { alert("Acceso denegado."); }
  }
};

function cargarSesion(datos) {
  usuarioActual = datos;
  document.getElementById("pantalla-login").classList.add("hidden");
  document.getElementById("interfaz-app").classList.remove("hidden");
  
  if(datos.rol === 'admin') document.getElementById("btn-admin-stock").classList.remove("hidden");

  configurarNavegacion();
  verPagina(datos.rol === 'admin' ? 'stats' : 'stock');
  activarSincronizacion();
}

function configurarNavegacion() {
  const menu = document.getElementById("menu-dinamico");
  const isAdmin = usuarioActual.rol === 'admin';
  const rutas = isAdmin ? 
    [{id:'stats', n:'Dashboard', i:'chart-line'}, {id:'stock', n:'Inventario', i:'boxes-stacked'}, {id:'solicitudes', n:'Pendientes', i:'bell'}, {id:'historial', n:'Historial', i:'clock-rotate-left'}, {id:'usuarios', n:'Usuarios', i:'user-group'}] :
    [{id:'stock', n:'Ver Stock', i:'eye'}, {id:'solicitar', n:'Solicitar', i:'plus'}, {id:'mis-pedidos', n:'Mis Estados', i:'list-check'}];

  menu.innerHTML = rutas.map(r => `
    <button onclick="verPagina('${r.id}')" class="w-full flex items-center gap-3 p-4 text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 rounded-2xl transition font-semibold group">
      <i class="fas fa-${r.i} text-slate-400 group-hover:text-indigo-500 w-6"></i> ${r.n}
    </button>`).join('');
}

window.verPagina = (id) => {
  document.querySelectorAll(".view").forEach(v => v.classList.add("hidden"));
  document.getElementById(`pag-${id}`).classList.remove("hidden");
};

// --- GESTIÓN DATOS ---
window.abrirModalInsumo = () => document.getElementById("modal-insumo").classList.remove("hidden");
window.cerrarModalInsumo = () => document.getElementById("modal-insumo").classList.add("hidden");

window.agregarProducto = async () => {
  const nom = document.getElementById("nombre-prod").value.trim().toLowerCase();
  const cant = parseInt(document.getElementById("cantidad-prod").value);
  if (nom && !isNaN(cant)) {
    await setDoc(doc(db, "inventario", nom), { nombre: nom, cantidad: cant }, { merge: true });
    cerrarModalInsumo();
  }
};

window.crearUsuario = async () => {
  const id = document.getElementById("new-user").value.trim().toLowerCase();
  const pass = document.getElementById("new-pass").value.trim();
  const rol = document.getElementById("new-role").value;
  if(id && pass) await setDoc(doc(db, "usuarios", id), { pass, rol });
};

window.eliminarDato = async (col, id) => { if(confirm("¿Eliminar?")) await deleteDoc(doc(db, col, id)); };

window.procesarSolicitud = async () => {
  const ins = document.getElementById("sol-insumo").value.trim().toLowerCase();
  const cant = parseInt(document.getElementById("sol-cantidad").value);
  const ubi = document.getElementById("sol-ubicacion").value.trim();

  if(ins && cant > 0) {
    await addDoc(collection(db, "pedidos"), {
      usuarioId: usuarioActual.id,
      insumoNom: ins,
      cantidad: cant,
      ubicacion: ubi,
      estado: "pendiente",
      fecha: new Date().toLocaleString(),
      timestamp: new Date()
    });
    alert("Solicitud enviada.");
    verPagina('mis-pedidos');
  }
};

// --- SINCRONIZACIÓN REALTIME ---
function activarSincronizacion() {
  // Insumos
  onSnapshot(collection(db, "inventario"), snap => {
    const list = document.getElementById("lista-inventario");
    const sug = document.getElementById("productos-sugeridos");
    let labels = [], values = [], total = 0;
    list.innerHTML = ""; sug.innerHTML = "";
    snap.forEach(d => {
      const p = d.data();
      total += p.cantidad; labels.push(d.id.toUpperCase()); values.push(p.cantidad);
      list.innerHTML += `<div class="bg-white p-5 rounded-2xl border flex justify-between items-center shadow-sm hover:border-indigo-200 transition">
        <div><b class="uppercase text-slate-800">${d.id}</b><p class="text-sm text-slate-500">Cantidad: ${p.cantidad}</p></div>
        ${usuarioActual.rol === 'admin' ? `<button onclick="eliminarDato('inventario','${d.id}')" class="text-slate-300 hover:text-red-500"><i class="fas fa-trash"></i></button>` : ''}
      </div>`;
      sug.innerHTML += `<option value="${d.id}">`;
    });
    if(document.getElementById("metrica-total")) document.getElementById("metrica-total").innerText = snap.size;
    if(document.getElementById("metrica-stock")) document.getElementById("metrica-stock").innerText = total;
    actualizarGrafica(labels, values);
  });

  // Pedidos e Historial
  const q = query(collection(db, "pedidos"), orderBy("timestamp", "desc"));
  onSnapshot(q, snap => {
    const lPend = document.getElementById("lista-pendientes-admin");
    const lMis = document.getElementById("lista-mis-pedidos");
    const tHist = document.getElementById("tabla-historial");
    let pCount = 0;
    lPend.innerHTML = ""; lMis.innerHTML = ""; tHist.innerHTML = "";

    snap.forEach(d => {
      const p = d.data();
      const statusClass = `status-${p.estado}`;
      
      // Historial (Admin)
      if(usuarioActual.rol === 'admin') {
        tHist.innerHTML += `<tr class="hover:bg-slate-50 transition">
          <td class="p-4 text-xs text-slate-500">${p.fecha}</td>
          <td class="p-4 font-bold uppercase">${p.usuarioId}</td>
          <td class="p-4 uppercase">${p.insumoNom}</td>
          <td class="p-4 font-semibold">${p.cantidad}</td>
          <td class="p-4"><span class="badge ${statusClass}">${p.estado}</span></td>
        </tr>`;
      }

      // Pendientes (Admin)
      if(usuarioActual.rol === 'admin' && p.estado === 'pendiente') {
        pCount++;
        lPend.innerHTML += `<div class="bg-white p-5 rounded-2xl border flex justify-between items-center shadow-sm">
          <div><b class="uppercase">${p.insumoNom}</b> (x${p.cantidad})<br><small>${p.usuarioId} - ${p.ubicacion}</small></div>
          <div class="flex gap-2">
            <button onclick="gestionarPedido('${d.id}','aprobar','${p.insumoNom}',${p.cantidad})" class="bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-bold">Aprobar</button>
            <button onclick="gestionarPedido('${d.id}','rechazar')" class="bg-slate-100 px-4 py-2 rounded-xl text-sm font-bold">Rechazar</button>
          </div>
        </div>`;
      }

      // Mis Pedidos (Solicitante)
      if(p.usuarioId === usuarioActual.id) {
        lMis.innerHTML += `<div class="bg-white p-5 rounded-2xl border flex justify-between items-center shadow-sm">
          <div><b class="uppercase">${p.insumoNom}</b><br><small>${p.fecha}</small></div>
          <span class="badge ${statusClass}">${p.estado}</span>
        </div>`;
      }
    });
    if(document.getElementById("metrica-pedidos")) document.getElementById("metrica-pedidos").innerText = pCount;
  });

  // Usuarios (Admin)
  if(usuarioActual.rol === 'admin') {
    onSnapshot(collection(db, "usuarios"), snap => {
      const uList = document.getElementById("lista-usuarios-db");
      uList.innerHTML = "";
      snap.forEach(d => {
        uList.innerHTML += `<div class="bg-white p-4 rounded-2xl border flex justify-between items-center shadow-sm">
          <div><b class="text-indigo-600">${d.id}</b><p class="text-xs uppercase text-slate-400 font-bold">${d.data().rol}</p></div>
          <button onclick="eliminarDato('usuarios','${d.id}')" class="text-slate-300 hover:text-red-500"><i class="fas fa-trash"></i></button>
        </div>`;
      });
    });
  }
}

window.gestionarPedido = async (id, accion, ins, cant) => {
  const pRef = doc(db, "pedidos", id);
  if(accion === 'aprobar') {
    const iRef = doc(db, "inventario", ins.toLowerCase());
    const iSnap = await getDoc(iRef);
    if(iSnap.exists() && iSnap.data().cantidad >= cant) {
      await updateDoc(iRef, { cantidad: iSnap.data().cantidad - cant });
      await updateDoc(pRef, { estado: "aprobado" });
    } else { alert("Stock insuficiente."); }
  } else { await updateDoc(pRef, { estado: "rechazado" }); }
};

window.cerrarSesion = () => location.reload();

function actualizarGrafica(labels, data) {
  const ctx = document.getElementById('stockChart');
  if(!ctx) return;
  if(stockChart) stockChart.destroy();
  stockChart = new Chart(ctx, { type: 'bar', data: { labels, datasets: [{ label: 'Insumos', data, backgroundColor: '#6366f1', borderRadius: 8 }] }, options: { scales: { y: { beginAtZero: true } } } });
}