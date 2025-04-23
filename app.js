const SERVER_URL = 'https://webrtc-server-production-3fec.up.railway.app';
const socket = io(SERVER_URL);
let localStream, peerConnections = {}, currentCaller, currentOffer, isLoggedIn = false, cameraOn = true, selectedCameraId = null, isScreenSharing = false;
const config = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] };
const MAX_PARTICIPANTS = 4;

const authSection = document.getElementById('auth-section');
const callSection = document.getElementById('call-section');
const localVideo = document.getElementById('localVideo');
const videoContainer = document.getElementById('video-container');
const localVideoOff = document.getElementById('localVideoOff');
const localUsername = document.getElementById('local-username');
const callRequestModal = document.getElementById('call-request-modal');
const callerName = document.getElementById('caller-name');
const ringtone = document.getElementById('ringtone');
const settingsPanel = document.getElementById('settings-panel');
const callBtn = document.getElementById('call-btn');
const addUserBtn = document.getElementById('add-user-btn');
const hangBtn = document.getElementById('hang-btn');
const cameraBtn = document.getElementById('camera-btn');
const screenShareBtn = document.getElementById('screen-share-btn');
const callUsernameInput = document.getElementById('call-username');
const cameraSelect = document.getElementById('camera-select');

document.addEventListener('DOMContentLoaded', async () => {
    callRequestModal.classList.add('hidden');
    const savedUsername = localStorage.getItem('username');
    if (savedUsername) {
        isLoggedIn = true;
        document.getElementById('current-user').textContent = savedUsername;
        socket.emit('join', savedUsername);
        showCallSection();
        await loadRingtone();
        await populateCameraOptions();
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
    try {
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
    } catch (error) {
        console.error('Error en register:', error);
        regStatus.textContent = 'Error al conectar con el servidor';
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
    try {
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
                await populateCameraOptions();
            }, 1000);
        }
    } catch (error) {
        console.error('Error en login:', error);
        loginStatus.textContent = 'Error al conectar con el servidor';
    }
}

async function checkUserExists(username) {
    try {
        const res = await fetch(`${SERVER_URL}/check-user?username=${username}`);
        const data = await res.json();
        return data.exists;
    } catch (error) {
        console.error('Error en checkUserExists:', error);
        return false;
    }
}

async function initializeLocalStream() {
    try {
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
        }
        localStream = await navigator.mediaDevices.getUserMedia({ 
            video: selectedCameraId ? { deviceId: { exact: selectedCameraId } } : true, 
            audio: true 
        });
        localVideo.srcObject = localStream;
        console.log('Stream local inicializado:', localStream);
        return localStream;
    } catch (error) {
        console.error('Error en initializeLocalStream:', error);
        alert('Error al acceder a la cámara o micrófono: ' + error.message);
        throw error;
    }
}

async function startCall() {
    const callUsername = callUsernameInput.value.trim();

    if (!callUsername) {
        alert('Ingresa un usuario a llamar.');
        return;
    }

    const userExists = await checkUserExists(callUsername);
    if (!userExists) {
        alert('El usuario no existe.');
        return;
    }

    try {
        await initializeLocalStream();

        const pc = new RTCPeerConnection(config);
        peerConnections[callUsername] = { pc, caller: null };
        localStream.getTracks().forEach(track => {
            pc.addTrack(track, localStream);
            console.log(`Track añadido a ${callUsername}:`, track);
        });

        pc.ontrack = (event) => {
            console.log(`Evento ontrack recibido de ${callUsername}:`, event.streams);
            addRemoteVideo(callUsername, event.streams[0]);
        };
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit('ice-candidate', { candidate: event.candidate, to: callUsername });
                console.log(`ICE candidate enviado a ${callUsername}:`, event.candidate);
            }
        };
        pc.onconnectionstatechange = () => {
            console.log(`Estado de conexión para ${callUsername}: ${pc.connectionState}`);
            if (pc.connectionState === 'failed') {
                alert('Fallo en la conexión con ' + callUsername);
                hangUp();
            }
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('offer', { offer, to: callUsername });
        console.log(`Offer enviado a ${callUsername}:`, offer);

        localUsername.textContent = document.getElementById('current-user').textContent;
        callBtn.classList.add('hidden');
        addUserBtn.classList.remove('hidden');
        hangBtn.classList.remove('hidden');
        cameraBtn.classList.remove('hidden');
        screenShareBtn.classList.remove('hidden');
        callUsernameInput.value = '';
        updateVideoGrid();
    } catch (error) {
        console.error('Error en startCall:', error);
        alert('Error al iniciar la llamada: ' + error.message);
    }
}

