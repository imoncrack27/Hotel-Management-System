import { Router } from "express";
import { Room, Booking } from "./models.js";
import { h } from "./auth.js";

const r = Router();
const LIVE = ["reserved", "checked_in"];
const today = () => new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD, server timezone
const addDay = (s) => {
  const d = new Date(s + "T00:00:00");
  d.setDate(d.getDate() + 1);
  return d.toLocaleDateString("en-CA");
};
const okDates = (a, b) =>
  /^\d{4}-\d{2}-\d{2}$/.test(a) && /^\d{4}-\d{2}-\d{2}$/.test(b) && b > a;
const pick = (o, keys) =>
  Object.fromEntries(
    keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]])
  );
const rx = (s) =>
  new RegExp(String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");

// Night stays run from CHECKIN_TIME (arrival day) to CHECKOUT_TIME (departure day). Short stays run from their start time for 3, 6 or 12 hours.
const IN_T = process.env.CHECKIN_TIME || "14:00",
  OUT_T = process.env.CHECKOUT_TIME || "12:00";
const at = (d, t) => new Date(`${d}T${t}:00`).getTime();
const span = (b) =>
  b.kind === "short"
    ? [at(b.checkIn, b.startTime), at(b.checkIn, b.startTime) + b.hours * 36e5]
    : [at(b.checkIn, IN_T), at(b.checkOut, OUT_T)];
const okTime = (t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t || "");
const shortOk = (b) =>
  /^\d{4}-\d{2}-\d{2}$/.test(b.checkIn) &&
  okTime(b.startTime) &&
  [3, 6, 12].includes(+b.hours);
const finish = (b) => {
  if (b.kind === "short")
    b.checkOut = new Date(span(b)[1]).toLocaleDateString("en-CA");
  return b;
}; // a short stay can end after midnight
const upcoming = (b) =>
  b.kind === "short" ? span(b)[1] > Date.now() : b.checkOut > today();
const extraFor = (room, b) =>
  b.kind === "short"
    ? 0
    : Math.max(0, (+b.guests || 1) - (room.includedGuests ?? 2)) *
      (room.extraPerson || 0);

// A room is free if no live booking overlaps the stay (compared by exact time).
const clash = (s, bks) =>
  bks.some((x) => {
    const [a, b] = span(x);
    return a < s[1] && s[0] < b;
  });
const free = async (room, b, skip) =>
  !clash(
    span(b),
    await Booking.find({
      room,
      status: { $in: LIVE },
      ...(skip && { _id: { $ne: skip } }),
    }).lean()
  );
const blocked = async (room) =>
  room.flag
    ? `Room is marked ${room.flag}.`
    : (await Booking.exists({ room: room._id, status: "checked_in" }))
    ? "A guest is still checked in."
    : "";

// Billing: nights x rate, minus payments. Early check-out shortens the stay.
const effOut = (b) => {
  const T = today();
  return b.kind !== "short" && b.checkOut > T
    ? T > b.checkIn
      ? T
      : addDay(b.checkIn)
    : b.checkOut;
};
const bill = (b, out = b.checkOut) => {
  const short = b.kind === "short";
  const nights = short
    ? 0
    : Math.round((Date.parse(out) - Date.parse(b.checkIn)) / 864e5);
  const total = short ? b.rate : nights * (b.rate + (b.extra || 0)),
    paid = b.payments.reduce((s, p) => s + p.amount, 0);
  return {
    nights,
    hours: short ? b.hours : 0,
    total,
    paid,
    balance: total - paid,
  };
};

const snapshot = () =>
  Promise.all([
    Room.find()
      .sort({ floor: 1, number: 1 })
      .collation({ locale: "en", numericOrdering: true })
      .lean(),
    Booking.find({ status: { $in: LIVE } })
      .sort({ checkIn: 1 })
      .lean(),
  ]);
function state(room, bks) {
  if (room.flag === "maintenance") return "maintenance";
  const T = today(),
    mine = bks.filter((b) => String(b.room) === String(room._id));
  if (mine.some((b) => b.status === "checked_in")) return "occupied";
  if (room.flag === "cleaning") return "cleaning";
  if (
    mine.some((b) => b.status === "reserved" && b.checkIn <= T && upcoming(b))
  )
    return "reserved";
  return "available";
}

// ---------- Rooms ----------
r.get(
  "/rooms",
  h(async (_, res) => {
    const [rooms, bks] = await snapshot(),
      T = today();
    res.json(
      rooms.map((x) => {
        const mine = bks.filter((b) => String(b.room) === String(x._id));
        return {
          ...x,
          status: state(x, bks),
          current: mine.find((b) => b.status === "checked_in") || null,
          next:
            mine.find((b) => b.status === "reserved" && upcoming(b)) || null,
        };
      })
    );
  })
);

r.get(
  "/rooms/available",
  h(async (req, res) => {
    const q = {
      ...req.query,
      kind: req.query.kind === "short" ? "short" : "night",
    };
    if (q.kind === "short" ? !shortOk(q) : !okDates(q.checkIn, q.checkOut))
      throw new Error("Check the dates and times.");
    const s = span(finish(q)),
      live = await Booking.find({ status: { $in: LIVE } }).lean();
    const busy = live.filter((x) => clash(s, [x])).map((x) => String(x.room));
    const rooms = await Room.find({ flag: { $ne: "maintenance" } })
      .sort({ floor: 1, number: 1 })
      .lean();
    res.json(
      rooms.filter(
        (r) =>
          !busy.includes(String(r._id)) &&
          (q.kind !== "short" || r["rate" + q.hours] > 0)
      )
    );
  })
);

const roomFields = [
  "number",
  "floor",
  "type",
  "rate",
  "rate3",
  "rate6",
  "rate12",
  "includedGuests",
  "extraPerson",
];
r.post(
  "/rooms",
  h(async (req, res) =>
    res.status(201).json(await Room.create(pick(req.body, roomFields)))
  )
);
r.put(
  "/rooms/:id",
  h(async (req, res) =>
    res.json(
      await Room.findByIdAndUpdate(req.params.id, pick(req.body, roomFields), {
        new: true,
        runValidators: true,
      })
    )
  )
);

r.patch(
  "/rooms/:id/flag",
  h(async (req, res) => {
    const flag = req.body.flag || "";
    if (
      flag === "maintenance" &&
      (await Booking.exists({ room: req.params.id, status: "checked_in" }))
    )
      throw new Error("Check the guest out before setting maintenance.");
    res.json(
      await Room.findByIdAndUpdate(
        req.params.id,
        { flag },
        { new: true, runValidators: true }
      )
    );
  })
);

r.delete(
  "/rooms/:id",
  h(async (req, res) => {
    if (await Booking.exists({ room: req.params.id }))
      throw new Error("This room has bookings. Set it to maintenance instead.");
    await Room.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  })
);

// ---------- Bookings ----------
// Filters: ?status=reserved,checked_in  ?from=2026-11-01&to=2026-12-01 (overlap, for the calendar)  ?q=guest or phone
r.get(
  "/bookings",
  h(async (req, res) => {
    const { status, from, to, q } = req.query,
      f = {};
    if (status) f.status = { $in: status.split(",") };
    if (from && to) {
      f.checkIn = { $lt: to };
      f.checkOut = { $gte: from };
    }
    if (q) f.$or = [{ guest: rx(q) }, { phone: rx(q) }];
    res.json(
      await Booking.find(f)
        .populate("room", "number type includedGuests extraPerson")
        .sort({ checkIn: 1 })
        .lean()
    );
  })
);

r.post(
  "/bookings",
  h(async (req, res) => {
    const b = pick(req.body, [
      "guest",
      "phone",
      "room",
      "kind",
      "checkIn",
      "checkOut",
      "startTime",
      "hours",
      "guests",
      "rate",
      "notes",
    ]);
    if (b.kind === "short") {
      if (!shortOk(b))
        throw new Error("Choose a date, a start time, and 3, 6 or 12 hours.");
      b.hours = +b.hours;
      finish(b);
    } else {
      b.kind = "night";
      if (!okDates(b.checkIn, b.checkOut))
        throw new Error("Check-out must be after check-in.");
    }
    const room = await Room.findById(b.room);
    if (!room) throw new Error("Room not found.");
    if (room.flag === "maintenance")
      throw new Error("Room is under maintenance.");
    if (!(await free(room._id, b)))
      throw new Error("Room is already booked for that time.");
    const walkIn = !!req.body.walkIn,
      advance = Number(req.body.advance) || 0;
    if (walkIn) {
      if (b.checkIn !== today()) throw new Error("A walk-in must start today.");
      const m = await blocked(room);
      if (m) throw new Error(m);
    }
    const bk = await Booking.create({
      ...b,
      rate: b.rate ?? (b.kind === "short" ? room["rate" + b.hours] : room.rate),
      extra: extraFor(room, b),
      status: walkIn ? "checked_in" : "reserved",
      payments: advance > 0 ? [{ date: today(), amount: advance }] : [],
    });
    res.status(201).json(bk);
  })
);

r.put(
  "/bookings/:id",
  h(async (req, res) => {
    const bk = await Booking.findById(req.params.id);
    if (!bk || !LIVE.includes(bk.status))
      throw new Error("Only reserved or checked-in bookings can be edited.");
    const d = pick(req.body, [
      "guest",
      "phone",
      "room",
      "checkIn",
      "checkOut",
      "startTime",
      "hours",
      "guests",
      "rate",
      "notes",
    ]);
    const n = { ...bk.toObject(), ...d };
    if (n.kind === "short") {
      if (!shortOk(n))
        throw new Error("Choose a date, a start time, and 3, 6 or 12 hours.");
      d.hours = n.hours = +n.hours;
      d.checkOut = n.checkOut = finish(n).checkOut;
    } else if (!okDates(n.checkIn, n.checkOut))
      throw new Error("Check-out must be after check-in.");
    if (!(await free(n.room, n, bk._id)))
      throw new Error("Room is already booked for that time.");
    d.extra = extraFor(await Room.findById(n.room), n);
    Object.assign(bk, d);
    res.json(await bk.save());
  })
);

r.post(
  "/bookings/:id/check-in",
  h(async (req, res) => {
    const bk = await Booking.findById(req.params.id);
    if (!bk || bk.status !== "reserved")
      throw new Error("Only reserved bookings can be checked in.");
    if (bk.checkIn > today())
      throw new Error("This guest is not due until " + bk.checkIn + ".");
    const m = await blocked(await Room.findById(bk.room));
    if (m) throw new Error(m);
    bk.status = "checked_in";
    res.json(await bk.save());
  })
);

// Preview the bill before checking out (early departures are billed to today).
r.get(
  "/bookings/:id/bill",
  h(async (req, res) => {
    const bk = await Booking.findById(req.params.id);
    if (!bk) throw new Error("Booking not found.");
    const out = bk.status === "checked_in" ? effOut(bk) : bk.checkOut;
    res.json({ checkOut: out, ...bill(bk, out) });
  })
);

r.post(
  "/bookings/:id/check-out",
  h(async (req, res) => {
    const bk = await Booking.findById(req.params.id);
    if (!bk || bk.status !== "checked_in")
      throw new Error("Only checked-in guests can be checked out.");
    bk.checkOut = effOut(bk);
    const collect = Number(req.body.collect) || 0;
    if (collect > 0) bk.payments.push({ date: today(), amount: collect });
    bk.status = "checked_out";
    await bk.save();
    await Room.findByIdAndUpdate(bk.room, { flag: "cleaning" });
    res.json({ booking: bk, ...bill(bk) });
  })
);

r.post(
  "/bookings/:id/cancel",
  h(async (req, res) => {
    const bk = await Booking.findById(req.params.id);
    if (!bk || bk.status !== "reserved")
      throw new Error("Only reserved bookings can be cancelled.");
    bk.status = "cancelled";
    res.json(await bk.save());
  })
);

// ---------- Dashboard ----------
r.get(
  "/dashboard",
  h(async (_, res) => {
    const T = today(),
      [rooms, bks] = await snapshot();
    const counts = {
      available: 0,
      reserved: 0,
      occupied: 0,
      cleaning: 0,
      maintenance: 0,
    };
    rooms.forEach((x) => counts[state(x, bks)]++);
    const usable = rooms.length - counts.maintenance;
    const [rev] = await Booking.aggregate([
      { $unwind: "$payments" },
      { $match: { "payments.date": T } },
      { $group: { _id: null, total: { $sum: "$payments.amount" } } },
    ]);
    const [arr, dep] = await Promise.all([
      Booking.find({ status: "reserved", checkIn: { $lte: T } })
        .populate("room", "number type includedGuests extraPerson")
        .lean(),
      Booking.find({ status: "checked_in" })
        .populate("room", "number type includedGuests extraPerson")
        .lean(),
    ]);
    const arrivals = arr.filter(upcoming);
    const departures = dep.filter((b) =>
      b.kind === "short" ? span(b)[1] <= Date.now() : b.checkOut <= T
    );
    res.json({
      date: T,
      revenue: rev?.total || 0,
      totalRooms: rooms.length,
      counts,
      occupancy: usable ? Math.round((counts.occupied / usable) * 100) : 0,
      arrivals,
      departures,
    });
  })
);

// ---------- Backup ----------
r.get(
  "/backup",
  h(async (_, res) => {
    const [rooms, bookings] = await Promise.all([
      Room.find().lean(),
      Booking.find().lean(),
    ]);
    res.json({
      app: "lodgedesk",
      version: 1,
      createdAt: new Date().toISOString(),
      rooms,
      bookings,
    });
  })
);

export default r;
