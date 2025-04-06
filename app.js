const SERVER_URL = 'https://webrtc-server-production-3fec.up.railway.app';
const socket = io(SERVER_URL);
let localStream, peerConnection, currentCaller, currentOffer, isLoggedIn = false, cameraOn = true;
const config = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] };

const authSection = document.getElementById('auth-section');
const callSection = document.getElementById('call-section');
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const localVideoOff = document.getElementById('localVideoOff');
const remoteVideoOff = document.getElementById('remoteVideoOff');
const localUsername = document.getElementById('local-username');
const remoteUsername = document.getElementById('remote-username');
const callRequestModal = document.getElementById('call-request-modal');
const callerName = document.getElementById('caller-name');
const ringtone = document.getElementById('ringtone');
const settingsPanel = document.getElementById('settings-panel');
const callBtn = document.getElementById('call-btn');
const hangBtn = document.getElementById('hang-btn');
const cameraBtn = document.getElementById('camera-btn');
const callUsernameInput = document.getElementById('call-username');

document.addEventListener('DOMContentLoaded', async () => {
    callRequestModal.classList.add('hidden');
    const savedUsername = localStorage.getItem('username');
    if (savedUsername) {
        isLoggedIn = true;
        document.getElementById('current-user').textContent = savedUsername;
        socket.emit('join', savedUsername);
        showCallSection();
        await loadRingtone();
    } else {
        authSection.classList.remove('hidden');
        callSection.classList.add('hidden');
    }
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
        localStorage.setItem('username', username);
        socket.emit('join', username);
        setTimeout(async () => {
            showCallSection();
            await loadRingtone();
        }, 1000);
    }
}

async function startCall() {
    const callUsername = callUsernameInput.value.trim();
    const callStatus = document.getElementById('call-status');

    if (!callUsername) {
        callStatus.textContent = 'Estado: Ingresa un usuario a llamar.';
        return;
    }

    callStatus.textContent = `Estado: Solicitando llamada a ${callUsername}...`;
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideo.srcObject = localStream;

        peerConnection = new RTCPeerConnection(config);
        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

        peerConnection.ontrack = (event) => {
            remoteVideo.srcObject = event.streams[0];
            remoteVideoOff.classList.add('hidden');
            remoteUsername.textContent = callUsername;
        };
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) socket.emit('ice-candidate', { candidate: event.candidate, to: callUsername });
        };

        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        socket.emit('offer', { offer, to: callUsername });

        localUsername.textContent = document.getElementById('current-user').textContent;
        callBtn.classList.add('hidden');
        hangBtn.classList.remove('hidden');
        cameraBtn.classList.remove('hidden');
        callUsernameInput.classList.add('hidden');
    } catch (error) {
        console.error('Error en startCall:', error);
        callStatus.textContent = 'Estado: Error al iniciar la llamada';
    }
}

function hangUp() {
    if (peerConnection) {
        const remoteUser = currentCaller || callUsernameInput.value;
        socket.emit('hangup', { to: remoteUser });
        peerConnection.close();
    }
    if (localStream) localStream.getTracks().forEach(track => track.stop());
    localVideo.srcObject = remoteVideo.srcObject = null;
    localVideoOff.classList.add('hidden');
    remoteVideoOff.classList.add('hidden');
    localUsername.textContent = '';
    remoteUsername.textContent = '';
    document.getElementById('call-status').textContent = 'Estado: Listo';
    callBtn.classList.remove('hidden');
    hangBtn.classList.add('hidden');
    cameraBtn.classList.add('hidden');
    callUsernameInput.classList.remove('hidden');
    peerConnection = null;
    currentCaller = null;
    currentOffer = null;
    stopRingtone(); // Usar función para detener tono
    cameraOn = true;
    cameraBtn.textContent = 'Apagar Cámara';
}

socket.on('offer', async ({ offer, from }) => {
    if (isLoggedIn && !peerConnection && !callSection.classList.contains('hidden')) {
        currentCaller = from;
        currentOffer = offer;
        callerName.textContent = `${from} está llamándote.`;
        callRequestModal.classList.remove('hidden');
        ringtone.currentTime = 0;
        ringtone.play().catch(error => console.log('Error al reproducir tono:', error));
    }
});

