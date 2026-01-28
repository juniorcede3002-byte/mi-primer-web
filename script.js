import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, collection, onSnapshot, deleteDoc, updateDoc, addDoc, getDocs } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyA3cRmakg2dV2YRuNV1fY7LE87artsLmB8",
    authDomain: "mi-web-db.firebaseapp.com",
    projectId: "mi-web-db",
    storageBucket: "mi-web-db.appspot.com"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

let usuarioActual = null;
let stockChart = null, userChart = null, locationChart = null;
let carritoGlobal = {}; // Para guardar las cantidades seleccionadas

emailjs.init("2jVnfkJKKG0bpKN-U");

window.addEventListener('DOMContentLoaded', () => {
    const sesionGuardada = localStorage.getItem("fcilog_session");
    if (sesionGuardada) cargarSesion(JSON.parse(sesionGuardada));
});

function cargarSesion(datos) {
    usuarioActual = datos;
    localStorage.setItem("fcilog_session", JSON.stringify(datos));
    document.getElementById("pantalla-login").classList.add("hidden");
    document.getElementById("interfaz-app").classList.remove("hidden");
    if(datos.rol === 'admin') document.getElementById("btn-admin-stock")?.classList.remove("hidden");
    configurarMenu();
    window.verPagina(datos.rol === 'admin' ? 'stats' : 'stock');
    activarSincronizacion();
}

window.iniciarSesion = async () => {
    const user = document.getElementById("login-user").value.trim().toLowerCase();
    const pass = document.getElementById("login-pass").value.trim();
    if (user === "admin" && pass === "1130") {
        cargarSesion({ id: "admin", rol: "admin", email: "archivos@fcipty.com" });
    } else {
        const snap = await getDoc(doc(db, "usuarios", user));
        if (snap.exists() && snap.data().pass === pass) cargarSesion({ id: user, ...snap.data() });
        else alert("Credenciales incorrectas");
    }
};

window.cerrarSesion = () => { localStorage.removeItem("fcilog_session"); location.reload(); };

window.verPagina = (id) => {
    document.querySelectorAll(".view").forEach(v => v.classList.add("hidden"));
    document.getElementById(`pag-${id}`)?.classList.remove("hidden");
    if(window.innerWidth < 1024) toggleMenu(false);
};

window.toggleMenu = (open) => {
    const side = document.getElementById("sidebar");
    const over = document.getElementById("sidebar-overlay");
    if(open === false) { side.classList.add("-translate-x-full"); over.classList.add("hidden"); }
    else { side.classList.toggle("-translate-x-full"); over.classList.toggle("hidden"); }
};

window.ajustarCantidad = (insumo, delta) => {
    const actual = carritoGlobal[insumo] || 0;
    const nueva = Math.max(0, actual + delta);
    carritoGlobal[insumo] = nueva;
    document.getElementById(`cant-${insumo}`).innerText = nueva;
};

window.procesarSolicitudMultiple = async () => {
    const ubi = document.getElementById("sol-ubicacion").value;
    const itemsParaPedir = Object.entries(carritoGlobal).filter(([_, cant]) => cant > 0);

    if(!ubi || itemsParaPedir.length === 0) return alert("Seleccione sede y al menos un insumo.");

    for(const [insumo, cantidad] of itemsParaPedir) {
        await addDoc(collection(db, "pedidos"), {
            usuarioId: usuarioActual.id,
            insumoNom: insumo,
            cantidad: cantidad,
            ubicacion: ubi,
            estado: "pendiente",
            fecha: new Date().toLocaleString(),
            timestamp: Date.now()
        });
        enviarMail("archivos@fcipty.com", { usuario: usuarioActual.id, insumo, cantidad, estado: "NUEVA", ubicacion: ubi });
    }

    alert("Pedido enviado con éxito.");
    // Resetear
    carritoGlobal = {};
    activarSincronizacion(); // Refresca la lista
    window.verPagina(usuarioActual.rol === 'admin' ? 'solicitudes' : 'notificaciones');
};

