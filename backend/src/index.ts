import { WebSocket, WebSocketServer } from "ws";

const wss = new WebSocketServer({ port: 8080 });

const users = new Map<string, WebSocket>();
const sockets = new Map<WebSocket, string>();

wss.on("connection", (ws: WebSocket) => {
    console.log("ws connected");

    ws.on("message", (msg) => {
        const event = JSON.parse(msg.toString());
        if (event.userId) {
            const socket = users.get(event.userId);
            socket?.send(JSON.stringify({type: "message",
                data: event.data,
                userId: sockets.get(ws)
            }))
        }
    });

    ws.on("close", () => {
        console.log("client disconnected");
        users.delete(sockets.get(ws)!);
        sockets.delete(ws);
        wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({type: "remove-user", userId: sockets.get(ws)}));
            }
        })
    })

    const userId = String(Math.floor(Math.random() * 100000));
    users.set(userId, ws);
    sockets.set(ws, userId);
    ws.send(JSON.stringify({type: "users", users: Array.from(users.keys())}));
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({type: "new-user", userId}));
        }
    })
})