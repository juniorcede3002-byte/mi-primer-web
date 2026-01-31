import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, collection, onSnapshot, deleteDoc, updateDoc, addDoc } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

const firebaseConfig = { /* COLOCA TUS CREDENCIALES AQUÍ */ };
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

let usuarioActual = null;
let stockChart = null;
let carrito = {};

// --- SESIÓN ---
window.iniciarSesion = async () => {
    const user = document.getElementById("login-user").value.trim().toLowerCase();
    const pass = document.getElementById("login-pass").value.trim();
    
    if (user === "admin" && pass === "1130") {
        cargarSesion({ id: "admin", rol: "admin" });
    } else {
        const snap = await getDoc(doc(db, "usuarios", user));
        if (snap.exists() && snap.data().pass === pass) cargarSesion({ id: user, ...snap.data() });
        else alert("Error de acceso");
    }
};

function cargarSesion(datos) {
    usuarioActual = datos;
    document.getElementById("pantalla-login").classList.add("hidden");
    document.getElementById("interfaz-app").classList.remove("hidden");
    document.getElementById("info-usuario").innerText = `${datos.id} | ${datos.rol}`;
    
    if (['admin', 'manager'].includes(datos.rol)) document.getElementById("btn-add-stock").classList.remove("hidden");
    
    configurarMenu();
    activarSincronizacion();
    verPagina(datos.rol === 'user' ? 'stock' : 'stats');
}

window.cerrarSesion = () => location.reload();

// --- NAVEGACIÓN ---
window.verPagina = (id) => {
    document.querySelectorAll(".view").forEach(v => v.classList.add("hidden"));
    document.getElementById(`pag-${id}`).classList.remove("hidden");
};

function configurarMenu() {
    const menu = document.getElementById("menu-dinamico");
    const r = usuarioActual.rol;
    const items = [
        { id: 'stats', n: 'Dashboard', i: 'chart-line', roles: ['admin', 'manager', 'supervisor'] },
        { id: 'stock', n: 'Inventario', i: 'box', roles: ['admin', 'manager', 'supervisor', 'user'] },
        { id: 'solicitar', n: 'Pedir', i: 'cart-plus', roles: ['admin', 'manager', 'supervisor', 'user'] },
        { id: 'solicitudes', n: 'Pendientes', i: 'bell', roles: ['admin', 'manager', 'supervisor'] },
        { id: 'usuarios', n: 'Usuarios', i: 'users', roles: ['admin'] },
        { id: 'notificaciones', n: 'Mis Pedidos', i: 'history', roles: ['user'] }
    ];

    menu.innerHTML = items.filter(i => i.roles.includes(r)).map(i => `
        <button onclick="verPagina('${i.id}')" class="w-full flex items-center gap-3 p-3 text-slate-600 hover:bg-indigo-50 rounded-xl transition font-bold">
            <i class="fas fa-${i.i} w-5"></i> ${i.n}
        </button>`).join('');
}