async function acceptCall() {
    callRequestModal.classList.add('hidden');
    stopRingtone(); // Detener tono al aceptar
    const callStatus = document.getElementById('call-status');

    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideo.srcObject = localStream;
        peerConnection = new RTCPeerConnection(config);
        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

        peerConnection.ontrack = (event) => {
            remoteVideo.srcObject = event.streams[0];
            remoteVideoOff.classList.add('hidden');
            remoteUsername.textContent = currentCaller;
        };
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) socket.emit('ice-candidate', { candidate: event.candidate, to: currentCaller });
        };

        await peerConnection.setRemoteDescription(new RTCSessionDescription(currentOffer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        socket.emit('answer', { answer, to: currentCaller });

        localUsername.textContent = document.getElementById('current-user').textContent;
        callStatus.textContent = `Estado: En llamada con ${currentCaller}`;
        callBtn.classList.add('hidden');
        hangBtn.classList.remove('hidden');
        cameraBtn.classList.remove('hidden');
        callUsernameInput.classList.add('hidden');
    } catch (error) {
        console.error('Error en acceptCall:', error);
        callStatus.textContent = 'Estado: Error al aceptar la llamada';
    }
}

function rejectCall() {
    callRequestModal.classList.add('hidden');
    stopRingtone(); // Detener tono al rechazar
    socket.emit('reject', { to: currentCaller });
    document.getElementById('call-status').textContent = 'Estado: Llamada rechazada';
    currentCaller = null;
    currentOffer = null;
}

socket.on('answer', async ({ answer, from }) => {
    try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
        document.getElementById('call-status').textContent = `Estado: En llamada con ${callUsernameInput.value}`;
        remoteUsername.textContent = callUsernameInput.value;
    } catch (error) {
        console.error('Error en setRemoteDescription:', error);
    }
});

socket.on('ice-candidate', async ({ candidate }) => {
    if (peerConnection) {
        try {
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (error) {
            console.error('Error al añadir ICE candidate:', error);
        }
    }
});

socket.on('reject', () => {
    hangUp();
    document.getElementById('call-status').textContent = 'Estado: La llamada fue rechazada';
});

socket.on('hangup', () => {
    hangUp();
    document.getElementById('call-status').textContent = 'Estado: Llamada finalizada';
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
    callBtn.classList.remove('hidden');
    hangBtn.classList.add('hidden');
    cameraBtn.classList.add('hidden');
    callUsernameInput.classList.remove('hidden');
    localUsername.textContent = '';
    remoteUsername.textContent = '';
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
        await loadRingtone();
        alert('Tono de llamada guardado con éxito.');
    } else {
        alert('Error al guardar el tono: ' + data.error);
    }
}

async function loadRingtone() {
    const username = document.getElementById('current-user').textContent;
    if (!username) return;

    try {
        const res = await fetch(`${SERVER_URL}/get-ringtone?username=${username}`);
        if (res.ok) {
            const blob = await res.blob();
            const newSrc = URL.createObjectURL(blob);
            if (ringtone.src !== newSrc) {
                URL.revokeObjectURL(ringtone.src);
                ringtone.src = newSrc;
            }
            await ringtone.load();
        }
    } catch (error) {
        console.log('Error al cargar el tono:', error);
    }
}

function stopRingtone() {
    try {
        ringtone.pause();
        ringtone.currentTime = 0;
        console.log('Tono detenido');
    } catch (error) {
        console.error('Error al detener el tono:', error);
    }
}

function toggleCamera() {
    if (!localStream) return;

    const videoTrack = localStream.getVideoTracks()[0];
    cameraOn = !cameraOn;
    videoTrack.enabled = cameraOn;
    localVideoOff.classList.toggle('hidden', cameraOn);
    cameraBtn.textContent = cameraOn ? 'Apagar Cámara' : 'Encender Cámara';
}
