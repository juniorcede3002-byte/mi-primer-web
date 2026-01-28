import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, collection, onSnapshot, deleteDoc, updateDoc, addDoc, getDocs } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyA3cRmakg2dV2YRuNV1fY7LE87artsLmB8", // Usa tu propia API KEY
    authDomain: "mi-web-db.firebaseapp.com",
    projectId: "mi-web-db",
    storageBucket: "mi-web-db.appspot.com"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

let usuarioActual = null;
let carrito = {};
let idPedidoTemp = null;
let stockChart = null;

// --- LOGIN & PERSISTENCIA ---
window.addEventListener('DOMContentLoaded', () => {
    const s = localStorage.getItem("fcilog_session");
    if(s) cargarSesion(JSON.parse(s));
});

window.iniciarSesion = async () => {
    const u = document.getElementById("login-user").value.trim().toLowerCase();
    const p = document.getElementById("login-pass").value.trim();
    if(u === "admin" && p === "1130") {
        cargarSesion({id:"admin", rol:"admin", email:"archivos@fcipty.com"});
    } else {
        const snap = await getDoc(doc(db, "usuarios", u));
        if(snap.exists() && snap.data().pass === p) cargarSesion({id:u, ...snap.data()});
        else alert("Acceso denegado");
    }
};

function cargarSesion(datos) {
    usuarioActual = datos;
    localStorage.setItem("fcilog_session", JSON.stringify(datos));
    document.getElementById("pantalla-login").classList.add("hidden");
    document.getElementById("interfaz-app").classList.remove("hidden");
    configurarMenu();
    window.verPagina(datos.rol === 'admin' ? 'stats' : 'stock');
    activarSincronizacion();
}

window.cerrarSesion = () => { localStorage.removeItem("fcilog_session"); location.reload(); };

// --- NAVEGACIÓN ---
window.verPagina = (id) => {
    document.querySelectorAll(".view").forEach(v => v.classList.add("hidden"));
    document.getElementById(`pag-${id}`).classList.remove("hidden");
};

function configurarMenu() {
    const m = document.getElementById("menu-dinamico");
    const r = usuarioActual.rol;
    const items = [
        {id:'stats', n:'Dashboard', i:'chart-pie', show: r !== 'user'},
        {id:'stock', n:'Almacén', i:'box', show: true},
        {id:'solicitar', n:'Nuevo Pedido', i:'cart-plus', show: true},
        {id:'solicitudes', n:'Pendientes', i:'clock', show: r !== 'user'},
        {id:'historial', n:'Historial', i:'list-check', show: r !== 'user'},
        {id:'notificaciones', n:'Mis Pedidos', i:'receipt', show: true},
        {id:'usuarios', n:'Usuarios', i:'users', show: r === 'admin'}
    ];
    m.innerHTML = items.filter(x => x.show).map(x => `
        <button onclick="verPagina('${x.id}')" class="w-full flex items-center gap-3 p-4 text-slate-600 hover:bg-indigo-50 rounded-xl transition font-bold">
            <i class="fas fa-${x.i} w-6"></i> ${x.n}
        </button>`).join('');
}

// --- GESTIÓN DE CARRITO (PEDIDO MÚLTIPLE) ---
window.modificarCarrito = (id, delta) => {
    carrito[id] = Math.max(0, (carrito[id] || 0) + delta);
    document.getElementById(`cant-${id}`).innerText = carrito[id];
    document.getElementById("count-carrito").innerText = Object.values(carrito).reduce((a,b) => a+b, 0);
};

window.enviarPedidoMultiple = async () => {
    const ubi = document.getElementById("sol-ubicacion").value;
    const items = Object.entries(carrito).filter(([_, c]) => c > 0);
    if(!ubi || items.length === 0) return alert("Seleccione sede e insumos");

    for (const [nom, cant] of items) {
        await addDoc(collection(db, "pedidos"), {
            usuarioId: usuarioActual.id, insumoNom: nom, cantidad: cant,
            ubicacion: ubi, estado: "pendiente", recibido: false,
            fecha: new Date().toLocaleString(), timestamp: Date.now()
        });
    }
    alert("Pedido enviado con éxito");
    carrito = {};
    window.verPagina('notificaciones');
};

