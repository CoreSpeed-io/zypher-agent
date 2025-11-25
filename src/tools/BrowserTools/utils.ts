import { ensureDir } from "@std/fs";

export function sanitizeName(input: string) {
  return input.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export function nowStamp() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${
    String(
      d.getDate(),
    ).padStart(2, "0")
  }_${String(d.getHours()).padStart(2, "0")}-${
    String(
      d.getMinutes(),
    ).padStart(2, "0")
  }-${String(d.getSeconds()).padStart(2, "0")}`;
}

export async function ensureParentDir(path: string) {
  const idx = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  const dir = idx === -1 ? "." : path.slice(0, idx);
  await ensureDir(dir);
}

export function getRandomId() {
  const buf = new Uint8Array(8);
  crypto.getRandomValues(buf);
  return Array.from(buf).map((b) => b.toString(16).padStart(2, "0")).join("");
}
