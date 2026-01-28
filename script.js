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
let stockChart = null, userChart = null, locationChart = null, insumoChart = null;

// --- PERSISTENCIA DE SESIÓN ---
window.addEventListener('DOMContentLoaded', () => {
    const sesionGuardada = localStorage.getItem("fcilog_session");
    if (sesionGuardada) {
        cargarSesion(JSON.parse(sesionGuardada));
    }
});

window.iniciarSesion = async () => {
    const user = document.getElementById("login-user").value.trim().toLowerCase();
    const pass = document.getElementById("login-pass").value.trim();

    if (user === "admin" && pass === "1130") {
        cargarSesion({ id: "admin", rol: "admin", email: "archivos@fcipty.com", nombre: "Administrador" });
    } else {
        const snap = await getDoc(doc(db, "usuarios", user));
        if (snap.exists() && snap.data().pass === pass) {
            cargarSesion({ id: user, ...snap.data() });
        } else { alert("Usuario o clave incorrectos"); }
    }
};

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

window.cerrarSesion = () => {
    localStorage.removeItem("fcilog_session");
    location.reload();
};

// --- GESTIÓN DE INVENTARIO (CON PRECIO Y MÍNIMO) ---
window.agregarProducto = async () => {
    const n = document.getElementById("nombre-prod").value.trim().toLowerCase();
    const c = parseInt(document.getElementById("cantidad-prod").value);
    const p = parseFloat(document.getElementById("precio-prod").value) || 0;
    const m = parseInt(document.getElementById("minimo-prod").value) || 0;

    if(n && !isNaN(c)) {
        await setDoc(doc(db, "inventario", n), { 
            cantidad: c, 
            precio: p, 
            stockMinimo: m 
        }, { merge: true });

        await addDoc(collection(db, "entradas_stock"), {
            insumo: n, cantidad: c, usuario: usuarioActual.id,
            fecha: new Date().toLocaleString(), timestamp: Date.now()
        });
        
        cerrarModalInsumo();
        alert("Insumo guardado correctamente.");
    }
};

window.actualizarParametros = async (id) => {
    const p = parseFloat(document.getElementById(`edit-p-${id}`).value);
    const m = parseInt(document.getElementById(`edit-m-${id}`).value);
    await updateDoc(doc(db, "inventario", id), { precio: p, stockMinimo: m });
    alert("Valores actualizados");
};

