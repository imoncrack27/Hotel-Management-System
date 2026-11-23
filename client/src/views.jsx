import { useEffect, useState } from "react";
import { api, today, ymd, money, LABEL } from "./lib";
import { Pill, List } from "./parts";

const useLoad = (path, ctx, deps = []) => {
  const [data, setData] = useState();
  useEffect(() => {
    api(path)
      .then(setData)
      .catch((e) => ctx.toast(e.message, true));
  }, [path, ctx.tick, ...deps]);
  return data;
};

export function Dashboard({ ctx }) {
  const d = useLoad("/dashboard", ctx),
    rooms = useLoad("/rooms", ctx) || [];
  const [st, setSt] = useState("all"),
    [q, setQ] = useState("");
  if (!d) return <p className="mute">Loading...</p>;
  const shown = rooms.filter(
    (r) =>
      (st === "all" || r.status === st) &&
      `${r.number} ${r.type} ${(r.current || r.next || {}).guest || ""}`
        .toLowerCase()
        .includes(q.toLowerCase())
  );
  const floors = [...new Set(rooms.map((r) => r.floor))];
  return (
    <>
      <div className="stats">
        <div className="card stat">
          <span>Revenue today</span>
          <b>{money(d.revenue)}</b>
        </div>
        <div className="card stat">
          <span>Arrivals due</span>
          <b>{d.arrivals.length}</b>
        </div>
        <div className="card stat">
          <span>Departures due</span>
          <b>{d.departures.length}</b>
        </div>
        <div className="card stat">
          <span>Occupancy</span>
          <b>{d.occupancy}%</b>
        </div>
      </div>
      <div className="two">
        <div className="card">
          <h2>Arriving today</h2>
          <List items={d.arrivals} ctx={ctx} />
        </div>
        <div className="card">
          <h2>Departing today</h2>
          <List items={d.departures} ctx={ctx} />
        </div>
      </div>
      <div className="card">
        <div className="bar">
          <h2>Room status</h2>
          <input
            placeholder="Find room or guest"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="chips">
          {[
            ["all", "All rooms", d.totalRooms],
            ...Object.entries(d.counts).map(([k, n]) => [k, LABEL[k], n]),
          ].map(([k, l, n]) => (
            <button
              key={k}
              className={"chip" + (st === k ? " on" : "")}
              onClick={() => setSt(k)}
            >
              {l}
              <b>{n}</b>
            </button>
          ))}
        </div>
        {floors.map((f) => {
          const rs = shown.filter((r) => r.floor === f);
          return (
            rs.length > 0 && (
              <div key={f}>
                <h3 className="fl">Floor {f}</h3>
                <div className="rooms">
                  {rs.map((r) => {
                    const g = r.current
                      ? `${r.current.guest}, out ${r.current.checkOut}`
                      : r.next
                      ? `Next: ${r.next.guest}, ${r.next.checkIn}`
                      : "No upcoming booking";
                    return (
                      <button
                        key={r._id}
                        className="room"
                        data-s={r.status}
                        onClick={() => ctx.open({ type: "room", r })}
                      >
                        <div className="rno">{r.number}</div>
                        <Pill s={r.status} />
                        <div className="rt">
                          {r.type} · {money(r.rate)}
                        </div>
                        <div className="rl">{g}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )
          );
        })}
        {!shown.length && (
          <p className="mute">No rooms match. Clear the filter or search.</p>
        )}
      </div>
    </>
  );
}

export function CalendarView({ ctx }) {
  const [mo, setMo] = useState(new Date()),
    [sel, setSel] = useState(today());
  const y = mo.getFullYear(),
    m = mo.getMonth();
  const bks =
    useLoad(
      `/bookings?status=reserved,checked_in,checked_out&from=${ymd(
        new Date(y, m, 1)
      )}&to=${ymd(new Date(y, m + 1, 1))}`,
      ctx
    ) || [];
  const N =
    (useLoad("/rooms", ctx) || []).filter((r) => r.status !== "maintenance")
      .length || 1;
  const days = Array.from({ length: new Date(y, m + 1, 0).getDate() }, (_, i) =>
    ymd(new Date(y, m, i + 1))
  );
  const arr = bks.filter((b) => b.checkIn === sel),
    dep = bks.filter((b) => b.checkOut === sel),
    stay = bks.filter((b) => b.checkIn < sel && sel < b.checkOut);
  return (
    <div className="calwrap">
      <div className="card">
        <div className="bar">
          <h2>
            {mo.toLocaleDateString("en", { month: "long", year: "numeric" })}
          </h2>
          <div className="acts">
            <button
              className="btn sm ghost"
              onClick={() => setMo(new Date(y, m - 1, 1))}
            >
              Prev
            </button>
            <button
              className="btn sm ghost"
              onClick={() => {
                setMo(new Date());
                setSel(today());
              }}
            >
              Today
            </button>
            <button
              className="btn sm ghost"
              onClick={() => setMo(new Date(y, m + 1, 1))}
            >
              Next
            </button>
          </div>
        </div>
        <div className="cal">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="h">
              {d}
            </div>
          ))}
          {Array.from({ length: new Date(y, m, 1).getDay() }, (_, i) => (
            <i key={"e" + i} />
          ))}
          {days.map((s, i) => {
            const a = bks.filter((b) => b.checkIn === s).length,
              o = bks.filter((b) => b.checkOut === s).length,
              n = bks.filter((b) => b.checkIn <= s && s < b.checkOut).length;
            return (
              <button
                key={s}
                className={
                  "day" +
                  (s === today() ? " td" : "") +
                  (s === sel ? " sel" : "")
                }
                onClick={() => setSel(s)}
              >
                <b>{i + 1}</b>
                <small>
                  {n}/{N} rooms
                </small>
                {a > 0 && <em className="a">+{a} in</em>}
                {o > 0 && <em className="o">{o} out</em>}
              </button>
            );
          })}
        </div>
      </div>
      <div className="card">
        <div className="bar">
          <h2>
            {new Date(sel + "T00:00:00").toLocaleDateString("en", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </h2>
          <button
            className="btn sm"
            onClick={() => ctx.open({ type: "booking", pre: { checkIn: sel } })}
          >
            + Book this date
          </button>
        </div>
        <h3>Arriving ({arr.length})</h3>
        <List items={arr} ctx={ctx} />
        <h3>Departing ({dep.length})</h3>
        <List items={dep} ctx={ctx} />
        <h3>Staying over ({stay.length})</h3>
        <List items={stay} ctx={ctx} />
      </div>
    </div>
  );
}

export function Reservations({ ctx }) {
  const [f, setF] = useState("reserved"),
    [q, setQ] = useState("");
  const l =
    useLoad(
      `/bookings?${f ? "status=" + f + "&" : ""}q=${encodeURIComponent(q)}`,
      ctx
    ) || [];
  return (
    <div className="card">
      <div className="bar">
        <h2>Reservations</h2>
        <input
          placeholder="Search guest or phone"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <div className="chips">
        {[
          ["reserved", "Upcoming"],
          ["checked_in", "In-house"],
          ["checked_out", "Past stays"],
          ["cancelled", "Cancelled"],
          ["", "All"],
        ].map(([k, label]) => (
          <button
            key={k}
            className={"chip" + (f === k ? " on" : "")}
            onClick={() => setF(k)}
          >
            {label}
          </button>
        ))}
      </div>
      <List items={l} ctx={ctx} />
    </div>
  );
}

export function RoomsView({ ctx }) {
  const rooms = useLoad("/rooms", ctx) || [];
  return (
    <div className="card">
      <div className="bar">
        <h2>Manage rooms</h2>
        <button className="btn" onClick={() => ctx.open({ type: "roomform" })}>
          + Add room
        </button>
      </div>
      {rooms.map((r) => (
        <div className="row" key={r._id}>
          <div className="rn">{r.number}</div>
          <div className="rm">
            <b>{r.type}</b>
            <span>
              Floor {r.floor} · {money(r.rate)} per night
            </span>
          </div>
          <Pill s={r.status} />
          <div className="acts" style={{ gridColumn: "auto" }}>
            <button
              className="btn sm ghost"
              onClick={() => ctx.open({ type: "room", r })}
            >
              Status
            </button>
            <button
              className="btn sm ghost"
              onClick={() => ctx.open({ type: "roomform", r })}
            >
              Edit
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
