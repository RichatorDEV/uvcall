const socket = io();
let localStream, peerConnection;
const config = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

const authSection = document.getElementById('auth-section');
const callSection = document.getElementById('call-section');
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');

async function register() {
    const username = document.getElementById('reg-username').value;
    const password = document.getElementById('reg-password').value;
    const res = await fetch('/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    document.getElementById('reg-status').textContent = data.message || data.error;
    if (res.ok) clearInputs('reg');
}

async function login() {
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;
    const res = await fetch('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    document.getElementById('login-status').textContent = data.message || data.error;
    if (res.ok) {
        document.getElementById('current-user').textContent = username;
        socket.emit('join', username);
        showCallSection();
    }
}

async function startCall() {
    const callUsername = document.getElementById('call-username').value;
    document.getElementById('call-status').textContent = `Estado: Llamando a ${callUsername}...`;

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
}

function logout() {
    hangUp();
    showLogin();
}

socket.on('offer', async ({ offer, from }) => {
    if (!peerConnection) {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideo.srcObject = localStream;
        peerConnection = new RTCPeerConnection(config);
        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
        peerConnection.ontrack = (event) => remoteVideo.srcObject = event.streams[0];
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) socket.emit('ice-candidate', { candidate: event.candidate, to: from });
        };
    }
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    socket.emit('answer', { answer, to: from });
    document.getElementById('call-status').textContent = `Estado: En llamada con ${from}`;
    document.getElementById('call-btn').disabled = true;
    document.getElementById('hang-btn').disabled = false;
});

socket.on('answer', async ({ answer }) => {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
});

socket.on('ice-candidate', async ({ candidate }) => {
    await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
});

socket.on('userList', (users) => {
    const userList = document.getElementById('user-list');
    userList.innerHTML = users.map(user => `<li>${user}</li>`).join('');
});

function showRegister() {
    authSection.querySelector('#register-form').classList.remove('hidden');
    authSection.querySelector('#login-form').classList.add('hidden');
    callSection.classList.add('hidden');
    clearInputs('reg');
}

function showLogin() {
    authSection.querySelector('#register-form').classList.add('hidden');
    authSection.querySelector('#login-form').classList.remove('hidden');
    callSection.classList.add('hidden');
    clearInputs('login');
}

function showCallSection() {
    authSection.classList.add('hidden');
    callSection.classList.remove('hidden');
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