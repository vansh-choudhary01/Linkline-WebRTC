import { useEffect, useState } from "react";
import { SignalingChannel, type socketMessageTypes } from "../utils/websocket";
import * as mediasoupClient from "mediasoup-client";
import { VideoPreview } from "./VideoCall";

function GroupCal({roomId}: {roomId: string}) {
    const [localStream, setLocalStream] = useState<MediaStream | null>(null);
    const [remoteStreams, setRemoteStreams] = useState<{kind: "video" | "audio", stream: MediaStream}[]>([]);
    const signalingChannel = new SignalingChannel();

    useEffect(() => {
        let device: mediasoupClient.types.Device;
        let sendTransport: mediasoupClient.types.Transport;
        let recvTransport: mediasoupClient.types.Transport

        const pendingProducerIds: string[] = [];

        let sendTransportConnectCallback: undefined | { (): void };
        let recvTransportConnectCallback: undefined | { (): void };

        const producerCallbackes = new Map();

        const load_routerRtpCapabilities = async (message: socketMessageTypes) => {
            console.log("load router rtp capabilities", message);
            if (message.type !== "load-routerRtpCapabilities") return;
            let data = message.data;

            device = new mediasoupClient.Device();

            await device.load({
                routerRtpCapabilities: data.routerRtpCapabilities
            });

            signalingChannel.send({
                type: "device-loaded",
                data: {
                    roomId
                }
            });
        }

        signalingChannel.addEventListener("load-routerRtpCapabilities", load_routerRtpCapabilities);

        const transport_created = async (message: socketMessageTypes) => {
            if (message.type !== "transport-created") return;
            const data = message.data;

            sendTransport = await device.createSendTransport({
                id: data.id,
                iceParameters: data.iceParameters,
                iceCandidates: data.iceCandidates,
                dtlsParameters: data.dtlsParameters,
            });

            sendTransport.on("connect", ({ dtlsParameters }, callback, _errback) => {
                sendTransportConnectCallback = callback;

                signalingChannel.send({
                    type: "connect-transport",
                    data: {
                        dtlsParameters,
                        roomId
                    }
                })
            });

            sendTransport.on("produce", ({ kind, rtpParameters }, callback, _errback) => {
                producerCallbackes.set(kind, callback);

                signalingChannel.send({
                    type: "produce",
                    data: {
                        kind,
                        rtpParameters,
                        roomId
                    }
                })
            })

            await startCamera();
        }
        
        signalingChannel.addEventListener("transport-created", transport_created);

        const transport_connected =  async (message: socketMessageTypes) => {
            if (message.type !== "transport-connected") return;

            sendTransportConnectCallback?.();

            sendTransportConnectCallback = undefined;

            return;
        };

        signalingChannel.addEventListener("transport-connected", transport_connected);

        const recv_transport_created = async (message: socketMessageTypes) => {
            if (message.type !== "recv-transport-created") return;
            let data = message.data;

            recvTransport = await device.createRecvTransport({
                id: data.id,
                iceParameters: data.iceParameters,
                iceCandidates: data.iceCandidates,
                dtlsParameters: data.dtlsParameters,
            })

            recvTransport.on("connect", ({ dtlsParameters }, callback, _errback) => {
                recvTransportConnectCallback = callback;

                signalingChannel.send({
                    type: "connect-recv-transport",
                    data: {
                        dtlsParameters,
                        roomId
                    }
                })
            });

            while (pendingProducerIds.length > 0) {
                const producerId = pendingProducerIds.shift()!;

                consumeProducer(producerId);
            }
        };

        signalingChannel.addEventListener("recv-transport-created", recv_transport_created);

        const recv_transport_connected = (message: socketMessageTypes) => {
            if (message.type !== "recv-transport-connected") return;
            recvTransportConnectCallback?.();

            recvTransportConnectCallback = undefined;

            console.log(
                "Receive transport connected"
            );
        };

        signalingChannel.addEventListener("recv-transport-connected", recv_transport_connected);

        const existing_producers = (message: socketMessageTypes) => {
            if (message.type !== "existing-producers") return;

            const producerIds = message.data.producerIds;

            for (const producerId of producerIds) {
                consumeProducer(producerId);
            }
        }
        signalingChannel.addEventListener("existing-producers", existing_producers)

        const new_producer = (message: socketMessageTypes) => {
            if (message.type !== "new-producer") return;
            const producerId = message.data.producerId;

            if (!recvTransport) {
                pendingProducerIds.push(producerId);

                return;
            }

            consumeProducer(producerId);
        }

        signalingChannel.addEventListener("new-producer", new_producer);

        const consumer_created = async (message: socketMessageTypes) => {
            if (message.type !== "consumer-created") return;
            const data = message.data;

            const consumer = await recvTransport.consume({
                id: data.id,
                producerId: data.producerId,
                kind: data.kind,
                rtpParameters: data.rtpParameters,
            })

            const stream = new MediaStream([consumer.track]);

            setRemoteStreams(streams => [...streams, {kind: data.kind, stream }]);

            signalingChannel.send({
                type: "resume-consumer",
                data: {
                    consumerId: data.id,
                    roomId
                }
            })
        }

        signalingChannel.addEventListener("consumer-created", consumer_created)

        async function startCamera() {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: true
            });

            setLocalStream(stream);

            const videoTrack = stream.getVideoTracks()[0];

            await sendTransport.produce({
                track: videoTrack
            })

            const audioTracks = stream.getAudioTracks()[0];

            await sendTransport.produce({
                track: audioTracks
            });
        }

        async function consumeProducer(producerId: string) {
            if (!device) {
                return;
            }

            if (!recvTransport) {
                return;
            }

            signalingChannel.send({
                type: "consume",
                data: {
                    producerId,
                    rtpCapabilities: device.rtpCapabilities,
                    roomId
                }
            })
        }

        return () => {
            signalingChannel.removeEventListener("load-routerRtpCapabilities", load_routerRtpCapabilities);
            signalingChannel.removeEventListener("transport-created", transport_created);
            signalingChannel.removeEventListener("transport-connected", transport_connected);
            signalingChannel.removeEventListener("recv-transport-created", recv_transport_created);
            signalingChannel.removeEventListener("recv-transport-connected", recv_transport_connected);
            signalingChannel.removeEventListener("existing-producers", existing_producers);
            signalingChannel.removeEventListener("new-producer", new_producer);
        }
    }, [roomId])

    return <div className="app-shell group-call-shell">
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
                    <div className="brand-tagline">Group video rooms</div>
                </div>
            </div>

            <div className="topbar-right">
                <div className="connection-pill connection-pill--connected">
                    <span className="status-dot" aria-hidden="true" />
                    <span>Room active</span>
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

        <main className="group-workspace">
            <section className="group-content-column">
                <div className="group-page-heading">
                    <div>
                        <div className="eyebrow"><span className="eyebrow-line" /> GROUP VIDEO ROOM</div>
                        <h1>Bring everyone into the room.</h1>
                        <p className="page-intro">Your room is ready. Keep this window open while people join the conversation.</p>
                    </div>
                    <div className="group-room-badge">
                        <span className="group-room-badge__label">ROOM ID</span>
                        <strong>{roomId || "Waiting for room"}</strong>
                    </div>
                </div>

                <section className="group-stage" aria-label="Group video room">
                    <div className="stage-header">
                        <div>
                            <div className="stage-kicker">LIVE ROOM</div>
                            <h2>Everyone on camera</h2>
                        </div>
                        <div className="stage-tools">
                            <span className="quality-chip"><span className="quality-chip__dot" /> HD ready</span>
                            <span className="stage-count">{remoteStreams.filter((data) => data.kind === "video").length + 1} participants</span>
                        </div>
                    </div>

                    <div className="group-video-grid">
                        <div className="group-video-tile group-video-tile--local">
                            {localStream ? <VideoPreview userStream={localStream} self={true} /> : <div className="group-empty-state">
                                <div className="video-empty-state__icon" aria-hidden="true">
                                    <svg viewBox="0 0 24 24" fill="none">
                                        <path d="M12 14.5a3.5 3.5 0 0 0 3.5-3.5V8a3.5 3.5 0 1 0-7 0v3a3.5 3.5 0 0 0 3.5 3.5Z" stroke="currentColor" strokeWidth="1.6" />
                                        <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3M9 21h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                                    </svg>
                                </div>
                                <strong>Starting your camera</strong>
                                <span>Your preview will appear here.</span>
                            </div>}
                            <div className="group-video-tile__topline">
                                <span className="video-label"><span className="video-label__dot video-label__dot--you" /> YOU</span>
                                <span className="video-tile__signal">Local preview</span>
                            </div>
                            <div className="video-nameplate">
                                <span className="avatar avatar--you">You</span>
                                <span>That’s you</span>
                            </div>
                        </div>

                        {remoteStreams.map((data, i) => data.kind === "video" ? <div key={i} className="group-video-tile">
                            <VideoPreview userStream={data.stream} />
                            <div className="group-video-tile__topline">
                                <span className="video-label"><span className="video-label__dot" /> PARTICIPANT</span>
                                <span className="video-tile__signal">Live video</span>
                            </div>
                            <div className="video-nameplate">
                                <span className="avatar avatar--remote">{i + 1}</span>
                                <span>Participant {i + 1}</span>
                            </div>
                        </div> : null)}

                        {remoteStreams.filter((data) => data.kind === "video").length === 0 && <div className="group-waiting-tile">
                            <div className="group-waiting-tile__icon" aria-hidden="true">
                                <svg viewBox="0 0 24 24" fill="none">
                                    <circle cx="8" cy="9" r="3" stroke="currentColor" strokeWidth="1.5" />
                                    <path d="M3.5 18c.5-2.8 2-4.2 4.5-4.2S12 15.2 12.5 18M15 10a2.5 2.5 0 1 0 0-5M15.5 14.5c2.2.3 3.7 1.5 4.2 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                                </svg>
                            </div>
                            <strong>Waiting for participants</strong>
                            <span>People who join will appear here automatically.</span>
                        </div>}
                    </div>

                    <div className="stage-footer">
                        <div className="stage-footer__details">
                            <span className="stage-footer__status"><span className="stage-footer__dot" /> Your camera and microphone are ready</span>
                            <span className="stage-footer__note">Media server connected</span>
                        </div>
                        <span className="group-room-status"><span className="group-room-status__dot" /> Open room</span>
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
                        <strong>Room tip</strong>
                        <p>Group media is shared in real time. Ask participants to keep their cameras on for the best experience.</p>
                    </div>
                    <span className="info-strip__arrow" aria-hidden="true">↗</span>
                </div>
            </section>

            <aside className="group-control-column">
                <section className="panel group-details-panel">
                    <div className="panel-heading">
                        <div className="panel-heading__icon" aria-hidden="true">
                            <svg viewBox="0 0 24 24" fill="none">
                                <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5h11A2.5 2.5 0 0 1 20 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5v-9Z" stroke="currentColor" strokeWidth="1.6" />
                                <path d="M8 9h8M8 12h5M8 15h3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                            </svg>
                        </div>
                        <div>
                            <div className="panel-kicker">ROOM DETAILS</div>
                            <h2>Share this room</h2>
                        </div>
                    </div>
                    <p className="panel-description">Give this room ID to the people you want to invite.</p>
                    <div className="group-room-id">
                        <span>{roomId || "No room selected"}</span>
                        <span className="group-room-id__status">Active</span>
                    </div>
                </section>

                <section className="panel group-members-panel">
                    <div className="people-heading">
                        <div>
                            <div className="panel-kicker">PARTICIPANTS</div>
                            <h2>People in this room</h2>
                        </div>
                        <span className="people-count">{remoteStreams.filter((data) => data.kind === "video").length + 1}</span>
                    </div>
                    <p className="panel-description">Everyone currently sharing video in this room.</p>
                    <div className="group-member-list">
                        <div className="group-member-row">
                            <span className="avatar avatar--you">You</span>
                            <div className="user-details"><span className="user-label">You</span><span className="user-id">Camera and microphone</span></div>
                            <span className="member-live"><span /> Live</span>
                        </div>
                        {remoteStreams.map((data, i) => data.kind === "video" ? <div key={i} className="group-member-row">
                            <span className="avatar avatar--user">{i + 1}</span>
                            <div className="user-details"><span className="user-label">Participant {i + 1}</span><span className="user-id">Camera and microphone</span></div>
                            <span className="member-live"><span /> Live</span>
                        </div> : null)}
                    </div>
                </section>

                <div className="privacy-card">
                    <div className="privacy-card__icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24" fill="none">
                            <path d="M12 3 19 6v5c0 4.2-2.9 7.5-7 9-4.1-1.5-7-4.8-7-9V6l7-3Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                            <path d="m8.5 12 2.2 2.2 4.8-4.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </div>
                    <div><strong>Built for private group conversations</strong><span>Your room is protected while people connect.</span></div>
                </div>
            </aside>
        </main>

        <footer className="app-footer">
            <span>LINKLINE <span className="footer-separator">/</span> GROUP ROOMS</span>
            <span>Secure by design <span className="footer-heart">♥</span></span>
        </footer>
    </div>
}

export default GroupCal;
