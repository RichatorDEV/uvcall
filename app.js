const SERVER_URL = 'https://webrtc-server-production-3fec.up.railway.app';
const socket = io(SERVER_URL);
let localStream, peerConnection, currentCaller, currentOffer;
const config = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

const authSection = document.getElementById('auth-section');
const callSection = document.getElementById('call-section');
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const callRequestModal = document.getElementById('call-request-modal');
const callerName = document.getElementById('caller-name');

// Inicializar estado
document.addEventListener('DOMContentLoaded', () => {
    callRequestModal.classList.add('hidden'); // Asegurar que el modal esté oculto al cargar
});

async function register() {
    const username = document.getElementById('reg-username').value.trim();
    const password = document.getElementById('reg-password').value.trim();
    const regStatus = document.getElementById('reg-status');

    if (!username || !password) {
        regStatus.textContent = 'Por favor, completa todos los campos.';
        return;
    }

    regStatus.textContent = 'Registrando...';
    const res = await fetch(`${SERVER_URL}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    regStatus.textContent = data.message || data.error;
    if (res.ok) {
        regStatus.classList.add('success');
        setTimeout(() => showLogin(), 1000);
    }
}

async function login() {
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value.trim();
    const loginStatus = document.getElementById('login-status');

    if (!username || !password) {
        loginStatus.textContent = 'Por favor, completa todos los campos.';
        return;
    }

    loginStatus.textContent = 'Iniciando sesión...';
    const res = await fetch(`${SERVER_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    loginStatus.textContent = data.message || data.error;
    if (res.ok) {
        loginStatus.classList.add('success');
        document.getElementById('current-user').textContent = username;
        socket.emit('join', username);
        setTimeout(() => showCallSection(), 1000);
    }
}

async function startCall() {
    const callUsername = document.getElementById('call-username').value.trim();
    const callStatus = document.getElementById('call-status');

    if (!callUsername) {
        callStatus.textContent = 'Estado: Ingresa un usuario a llamar.';
        return;
    }

    callStatus.textContent = `Estado: Solicitando llamada a ${callUsername}...`;
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;

    peerConnection = new RTCPeerConnection(config);
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

    peerConnection.ontrack = (event) => remoteVideo.srcObject = event.streams[0];
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) socket.emit('ice-candidate', { candidate: event.candidate, to: callUsername });
    };

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    socket.emit('offer', { offer, to: callUsername });

    document.getElementById('call-btn').disabled = true;
    document.getElementById('hang-btn').disabled = false;
}

function hangUp() {
    if (peerConnection) peerConnection.close();
    if (localStream) localStream.getTracks().forEach(track => track.stop());
    localVideo.srcObject = remoteVideo.srcObject = null;
    document.getElementById('call-status').textContent = 'Estado: Listo';
    document.getElementById('call-btn').disabled = false;
    document.getElementById('hang-btn').disabled = true;
    peerConnection = null;
    currentCaller = null;
    currentOffer = null;
}

function logout() {
    hangUp();
    socket.disconnect();
    showLogin();
    socket.connect(); // Reconectar para futuros logins
}

socket.on('offer', ({ offer, from }) => {
    if (!peerConnection) { // Solo mostrar modal si no estamos en una llamada
        currentCaller = from;
        currentOffer = offer;
        callerName.textContent = `${from} está llamándote.`;
        callRequestModal.classList.remove('hidden');
    }
});

async function acceptCall() {
    callRequestModal.classList.add('hidden');
    const callStatus = document.getElementById('call-status');

    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;
    peerConnection = new RTCPeerConnection(config);
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

    peerConnection.ontrack = (event) => remoteVideo.srcObject = event.streams[0];
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) socket.emit('ice-candidate', { candidate: event.candidate, to: currentCaller });
    };

    await peerConnection.setRemoteDescription(new RTCSessionDescription(currentOffer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    socket.emit('answer', { answer, to: currentCaller });

    callStatus.textContent = `Estado: En llamada con ${currentCaller}`;
    document.getElementById('call-btn').disabled = true;
    document.getElementById('hang-btn').disabled = false;
}

function rejectCall() {
    callRequestModal.classList.add('hidden');
    socket.emit('reject', { to: currentCaller });
    document.getElementById('call-status').textContent = 'Estado: Llamada rechazada';
    currentCaller = null;
    currentOffer = null;
}

socket.on('answer', async ({ answer }) => {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    document.getElementById('call-status').textContent = `Estado: En llamada con ${document.getElementById('call-username').value}`;
});

socket.on('ice-candidate', async ({ candidate }) => {
    if (peerConnection) await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
});

socket.on('reject', () => {
    hangUp();
    document.getElementById('call-status').textContent = 'Estado: La llamada fue rechazada';
});

socket.on('userList', (users) => {
    const userList = document.getElementById('user-list');
    userList.innerHTML = users.map(user => `<li>${user}</li>`).join('');
});

function showRegister() {
    authSection.querySelector('#register-form').classList.remove('hidden');
    authSection.querySelector('#login-form').classList.add('hidden');
    callSection.classList.add('hidden');
    callRequestModal.classList.add('hidden'); // Asegurar que el modal esté oculto
    clearInputs('reg');
    document.getElementById('reg-status').textContent = '';
    document.getElementById('reg-status').classList.remove('success');
}

function showLogin() {
    authSection.querySelector('#register-form').classList.add('hidden');
    authSection.querySelector('#login-form').classList.remove('hidden');
    callSection.classList.add('hidden');
    callRequestModal.classList.add('hidden'); // Asegurar que el modal esté oculto
    clearInputs('login');
    document.getElementById('login-status').textContent = '';
    document.getElementById('login-status').classList.remove('success');
}

function showCallSection() {
    authSection.classList.add('hidden');
    callSection.classList.remove('hidden');
    callRequestModal.classList.add('hidden'); // Asegurar que el modal esté oculto al inicio
    document.getElementById('call-status').textContent = 'Estado: Listo';
}

function clearInputs(section) {
    if (section === 'reg') {
        document.getElementById('reg-username').value = '';
        document.getElementById('reg-password').value = '';
    } else {
        document.getElementById('login-username').value = '';
        document.getElementById('login-password').value = '';
    }
}
