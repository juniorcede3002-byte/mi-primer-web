// --- BASE DE DATOS LOCAL (Simulada con LocalStorage) ---
let insumos = JSON.parse(localStorage.getItem('insumos')) || [
    { id: 1, nombre: "Papel Bond A4", stock: 150, precio: 5.00, stockMinimo: 20 },
    { id: 2, nombre: "Tóner HP 85A", stock: 12, precio: 60.00, stockMinimo: 3 }
];

let usuarios = JSON.parse(localStorage.getItem('usuarios')) || [
    { id: 1, nombre: "Carlos Admin", user: "admin", pass: "123", rol: "admin" },
    { id: 2, nombre: "Ana Solicitante", user: "applicant", pass: "123", rol: "applicant" }
];

let solicitudes = JSON.parse(localStorage.getItem('solicitudes')) || [
    { id: 101, fecha: "2026-01-26", insumo: "Papel Bond A4", cant: 10, estado: "Pendiente", user: "Ana" }
];

// --- PERSISTENCIA DE SESIÓN ---
window.onload = function() {
    const sesionActiva = JSON.parse(localStorage.getItem('sesionActiva'));
    if (sesionActiva) {
        cargarInterfaz(sesionActiva);
    }
};

// --- AUTENTICACIÓN ---
function login() {
    const u = document.getElementById('username').value;
    const p = document.getElementById('password').value;
    const user = usuarios.find(usr => usr.user === u && usr.pass === p);

    if (user) {
        const sesion = { nombre: user.nombre, rol: user.rol, id: user.id };
        localStorage.setItem('sesionActiva', JSON.stringify(sesion));
        cargarInterfaz(sesion);
    } else {
        alert("Credenciales incorrectas");
    }
}

function logout() {
    localStorage.removeItem('sesionActiva');
    window.location.reload();
}

// --- CONTROL DE VISTAS ---
function cargarInterfaz(sesion) {
    document.getElementById('login-section').classList.add('hidden');
    document.getElementById('navbar').classList.remove('hidden');
    document.getElementById('user-display').innerText = `👤 ${sesion.nombre} | Rol: ${sesion.rol}`;

    if (sesion.rol === 'admin') {
        document.getElementById('admin-dashboard').classList.remove('hidden');
        renderAdmin();
    } else {
        document.getElementById('applicant-dashboard').classList.remove('hidden');
        renderApplicant();
    }
}

// --- LÓGICA DE ADMINISTRADOR ---
function renderAdmin() {
    // 1. Insumos con Edición
    const tbody = document.getElementById('admin-insumos-body');
    tbody.innerHTML = insumos.map(i => `
        <tr>
            <td><strong>${i.nombre}</strong></td>
            <td>${i.stock}</td>
            <td>$${i.precio.toFixed(2)}</td>
            <td>${i.stockMinimo}</td>
            <td>
                <button class="btn btn-primary" onclick="toggleEdit(${i.id})">Ajustar</button>
                <button class="btn" style="background:var(--danger); color:white" onclick="eliminarInsumo(${i.id})">🗑</button>
                <div id="edit-${i.id}" class="hidden edit-panel">
                    <input type="number" id="p-${i.id}" value="${i.precio}" step="0.1">
                    <input type="number" id="s-${i.id}" value="${i.stockMinimo}">
                    <button class="btn-success" onclick="guardarAjuste(${i.id})">OK</button>
                </div>
            </td>
        </tr>
    `).join('');

    // 2. Usuarios
    const userList = document.getElementById('user-list');
    userList.innerHTML = usuarios.map(u => `<li>${u.nombre} (${u.rol})</li>`).join('');

    // 3. Historial/Solicitudes
    const historyBody = document.getElementById('history-body');
    historyBody.innerHTML = solicitudes.map(s => `
        <tr>
            <td>${s.fecha}</td>
            <td>${s.insumo}</td>
            <td>${s.cant} und.</td>
            <td><span class="badge ${s.estado.toLowerCase()}">${s.estado}</span></td>
            <td>
                ${s.estado === 'Pendiente' ? 
                `<button onclick="cambiarEstado(${s.id}, 'Recibido')">✅</button>
                 <button onclick="cambiarEstado(${s.id}, 'Rechazado')">❌</button>` : '---'}
            </td>
        </tr>
    `).join('');
}

function toggleEdit(id) {
    document.getElementById(`edit-${id}`).classList.toggle('hidden');
}

function guardarAjuste(id) {
    const p = parseFloat(document.getElementById(`p-${id}`).value);
    const s = parseInt(document.getElementById(`s-${id}`).value);
    const index = insumos.findIndex(i => i.id === id);
    insumos[index].precio = p;
    insumos[index].stockMinimo = s;
    actualizarStorage();
    renderAdmin();
}

function agregarInsumo() {
    const nom = document.getElementById('new-name').value;
    const stock = parseInt(document.getElementById('new-stock').value);
    if(nom && stock) {
        insumos.push({ id: Date.now(), nombre: nom, stock: stock, precio: 0, stockMinimo: 0 });
        actualizarStorage();
        renderAdmin();
    }
}

function eliminarInsumo(id) {
    insumos = insumos.filter(i => i.id !== id);
    actualizarStorage();
    renderAdmin();
}

function cambiarEstado(id, nuevoEstado) {
    const s = solicitudes.find(sol => sol.id === id);
    if(s) s.estado = nuevoEstado;
    actualizarStorage();
    renderAdmin();
}

// --- LÓGICA DE SOLICITANTE ---
function renderApplicant() {
    const stockList = document.getElementById('applicant-stock-list');
    stockList.innerHTML = insumos.map(i => `
        <div class="card" style="padding:10px; border:1px solid #ddd">
            <strong>${i.nombre}</strong><br>
            Stock: ${i.stock} | Precio: $${i.precio}<br>
            <button class="btn btn-success" onclick="solicitar(${i.id})">Solicitar</button>
        </div>
    `).join('');

    const reqBody = document.getElementById('applicant-requests-body');
    const miSesion = JSON.parse(localStorage.getItem('sesionActiva'));
    reqBody.innerHTML = solicitudes
        .filter(s => s.user === miSesion.nombre.split(' ')[0]) // Filtro simple por nombre
        .map(s => `<tr><td>${s.insumo}</td><td>${s.cant}</td><td>${s.estado}</td></tr>`).join('');
}

function solicitar(id) {
    const ins = insumos.find(i => i.id === id);
    const cant = prompt(`¿Cuántas unidades de ${ins.nombre} necesita?`);
    if(cant > 0) {
        const miSesion = JSON.parse(localStorage.getItem('sesionActiva'));
        solicitudes.push({
            id: Date.now(),
            fecha: new Date().toLocaleDateString(),
            insumo: ins.nombre,
            cant: parseInt(cant),
            estado: "Pendiente",
            user: miSesion.nombre.split(' ')[0]
        });
        actualizarStorage();
        renderApplicant();
        alert("Solicitud enviada");
    }
}

function actualizarStorage() {
    localStorage.setItem('insumos', JSON.stringify(insumos));
    localStorage.setItem('usuarios', JSON.stringify(usuarios));
    localStorage.setItem('solicitudes', JSON.stringify(solicitudes));
}