function activarSincronizacion() {
    onSnapshot(collection(db, "inventario"), snap => {
        const listInv = document.getElementById("lista-inventario");
        const listPed = document.getElementById("contenedor-lista-pedidos");
        const dl = document.getElementById("admin-stock-dl");
        
        listInv.innerHTML = "";
        if(listPed) listPed.innerHTML = "";
        if(dl) dl.innerHTML = "";

        let lbs = [], vls = [], tot = 0;

        snap.forEach(d => {
            const p = d.data(); const n = d.id;
            tot += p.cantidad; lbs.push(n.toUpperCase()); vls.push(p.cantidad);

            // Vista Stock
            listInv.innerHTML += `
                <div class="bg-white p-5 rounded-2xl border flex justify-between items-center shadow-sm">
                    <div><b class="uppercase">${n}</b><p class="text-xs text-slate-400 font-bold">Stock: ${p.cantidad}</p></div>
                    ${usuarioActual.rol === 'admin' ? `<button onclick="eliminarDato('inventario','${n}')" class="text-red-400"><i class="fas fa-trash"></i></button>` : ''}
                </div>`;
            
            // Vista Solicitar (Lista con +/-)
            if(listPed && p.cantidad > 0) {
                listPed.innerHTML += `
                    <div class="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                        <span class="font-bold uppercase text-slate-700">${n}</span>
                        <div class="flex items-center gap-4 bg-white px-3 py-1 rounded-xl shadow-sm border">
                            <button onclick="ajustarCantidad('${n}', -1)" class="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 font-bold">-</button>
                            <span id="cant-${n}" class="w-6 text-center font-bold text-indigo-600">${carritoGlobal[n] || 0}</span>
                            <button onclick="ajustarCantidad('${n}', 1)" class="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-600 hover:bg-indigo-200 font-bold">+</button>
                        </div>
                    </div>`;
            }
            if(dl) dl.innerHTML += `<option value="${n}">`;
        });

        if(usuarioActual.rol === 'admin') {
            document.getElementById("metrica-total").innerText = snap.size;
            document.getElementById("metrica-stock").innerText = tot;
            renderChart('stockChart', lbs, vls, 'Stock', '#6366f1', stockChart, c => stockChart = c);
        }
    });

    onSnapshot(collection(db, "pedidos"), snap => {
        const lAdmin = document.getElementById("lista-pendientes-admin");
        const lUser = document.getElementById("lista-notificaciones");
        const tHist = document.getElementById("tabla-historial-body");
        if(lAdmin) lAdmin.innerHTML = ""; if(lUser) lUser.innerHTML = ""; if(tHist) tHist.innerHTML = "";

        snap.forEach(d => {
            const p = d.data();
            if(usuarioActual.rol === 'admin' && p.estado === 'pendiente') {
                lAdmin.innerHTML += `<div class="bg-white p-5 rounded-2xl border flex justify-between items-center border-l-4 border-l-amber-400">
                    <div><b>${p.insumoNom.toUpperCase()} (x${p.cantidad})</b><br><small class="text-indigo-600 font-bold">${p.ubicacion}</small></div>
                    <div class="flex gap-2">
                        <button onclick="gestionarPedido('${d.id}','aprobar','${p.insumoNom}',${p.cantidad})" class="bg-indigo-600 text-white px-4 py-2 rounded-xl text-xs font-bold">Aprobar</button>
                        <button onclick="gestionarPedido('${d.id}','rechazar')" class="bg-slate-100 px-4 py-2 rounded-xl text-xs font-bold text-red-500">X</button>
                    </div>
                </div>`;
            }
            if(p.estado !== 'pendiente' && tHist) {
                tHist.innerHTML += `<tr class="border-b"><td class="p-4 text-slate-500 text-xs">${p.fecha}</td><td class="p-4 font-bold uppercase">${p.insumoNom}</td><td class="p-4">x${p.cantidad}</td><td class="p-4 text-indigo-600 font-bold">${p.ubicacion}</td><td class="p-4 text-xs">${p.usuarioId}</td><td class="p-4"><span class="badge status-${p.estado}">${p.estado}</span></td></tr>`;
            }
            if(p.usuarioId === usuarioActual.id && lUser) {
                lUser.innerHTML += `<div class="notif-card flex justify-between items-center p-4 bg-white rounded-2xl border"><div><b>${p.insumoNom.toUpperCase()} (x${p.cantidad})</b><br><small>${p.ubicacion}</small></div><span class="badge status-${p.estado}">${p.estado}</span></div>`;
            }
        });
    });
}

window.gestionarPedido = async (pid, accion, ins, cant) => {
    const pRef = doc(db, "pedidos", pid);
    if(accion === 'aprobar') {
        const iRef = doc(db, "inventario", ins.toLowerCase());
        const iSnap = await getDoc(iRef);
        if(iSnap.exists() && iSnap.data().cantidad >= cant) {
            await updateDoc(iRef, { cantidad: iSnap.data().cantidad - cant });
            await updateDoc(pRef, { estado: "aprobado" });
        } else alert("Sin stock suficiente");
    } else await updateDoc(pRef, { estado: "rechazado" });
};

// ... (Otras funciones: agregarProducto, crearUsuario, eliminarDato, descargarReporte, enviarMail, renderChart se mantienen igual)
window.abrirModalInsumo = () => document.getElementById("modal-insumo").classList.remove("hidden");
window.cerrarModalInsumo = () => document.getElementById("modal-insumo").classList.add("hidden");
window.eliminarDato = async (col, id) => { if(confirm("¿Eliminar?")) await deleteDoc(doc(db, col, id)); };

function configurarMenu() {
    const menu = document.getElementById("menu-dinamico");
    const isAdmin = usuarioActual.rol === 'admin';
    const rutas = isAdmin ? 
        [{id:'stats', n:'Dashboard', i:'chart-line'}, {id:'stock', n:'Stock', i:'box'}, {id:'solicitar', n:'Realizar Pedido', i:'cart-plus'}, {id:'solicitudes', n:'Pendientes', i:'bell'}, {id:'historial', n:'Historial', i:'clock'}, {id:'usuarios', n:'Usuarios', i:'users'}] :
        [{id:'stock', n:'Stock', i:'eye'}, {id:'solicitar', n:'Pedir Insumos', i:'plus'}, {id:'notificaciones', n:'Mis Pedidos', i:'history'}];

    menu.innerHTML = rutas.map(r => `
        <button onclick="verPagina('${r.id}')" class="w-full flex items-center gap-3 p-4 text-slate-600 hover:bg-indigo-50 rounded-xl transition font-bold">
            <i class="fas fa-${r.i} w-6"></i> ${r.n}
        </button>`).join('');
}

function renderChart(id, labels, data, title, color, instance, setInst) {
    const ctx = document.getElementById(id);
    if(!ctx) return;
    if(instance) instance.destroy();
    setInst(new Chart(ctx, {
        type: 'bar',
        data: { labels, datasets: [{ label: title, data, backgroundColor: color, borderRadius: 8 }] },
        options: { responsive: true, plugins: { legend: { display: false } } }
    }));
}
