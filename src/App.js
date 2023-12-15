import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import Peer from 'simple-peer';

const SERVER_URL = (process.env.SERVER_URL) ? process.env.SERVER_URL : 'http://localhost:8000';
console.log("CONNECTING TO IO SERVER AT:", SERVER_URL);

if (!SERVER_URL) throw "SERVER URL NOT FOUND";


function App() {
	const [yourID, setID] = useState("");
	const [userName, setCurrentUser] = useState("");
	const [users, setUsers] = useState({});
	const [stream, setStream] = useState();
	const [receivingCall, setReceivingCall] = useState(false);
	const [caller, setCaller] = useState({});
	const [callerSignal, setCallerSignal] = useState();
	const [callAccepted, setCallAccepted] = useState(false);

	const userVideo = useRef();
	const partnerVideo = useRef();
	const socket = useRef();

	useEffect(() => {
		socket.current = io.connect(SERVER_URL);

		// check the token
		var newUID;
		try { newUID = crypto.randomUUID(); }
		catch(err) { return alert("Please use HTTPS!"); }
		
		if (!localStorage.getItem('sessionToken')) localStorage.setItem('sessionToken', newUID);

		socket.current.on('connection', (_) => {
			console.log("NEW CONNECTION");
			socket.current.emit('establishConnection', {uid: localStorage.getItem("sessionToken")})
		});

		navigator.mediaDevices.getUserMedia({ video: true, audio: true })
			.then(stream => {
				setStream(stream);
				if (userVideo.current) {
					userVideo.current.srcObject = stream;
				}
			})
			.catch(e => {
				alert("we can not connect to your media devices!");
				console.error(e);
			});


		socket.current.on("yourData", (uData) => {
			setCurrentUser(uData.name);

			if (localStorage.getItem('sessionToken')) {
				console.log("ALREADY THERE");
				// remove the old one?
				socket.current.emit("connAlrExists", {socketId: uData.socketId});
				console.log(`MY DATA IS ${JSON.stringify(uData)}`);
			}
			else {
				localStorage.setItem('sessionToken', uData.uid);
				setCurrentUser(uData.name);
			}

			setID(localStorage.getItem('sessionToken'));
		});

		socket.current.on("allUsers", (users) => {
			setUsers(users);
		});
		
		socket.current.on("RESET", () => {
			alert("RESETTING");
			localStorage.clear();
		});


		socket.current.on("callUser", (data) => {
			console.log(data.from)
			setReceivingCall(true);
			setCaller(data.from); // data.from.socketid
			setCallerSignal(data.signal);
		});

		socket.current.on("callRejected", () => {
			alert("Call was rejected");
		});


		socket.current.on("callEnded", () => {
			window.location.reload(); // change this later
		});
	}, []);


	function callPeer(id) {
		var peer;
		try {
			peer = new Peer({
				initiator: true,
				trickle: false,
				stream: stream,
			});
		}
		catch (err) {
			disconnectCall();
			console.error(err);

		}

		peer.on("signal", data => {
			socket.current.emit("callUser", { userToCall: id, signalData: data, from: yourID })
		});

		peer.on("stream", stream => {
			if (partnerVideo.current) {
				partnerVideo.current.srcObject = stream;
			}
		});

		socket.current.on("callAccepted", signal => {
			setCallAccepted(true);
			peer.signal(signal);
		});
	}


	function acceptCall() {
		setCallAccepted(true);
		const peer = new Peer({
			initiator: false,
			trickle: false,
			stream: stream,
		});

		peer.on("signal", data => {
			socket.current.emit("acceptCall", { signal: data, to: caller['socketid'] })
		});

		peer.on("stream", stream => {
			partnerVideo.current.srcObject = stream;
		});

		peer.signal(callerSignal);
	}

	function rejectCall() {
		setReceivingCall(false);
		setCaller({});
		setCallerSignal(null);

		// Inform the caller that the call has been rejected
		// Adjust this according to your signaling logic
		socket.current.emit("rejectCall", { to: caller['socketid'] });
	}


	function disconnectCall() {
		// Stop each track of the stream to turn off the camera/microphone
		if (stream) {
			stream.getTracks().forEach(track => track.stop());
		}

		// Resetting state variables
		setCallAccepted(false);
		setReceivingCall(false);
		setCaller("");
		setCallerSignal(null);

		// Inform the other peer that the call has been disconnected
		// (You may need additional handling here based on how you've set up signaling)
		socket.current.emit("endCall", { to: caller['socketid'] });
	}

	let UserVideo;
	if (userVideo.current && stream) {
		UserVideo = (
			<video playsInline muted ref={userVideo} autoPlay />
		);
	}

	let PartnerVideo;
	if (callAccepted) {
		PartnerVideo = (
			<video playsInline ref={partnerVideo} autoPlay />
		);
	}

	let incomingCall;
	if (receivingCall && !callAccepted) {
		incomingCall = (
			<div>
				<h1>{caller['name']} is calling you</h1>
				<button onClick={acceptCall}>Accept</button>
				<button onClick={rejectCall}>Reject</button>
			</div>
		)
	}

	return (
		<div>
			<div>
				<h2>Hello {userName}</h2>
			</div>
			{UserVideo}
			{PartnerVideo}
			{callAccepted && <button onClick={disconnectCall}>Hang Up</button>}
			{Object.entries(users).map(([key, val]) => {
				if (key === yourID) {
					return null;
				}

				return (
					<button onClick={() => callPeer(key)}>Call {val['name']}</button>
				);
			})}
			{incomingCall}
		</div>
	);
}

export default App;
