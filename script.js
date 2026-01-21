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
let stockChart = null;
let userChart = null;
let locationChart = null;
let insumoChart = null;

emailjs.init("2jVnfkJKKG0bpKN-U");

// --- FUNCIONES GLOBALES (ACCESIBLES DESDE HTML) ---

window.iniciarSesion = async () => {
    const user = document.getElementById("login-user").value.trim().toLowerCase();
    const pass = document.getElementById("login-pass").value.trim();

    if (user === "admin" && pass === "1130") {
        cargarSesion({ id: "admin", rol: "admin", email: "archivos@fcipty.com" });
    } else {
        const snap = await getDoc(doc(db, "usuarios", user));
        if (snap.exists() && snap.data().pass === pass) {
            cargarSesion({ id: user, ...snap.data() });
        } else { alert("Usuario o clave incorrectos"); }
    }
};

window.verPagina = (id) => {
    document.querySelectorAll(".view").forEach(v => v.classList.add("hidden"));
    const target = document.getElementById(`pag-${id}`);
    if(target) target.classList.remove("hidden");
    if(window.innerWidth < 1024) {
        document.getElementById("sidebar").classList.add("-translate-x-full");
        document.getElementById("sidebar-overlay").classList.add("hidden");
    }
};

window.toggleMenu = () => {
    document.getElementById("sidebar").classList.toggle("-translate-x-full");
    document.getElementById("sidebar-overlay").classList.toggle("hidden");
};

window.cerrarSesion = () => location.reload();
window.abrirModalInsumo = () => document.getElementById("modal-insumo").classList.remove("hidden");
window.cerrarModalInsumo = () => document.getElementById("modal-insumo").classList.add("hidden");

// --- GESTIÓN DE STOCK (CON REGISTRO DE ENTRADA) ---
window.agregarProducto = async () => {
    const n = document.getElementById("nombre-prod").value.trim().toLowerCase();
    const c = parseInt(document.getElementById("cantidad-prod").value);
    
    if(n && !isNaN(c) && c > 0) {
        const docRef = doc(db, "inventario", n);
        const docSnap = await getDoc(docRef);

        // 1. Actualizar Cantidad en Inventario
        if (docSnap.exists()) {
            await updateDoc(docRef, { cantidad: docSnap.data().cantidad + c });
        } else {
            await setDoc(docRef, { cantidad: c });
        }

        // 2. Guardar en Historial de Entradas
        await addDoc(collection(db, "entradas_stock"), {
            insumo: n,
            cantidad: c,
            usuario: usuarioActual.id,
            fecha: new Date().toLocaleString(),
            timestamp: Date.now()
        });
        
        window.cerrarModalInsumo();
        document.getElementById("nombre-prod").value = "";
        document.getElementById("cantidad-prod").value = "";
        alert("Stock agregado y registrado en historial.");
    } else {
        alert("Por favor ingresa un nombre y cantidad válida.");
    }
};

// --- PROCESAR PEDIDOS ---
window.procesarSolicitud = async () => {
    const ins = document.getElementById("sol-insumo").value;
    const cant = parseInt(document.getElementById("sol-cantidad").value);
    const ubi = document.getElementById("sol-ubicacion").value; // Ahora es un SELECT

    if(!ins || isNaN(cant) || cant <= 0 || !ubi) return alert("Completa todos los datos y selecciona una sede.");

    await addDoc(collection(db, "pedidos"), {
        usuarioId: usuarioActual.id,
        insumoNom: ins,
        cantidad: cant,
        ubicacion: ubi,
        estado: "pendiente",
        fecha: new Date().toLocaleString(),
        timestamp: Date.now()
    });
    
    enviarMail("archivos@fcipty.com", { usuario: usuarioActual.id, insumo: ins, cantidad: cant, estado: "SOLICITUD NUEVA", ubicacion: ubi });
    alert("Solicitud enviada.");
    document.getElementById("sol-cantidad").value = "";
    document.getElementById("sol-ubicacion").value = ""; // Resetea el select
    
    if(usuarioActual.rol === 'admin') {
        window.verPagina('solicitudes');
    } else {
        window.verPagina('notificaciones');
    }
};

