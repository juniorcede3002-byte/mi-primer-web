import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { 
  getFirestore, doc, setDoc, getDoc, collection, onSnapshot, deleteDoc, updateDoc 
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

// 1. CONFIGURACIÓN CON TUS API KEYS
const firebaseConfig = {
  apiKey: "AIzaSyA3cRmakg2dV2YRuNV1fY7LE87artsLmB8",
  authDomain: "mi-web-db.firebaseapp.com",
  projectId: "mi-web-db",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const lista = document.getElementById("lista");
const sugerencias = document.getElementById("productos-sugeridos");

// --- FUNCIONES ---

// 2. AGREGAR O SUMAR SI YA EXISTE
window.agregarProducto = async () => {
  const nombreInput = document.getElementById("nombre");
  const cantidadInput = document.getElementById("cantidad");
  
  const nombre = nombreInput.value.trim().toLowerCase(); 
  const cantidad = parseInt(cantidadInput.value);

  if (!nombre || isNaN(cantidad)) return alert("Ingresa nombre y cantidad válida");

  const docRef = doc(db, "inventario", nombre);
  const docSnap = await getDoc(docRef);

  if (docSnap.exists()) {
    // Suma a lo existente
    const nuevaCantidad = docSnap.data().cantidad + cantidad;
    await updateDoc(docRef, { cantidad: nuevaCantidad });
  } else {
    // Crea nuevo
    await setDoc(docRef, { nombre, cantidad });
  }

  nombreInput.value = "";
  cantidadInput.value = "";
};

// 3. ELIMINAR PRODUCTO
window.eliminarProducto = async (id) => {
  if(confirm(`¿Seguro que quieres borrar "${id.toUpperCase()}"?`)) {
    await deleteDoc(doc(db, "inventario", id));
  }
};

// 4. RESTAR CANTIDAD
window.restarUno = async (id, cantidadActual) => {
  const docRef = doc(db, "inventario", id);
  if (cantidadActual > 0) {
    await updateDoc(docRef, { cantidad: cantidadActual - 1 });
  } else {
    window.eliminarProducto(id);
  }
};

// 5. SUMAR CANTIDAD
window.sumarUno = async (id, cantidadActual) => {
  const docRef = doc(db, "inventario", id);
  await updateDoc(docRef, { cantidad: cantidadActual + 1 });
};

// 6. ESCUCHAR CAMBIOS Y ACTUALIZAR LISTA + SUGERENCIAS
onSnapshot(collection(db, "inventario"), (querySnapshot) => {
  lista.innerHTML = "";
  sugerencias.innerHTML = ""; 

  querySnapshot.forEach((doc) => {
    const p = doc.data();
    const id = doc.id;
    
    // Llenar Lista Visual
    lista.innerHTML += `
      <li>
        <div>
          <strong style="text-transform: uppercase;">${p.nombre}</strong><br>
          <span style="color: #666;">${p.cantidad} unidades</span>
        </div>
        <div class="controles">
          <button onclick="sumarUno('${id}', ${p.cantidad})">+</button>
          <button onclick="restarUno('${id}', ${p.cantidad})">-</button>
          <button class="btn-eliminar" onclick="eliminarProducto('${id}')">🗑️</button>
        </div>
      </li>
    `;

    // Llenar Datalist de Sugerencias
    sugerencias.innerHTML += `<option value="${p.nombre}">`;
  });
});