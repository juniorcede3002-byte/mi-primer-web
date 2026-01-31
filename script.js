import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, collection, onSnapshot, deleteDoc, updateDoc, addDoc, getDocs } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

// CONFIGURACIÓN FIREBASE
const firebaseConfig = {
    apiKey: "AIzaSyA3cRmakg2dV2YRuNV1fY7LE87artsLmB8",
    authDomain: "mi-web-db.firebaseapp.com",
    projectId: "mi-web-db",
    storageBucket: "mi-web-db.appspot.com"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ESTADO GLOBAL
let usuarioActual = null;
let stockChart = null, userChart = null, locationChart = null;
let carritoGlobal = {}; 

// INICIALIZAR EMAILJS
emailjs.init("2jVnfkJKKG0bpKN-U");

// --- INICIO Y SESIÓN ---
window.addEventListener('DOMContentLoaded', () => {
    const sesionGuardada = localStorage.getItem("fcilog_session");
    if (sesionGuardada) cargarSesion(JSON.parse(sesionGuardada));
});

function cargarSesion(datos) {
    usuarioActual = datos;
    localStorage.setItem("fcilog_session", JSON.stringify(datos));
    document.getElementById("pantalla-login").classList.add("hidden");
    document.getElementById("interfaz-app").classList.remove("hidden");
    
    // Info Usuario en Sidebar
    const infoDiv = document.getElementById("info-usuario");
    if(infoDiv) {
        infoDiv.innerHTML = `
            <div class="flex flex-col items-center">
                <div class="w-8 h-8 bg-white border border-slate-200 rounded-full flex items-center justify-center text-indigo-500 mb-1 shadow-sm">
                    <i class="fas fa-user"></i>
                </div>
                <span class="font-bold text-slate-700">${datos.id}</span>
                <span class="text-[10px] uppercase font-bold text-indigo-400 bg-indigo-50 px-2 rounded-full mt-1">${datos.rol}</span>
            </div>`;
    }

    // Botón Agregar Stock (Admin/Manager)
    if(datos.rol === 'admin' || datos.rol === 'manager') {
        document.getElementById("btn-admin-stock")?.classList.remove("hidden");
    }

    configurarMenu();
    
    // Redirección Inteligente
    let inicio = 'stock';
    if(['admin','manager','supervisor'].includes(datos.rol)) inicio = 'stats';
    
    window.verPagina(inicio);
    activarSincronizacion();
}

window.iniciarSesion = async () => {
    const user = document.getElementById("login-user").value.trim().toLowerCase();
    const pass = document.getElementById("login-pass").value.trim();
    
    if(!user || !pass) return alert("Por favor ingresa usuario y contraseña.");

    // Backdoor Admin
    if (user === "admin" && pass === "1130") {
        cargarSesion({ id: "admin", rol: "admin", email: "admin@fcilog.com" });
        return;
    }

    try {
        const snap = await getDoc(doc(db, "usuarios", user));
        if (snap.exists() && snap.data().pass === pass) {
            cargarSesion({ id: user, ...snap.data() });
        } else {
            alert("Usuario o contraseña incorrectos.");
        }
    } catch (e) {
        alert("Error de conexión. Intente nuevamente.");
    }
};

window.cerrarSesion = () => { localStorage.removeItem("fcilog_session"); location.reload(); };

// --- NAVEGACIÓN ---
window.verPagina = (id) => {
    document.querySelectorAll(".view").forEach(v => {
        v.classList.add("hidden");
        v.classList.remove("animate-fade-in");
    });
    const target = document.getElementById(`pag-${id}`);
    if(target) {
        target.classList.remove("hidden");
        // Pequeño delay para reiniciar animación
        setTimeout(() => target.classList.add("animate-fade-in"), 10);
    }
    if(window.innerWidth < 768) toggleMenu(false);
};

window.toggleMenu = (forceState) => {
    const side = document.getElementById("sidebar");
    const over = document.getElementById("sidebar-overlay");
    const isOpen = !side.classList.contains("-translate-x-full");
    
    const shouldOpen = forceState !== undefined ? forceState : !isOpen;

    if(shouldOpen) {
        side.classList.remove("-translate-x-full");
        over.classList.remove("hidden");
        setTimeout(()=> over.classList.remove("opacity-0"), 10);
    } else {
        side.classList.add("-translate-x-full");
        over.classList.add("opacity-0");
        setTimeout(()=> over.classList.add("hidden"), 300);
    }
};

function configurarMenu() {
    const menu = document.getElementById("menu-dinamico");
    const rol = usuarioActual.rol;
    
    const items = {
        stats: {id:'stats', n:'Dashboard', i:'chart-pie'},
        stock: {id:'stock', n:'Stock', i:'boxes'},
        pedir: {id:'solicitar', n:'Realizar Pedido', i:'cart-plus'},
        pendientes: {id:'solicitudes', n:'Aprobaciones', i:'clipboard-check'},
        historial: {id:'historial', n:'Historial', i:'history'},
        usuarios: {id:'usuarios', n:'Accesos', i:'users-cog'},
        mis_pedidos: {id:'notificaciones', n:'Mis Pedidos', i:'shipping-fast'}
    };

    let rutas = [];

    // Lógica de Roles
    if(rol === 'admin') rutas = [items.stats, items.stock, items.pedir, items.pendientes, items.historial, items.usuarios];
    else if (rol === 'manager') rutas = [items.stats, items.stock, items.pedir, items.pendientes, items.historial];
    else if (rol === 'supervisor') rutas = [items.stats, items.stock, items.pedir, items.pendientes, items.historial];
    else rutas = [items.stock, items.pedir, items.mis_pedidos];

    menu.innerHTML = rutas.map(r => `
        <button onclick="verPagina('${r.id}')" class="w-full flex items-center gap-3 p-3 text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 rounded-xl transition-all font-bold text-sm group">
            <div class="w-8 h-8 rounded-lg bg-slate-50 group-hover:bg-white border border-slate-100 flex items-center justify-center transition-colors">
                <i class="fas fa-${r.i}"></i>
            </div>
            ${r.n}
        </button>`).join('');
}

// --- LÓGICA DE PEDIDOS (CARRITO) ---
window.ajustarCantidad = (insumo, delta) => {
    const actual = carritoGlobal[insumo] || 0;
    const nueva = Math.max(0, actual + delta);
    carritoGlobal[insumo] = nueva;
    document.getElementById(`cant-${insumo}`).innerText = nueva;
    
    // Efecto visual
    const row = document.getElementById(`row-${insumo}`);
    if(nueva > 0) row.classList.add("border-indigo-500", "bg-indigo-50/50");
    else row.classList.remove("border-indigo-500", "bg-indigo-50/50");
};

window.procesarSolicitudMultiple = async () => {
    const ubi = document.getElementById("sol-ubicacion").value;
    const items = Object.entries(carritoGlobal).filter(([_, c]) => c > 0);
    
    if(!ubi) return alert("⚠️ Selecciona una sede.");
    if(items.length === 0) return alert("⚠️ Agrega al menos un producto.");

    // Determinar a dónde ir después
    const redirect = (usuarioActual.rol === 'user') ? 'notificaciones' : 'solicitudes';

    const batchPromises = items.map(async ([insumo, cantidad]) => {
        return addDoc(collection(db, "pedidos"), {
            usuarioId: usuarioActual.id,
            insumoNom: insumo,
            cantidad: cantidad,
            ubicacion: ubi,
            estado: "pendiente",
            fecha: new Date().toLocaleString(),
            timestamp: Date.now()
        });
    });

    await Promise.all(batchPromises);
    
    alert("✅ Pedido enviado exitosamente.");
    carritoGlobal = {};
    document.getElementById("sol-ubicacion").value = "";
    activarSincronizacion(); // Resetear vista
    window.verPagina(redirect);
};

// --- GESTIÓN DE PEDIDOS (ADMIN) ---
window.gestionarPedido = async (pid, accion, ins) => {
    const pRef = doc(db, "pedidos", pid);
    
    if(accion === 'aprobar') {
        // Leer cantidad editada
        const input = document.getElementById(`qty-${pid}`);
        const cantidadFinal = input ? parseInt(input.value) : 0;
        
        if(isNaN(cantidadFinal) || cantidadFinal <= 0) return alert("Cantidad inválida.");

        // Verificar Stock
        const iRef = doc(db, "inventario", ins.toLowerCase());
        const iSnap = await getDoc(iRef);
        
        if(iSnap.exists() && iSnap.data().cantidad >= cantidadFinal) {
            // Transacción atómica idealmente, aquí simplificado:
            await updateDoc(iRef, { cantidad: iSnap.data().cantidad - cantidadFinal });
            await updateDoc(pRef, { estado: "aprobado", cantidad: cantidadFinal }); // Actualizamos cant por si se editó
        } else {
            alert(`❌ Stock insuficiente. Disponible: ${iSnap.exists() ? iSnap.data().cantidad : 0}`);
        }
    } else {
        await updateDoc(pRef, { estado: "rechazado" });
    }
};

// --- ACCIONES USUARIO (RECIBIR / INCIDENCIA) ---
window.confirmarRecibido = async (pid) => {
    if(confirm("¿Confirmar que has recibido los insumos correctamente?")) {
        await updateDoc(doc(db, "pedidos", pid), { estado: "recibido" });
    }
};

window.abrirIncidencia = (pid) => {
    document.getElementById('incidencia-pid').value = pid;
    document.getElementById('incidencia-detalle').value = "";
    document.getElementById('modal-incidencia').classList.remove('hidden');
};

window.confirmarIncidencia = async (esDevolucion) => {
    const pid = document.getElementById('incidencia-pid').value;
    const detalle = document.getElementById('incidencia-detalle').value.trim();
    
    if(!detalle) return alert("Por favor describe el problema.");

    const pRef = doc(db, "pedidos", pid);
    const pSnap = await getDoc(pRef);
    if(!pSnap.exists()) return;
    const data = pSnap.data();

    // Si es devolución, regresar stock
    if(esDevolucion) {
        const iRef = doc(db, "inventario", data.insumoNom.toLowerCase());
        const iSnap = await getDoc(iRef);
        if(iSnap.exists()) {
            await updateDoc(iRef, { cantidad: iSnap.data().cantidad + data.cantidad });
        }
    }

    await updateDoc(pRef, { 
        estado: esDevolucion ? "devuelto" : "con_incidencia",
        detalleIncidencia: detalle
    });
    
    document.getElementById('modal-incidencia').classList.add('hidden');
    alert("Reporte registrado.");
};

// --- SINCRONIZACIÓN EN TIEMPO REAL ---
function activarSincronizacion() {
    // 1. INVENTARIO (Y Autocomplete)
    onSnapshot(collection(db, "inventario"), snap => {
        const grid = document.getElementById("lista-inventario");
        const listRequest = document.getElementById("contenedor-lista-pedidos");
        const dataList = document.getElementById("lista-sugerencias"); // AUTOCOMPLETE
        
        grid.innerHTML = "";
        if(listRequest) listRequest.innerHTML = "";
        if(dataList) dataList.innerHTML = "";

        let totalRefs = 0, totalStock = 0;
        const labels = [], data = [];

        snap.forEach(docSnap => {
            const prod = docSnap.data();
            const nombre = docSnap.id;
            
            totalRefs++;
            totalStock += prod.cantidad;
            labels.push(nombre.substring(0,10));
            data.push(prod.cantidad);

            // A) AUTOCOMPLETE: Llenar datalist
            if(dataList) {
                const opt = document.createElement("option");
                opt.value = nombre.toUpperCase();
                dataList.appendChild(opt);
            }

            // B) GRID VISUAL
            const btnDel = (usuarioActual.rol === 'admin' || usuarioActual.rol === 'manager') 
                ? `<button onclick="eliminarDato('inventario','${nombre}')" class="text-slate-300 hover:text-red-400 transition"><i class="fas fa-trash"></i></button>` : '';

            grid.innerHTML += `
                <div class="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition flex flex-col justify-between">
                    <div class="flex justify-between items-start mb-2">
                        <div class="p-2 bg-indigo-50 rounded-lg text-indigo-600"><i class="fas fa-box"></i></div>
                        ${btnDel}
                    </div>
                    <div>
                        <h4 class="font-bold text-slate-700 uppercase text-sm truncate" title="${nombre}">${nombre}</h4>
                        <p class="text-2xl font-black text-slate-800 mt-1">${prod.cantidad}</p>
                        <p class="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Unidades</p>
                    </div>
                </div>`;

            // C) LISTA SOLICITUD (Carrito)
            if(listRequest && prod.cantidad > 0) {
                const enCarro = carritoGlobal[nombre] || 0;
                const activeClass = enCarro > 0 ? "border-indigo-500 bg-indigo-50/50" : "border-transparent bg-white";
                
                listRequest.innerHTML += `
                    <div id="row-${nombre}" class="flex items-center justify-between p-3 rounded-xl border ${activeClass} transition-all shadow-sm">
                        <div class="flex-1 min-w-0 pr-4">
                            <p class="font-bold text-xs uppercase text-slate-700 truncate">${nombre}</p>
                            <p class="text-[10px] text-slate-400">Disp: ${prod.cantidad}</p>
                        </div>
                        <div class="flex items-center gap-2 bg-white rounded-lg p-1 border border-slate-100">
                            <button onclick="ajustarCantidad('${nombre}', -1)" class="w-7 h-7 rounded-md bg-slate-50 hover:bg-slate-200 text-slate-600 font-bold">-</button>
                            <span id="cant-${nombre}" class="w-6 text-center font-bold text-indigo-600 text-sm">${enCarro}</span>
                            <button onclick="ajustarCantidad('${nombre}', 1)" class="w-7 h-7 rounded-md bg-indigo-50 hover:bg-indigo-100 text-indigo-600 font-bold" ${enCarro >= prod.cantidad ? 'disabled' : ''}>+</button>
                        </div>
                    </div>`;
            }
        });

        // Actualizar Dashboard
        if(document.getElementById("metrica-stock")) {
            document.getElementById("metrica-total").innerText = totalRefs;
            document.getElementById("metrica-stock").innerText = totalStock;
            renderChart('stockChart', labels, data, 'Stock', '#6366f1', stockChart, c => stockChart = c);
        }
    });

    // 2. PEDIDOS
    onSnapshot(collection(db, "pedidos"), snap => {
        const lAdmin = document.getElementById("lista-pendientes-admin");
        const lUser = document.getElementById("lista-notificaciones");
        const tHist = document.getElementById("tabla-historial-body");
        
        if(lAdmin) lAdmin.innerHTML = ""; 
        if(lUser) lUser.innerHTML = ""; 
        if(tHist) tHist.innerHTML = "";

        let pendientesCount = 0;
        const locationStats = {};
        const userStats = {};

        snap.forEach(docSnap => {
            const p = docSnap.data();
            const id = docSnap.id;
            
            // Stats logic
            if(p.estado === 'aprobado' || p.estado === 'recibido') {
                locationStats[p.ubicacion] = (locationStats[p.ubicacion] || 0) + 1;
                userStats[p.usuarioId] = (userStats[p.usuarioId] || 0) + 1;
            }

            // A) PENDIENTES (Admin/Manager/Sup)
            const isStaff = ['admin','manager','supervisor'].includes(usuarioActual.rol);
            if(isStaff && p.estado === 'pendiente') {
                pendientesCount++;
                
                let controls = `<span class="badge bg-slate-100 text-slate-500">Solo Lectura</span>`;
                
                if(usuarioActual.rol !== 'supervisor') {
                    // Input editable para cantidad
                    controls = `
                    <div class="flex items-center gap-2 mt-3 pt-3 border-t border-amber-100">
                        <div class="flex flex-col">
                            <span class="text-[8px] uppercase font-bold text-amber-700">Aprobar:</span>
                            <input type="number" id="qty-${id}" value="${p.cantidad}" class="w-16 p-1.5 text-center text-sm font-bold bg-white border border-amber-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none">
                        </div>
                        <div class="flex gap-2 ml-auto">
                            <button onclick="gestionarPedido('${id}','aprobar','${p.insumoNom}')" class="w-9 h-9 rounded-lg bg-indigo-600 text-white shadow-md hover:bg-indigo-700 flex items-center justify-center transition"><i class="fas fa-check"></i></button>
                            <button onclick="gestionarPedido('${id}','rechazar')" class="w-9 h-9 rounded-lg bg-white border border-red-100 text-red-500 hover:bg-red-50 flex items-center justify-center transition"><i class="fas fa-times"></i></button>
                        </div>
                    </div>`;
                }

                lAdmin.innerHTML += `
                <div class="bg-white p-4 rounded-2xl border-l-4 border-l-amber-400 shadow-sm">
                    <div class="flex justify-between items-start">
                        <div>
                            <h4 class="font-black text-slate-700 uppercase text-sm">${p.insumoNom}</h4>
                            <div class="flex flex-wrap gap-2 mt-2">
                                <span class="px-2 py-1 rounded-md bg-slate-50 text-slate-500 text-[10px] font-bold"><i class="fas fa-user"></i> ${p.usuarioId}</span>
                                <span class="px-2 py-1 rounded-md bg-indigo-50 text-indigo-600 text-[10px] font-bold"><i class="fas fa-map-marker-alt"></i> ${p.ubicacion}</span>
                            </div>
                        </div>
                        <span class="text-xl font-black text-amber-500">x${p.cantidad}</span>
                    </div>
                    ${controls}
                </div>`;
            }

            // B) HISTORIAL
            if(p.estado !== 'pendiente' && tHist) {
                const note = p.detalleIncidencia ? `<br><span class="text-[9px] text-red-400 italic">"${p.detalleIncidencia}"</span>` : '';
                tHist.innerHTML += `
                <tr class="hover:bg-slate-50 transition">
                    <td class="p-4 text-slate-400 font-mono">${p.fecha.split(',')[0]}</td>
                    <td class="p-4 font-bold uppercase text-slate-700">${p.insumoNom}</td>
                    <td class="p-4 text-slate-600">x${p.cantidad}</td>
                    <td class="p-4"><span class="px-2 py-1 rounded bg-slate-100 text-slate-500 font-bold text-[10px]">${p.ubicacion}</span></td>
                    <td class="p-4 text-slate-500">${p.usuarioId}</td>
                    <td class="p-4"><span class="badge status-${p.estado}">${p.estado}</span>${note}</td>
                </tr>`;
            }

            // C) MIS PEDIDOS (User)
            if(p.usuarioId === usuarioActual.id && lUser) {
                let actions = "";
                if(p.estado === 'aprobado') {
                    actions = `
                    <div class="grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-slate-50">
                        <button onclick="confirmarRecibido('${id}')" class="py-2 bg-emerald-500 text-white rounded-lg text-xs font-bold shadow hover:bg-emerald-600">Confirmar Recibido</button>
                        <button onclick="abrirIncidencia('${id}')" class="py-2 bg-white border border-slate-200 text-slate-500 rounded-lg text-xs font-bold hover:bg-slate-50 hover:text-red-500">Reportar</button>
                    </div>`;
                }

                lUser.innerHTML += `
                <div class="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm relative overflow-hidden">
                    <div class="absolute top-0 right-0 p-4 opacity-10 text-6xl text-slate-300 pointer-events-none"><i class="fas fa-box-open"></i></div>
                    <div class="relative z-10">
                        <div class="flex justify-between items-start mb-2">
                            <span class="px-2 py-1 rounded-md bg-indigo-50 text-indigo-600 text-[10px] font-bold uppercase tracking-wider">${p.ubicacion}</span>
                            <span class="badge status-${p.estado}">${p.estado}</span>
                        </div>
                        <h3 class="text-lg font-black text-slate-800 uppercase">${p.insumoNom}</h3>
                        <p class="text-sm font-bold text-slate-400 mb-1">Cantidad: <span class="text-slate-600">${p.cantidad}</span></p>
                        <p class="text-[10px] text-slate-300 font-mono">${p.fecha}</p>
                        ${actions}
                    </div>
                </div>`;
            }
        });

        // Actualizar gráficas stats
        if(document.getElementById("metrica-pedidos")) {
            document.getElementById("metrica-pedidos").innerText = pendientesCount;
            renderChart('userChart', Object.keys(userStats), Object.values(userStats), 'Pedidos', '#818cf8', userChart, c => userChart = c);
            renderChart('locationChart', Object.keys(locationStats), Object.values(locationStats), 'Pedidos', '#fbbf24', locationChart, c => locationChart = c);
        }
    });

    // 3. ENTRADAS
    onSnapshot(collection(db, "entradas_stock"), snap => {
        const t = document.getElementById("tabla-entradas-body");
        if(t) {
            t.innerHTML = "";
            let d = [];
            snap.forEach(x => d.push(x.data()));
            d.sort((a,b) => b.timestamp - a.timestamp);
            d.forEach(e => {
                t.innerHTML += `
                <tr class="hover:bg-emerald-50/30 transition">
                    <td class="p-4 text-emerald-800/60 font-mono">${e.fecha}</td>
                    <td class="p-4 font-bold uppercase text-emerald-900">${e.insumo}</td>
                    <td class="p-4 font-black text-emerald-600">+${e.cantidad}</td>
                    <td class="p-4 text-emerald-800/80 text-[10px] font-bold uppercase">${e.usuario}</td>
                </tr>`;
            });
        }
    });

    // 4. USUARIOS
    if(usuarioActual.rol === 'admin') {
        onSnapshot(collection(db, "usuarios"), snap => {
            const l = document.getElementById("lista-usuarios-db");
            if(l) {
                l.innerHTML = "";
                snap.forEach(docSnap => {
                    const u = docSnap.data();
                    const id = docSnap.id;
                    l.innerHTML += `
                    <div class="bg-white p-4 rounded-xl border border-slate-100 flex justify-between items-center group hover:shadow-md transition">
                        <div>
                            <div class="flex items-center gap-2">
                                <span class="font-bold text-slate-700">${id}</span>
                                <span class="px-2 py-0.5 bg-slate-100 rounded text-[10px] font-bold uppercase text-slate-500">${u.rol}</span>
                            </div>
                            <p class="text-xs text-slate-400 font-mono mt-0.5">pass: ••••</p>
                        </div>
                        <button onclick="eliminarDato('usuarios','${id}')" class="w-8 h-8 rounded bg-red-50 text-red-400 opacity-0 group-hover:opacity-100 transition flex items-center justify-center hover:bg-red-500 hover:text-white">
                            <i class="fas fa-trash-alt text-xs"></i>
                        </button>
                    </div>`;
                });
            }
        });
    }
}

// --- UTILIDADES ---
window.agregarProducto = async () => {
    // Normalizar nombre a mayúsculas para evitar duplicados
    const n = document.getElementById("nombre-prod").value.trim().toUpperCase(); 
    const c = parseInt(document.getElementById("cantidad-prod").value);
    
    // Guardar en minúsculas el ID para consistencia interna, pero mostrar en mayúsculas
    const idSafe = n.toLowerCase();

    if(n && c > 0) {
        const docRef = doc(db, "inventario", idSafe);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) await updateDoc(docRef, { cantidad: docSnap.data().cantidad + c });
        else await setDoc(docRef, { cantidad: c }); // Se guarda el ID en minúsculas
        
        await addDoc(collection(db, "entradas_stock"), { 
            insumo: n, // Guardamos el nombre "bonito" en el historial
            cantidad: c, 
            usuario: usuarioActual.id, 
            fecha: new Date().toLocaleString(), 
            timestamp: Date.now() 
        });
        
        window.cerrarModalInsumo();
        document.getElementById("nombre-prod").value = "";
        document.getElementById("cantidad-prod").value = "";
    } else {
        alert("Datos inválidos.");
    }
};

