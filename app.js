const SERVER_URL = 'https://webrtc-server-production-3fec.up.railway.app';
const socket = io(SERVER_URL);
let localStream, peerConnections = {}, currentCaller, currentOffer, isLoggedIn = false, cameraOn = true, selectedCameraId = null, isScreenSharing = false, enlargedVideo = null;
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
    setupVideoClickListeners();
});

function setupVideoClickListeners() {
    videoContainer.addEventListener('click', (event) => {
        const video = event.target.closest('video');
        if (!video) return;

        const wrapper = video.parentElement;
        const username = wrapper.querySelector('.username-label').textContent;
        const isLocal = video.id === 'localVideo';

        if (isScreenSharing && (isLocal || peerConnections[username]?.isScreenSharing)) {
            if (!wrapper.classList.contains('enlarged')) {
                enlargeVideo(wrapper, video, username);
            }
        }
    });
}

function enlargeVideo(wrapper, video, username) {
    if (enlargedVideo) {
        exitFullScreen(enlargedVideo);
    }

    wrapper.classList.add('enlarged');
    const exitBtn = document.createElement('button');
    exitBtn.className = 'exit-fullscreen-btn';
    exitBtn.textContent = '×';
    exitBtn.onclick = () => exitFullScreen(wrapper);
    wrapper.appendChild(exitBtn);
    enlargedVideo = wrapper;

    // Ensure video continues playing
    video.play().catch(error => console.error('Error al reproducir video ampliado:', error));
}

function exitFullScreen(wrapper) {
    wrapper.classList.remove('enlarged');
    const exitBtn = wrapper.querySelector('.exit-fullscreen-btn');
    if (exitBtn) exitBtn.remove();
    enlargedVideo = null;
}

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
            await populateCameraOptions();
        }, 1000);
    }
}

async function checkUserExists(username) {
    const res = await fetch(`${SERVER_URL}/check-user?username=${username}`);
    const data = await res.json();
    return data.exists;
}

async function startCall() {
    const callUsername = callUsernameInput.value.trim();
    const callStatus = document.getElementById('call-status');

    if (!callUsername) {
        callStatus.textContent = 'Estado: Ingresa un usuario a llamar.';
        return;
    }

    const userExists = await checkUserExists(callUsername);
    if (!userExists) {
        callStatus.textContent = 'Estado: El usuario no existe.';
        return;
    }

    callStatus.textContent = `Estado: Solicitando llamada a ${callUsername}...`;
    try {
        if (!localStream) {
            localStream = await navigator.mediaDevices.getUserMedia({ 
                video: selectedCameraId ? { deviceId: { exact: selectedCameraId } } : true, 
                audio: true 
            });
            localVideo.srcObject = localStream;
            console.log('Stream local obtenido:', localStream);
        }

        const pc = new RTCPeerConnection(config);
        peerConnections[callUsername] = pc;
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
    } catch (error) {
        console.error('Error en startCall:', error);
        callStatus.textContent = 'Estado: Error al iniciar la llamada';
    }
}

