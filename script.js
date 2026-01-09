import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { 
  getFirestore, doc, setDoc, getDoc, collection, onSnapshot, deleteDoc, updateDoc, addDoc 
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyA3cRmakg2dV2YRuNV1fY7LE87artsLmB8",
  authDomain: "mi-web-db.firebaseapp.com",
  projectId: "mi-web-db",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
let usuarioActual = null;

// --- CONTROL DE ACCESO ---
window.iniciarSesion = async () => {
  const user = document.getElementById("login-user").value.trim().toLowerCase();
  const pass = document.getElementById("login-pass").value.trim();

  if (user === "admin" && pass === "1130") {
    cargarSesion({ id: "admin", rol: "admin" });
    return;
  }

  const userSnap = await getDoc(doc(db, "usuarios", user));
  if (userSnap.exists() && userSnap.data().pass === pass) {
    cargarSesion({ id: user, ...userSnap.data() });
  } else { alert("Usuario o clave incorrectos."); }
};

function cargarSesion(datos) {
  usuarioActual = datos;
  document.getElementById("pantalla-login").style.display = "none";
  document.getElementById("interfaz-app").style.display = "block";
  document.getElementById("sol-usuario").value = "SOLICITANTE: " + datos.id.toUpperCase();

  const isAdmin = (datos.rol === "admin");
  const adminNav = ["nav-admin", "nav-pedidos", "nav-historial", "nav-usuarios"];
  const userNav = ["nav-ver-stock", "nav-solicitar", "nav-mis-pedidos"];

  adminNav.forEach(id => document.getElementById(id).style.display = isAdmin ? "inline-block" : "none");
  userNav.forEach(id => document.getElementById(id).style.display = isAdmin ? "none" : "inline-block");

  verPagina(isAdmin ? 'admin' : 'ver-stock');
  sincronizarDatos();
}

window.cerrarSesion = () => location.reload();

window.verPagina = (id) => {
  document.querySelectorAll('.view').forEach(v => v.style.display = 'none');
  document.getElementById(`pag-${id}`).style.display = 'block';
};

// --- GESTIÓN DE INVENTARIO ---
window.agregarProducto = async () => {
  const nom = document.getElementById("nombre").value.trim().toLowerCase();
  const cant = parseInt(document.getElementById("cantidad").value);
  if (!nom || isNaN(cant)) return;
  const ref = doc(db, "inventario", nom);
  const snap = await getDoc(ref);
  snap.exists() ? await updateDoc(ref, { cantidad: snap.data().cantidad + cant }) : await setDoc(ref, { nombre: nom, cantidad: cant });
  document.getElementById("nombre").value = ""; document.getElementById("cantidad").value = "";
};

// --- SOLICITUDES ---
window.procesarSolicitud = async () => {
  const ubi = document.getElementById("sol-ubicacion").value.trim();
  const ins = document.getElementById("sol-insumo").value.trim().toLowerCase();
  const cant = parseInt(document.getElementById("sol-cantidad").value);
  if (!ins || isNaN(cant) || !ubi) return alert("Por favor, llena todos los campos");

  await addDoc(collection(db, "pedidos"), {
    usuarioId: usuarioActual.id,
    ubicacion: ubi,
    insumoNom: ins,
    cantidad: cant,
    estado: "pendiente",
    fecha: new Date().toLocaleString()
  });
  alert("¡Solicitud enviada correctamente!");
  document.getElementById("sol-insumo").value = ""; 
  document.getElementById("sol-cantidad").value = "";
  verPagina('mis-pedidos');
};

window.gestionarPedido = async (id, accion, insumo, cant) => {
  const pRef = doc(db, "pedidos", id);
  if (accion === 'aprobar') {
    const iRef = doc(db, "inventario", insumo);
    const iSnap = await getDoc(iRef);
    if (iSnap.exists() && iSnap.data().cantidad >= cant) {
      await updateDoc(iRef, { cantidad: iSnap.data().cantidad - cant });
      await updateDoc(pRef, { estado: "aprobado" });
    } else { alert("Stock insuficiente para aprobar."); }
  } else {
    await updateDoc(pRef, { estado: "rechazado" });
  }
};

// --- SINCRONIZACIÓN EN TIEMPO REAL ---
function sincronizarDatos() {
  // 1. Inventario
  onSnapshot(collection(db, "inventario"), (snap) => {
    const lAdmin = document.getElementById("lista-inventario");
    const lUser = document.getElementById("lista-solo-lectura");
    const sug = document.getElementById("productos-sugeridos");
    lAdmin.innerHTML = ""; lUser.innerHTML = ""; sug.innerHTML = "";
    snap.forEach(d => {
      const p = d.data();
      const alerta = p.cantidad < 5 ? 'color:red;font-weight:bold' : '';
      lAdmin.innerHTML += `<div class="prod-card"><div><strong>${d.id.toUpperCase()}</strong><br><span style="${alerta}">Stock: ${p.cantidad}</span></div><button onclick="eliminarDato('inventario','${d.id}')" style="color:red;border:none;background:none">🗑️</button></div>`;
      lUser.innerHTML += `<div class="prod-card-simple"><strong>${d.id.toUpperCase()}</strong><br><span style="${alerta}">Disponibles: ${p.cantidad}</span></div>`;
      sug.innerHTML += `<option value="${d.id}">`;
    });
  });

  // 2. Pedidos
  onSnapshot(collection(db, "pedidos"), (snap) => {
    const divPendientes = document.getElementById("lista-pendientes-admin");
    const divHistorial = document.getElementById("lista-historial-admin");
    const divMisPedidos = document.getElementById("lista-mis-pedidos");

    if(divPendientes) divPendientes.innerHTML = "";
    if(divHistorial) divHistorial.innerHTML = "";
    if(divMisPedidos) divMisPedidos.innerHTML = "";

    snap.forEach(d => {
      const p = d.data();
      const card = `
        <div class="pedido-card">
          <div class="pedido-info">
            <h4>${p.insumoNom.toUpperCase()} (${p.cantidad})</h4>
            <p>De: ${p.usuarioId.toUpperCase()} | Destino: ${p.ubicacion}</p>
            <p style="font-size:10px">${p.fecha}</p>
          </div>
          ${usuarioActual.rol === 'admin' && p.estado === 'pendiente' ? 
            `<div class="acciones">
              <button class="btn-aprobar" onclick="gestionarPedido('${d.id}','aprobar','${p.insumoNom}',${p.cantidad})">✔</button>
              <button class="btn-rechazar" onclick="gestionarPedido('${d.id}','rechazar')">✖</button>
            </div>` : 
            `<span class="badge status-${p.estado}">${p.estado}</span>`
          }
        </div>`;

      if (usuarioActual.rol === "admin") {
        p.estado === "pendiente" ? divPendientes.innerHTML += card : divHistorial.innerHTML += card;
      }
      if (p.usuarioId === usuarioActual.id) {
        divMisPedidos.innerHTML += card;
      }
    });
  });

  // 3. Usuarios
  if (usuarioActual.rol === "admin") {
    onSnapshot(collection(db, "usuarios"), (snap) => {
      const div = document.getElementById("lista-usuarios-db");
      div.innerHTML = "";
      snap.forEach(d => div.innerHTML += `<div class="pedido-card"><div><strong>${d.id.toUpperCase()}</strong> - ${d.data().rol}</div><button onclick="eliminarDato('usuarios','${d.id}')">Eliminar</button></div>`);
    });
  }
}

window.crearUsuario = async () => {
  const user = document.getElementById("new-user").value.trim().toLowerCase();
  const pass = document.getElementById("new-pass").value.trim();
  const rol = document.getElementById("new-role").value;
  if(user && pass) await setDoc(doc(db, "usuarios", user), { pass, rol });
};

window.eliminarDato = async (coll, id) => { if(confirm("¿Borrar permanentemente?")) await deleteDoc(doc(db, coll, id)); };