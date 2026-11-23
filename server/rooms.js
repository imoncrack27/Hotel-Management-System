// The lodge's rooms. Short-stay prices (rate3, rate6, rate12) are left at 0 = not offered;
// set them in the app under Rooms > Edit. "floor" only controls the order of the groups.
const make = (prefix, type, count, floor, rate, extraPerson = 0) =>
  Array.from({ length: count }, (_, i) => ({
    number: `${prefix}${i + 1}`,
    floor,
    type,
    rate,
    extraPerson,
    includedGuests: 2,
  }));

export const LODGE_ROOMS = [
  ...make("GH", "Guest House", 6, 1, 999, 300),
  ...make("AH", "A House", 6, 2, 1500, 500),
  ...make("MS", "Mountain Suite", 2, 3, 3500, 500),
];
