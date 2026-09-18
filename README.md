# Digitaler Kleiderschrank

Kleidung mit dem Handy abfotografieren → Hintergrund wird automatisch entfernt und das Teil erkannt → im digitalen Schrank sortieren → Outfits an einer Figur (vorne und hinten) zusammenstellen, speichern, im Kalender planen und als Bild teilen.

**Kosten: 0 €.** Kein Konto, kein Server, keine API-Keys, kein Abo.
- Das Hosting auf GitHub Pages ist für öffentliche Repositories kostenlos.
- Die KI läuft direkt auf deinem Handy. Die Modelle kommen einmalig und kostenlos von den CDNs von Hugging Face und jsDelivr.
- Deine Fotos und dein Schrank verlassen das Gerät nie.

---

## Funktionen

| Bereich | Was geht |
|---|---|
| **Fotografieren** | Kamera oder Galerie, auch mehrere Bilder auf einmal (werden nacheinander abgearbeitet). Pro Teil ein Foto von vorne und optional eins von hinten. |
| **Freistellen** | KI (RMBG-1.4) entfernt den Hintergrund automatisch. Danach per Hand mit Radierer, „Zurückholen“-Pinsel und Zauberstab nachbessern, mit Undo. |
| **Erkennen** | KI (MobileCLIP) schlägt Kategorie (36 Arten), Muster und Stil vor. Die Farben werden aus dem Bild gelesen und benannt („Petrol“, „Bordeaux“, „Sand“ …). |
| **Schrank** | Suche, Filter nach Kategorie und Lieblingen, Sortierung (neu, A–Z, oft oder selten getragen), Tragezähler. |
| **Ankleiden** | Figur als neutrale Silhouette (Körperform, Statur, Größe, Hautton einstellbar) **oder** dein eigenes Ganzkörperfoto. Teile antippen zum Anziehen, mit dem Finger verschieben, mit zwei Fingern skalieren und drehen, Ebenen vor/zurück, spiegeln. Vorder- und Rückansicht. Einmal angepasst, sitzt das Teil in jedem Outfit richtig. |
| **Ideen** | Automatische Outfit-Vorschläge nach Farbharmonie (neutral + Akzent, Ton in Ton, analog, komplementär, Erdtöne …), Musterbalance, Stil, Jahreszeit und was du zuletzt anhattest. Mit Begründung. Filter nach Saison/Stil, „Rund um dieses Teil“. |
| **Outfits** | Speichern, wieder anziehen, als heute getragen markieren. |
| **Kalender** | Outfits auf Tage planen, abhaken, Verlauf „zuletzt getragen“. |
| **Teilen** | Outfit als PNG-Karte (Figur + Einzelteile) speichern oder direkt teilen. |
| **Backup** | Alles als ZIP exportieren/importieren (ersetzen oder dazupacken). |
| **Offline** | Installierbar als App (PWA), läuft nach dem ersten Laden auch ohne Internet. |

---

## Live

**<https://soulp3aking.github.io/kleiderschrank/>**

Auf dem Handy öffnen und zum Startbildschirm hinzufügen:
- iPhone (Safari): Teilen-Symbol → „Zum Home-Bildschirm“
- Android (Chrome): Menü ⋮ → „App installieren“ / „Zum Startbildschirm hinzufügen“

Jede Änderung, die auf `main` gepusht wird, baut GitHub automatisch neu und veröffentlicht sie (Workflow „Auf GitHub Pages veröffentlichen“, ca. 1–2 Minuten). Das Repository ist öffentlich, weil GitHub Pages nur so kostenlos ist. Öffentlich ist nur der *Code*, deine Fotos und Daten landen nie im Repository.

---

## Wichtig: Backups

Alles liegt **nur im Browser auf deinem Handy** (IndexedDB). Wenn du die Browserdaten löschst, die App deinstallierst oder das Handy wechselst, ist der Schrank weg.
→ Unter **Mehr → Backup herunterladen** regelmäßig eine ZIP sichern (z. B. in die Cloud oder an dich selbst schicken).
→ Unter **Mehr → Daten dauerhaft speichern** bittest du den Browser, nichts automatisch aufzuräumen.

Auf dem iPhone: Die installierte Home-Bildschirm-App und Safari haben **getrennte** Speicher. Nutze immer dieselbe Variante (am besten die installierte App).

