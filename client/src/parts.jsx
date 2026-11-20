import { useEffect, useState } from "react";
import { api, today, addDays, fd, money, nights, LABEL } from "./lib";

export const Pill = ({ s }) => (
  <span className="pill" data-s={s}>
    {LABEL[s]}
  </span>
);
export const Modal = ({ title, close, children }) => (
  <div
    className="mb"
    onMouseDown={(e) => e.target === e.currentTarget && close()}
  >
    <div className="md">
      <h2>{title}</h2>
      {children}
    </div>
  </div>
);
const Field = ({ label, wide, ...p }) => (
  <label className={wide ? "w" : ""}>
    {label}
    <input {...p} />
  </label>
);

export function BookingRow({ b, ctx }) {
  const paid = b.payments.reduce((s, p) => s + p.amount, 0),
    due = nights(b) * b.rate - paid;
  const live = b.status === "reserved" || b.status === "checked_in";
  const post = (a, msg) =>
    ctx.run(() => api(`/bookings/${b._id}/${a}`, { method: "POST" }), msg);
  return (
    <div className="row">
      <div className="rn">{b.room?.number}</div>
      <div className="rm">
        <b>{b.guest}</b>
        <span>
          {fd(b.checkIn)} to {fd(b.checkOut)} · {nights(b)} night
          {nights(b) > 1 ? "s" : ""}
          {b.phone ? " · " + b.phone : ""}
        </span>
      </div>
      <div className="rbal">
        {b.status !== "cancelled" && due > 0
          ? "Due " + money(due)
          : money(paid) + " paid"}
      </div>
      <Pill s={b.status} />
      <div className="acts">
        {b.status === "reserved" && b.checkIn <= today() && (
          <button
            className="btn sm"
            onClick={() => post("check-in", "Checked in")}
          >
            Check in
          </button>
        )}
        {b.status === "reserved" && (
          <button
            className="btn sm ghost"
            onClick={() =>
              confirm("Cancel this reservation?") &&
              post("cancel", "Reservation cancelled")
            }
          >
            Cancel
          </button>
        )}
        {b.status === "checked_in" && (
          <button
            className="btn sm"
            onClick={() => ctx.open({ type: "out", b })}
          >
            Check out
          </button>
        )}
        {live && (
          <button
            className="btn sm ghost"
            onClick={() => ctx.open({ type: "booking", b })}
          >
            Edit
          </button>
        )}
      </div>
    </div>
  );
}
export const List = ({ items, ctx }) =>
  items.length ? (
    items.map((b) => <BookingRow key={b._id} b={b} ctx={ctx} />)
  ) : (
    <p className="mute">Nothing here.</p>
  );