// --- SINCRONIZACIÓN REAL-TIME ---
function activarSincronizacion() {
    // Escuchar Inventario
    onSnapshot(collection(db, "inventario"), snap => {
        const list = document.getElementById("lista-inventario");
        const sel = document.getElementById("sol-insumo");
        list.innerHTML = "";
        if(sel) sel.innerHTML = '<option value="">Seleccionar Insumo...</option>';

        snap.forEach(d => {
            const data = d.data();
            const id = d.id;
            const esBajo = data.cantidad <= (data.stockMinimo || 0);

            list.innerHTML += `
                <div class="insumo-card ${esBajo ? 'border-red-500 bg-red-50' : ''}">
                    <div class="flex justify-between">
                        <b class="uppercase text-indigo-900">${id}</b>
                        <span class="font-black text-xl">${data.cantidad}</span>
                    </div>
                    ${usuarioActual.rol === 'admin' ? `
                        <div class="grid grid-cols-2 gap-2 mt-4 pt-4 border-t">
                            <div><label class="text-[10px] uppercase font-bold text-slate-400">Precio ($)</label>
                            <input id="edit-p-${id}" type="number" step="0.01" value="${data.precio || 0}" class="w-full bg-slate-100 p-2 rounded-lg text-sm"></div>
                            <div><label class="text-[10px] uppercase font-bold text-slate-400">Mínimo</label>
                            <input id="edit-m-${id}" type="number" value="${data.stockMinimo || 0}" class="w-full bg-slate-100 p-2 rounded-lg text-sm"></div>
                        </div>
                        <div class="flex gap-2">
                            <button onclick="actualizarParametros('${id}')" class="flex-1 bg-indigo-600 text-white text-[10px] py-2 rounded-lg font-bold mt-2">Guardar Cambios</button>
                            <button onclick="eliminarDato('inventario','${id}')" class="bg-red-100 text-red-500 px-3 rounded-lg mt-2"><i class="fas fa-trash"></i></button>
                        </div>
                    ` : `<p class="text-xs text-slate-500">Stock disponible para pedidos.</p>`}
                </div>`;
            if(sel) sel.innerHTML += `<option value="${id}">${id.toUpperCase()}</option>`;
        });
    });

    // Escuchar Historial y Usuarios (Solo Admin)
    if(usuarioActual.rol === 'admin') {
        onSnapshot(collection(db, "pedidos"), snap => {
            const tHist = document.getElementById("tabla-historial-body");
            const lAdmin = document.getElementById("lista-pendientes-admin");
            if(tHist) tHist.innerHTML = "";
            if(lAdmin) lAdmin.innerHTML = "";

            snap.forEach(doc => {
                const p = doc.data();
                if(p.estado === 'pendiente') {
                    lAdmin.innerHTML += `
                        <div class="notif-card">
                            <div><b>${p.insumoNom.toUpperCase()} (x${p.cantidad})</b><br><small>${p.ubicacion} - ${p.usuarioId}</small></div>
                            <div class="flex gap-2">
                                <button onclick="gestionarPedido('${doc.id}','aprobar','${p.insumoNom}',${p.cantidad})" class="bg-indigo-600 text-white px-4 py-2 rounded-xl text-xs font-bold">Aprobar</button>
                                <button onclick="gestionarPedido('${doc.id}','rechazar')" class="bg-slate-100 px-4 py-2 rounded-xl text-xs font-bold">X</button>
                            </div>
                        </div>`;
                } else {
                    tHist.innerHTML += `
                        <tr>
                            <td class="p-4">${p.fecha.split(',')[0]}</td>
                            <td class="p-4 font-bold uppercase">${p.insumoNom}</td>
                            <td class="p-4">x${p.cantidad}</td>
                            <td class="p-4 font-bold text-indigo-600">${p.ubicacion}</td>
                            <td class="p-4 text-xs">${p.usuarioId}</td>
                            <td class="p-4"><span class="badge status-${p.estado}">${p.estado}</span></td>
                        </tr>`;
                }
            });
        });

        onSnapshot(collection(db, "entradas_stock"), snap => {
            const tE = document.getElementById("tabla-entradas-body");
            if(tE) {
                tE.innerHTML = "";
                snap.forEach(d => {
                    const e = d.data();
                    tE.innerHTML += `<tr><td class="p-4 text-slate-400">${e.fecha}</td><td class="p-4 uppercase font-bold">${e.insumo}</td><td class="p-4 text-emerald-600 font-bold">+${e.cantidad}</td><td class="p-4 text-xs uppercase">${e.usuario}</td></tr>`;
                });
            }
        });

        onSnapshot(collection(db, "usuarios"), snap => {
            const listU = document.getElementById("lista-usuarios-db");
            if(listU) {
                listU.innerHTML = "";
                snap.forEach(d => {
                    listU.innerHTML += `
                        <div class="user-card">
                            <div><b class="text-indigo-900">${d.id}</b><br><small class="uppercase text-slate-400">${d.data().rol}</small></div>
                            <button onclick="eliminarDato('usuarios','${d.id}')" class="text-red-400"><i class="fas fa-trash-alt"></i></button>
                        </div>`;
                });
            }
        });
    } else {
        // Vista para el solicitante
        onSnapshot(collection(db, "pedidos"), snap => {
            const lUser = document.getElementById("lista-notificaciones");
            if(lUser) {
                lUser.innerHTML = "";
                snap.forEach(d => {
                    const p = d.data();
                    if(p.usuarioId === usuarioActual.id) {
                        lUser.innerHTML += `
                            <div class="notif-card">
                                <div><b>${p.insumoNom.toUpperCase()} (x${p.cantidad})</b><br><small>${p.fecha}</small></div>
                                <span class="badge status-${p.estado}">${p.estado}</span>
                            </div>`;
                    }
                });
            }
        });
    }
}

