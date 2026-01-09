import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, collection, onSnapshot, deleteDoc, updateDoc, addDoc } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyA3cRmakg2dV2YRuNV1fY7LE87artsLmB8",
  authDomain: "mi-web-db.firebaseapp.com",
  projectId: "mi-web-db",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
let usuarioActual = null;
let stockChart = null;

/* 🔐 SISTEMA DE LOG */
window.iniciarSesion = async () => {
  const user = document.getElementById("login-user").value.trim().toLowerCase();
  const pass = document.getElementById("login-pass").value.trim();

  if (user === "admin" && pass === "1130") {
    cargarSesion({ id: "admin", rol: "admin" });
  } else {
    const snap = await getDoc(doc(db, "usuarios", user));
    if (snap.exists() && snap.data().pass === pass) {
      cargarSesion({ id: user, ...snap.data() });
    } else { alert("Usuario o clave incorrecta"); }
  }
};

function cargarSesion(datos) {
  usuarioActual = datos;
  document.getElementById("pantalla-login").style.display = "none";
  document.getElementById("interfaz-app").style.display = "flex";
  document.getElementById("sol-usuario").value = `SOLICITANTE: ${datos.id.toUpperCase()}`;

  const isAdmin = (datos.rol === "admin");
  document.getElementById("menu-admin").classList.toggle("hidden", !isAdmin);
  document.getElementById("menu-user").classList.toggle("hidden", isAdmin);

  verPagina(isAdmin ? 'stats' : 'user-stock');
  sincronizarTodo();
}

/* 🧭 NAVEGACIÓN ENTRE SECCIONES */
window.verPagina = (id) => {
  document.querySelectorAll(".view").forEach(v => v.classList.add("hidden"));
  const pag = document.getElementById(`pag-${id}`);
  if(pag) pag.classList.remove("hidden");
};

/* 📦 GESTIÓN DE STOCK & AGREGAR */
window.agregarProducto = async () => {
  const nom = document.getElementById("nombre-prod").value.trim().toLowerCase();
  const cant = parseInt(document.getElementById("cantidad-prod").value);
  if (!nom || isNaN(cant)) return;

  const ref = doc(db, "inventario", nom);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    await updateDoc(ref, { cantidad: snap.data().cantidad + cant });
  } else {
    await setDoc(ref, { nombre: nom, cantidad: cant });
  }
  document.getElementById("nombre-prod").value = "";
  document.getElementById("cantidad-prod").value = "";
};

/* 🧾 PROCESAR SOLICITUD (USER) */
window.procesarSolicitud = async () => {
  const ins = document.getElementById("sol-insumo").value.trim().toLowerCase();
  const cant = parseInt(document.getElementById("sol-cantidad").value);
  const ubi = document.getElementById("sol-ubicacion").value.trim();

  if (!ins || isNaN(cant) || !ubi) return alert("Faltan datos");

  await addDoc(collection(db, "pedidos"), {
    usuarioId: usuarioActual.id,
    insumoNom: ins,
    cantidad: cant,
    ubicacion: ubi,
    estado: "pendiente",
    fecha: new Date().toLocaleString()
  });
  alert("Pedido enviado!");
  verPagina('mis-pedidos');
};

/* 🔄 SINCRONIZACIÓN EN TIEMPO REAL */
function sincronizarTodo() {
  // Sincronizar Inventario y Gráficas
  onSnapshot(collection(db, "inventario"), snap => {
    let labels = [], values = [], totalStock = 0, alertas = 0;
    const lAdmin = document.getElementById("lista-inventario");
    const lUser = document.getElementById("lista-solo-lectura");
    const sug = document.getElementById("productos-sugeridos");

    lAdmin.innerHTML = lUser.innerHTML = sug.innerHTML = "";

    snap.forEach(d => {
      const p = d.data();
      labels.push(d.id.toUpperCase());
      values.push(p.cantidad);
      totalStock += p.cantidad;
      if(p.cantidad < 10) alertas++;

      const card = `<div class="prod-card glass">
        <div><strong class="text-indigo-300">${d.id.toUpperCase()}</strong><br>Stock: ${p.cantidad}</div>
        ${usuarioActual.rol === 'admin' ? `<button onclick="eliminarDato('inventario','${d.id}')" class="text-red-500">🗑</button>` : ''}
      </div>`;
      
      lAdmin.innerHTML += card;
      lUser.innerHTML += card;
      sug.innerHTML += `<option value="${d.id}">`;
    });

    document.getElementById("metrica-total").innerText = snap.size;
    document.getElementById("metrica-stock").innerText = totalStock;
    document.getElementById("metrica-alertas").innerText = alertas;
    actualizarGrafica(labels, values);
  });

  // Sincronizar Pedidos
  onSnapshot(collection(db, "pedidos"), snap => {
    const lPend = document.getElementById("lista-pendientes-admin");
    const lMis = document.getElementById("lista-mis-pedidos");
    if(lPend) lPend.innerHTML = "";
    if(lMis) lMis.innerHTML = "";

    snap.forEach(d => {
      const p = d.data();
      const card = `<div class="pedido-card glass">
        <div><strong>${p.insumoNom.toUpperCase()}</strong> (${p.cantidad})<br><small>${p.usuarioId} | ${p.ubicacion}</small></div>
        ${usuarioActual.rol === 'admin' && p.estado === 'pendiente' ? 
          `<div class="flex gap-2"><button onclick="gestionarPedido('${d.id}','aprobar','${p.insumoNom}',${p.cantidad})" class="bg-green-600 p-2 rounded">✔</button>
          <button onclick="gestionarPedido('${d.id}','rechazar')" class="bg-red-600 p-2 rounded">✖</button></div>` : 
          `<span class="badge status-${p.estado}">${p.estado}</span>`}
      </div>`;

      if (usuarioActual.rol === 'admin' && p.estado === 'pendiente') lPend.innerHTML += card;
      if (p.usuarioId === usuarioActual.id) lMis.innerHTML += card;
    });
  });
}

function actualizarGrafica(labels, data) {
  const ctx = document.getElementById('stockChart');
  if(!ctx) return;
  if(stockChart) stockChart.destroy();
  stockChart = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [{ label: 'Stock Disponible', data, backgroundColor: '#6366f1' }] },
    options: { responsive: true, scales: { y: { beginAtZero: true } } }
  });
}

window.gestionarPedido = async (id, accion, ins, cant) => {
  const pRef = doc(db, "pedidos", id);
  if (accion === 'aprobar') {
    const iRef = doc(db, "inventario", ins.toLowerCase());
    const iSnap = await getDoc(iRef);
    if (iSnap.exists() && iSnap.data().cantidad >= cant) {
      await updateDoc(iRef, { cantidad: iSnap.data().cantidad - cant });
      await updateDoc(pRef, { estado: "aprobado" });
    } else { alert("Stock insuficiente"); }
  } else { await updateDoc(pRef, { estado: "rechazado" }); }
};

window.eliminarDato = async (col, id) => confirm("¿Eliminar?") && await deleteDoc(doc(db, col, id));
window.cerrarSesion = () => location.reload();