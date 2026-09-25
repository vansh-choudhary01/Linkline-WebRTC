import { useEffect, useRef, useState } from "react"
import { getCameraStream, getMedia } from "../utils/media";
import { SignalingChannel, type eventDataType } from "../utils/websocket";

async function getConnectedDevices(type: string) {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter((device) => device.kind === type);
}

export default function VideoCall() {
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedAudio, setSelectedAudio] = useState<string>();
  const [selectedVideo, setSelectedVideo] = useState<string>();
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection>(null);
  const [callState, setCallState] = useState<"connected" | "not-connected">("not-connected");
  const [users, setUsers] = useState<Set<string>>(new Set());

  useEffect(() => {
    console.log("asking start")
    if (!selectedVideo) return;
    console.log("asking for video");
    getCameraStream(selectedVideo, 1280, 720)
      .then((stream) => {
        setCameraStream(stream);
      })
  }, [selectedVideo])

  useEffect(() => {
    getMedia()
      .then(({ cameras, microphones }) => {
        setVideoDevices(cameras);
        setAudioDevices(microphones);
        setSelectedVideo(cameras[0]?.deviceId);
      }).catch((err) => {
        console.log("Camera permission/error:", err);
      })

    navigator.mediaDevices.addEventListener('devicechange', async event => {
      setAudioDevices(await getConnectedDevices("audioinput"))
      setVideoDevices(await getConnectedDevices("videoinput"));
    })

    signalingChannel.addEventListener("users", (data) => {
      console.log("users updated", data);
      setUsers(new Set(data.users));
    });
    signalingChannel.addEventListener("new-user", (data) => {
      console.log("new user", data);
      setUsers(prev => {
        prev.add(data.userId);
        return prev;
      })
    })

    signalingChannel.addEventListener("remove-user", (data) => {
      console.log("user left", data);
      setUsers(prev => {
        prev.delete(data.userId);
        return prev;
      })
    })

  }, [])

  const signalingChannel = new SignalingChannel();

  async function makeCall({ userId }: { userId: string }) {
    let peerUserId;
    const configuration = { 'iceServers': [{ 'urls': 'stun:stun.l.google.com:19302' }] };
    const peerConnection = new RTCPeerConnection(configuration);
    cameraStream?.getTracks().forEach(track => {
      peerConnection.addTrack(track, cameraStream);
    })
    signalingChannel.addEventListener('message', async (message) => {
      if (message.data?.answer) {
        const remoteDesc = new RTCSessionDescription(message.data?.answer);
        await peerConnection.setRemoteDescription(remoteDesc);
        peerConnectionRef.current = peerConnection;
        peerUserId = message.userId;
      } else if (message.data?.iceCandidate) {
        try {
          await peerConnection.addIceCandidate(message.data?.iceCandidate);
        } catch (e) {
          console.error(`Error adding received ice candidate`, e);
        }
      }
    });
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    signalingChannel.send({data: { 'offer': offer}, 'userId': userId });

    peerConnection.addEventListener('icecandidate', event => {
      if (event.candidate) {
        signalingChannel.send({data: { iceCandidate: event.candidate}, userId: peerUserId! });
      }
    });

    peerConnection.addEventListener('connectionstatechange', event => {
      if (peerConnection.connectionState === 'connected') {
        // Peers connected will do something here ! cool
        setCallState('connected')
      } else if (peerConnection.connectionState === "disconnected" || peerConnection.connectionState === "closed" || peerConnection.connectionState === "failed") {
        setCallState("not-connected");
      }
    })

    peerConnection.addEventListener('track', async (event) => {
      const [remoteStream] = event.streams;
      setRemoteStream(remoteStream);
    })
  }

  useEffect(() => {
    let peerUserId: string;
    const configuration = { 'iceServers': [{ 'urls': 'stun:stun.l.google.com:19302' }] };
    const peerConnection = new RTCPeerConnection(configuration);
    cameraStream?.getTracks().forEach(track => {
      peerConnection.addTrack(track, cameraStream);
    })

    const messageCallback = async (message: eventDataType) => {
      if (message.data?.offer) {
        peerConnection.setRemoteDescription(new RTCSessionDescription(message.data?.offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        signalingChannel.send({data: { 'answer': answer}, userId: message.userId });
        peerConnectionRef.current = peerConnection;
        peerUserId = message.userId;
      } else if (message.data?.iceCandidate) {
        try {
          await peerConnection.addIceCandidate(message.data?.iceCandidate);
        } catch (e) {
          console.error(`Error adding received ice candidate`, e);
        }
      }
    }

    signalingChannel.addEventListener('message', messageCallback);

    const icecandidateCallback = (event: RTCPeerConnectionIceEvent) => {
      if (event.candidate) {
        signalingChannel.send({data: { iceCandidate: event.candidate}, userId: peerUserId!});
      }
    }

    peerConnection.addEventListener('icecandidate', icecandidateCallback);

    const connectionStatechangeCallback = (event: Event) => {
      if (peerConnection.connectionState === 'connected') {
        // Peers connected will do something here ! cool
        setCallState('connected')
      } else if (peerConnection.connectionState === "disconnected" || peerConnection.connectionState === "closed" || peerConnection.connectionState === "failed") {
        setCallState("not-connected");
      }
    }

    peerConnection.addEventListener('connectionstatechange', connectionStatechangeCallback);

    const trackCallback = async (event: RTCTrackEvent) => {
      const [remoteStream] = event.streams;
      setRemoteStream(remoteStream);
    }

    peerConnection.addEventListener('track', trackCallback)

    return () => {
      signalingChannel.removeEventListener('message', messageCallback);
      peerConnection.removeEventListener('icecandidate', icecandidateCallback);
      peerConnection.removeEventListener('connectionstatechange', connectionStatechangeCallback)
      peerConnection.removeEventListener('track', trackCallback);
    }
  }, []);

  return <div>
    Video call
    <select className="audiosList" name="audio" value={selectedAudio} onChange={(e) => setSelectedAudio(e.target.value)}>
      {audioDevices.map((device, i) => {
        return <option key={i} value={device.deviceId} label={device.label}>{device.label || "audio" + (i + 1)}</option>
      })}
    </select>
    <select className="videosList" name="video" value={selectedVideo} onChange={(e) => setSelectedVideo(e.target.value)}>
      {videoDevices.map((device, i) => {
        return <option key={i} value={device.deviceId} label={device.label}>{device.label || "video" + (i + 1)}</option>
      })}
    </select>

    <UserList users={users} onCall={makeCall} />

    <div>
      <VideoPreview userStream={cameraStream} />
      <VideoPreview userStream={remoteStream} />
    </div>
  </div>
}

function UserList({ users, onCall }: { users: Set<string>, onCall: ({ userId }: { userId: string }) => void }) {
  return <div className="users-list">
    {Array.from(users).map((user, i) => {
      return <div key={i} className="user-card">
        <div className="user-id">{user}</div>
        <button className="call-btn" onClick={() => onCall({ userId: user })}>Call</button>
      </div>
    })}
  </div>
}

function VideoPreview({ userStream }: { userStream: MediaStream | null }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = userStream;
    }
  }, [userStream]);
  return <>
    <video ref={videoRef} id="localVideo" autoPlay playsInline controls={false} width="640" height="480" muted></video>
  </>
}