export function BookingForm({ b, pre, ctx }) {
  const start = pre?.checkIn || today();
  const [f, setF] = useState(
    b
      ? {
          guest: b.guest,
          phone: b.phone || "",
          checkIn: b.checkIn,
          checkOut: b.checkOut,
          room: b.room._id,
          rate: b.rate,
          guests: b.guests,
          notes: b.notes || "",
        }
      : {
          guest: "",
          phone: "",
          checkIn: start,
          checkOut: addDays(start, 1),
          room: pre?.room || "",
          rate: "",
          guests: 1,
          notes: "",
          advance: 0,
          walkIn: false,
        }
  );
  const [rooms, setRooms] = useState([]),
    [err, setErr] = useState("");
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

  // Only rooms that are free for the chosen dates are offered.
  useEffect(() => {
    if (!(f.checkIn && f.checkOut > f.checkIn)) {
      setRooms([]);
      return;
    }
    api(`/rooms/available?checkIn=${f.checkIn}&checkOut=${f.checkOut}`)
      .then((l) => {
        if (b && !l.some((r) => r._id === b.room._id))
          l = [{ ...b.room, rate: b.rate }, ...l];
        setRooms(l);
        const p = l.find((r) => r._id === f.room) || l[0];
        setF((x) => ({
          ...x,
          room: p?._id || "",
          rate: p && (x.rate === "" || p._id !== f.room) ? p.rate : x.rate,
        }));
      })
      .catch((e) => setErr(e.message));
  }, [f.checkIn, f.checkOut]);

  const save = async (e) => {
    e.preventDefault();
    setErr("");
    try {
      await api(b ? `/bookings/${b._id}` : "/bookings", {
        method: b ? "PUT" : "POST",
        body: {
          ...f,
          rate: +f.rate,
          guests: +f.guests,
          advance: +f.advance || 0,
        },
      });
      ctx.close();
      ctx.toast(
        b
          ? "Booking updated"
          : f.walkIn
          ? "Walk-in checked in"
          : "Reservation saved"
      );
      ctx.bump();
    } catch (x) {
      setErr(x.message);
    }
  };
  return (
    <Modal title={b ? "Edit booking" : "New booking"} close={ctx.close}>
      <form onSubmit={save}>
        <div className="f">
          <Field
            label="Guest name"
            required
            value={f.guest}
            onChange={(e) => set("guest", e.target.value)}
          />
          <Field
            label="Phone"
            inputMode="tel"
            value={f.phone}
            onChange={(e) => set("phone", e.target.value)}
          />
          <Field
            label="Check-in"
            type="date"
            required
            value={f.checkIn}
            onChange={(e) =>
              setF((x) => ({
                ...x,
                checkIn: e.target.value,
                checkOut:
                  e.target.value >= x.checkOut
                    ? addDays(e.target.value, 1)
                    : x.checkOut,
              }))
            }
          />
          <Field
            label="Check-out"
            type="date"
            required
            value={f.checkOut}
            onChange={(e) => set("checkOut", e.target.value)}
          />
          <label>
            Room (free on these dates)
            <select
              required
              value={f.room}
              onChange={(e) => {
                const r = rooms.find((x) => x._id === e.target.value);
                setF((x) => ({
                  ...x,
                  room: e.target.value,
                  rate: r ? r.rate : x.rate,
                }));
              }}
            >
              {rooms.length ? (
                rooms.map((r) => (
                  <option key={r._id} value={r._id}>
                    {r.number} · {r.type}
                  </option>
                ))
              ) : (
                <option value="">No rooms free</option>
              )}
            </select>
          </label>
          <Field
            label="Rate per night"
            type="number"
            min="0"
            required
            value={f.rate}
            onChange={(e) => set("rate", e.target.value)}
          />
          <Field
            label="Guests"
            type="number"
            min="1"
            value={f.guests}
            onChange={(e) => set("guests", e.target.value)}
          />
          {!b && (
            <Field
              label="Advance paid"
              type="number"
              min="0"
              value={f.advance}
              onChange={(e) => set("advance", e.target.value)}
            />
          )}
          <Field
            wide
            label="Notes"
            value={f.notes}
            onChange={(e) => set("notes", e.target.value)}
          />
          {!b && (
            <label className="w chk">
              <input
                type="checkbox"
                checked={f.walkIn}
                onChange={(e) => set("walkIn", e.target.checked)}
              />{" "}
              Walk-in: check in now (stay must start today)
            </label>
          )}
        </div>
        <p className="err">{err}</p>
        <div className="acts">
          <button type="button" className="btn ghost" onClick={ctx.close}>
            Cancel
          </button>
          <button className="btn">Save booking</button>
        </div>
      </form>
    </Modal>
  );
}

export function Checkout({ b, ctx }) {
  const [bill, setBill] = useState(),
    [c, setC] = useState(0);
  useEffect(() => {
    api(`/bookings/${b._id}/bill`).then((x) => {
      setBill(x);
      setC(Math.max(x.balance, 0));
    });
  }, []);
  const go = () =>
    ctx.run(async () => {
      await api(`/bookings/${b._id}/check-out`, {
        method: "POST",
        body: { collect: +c },
      });
      ctx.close();
    }, "Checked out. Room needs cleaning.");
  return (
    <Modal title={"Check out " + b.guest} close={ctx.close}>
      {bill ? (
        <>
          <div className="sum">
            <span>
              {bill.nights} night{bill.nights > 1 ? "s" : ""} at {money(b.rate)}
            </span>
            <span>Already paid {money(bill.paid)}</span>
            <b>
              {bill.balance < 0
                ? "Refund due " + money(-bill.balance)
                : "Balance " + money(bill.balance)}
            </b>
          </div>
          {bill.balance > 0 && (
            <Field
              label="Collect now"
              type="number"
              value={c}
              onChange={(e) => setC(e.target.value)}
            />
          )}
          <div className="acts">
            <button className="btn ghost" onClick={ctx.close}>
              Go back
            </button>
            <button className="btn" onClick={go}>
              Check out
            </button>
          </div>
        </>
      ) : (
        <p className="mute">Loading...</p>
      )}
    </Modal>
  );
}

