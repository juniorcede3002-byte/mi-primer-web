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
let carritoGlobal = {}; 

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
    
    // Configuración específica de Admin
    if(datos.rol === 'admin') {
        document.getElementById("btn-admin-stock")?.classList.remove("hidden");
    }

    configurarMenu();
    // Redirigir según rol
    const paginaInicio = (datos.rol === 'admin' || datos.rol === 'supervisor') ? 'stats' : 'stock';
    window.verPagina(paginaInicio);
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

// --- CARRITO ---
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

    alert("✅ Solicitud enviada correctamente.");
    carritoGlobal = {};
    activarSincronizacion();
    window.verPagina('notificaciones');
};

// --- CONFIRMAR RECIBIDO (USUARIO) ---
window.confirmarRecibido = async (pid) => {
    if(confirm("¿Confirmar que has recibido este insumo?")) {
        await updateDoc(doc(db, "pedidos", pid), { estado: "recibido" });
        alert("¡Confirmado! El pedido se ha cerrado.");
    }
};

// --- GESTIÓN DE USUARIOS ---
window.crearUsuario = async () => {
    const id = document.getElementById("new-user").value.trim().toLowerCase();
    const pass = document.getElementById("new-pass").value.trim();
    const email = document.getElementById("new-email").value.trim();
    const rol = document.getElementById("new-role").value;
    
    if(id && pass) {
        await setDoc(doc(db, "usuarios", id), { pass, email, rol });
        alert("Usuario guardado/actualizado correctamente");
        document.getElementById("new-user").value = "";
        document.getElementById("new-pass").value = "";
        document.getElementById("new-email").value = "";
    } else {
        alert("Falta ID o Contraseña");
    }
};

window.prepararEdicion = (id, pass, email, rol) => {
    document.getElementById("new-user").value = id;
    document.getElementById("new-pass").value = pass;
    document.getElementById("new-email").value = email;
    document.getElementById("new-role").value = rol;
    alert(`Editando usuario: ${id}.`);
};

