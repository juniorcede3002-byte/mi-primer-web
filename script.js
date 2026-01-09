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

// --- FUNCIONES ---

// 2. AGREGAR O SUMAR SI YA EXISTE
window.agregarProducto = async () => {
  const nombreInput = document.getElementById("nombre");
  const cantidadInput = document.getElementById("cantidad");
  
  const nombre = nombreInput.value.trim().toLowerCase(); 
  const cantidad = parseInt(cantidadInput.value);

  if (!nombre || isNaN(cantidad)) return alert("Llena los campos correctamente");

  const docRef = doc(db, "inventario", nombre);
  const docSnap = await getDoc(docRef);

  if (docSnap.exists()) {
    const nuevaCantidad = docSnap.data().cantidad + cantidad;
    await updateDoc(docRef, { cantidad: nuevaCantidad });
  } else {
    await setDoc(docRef, { nombre, cantidad });
  }

  nombreInput.value = "";
  cantidadInput.value = "";
};

// 3. ELIMINAR PRODUCTO
window.eliminarProducto = async (id) => {
  if(confirm("¿Eliminar este producto?")) {
    await deleteDoc(doc(db, "inventario", id));
  }
};

// 4. RESTAR CANTIDAD (Botón -)
window.restarUno = async (id, cantidadActual) => {
  const docRef = doc(db, "inventario", id);
  if (cantidadActual > 0) {
    await updateDoc(docRef, { cantidad: cantidadActual - 1 });
  }
};

// 5. SUMAR CANTIDAD (Botón +)
window.sumarUno = async (id, cantidadActual) => {
  const docRef = doc(db, "inventario", id);
  await updateDoc(docRef, { cantidad: cantidadActual + 1 });
};

// 6. ESCUCHAR CAMBIOS EN TIEMPO REAL
onSnapshot(collection(db, "inventario"), (querySnapshot) => {
  lista.innerHTML = "";
  querySnapshot.forEach((doc) => {
    const p = doc.data();
    const id = doc.id;
    
    lista.innerHTML += `
      <li>
        <strong>${p.nombre.toUpperCase()}</strong>: ${p.cantidad} unidades
        <div class="controles">
          <button onclick="sumarUno('${id}', ${p.cantidad})">+</button>
          <button onclick="restarUno('${id}', ${p.cantidad})">-</button>
          <button class="btn-eliminar" onclick="eliminarProducto('${id}')">Borrar</button>
        </div>
      </li>
    `;
  });
});