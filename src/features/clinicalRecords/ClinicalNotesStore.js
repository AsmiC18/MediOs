
import { useSyncExternalStore } from "react";

let clinicalNotes = [];
const listeners = new Set();

export function getClinicalNotes() {
  return clinicalNotes;
}

export function subscribeToClinicalNotes(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function addClinicalNote(note) {
  clinicalNotes = [note, ...clinicalNotes];
  listeners.forEach((listener) => listener());
}

export function useClinicalNotes() {
  return useSyncExternalStore(
    subscribeToClinicalNotes,
    getClinicalNotes,
    getClinicalNotes
  );
}