async function addUserToCall() {
    const callUsername = callUsernameInput.value.trim();

    if (!callUsername) {
        alert('Ingresa un usuario a añadir.');
        return;
    }

    const userExists = await checkUserExists(callUsername);
    if (!userExists) {
        alert('El usuario no existe.');
        return;
    }

    if (peerConnections[callUsername]) {
        alert('El usuario ya está en la llamada.');
        return;
    }

    if (Object.keys(peerConnections).length >= MAX_PARTICIPANTS - 1) {
        alert('Límite de 4 participantes alcanzado.');
        return;
    }

    try {
        if (!localStream) {
            await initializeLocalStream();
        }

        const pc = new RTCPeerConnection(config);
        peerConnections[callUsername] = { pc, caller: document.getElementById('current-user').textContent };
        localStream.getTracks().forEach(track => {
            pc.addTrack(track, localStream);
            console.log(`Track añadido a ${callUsername}:`, track);
        });

        pc.ontrack = (event) => {
            console.log(`Evento ontrack recibido de ${callUsername}:`, event.streams);
            addRemoteVideo(callUsername, event.streams[0]);
            socket.emit('notify-new-user', { newUser: callUsername, to: Object.keys(peerConnections).filter(u => u !== callUsername) });
        };
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit('ice-candidate', { candidate: event.candidate, to: callUsername });
                console.log(`ICE candidate enviado a ${callUsername}:`, event.candidate);
            }
        };
        pc.onconnectionstatechange = () => {
            console.log(`Estado de conexión para ${callUsername}: ${pc.connectionState}`);
            if (pc.connectionState === 'failed') {
                alert('Fallo en la conexión con ' + callUsername);
                hangUp();
            }
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('offer', { offer, to: callUsername });
        console.log(`Offer enviado a ${callUsername}:`, offer);
        callUsernameInput.value = '';
        updateVideoGrid();
    } catch (error) {
        console.error('Error en addUserToCall:', error);
        alert('Error al añadir usuario: ' + error.message);
    }
}

function addRemoteVideo(username, stream) {
    const placeholder = document.getElementById('remote-placeholder');
    if (Object.keys(peerConnections).length === 1 && placeholder) {
        placeholder.remove();
    }

    const currentUser = document.getElementById('current-user').textContent;
    const peer = peerConnections[username];
    if (peer && peer.caller && peer.caller !== currentUser) {
        console.log(`No se muestra video de ${username} porque no es mi caller`);
        return;
    }

    const existingVideo = document.getElementById(`remoteVideo-${username}`);
    if (!existingVideo) {
        const wrapper = document.createElement('div');
        wrapper.className = 'video-wrapper';
        wrapper.innerHTML = `
            <span class="username-label">${username}</span>
            <video id="remoteVideo-${username}" autoplay></video>
            <span class="video-off-text hidden" id="remoteVideoOff-${username}">Cámara Apagada</span>
        `;
        videoContainer.appendChild(wrapper);
        const video = document.getElementById(`remoteVideo-${username}`);
        video.srcObject = stream;
        console.log(`Video remoto añadido para ${username}, stream:`, stream);
    } else {
        existingVideo.srcObject = stream;
        console.log(`Stream actualizado para ${username}:`, stream);
    }
    updateVideoGrid();
}

