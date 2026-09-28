import { WebSocket, WebSocketServer } from "ws";
import * as mediasoup from "mediasoup";
import dotenv from "dotenv";
dotenv.config();

const wss = new WebSocketServer({ port: 8080 });

const users = new Map<string, WebSocket>();
const sockets = new Map<WebSocket, { userId: string, connected: "online" | "group" | null, roomId?: string }>();
type roomsType = {
    router: mediasoup.types.Router;
    producers: Map<string, mediasoup.types.Producer>;
    producerOwners: Map<string, WebSocket>;
    consumers: Map<string, mediasoup.types.Consumer>;
    peers: Set<string>
}
const rooms = new Map<string, roomsType>();
const workers = new Map<string, mediasoup.types.Worker>();

async function createWorker() {
    const worker = await mediasoup.createWorker();

    return worker;
}

async function createRouter(worker: mediasoup.types.Worker) {
    const router = await worker.createRouter({
        mediaCodecs: [
            {
                kind: "audio",
                mimeType: "audio/opus",
                clockRate: 48000,
                channels: 2
            },
            {
                kind: "video",
                mimeType: "video/VP8",
                clockRate: 90000,
            }
        ]
    })

    return router;
}



wss.on("connection", (ws: WebSocket) => {
    console.log("ws connected");

    let sendTransport: mediasoup.types.WebRtcTransport | undefined;
    let recvTransport: mediasoup.types.WebRtcTransport | undefined;

    ws.on("message", async (msg) => {
        try {
            const event = JSON.parse(msg.toString());
            if (event.userId) {
                const socket = users.get(event.userId);
                socket?.send(JSON.stringify({
                    type: "message",
                    data: event.data,
                    userId: sockets.get(ws)?.userId
                }))

                return;
            }

            // get
            // create
            // join
            // leave

            switch (event.type) {
                case "join-room":
                    {
                        const { roomId } = event.data;
                        // is router is already available for this room
                        if (roomId) {
                            if (rooms.has(roomId)) {
                                ws.send(JSON.stringify({
                                    type: "load-routerRtpCapabilities",
                                    data: {
                                        routerRtpCapabilities: rooms.get(roomId)?.router.rtpCapabilities
                                    }
                                }))
                            } else {
                                const worker = await createWorker();
                                workers.set(roomId, worker);
                                const router = await createRouter(worker);
                                rooms.set(roomId, {
                                    router: router,
                                    producers: new Map(),
                                    producerOwners: new Map(),
                                    consumers: new Map(),
                                    peers: new Set()
                                });
                                ws.send(JSON.stringify({
                                    type: "load-routerRtpCapabilities",
                                    data: {
                                        routerRtpCapabilities: router.rtpCapabilities
                                    }
                                }))
                            }
                        }
                        return;
                    }
                case "device-loaded":
                    {
                        const { roomId } = event.data;
                        if (!roomId) {
                            throw new Error("roomId isn't available");
                        }
                        if (!rooms.has(roomId)) return;
                        const room = rooms.get(roomId);
                        const router = room?.router!;
                        sendTransport = await router.createWebRtcTransport({
                            listenInfos: [
                                {
                                    protocol: "udp",
                                    ip: "0.0.0.0",
                                    announcedAddress: process.env.PUBLIC_IP
                                }
                            ]
                        });

                        recvTransport = await router.createWebRtcTransport({
                            listenInfos: [
                                {
                                    protocol: "udp",
                                    "ip": "0.0.0.0",
                                    announcedAddress: process.env.PUBLIC_IP
                                }
                            ]
                        });

                        room?.peers.add(userId);
                        sockets.get(ws)!.connected = "group";
                        sockets.get(ws)!.roomId = roomId;

                        ws.send(JSON.stringify({
                            type: "transport-created",
                            data: {
                                id: sendTransport.id,
                                iceParameters: sendTransport.iceParameters,
                                iceCandidates: sendTransport.iceCandidates,
                                dtlsParameters: sendTransport.dtlsParameters
                            }
                        }));

                        ws.send(JSON.stringify({
                            type: "recv-transport-created",
                            data: {
                                id: recvTransport.id,
                                iceParameters: recvTransport.iceParameters,
                                iceCandidates: recvTransport.iceCandidates,
                                dtlsParameters: recvTransport.dtlsParameters
                            }
                        }))

                        ws.send(JSON.stringify({
                            type: "existing-producers",
                            data: {
                                producerIds: [...room?.producers.keys()!]
                            }
                        }))
                        return;
                    }
                case "connect-transport":
                    {
                        if (!sendTransport) {
                            throw new Error("Send transport not created");
                        }

                        await sendTransport.connect({
                            dtlsParameters: event.data.dtlsParameters,
                        })

                        ws.send(JSON.stringify({
                            type: "transport-connected"
                        }));

                        return;
                    }
                case "produce":
                    {
                        const { roomId } = event.data;
                        if (!sendTransport) {
                            throw new Error("Send transport not created");
                        }
                        if (!roomId) {
                            throw new Error("roomId isn't available")
                        }

                        const producer = await sendTransport.produce({
                            kind: event.data.kind,
                            rtpParameters: event.data.rtpParameters
                        })

                        const room = rooms.get(roomId)!;
                        room?.producers.set(producer.id, producer);
                        room?.producerOwners.set(producer.id, ws);
                        rooms.set(roomId, room);

                        ws.send(JSON.stringify({ type: "producer-created", data: { id: producer.id, kind: producer.kind } }));

                        // tell other users about new producer
                        for (const client of room.peers) {
                            const socket = users.get(client)!;
                            if (
                                socket !== ws &&
                                socket?.readyState === WebSocket.OPEN
                            ) {
                                socket.send(JSON.stringify({
                                    type: "new-producer",
                                    data: {
                                        producerId: producer.id
                                    }
                                }));
                            }
                        }

                        return;
                    }
                case "connect-recv-transport":
                    {
                        if (!recvTransport) {
                            throw new Error("Receive transport not created");
                        }

                        await recvTransport.connect({
                            dtlsParameters: event.data.dtlsParameters,
                        })

                        ws.send(JSON.stringify({
                            type: "recv-transport-connected"
                        }));
                        return;
                    }
                case "consume":
                    {
                        if (!recvTransport) {
                            throw new Error("Receive transport not created");
                        }
                        const { roomId } = event.data;
                        if (!roomId) {
                            throw new Error("roomId isn't available");
                        }

                        const room = rooms.get(roomId);
                        const producer = room?.producers.get(event.data.producerId);

                        if (!producer) {
                            throw new Error("producer not found");
                        }

                        const canConsume = room?.router.canConsume({
                            producerId: event.data.producerId,
                            rtpCapabilities: event.data.rtpCapabilities
                        });

                        if (!canConsume) {
                            throw new Error("Cannot consume producer");
                        }

                        const consumer = await recvTransport.consume({
                            producerId: event.data.producerId,
                            rtpCapabilities: event.data.rtpCapabilities,
                            paused: true
                        })

                        room?.consumers.set(consumer.id, consumer);

                        ws.send(JSON.stringify({
                            type: "consumer-created",
                            data: {
                                id: consumer.id,
                                producerId: event.data.producerId,
                                kind: consumer.kind,
                                rtpParameters: consumer.rtpParameters,
                                owner: sockets.get(room!.producerOwners.get(event.data.producerId)!)?.userId
                            }
                        }));

                        return;
                    }
                case "resume-consumer":
                    {
                        const { roomId } = event.data;
                        if (!roomId) {
                            throw new Error("roomId isn't available");
                            return;
                        }
                        const room = rooms.get(roomId);
                        const consumer = room?.consumers.get(event.data.consumerId);

                        if (!consumer) {
                            throw new Error("consumer not found");
                        }

                        await consumer.resume();

                        return;
                    }
                case "leave":
                    {
                        const { roomId } = event.data;
                        leaveRoom(roomId);
                    }
            }

        } catch (error) {

            console.error(
                "WebSocket error:",
                error
            );

        }
    });

    function leaveRoom(roomId: string) {
        try {
            const room = rooms.get(roomId);
            if (room) {
                room.producers.forEach((producer, id) => {
                    if (room.producerOwners.get(id) === ws) {
                        producer.close();
                        room.producers.delete(id);
                        room.producerOwners.delete(id);
                    }

                    // tell other users about new producer
                    for (const client of room.peers) {
                        const socket = users.get(client)!;
                        if (
                            socket !== ws &&
                            socket?.readyState === WebSocket.OPEN
                        ) {
                            socket.send(JSON.stringify({
                                type: "user-left",
                                data: {
                                    userId
                                }
                            }));
                        }
                    }
                })

                room.peers.delete(userId);
                if (room.peers.size === 0) {
                    rooms.delete(roomId);
                    room.router.close();
                    workers.get(roomId)?.close();
                    workers.delete(roomId);
                } else {
                    rooms.set(roomId, room);
                }
            }
        } catch (error) {
            console.error(
                "WebSocket error:",
                error
            );
        }
    }

    ws.on("close", () => {
        wss.clients.forEach((client) => {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({ type: "remove-user", userId: sockets.get(ws) }));
            }
        })
        users.delete(sockets.get(ws)?.userId!);
        if (sockets.get(ws)?.connected === "group") {
            leaveRoom(sockets.get(ws)!.roomId!);
        }
        sockets.delete(ws);
    })

    const userId = String(Math.floor(Math.random() * 100000));
    ws.send(JSON.stringify({ type: "users", users: Array.from(users.keys()) }));
    users.set(userId, ws);
    sockets.set(ws, { userId, connected: null });
    wss.clients.forEach((client) => {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: "new-user", userId }));
        }
    })
})

console.log("server running on port 8080");
