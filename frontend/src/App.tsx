import "./index.css"
import "./App.css"
import VideoCall from "./components/VideoCall"
import GroupCall from "./components/GroupCall";
import { useState } from "react";
import { SignalingChannel } from "./utils/websocket";

function App() {
  const [page, setPage] = useState<"one-one" | "group">("one-one");
  const [roomId, setRoomId] = useState<string>("");

      const signalingChannel = new SignalingChannel();
  
      function joinGroup(roomId: string) {
          signalingChannel.send({
              type: "join-room",
              data: {
                  roomId
              }
          })
      }

  return (
    <>
    <button onClick={() => setPage(page === "one-one" ? "group" : "one-one")}>
      {page === "one-one" ? "switch to group" : "switch to 1-1"}
    </button>
    <input value={roomId} onChange={(e) => setRoomId(e.target.value)} placeholder="Room ID" />
    <button onClick={() => {setPage("group"); joinGroup(roomId)}}>Join</button>
    { page === "one-one" && <VideoCall />}
    { page === "group" && <GroupCall roomId={roomId}/>}
    </>
  )
}

export default App