socket.on('notify-new-user', async ({ newUser }) => {
    if (!peerConnections[newUser] && Object.keys(peerConnections).length < MAX_PARTICIPANTS - 1) {
        try {
            if (!localStream) {
                await initializeLocalStream();
            }
            const pc = new RTCPeerConnection(config);
            peerConnections[newUser] = { pc, caller: null };
            localStream.getTracks().forEach(track => {
                pc.addTrack(track, localStream);
                console.log(`Track añadido a ${newUser}:`, track);
            });

            pc.ontrack = (event) => {
                console.log(`Evento ontrack recibido de ${newUser}:`, event.streams);
                addRemoteVideo(newUser, event.streams[0]);
            };
            pc.onicecandidate = (event) => {
                if (event.candidate) {
                    socket.emit('ice-candidate', { candidate: event.candidate, to: newUser });
                    console.log(`ICE candidate enviado a ${newUser}:`, event.candidate);
                }
            };
            pc.onconnectionstatechange = () => {
                console.log(`Estado de conexión para ${newUser}: ${pc.connectionState}`);
                if (pc.connectionState === 'failed') {
                    alert('Fallo en la conexión con ' + newUser);
                    hangUp();
                }
            };

            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            socket.emit('offer', { offer, to: newUser });
            console.log(`Offer enviado a ${newUser}:`, offer);
            updateVideoGrid();
        } catch (error) {
            console.error('Error en notify-new-user:', error);
            alert('Error al conectar con nuevo usuario: ' + error.message);
        }
    }
});

function removeRemoteVideo(username) {
    const wrapper = document.querySelector(`#remoteVideo-${username}`)?.parentElement;
    if (wrapper) {
        wrapper.remove();
        console.log(`Video remoto eliminado para ${username}`);
    }
    if (Object.keys(peerConnections).length === 0 && !document.getElementById('remote-placeholder')) {
        const placeholder = document.createElement('div');
        placeholder.className = 'video-wrapper remote-placeholder';
        placeholder.id = 'remote-placeholder';
        placeholder.innerHTML = `
            <span class="username-label">Esperando participante</span>
            <div class="video-placeholder">Sin video</div>
        `;
        videoContainer.appendChild(placeholder);
    }
    updateVideoGrid();
}

function updateVideoGrid() {
    const participantCount = Object.keys(peerConnections).length + 1; // +1 para el usuario local
    videoContainer.className = 'video-grid';
    if (participantCount === 1) {
        videoContainer.classList.add('one');
    } else if (participantCount === 2) {
        videoContainer.classList.add('two');
    } else if (participantCount === 3) {
        videoContainer.classList.add('three');
    } else if (participantCount === 4) {
        videoContainer.classList.add('four');
    }
    console.log(`Cuadrícula actualizada para ${participantCount} participantes`);
}

function hangUp() {
    Object.keys(peerConnections).forEach(username => {
        const { pc } = peerConnections[username];
        if (pc) {
            socket.emit('hangup', { to: username });
            pc.close();
            removeRemoteVideo(username);
        }
    });
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    localVideo.srcObject = null;
    localVideoOff.classList.add('hidden');
    localUsername.textContent = '';
    callBtn.classList.remove('hidden');
    addUserBtn.classList.add('hidden');
    hangBtn.classList.add('hidden');
    cameraBtn.classList.add('hidden');
    screenShareBtn.classList.add('hidden');
    callUsernameInput.value = '';
    peerConnections = {};
    currentCaller = null;
    currentOffer = null;
    stopRingtone();
    cameraOn = true;
    isScreenSharing = false;
    cameraBtn.textContent = 'Apagar Cámara';
    screenShareBtn.textContent = 'Compartir Pantalla';
    updateVideoGrid();
}

socket.on('offer', async ({ offer, from }) => {
    if (isLoggedIn && !callSection.classList.contains('hidden')) {
        currentCaller = from;
        currentOffer = offer;
        callerName.textContent = `${from} está llamándote`;
        callRequestModal.classList.remove('hidden');
        ringtone.currentTime = 0;
        ringtone.play().catch(error => console.log('Error al reproducir tono:', error));
        console.log(`Oferta recibida de ${from}:`, offer);
    }
});

