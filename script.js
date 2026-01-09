import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, collection, onSnapshot, deleteDoc, updateDoc, addDoc, getDocs, serverTimestamp, query, where } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyA3cRmakg2dV2YRuNV1fY7LE87artsLmB8",
  authDomain: "mi-web-db.firebaseapp.com",
  projectId: "mi-web-db",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
let usuarioActual = null;

/* 🔐 LOGIN */
window.iniciarSesion = async () => {
  const user = el("login-user").value.trim().toLowerCase();
  const pass = el("login-pass").value.trim();

  if (user === "admin" && pass === "1130") {
    iniciarApp({ id: "admin", rol: "admin" }); return;
  }

  const snap = await getDoc(doc(db, "usuarios", user));
  if (snap.exists() && snap.data().pass === pass) {
    iniciarApp({ id: user, ...snap.data() });
  } else { alert("Error: Credenciales inválidas"); }
};

function iniciarApp(user) {
  usuarioActual = user;
  el("pantalla-login").style.display = "none";
  el("interfaz-app").style.display = "flex";
  el("sol-usuario").value = `SOLICITANTE: ${user.id.toUpperCase()}`;
  
  configurarMenu();
  verPagina(user.rol === "admin" ? "admin" : "ver-stock");
  iniciarSincronizacion();
}

/* 🧭 NAVEGACIÓN */
window.verPagina = (id) => {
  document.querySelectorAll(".view").forEach(v => v.classList.add("hidden"));
  el(`pag-${id}`).classList.remove("hidden");
  // Actualizar estilo de botones del menú
  document.querySelectorAll(".menu-btn").forEach(b => b.classList.remove("bg-indigo-600"));
};

/* 📦 INVENTARIO (ADMIN) */
window.agregarProducto = async () => {
  const nombre = el("nombre").value.trim().toLowerCase();
  const cantidad = parseInt(el("cantidad").value);
  if (!nombre || isNaN(cantidad)) return;

  const ref = doc(db, "inventario", nombre);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    await updateDoc(ref, { cantidad: snap.data().cantidad + cantidad });
  } else {
    await setDoc(ref, { nombre, cantidad });
  }
  el("nombre").value = ""; el("cantidad").value = "";
};

/* 🧾 SOLICITUD (USUARIO) */
window.procesarSolicitud = async () => {
  const insumo = el("sol-insumo").value.trim().toLowerCase();
  const cantidad = parseInt(el("sol-cantidad").value);
  const ubicacion = el("sol-ubicacion").value.trim();

  if (!insumo || isNaN(cantidad) || !ubicacion) return alert("Completa todos los campos");

  await addDoc(collection(db, "pedidos"), {
    usuarioId: usuarioActual.id,
    insumoNom: insumo,
    cantidad,
    ubicacion,
    estado: "pendiente",
    fecha: new Date().toLocaleString()
  });
  alert("Solicitud enviada con éxito");
  verPagina("mis-pedidos");
};

/* ✔ GESTIÓN DE PEDIDOS */
window.gestionarPedido = async (id, accion, insumo, cantidad) => {
  const pedidoRef = doc(db, "pedidos", id);
  if (accion === "aprobar") {
    const invRef = doc(db, "inventario", insumo.toLowerCase());
    const invSnap = await getDoc(invRef);
    if (invSnap.exists() && invSnap.data().cantidad >= cantidad) {
      await updateDoc(invRef, { cantidad: invSnap.data().cantidad - cantidad });
      await updateDoc(pedidoRef, { estado: "aprobado" });
    } else { alert("Error: No hay stock suficiente."); }
  } else {
    await updateDoc(pedidoRef, { estado: "rechazado" });
  }
};