// --- SINCRONIZACIÓN FIREBASE ---
function activarSincronizacion() {
    // Inventario
    onSnapshot(collection(db, "inventario"), snap => {
        const list = document.getElementById("lista-inventario");
        const listPed = document.getElementById("lista-pedido-items");
        list.innerHTML = ""; listPed.innerHTML = "";
        let labels = [], data = [], totalStock = 0;

        snap.forEach(d => {
            const p = d.data();
            const esBajo = p.cantidad <= (p.minimo || 0);
            totalStock += p.cantidad;
            labels.push(d.id.toUpperCase()); data.push(p.cantidad);

            list.innerHTML += `
                <div class="bg-white p-5 rounded-2xl border flex justify-between items-center ${esBajo ? 'border-red-500 bg-red-50' : ''}">
                    <div><b class="uppercase">${d.id}</b><p class="text-xs ${esBajo?'text-red-600 font-bold':''}">Stock: ${p.cantidad} (Mín: ${p.minimo})</p></div>
                    ${usuarioActual.rol === 'admin' ? `<button onclick="eliminarDato('inventario','${d.id}')" class="text-red-300 hover:text-red-500"><i class="fas fa-trash"></i></button>` : ''}
                </div>`;
            
            listPed.innerHTML += `
                <div class="flex justify-between items-center p-3 bg-white border rounded-xl">
                    <span class="font-bold text-xs uppercase">${d.id}</span>
                    <div class="flex items-center gap-3">
                        <button onclick="modificarCarrito('${d.id}', -1)" class="w-8 h-8 rounded bg-slate-100">-</button>
                        <b id="cant-${d.id}" class="w-4 text-center">0</b>
                        <button onclick="modificarCarrito('${d.id}', 1)" class="w-8 h-8 rounded bg-slate-100">+</button>
                    </div>
                </div>`;
        });
        if(usuarioActual.rol !== 'user') {
            document.getElementById("metrica-total").innerText = snap.size;
            document.getElementById("metrica-stock").innerText = totalStock;
            actualizarGrafico(labels, data);
        }
    });

    // Pedidos
    onSnapshot(collection(db, "pedidos"), snap => {
        const pAdmin = document.getElementById("lista-pendientes-admin");
        const pUser = document.getElementById("lista-notificaciones");
        const tHist = document.getElementById("tabla-historial-body");
        if(pAdmin) pAdmin.innerHTML = ""; if(pUser) pUser.innerHTML = ""; if(tHist) tHist.innerHTML = "";
        let pendientes = 0;

        snap.forEach(d => {
            const p = d.data();
            if(p.estado === 'pendiente') pendientes++;

            // Panel Admin/Supervisor
            if(usuarioActual.rol !== 'user' && p.estado === 'pendiente') {
                pAdmin.innerHTML += `
                    <div class="bg-white p-4 rounded-xl border-l-4 border-l-amber-500 flex justify-between items-center shadow-sm">
                        <div class="text-xs"><b>${p.insumoNom.toUpperCase()} (x${p.cantidad})</b><br>${p.ubicacion} - ${p.usuarioId}</div>
                        <div class="flex gap-2">
                            ${usuarioActual.rol === 'admin' ? `
                            <button onclick="ajustarPedido('${d.id}')" class="bg-slate-100 p-2 rounded text-xs"><i class="fas fa-edit"></i></button>
                            <button onclick="procesarPedido('${d.id}','aprobar','${p.insumoNom}',${p.cantidad})" class="bg-indigo-600 text-white px-3 py-1 rounded text-xs">Aprobar</button>` : 'Lectura'}
                        </div>
                    </div>`;
            }

            // Mis Pedidos (User)
            if(p.usuarioId === usuarioActual.id) {
                const showAcciones = p.estado === 'aprobado' && !p.recibido;
                pUser.innerHTML += `
                    <div class="bg-white p-4 rounded-xl border flex flex-col gap-2">
                        <div class="flex justify-between items-center">
                            <b class="uppercase text-sm">${p.insumoNom} (x${p.cantidad})</b>
                            <span class="badge status-${p.estadoRecibo || p.estado}">${p.estadoRecibo || p.estado}</span>
                        </div>
                        ${showAcciones ? `
                        <div class="flex gap-1">
                            <button onclick="preFinalizar('${d.id}','recibido')" class="text-[9px] font-bold bg-green-500 text-white px-2 py-1 rounded">RECIBÍ OK</button>
                            <button onclick="preFinalizar('${d.id}','anomalia')" class="text-[9px] font-bold bg-amber-500 text-white px-2 py-1 rounded">ANOMALÍA</button>
                            <button onclick="preFinalizar('${d.id}','devolver')" class="text-[9px] font-bold bg-red-500 text-white px-2 py-1 rounded">DEVOLVER</button>
                        </div>` : ''}
                    </div>`;
            }

            // Historial
            if(p.estado !== 'pendiente') {
                tHist.innerHTML += `
                    <tr>
                        <td class="p-4 text-xs">${p.fecha.split(',')[0]}</td>
                        <td class="p-4 font-bold">${p.insumoNom.toUpperCase()}</td>
                        <td class="p-4">x${p.cantidad}</td>
                        <td class="p-4 font-bold text-indigo-600">${p.ubicacion}</td>
                        <td class="p-4 text-[10px]">${p.usuarioId}</td>
                        <td class="p-4"><span class="badge status-${p.estadoRecibo || p.estado}">${p.estadoRecibo || p.estado}</span></td>
                    </tr>`;
            }
        });
        if(usuarioActual.rol !== 'user') document.getElementById("metrica-pedidos").innerText = pendientes;
    });
}

