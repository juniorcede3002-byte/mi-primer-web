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

// NAVEGACIÓN ENTRE PÁGINAS
window.verPagina = (id) => {
  document.getElementById('pag-admin').style.display = id === 'admin' ? 'block' : 'none';
  document.getElementById('pag-solicitar').style.display = id === 'solicitar' ? 'block' : 'none';
};

// --- LOGICA DE INVENTARIO (ADMIN) ---

window.agregarProducto = async () => {
  const nombre = document.getElementById("nombre").value.trim().toLowerCase();
  const cantidad = parseInt(document.getElementById("cantidad").value);

  if (!nombre || isNaN(cantidad)) return alert("Datos inválidos");

  const docRef = doc(db, "inventario", nombre);
  const docSnap = await getDoc(docRef);

  if (docSnap.exists()) {
    await updateDoc(docRef, { cantidad: docSnap.data().cantidad + cantidad });
  } else {
    await setDoc(docRef, { nombre, cantidad });
  }
  document.getElementById("nombre").value = "";
  document.getElementById("cantidad").value = "";
};

// --- LOGICA DE SOLICITUD (RESTAR STOCK) ---

window.procesarSolicitud = async () => {
  const usuario = document.getElementById("sol-usuario").value;
  const ubicacion = document.getElementById("sol-ubicacion").value;
  const insumoNom = document.getElementById("sol-insumo").value.trim().toLowerCase();
  const cantSolicitada = parseInt(document.getElementById("sol-cantidad").value);

  if (!usuario || !insumoNom || isNaN(cantSolicitada)) return alert("Completa todos los campos");

  const docRef = doc(db, "inventario", insumoNom);
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) {
    return alert("El producto no existe en el inventario.");
  }

  const stockActual = docSnap.data().cantidad;

  if (stockActual < cantSolicitada) {
    return alert(`Stock insuficiente. Solo quedan ${stockActual} unidades.`);
  }

  // 1. Restar del inventario
  await updateDoc(docRef, { cantidad: stockActual - cantSolicitada });

  // 2. Opcional: Guardar un registro del pedido
  await addDoc(collection(db, "pedidos"), {
    usuario, ubicacion, insumoNom, cantidad: cantSolicitada, fecha: new Date()
  });

  alert("✅ Solicitud procesada y stock descontado.");
  
  // Limpiar campos
  document.getElementById("sol-insumo").value = "";
  document.getElementById("sol-cantidad").value = "";
};

// --- RENDERIZADO EN TIEMPO REAL ---

onSnapshot(collection(db, "inventario"), (querySnapshot) => {
  const lista = document.getElementById("lista");
  const sugerencias = document.getElementById("productos-sugeridos");
  lista.innerHTML = "";
  sugerencias.innerHTML = "";

  querySnapshot.forEach((doc) => {
    const p = doc.data();
    lista.innerHTML += `
      <li>
        <div><strong style="text-transform:uppercase">${p.nombre}</strong><br>Stock: ${p.cantidad}</div>
        <button class="btn-eliminar" onclick="eliminarProducto('${doc.id}')">🗑️</button>
      </li>`;
    sugerencias.innerHTML += `<option value="${p.nombre}">`;
  });
});

window.eliminarProducto = async (id) => {
  if(confirm("¿Borrar?")) await deleteDoc(doc(db, "inventario", id));
};