window.crearUsuario = async () => {
    const id = document.getElementById("new-user").value.trim().toLowerCase();
    const pass = document.getElementById("new-pass").value.trim();
    const rol = document.getElementById("new-role").value;
    
    if(id && pass) {
        await setDoc(doc(db, "usuarios", id), { pass, rol });
        alert("Usuario creado correctamente.");
        document.getElementById("new-user").value = "";
        document.getElementById("new-pass").value = "";
    } else alert("Faltan datos.");
};

window.eliminarDato = async (col, id) => { if(confirm("¿Eliminar definitivamente?")) await deleteDoc(doc(db, col, id)); };

window.abrirModalInsumo = () => document.getElementById("modal-insumo").classList.remove("hidden");
window.cerrarModalInsumo = () => document.getElementById("modal-insumo").classList.add("hidden");

window.descargarReporte = async () => {
    if(!confirm("¿Generar CSV Completo?")) return;
    
    const [stock, entradas, pedidos] = await Promise.all([
        getDocs(collection(db, "inventario")),
        getDocs(collection(db, "entradas_stock")),
        getDocs(collection(db, "pedidos"))
    ]);

    let csv = "data:text/csv;charset=utf-8,";
    
    csv += "--- STOCK ACTUAL ---\r\nINSUMO,CANTIDAD\r\n";
    stock.forEach(d => csv += `${d.id.toUpperCase()},${d.data().cantidad}\r\n`);
    
    csv += "\r\n--- ENTRADAS ---\r\nFECHA,INSUMO,CANTIDAD,USUARIO\r\n";
    entradas.forEach(d => { const x=d.data(); csv += `${x.fecha.replace(/,/g,' ')},${x.insumo},${x.cantidad},${x.usuario}\r\n`; });

    csv += "\r\n--- PEDIDOS ---\r\nFECHA,INSUMO,CANTIDAD,SEDE,USUARIO,ESTADO,NOTA\r\n";
    pedidos.forEach(d => { const x=d.data(); if(x.estado !== 'pendiente') csv += `${x.fecha.replace(/,/g,' ')},${x.insumoNom},${x.cantidad},${x.ubicacion},${x.usuarioId},${x.estado},${x.detalleIncidencia||''}\r\n`; });

    const link = document.createElement("a");
    link.href = encodeURI(csv);
    link.download = `FCI_Reporte_${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

function renderChart(id, labels, data, title, color, instance, setInst) {
    const ctx = document.getElementById(id);
    if(!ctx) return;
    if(instance) instance.destroy();
    setInst(new Chart(ctx, { type: 'bar', data: { labels, datasets: [{ label: title, data, backgroundColor: color, borderRadius: 6 }] }, options: { responsive: true, plugins: { legend: { display: false } } } }));
}