window.gestionarPedido = async (pid, accion, ins, cant) => {
    const pRef = doc(db, "pedidos", pid);
    const pData = (await getDoc(pRef)).data();
    const uSnap = await getDoc(doc(db, "usuarios", pData.usuarioId));
    const uMail = uSnap.exists() ? uSnap.data().email : "";

    if(accion === 'aprobar') {
        const iRef = doc(db, "inventario", ins.toLowerCase());
        const iSnap = await getDoc(iRef);
        if(iSnap.exists() && iSnap.data().cantidad >= cant) {
            await updateDoc(iRef, { cantidad: iSnap.data().cantidad - cant });
            await updateDoc(pRef, { estado: "aprobado" });
            enviarMail(uMail, { usuario: "Sistema", insumo: ins, cantidad: cant, estado: "APROBADO", ubicacion: pData.ubicacion });
        } else { alert("No hay stock suficiente."); }
    } else {
        await updateDoc(pRef, { estado: "rechazado" });
        enviarMail(uMail, { usuario: "Sistema", insumo: ins, cantidad: cant, estado: "RECHAZADO", ubicacion: pData.ubicacion });
    }
};

// --- NUEVA FUNCIÓN: DESCARGAR REPORTE ---
window.descargarReporte = async () => {
    if(!confirm("¿Deseas descargar el reporte completo de movimientos (CSV)?")) return;

    // Obtener datos
    const pedidosSnap = await getDocs(collection(db, "pedidos"));
    const entradasSnap = await getDocs(collection(db, "entradas_stock"));

    let data = [];

    // Procesar Pedidos (Salidas)
    pedidosSnap.forEach(doc => {
        const d = doc.data();
        // Limpiamos comas para no romper el CSV
        const fecha = d.fecha.replace(/,/g, '');
        data.push({
            timestamp: d.timestamp || 0,
            fila: `${fecha},SALIDA,${d.insumoNom},${d.cantidad},${d.usuarioId},${d.ubicacion},${d.estado}`
        });
    });

    // Procesar Entradas (Stock Agregado)
    entradasSnap.forEach(doc => {
        const d = doc.data();
        const fecha = d.fecha.replace(/,/g, '');
        data.push({
            timestamp: d.timestamp || 0,
            fila: `${fecha},ENTRADA,${d.insumo},${d.cantidad},${d.usuario},ALMACEN,APROBADO`
        });
    });

    // Ordenar por fecha (más reciente primero)
    data.sort((a, b) => b.timestamp - a.timestamp);

    // Crear contenido CSV
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "FECHA,TIPO MOVIMIENTO,INSUMO,CANTIDAD,USUARIO,DESTINO/UBICACION,ESTADO\r\n"; // Cabecera
    
    data.forEach(row => {
        csvContent += row.fila + "\r\n";
    });

    // Descargar
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "reporte_fcilog.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

window.crearUsuario = async () => {
    const id = document.getElementById("new-user").value.trim().toLowerCase();
    const pass = document.getElementById("new-pass").value.trim();
    const email = document.getElementById("new-email").value.trim();
    const rol = document.getElementById("new-role").value;
    if(id && pass) {
        await setDoc(doc(db, "usuarios", id), { pass, email, rol });
        alert("Usuario guardado");
        document.getElementById("new-user").value = "";
    }
};

window.eliminarDato = async (col, id) => { if(confirm("¿Eliminar registro?")) await deleteDoc(doc(db, col, id)); };

// --- LÓGICA INTERNA ---

function cargarSesion(datos) {
    usuarioActual = datos;
    document.getElementById("pantalla-login").classList.add("hidden");
    document.getElementById("interfaz-app").classList.remove("hidden");
    if(datos.rol === 'admin') document.getElementById("btn-admin-stock").classList.remove("hidden");
    
    configurarMenu();
    window.verPagina(datos.rol === 'admin' ? 'stats' : 'stock');
    activarSincronizacion();
}

function configurarMenu() {
    const menu = document.getElementById("menu-dinamico");
    const isAdmin = usuarioActual.rol === 'admin';
    
    const rutas = isAdmin ? 
        [
            {id:'stats', n:'Dashboard', i:'chart-line'}, 
            {id:'stock', n:'Stock', i:'box'}, 
            {id:'solicitar', n:'Realizar Pedido', i:'cart-plus'}, 
            {id:'solicitudes', n:'Pendientes', i:'bell'}, 
            {id:'historial', n:'Historial', i:'clock-rotate-left'}, 
            {id:'usuarios', n:'Usuarios', i:'users'}
        ] :
        [
            {id:'stock', n:'Ver Stock', i:'eye'}, 
            {id:'solicitar', n:'Pedir', i:'plus'}, 
            {id:'notificaciones', n:'Mis Pedidos', i:'history'}
        ];

    menu.innerHTML = rutas.map(r => `
        <button onclick="verPagina('${r.id}')" class="w-full flex items-center gap-3 p-4 text-slate-600 hover:bg-indigo-50 rounded-xl transition font-bold">
            <i class="fas fa-${r.i} w-6"></i> ${r.n}
        </button>`).join('');
}

function activarSincronizacion() {
    onSnapshot(collection(db, "inventario"), snap => {
        const list = document.getElementById("lista-inventario");
        const sel = document.getElementById("sol-insumo");
        const dl = document.getElementById("admin-stock-dl");
        
        let lbs = [], vls = [], tot = 0;
        list.innerHTML = "";
        if(sel) sel.innerHTML = '<option value="">Seleccionar Insumo...</option>';
        if(dl) dl.innerHTML = '';

        snap.forEach(d => {
            const p = d.data(); const n = d.id;
            tot += p.cantidad; lbs.push(n.toUpperCase()); vls.push(p.cantidad);

            list.innerHTML += `<div class="bg-white p-5 rounded-2xl border flex justify-between items-center shadow-sm">
                <div><b class="uppercase">${n}</b><p class="text-xs text-slate-400 font-bold">Stock: ${p.cantidad}</p></div>
                ${usuarioActual.rol === 'admin' ? `<button onclick="eliminarDato('inventario','${n}')" class="text-red-400 p-2 hover:bg-red-50 rounded-lg"><i class="fas fa-trash"></i></button>` : ''}
            </div>`;

            if(sel) sel.innerHTML += `<option value="${n}">${n.toUpperCase()}</option>`;
            if(dl) dl.innerHTML += `<option value="${n}">`;
        });

        if(usuarioActual.rol === 'admin') {
            document.getElementById("metrica-total").innerText = snap.size;
            document.getElementById("metrica-stock").innerText = tot;
            renderChart('stockChart', lbs, vls, 'Stock Actual', '#6366f1', stockChart, c => stockChart = c);
        }
    });

    onSnapshot(collection(db, "pedidos"), snap => {
        const filtro = document.getElementById("filtro-fecha") ? document.getElementById("filtro-fecha").value : 'actual';
        const ahora = new Date();
        const mesActual = ahora.getMonth();
        const añoActual = ahora.getFullYear();

        const lAdmin = document.getElementById("lista-pendientes-admin");
        const lUser = document.getElementById("lista-notificaciones");
        const tHist = document.getElementById("tabla-historial-body");
        
        let pCnt = 0;
        const statsUser = {}, statsLoc = {}, statsIns = {};

        if(lAdmin) lAdmin.innerHTML = ""; 
        if(lUser) lUser.innerHTML = ""; 
        if(tHist) tHist.innerHTML = "";

        snap.forEach(d => {
            const p = d.data();
            const pFecha = new Date(p.timestamp || Date.now());

            let pasaFiltro = true;
            if(filtro === 'actual') pasaFiltro = pFecha.getMonth() === mesActual && pFecha.getFullYear() === añoActual;
            if(filtro === 'anterior') pasaFiltro = pFecha.getMonth() === (mesActual - 1 === -1 ? 11 : mesActual - 1);

            if(pasaFiltro && p.estado === 'aprobado' && usuarioActual.rol === 'admin') {
                statsUser[p.usuarioId] = (statsUser[p.usuarioId] || 0) + 1;
                statsLoc[p.ubicacion] = (statsLoc[p.ubicacion] || 0) + 1;
                statsIns[p.insumoNom] = (statsIns[p.insumoNom] || 0) + 1;
            }

            if(usuarioActual.rol === 'admin' && p.estado === 'pendiente') {
                pCnt++;
                lAdmin.innerHTML += `<div class="bg-white p-5 rounded-2xl border flex justify-between items-center shadow-sm border-l-4 border-l-amber-400">
                    <div><b>${p.insumoNom.toUpperCase()}</b> (x${p.cantidad})<br><small class="text-indigo-600 font-bold">Destino: ${p.ubicacion}</small> | <small>${p.usuarioId}</small></div>
                    <div class="flex gap-2">
                        <button onclick="gestionarPedido('${d.id}','aprobar','${p.insumoNom}',${p.cantidad})" class="bg-indigo-600 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-md">Aprobar</button>
                        <button onclick="gestionarPedido('${d.id}','rechazar','${p.insumoNom}',${p.cantidad})" class="bg-slate-100 px-4 py-2 rounded-xl text-xs font-bold">X</button>
                    </div>
                </div>`;
            }
            if(usuarioActual.rol === 'admin' && p.estado !== 'pendiente') {
                tHist.innerHTML += `<tr class="border-b hover:bg-slate-50">
                    <td class="p-4 text-slate-500">${p.fecha.split(',')[0]}</td>
                    <td class="p-4 font-bold uppercase">${p.insumoNom}</td>
                    <td class="p-4">x${p.cantidad}</td>
                    <td class="p-4 italic font-medium text-indigo-600">${p.ubicacion}</td>
                    <td class="p-4 text-xs">${p.usuarioId}</td>
                    <td class="p-4"><span class="badge status-${p.estado}">${p.estado}</span></td>
                </tr>`;
            }
            if(p.usuarioId === usuarioActual.id) {
                lUser.innerHTML += `<div class="notif-card"><div><b>${p.insumoNom.toUpperCase()} (x${p.cantidad})</b><br><small>Destino: ${p.ubicacion}</small></div><span class="badge status-${p.estado}">${p.estado}</span></div>`;
            }
        });

        if(usuarioActual.rol === 'admin') {
            document.getElementById("metrica-pedidos").innerText = pCnt;
            renderChart('userChart', Object.keys(statsUser), Object.values(statsUser), 'Pedidos', '#818cf8', userChart, c => userChart = c, 'y');
            renderChart('locationChart', Object.keys(statsLoc), Object.values(statsLoc), 'Consumo', '#fbbf24', locationChart, c => locationChart = c, 'y');
            renderChart('insumoChart', Object.keys(statsIns), Object.values(statsIns), 'Insumo', '#34d399', insumoChart, c => insumoChart = c);
        }
    });

    if(usuarioActual.rol === 'admin') {
        onSnapshot(collection(db, "entradas_stock"), snap => {
            const tEntradas = document.getElementById("tabla-entradas-body");
            if(tEntradas) {
                tEntradas.innerHTML = "";
                const docs = [];
                snap.forEach(d => docs.push(d.data()));
                docs.sort((a,b) => b.timestamp - a.timestamp);

                docs.forEach(e => {
                    tEntradas.innerHTML += `<tr class="border-b border-emerald-50 hover:bg-emerald-50/30">
                        <td class="p-4 text-slate-500">${e.fecha}</td>
                        <td class="p-4 font-bold uppercase text-emerald-800">${e.insumo}</td>
                        <td class="p-4 font-bold text-emerald-600">+${e.cantidad}</td>
                        <td class="p-4 text-xs text-slate-400">${e.usuario}</td>
                    </tr>`;
                });
            }
        });

        onSnapshot(collection(db, "usuarios"), snap => {
            const list = document.getElementById("lista-usuarios-db");
            if(list) {
                list.innerHTML = "";
                snap.forEach(d => {
                    list.innerHTML += `<div class="user-card flex justify-between items-center"><div><b>${d.id}</b><br><small class="text-slate-400">${d.data().rol}</small></div><button onclick="eliminarDato('usuarios','${d.id}')" class="text-red-400"><i class="fas fa-trash"></i></button></div>`;
                });
            }
        });
    }
}

async function enviarMail(dest, info) {
    if(!dest) return;
    emailjs.send("default_service", "vvoz2ae", { destinatario: dest, ...info, name: "FCILog System" });
}

function renderChart(id, labels, data, title, color, instance, setInst, axis = 'x') {
    const ctx = document.getElementById(id);
    if(!ctx) return;
    if(instance) instance.destroy();
    setInst(new Chart(ctx, {
        type: 'bar',
        data: { labels, datasets: [{ label: title, data, backgroundColor: color, borderRadius: 5 }] },
        options: { indexAxis: axis, plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true }, y: { beginAtZero: true } } }
    }));
}