// FUNCIONES DE APOYO
window.toggleMenu = () => {
    document.getElementById("sidebar").classList.toggle("-translate-x-full");
    document.getElementById("sidebar-overlay").classList.toggle("hidden");
};
window.verPagina = (id) => {
    document.querySelectorAll(".view").forEach(v => v.classList.add("hidden"));
    document.getElementById(`pag-${id}`).classList.remove("hidden");
    if(window.innerWidth < 1024) toggleMenu();
};
window.abrirModalInsumo = () => document.getElementById("modal-insumo").classList.remove("hidden");
window.cerrarModalInsumo = () => document.getElementById("modal-insumo").classList.add("hidden");
window.eliminarDato = async (col, id) => { if(confirm("¿Seguro?")) await deleteDoc(doc(db, col, id)); };

window.gestionarPedido = async (pid, accion, ins, cant) => {
    const pRef = doc(db, "pedidos", pid);
    if(accion === 'aprobar') {
        const iRef = doc(db, "inventario", ins.toLowerCase());
        const iSnap = await getDoc(iRef);
        if(iSnap.exists() && iSnap.data().cantidad >= cant) {
            await updateDoc(iRef, { cantidad: iSnap.data().cantidad - cant });
            await updateDoc(pRef, { estado: "aprobado" });
        } else { alert("Stock insuficiente"); }
    } else { await updateDoc(pRef, { estado: "rechazado" }); }
};

window.crearUsuario = async () => {
    const id = document.getElementById("new-user").value.trim().toLowerCase();
    const p = document.getElementById("new-pass").value.trim();
    const e = document.getElementById("new-email").value.trim();
    const r = document.getElementById("new-role").value;
    if(id && p) await setDoc(doc(db, "usuarios", id), { pass: p, email: e, rol: r });
};

function configurarMenu() {
    const menu = document.getElementById("menu-dinamico");
    const isAdmin = usuarioActual.rol === 'admin';
    const rutas = isAdmin ? 
        [{id:'stats', n:'Dashboard', i:'chart-line'}, {id:'stock', n:'Inventario', i:'box'}, {id:'solicitudes', n:'Pendientes', i:'bell'}, {id:'historial', n:'Historial', i:'clock'}, {id:'usuarios', n:'Usuarios', i:'users'}] :
        [{id:'stock', n:'Stock', i:'eye'}, {id:'solicitar', n:'Pedir', i:'plus'}, {id:'notificaciones', n:'Mis Pedidos', i:'history'}];

    menu.innerHTML = rutas.map(r => `
        <button onclick="verPagina('${r.id}')" class="w-full flex items-center gap-3 p-4 text-slate-600 hover:bg-indigo-50 rounded-xl transition font-bold">
            <i class="fas fa-${r.i} w-6"></i> ${r.n}
        </button>`).join('');
}

window.procesarSolicitud = async () => {
    const ins = document.getElementById("sol-insumo").value;
    const cant = parseInt(document.getElementById("sol-cantidad").value);
    const ubi = document.getElementById("sol-ubicacion").value;
    if(!ins || !cant || !ubi) return alert("Completa los datos");
    await addDoc(collection(db, "pedidos"), {
        usuarioId: usuarioActual.id, insumoNom: ins, cantidad: cant, ubicacion: ubi,
        estado: "pendiente", fecha: new Date().toLocaleString(), timestamp: Date.now()
    });
    alert("Pedido enviado");
};