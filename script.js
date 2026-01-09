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

window.iniciarSesion = async () => {
  const user = document.getElementById("login-user").value.trim().toLowerCase();
  const pass = document.getElementById("login-pass").value.trim();
  if (user === "admin" && pass === "1130") { cargarSesion({ id: "admin", rol: "admin" }); return; }
  const uSnap = await getDoc(doc(db, "usuarios", user));
  if (uSnap.exists() && uSnap.data().pass === pass) { cargarSesion({ id: user, ...uSnap.data() }); } 
  else { alert("Credenciales incorrectas"); }
};

function cargarSesion(datos) {
  usuarioActual = datos;
  document.getElementById("pantalla-login").style.display = "none";
  document.getElementById("interfaz-app").style.display = "block";
  document.getElementById("sol-usuario").value = "USUARIO: " + datos.id.toUpperCase();
  const isAdmin = (datos.rol === "admin");
  document.querySelectorAll("[id^='nav-']").forEach(btn => {
    const isForAdmin = ["nav-admin", "nav-pedidos", "nav-historial", "nav-usuarios"].includes(btn.id);
    btn.style.display = isAdmin === isForAdmin ? "inline-block" : "none";
  });
  verPagina(isAdmin ? 'admin' : 'ver-stock');
  sincronizar();
}

window.verPagina = (id) => {
  document.querySelectorAll('.view').forEach(v => v.style.display = 'none');
  document.getElementById(`pag-${id}`).style.display = 'block';
};

window.agregarProducto = async () => {
  const nom = document.getElementById("nombre").value.trim().toLowerCase();
  const cant = parseInt(document.getElementById("cantidad").value);
  if (!nom || isNaN(cant)) return;
  const ref = doc(db, "inventario", nom);
  const s = await getDoc(ref);
  s.exists() ? await updateDoc(ref, { cantidad: s.data().cantidad + cant }) : await setDoc(ref, { nombre: nom, cantidad: cant });
};

window.procesarSolicitud = async () => {
  const ins = document.getElementById("sol-insumo").value.trim().toLowerCase();
  const cant = parseInt(document.getElementById("sol-cantidad").value);
  const ubi = document.getElementById("sol-ubicacion").value.trim();
  if (!ins || isNaN(cant) || !ubi) return alert("Completa los datos");
  await addDoc(collection(db, "pedidos"), { usuarioId: usuarioActual.id, insumoNom: ins, cantidad: cant, ubicacion: ubi, estado: "pendiente", fecha: new Date().toLocaleString() });
  alert("Enviado"); verPagina('mis-pedidos');
};

window.gestionarPedido = async (id, accion, ins, cant) => {
  const pRef = doc(db, "pedidos", id);
  if (accion === 'aprobar') {
    const iRef = doc(db, "inventario", ins);
    const iS = await getDoc(iRef);
    if (iS.exists() && iS.data().cantidad >= cant) {
      await updateDoc(iRef, { cantidad: iS.data().cantidad - cant });
      await updateDoc(pRef, { estado: "aprobado" });
    } else alert("Sin stock");
  } else await updateDoc(pRef, { estado: "rechazado" });
};

function sincronizar() {
  onSnapshot(collection(db, "inventario"), (snap) => {
    const lA = document.getElementById("lista-inventario"), lU = document.getElementById("lista-solo-lectura"), sug = document.getElementById("productos-sugeridos");
    lA.innerHTML = ""; lU.innerHTML = ""; sug.innerHTML = "";
    snap.forEach(d => {
      const p = d.data();
      lA.innerHTML += `<div class="prod-card"><strong>${d.id.toUpperCase()}</strong>: ${p.cantidad} <button onclick="eliminarDato('inventario','${d.id}')">🗑️</button></div>`;
      lU.innerHTML += `<div class="prod-card"><strong>${d.id.toUpperCase()}</strong>: ${p.cantidad}</div>`;
      sug.innerHTML += `<option value="${d.id}">`;
    });
  });

  onSnapshot(collection(db, "pedidos"), (snap) => {
    const pA = document.getElementById("lista-pendientes-admin"), hA = document.getElementById("lista-historial-admin"), uM = document.getElementById("lista-mis-pedidos");
    if(pA) pA.innerHTML = ""; if(hA) hA.innerHTML = ""; if(uM) uM.innerHTML = "";
    snap.forEach(d => {
      const p = d.data();
      const html = `<div class="pedido-card"><div><strong>${p.insumoNom.toUpperCase()}</strong> (${p.cantidad})<br><small>${p.usuarioId} - ${p.fecha}</small></div>`;
      const finalHtml = html + (usuarioActual.rol === 'admin' && p.estado === 'pendiente' ? 
        `<div><button onclick="gestionarPedido('${d.id}','aprobar','${p.insumoNom}',${p.cantidad})">✔</button><button onclick="gestionarPedido('${d.id}','rechazar')">✖</button></div></div>` : 
        `<span class="badge status-${p.estado}">${p.estado}</span></div>`);
      
      if (usuarioActual.rol === 'admin') p.estado === 'pendiente' ? pA.innerHTML += finalHtml : hA.innerHTML += finalHtml;
      if (p.usuarioId === usuarioActual.id) uM.innerHTML += finalHtml;
    });
  });
}

window.crearUsuario = async () => {
  const u = document.getElementById("new-user").value.trim().toLowerCase(), p = document.getElementById("new-pass").value.trim(), r = document.getElementById("new-role").value;
  if(u && p) await setDoc(doc(db, "usuarios", u), { pass: p, rol: r });
};

window.eliminarDato = async (c, i) => { if(confirm("¿Borrar?")) await deleteDoc(doc(c, i)); };
window.cerrarSesion = () => location.reload();