// --- SINCRONIZACIÓN ---
function activarSincronizacion() {
    // 1. Stock
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

            // Mostrar botón eliminar SOLO si es ADMIN (no supervisor)
            const btnEliminar = usuarioActual.rol === 'admin' 
                ? `<button onclick="eliminarDato('inventario','${n}')" class="text-red-400"><i class="fas fa-trash"></i></button>` 
                : '';

            listInv.innerHTML += `
                <div class="bg-white p-5 rounded-2xl border flex justify-between items-center shadow-sm">
                    <div><b class="uppercase">${n}</b><p class="text-xs text-slate-400 font-bold">Stock: ${p.cantidad}</p></div>
                    ${btnEliminar}
                </div>`;
            
            // Carrito (Solo usuarios)
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

        if(usuarioActual.rol === 'admin' || usuarioActual.rol === 'supervisor') {
            document.getElementById("metrica-total").innerText = snap.size;
            document.getElementById("metrica-stock").innerText = tot;
            renderChart('stockChart', lbs, vls, 'Stock', '#6366f1', stockChart, c => stockChart = c);
        }
    });

    // 2. Pedidos
    onSnapshot(collection(db, "pedidos"), snap => {
        const lAdmin = document.getElementById("lista-pendientes-admin");
        const lUser = document.getElementById("lista-notificaciones");
        const tHist = document.getElementById("tabla-historial-body");
        if(lAdmin) lAdmin.innerHTML = ""; if(lUser) lUser.innerHTML = ""; if(tHist) tHist.innerHTML = "";

        snap.forEach(d => {
            const p = d.data();
            
            // PANEL ADMIN/SUPERVISOR (Pendientes)
            if((usuarioActual.rol === 'admin' || usuarioActual.rol === 'supervisor') && p.estado === 'pendiente') {
                // Si es admin, botones de acción. Si es supervisor, solo texto "Pendiente".
                const acciones = usuarioActual.rol === 'admin' 
                    ? `<div class="flex gap-2">
                        <button onclick="gestionarPedido('${d.id}','aprobar','${p.insumoNom}',${p.cantidad})" class="bg-indigo-600 text-white px-4 py-2 rounded-xl text-xs font-bold">Aprobar</button>
                        <button onclick="gestionarPedido('${d.id}','rechazar')" class="bg-slate-100 px-4 py-2 rounded-xl text-xs font-bold text-red-500">X</button>
                       </div>`
                    : `<span class="badge status-pendiente">Solo Lectura</span>`;

                lAdmin.innerHTML += `
                <div class="bg-white p-5 rounded-2xl border flex justify-between items-center border-l-4 border-l-amber-400">
                    <div>
                        <b>${p.insumoNom.toUpperCase()} (x${p.cantidad})</b><br>
                        <div class="flex items-center gap-2 text-xs mt-1">
                            <span class="bg-indigo-50 text-indigo-700 px-2 py-1 rounded font-bold"><i class="fas fa-user"></i> ${p.usuarioId}</span>
                            <span class="text-slate-500 font-bold"><i class="fas fa-map-marker-alt"></i> ${p.ubicacion}</span>
                        </div>
                    </div>
                    ${acciones}
                </div>`;
            }

            // HISTORIAL GENERAL (Excluye pendientes)
            if(p.estado !== 'pendiente' && tHist) {
                tHist.innerHTML += `<tr class="border-b"><td class="p-4 text-slate-500 text-xs">${p.fecha}</td><td class="p-4 font-bold uppercase">${p.insumoNom}</td><td class="p-4">x${p.cantidad}</td><td class="p-4 text-indigo-600 font-bold">${p.ubicacion}</td><td class="p-4 text-xs font-bold text-slate-600">${p.usuarioId}</td><td class="p-4"><span class="badge status-${p.estado}">${p.estado}</span></td></tr>`;
            }

            // PANEL USUARIO (Mis Pedidos)
            if(p.usuarioId === usuarioActual.id && lUser) {
                // Si está aprobado, mostrar botón confirmar
                let estadoHTML = `<span class="badge status-${p.estado}">${p.estado}</span>`;
                if(p.estado === 'aprobado') {
                    estadoHTML = `<button onclick="confirmarRecibido('${d.id}')" class="bg-emerald-500 text-white px-3 py-1 rounded-lg text-xs font-bold shadow-md hover:bg-emerald-600">Confirmar Recibido</button>`;
                }

                lUser.innerHTML += `
                <div class="notif-card flex justify-between items-center p-4 bg-white rounded-2xl border">
                    <div><b>${p.insumoNom.toUpperCase()} (x${p.cantidad})</b><br><small>${p.ubicacion}</small></div>
                    ${estadoHTML}
                </div>`;
            }
        });
    });

    // 3. Entradas
    onSnapshot(collection(db, "entradas_stock"), snap => {
        const tEnt = document.getElementById("tabla-entradas-body");
        if(tEnt) {
            tEnt.innerHTML = "";
            let data = [];
            snap.forEach(d => data.push(d.data()));
            data.sort((a,b) => b.timestamp - a.timestamp);
            data.forEach(e => {
                tEnt.innerHTML += `
                    <tr class="border-b">
                        <td class="p-4 text-slate-500 text-xs">${e.fecha}</td>
                        <td class="p-4 font-bold uppercase text-emerald-800">${e.insumo}</td>
                        <td class="p-4 font-bold text-emerald-600">+${e.cantidad}</td>
                        <td class="p-4 text-xs text-slate-400 font-bold">${e.usuario}</td>
                    </tr>`;
            });
        }
    });

    // 4. Usuarios (Solo visible si es admin)
    if(usuarioActual.rol === 'admin') {
        onSnapshot(collection(db, "usuarios"), snap => {
            const listUsers = document.getElementById("lista-usuarios-db");
            if(listUsers) {
                listUsers.innerHTML = "";
                snap.forEach(d => {
                    const u = d.data();
                    listUsers.innerHTML += `
                    <div class="bg-slate-50 p-4 rounded-2xl border flex justify-between items-center hover:bg-white transition shadow-sm">
                        <div>
                            <div class="font-bold text-indigo-900 flex items-center gap-2">
                                ${d.id} 
                                <span class="text-[10px] bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full uppercase">${u.rol}</span>
                            </div>
                            <small class="text-slate-400 block mt-1">Pass: ${u.pass}</small>
                        </div>
                        <div class="flex gap-2">
                            <button onclick="prepararEdicion('${d.id}', '${u.pass}', '${u.email || ''}', '${u.rol}')" class="w-8 h-8 rounded-lg bg-white text-indigo-500 border border-indigo-100 hover:bg-indigo-50 flex items-center justify-center"><i class="fas fa-pen text-xs"></i></button>
                            <button onclick="eliminarDato('usuarios','${d.id}')" class="w-8 h-8 rounded-lg bg-white text-red-400 border border-red-100 hover:bg-red-50 flex items-center justify-center"><i class="fas fa-trash text-xs"></i></button>
                        </div>
                    </div>`;
                });
            }
        });
    }
}