async function acceptCall() {
    callRequestModal.classList.add('hidden');
    stopRingtone();

    try {
        await initializeLocalStream();

        const pc = new RTCPeerConnection(config);
        peerConnections[currentCaller] = { pc, caller: currentCaller };
        localStream.getTracks().forEach(track => {
            pc.addTrack(track, localStream);
            console.log(`Track añadido a ${currentCaller}:`, track);
        });

        pc.ontrack = (event) => {
            console.log(`Evento ontrack recibido de ${currentCaller}:`, event.streams);
            addRemoteVideo(currentCaller, event.streams[0]);
        };
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit('ice-candidate', { candidate: event.candidate, to: currentCaller });
                console.log(`ICE candidate enviado a ${currentCaller}:`, event.candidate);
            }
        };
        pc.onconnectionstatechange = () => {
            console.log(`Estado de conexión para ${currentCaller}: ${pc.connectionState}`);
            if (pc.connectionState === 'failed') {
                alert('Fallo en la conexión con ' + currentCaller);
                hangUp();
            }
        };

        await pc.setRemoteDescription(new RTCSessionDescription(currentOffer));
        console.log(`Remote description seteada para ${currentCaller}:`, currentOffer);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('answer', { answer, to: currentCaller });
        console.log(`Answer enviado a ${currentCaller}:`, answer);

        localUsername.textContent = document.getElementById('current-user').textContent;
        callBtn.classList.add('hidden');
        addUserBtn.classList.remove('hidden');
        hangBtn.classList.remove('hidden');
        cameraBtn.classList.remove('hidden');
        screenShareBtn.classList.remove('hidden');
        updateVideoGrid();
    } catch (error) {
        console.error('Error en acceptCall:', error);
        alert('Error al aceptar la llamada: ' + error.message);
    }
}

function rejectCall() {
    callRequestModal.classList.add('hidden');
    stopRingtone();
    socket.emit('reject', { to: currentCaller });
    currentCaller = null;
    currentOffer = null;
    console.log('Llamada rechazada');
}

socket.on('answer', async ({ answer, from }) => {
    const peer = peerConnections[from];
    if (peer && peer.pc) {
        try {
            await peer.pc.setRemoteDescription(new RTCSessionDescription(answer));
            console.log(`Remote description seteada para ${from} desde answer:`, answer);
        } catch (error) {
            console.error('Error en setRemoteDescription:', error);
            alert('Error al procesar la respuesta: ' + error.message);
        }
    } else {
        console.error(`No se encontró peerConnection para ${from}`);
    }
});

socket.on('ice-candidate', async ({ candidate, from }) => {
    const peer = peerConnections[from];
    if (peer && peer.pc) {
        try {
            await peer.pc.addIceCandidate(new RTCIceCandidate(candidate));
            console.log(`ICE candidate recibido y añadido de ${from}:`, candidate);
        } catch (error) {
            console.error('Error al añadir ICE candidate:', error);
        }
    } else {
        console.error(`No se encontró peerConnection para ${from}`);
    }
});

socket.on('reject', () => {
    hangUp();
    console.log('Llamada rechazada por el otro usuario');
});

socket.on('hangup', ({ from }) => {
    const peer = peerConnections[from];
    if (peer && peer.pc) {
        peer.pc.close();
        delete peerConnections[from];
        removeRemoteVideo(from);
        if (Object.keys(peerConnections).length === 0) {
            hangUp();
        }
        console.log(`Usuario ${from} colgó`);
    }
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
    callBtn.classList.remove('hidden');
    addUserBtn.classList.add('hidden');
    hangBtn.classList.add('hidden');
    cameraBtn.classList.add('hidden');
    screenShareBtn.classList.add('hidden');
    callUsernameInput.value = '';
    localUsername.textContent = '';
    updateVideoGrid();
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
    if (!settingsPanel.classList.contains('hidden')) {
        populateCameraOptions();
    }
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

    try {
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
    } catch (error) {
        console.error('Error en saveRingtone:', error);
        alert('Error al guardar el tono');
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
            ringtone.loop = false;
            console.log('Tono de llamada cargado');
        }
    } catch (error) {
        console.log('Error al cargar el tono:', error);
    }
}

