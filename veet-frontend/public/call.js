const myVid = document.getElementById('my-video');
const peerVid = document.getElementById('peer-video');
const videoBtn = document.getElementById('video-ctl');
const endCallBtn = document.getElementById('endcall');
const audioBtn = document.getElementById('audio-ctl');

const env = {};

if (location.hostname == 'localhost') {
	env.ws = 'ws://localhost:8787';
	env.servers = { iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }] };
} else {
	//TODO
	//env.servers = await fetch('/turn.json').then((res) => res.json());
}

videoBtn.addEventListener('click', () => toggleTrack('video'));
audioBtn.addEventListener('click', () => toggleTrack('audio'));
endCallBtn.addEventListener('click', () => location.href = '/');

function toggleTrack(kind) {
	const track = localStream.getTracks().find((t) => t.kind === kind);
	if (track) {
		track.enabled = !track.enabled;
		document.querySelector(`#${kind}-ctl img`).src = `images/${kind}${!track.enabled ? '_off' : ''}.svg`;
	}
}

let ws;
let localStream;
let remoteStream;
let peerConnection;

const wssend = (data) => {
	ws.send(JSON.stringify(data));
};

(async function() {
	const id = new URLSearchParams(location.search).get('i');
	if (!id) {
		alert('No ID provided');
		return;
	}
	ws = new WebSocket(`${env.ws}/${id}`);
	ws.onmessage = handleMessages;
	ws.onopen = () => wssend({ type: 'joined' });
	await startLocalPlayback();
})();

async function handleMessages(event) {
	const message = JSON.parse(event.data);
	console.log(message);

	switch (message.type) {
		case 'joined':
			await makeCall();
			break;
		case 'candidate':
			await acceptCandidate(message.candidate);
			break;
		case 'offer':
			await answerCall(message.offer);
			break;
		case 'answer':
			await startCall(message.answer);
			break;
		case 'left':
			endCall();
			break;
		default:
			console.log('Unknown message type:', message.type);
			break;
	}
}

function endCall() {
	peerConnection.close();
	peerVid.classList.add('hide');
	myVid.classList.remove('video-player-secondary');
}

async function startLocalPlayback() {
	const config = {
		video: {width: {min: 1280, ideal: 1920}, height: {min: 720, ideal: 1080}},
		audio: true,
	};
	localStream = await navigator.mediaDevices.getUserMedia(config);
	myVid.srcObject = localStream;
}

async function makeCall() {
	await connectToPeer();
	const offer = await peerConnection.createOffer();
	await peerConnection.setLocalDescription(offer);
	wssend({ type: 'offer', offer });
}

async function connectToPeer() {
	peerConnection = new RTCPeerConnection(env.servers);
	remoteStream = new MediaStream();
	peerVid.srcObject = remoteStream;
	peerVid.classList.remove('hide');
	myVid.classList.add('video-player-secondary');

	if (!localStream) await startLocalPlayback();

	localStream.getTracks().forEach((track) => {
		peerConnection.addTrack(track, localStream);
	});

	peerConnection.ontrack = (event) => {
		event.streams[0].getTracks().forEach((track) => {
			remoteStream.addTrack(track);
		});
	};

	peerConnection.onicecandidate = (event) => {
		if (event.candidate) {
			wssend({ type: 'candidate', candidate: event.candidate });
		}
	};
}

async function acceptCandidate(candidate) {
	try {
		await peerConnection.addIceCandidate(candidate);
	} catch (error) {
		console.error('Error adding ice candidate:', error);
	}
}

async function answerCall(offer) {
	await connectToPeer();
	await peerConnection.setRemoteDescription(offer);
	const answer = await peerConnection.createAnswer();
	await peerConnection.setLocalDescription(answer);
	wssend({ type: 'answer', answer });
}

async function startCall(answer) {
	await peerConnection.setRemoteDescription(answer);
}