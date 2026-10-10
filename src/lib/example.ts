import { addDays } from "./fdtl/time";
import type { DutyInput } from "./fdtl/types";

/** A made-up week around `today` so the app has something to show. */
export function exampleRoster(today: string): DutyInput[] {
  const d = (n: number) => addDays(today, n);
  const id = () => crypto.randomUUID();
  return [
    { id: id(), kind: "off", date: d(-4), endDate: d(-3), note: "Weekly off" },
    {
      id: id(), kind: "flight", date: d(-2),
      sectors: [
        { from: "BLR", to: "BOM", dep: "07:00", arr: "08:45", positioning: false },
        { from: "BOM", to: "BLR", dep: "09:30", arr: "11:15", positioning: false },
        { from: "BLR", to: "HYD", dep: "12:00", arr: "13:15", positioning: false },
        { from: "HYD", to: "BLR", dep: "14:00", arr: "15:15", positioning: false },
      ],
    },
    {
      id: id(), kind: "flight", date: d(-1),
      sectors: [
        { from: "BLR", to: "DEL", dep: "06:10", arr: "09:00", positioning: false },
        { from: "DEL", to: "BLR", dep: "09:45", arr: "12:35", positioning: false },
      ],
      note: "Night duty — report 05:10",
    },
    { id: id(), kind: "home_standby", date: d(0), start: "04:00", end: "16:00" },
    {
      id: id(), kind: "flight", date: d(1),
      sectors: [{ from: "BLR", to: "DOH", dep: "21:00", arr: "23:30", positioning: false }],
      note: "Doha layover",
    },
    {
      id: id(), kind: "flight", date: d(2),
      sectors: [{ from: "DOH", to: "BLR", dep: "22:30", arr: "05:15", positioning: false }],
    },
    { id: id(), kind: "off", date: d(4), endDate: d(5), note: "Weekly off" },
    { id: id(), kind: "airport_standby", date: d(6), start: "05:00", end: "13:00" },
    { id: id(), kind: "training", date: d(7), start: "09:00", end: "17:00", note: "Recurrent SEP" },
  ];
}