---

## Die KI-Modelle

| Aufgabe | Modell | Download (einmalig) | Tempo |
|---|---|---|---|
| Freistellen, **„Automatisch“** (Standard) | [briaai/RMBG-1.4](https://huggingface.co/briaai/RMBG-1.4), fp16 auf der Grafikeinheit (WebGPU), sonst quantisiert | 84 MB bzw. 42 MB | ca. 1 s bzw. ca. 5 s pro Foto* |
| Freistellen, „Sparsam“ | RMBG-1.4, quantisiert (q8) | 42 MB | ca. 5 s pro Foto* |
| Freistellen, „Maximal“ | RMBG-1.4 fp16 (WebGPU) bzw. fp32 | 84 bzw. 168 MB | – |
| Kategorie, Muster, Stil erkennen | [Xenova/mobileclip_s0](https://huggingface.co/Xenova/mobileclip_s0), nur der Bild-Teil, fp16 | 22 MB | < 1 s |
| Laufzeit (ONNX Runtime Web) | vom jsDelivr-CDN | ca. 27 MB | – |

\* gemessen am PC, auf dem Handy entsprechend länger.

- Die Einstellung findest du unter *Mehr → Automatik → Freisteller*.
- Den ersten Download am besten **im WLAN** starten: *Mehr → Modelle jetzt für offline laden*. Danach bleiben die Modelle im Browser gespeichert, und alles funktioniert offline.
- Das kleine q8-Modell lässt auf hellem Untergrund manchmal Flecken stehen. Die App räumt die Maske deshalb automatisch nach (kleine abgetrennte Stellen werden entfernt).
- Getestet mit echten Fotos: T-Shirt, Chino, Pullover, Jacke, Cap und Sneaker wurden richtig erkannt (meist mit 76–100 % Sicherheit). Jeans wurden einmal nur als „Hose“ erkannt, das lässt sich mit einem Tipp korrigieren.
- RMBG-1.4 ist für **nicht-kommerzielle** Nutzung freigegeben. Für deinen privaten Kleiderschrank ist das kein Problem.
- Die Text-Seite der Erkennung ist vorberechnet (`src/lib/clipLabels.json`). Deshalb muss das Handy das große Text-Modell nicht laden. Wenn du Kategorien änderst: `node scripts/build-clip-labels.mjs` ausführen.

## Tipps für gute Fotos

- Teil **flach hinlegen**, glatt streichen, von oben fotografieren.
- **Einfarbiger Untergrund** mit Kontrast zum Teil: weißes Shirt auf dunklem Boden, dunkle Jeans auf hellem Laken.
- Gutes, gleichmäßiges Licht, möglichst ohne harte Schatten.
- Wenn die KI etwas übersieht: *Zauberstab* auf den Resthintergrund tippen, Kanten mit dem *Radierer* säubern.
- Auf der Figur: Teil antippen → verschieben, mit zwei Fingern Größe und Drehung anpassen. Das wird pro Teil gespeichert.

---

## Lokal auf dem PC starten (zum Ausprobieren)

Doppelklick auf **`Kleiderschrank-starten.bat`**. Beim ersten Mal werden die Abhängigkeiten installiert (Node.js muss installiert sein).
Die Seite öffnet sich unter <http://localhost:5173>.

Hinweis: Übers Heimnetz (`http://192.168…`) klappt am Handy nicht alles, weil Browser manche Funktionen (Offline-Modus, Modell-Cache, WebGPU) nur über **HTTPS** erlauben. Für die richtige Nutzung also die GitHub-Pages-Adresse verwenden.

## Technik

Vite + React + TypeScript + Tailwind · IndexedDB (`idb`) · `@huggingface/transformers` (ONNX Runtime Web, WebGPU/WASM) in einem Web Worker · `fflate` für die Backup-ZIP · eigener Service Worker für Offline.

```
src/
  lib/          Daten, KI, Farben, Vorschläge, Export, Backup
  components/   Figur, Ankleide-Bühne, Freistell-Editor, Teile-Editor, UI-Bausteine
  views/        Schrank, Ideen, Ankleiden, Kalender, Einstellungen
scripts/        Vorberechnung der Label-Embeddings
.github/        Automatisches Deployment auf GitHub Pages
```
