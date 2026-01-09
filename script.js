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
        } else { alert("Credenciales inválidas"); }
    }
};

function cargarSesion(datos) {
    usuarioActual = datos;
    document.getElementById("pantalla-login").classList.add("hidden");
    document.getElementById("interfaz-app").classList.remove("hidden");
    if(datos.rol === 'admin') document.getElementById("btn-admin-stock").classList.remove("hidden");
    configurarMenu();
    verPagina(datos.rol === 'admin' ? 'stats' : 'stock');
    activarSincronizacion();
}

// --- NAVEGACIÓN ---
window.toggleMenu = () => {
    document.getElementById("sidebar").classList.toggle("-translate-x-full");
    document.getElementById("sidebar-overlay").classList.toggle("hidden");
};

function configurarMenu() {
    const menu = document.getElementById("menu-dinamico");
    const isAdmin = usuarioActual.rol === 'admin';
    const rutas = isAdmin ? 
        [{id:'stats', n:'Dashboard', i:'chart-pie'}, {id:'stock', n:'Inventario', i:'box'}, {id:'solicitudes', n:'Aprobar', i:'check'}, {id:'historial', n:'Historial', i:'history'}, {id:'usuarios', n:'Usuarios', i:'users'}] :
        [{id:'stock', n:'Stock', i:'box'}, {id:'solicitar', n:'Pedir', i:'plus'}, {id:'mis-pedidos', n:'Mis Pedidos', i:'clock'}];

    menu.innerHTML = rutas.map(r => `
        <button onclick="verPagina('${r.id}')" class="w-full flex items-center gap-3 p-4 text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 rounded-xl transition font-bold">
            <i class="fas fa-${r.i} w-5 text-center"></i> ${r.n}
        </button>`).join('');
}

window.verPagina = (id) => {
    document.querySelectorAll(".view").forEach(v => v.classList.add("hidden"));
    document.getElementById(`pag-${id}`).classList.remove("hidden");
    if(window.innerWidth < 768) {
        document.getElementById("sidebar").classList.add("-translate-x-full");
        document.getElementById("sidebar-overlay").classList.add("hidden");
    }
};

// --- CRUD ---
window.abrirModalInsumo = () => document.getElementById("modal-insumo").classList.remove("hidden");
window.cerrarModalInsumo = () => document.getElementById("modal-insumo").classList.add("hidden");