// --- FUNCIONES DE ACCIÓN ---
window.procesarPedido = async (id, accion, insumo, cant) => {
    if(accion === 'aprobar') {
        const iRef = doc(db, "inventario", insumo.toLowerCase());
        const iSnap = await getDoc(iRef);
        if(iSnap.exists() && iSnap.data().cantidad >= cant) {
            await updateDoc(iRef, { cantidad: iSnap.data().cantidad - cant });
            await updateDoc(doc(db, "pedidos", id), { estado: "aprobado" });
        } else alert("Stock insuficiente");
    } else {
        await updateDoc(doc(db, "pedidos", id), { estado: "rechazado" });
    }
};

window.ajustarPedido = async (id) => {
    const val = prompt("Cantidad final a entregar:");
    if(val && !isNaN(val)) await updateDoc(doc(db, "pedidos", id), { cantidad: parseInt(val) });
};

window.preFinalizar = (id, accion) => {
    idPedidoTemp = id;
    if(accion === 'recibido') finalizarEntrega('recibido');
    else if(accion === 'anomalia') document.getElementById("modal-anomalia").classList.remove("hidden");
    else if(confirm("¿Desea devolver este pedido?")) finalizarEntrega('devuelto');
};

window.finalizarEntrega = async (tipo) => {
    const mot = document.getElementById("motivo-anomalia").value;
    await updateDoc(doc(db, "pedidos", idPedidoTemp), { 
        estadoRecibo: tipo, recibido: true, motivo: mot || "", fechaRecibo: new Date().toLocaleString() 
    });
    document.getElementById("modal-anomalia").classList.add("hidden");
    document.getElementById("motivo-anomalia").value = "";
};

window.guardarNuevoInsumo = async () => {
    const n = document.getElementById("nombre-prod").value.trim().toLowerCase();
    const c = parseInt(document.getElementById("cantidad-prod").value);
    const p = parseFloat(document.getElementById("precio-prod").value) || 0;
    const m = parseInt(document.getElementById("minimo-prod").value) || 0;
    if(n && !isNaN(c)) {
        await setDoc(doc(db, "inventario", n), { cantidad: c, precio: p, minimo: m });
        document.getElementById("modal-insumo").classList.add("hidden");
    }
};

// --- REPORTES CSV ---
window.exportarStockCSV = async () => {
    const s = await getDocs(collection(db, "inventario"));
    let csv = "INSUMO,CANTIDAD,PRECIO,MINIMO,VALOR_TOTAL\n";
    s.forEach(d => {
        const x = d.data();
        csv += `${d.id.toUpperCase()},${x.cantidad},${x.precio},${x.minimo},${(x.cantidad*x.precio).toFixed(2)}\n`;
    });
    descargarCSV(csv, "stock_actual.csv");
};

window.exportarHistorialCSV = async () => {
    const s = await getDocs(collection(db, "pedidos"));
    let csv = "FECHA,INSUMO,CANTIDAD,SEDE,USUARIO,ESTADO\n";
    s.forEach(d => {
        const x = d.data();
        csv += `${x.fecha},${x.insumoNom},${x.cantidad},${x.ubicacion},${x.usuarioId},${x.estadoRecibo || x.estado}\n`;
    });
    descargarCSV(csv, "historial_movimientos.csv");
};

function descargarCSV(c, n) {
    const b = new Blob([c], {type:'text/csv'});
    const u = URL.createObjectURL(b);
    const a = document.createElement('a'); a.href=u; a.download=n; a.click();
}

// --- UTILIDADES ---
function actualizarGrafico(labels, data) {
    const ctx = document.getElementById('stockChart');
    if(!ctx) return;
    if(stockChart) stockChart.destroy();
    stockChart = new Chart(ctx, {
        type: 'bar',
        data: { labels, datasets: [{ label: 'Stock', data, backgroundColor: '#6366f1' }] },
        options: { responsive: true, scales: { y: { beginAtZero: true } } }
    });
}

window.abrirModalInsumo = () => document.getElementById("modal-insumo").classList.remove("hidden");
window.eliminarDato = async (col, id) => { if(confirm("¿Eliminar?")) await deleteDoc(doc(db, col, id)); };
window.crearUsuario = async () => {
    const u = document.getElementById("new-user").value.trim().toLowerCase();
    const p = document.getElementById("new-pass").value;
    const r = document.getElementById("new-role").value;
    const e = document.getElementById("new-email").value;
    if(u && p) { await setDoc(doc(db, "usuarios", u), { pass: p, rol: r, email: e }); alert("Usuario Creado"); }
};
window.solicitarPermisoNotificaciones = () => { Notification.requestPermission().then(() => alert("Notificaciones listas")); };