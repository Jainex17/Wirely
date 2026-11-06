const UNITS = [
  { seconds: 31536000, label: "year" },
  { seconds: 2592000, label: "month" },
  { seconds: 86400, label: "day" },
  { seconds: 3600, label: "hour" },
  { seconds: 60, label: "minute" },
];

/** Short relative time for project and agent rows, such as "4d ago". */
export const timeAgo = (date: string | Date) => {
  const seconds = Math.max(Math.floor((Date.now() - new Date(date).getTime()) / 1000), 0);
  const unit = UNITS.find((candidate) => seconds >= candidate.seconds);
  if (!unit) return "just now";
  const count = Math.floor(seconds / unit.seconds);
  if (unit.label === "day") return `${count}d ago`;
  return `${count} ${unit.label}${count === 1 ? "" : "s"} ago`;
};
