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

type eventType = 'message' | 'users' | 'new-user' | 'remove-user'

export interface eventDataType {
    data: {
        answer: RTCSessionDescriptionInit,
        iceCandidate: RTCIceCandidateInit,
        offer: RTCSessionDescriptionInit,
    }
    userId: string
    users?: string[]
    type: eventType
}

interface sendEventType {
    data: {
        offer?: RTCSessionDescriptionInit,
        iceCandidate?: RTCIceCandidateInit,
        answer?: RTCSessionDescriptionInit
    }
    userId: string,
}

export class SignalingChannel {
    private static connection: WebSocket;
    private static listeners: Map<string, (data: any) => void>;

    constructor() {
        if (!SignalingChannel.connection) {
            const socket = connectSocket();

            SignalingChannel.connection = socket;

            socket.onmessage = ({data}) => {
                console.log("received: ", data);
                const msg = JSON.parse(String(data));
                const type = msg.type || "message";
                const callback = SignalingChannel.listeners.get(type);
                if (callback) {
                    callback(msg);
                }
            }
        }
        if (!SignalingChannel.listeners) {
            SignalingChannel.listeners = new Map<string, (data: any) => void>();
        }
    }

    addEventListener(type: eventType, callback: (msg: eventDataType) => void) {
        SignalingChannel.listeners.set(type, callback);
    }

    removeEventListener(type: eventType, callback: (msg: eventDataType) => void) {
        if (SignalingChannel.listeners.has(type) && SignalingChannel.listeners.get(type) === callback) {
            SignalingChannel.listeners.delete(type);
        }
    }

    send(event: sendEventType) {
        SignalingChannel.connection.send(JSON.stringify(event));
    }
}