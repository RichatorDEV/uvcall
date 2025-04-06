const SERVER_URL = 'https://webrtc-server-production-3fec.up.railway.app';
const socket = io(SERVER_URL);
let localStream, peerConnection, currentCaller, currentOffer, isLoggedIn = false;
const config = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

const authSection = document.getElementById('auth-section');
const callSection = document.getElementById('call-section');
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const callRequestModal = document.getElementById('call-request-modal');
const callerName = document.getElementById('caller-name');
const ringtone = document.getElementById('ringtone');
const settingsPanel = document.getElementById('settings-panel');

document.addEventListener('DOMContentLoaded', () => {
    callRequestModal.classList.add('hidden');
    authSection.classList.remove('hidden');
    callSection.classList.add('hidden');
    loadRingtone(); // Cargar tono de llamada al iniciar
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
        isLoggedIn = true;
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
    ringtone.pause();
}

function logout() {
    hangUp();
    socket.disconnect();
    isLoggedIn = false;
    showLogin();
    socket.connect();
}

socket.on('offer', ({ offer, from }) => {
    if (isLoggedIn && !peerConnection && !callSection.classList.contains('hidden')) {
        currentCaller = from;
        currentOffer = offer;
        callerName.textContent = `${from} está llamándote.`;
        callRequestModal.classList.remove('hidden');
        ringtone.play(); // Reproducir tono al recibir llamada
    }
});

async function acceptCall() {
    callRequestModal.classList.add('hidden');
    ringtone.pause();
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
    ringtone.pause();
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
    callRequestModal.classList.add('hidden');
    clearInputs('reg');
    document.getElementById('reg-status').textContent = '';
    document.getElementById('reg-status').classList.remove('success');
}

function showLogin() {
    authSection.querySelector('#register-form').classList.add('hidden');
    authSection.querySelector('#login-form').classList.remove('hidden');
    callSection.classList.add('hidden');
    callRequestModal.classList.add('hidden');
    clearInputs('login');
    document.getElementById('login-status').textContent = '';
    document.getElementById('login-status').classList.remove('success');
}

function showCallSection() {
    authSection.classList.add('hidden');
    callSection.classList.remove('hidden');
    callRequestModal.classList.add('hidden');
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

function toggleSettings() {
    settingsPanel.classList.toggle('hidden');
}

async function saveRingtone() {
    const fileInput = document.getElementById('ringtone-upload');
    const file = fileInput.files[0];
    if (!file) {
        alert('Por favor, selecciona un archivo de audio.');
        return;
    }

    const formData = new FormData();
    formData.append('ringtone', file);
    formData.append('username', document.getElementById('current-user').textContent);

    const res = await fetch(`${SERVER_URL}/upload-ringtone`, {
        method: 'POST',
        body: formData
    });
    const data = await res.json();
    if (res.ok) {
        loadRingtone(); // Recargar el tono después de guardarlo
        alert('Tono de llamada guardado con éxito.');
    } else {
        alert('Error al guardar el tono: ' + data.error);
    }
}

async function loadRingtone() {
    const username = document.getElementById('current-user').textContent;
    if (!username) return;

    const res = await fetch(`${SERVER_URL}/get-ringtone?username=${username}`);
    if (res.ok) {
        const blob = await res.blob();
        ringtone.src = URL.createObjectURL(blob);
    }
}