export function RoomModal({ r, ctx }) {
  const flag = (f, msg) =>
    ctx.run(async () => {
      await api(`/rooms/${r._id}/flag`, { method: "PATCH", body: { flag: f } });
      ctx.close();
    }, msg);
  return (
    <Modal
      title={
        <>
          Room {r.number} <Pill s={r.status} />
        </>
      }
      close={ctx.close}
    >
      <p className="mute">
        Floor {r.floor} · {r.type} · {money(r.rate)} per night
      </p>
      {r.current && (
        <p>
          Guest: <b>{r.current.guest}</b>, leaving {fd(r.current.checkOut)}
        </p>
      )}
      {r.next && (
        <p>
          Next: <b>{r.next.guest}</b>, arriving {fd(r.next.checkIn)}
        </p>
      )}
      <div className="acts">
        {r.status === "cleaning" && (
          <button className="btn" onClick={() => flag("", "Room is ready")}>
            Mark clean
          </button>
        )}
        {r.status === "maintenance" ? (
          <button className="btn" onClick={() => flag("", "Back in service")}>
            Back in service
          </button>
        ) : (
          r.status !== "occupied" && (
            <button
              className="btn ghost"
              onClick={() => flag("maintenance", "Room set to maintenance")}
            >
              Set maintenance
            </button>
          )
        )}
        {!["occupied", "maintenance"].includes(r.status) && (
          <button
            className="btn"
            onClick={() =>
              ctx.open({
                type: "booking",
                pre: { room: r._id, checkIn: today() },
              })
            }
          >
            Book this room
          </button>
        )}
        <button className="btn ghost" onClick={ctx.close}>
          Close
        </button>
      </div>
    </Modal>
  );
}

export function RoomForm({ r, ctx }) {
  const [f, setF] = useState(
    r
      ? { number: r.number, floor: r.floor, type: r.type, rate: r.rate }
      : { number: "", floor: 1, type: "Standard", rate: 1200 }
  );
  const [err, setErr] = useState("");
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const done = (msg) => {
    ctx.close();
    ctx.toast(msg);
    ctx.bump();
  };
  const save = async (e) => {
    e.preventDefault();
    try {
      await api(r ? `/rooms/${r._id}` : "/rooms", {
        method: r ? "PUT" : "POST",
        body: { ...f, floor: +f.floor, rate: +f.rate },
      });
      done("Room saved");
    } catch (x) {
      setErr(x.message);
    }
  };
  const del = async () => {
    try {
      await api(`/rooms/${r._id}`, { method: "DELETE" });
      done("Room deleted");
    } catch (x) {
      setErr(x.message);
    }
  };
  return (
    <Modal title={r ? "Edit room" : "Add room"} close={ctx.close}>
      <form onSubmit={save}>
        <div className="f">
          <Field
            label="Room number"
            required
            value={f.number}
            onChange={(e) => set("number", e.target.value)}
          />
          <Field
            label="Floor"
            type="number"
            value={f.floor}
            onChange={(e) => set("floor", e.target.value)}
          />
          <Field
            label="Type"
            list="types"
            value={f.type}
            onChange={(e) => set("type", e.target.value)}
          />
          <datalist id="types">
            <option>Standard</option>
            <option>Deluxe</option>
            <option>Family</option>
          </datalist>
          <Field
            label="Rate per night"
            type="number"
            min="0"
            required
            value={f.rate}
            onChange={(e) => set("rate", e.target.value)}
          />
        </div>
        <p className="err">{err}</p>
        <div className="acts">
          {r && (
            <button type="button" className="btn ghost" onClick={del}>
              Delete room
            </button>
          )}
          <button type="button" className="btn ghost" onClick={ctx.close}>
            Cancel
          </button>
          <button className="btn">Save room</button>
        </div>
      </form>
    </Modal>
  );
}
