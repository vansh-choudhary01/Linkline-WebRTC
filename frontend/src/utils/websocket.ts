import * as mediasoupClient from "mediasoup-client";

function connectSocket() {
    const socket = new WebSocket("ws://localhost:8080");

    socket.onopen = () => {
        console.log("websocket connected");
    }

    socket.onmessage = (event) => {
        console.log("Received: ", event);
    }

    socket.onclose = () => {
        console.log("Disconnected");
    }


    return socket;
}

export type socketMessageTypes = {
    type: "load-routerRtpCapabilities",
    data: {
        routerRtpCapabilities: mediasoupClient.types.RtpCapabilities;
    }
} | {
    type: "transport-created",
    data: {
        id: string,
        iceParameters: mediasoupClient.types.IceParameters,
        iceCandidates: mediasoupClient.types.IceCandidate[],
        dtlsParameters: mediasoupClient.types.DtlsParameters,
    }
} | {
    type: "recv-transport-created",
    data: {
        id: string,
        iceParameters: mediasoupClient.types.IceParameters,
        iceCandidates: mediasoupClient.types.IceCandidate[],
        dtlsParameters: mediasoupClient.types.DtlsParameters,
    }
} | {
    type: "recv-transport-connected"
} | {
    type: "transport-connected"
} | {
    type: "producer-created",
    data: {
        id: string,
        kind: mediasoupClient.types.MediaKind,
        rtpParameters: mediasoupClient.types.RtpParameters,
        paused: boolean
    }
} | {
    type: "consumer-created",
    data: {
        id: string,
        producerId: string,
        kind: mediasoupClient.types.MediaKind,
        rtpParameters: mediasoupClient.types.RtpParameters,
        paused: boolean
    }
} | {
    type: "existing-producers",
    data: {
        producerIds: string[]
    }
} | {
    type: "new-producer",
    data: {
        producerId: string
    }
} 
| {
    data: {
        answer: RTCSessionDescriptionInit,
        iceCandidate: RTCIceCandidateInit,
        offer: RTCSessionDescriptionInit,
    }
    userId: string
    users?: string[]
    type: eventType
};

type mediasoupTypes = "load-routerRtpCapabilities" | "transport-created" | "transport-connected" | "producer-created" | "recv-transport-created" | "recv-transport-connected" | "existing-producers" | "new-producer" | "consumer-created"

type eventType = 'message' | 'users' | 'new-user' | 'remove-user'

export interface eventDataType {
    data: {
        answer: RTCSessionDescriptionInit,
        iceCandidate: RTCIceCandidateInit,
        offer: RTCSessionDescriptionInit,
    }
    userId: string
    type: eventType
}

type mediasoupSendTypes = "join-room" | "device-loaded" | "connect-transport" | "produce" | "connect-recv-transport" | "consume" | "resume-consumer" | "leave"

type socketSendEventTypes = {
    type: "join-room",
    data: {
        roomId: string
    }
} | {
    type: "device-loaded",
    data: {
        roomId: string
    }
} | {
    type: "connect-transport",
    data: {
        dtlsParameters: mediasoupClient.types.DtlsParameters
        roomId: string
    }
} | {
    type: "produce",
    data: {
        kind: mediasoupClient.types.MediaKind,
        rtpParameters: mediasoupClient.types.RtpParameters
        roomId: string
    }
} | {
    type: "connect-recv-transport",
    data: {
        dtlsParameters: mediasoupClient.types.DtlsParameters
        roomId: string
    }
} | {
    type: "consume",
    data: {
        producerId: string,
        rtpCapabilities: mediasoupClient.types.RtpCapabilities
        roomId: string
    }
} | {
    type: "resume-consumer",
    data: {
        consumerId: string
        roomId: string
    }
} | {
    type: "leave"
    data: {
        roomId: string
    }
} | sendEventType;
interface sendEventType {
    data: {
        offer?: RTCSessionDescriptionInit,
        iceCandidate?: RTCIceCandidateInit,
        answer?: RTCSessionDescriptionInit
    }
    userId: string,
    type?: mediasoupSendTypes
}

export class SignalingChannel {
    private static connection: WebSocket;
    private static listeners: Map<string, (data: socketMessageTypes) => void>;
    private static onOpenSender: (() => void)[] = [];

    constructor() {
        if (!SignalingChannel.connection) {
            const socket = connectSocket();

            SignalingChannel.connection = socket;

            socket.onmessage = ({data}) => {
                console.log("received: ", data);
                const msg = JSON.parse(String(data)) as socketMessageTypes;
                const type = msg.type || "message";
                const callback = SignalingChannel.listeners.get(type);
                if (callback) {
                    callback(msg);
                }
            }

            socket.onopen = () => {
                for (const cb of SignalingChannel.onOpenSender) {
                    cb();
                }
            }
        }
        if (!SignalingChannel.listeners) {
            SignalingChannel.listeners = new Map<string, (data: socketMessageTypes) => void>();
        }
    }

    addEventListener(type: eventType | mediasoupTypes, callback: (msg: socketMessageTypes) => any) {
        SignalingChannel.listeners.set(type, callback);
    }

    removeEventListener(type: eventType | mediasoupTypes, callback: (msg: socketMessageTypes) => void) {
        if (SignalingChannel.listeners.has(type) && SignalingChannel.listeners.get(type) === callback) {
            SignalingChannel.listeners.delete(type);
        }
    }
    
    send(event: socketSendEventTypes) {
        if (SignalingChannel.connection.readyState !== WebSocket.OPEN) {
            SignalingChannel.onOpenSender.push(() => {
                SignalingChannel.connection.send(JSON.stringify(event));
            })
            return;
        }
        console.log("sending: ", event);
        SignalingChannel.connection.send(JSON.stringify(event));
    }
}