function stopRingtone() {
    try {
        ringtone.pause();
        ringtone.currentTime = 0;
        ringtone.loop = false;
        console.log('Tono detenido');
    } catch (error) {
        console.error('Error al detener el tono:', error);
    }
}

async function populateCameraOptions() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        cameraSelect.innerHTML = '';
        videoDevices.forEach((device, index) => {
            const option = document.createElement('option');
            option.value = device.deviceId;
            option.text = device.label || `Cámara ${index + 1}`;
            cameraSelect.appendChild(option);
        });
        if (videoDevices.length > 0 && !selectedCameraId) {
            selectedCameraId = videoDevices[0].deviceId;
        }
        console.log('Opciones de cámara pobladas:', videoDevices);
    } catch (error) {
        console.error('Error al enumerar cámaras:', error);
    }
}

async function changeCamera() {
    selectedCameraId = cameraSelect.value;
    if (localStream && !isScreenSharing) {
        localStream.getTracks().forEach(track => track.stop());
        try {
            localStream = await navigator.mediaDevices.getUserMedia({ 
                video: { deviceId: { exact: selectedCameraId } }, 
                audio: true 
            });
            localVideo.srcObject = localStream;
            Object.values(peerConnections).forEach(peer => {
                const senders = peer.pc.getSenders();
                const videoTrack = localStream.getVideoTracks()[0];
                senders.forEach(sender => {
                    if (sender.track.kind === 'video') {
                        sender.replaceTrack(videoTrack);
                    }
                });
            });
            console.log('Cámara cambiada a:', selectedCameraId);
        } catch (error) {
            console.error('Error en changeCamera:', error);
            alert('Error al cambiar la cámara');
        }
    }
}

function toggleCamera() {
    if (!localStream) return;

    const videoTrack = localStream.getVideoTracks()[0];
    cameraOn = !cameraOn;
    videoTrack.enabled = cameraOn;
    localVideoOff.classList.toggle('hidden', cameraOn);
    cameraBtn.textContent = cameraOn ? 'Apagar Cámara' : 'Encender Cámara';
    console.log('Cámara toggled:', cameraOn);
}

async function toggleScreenShare() {
    try {
        if (!isScreenSharing) {
            localStream.getTracks().forEach(track => track.stop());
            localStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
            localVideo.srcObject = localStream;
            isScreenSharing = true;
            screenShareBtn.textContent = 'Volver a Cámara';
            localVideoOff.classList.add('hidden');
            cameraOn = true;

            Object.values(peerConnections).forEach(peer => {
                const senders = peer.pc.getSenders();
                const videoTrack = localStream.getVideoTracks()[0];
                senders.forEach(sender => {
                    if (sender.track.kind === 'video') {
                        sender.replaceTrack(videoTrack);
                    }
                });
            });

            localStream.getVideoTracks()[0].onended = () => {
                toggleScreenShare();
            };
            console.log('Pantalla compartida iniciada');
        } else {
            localStream.getTracks().forEach(track => track.stop());
            localStream = await navigator.mediaDevices.getUserMedia({ 
                video: selectedCameraId ? { deviceId: { exact: selectedCameraId } } : true, 
                audio: true 
            });
            localVideo.srcObject = localStream;
            isScreenSharing = false;
            screenShareBtn.textContent = 'Compartir Pantalla';
            localVideoOff.classList.toggle('hidden', !cameraOn);

            Object.values(peerConnections).forEach(peer => {
                const senders = peer.pc.getSenders();
                const videoTrack = localStream.getVideoTracks()[0];
                senders.forEach(sender => {
                    if (sender.track.kind === 'video') {
                        sender.replaceTrack(videoTrack);
                    }
                });
            });
            console.log('Vuelto a cámara');
        }
        updateVideoGrid();
    } catch (error) {
        console.error('Error en toggleScreenShare:', error);
        alert('Error al compartir pantalla: ' + error.message);
    }
}

function logout() {
    localStorage.removeItem('username');
    isLoggedIn = false;
    hangUp();
    showLogin();
}
