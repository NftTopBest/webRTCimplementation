import "./style.css";

import firebase from "firebase/app";
import "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCNn0e6afRxD9RmXSCQODcpSkJ88VKtSeQ",
  authDomain: "fir-rtc-2633f.firebaseapp.com",
  projectId: "fir-rtc-2633f",
  storageBucket: "fir-rtc-2633f.appspot.com",
  messagingSenderId: "346105907800",
  appId: "1:346105907800:web:c5d8388ca55e24238ad82d",
  measurementId: "G-DWW37390G7",
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const firestore = firebase.firestore();

const servers = {
  iceServers: [
    {
      urls: ["stun:stun1.l.google.com:19302", "stun:stun2.l.google.com:19302"],
    },
  ],
  iceCandidatePoolSize: 10,
};

// Global State
const pc = new RTCPeerConnection(servers);
let localStream = null;
let remoteStream = null;

// HTML elements
const webcamButton = document.getElementById("webcamButton");
const webcamVideo = document.getElementById("webcamVideo");
const callButton = document.getElementById("callButton");
const callInput = document.getElementById("callInput");
const answerButton = document.getElementById("answerButton");
const remoteVideo = document.getElementById("remoteVideo");
const hangupButton = document.getElementById("hangupButton");
const chatButton = document.getElementById("chatButton");
const chatInput = document.getElementById("chatInput");
const chatTextArea = document.getElementById("chatTextArea");
let mArray = [];
var caller = null;
var dc = null;
// 1. Setup media sources

webcamButton.onclick = async () => {
  localStream = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true,
  });
  remoteStream = new MediaStream();

  // Push tracks from local stream to peer connection
  localStream.getTracks().forEach((track) => {
    pc.addTrack(track, localStream);
  });

  // Pull tracks from remote stream, add to video stream
  pc.ontrack = (event) => {
    event.streams[0].getTracks().forEach((track) => {
      remoteStream.addTrack(track);
    });
  };

  webcamVideo.srcObject = localStream;
  remoteVideo.srcObject = remoteStream;

  callButton.disabled = false;
  answerButton.disabled = false;
  webcamButton.disabled = true;
};

// 2. Create an offer
callButton.onclick = async () => {
  // Reference Firestore collections for signaling
  const callID = callInput.value;
  const callDoc = firestore.collection("calls").doc(callID);
  const offerCandidates = callDoc.collection("offerCandidates");
  const answerCandidates = callDoc.collection("answerCandidates");
  dc = pc.createDataChannel("channel");
  dc.onmessage = (e) => {
    mArray.push("Peer : " + e.data);
    chatTextArea.value = mArray.join("\n");
    console.log(mArray);
  };
  dc.onopen = (e) => console.log("connection open");
  // Get candidates for caller, save to db
  pc.onicecandidate = (event) => {
    event.candidate && offerCandidates.add(event.candidate.toJSON());
  };

  // Create offer
  const offerDescription = await pc.createOffer();
  await pc.setLocalDescription(offerDescription);

  const offer = {
    sdp: offerDescription.sdp,
    type: offerDescription.type,
  };

  await callDoc.set({ offer });

  // Listen for remote answer
  callDoc.onSnapshot((snapshot) => {
    const data = snapshot.data();
    if (!pc.currentRemoteDescription && data?.answer) {
      const answerDescription = new RTCSessionDescription(data.answer);
      pc.setRemoteDescription(answerDescription);
    }
  });

  // When answered, add candidate to peer connection
  answerCandidates.onSnapshot((snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === "added") {
        const candidate = new RTCIceCandidate(change.doc.data());
        pc.addIceCandidate(candidate);
      }
    });
  });
  answerButton.disabled = true;
  callButton.disabled = true;
  hangupButton.disabled = false;
  chatButton.disabled = false;
  caller = true;
};

// 3. Answer the call with the unique ID
answerButton.onclick = async () => {
  const callId = callInput.value;
  const callDoc = firestore.collection("calls").doc(callId);
  const answerCandidates = callDoc.collection("answerCandidates");
  const offerCandidates = callDoc.collection("offerCandidates");
  pc.ondatachannel = (event) => {
    dc = event.channel;
    dc.onmessage = (e) => {
      mArray.push("Peer : " + e.data);
      chatTextArea.value = mArray.join("\n");
      console.log(mArray);
    };
    dc.onopen = (e) => console.log("connection open");
  };

  pc.onicecandidate = (event) => {
    event.candidate && answerCandidates.add(event.candidate.toJSON());
  };

  const callData = (await callDoc.get()).data();

  const offerDescription = callData.offer;
  await pc.setRemoteDescription(new RTCSessionDescription(offerDescription));

  const answerDescription = await pc.createAnswer();
  await pc.setLocalDescription(answerDescription);

  const answer = {
    type: answerDescription.type,
    sdp: answerDescription.sdp,
  };

  await callDoc.update({ answer });

  offerCandidates.onSnapshot((snapshot) => {
    snapshot.docChanges().forEach((change) => {
      console.log(change);
      if (change.type === "added") {
        let data = change.doc.data();
        pc.addIceCandidate(new RTCIceCandidate(data));
      }
    });
  });
  callButton.disabled = true;
  hangupButton.disabled = false;
  chatButton.disabled = false;
  answerButton.disabled = true;
  caller = false;
};
chatButton.onclick = async () => {
  const content = chatInput.value;
  await dc.send(content);
  mArray.push("You : " + content);
  chatTextArea.value = mArray.join("\n");
  console.log(mArray);
  chatInput.value = "";
};
