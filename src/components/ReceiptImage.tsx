import { useState } from "react";
import type { StoredReceipt } from "../../shared/receipt-api.js";
import { ImageIcon } from "./icons.js";

export default function ReceiptImage({ attachment, warning }: {
  attachment: NonNullable<StoredReceipt["attachment"]>;
  warning: StoredReceipt["attachmentWarning"];
}) {
  const [failed, setFailed] = useState(false);
  if (warning === "unavailable" || !attachment.imageUrl || failed) {
    return <div className="detail-image image-unavailable" role="status">
      <ImageIcon />
      <h2>Originalbild nicht verfügbar</h2>
      <p>Das Bonbild fehlt, ist nicht lesbar oder kann nicht angezeigt werden. Deine Belegdaten bleiben zugänglich; die gespeicherte Bildzuordnung bleibt erhalten.</p>
      <p>Eine vollständige Sicherung benötigt auch das Originalbild.</p>
    </div>;
  }
  return <div className="detail-image"><img src={attachment.imageUrl} alt="Gespeicherter Originalbon" onError={() => setFailed(true)} /></div>;
}
