"use client";

import { useSyncExternalStore } from "react";
import {
  parseWatchlist,
  WATCHLIST_CHANGE_EVENT,
  WATCHLIST_STORAGE_KEY
} from "@/lib/watchlist";

function subscribe(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener(WATCHLIST_CHANGE_EVENT, listener);
  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener(WATCHLIST_CHANGE_EVENT, listener);
  };
}

function getSnapshot() {
  try {
    return window.localStorage.getItem(WATCHLIST_STORAGE_KEY) ?? "[]";
  } catch {
    return "[]";
  }
}

function getServerSnapshot() {
  return "[]";
}

export function useWatchlist() {
  return parseWatchlist(useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot));
}
