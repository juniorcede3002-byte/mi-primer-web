// --- BASE DE DATOS LOCAL ---
let insumos = JSON.parse(localStorage.getItem('insumos')) || [
    { id: 1, nombre: "Papel Bond A4", stock: 120, precio: 4.50, stockMinimo: 20 },
    { id: 2, nombre: "Tóner Láser HP", stock: 8, precio: 85.00, stockMinimo: 2 }
];

let usuarios = JSON.parse(localStorage.getItem('usuarios')) || [
    { user: "admin", nombre: "Administrador General", rol: "admin" },
    { user: "applicant", nombre: "Área de Compras", rol: "applicant" }
];

let historial = JSON.parse(localStorage.getItem('historial')) || [
    { id: 101, fecha: "2026-01-20", insumo: "Papel Bond A4", tipo: "Salida", cantidad: 5, estado: "Pendiente" }
];

// --- GESTIÓN DE SESIÓN (PERSISTENCIA) ---
function login() {
    const userVal = document.getElementById('username').value.toLowerCase();
    const userFound = usuarios.find(u => u.user === userVal);

    if (userFound) {
        localStorage.setItem('sesionActiva', JSON.stringify(userFound));
        initApp();
    } else {
        alert("Usuario no válido");
    }
}

function logout() {
    localStorage.removeItem('sesionActiva');
    location.reload();
}

function initApp() {
    const sesion = JSON.parse(localStorage.getItem('sesionActiva'));
    if (!sesion) return;

    // Mostrar UI según rol
    document.getElementById('login-section').classList.add('hidden');
    document.getElementById('main-nav').classList.remove('hidden');
    document.getElementById('welcome-msg').innerText = `Usuario: ${sesion.nombre} | Rol: ${sesion.rol.toUpperCase()}`;

    if (sesion.rol === 'admin') {
        document.getElementById('admin-panel').classList.remove('hidden');
        renderAdmin();
    } else {
        document.getElementById('applicant-panel').classList.remove('hidden');
        renderApplicant();
    }
}

// --- FUNCIONES DE ADMINISTRADOR ---
function renderAdmin() {
    // 1. Listado de Usuarios
    const userDisplay = document.getElementById('user-list-display');
    userDisplay.innerHTML = usuarios.map(u => `<li>👤 ${u.nombre} (ID: ${u.user})</li>`).join('');

    // 2. Tabla de Insumos (con Ajuste de Precio y Stock Mínimo)
    const insumosList = document.getElementById('admin-insumos-list');
    insumosList.innerHTML = insumos.map(i => `
        <tr>
            <td>${i.nombre}</td>
            <td><b>${i.stock}</b></td>
            <td>$<input type="number" step="0.01" class="edit-input" id="p-${i.id}" value="${i.precio}"></td>
            <td><input type="number" class="edit-input" id="m-${i.id}" value="${i.stockMinimo}"></td>
            <td><button class="btn btn-primary" onclick="actualizarInsumo(${i.id})">Guardar</button></td>
        </tr>
    `).join('');

    // 3. Historial de Movimientos
    const historyList = document.getElementById('full-history-list');
    historyList.innerHTML = historial.map(h => `
        <tr>
            <td>${h.fecha}</td>
            <td>${h.insumo}</td>
            <td>${h.tipo}</td>
            <td>${h.cantidad}</td>
            <td><span class="badge ${h.estado.toLowerCase()}">${h.estado}</span></td>
            <td>
                ${h.estado === 'Pendiente' ? `<button class="btn btn-success" onclick="cambiarEstado(${h.id}, 'Recibido')">Aprobar</button>` : '---'}
            </td>
        </tr>
    `).join('');
}

function actualizarInsumo(id) {
    const nuevoPrecio = document.getElementById(`p-${id}`).value;
    const nuevoMinimo = document.getElementById(`m-${id}`).value;

    insumos = insumos.map(i => i.id === id ? {...i, precio: parseFloat(nuevoPrecio), stockMinimo: parseInt(nuevoMinimo)} : i);
    saveAll();
    alert("Insumo actualizado");
    renderAdmin();
}

function cambiarEstado(id, nuevoEstado) {
    historial = historial.map(h => h.id === id ? {...h, estado: nuevoEstado} : h);
    saveAll();
    renderAdmin();
}

// --- FUNCIONES DE SOLICITANTE ---
function renderApplicant() {
    const stockList = document.getElementById('applicant-stock-list');
    stockList.innerHTML = insumos.map(i => `
        <tr>
            <td>${i.nombre}</td>
            <td>${i.stock}</td>
            <td>$${i.precio}</td>
            <td><button class="btn btn-primary" onclick="crearSolicitud('${i.nombre}')">Solicitar 1</button></td>
        </tr>
    `).join('');

    const reqList = document.getElementById('applicant-requests-list');
    reqList.innerHTML = historial.map(h => `
        <tr>
            <td>${h.insumo}</td>
            <td>${h.cantidad}</td>
            <td><span class="badge ${h.estado.toLowerCase()}">${h.estado}</span></td>
        </tr>
    `).join('');
}

function crearSolicitud(nombreInsumo) {
    const nuevaSol = {
        id: Date.now(),
        fecha: new Date().toLocaleDateString(),
        insumo: nombreInsumo,
        tipo: "Salida",
        cantidad: 1,
        estado: "Pendiente"
    };
    historial.push(nuevaSol);
    saveAll();
    renderApplicant();
}

// --- UTILIDADES ---
function saveAll() {
    localStorage.setItem('insumos', JSON.stringify(insumos));
    localStorage.setItem('historial', JSON.stringify(historial));
    localStorage.setItem('usuarios', JSON.stringify(usuarios));
}

// Arrancar al cargar la página
window.onload = initApp;