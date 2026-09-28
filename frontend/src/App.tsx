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
    <div className="app-router">
      <div className="mode-toolbar">
        <div className="mode-toolbar__inner">
          <div className="mode-toolbar__context">
            <span className="mode-toolbar__eyebrow">WORKSPACE</span>
            <span className="mode-toolbar__mode">{page === "one-one" ? "Private call" : "Group room"}</span>
          </div>
          <div className="mode-toolbar__actions">
            <button type="button" className="mode-switch-btn" onClick={() => setPage(page === "one-one" ? "group" : "one-one")}>
              <svg viewBox="0 0 18 18" fill="none" aria-hidden="true">
                <path d="M5 6h8M5 6l2-2M5 6l2 2M13 12H5M13 12l-2-2M13 12l-2 2" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>{page === "one-one" ? "Switch to group" : "Switch to 1–1"}</span>
            </button>
            <div className="room-join-form">
              <label className="room-id-label" htmlFor="room-id">Join room</label>
              <input id="room-id" value={roomId} onChange={(e) => setRoomId(e.target.value)} placeholder="Enter room ID" />
              <button type="button" className="join-room-btn" onClick={() => {setPage("group"); joinGroup(roomId)}}>
                <span>Join</span>
                <svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 8h9M8 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    { page === "one-one" && <VideoCall />}
    { page === "group" && <GroupCall roomId={roomId}/>}
    </div>
  )
}

export default App
