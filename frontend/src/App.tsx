import "./index.css"
import "./App.css"
import VideoCall from "./components/VideoCall"
import GroupCall from "./components/GroupCall";
import { useState } from "react";
import { createBrowserRouter, Outlet, useLocation, useNavigate } from "react-router";

export const routes = createBrowserRouter([{
  path: "/",
  element: <App />,
  children: [
    { index: true, element: null },
    { path: "online", element: <VideoCall /> },
    { path: ":roomId", element: <GroupCall /> },
  ],
}]);

function App() {
  const [roomId, setRoomId] = useState<string>("");
  const navigate = useNavigate();
  const location = useLocation();
  const isGroupRoom = location.pathname !== "/" && location.pathname !== "/online";

  function handlePageChange(path: string) {
    navigate(path);
  }

  function openGroupRoom() {
    const trimmedRoomId = roomId.trim();
    if (!trimmedRoomId) return;

    handlePageChange(`/${trimmedRoomId}`);
  }

  if (location.pathname === "/") {
    return <div className="app-router">
      <HomePage roomId={roomId} setRoomId={setRoomId} onOneToOne={() => handlePageChange("/online")} onGroupRoom={openGroupRoom} />
    </div>
  }

  return (
    <div className="app-router">
      <div className="mode-toolbar">
        <div className="mode-toolbar__inner">
          <div className="mode-toolbar__context">
            <span className="mode-toolbar__eyebrow">WORKSPACE</span>
            <span className="mode-toolbar__mode">{isGroupRoom ? "Group room" : "Private call"}</span>
          </div>
          <div className="mode-toolbar__actions">
            <button type="button" className="mode-switch-btn" disabled={!isGroupRoom && !roomId.trim()} onClick={() => isGroupRoom ? handlePageChange("/online") : openGroupRoom()}>
              <svg viewBox="0 0 18 18" fill="none" aria-hidden="true">
                <path d="M5 6h8M5 6l2-2M5 6l2 2M13 12H5M13 12l-2-2M13 12l-2 2" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>{isGroupRoom ? "Switch to 1–1" : "Open group room"}</span>
            </button>
            <div className="room-join-form">
              <label className="room-id-label" htmlFor="room-id">Join room</label>
              <input id="room-id" value={roomId} onChange={(e) => setRoomId(e.target.value)} placeholder="Enter room ID" />
              <button type="button" className="join-room-btn" disabled={!roomId.trim()} onClick={openGroupRoom}>
                <span>Join</span>
                <svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 8h9M8 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
            </div>
          </div>
        </div>
      </div>
      <Outlet />
    </div>
  )
}

function HomePage({
  roomId,
  setRoomId,
  onOneToOne,
  onGroupRoom,
}: {
  roomId: string;
  setRoomId: (roomId: string) => void;
  onOneToOne: () => void;
  onGroupRoom: () => void;
}) {
  return <div className="app-shell home-page">
    <div className="ambient-glow ambient-glow--top" aria-hidden="true" />
    <div className="ambient-glow ambient-glow--bottom" aria-hidden="true" />

    <header className="topbar home-topbar">
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
      <div className="home-header-note"><span className="home-header-note__dot" /> No account required</div>
    </header>

    <main className="home-workspace">
      <section className="home-hero">
        <div className="home-hero__copy">
          <div className="eyebrow"><span className="eyebrow-line" /> SIMPLE, PRIVATE CONNECTIONS</div>
          <h1>Good conversations start with a little space.</h1>
          <p className="home-hero__intro">Linkline makes it easy to connect face-to-face—one person at a time or with your whole group.</p>
          <div className="home-trust-row">
            <span><span className="home-trust-row__icon">✓</span> Browser based</span>
            <span><span className="home-trust-row__icon">✓</span> No recording by default</span>
          </div>
        </div>

        <div className="home-visual" aria-hidden="true">
          <div className="home-visual__halo" />
          <div className="home-visual__window">
            <div className="home-visual__topline"><span>LINKLINE</span><span>PRIVATE ROOM</span></div>
            <div className="home-visual__tiles">
              <div className="home-visual__tile home-visual__tile--main"><span className="home-visual__avatar home-visual__avatar--purple">A</span><small>Alex</small></div>
              <div className="home-visual__tile home-visual__tile--small"><span className="home-visual__avatar home-visual__avatar--mint">Y</span><small>You</small></div>
            </div>
            <div className="home-visual__status"><span /> Encrypted connection <b>HD</b></div>
          </div>
          <span className="home-visual__spark home-visual__spark--one" />
          <span className="home-visual__spark home-visual__spark--two" />
        </div>
      </section>

      <section className="home-options" aria-labelledby="connection-options-title">
        <div className="home-section-heading">
          <div>
            <div className="panel-kicker">GET STARTED</div>
            <h2 id="connection-options-title">How do you want to connect?</h2>
          </div>
          <span>Choose an option to enter your room</span>
        </div>

        <div className="home-option-grid">
          <article className="home-option-card home-option-card--private">
            <div className="home-option-card__topline">
              <span className="home-option-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none"><rect x="3" y="5" width="13" height="14" rx="3" stroke="currentColor" strokeWidth="1.6" /><path d="m16 10 5-2.5v9L16 14" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /></svg>
              </span>
              <span className="home-option-tag">FASTEST START</span>
            </div>
            <h3>One-to-one call</h3>
            <p>Start a private video room and connect directly with one person.</p>
            <button type="button" className="home-primary-btn" onClick={onOneToOne}>
              <span>Start a private call</span>
              <svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 8h9M8 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          </article>

          <article className="home-option-card home-option-card--group">
            <div className="home-option-card__topline">
              <span className="home-option-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none"><circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.6" /><path d="M3.5 19c.6-3 2.4-4.5 5.5-4.5s4.9 1.5 5.5 4.5M16 10a2.5 2.5 0 1 0 0-5M16.5 14.7c2.2.3 3.5 1.7 4 4.3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
              </span>
              <span className="home-option-tag">ROOM BASED</span>
            </div>
            <h3>Group room</h3>
            <p>Join a shared room with friends, teammates, or your community.</p>
            <div className="home-room-form">
              <label htmlFor="home-room-id">Room ID</label>
              <div className="home-room-form__controls">
                <input id="home-room-id" value={roomId} onChange={(e) => setRoomId(e.target.value)} placeholder="Enter room ID" />
                <button type="button" className="home-primary-btn" disabled={!roomId.trim()} onClick={onGroupRoom}>
                  <span>Join room</span>
                  <svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 8h9M8 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
              </div>
            </div>
          </article>
        </div>
      </section>

      <section className="home-steps" aria-label="How Linkline works">
        <div className="home-step"><span>01</span><div><strong>Choose your room</strong><p>Pick a private call or enter a group room ID.</p></div></div>
        <div className="home-step"><span>02</span><div><strong>Allow your devices</strong><p>Choose the camera and microphone you want to use.</p></div></div>
        <div className="home-step"><span>03</span><div><strong>Start talking</strong><p>Connect in the browser with no account or download.</p></div></div>
      </section>
    </main>

    <footer className="app-footer home-footer">
      <span>LINKLINE <span className="footer-separator">/</span> PRIVATE VIDEO ROOMS</span>
      <span>Secure by design <span className="footer-heart">♥</span></span>
    </footer>
  </div>
}

export default App