async function addUserToCall() {
    const callUsername = callUsernameInput.value.trim();
    const callStatus = document.getElementById('call-status');

    if (!callUsername) {
        callStatus.textContent = 'Estado: Ingresa un usuario a añadir.';
        return;
    }

    const userExists = await checkUserExists(callUsername);
    if (!userExists) {
        callStatus.textContent = 'Estado: El usuario no existe.';
        return;
    }

    if (peerConnections[callUsername]) {
        callStatus.textContent = 'Estado: El usuario ya está en la llamada.';
        return;
    }

    if (Object.keys(peerConnections).length >= MAX_PARTICIPANTS - 1) {
        callStatus.textContent = 'Estado: Límite de 4 participantes alcanzado.';
        return;
    }

    callStatus.textContent = `Estado: Añadiendo a ${callUsername} a la llamada...`;
    try {
        const pc = new RTCPeerConnection(config);
        peerConnections[callUsername] = pc;
        localStream.getTracks().forJSONArray.forEach(track => {
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

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('offer', { offer, to: callUsername });
        console.log(`Offer enviado a ${callUsername}:`, offer);

        // Notify existing participants to connect with the new user
        const existingParticipants = Object.keys(peerConnections).filter(user => user !== callUsername);
        socket.emit('new-participant', { newUser: callUsername, participants: existingParticipants });

        callUsernameInput.value = '';
    } catch (error) {
        console.error('Error en addUserToCall:', error);
        callStatus.textContent = 'Estado: Error al añadir usuario';
    }
}

socket.on('new-participant', async ({ newUser, from }) => {
    if (!peerConnections[newUser] && Object.keys(peerConnections).length < MAX_PARTICIPANTS - 1) {
        const callStatus = document.getElementById('call-status');
        callStatus.textContent = `Estado: Conectando con ${newUser}...`;
        try {
            const pc = new RTCPeerConnection(config);
            peerConnections[newUser] = pc;
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

            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            socket.emit('offer', { offer, to: newUser });
            console.log(`Offer enviado a ${newUser}:`, offer);
            updateCallStatus();
        } catch (error) {
            console.error('Error al conectar con nuevo participante:', error);
            callStatus.textContent = 'Estado: Error al conectar con nuevo participante';
        }
    }
});

function addRemoteVideo(username, stream) {
    const placeholder = document.getElementById('remote-placeholder');
    if (Object.keys(peerConnections).length === 1 && placeholder) {
        placeholder.remove();
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
    updateCallStatus();
}

function updateCallStatus() {
    const participants = Object.keys(peerConnections).join(', ');
    document.getElementById('call-status').textContent = participants 
        ? `Estado: En llamada con ${participants}` 
        : 'Estado: Listo';
}

function hangUp() {
    Object.keys(peerConnections).forEach(username => {
        const pc = peerConnections[username];
        if (pc) {
            socket.emit('hangup', { to: username });
            pc.close();
            const wrapper = document.querySelector(`#remoteVideo-${username}`);
            if (wrapper) wrapper.parentElement.remove();
        }
    });
    if (localStream) localStream.getTracks().forEach(track => track.stop());
    localStream = null;
    localVideo.srcObject = null;
    localVideoOff.classList.add('hidden');
    localUsername.textContent = '';
    document.getElementById('call-status').textContent = 'Estado: Listo';
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
    if (enlargedVideo) {
        exitFullScreen(enlargedVideo);
    }
    if (!document.getElementById('remote-placeholder')) {
        const placeholder = document.createElement('div');
        placeholder.className = 'video-wrapper remote-placeholder';
        placeholder.id = 'remote-placeholder';
        placeholder.innerHTML = `
            <span class="username-label">Esperando participante</span>
            <div class="video-placeholder">Sin video</div>
        `;
        videoContainer.appendChild(placeholder);
    }
}

socket.on('offer', async ({ offer, from }) => {
    if (isLoggedIn && !callSection.classList.contains('hidden')) {
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
    stopRingtone();
    const callStatus = document.getElementById('call-status');

    try {
        if (!localStream) {
            localStream = await navigator.mediaDevices.getUserMedia({ 
                video: selectedCameraId ? { deviceId: { exact: selectedCameraId } } : true, 
                audio: true 
            });
            localVideo.srcObject = localStream;
            console.log('Stream local obtenido al aceptar:', localStream);
        }
        const pc = new RTCPeerConnection(config);
        peerConnections[currentCaller] = pc;
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
        updateCallStatus();
    } catch (error) {
        console.error('Error en acceptCall:', error);
        callStatus.textContent = 'Estado: Error al aceptar la llamada';
    }
}

function rejectCall() {
    callRequestModal.classList.add('hidden');
    stopRingtone();
    socket.emit('reject', { to: currentCaller });
    document.getElementById('call-status').textContent = 'Estado: Llamada rechazada';
    currentCaller = null;
    currentOffer = null;
}

socket.on('answer', async ({ answer, from }) => {
    const pc = peerConnections[from];
    if (pc) {
        try {
            await pc.setRemoteDescription(new RTCSessionDescription(answer));
            console.log(`Remote description seteada para ${from} desde answer:`, answer);
            updateCallStatus();
        } catch (error) {
            console.error('Error en setRemoteDescription:', error);
        }
    }
});

socket.on('ice-candidate', async ({ candidate, from }) => {
    const pc = peerConnections[from];
    if (pc) {
        try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
            console.log(`ICE candidate recibido y añadido de ${from}:`, candidate);
        } catch (error) {
            console.error('Error al añadir ICE candidate:', error);
        }
    }
});

socket.on('reject', () => {
    hangUp();
    document.getElementById('call-status').textContent = 'Estado: La llamada fue rechazada';
});

socket.on('hangup', ({ from }) => {
    const pc = peerConnections[from];
    if (pc) {
        pc.close();
        delete peerConnections[from];
        const wrapper = document.querySelector(`#remoteVideo-${from}`);
        if (wrapper) wrapper.parentElement.remove();
        if (Object.keys(peerConnections).length === 0) {
            hangUp();
        } else {
            updateCallStatus();
        }
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
    document.getElementById('call-status').textContent = 'Estado: Listo';
    callBtn.classList.remove('hidden');
    addUserBtn.classList.add('hidden');
    hangBtn.classList.add('hidden');
    cameraBtn.classList.add('hidden');
    screenShareBtn.classList.add('hidden');
    callUsernameInput.value = '';
    localUsername.textContent = '';
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
            ringtone.loop = false;
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
    } catch (error) {
        console.error('Error al enumerar cámaras:', error);
    }
}

async function changeCamera() {
    selectedCameraId = cameraSelect.value;
    if (localStream && !isScreenSharing) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = await navigator.mediaDevices.getUserMedia({ 
            video: { deviceId: { exact: selectedCameraId } }, 
            audio: true 
        });
        localVideo.srcObject = localStream;
        Object.values(peerConnections).forEach(pc => {
            const senders = pc.getSenders();
            const videoTrack = localStream.getVideoTracks()[0];
            senders.forEach(sender => {
                if (sender.track.kind === 'video') {
                    sender.replaceTrack(videoTrack);
                }
            });
        });
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

            Object.values(peerConnections).forEach(pc => {
                const senders = pc.getSenders();
                const videoTrack = localStream.getVideoTracks()[0];
                senders.forEach(sender => {
                    if (sender.track.kind === 'video') {
                        sender.replaceTrack(videoTrack);
                    }
                });
                pc.isScreenSharing = true; // Mark connection as screen sharing
            });

            localStream.getVideoTracks()[0].onended = () => {
                toggleScreenShare();
            };
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

            Object.values(peerConnections).forEach(pc => {
                const senders = pc.getSenders();
                const videoTrack = localStream.getVideoTracks()[0];
                senders.forEach(sender => {
                    if (sender.track.kind === 'video') {
                        sender.replaceTrack(videoTrack);
                    }
                });
                pc.isScreenSharing = false; // Reset screen sharing flag
            });
        }
        console.log('Screen share toggled:', isScreenSharing);
    } catch (error) {
        console.error('Error en toggleScreenShare:', error);
        document.getElementById('call-status').textContent = 'Estado: Error al compartir pantalla';
    }
}

function logout() {
    localStorage.removeItem('username');
    isLoggedIn = false;
    hangUp();
    showLogin();
}
