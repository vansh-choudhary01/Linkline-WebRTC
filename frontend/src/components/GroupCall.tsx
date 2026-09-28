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

    return <>
        {localStream && <VideoPreview userStream={localStream} self={true}/>}
        <div>
            {remoteStreams.map((data, i) => data.kind === "video" ? <VideoPreview key={i} userStream={data.stream} /> : <></>)}
        </div>
    </>
}

export default GroupCal;