// --- DESCARGAR REPORTES ---
window.descargarReporte = async () => {
    if(!confirm("¿Descargar reporte completo?")) return;
    const stockSnap = await getDocs(collection(db, "inventario"));
    const entradasSnap = await getDocs(collection(db, "entradas_stock"));
    const salidasSnap = await getDocs(collection(db, "pedidos"));

    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "=== STOCK ACTUAL ===\r\nINSUMO,CANTIDAD\r\n";
    stockSnap.forEach(doc => csvContent += `${doc.id.toUpperCase()},${doc.data().cantidad}\r\n`);
    
    csvContent += "\r\n=== ENTRADAS ===\r\nFECHA,INSUMO,CANTIDAD,RESPONSABLE\r\n";
    entradasSnap.forEach(doc => { const d=doc.data(); csvContent += `${d.fecha.replace(/,/g, '')},${d.insumo},${d.cantidad},${d.usuario}\r\n`; });

    csvContent += "\r\n=== SALIDAS ===\r\nFECHA,INSUMO,CANTIDAD,SEDE,USUARIO,ESTADO\r\n";
    salidasSnap.forEach(doc => { const d=doc.data(); if(d.estado !== 'pendiente') csvContent += `${d.fecha.replace(/,/g, '')},${d.insumoNom},${d.cantidad},${d.ubicacion},${d.usuarioId},${d.estado}\r\n`; });

    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csvContent));
    link.setAttribute("download", "Reporte_FCILog_Completo.csv");
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
};

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

window.agregarProducto = async () => {
    const n = document.getElementById("nombre-prod").value.trim().toLowerCase();
    const c = parseInt(document.getElementById("cantidad-prod").value);
    if(n && !isNaN(c) && c > 0) {
        const docRef = doc(db, "inventario", n);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) await updateDoc(docRef, { cantidad: docSnap.data().cantidad + c });
        else await setDoc(docRef, { cantidad: c });
        await addDoc(collection(db, "entradas_stock"), { insumo: n, cantidad: c, usuario: usuarioActual.id, fecha: new Date().toLocaleString(), timestamp: Date.now() });
        window.cerrarModalInsumo(); document.getElementById("nombre-prod").value = ""; document.getElementById("cantidad-prod").value = "";
    }
};

window.abrirModalInsumo = () => document.getElementById("modal-insumo").classList.remove("hidden");
window.cerrarModalInsumo = () => document.getElementById("modal-insumo").classList.add("hidden");
window.eliminarDato = async (col, id) => { if(confirm("¿Eliminar?")) await deleteDoc(doc(db, col, id)); };

function configurarMenu() {
    const menu = document.getElementById("menu-dinamico");
    let rutas = [];

    if(usuarioActual.rol === 'admin') {
        rutas = [
            {id:'stats', n:'Dashboard', i:'chart-line'}, 
            {id:'stock', n:'Stock', i:'box'}, 
            {id:'solicitar', n:'Realizar Pedido', i:'cart-plus'}, 
            {id:'solicitudes', n:'Pendientes', i:'bell'}, 
            {id:'historial', n:'Historial', i:'clock'}, 
            {id:'usuarios', n:'Usuarios', i:'users'}
        ];
    } else if (usuarioActual.rol === 'supervisor') {
        // Supervisor ve todo menos pedir y usuarios
        rutas = [
            {id:'stats', n:'Dashboard', i:'chart-line'}, 
            {id:'stock', n:'Stock (Ver)', i:'eye'}, 
            {id:'solicitudes', n:'Solicitudes', i:'list-ul'}, 
            {id:'historial', n:'Historial', i:'clock'}
        ];
    } else {
        // Usuario normal
        rutas = [
            {id:'stock', n:'Stock', i:'eye'}, 
            {id:'solicitar', n:'Pedir Insumos', i:'plus'}, 
            {id:'notificaciones', n:'Mis Pedidos', i:'history'}
        ];
    }

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

async function enviarMail(dest, info) { console.log("Email simulado a", dest); }