window.agregarProducto = async () => {
    const nom = document.getElementById("nombre-prod").value.trim().toLowerCase();
    const cant = parseInt(document.getElementById("cantidad-prod").value);
    if(nom && !isNaN(cant)) {
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

window.procesarSolicitud = async () => {
    const ins = document.getElementById("sol-insumo").value.trim().toLowerCase();
    const cant = parseInt(document.getElementById("sol-cantidad").value);
    const ubi = document.getElementById("sol-ubicacion").value.trim();
    if(ins && cant > 0) {
        await addDoc(collection(db, "pedidos"), {
            usuarioId: usuarioActual.id, insumoNom: ins, cantidad: cant,
            ubicacion: ubi, estado: "pendiente", fecha: new Date().toLocaleString(), timestamp: new Date()
        });
        alert("Enviado"); verPagina('mis-pedidos');
    }
};

// --- SYNC ---
function activarSincronizacion() {
    onSnapshot(collection(db, "inventario"), snap => {
        const list = document.getElementById("lista-inventario");
        const sug = document.getElementById("productos-sugeridos");
        let lbls = [], vals = [], total = 0;
        list.innerHTML = ""; sug.innerHTML = "";
        snap.forEach(d => {
            const p = d.data();
            total += p.cantidad; lbls.push(d.id.toUpperCase()); vals.push(p.cantidad);
            list.innerHTML += `<div class="bg-white p-4 rounded-xl border flex justify-between items-center">
                <div><b class="uppercase">${d.id}</b><p class="text-xs text-slate-500">Stock: ${p.cantidad}</p></div>
                ${usuarioActual.rol === 'admin' ? `<button onclick="eliminarDato('inventario','${d.id}')" class="text-red-300"><i class="fas fa-trash"></i></button>` : ''}
            </div>`;
            sug.innerHTML += `<option value="${d.id}">`;
        });
        if(document.getElementById("metrica-total")) document.getElementById("metrica-total").innerText = snap.size;
        if(document.getElementById("metrica-stock")) document.getElementById("metrica-stock").innerText = total;
        actualizarGrafica(lbls, vals);
    });

    onSnapshot(collection(db, "pedidos"), snap => {
        const lPend = document.getElementById("lista-pendientes-admin");
        const lMis = document.getElementById("lista-mis-pedidos");
        const tHist = document.getElementById("tabla-historial");
        let pCount = 0;
        lPend.innerHTML = ""; lMis.innerHTML = ""; tHist.innerHTML = "";

        const docs = [];
        snap.forEach(doc => docs.push({ id: doc.id, ...doc.data() }));
        docs.sort((a,b) => b.timestamp - a.timestamp);

        docs.forEach(p => {
            const st = `status-${p.estado}`;
            if(usuarioActual.rol === 'admin') {
                tHist.innerHTML += `<tr><td class="p-4 text-xs">${p.fecha}</td><td class="p-4 font-bold uppercase">${p.usuarioId}</td><td class="p-4 uppercase">${p.insumoNom}</td><td class="p-4">${p.cantidad}</td><td class="p-4"><span class="badge ${st}">${p.estado}</span></td></tr>`;
            }
            if(usuarioActual.rol === 'admin' && p.estado === 'pendiente') {
                pCount++;
                lPend.innerHTML += `<div class="bg-white p-4 rounded-xl border flex justify-between items-center">
                    <div class="text-sm"><b class="uppercase">${p.insumoNom}</b> (x${p.cantidad})<br><small>${p.usuarioId}</small></div>
                    <div class="flex gap-2">
                        <button onclick="gestionarPedido('${p.id}','aprobar','${p.insumoNom}',${p.cantidad})" class="bg-indigo-600 text-white p-2 rounded-lg text-xs font-bold">Aprobar</button>
                        <button onclick="gestionarPedido('${p.id}','rechazar')" class="bg-slate-100 p-2 rounded-lg text-xs font-bold">No</button>
                    </div>
                </div>`;
            }
            if(p.usuarioId === usuarioActual.id) {
                lMis.innerHTML += `<div class="bg-white p-4 rounded-xl border flex justify-between items-center">
                    <div><b class="uppercase">${p.insumoNom}</b><p class="text-[10px] text-slate-400">${p.fecha}</p></div>
                    <span class="badge ${st}">${p.estado}</span>
                </div>`;
            }
        });
        if(document.getElementById("metrica-pedidos")) document.getElementById("metrica-pedidos").innerText = pCount;
    });

    if(usuarioActual.rol === 'admin') {
        onSnapshot(collection(db, "usuarios"), snap => {
            const uList = document.getElementById("lista-usuarios-db");
            uList.innerHTML = "";
            snap.forEach(d => {
                uList.innerHTML += `<div class="bg-white p-4 rounded-xl border flex justify-between items-center">
                    <div><b>${d.id}</b><p class="text-[10px] uppercase text-indigo-400 font-bold">${d.data().rol}</p></div>
                    <button onclick="eliminarDato('usuarios','${d.id}')" class="text-red-200"><i class="fas fa-trash"></i></button>
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
        } else { alert("Stock insuficiente"); }
    } else { await updateDoc(pRef, { estado: "rechazado" }); }
};

window.eliminarDato = async (col, id) => { if(confirm("¿Eliminar?")) await deleteDoc(doc(db, col, id)); };
window.cerrarSesion = () => location.reload();
function actualizarGrafica(l, d) {
    const ctx = document.getElementById('stockChart');
    if(!ctx) return;
    if(stockChart) stockChart.destroy();
    stockChart = new Chart(ctx, { type: 'bar', data: { labels: l, datasets: [{ label: 'Stock', data: d, backgroundColor: '#6366f1' }] } });
}