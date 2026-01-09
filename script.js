import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, collection, onSnapshot, deleteDoc, updateDoc, addDoc, serverTimestamp, getDocs } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyA3cRmakg2dV2YRuNV1fY7LE87artsLmB8",
    authDomain: "mi-web-db.firebaseapp.com",
    projectId: "mi-web-db",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
let usuarioActual = null;

/* 🔐 LOGIN Y SESIÓN */
window.iniciarSesion = async () => {
    const user = val("login-user").toLowerCase();
    const pass = val("login-pass");

    if (user === "admin" && pass === "1130") {
        iniciarApp({ id: "admin", rol: "admin" });
        return;
    }

    const snap = await getDoc(doc(db, "usuarios", user));
    if (!snap.exists() || snap.data().pass !== pass) {
        alert("Credenciales incorrectas");
        return;
    }
    iniciarApp({ id: user, ...snap.data() });
};

function iniciarApp(user) {
    usuarioActual = user;
    el("pantalla-login").style.display = "none";
    el("interfaz-app").style.display = "flex";
    configurarMenu();
    if(el("sol-usuario")) el("sol-usuario").value = `USUARIO: ${user.id.toUpperCase()}`;
    verPagina(user.rol === "admin" ? "admin" : "ver-stock");
    iniciarSincronizacion();
}

/* 🧭 NAVEGACIÓN */
window.verPagina = (id) => {
    document.querySelectorAll(".view").forEach(v => v.style.display = "none");
    if (el(`pag-${id}`)) el(`pag-${id}`).style.display = "block";
};

/* 📦 INVENTARIO */
window.agregarProducto = async () => {
    const nombre = val("nombre").toLowerCase();
    const cantidad = num("cantidad");
    if (!nombre || cantidad <= 0) return;
    await addDoc(collection(db, "inventario"), { nombre, cantidad, creado: serverTimestamp() });
    el("nombre").value = ""; el("cantidad").value = "";
};

/* 🧾 SOLICITUDES */
window.procesarSolicitud = async () => {
    const insumo = val("sol-insumo").toLowerCase();
    const cantidad = num("sol-cantidad");
    const ubicacion = val("sol-ubicacion");

    if (!insumo || cantidad <= 0 || !ubicacion) { alert("Completa los datos"); return; }

    await addDoc(collection(db, "pedidos"), {
        usuarioId: usuarioActual.id,
        insumoNom: insumo,
        cantidad,
        ubicacion,
        estado: "pendiente",
        fecha: serverTimestamp()
    });

    alert("Solicitud enviada");
    verPagina("mis-pedidos");
};

/* ✔ / ✖ GESTIÓN PEDIDOS */
window.gestionarPedido = async (id, accion, insumo, cantidad) => {
    const pedidoRef = doc(db, "pedidos", id);
    if (accion === "aprobar") {
        const q = await getDocs(collection(db, "inventario"));
        const prodDoc = q.docs.find(d => d.data().nombre === insumo);

        if (!prodDoc || prodDoc.data().cantidad < cantidad) {
            alert("No hay suficiente stock para aprobar este pedido.");
            return;
        }

        await updateDoc(doc(db, "inventario", prodDoc.id), {
            cantidad: prodDoc.data().cantidad - cantidad
        });
        await updateDoc(pedidoRef, { estado: "aprobado" });
    } else {
        await updateDoc(pedidoRef, { estado: "rechazado" });
    }
};

/* 🔄 SINCRONIZACIÓN REAL */
function iniciarSincronizacion() {
    onSnapshot(collection(db, "inventario"), snap => {
        const admin = el("lista-inventario");
        const user = el("lista-solo-lectura");
        const sug = el("productos-sugeridos");
        if(admin) admin.innerHTML = ""; if(user) user.innerHTML = ""; if(sug) sug.innerHTML = "";

        snap.forEach(d => {
            const p = d.data();
            const cardHtml = `
                <div class="prod-card glass">
                    <div><strong>${p.nombre.toUpperCase()}</strong><br><small>Stock: ${p.cantidad}</small></div>
                    ${usuarioActual.rol === 'admin' ? `<button onclick="eliminarDato('inventario','${d.id}')">🗑️</button>` : ''}
                </div>`;
            if(admin && usuarioActual.rol === 'admin') admin.innerHTML += cardHtml;
            if(user) user.innerHTML += cardHtml;
            if(sug) sug.innerHTML += `<option value="${p.nombre}">`;
        });
    });

    onSnapshot(collection(db, "pedidos"), snap => {
        const pA = el("lista-pendientes-admin");
        const hA = el("lista-historial-admin");
        const uM = el("lista-mis-pedidos");
        if(pA) pA.innerHTML = ""; if(hA) hA.innerHTML = ""; if(uM) uM.innerHTML = "";

        snap.forEach(d => {
            const p = d.data();
            const base = `<div class="pedido-card glass">
                <div><strong>${p.insumoNom.toUpperCase()}</strong> (${p.cantidad})<br><small>${p.usuarioId} - ${p.ubicacion}</small></div>`;
            
            if (usuarioActual.rol === "admin" && p.estado === "pendiente") {
                if(pA) pA.innerHTML += base + `<div>
                    <button class="badge status-aprobado" onclick="gestionarPedido('${d.id}','aprobar','${p.insumoNom}',${p.cantidad})">✔</button>
                    <button class="badge status-rechazado" onclick="gestionarPedido('${d.id}','rechazar')">✖</button>
                </div></div>`;
            } else {
                const badge = `<span class="badge status-${p.estado}">${p.estado}</span></div>`;
                if(hA && usuarioActual.rol === 'admin') hA.innerHTML += base + badge;
                if(uM && p.usuarioId === usuarioActual.id) uM.innerHTML += base + badge;
            }
        });
    });
}

/* 👥 USUARIOS */
window.crearUsuario = async () => {
    const u = val("new-user").toLowerCase();
    const p = val("new-pass");
    const r = el("new-role").value;
    if (!u || !p) return;
    await setDoc(doc(db, "usuarios", u), { pass: p, rol: r });
    alert("Usuario creado");
};

/* 🧰 UTILIDADES */
const el = id => document.getElementById(id);
const val = id => el(id).value.trim();
const num = id => parseInt(val(id)) || 0;
window.eliminarDato = async (col, id) => confirm("¿Eliminar?") && await deleteDoc(doc(db, col, id));
window.cerrarSesion = () => location.reload();

const configurarMenu = () => {
    const isAdmin = usuarioActual.rol === "admin";
    document.querySelectorAll("[id^='nav-']").forEach(btn => {
        const adminOnly = ["nav-admin","nav-pedidos","nav-historial","nav-usuarios"].includes(btn.id);
        btn.style.display = (isAdmin === adminOnly || !adminOnly) ? "block" : "none";
    });
};