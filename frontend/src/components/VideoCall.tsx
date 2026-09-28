import { useEffect, useRef, useState } from "react"
import { getCameraStream, getMedia } from "../utils/media";
import { SignalingChannel, type socketMessageTypes } from "../utils/websocket";

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
  const cameraStreamRef = useRef<MediaStream>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection>(null);
  const [recieverUserId, setRecieverUserId] = useState<string| null>(null);
  const [callState, setCallState] = useState<"connected" | "not-connected">("not-connected");
  const [users, setUsers] = useState<Set<string>>(new Set());
  const [refresh, setRefresh] = useState<boolean>(true);

  useEffect(() => {
    console.log("asking start")
    if (!selectedVideo || !selectedAudio) return;
    console.log("asking for video");
    getCameraStream(selectedVideo, 1280, 720, selectedAudio)
      .then((stream) => {
        const pc = peerConnectionRef.current;

        for (const newTrack of stream?.getTracks()) {
          const sender = pc?.getSenders().find(s => s.track?.kind === newTrack.kind);

          sender?.replaceTrack(newTrack);
        }

        cameraStreamRef.current?.getTracks().forEach(track => track.stop());

        setCameraStream(stream);
        cameraStreamRef.current = stream;
      })
  }, [selectedVideo, selectedAudio])

  useEffect(() => {
    getMedia()
      .then(({ cameras, microphones }) => {
        setVideoDevices(cameras);
        setAudioDevices(microphones);
        setSelectedVideo(cameras[0]?.deviceId);
        setSelectedAudio(microphones[0]?.deviceId);
      }).catch((err) => {
        console.log("Camera permission/error:", err);
      })

    navigator.mediaDevices.addEventListener('devicechange', async () => {
      setAudioDevices(await getConnectedDevices("audioinput"))
      setVideoDevices(await getConnectedDevices("videoinput"));
    })

    signalingChannel.addEventListener("users", (data) => {
      if (data.type !== "users") return;
      console.log("users updated", data);
      setUsers(new Set(data.users));
    });
    signalingChannel.addEventListener("new-user", (data) => {
      if (data.type !== "new-user") return;
      console.log("new user", data);
      setUsers(prev => {
        const set = new Set(prev);
        set.add(data.userId);
        return set;
      })
    })

    signalingChannel.addEventListener("remove-user", (data) => {
      if (data.type !== "remove-user") return;
      console.log("user left", data);
      setUsers(prev => {
        const set = new Set(prev);
        set.delete(data.userId);
        return set;
      })
    })
  }, [])

  const signalingChannel = new SignalingChannel();

  async function makeCall({ userId }: { userId: string }) {
    if (recieverUserId) {
      console.log("already in call with ", recieverUserId);
      return;
    };
    let peerUserId;
    const configuration = { 'iceServers': [{ 'urls': 'stun:stun.l.google.com:19302' }] };
    const peerConnection = new RTCPeerConnection(configuration);
    cameraStreamRef.current?.getTracks().forEach(track => {
      peerConnection.addTrack(track, cameraStreamRef.current!);
    })
    signalingChannel.addEventListener('message', async (message) => {
      if (message.type !== "message") return;
      if (message.data?.answer) {
        const remoteDesc = new RTCSessionDescription(message.data?.answer);
        await peerConnection.setRemoteDescription(remoteDesc);
        peerConnectionRef.current = peerConnection;
        peerUserId = message.userId;
        setRecieverUserId(message.userId);
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
      console.log("got ice candidate", event);
      if (event.candidate) {
        signalingChannel.send({data: { iceCandidate: event.candidate}, userId: peerUserId! });
      }
    });

    peerConnection.addEventListener('connectionstatechange', () => {
      console.log("peer connection state changed to ", peerConnection.connectionState);
      if (peerConnection.connectionState === 'connected') {
        // Peers connected will do something here ! cool
        setCallState('connected')
      } else if (peerConnection.connectionState === "disconnected" || peerConnection.connectionState === "closed" || peerConnection.connectionState === "failed") {
        setCallState("not-connected");
        peerUserId = null;
        setRecieverUserId(null);
        peerConnectionRef.current?.close();
        peerConnectionRef.current = null;
        setRemoteStream(null);
      }
    })

    peerConnection.addEventListener('track', async (event) => {
      console.log("got remote stream", event);
      const [remoteStream] = event.streams;
      setRemoteStream(remoteStream);
    })
  }

  async function endCall() {
    if (!peerConnectionRef.current) return;
    peerConnectionRef.current.close();
    peerConnectionRef.current = null;
    setRemoteStream(null);
    setCallState("not-connected");
    setRecieverUserId(null);
    setRefresh(refresh => !refresh);
  }

  useEffect(() => {
    let peerUserId: string | null;
    const configuration = { 'iceServers': [{ 'urls': 'stun:stun.l.google.com:19302' }] };
    const peerConnection = new RTCPeerConnection(configuration);
    
    const messageCallback = async (message: socketMessageTypes) => {
      if (message.type !== "message") return;
      if (peerUserId) return; // already connected with someone
      if (message.data?.offer) {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(message.data?.offer));
        cameraStreamRef.current?.getTracks().forEach(track => {
          peerConnection.addTrack(track, cameraStreamRef.current!);
        })
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
      console.log("got ice candidate", event);
      if (event.candidate) {
        signalingChannel.send({data: { iceCandidate: event.candidate}, userId: peerUserId!});
      }
    }

    peerConnection.addEventListener('icecandidate', icecandidateCallback);

    const connectionStatechangeCallback = () => {
      console.log("peer connection state changed to ", peerConnection.connectionState);
      if (peerConnection.connectionState === 'connected') {
        // Peers connected will do something here ! cool
        cameraStreamRef.current?.getTracks().forEach(track => {
          peerConnection.addTrack(track, cameraStreamRef.current!);
          console.log("added track", track);
        })
        console.log("cameraStreamRef.current: ", cameraStreamRef.current)
        setCallState('connected')
      } else if (peerConnection.connectionState === "disconnected" || peerConnection.connectionState === "closed" || peerConnection.connectionState === "failed") {
        setCallState("not-connected");
        peerUserId = null;
        peerConnectionRef.current?.close();
        peerConnectionRef.current = null;
        setRemoteStream(null);
        setRefresh(refresh => !refresh);
      }
    }

    peerConnection.addEventListener('connectionstatechange', connectionStatechangeCallback);

    const trackCallback = async (event: RTCTrackEvent) => {
      console.log("got remote stream", event.streams);
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
  }, [refresh]);

  return <div className="app-shell">
    <div className="ambient-glow ambient-glow--top" aria-hidden="true" />
    <div className="ambient-glow ambient-glow--bottom" aria-hidden="true" />

    <header className="topbar">
      <div className="brand-lockup">
        <div className="brand-mark" aria-hidden="true">
          <svg viewBox="0 0 32 32" fill="none">
            <path d="M16 4.5a11.5 11.5 0 1 0 11.5 11.5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            <path d="M16 10.5a5.5 5.5 0 1 0 5.5 5.5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            <circle cx="24.5" cy="7.5" r="3" fill="currentColor" />
          </svg>
        </div>
        <div>
          <div className="brand-name">Linkline</div>
          <div className="brand-tagline">Private video rooms</div>
        </div>
      </div>

      <div className="topbar-right">
        <div className={`connection-pill ${callState === "connected" ? "connection-pill--connected" : ""}`}>
          <span className="status-dot" aria-hidden="true" />
          <span>{callState === "connected" ? "Call connected" : "Ready to connect"}</span>
        </div>
        <div className="secure-label">
          <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M10 2.5 16 5v4.5c0 3.6-2.5 6.4-6 8-3.5-1.6-6-4.4-6-8V5l6-2.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
            <path d="m7.4 10 1.7 1.7 3.6-3.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>Encrypted</span>
        </div>
      </div>
    </header>

    <main className="workspace">
      <section className="content-column">
        <div className="page-heading">
          <div>
            <div className="eyebrow"><span className="eyebrow-line" /> LIVE VIDEO ROOM</div>
            <h1>Make space for a good conversation.</h1>
            <p className="page-intro">Choose your setup, then invite someone into the room when you’re ready.</p>
          </div>
          <div className="session-badge">
            <span className="session-badge__icon" aria-hidden="true">
              <svg viewBox="0 0 20 20" fill="none">
                <rect x="3.25" y="4.5" width="13.5" height="11" rx="2.5" stroke="currentColor" strokeWidth="1.5" />
                <path d="M6.5 8h7M6.5 11h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </span>
            <span><strong>Private session</strong><small>Only people you invite</small></span>
          </div>
        </div>

        <section className="video-stage" aria-label="Video call preview">
          <div className="stage-header">
            <div>
              <div className="stage-kicker">YOUR ROOM</div>
              <h2>Video preview</h2>
            </div>
            <div className="stage-tools">
              <span className="quality-chip"><span className="quality-chip__dot" /> HD ready</span>
              <span className="stage-count">{users.size} {users.size === 1 ? "person" : "people"} waiting</span>
            </div>
          </div>

          <div className="video-grid">
            <div className="video-tile video-tile--remote">
              <VideoPreview userStream={remoteStream} />
              <div className="video-tile__topline">
                <span className="video-label"><span className="video-label__dot" /> REMOTE</span>
                <span className="video-tile__signal">Waiting for video</span>
              </div>
              {!remoteStream && <div className="video-empty-state">
                <div className="video-empty-state__icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none">
                    <rect x="3" y="6" width="12" height="12" rx="3" stroke="currentColor" strokeWidth="1.6" />
                    <path d="m15 10 5-2.5v9L15 14" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                  </svg>
                </div>
                <strong>No one is on camera yet</strong>
                <span>Call someone from the people panel to start.</span>
              </div>}
              <div className="video-nameplate">
                <span className="avatar avatar--remote">G</span>
                <span>Guest</span>
              </div>
            </div>

            <div className="video-tile video-tile--local">
              <VideoPreview userStream={cameraStream} self={true}/>
              <div className="video-tile__topline">
                <span className="video-label"><span className="video-label__dot video-label__dot--you" /> YOU</span>
                <span className="video-tile__signal">Live preview</span>
              </div>
              {!cameraStream && <div className="video-empty-state video-empty-state--local">
                <div className="video-empty-state__icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none">
                    <path d="M12 14.5a3.5 3.5 0 0 0 3.5-3.5V8a3.5 3.5 0 1 0-7 0v3a3.5 3.5 0 0 0 3.5 3.5Z" stroke="currentColor" strokeWidth="1.6" />
                    <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3M9 21h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                </div>
                <strong>Camera preview</strong>
                <span>Select a camera to see yourself here.</span>
              </div>}
              <div className="video-nameplate">
                <span className="avatar avatar--you">You</span>
                <span>That’s you</span>
              </div>
            </div>
          </div>

          <div className="stage-footer">
            <div className="stage-footer__details">
              <span className="stage-footer__status"><span className="stage-footer__dot" /> Your camera and microphone are ready</span>
              <span className="stage-footer__note">Peer-to-peer connection</span>
            </div>
            {(callState === "connected" || remoteStream !== null) && <button type="button" className="end-call-btn" onClick={endCall} aria-label="End call">
              <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="m6 6 8 8M14 6l-8 8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
              </svg>
              <span>End call</span>
            </button>}
          </div>
        </section>

        <div className="info-strip">
          <div className="info-strip__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" stroke="currentColor" strokeWidth="1.6" />
              <path d="M12 10.5v5M12 7.5h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
          <div>
            <strong>Good to know</strong>
            <p>Calls connect directly between browsers. Your media doesn’t pass through a recording server.</p>
          </div>
          <span className="info-strip__arrow" aria-hidden="true">↗</span>
        </div>
      </section>

      <aside className="control-column">
        <section className="panel device-panel">
          <div className="panel-heading">
            <div className="panel-heading__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <rect x="3" y="5" width="18" height="14" rx="3" stroke="currentColor" strokeWidth="1.6" />
                <path d="m8 10 2 2-2 2M12.5 14H16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div>
              <div className="panel-kicker">SETUP</div>
              <h2>Choose your devices</h2>
            </div>
          </div>
          <p className="panel-description">Pick the camera and microphone you want to use for this room.</p>

          <div className="device-fields">
            <label className="device-field">
              <span className="device-field__label"><span className="device-field__icon" aria-hidden="true">◉</span> Camera</span>
              <span className="select-wrap">
                <select className="videosList" name="video" value={selectedVideo} onChange={(e) => setSelectedVideo(e.target.value)} aria-label="Choose camera">
                  {videoDevices.map((device, i) => {
                    return <option key={i} value={device.deviceId} label={device.label}>{device.label || "video" + (i + 1)}</option>
                  })}
                </select>
                <svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </span>
            </label>

            <label className="device-field">
              <span className="device-field__label"><span className="device-field__icon device-field__icon--mic" aria-hidden="true">⌁</span> Microphone</span>
              <span className="select-wrap">
                <select className="audiosList" name="audio" value={selectedAudio} onChange={(e) => setSelectedAudio(e.target.value)} aria-label="Choose microphone">
                  {audioDevices.map((device, i) => {
                    return <option key={i} value={device.deviceId} label={device.label}>{device.label || "audio" + (i + 1)}</option>
                  })}
                </select>
                <svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </span>
            </label>
          </div>

          <div className="device-status"><span className="status-dot status-dot--small" /> Devices detected and ready</div>
        </section>

        <section className="panel people-panel">
          <div className="people-heading">
            <div>
              <div className="panel-kicker">ROOM MEMBERS</div>
              <h2>People in this room</h2>
            </div>
            <span className="people-count">{users.size}</span>
          </div>
          <p className="panel-description">Anyone connected to your room will appear here.</p>
          <UserList users={users} onCall={makeCall} />
        </section>

        <div className="privacy-card">
          <div className="privacy-card__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M12 3 19 6v5c0 4.2-2.9 7.5-7 9-4.1-1.5-7-4.8-7-9V6l7-3Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
              <path d="m8.5 12 2.2 2.2 4.8-4.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div><strong>Built for private conversations</strong><span>Your call stays between participants.</span></div>
        </div>
      </aside>
    </main>

    <footer className="app-footer">
      <span>LINKLINE <span className="footer-separator">/</span> VIDEO ROOMS</span>
      <span>Secure by design <span className="footer-heart">♥</span></span>
    </footer>
  </div>
}

function UserList({ users, onCall }: { users: Set<string>, onCall: ({ userId }: { userId: string }) => void }) {
  return <div className="users-list">
    {users.size === 0 ? <div className="users-empty">
      <div className="users-empty__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none">
          <circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.5" />
          <path d="M3.5 19c.6-3 2.4-4.5 5.5-4.5s4.9 1.5 5.5 4.5M16 10a2.5 2.5 0 1 0 0-5M16.5 14.7c2.2.3 3.5 1.7 4 4.3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>
      <strong>Waiting for someone</strong>
      <span>Share your room link to invite a person.</span>
    </div> : Array.from(users).map((user, i) => {
      return <div key={i} className="user-card">
        <span className="avatar avatar--user" aria-hidden="true">{i + 1}</span>
        <div className="user-details">
          <span className="user-label">Participant {i + 1}</span>
          <span className="user-id" title={user}>{user}</span>
        </div>
        <button type="button" className="call-btn" onClick={() => onCall({ userId: user })}>
          <span>Call</span>
          <svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m6 3 5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      </div>
    })}
  </div>
}

export function VideoPreview({ userStream, self }: { userStream: MediaStream | null, self?: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = userStream;
    }
  }, [userStream]);
  return <>
    <video ref={videoRef} className="video-element" id="localVideo" autoPlay playsInline controls={false} width="640" height="480" {...self ? { muted: true } : {}}></video>
  </>
}

export function AudioPreview({ userStream, self }: { userStream: MediaStream | null, self?: boolean }) {
  const audioRef = useRef<HTMLVideoElement>(null);
  
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.srcObject = userStream;
    }
  }, [userStream]);
  return <>
    <audio ref={audioRef} className="audio-element" id="localVideo" autoPlay playsInline controls={false} {...self ? { muted: true } : {}}></audio>
  </>
}