// --- LOGICA DE STOCK Y AUTOCOMPLETADO ---
function activarSincronizacion() {
    // Escuchar Inventario
    onSnapshot(collection(db, "inventario"), snap => {
        const listInv = document.getElementById("lista-inventario");
        const listPed = document.getElementById("contenedor-lista-pedidos");
        const dataList = document.getElementById("lista-sugerencias");
        
        listInv.innerHTML = "";
        listPed.innerHTML = "";
        dataList.innerHTML = "";

        let lbs = [], vls = [], total = 0;

        snap.forEach(d => {
            const p = d.data();
            const id = d.id;
            total += p.cantidad;
            lbs.push(id.toUpperCase());
            vls.push(p.cantidad);

            // Llenar Autocompletado
            const opt = document.createElement("option");
            opt.value = id.toUpperCase();
            dataList.appendChild(opt);

            // Tarjeta de Stock con botón de edición
            const esBajo = p.cantidad <= (p.stockMin || 0);
            const btnEdit = ['admin', 'manager'].includes(usuarioActual.rol) ? 
                `<button onclick="abrirEditorInsumo('${id}')" class="text-indigo-500 hover:bg-indigo-50 p-2 rounded-lg"><i class="fas fa-cog"></i></button>` : '';

            listInv.innerHTML += `
                <div class="card-stock flex flex-col gap-3">
                    <div class="flex justify-between items-start">
                        <img src="${p.img || 'https://placehold.co/100?text=📦'}" class="w-16 h-16 rounded-lg object-cover bg-slate-100">
                        ${btnEdit}
                    </div>
                    <div>
                        <b class="uppercase block text-sm">${id}</b>
                        <p class="text-xs text-slate-400">$${p.precio || '0.00'}</p>
                        <div class="mt-2 flex justify-between items-end">
                            <span class="text-2xl font-black ${esBajo ? 'text-red-500' : 'text-slate-700'}">${p.cantidad}</span>
                            <span class="text-[10px] font-bold text-slate-300 uppercase">Stock</span>
                        </div>
                    </div>
                </div>`;

            // Lista para pedir
            if (p.cantidad > 0) {
                listPed.innerHTML += `
                    <div class="flex items-center justify-between p-3 bg-slate-50 rounded-xl border">
                        <span class="font-bold text-xs uppercase">${id}</span>
                        <div class="flex items-center gap-3">
                            <button onclick="cambiarCant('${id}', -1)" class="w-8 h-8 rounded bg-white border">-</button>
                            <span id="cant-${id}" class="w-5 text-center font-bold">${carrito[id] || 0}</span>
                            <button onclick="cambiarCant('${id}', 1)" class="w-8 h-8 rounded bg-indigo-600 text-white">+</button>
                        </div>
                    </div>`;
            }
        });

        document.getElementById("metrica-stock").innerText = total;
        renderChart(lbs, vls);
    });

    // Escuchar Solicitudes (Admin/Manager/Supervisor)
    onSnapshot(collection(db, "pedidos"), snap => {
        const lAdmin = document.getElementById("lista-pendientes-admin");
        const lUser = document.getElementById("lista-notificaciones");
        if(lAdmin) lAdmin.innerHTML = "";
        if(lUser) lUser.innerHTML = "";

        snap.forEach(d => {
            const p = d.data();
            if (p.estado === 'pendiente' && lAdmin) {
                const acciones = ['admin', 'manager'].includes(usuarioActual.rol) ? 
                    `<div class="flex gap-2">
                        <button onclick="gestionar('${d.id}', 'aprobar', '${p.insumo}', ${p.cantidad})" class="bg-indigo-600 text-white px-3 py-1 rounded-lg text-xs">Aprobar</button>
                        <button onclick="gestionar('${d.id}', 'rechazar')" class="bg-red-50 text-red-500 px-3 py-1 rounded-lg text-xs">X</button>
                    </div>` : '<span class="badge status-pendiente">Pendiente</span>';

                lAdmin.innerHTML += `
                    <div class="bg-white p-4 rounded-2xl border flex justify-between items-center shadow-sm">
                        <div>
                            <b class="text-sm uppercase">${p.insumo} (x${p.cantidad})</b>
                            <p class="text-[10px] text-slate-400 font-bold">${p.usuarioId} | ${p.ubicacion}</p>
                        </div>
                        ${acciones}
                    </div>`;
            }
            if (p.usuarioId === usuarioActual.id && lUser) {
                lUser.innerHTML += `
                    <div class="bg-white p-4 rounded-2xl border shadow-sm flex justify-between">
                        <b class="text-sm uppercase">${p.insumo} (x${p.cantidad})</b>
                        <span class="badge status-${p.estado}">${p.estado}</span>
                    </div>`;
            }
        });
    });
}

// --- FUNCIONES DE ACCIÓN ---
window.cambiarCant = (id, delta) => {
    carrito[id] = Math.max(0, (carrito[id] || 0) + delta);
    document.getElementById(`cant-${id}`).innerText = carrito[id];
};