/* 🔄 SINCRONIZACIÓN */
function iniciarSincronizacion() {
  // Inventario & Métricas
  onSnapshot(collection(db, "inventario"), snap => {
    let totalItems = 0; let totalStock = 0;
    const admin = el("lista-inventario");
    const user = el("lista-solo-lectura");
    const sug = el("productos-sugeridos");
    admin.innerHTML = user.innerHTML = sug.innerHTML = "";

    snap.forEach(d => {
      const p = d.data();
      totalItems++; totalStock += p.cantidad;
      const html = `<div class="prod-card glass">
        <div><strong class="text-indigo-300">${d.id.toUpperCase()}</strong><br><span class="text-sm">Stock: ${p.cantidad}</span></div>
        ${usuarioActual.rol === 'admin' ? `<button onclick="eliminarDato('inventario','${d.id}')" class="text-red-400">🗑</button>` : ''}
      </div>`;
      admin.innerHTML += html; user.innerHTML += html;
      sug.innerHTML += `<option value="${d.id}">`;
    });
    if(el("metrica-total")) el("metrica-total").innerText = totalItems;
    if(el("metrica-stock")) el("metrica-stock").innerText = totalStock;
  });

  // Pedidos & Notificaciones
  onSnapshot(collection(db, "pedidos"), snap => {
    const pA = el("lista-pendientes-admin"), hA = el("lista-historial-admin"), uM = el("lista-mis-pedidos");
    let pendientesCount = 0;
    pA.innerHTML = hA.innerHTML = uM.innerHTML = "";

    snap.forEach(d => {
      const p = d.data();
      if(p.estado === 'pendiente') pendientesCount++;
      const card = `<div class="pedido-card glass">
        <div><strong>${p.insumoNom.toUpperCase()}</strong> (${p.cantidad})<br>
        <small class="text-slate-400">${p.usuarioId} | ${p.ubicacion}</small></div>
        ${usuarioActual.rol === 'admin' && p.estado === 'pendiente' ? 
          `<div class="flex gap-2"><button onclick="gestionarPedido('${d.id}','aprobar','${p.insumoNom}',${p.cantidad})" class="bg-green-600 p-2 rounded">✔</button>
          <button onclick="gestionarPedido('${d.id}','rechazar')" class="bg-red-600 p-2 rounded">✖</button></div>` : 
          `<span class="badge status-${p.estado}">${p.estado}</span>`}
      </div>`;

      if (usuarioActual.rol === "admin") {
        p.estado === "pendiente" ? pA.innerHTML += card : hA.innerHTML += card;
      }
      if (p.usuarioId === usuarioActual.id) uM.innerHTML += card;
    });
    if(el("metrica-pedidos")) el("metrica-pedidos").innerText = pendientesCount;
  });

  // Lista Usuarios
  if(usuarioActual.rol === 'admin') {
    onSnapshot(collection(db, "usuarios"), snap => {
      const list = el("lista-usuarios-db"); list.innerHTML = "";
      snap.forEach(d => list.innerHTML += `<div class="prod-card glass"><span>${d.id} (${d.data().rol})</span><button onclick="eliminarDato('usuarios','${d.id}')">🗑</button></div>`);
    });
  }
}

/* UTILIDADES */
const el = id => document.getElementById(id);
window.eliminarDato = async (col, id) => confirm("¿Eliminar?") && await deleteDoc(doc(db, col, id));
window.cerrarSesion = () => location.reload();
window.crearUsuario = async () => {
  const u = el("new-user").value.trim().toLowerCase(), p = el("new-pass").value.trim(), r = el("new-role").value;
  if(u && p) await setDoc(doc(db, "usuarios", u), { pass: p, rol: r });
};
function configurarMenu() {
  const adminIds = ["nav-admin","nav-pedidos","nav-historial","nav-usuarios"];
  const userIds = ["nav-ver-stock","nav-solicitar","nav-mis-pedidos"];
  const isAdmin = usuarioActual.rol === "admin";
  adminIds.forEach(id => el(id).style.display = isAdmin ? "block" : "none");
  userIds.forEach(id => el(id).style.display = isAdmin ? "none" : "block");
}