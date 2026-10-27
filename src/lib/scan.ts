// What the in-app scanner read, routed the way a pasted code is (HNK QR scan, 2026-10-27): a
// contact link or card goes to the same reader as the paste field (lib/contact.ts readContact)
// and on to the same one-confirm add; any other code is named in plain words, so the person
// knows what they pointed the camera at. And the camera's own failures, in plain words. Pure:
// tests run it under Node.
import { readContact, type Contact } from "./contact.ts";
import { FUND_CARD_PREFIX } from "./fund-card.ts";

/** What a scan read, routed. */
export type Scanned = { kind: "contact"; contact: Contact; text: string };

/** A scan that is not what this field takes: the sentence to show, and whether to keep scanning. */
export class ScanRefused extends Error {}

/** The words for a code the camera read, by what it is. */
function whatItIs(t: string): string {
  const low = t.toLowerCase();
  if (low.startsWith("zcash:")) return "This is a Zcash payment request. Open it in your Zcash wallet app, not here.";
  if (t.includes(FUND_CARD_PREFIX)) return "This is a fund card, not a contact. Paste it on Units, under Pay into the fund.";
  if (/jitsuin-[a-z-]+-v\d+:/.test(t)) return "This JitsuinFi code is not a contact. Ask them for the QR on their Contacts page.";
  return "This is not a JitsuinFi code. Ask them to open Contacts and show their contact QR.";
}

/**
 * Routes what the camera (or a photo) read for a field that takes a contact: the same reader as
 * the paste field. Throws ScanRefused with a plain sentence when it is anything else.
 */
export function routeScan(text: string): Scanned {
  const t = text.trim();
  if (!t) throw new ScanRefused("The code was empty. Try again, a little further away.");
  let contact: Contact;
  try {
    contact = readContact(t);
  } catch (e) {
    // a contact link or card that does not read (damaged) keeps the reader's own words
    if (t.includes("jitsuin-contact-v1:")) throw new ScanRefused(e instanceof Error ? `${e.message.charAt(0).toUpperCase()}${e.message.slice(1)}.` : String(e));
    throw new ScanRefused(whatItIs(t));
  }
  return { kind: "contact", contact, text: t };
}

/** A camera failure in plain words (getUserMedia's DOMException names). */
export function cameraTrouble(name: string): { title: string; text: string } {
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
    case "PermissionDeniedError":
      return { title: "Camera blocked", text: "This browser is not letting the app use the camera. Allow the camera for this site in the browser's settings, or use a photo instead." };
    case "NotFoundError":
    case "DevicesNotFoundError":
    case "OverconstrainedError":
      return { title: "No camera", text: "This device has no camera the app can use. Use a photo of the QR instead, or paste the link." };
    case "NotReadableError":
    case "TrackStartError":
    case "AbortError":
      return { title: "Camera busy", text: "Another app is using the camera. Close it and try again, or use a photo instead." };
    case "NoMediaDevices":
      return { title: "No camera here", text: "This browser cannot open a camera for the app. Use a photo of the QR instead, or paste the link." };
    default:
      return { title: "The camera did not start", text: "Try again, or use a photo of the QR instead." };
  }
}

/** Frames a second the camera is read at when the browser has no BarcodeDetector (jsQR). */
export const SCAN_FPS = 10;

/** The side, in pixels, a frame or photo is scaled down to before jsQR reads it. */
export function scanScale(w: number, h: number, max = 720): { w: number; h: number } {
  const k = Math.min(1, max / Math.max(w, h, 1));
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}