window.enviarPedido = async () => {
    const ubi = document.getElementById("sol-ubicacion").value;
    const items = Object.entries(carrito).filter(([_, c]) => c > 0);
    if (!ubi || items.length === 0) return alert("Completa los datos");

    for (const [insumo, cant] of items) {
        await addDoc(collection(db, "pedidos"), {
            insumo, cantidad: cant, ubicacion: ubi,
            usuarioId: usuarioActual.id, estado: "pendiente", fecha: new Date().toLocaleString()
        });
    }
    alert("Enviado");
    carrito = {};
    verPagina(usuarioActual.rol === 'user' ? 'notificaciones' : 'stock');
};

window.gestionar = async (pid, accion, ins, cant) => {
    if (accion === 'aprobar') {
        const ref = doc(db, "inventario", ins.toLowerCase());
        const s = await getDoc(ref);
        if (s.exists() && s.data().cantidad >= cant) {
            await updateDoc(ref, { cantidad: s.data().cantidad - cant });
            await updateDoc(doc(db, "pedidos", pid), { estado: "aprobado" });
        } else alert("Sin stock suficiente");
    } else await updateDoc(doc(db, "pedidos", pid), { estado: "rechazado" });
};

// --- MODALES Y EDICIÓN ---
window.abrirModalStock = () => document.getElementById("modal-stock").classList.remove("hidden");
window.cerrarModalStock = () => document.getElementById("modal-stock").classList.add("hidden");

window.guardarEntradaStock = async () => {
    const n = document.getElementById("stock-nombre").value.trim().toLowerCase();
    const c = parseInt(document.getElementById("stock-cantidad").value);
    if (!n || !c) return;

    const ref = doc(db, "inventario", n);
    const s = await getDoc(ref);
    if (s.exists()) await updateDoc(ref, { cantidad: s.data().cantidad + c });
    else await setDoc(ref, { cantidad: c, precio: 0, stockMin: 0, img: "" });

    cerrarModalStock();
};

window.abrirEditorInsumo = async (id) => {
    const s = await getDoc(doc(db, "inventario", id));
    const p = s.data();
    document.getElementById("edit-id").value = id;
    document.getElementById("edit-img").value = p.img || "";
    document.getElementById("edit-precio").value = p.precio || 0;
    document.getElementById("edit-min").value = p.stockMin || 0;
    document.getElementById("modal-editar-insumo").classList.remove("hidden");
};

window.guardarCambiosInsumo = async () => {
    const id = document.getElementById("edit-id").value;
    await updateDoc(doc(db, "inventario", id), {
        img: document.getElementById("edit-img").value,
        precio: parseFloat(document.getElementById("edit-precio").value),
        stockMin: parseInt(document.getElementById("edit-min").value)
    });
    document.getElementById("modal-editar-insumo").classList.add("hidden");
};

function renderChart(lbs, vls) {
    const ctx = document.getElementById('stockChart').getContext('2d');
    if (stockChart) stockChart.destroy();
    stockChart = new Chart(ctx, {
        type: 'bar',
        data: { labels: lbs, datasets: [{ label: 'Stock Actual', data: vls, backgroundColor: '#6366f1' }] },
        options: { responsive: true, plugins: { legend: { display: false } } }
    });
}

// --- GESTIÓN USUARIOS ---
window.crearUsuario = async () => {
    const id = document.getElementById("new-user").value.trim().toLowerCase();
    const pass = document.getElementById("new-pass").value;
    const email = document.getElementById("new-email").value;
    const rol = document.getElementById("new-role").value;
    if (id && pass) await setDoc(doc(db, "usuarios", id), { pass, email, rol });
};

onSnapshot(collection(db, "usuarios"), snap => {
    const l = document.getElementById("lista-usuarios-db");
    if(!l) return;
    l.innerHTML = "";
    snap.forEach(d => {
        l.innerHTML += `<div class="bg-white p-3 rounded-xl border flex justify-between items-center shadow-sm">
            <span><b>${d.id}</b> (${d.data().rol})</span>
            <button onclick="eliminar('usuarios','${d.id}')" class="text-red-400"><i class="fas fa-trash"></i></button>
        </div>`;
    });
});

window.eliminar = async (c, id) => { if(confirm("¿Eliminar?")) await deleteDoc(doc(db, c, id)); };
