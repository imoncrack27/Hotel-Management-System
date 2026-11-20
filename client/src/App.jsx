import { useState } from "react";
import { api, getToken, setToken } from "./lib";
import { BookingForm, Checkout, RoomModal, RoomForm } from "./parts";
import { Dashboard, CalendarView, Reservations, RoomsView } from "./views";

const TABS = {
  dash: ["Dashboard", Dashboard],
  cal: ["Calendar", CalendarView],
  res: ["Reservations", Reservations],
  rooms: ["Rooms", RoomsView],
};

function Login({ done }) {
  const [f, setF] = useState({ email: "", password: "" }),
    [err, setErr] = useState("");
  const go = async (e) => {
    e.preventDefault();
    try {
      const r = await api("/auth/login", { method: "POST", body: f });
      setToken(r.token);
      done();
    } catch (x) {
      setErr(x.message);
    }
  };
  return (
    <div className="login">
      <form className="card" onSubmit={go}>
        <h2>Jade's staff login</h2>
        <label>
          Email
          <input
            type="email"
            required
            value={f.email}
            onChange={(e) => setF({ ...f, email: e.target.value })}
          />
        </label>
        <label>
          Password
          <input
            type="password"
            required
            value={f.password}
            onChange={(e) => setF({ ...f, password: e.target.value })}
          />
        </label>
        <p className="err">{err}</p>
        <button className="btn">Log in</button>
      </form>
    </div>
  );
}

export default function App() {
  const [authed, setAuthed] = useState(!!getToken());
  const [tab, setTab] = useState("dash"),
    [tick, setTick] = useState(0),
    [m, setM] = useState(null),
    [t, setT] = useState(null);
  if (!authed) return <Login done={() => setAuthed(true)} />;

  const toast = (msg, bad) => {
    setT({ msg, bad });
    setTimeout(() => setT(null), 2800);
  };
  const ctx = {
    tick,
    toast,
    bump: () => setTick((x) => x + 1),
    open: setM,
    close: () => setM(null),
    run: async (fn, msg) => {
      try {
        await fn();
        toast(msg);
        ctx.bump();
      } catch (e) {
        toast(e.message, true);
      }
    },
  };
  const View = TABS[tab][1];
  return (
    <div className="wrap">
      <div className="top">
        <div className="logo">
          <i>🛏️</i>
          <div>
            Jade's Motel
            <small>
              {new Date().toLocaleDateString("en", {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </small>
          </div>
        </div>
        <nav>
          {Object.entries(TABS).map(([k, [label]]) => (
            <button
              key={k}
              className={tab === k ? "on" : ""}
              onClick={() => setTab(k)}
            >
              {label}
            </button>
          ))}
        </nav>
        <div className="acts" style={{ margin: 0 }}>
          <button className="btn" onClick={() => setM({ type: "booking" })}>
            + New booking
          </button>
          <button
            className="btn ghost"
            onClick={() => {
              setToken();
              setAuthed(false);
            }}
          >
            Log out
          </button>
        </div>
      </div>
      <View ctx={ctx} />
      {m?.type === "booking" && (
        <BookingForm key={m.b?._id || "new"} b={m.b} pre={m.pre} ctx={ctx} />
      )}
      {m?.type === "out" && <Checkout b={m.b} ctx={ctx} />}
      {m?.type === "room" && <RoomModal key={m.r._id} r={m.r} ctx={ctx} />}
      {m?.type === "roomform" && (
        <RoomForm key={m.r?._id || "new"} r={m.r} ctx={ctx} />
      )}
      {t && <div className={"toast" + (t.bad ? " bad" : "")}>{t.msg}</div>}
    </div>
  );
}
