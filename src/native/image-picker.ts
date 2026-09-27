import { Camera, MediaTypeSelection, type MediaResult } from "@capacitor/camera";
import { Filesystem } from "@capacitor/filesystem";

const maximumImageBytes = 15 * 1024 * 1024;
const mimeTypes: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif"
};

export async function mediaResultToFile(result: MediaResult): Promise<File> {
  if (!result.uri) throw new Error("Das ausgewählte Bonbild hat keinen lesbaren Dateipfad.");
  if (result.metadata?.size && result.metadata.size > maximumImageBytes) {
    throw new Error("Das Bonbild darf höchstens 15 MB groß sein.");
  }
  const format = result.metadata?.format?.toLowerCase() || result.uri.match(/\.(jpe?g|png|webp|heic|heif)(?:[?#]|$)/i)?.[1]?.toLowerCase() || "jpg";
  const mimeType = mimeTypes[format];
  if (!mimeType) throw new Error("Unterstützt werden JPEG, PNG, WebP, HEIC und HEIF.");

  let data: string | Blob;
  try {
    ({ data } = await Filesystem.readFile({ path: result.uri }));
  } catch {
    throw new Error("Das ausgewählte Bonbild konnte nicht gelesen werden. Bitte wähle es erneut aus.");
  }
  let bytes: Uint8Array;
  if (typeof data === "string") {
    const byteCount = Math.floor(data.length * 3 / 4) - (data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0);
    if (byteCount < 1 || byteCount > maximumImageBytes) throw new Error("Das Bonbild muss zwischen 1 Byte und 15 MB groß sein.");
    try {
      bytes = Uint8Array.from(atob(data), (character) => character.charCodeAt(0));
    } catch {
      throw new Error("Das ausgewählte Bonbild enthält ungültige Bilddaten.");
    }
  } else {
    if (data.size < 1 || data.size > maximumImageBytes) throw new Error("Das Bonbild muss zwischen 1 Byte und 15 MB groß sein.");
    bytes = new Uint8Array(await data.arrayBuffer());
  }
  return new File([new Uint8Array(bytes).buffer], `receipt-${Date.now()}.${format === "jpeg" ? "jpg" : format}`, { type: mimeType });
}

export async function selectNativeImage(source: "camera" | "gallery"): Promise<File | null> {
  let result: MediaResult | undefined;
  try {
    if (source === "camera") {
      result = await Camera.takePhoto({ quality: 100, includeMetadata: true, saveToGallery: false });
    } else {
      result = (await Camera.chooseFromGallery({
        mediaType: MediaTypeSelection.Photo,
        allowMultipleSelection: false,
        includeMetadata: true
      })).results[0];
    }
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === "OS-PLUG-CAMR-0006" || code === "OS-PLUG-CAMR-0020") return null;
    throw new Error(`Die Bildauswahl ist fehlgeschlagen${code ? ` (${code})` : ""}. Bitte versuche es erneut.`);
  }
  return result ? mediaResultToFile(result) : null;
}
