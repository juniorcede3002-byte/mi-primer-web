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

// --- INICIALIZAR EMAILJS ---
emailjs.init("2jVnfkJKKG0bpKN-U"); 

// --- LOGIN ---
window.iniciarSesion = async () => {
    const user = document.getElementById("login-user").value.trim().toLowerCase();
    const pass = document.getElementById("login-pass").value.trim();

    if (user === "admin" && pass === "1130") {
        cargarSesion({ id: "admin", rol: "admin", email: "Archivos@fcipty.com" });
    } else {
        const snap = await getDoc(doc(db, "usuarios", user));
        if (snap.exists() && snap.data().pass === pass) {
            cargarSesion({ id: user, ...snap.data() });
        } else { alert("Error de acceso"); }
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
        [{id:'stats', n:'Dashboard', i:'chart-line'}, {id:'stock', n:'Stock', i:'box'}, {id:'solicitudes', n:'Pendientes', i:'bell'}, {id:'usuarios', n:'Usuarios', i:'users'}] :
        [{id:'stock', n:'Inventario', i:'eye'}, {id:'solicitar', n:'Pedir', i:'plus'}, {id:'notificaciones', n:'Notificaciones', i:'envelope'}];

    menu.innerHTML = rutas.map(r => `
        <button onclick="verPagina('${r.id}')" class="w-full flex items-center gap-3 p-4 text-slate-600 hover:bg-indigo-50 rounded-xl font-bold">
            <i class="fas fa-${r.i} w-6"></i> ${r.n}
        </button>`).join('');
}

window.verPagina = (id) => {
    document.querySelectorAll(".view").forEach(v => v.classList.add("hidden"));
    document.getElementById(`pag-${id}`).classList.remove("hidden");
    if(window.innerWidth < 1024) {
        document.getElementById("sidebar").classList.add("-translate-x-full");
        document.getElementById("sidebar-overlay").classList.add("hidden");
    }
};

// --- ENVÍO DE CORREOS ---
async function enviarNotificacion(emailDestino, info) {
    // INFO debe contener: usuario, insumo, cantidad, ubicacion, estado
    emailjs.send("default_service", "TU_TEMPLATE_ID", {
        destinatario: emailDestino,
        usuario: info.usuario,
        insumo: info.insumo,
        cantidad: info.cantidad,
        ubicacion: info.ubicacion,
        estado: info.estado
    }).then(() => console.log("Email enviado"), (e) => console.log("Error Email", e));
}

// --- LÓGICA DE NEGOCIO ---
window.crearUsuario = async () => {
    const id = document.getElementById("new-user").value.trim().toLowerCase();
    const pass = document.getElementById("new-pass").value.trim();
    const email = document.getElementById("new-email").value.trim();
    const rol = document.getElementById("new-role").value;
    if(id && pass && email) await setDoc(doc(db, "usuarios", id), { pass, email, rol });
};

window.procesarSolicitud = async () => {
    const ins = document.getElementById("sol-insumo").value.trim();
    const cant = parseInt(document.getElementById("sol-cantidad").value);
    const ubi = document.getElementById("sol-ubicacion").value.trim();

    if(ins && cant > 0) {
        await addDoc(collection(db, "pedidos"), {
            usuarioId: usuarioActual.id, insumoNom: ins, cantidad: cant,
            ubicacion: ubi, estado: "pendiente", fecha: new Date().toLocaleString(), timestamp: new Date()
        });

        // Correo a Archivos@fcipty.com
        enviarNotificacion("Archivos@fcipty.com", {
            usuario: usuarioActual.id, insumo: ins, cantidad: cant, ubicacion: ubi, estado: "PENDIENTE"
        });

        alert("Solicitud Enviada");
        verPagina('stock');
    }
};

window.gestionarPedido = async (id, accion, ins, cant) => {
    const pRef = doc(db, "pedidos", id);
    const pSnap = await getDoc(pRef);
    const pData = pSnap.data();
    
    const uSnap = await getDoc(doc(db, "usuarios", pData.usuarioId));
    const userEmail = uSnap.exists() ? uSnap.data().email : "";

    if(accion === 'aprobar') {
        const iRef = doc(db, "inventario", ins.toLowerCase());
        const iSnap = await getDoc(iRef);
        if(iSnap.exists() && iSnap.data().cantidad >= cant) {
            await updateDoc(iRef, { cantidad: iSnap.data().cantidad - cant });
            await updateDoc(pRef, { estado: "aprobado" });
            
            await addDoc(collection(db, "notificaciones"), { para: pData.usuarioId, mensaje: `Aprobado: ${ins}`, fecha: new Date().toLocaleString() });
            
            if(userEmail) enviarNotificacion(userEmail, { usuario: pData.usuarioId, insumo: ins, cantidad: cant, ubicacion: pData.ubicacion, estado: "APROBADO" });
        }
    } else {
        await updateDoc(pRef, { estado: "rechazado" });
        if(userEmail) enviarNotificacion(userEmail, { usuario: pData.usuarioId, insumo: ins, cantidad: cant, ubicacion: pData.ubicacion, estado: "RECHAZADO" });
    }
};

// --- SINCRONIZACIÓN ---
function activarSincronizacion() {
    onSnapshot(collection(db, "inventario"), snap => {
        const list = document.getElementById("lista-inventario");
        let lbs = [], vls = [], tot = 0;
        list.innerHTML = "";
        snap.forEach(d => {
            const p = d.data(); tot += p.cantidad; lbs.push(d.id.toUpperCase()); vls.push(p.cantidad);
            list.innerHTML += `<div class="bg-white p-5 rounded-2xl border flex justify-between items-center shadow-sm">
                <div><b class="uppercase">${d.id}</b><p class="text-xs text-slate-400 font-bold">Stock: ${p.cantidad}</p></div>
            </div>`;
        });
        if(document.getElementById("metrica-total")) document.getElementById("metrica-total").innerText = snap.size;
        if(document.getElementById("metrica-stock")) document.getElementById("metrica-stock").innerText = tot;
        actualizarGrafica(lbs, vls);
    });

    onSnapshot(collection(db, "pedidos"), snap => {
        const lPend = document.getElementById("lista-pendientes-admin");
        let pCnt = 0; lPend.innerHTML = "";
        snap.forEach(d => {
            const p = d.data();
            if(usuarioActual.rol === 'admin' && p.estado === 'pendiente') {
                pCnt++;
                lPend.innerHTML += `<div class="bg-white p-5 rounded-2xl border flex justify-between items-center">
                    <div><b>${p.insumoNom}</b> (x${p.cantidad})<br><small>${p.usuarioId}</small></div>
                    <div class="flex gap-2">
                        <button onclick="gestionarPedido('${d.id}','aprobar','${p.insumoNom}',${p.cantidad})" class="bg-indigo-600 text-white px-4 py-2 rounded-lg text-xs font-bold">Aprobar</button>
                        <button onclick="gestionarPedido('${d.id}','rechazar')" class="bg-slate-100 px-4 py-2 rounded-lg text-xs font-bold">Rechazar</button>
                    </div>
                </div>`;
            }
        });
        if(document.getElementById("metrica-pedidos")) document.getElementById("metrica-pedidos").innerText = pCnt;
    });
}

function actualizarGrafica(l, d) {
    const ctx = document.getElementById('stockChart');
    if(!ctx) return;
    if(stockChart) stockChart.destroy();
    stockChart = new Chart(ctx, { type: 'bar', data: { labels: l, datasets: [{ label: 'Stock', data: d, backgroundColor: '#6366f1' }] } });
}

window.cerrarSesion = () => location.reload();
window.abrirModalInsumo = () => document.getElementById("modal-insumo").classList.remove("hidden");
window.cerrarModalInsumo = () => document.getElementById("modal-insumo").classList.add("hidden");
window.agregarProducto = async () => {
    const n = document.getElementById("nombre-prod").value.trim().toLowerCase();
    const c = parseInt(document.getElementById("cantidad-prod").value);
    if(n && c >= 0) await setDoc(doc(db, "inventario", n), { cantidad: c });
    cerrarModalInsumo();
};