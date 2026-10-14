# Flotă — inspecții săptămânale

Aplicație web în română pentru fotografierea săptămânală a camionului și remorcii, cu lucru offline și panou de administrator. Funcționează fără servicii externe sau pachete npm.

## Pornire

Necesită Node.js 24 sau mai nou (SQLite inclus).

```sh
cd /workspace/1
npm start
```

Serverul ascultă implicit pe `127.0.0.1:3000`. La prima pornire generează două coduri de acces diferite în `.data/access-codes.json`: `driver` pentru șoferi și `admin` pentru administrator. Operatorul serverului citește acest fișier local și distribuie codurile printr-un canal privat. Fișierul nu este servit prin HTTP și este exclus din Git. Nu introduce codurile în surse, instrucțiuni publicate sau capturi de ecran.

Configurare opțională: `PORT`, `HOST`, `DATA_DIR`, `DRIVER_ACCESS_CODE`, `ADMIN_ACCESS_CODE`. Codurile trebuie să fie diferite și să aibă cel puțin 8 caractere. Păstrează `DATA_DIR` pe un volum persistent; conține codurile și baza de date SQLite cu fotografii. Copiile de siguranță trebuie să includă datele SQLite, folosind mecanismul SQLite de backup sau oprind serverul înainte de copiere. Nu copia doar fișierul principal în timp ce WAL este activ.

## Fluxul șoferului

1. Prima conectare și încărcarea aplicației se fac cu internet.
2. Introduce numele și numerele camionului/remorcii.
3. Adaugă opt fotografii: cabină, bord/kilometraj, camion față/spate/stânga/dreapta, remorcă exterior/interior. Folosește camera doar cu vehiculul oprit în siguranță.
4. Notează problemele; observațiile sunt obligatorii la deteriorări.
5. Finalizează raportul. Fotografii comprimate JPEG și rapoarte netrimise se păstrează în IndexedDB.
6. Aplicația încearcă sincronizarea la finalizare, la reconectare, la redeschidere și periodic cât timp este deschisă. Închiderea aplicației suspendă sincronizarea; deschide-o din nou cu internet pentru trimitere. Retry-urile nu creează duplicate, inclusiv după o nouă conectare.

Interfața offline folosește un service worker. Pentru telefoane este necesar HTTPS; localhost este acceptat doar pe dispozitivul care rulează serverul. După prima încărcare așteaptă activarea service worker-ului înainte de a pleca offline. Browserul trebuie să permită IndexedDB; nu folosi modul privat și nu șterge datele browserului înainte de sincronizare. Cererea pentru stocare persistentă este făcută automat, dar browserul poate refuza sau șterge datele sub presiune de spațiu. Rapoartele locale sunt vizibile în istoricul acestui dispozitiv.

## Administrator

Codul de administrator deschide panoul cu rapoarte primite, fotografii și observații. Înregistrează camioane/remorci în „Vehicule”. Panoul arată camioanele înregistrate fără raport în săptămâna curentă, luni–duminică, conform orei dispozitivului. Nu poate detecta rapoarte încă offline; șoferii introduc numerele manual sau din sugestii. Pentru flote cu mai multe fusuri orare este necesară o regulă comună pentru săptămâna de raportare.

## Verificare

```sh
npm test
```

Testele existente verifică accesul, rolurile, salvarea fotografiilor, validarea datelor, reîncercarea fără duplicate și înregistrarea vehiculelor. Pentru verificare reală offline: conectează-te, deschide formularul, deconectează internetul, completează inspecția, reîncarcă pagina și verifică raportul local; reconectează și confirmă apariția raportului în panoul administratorului.

Testul de browser reproductibil este `python test/browser.py`; necesită pachetele Python `playwright`, `Pillow` și Chromium (implicit `/usr/bin/chromium`, configurabil prin `CHROMIUM_PATH`). Pornește un server și o bază de date temporare și verifică formularul mobil, cele 8 fotografii offline, păstrarea ciornei și raportului după reîncărcare, sincronizarea fără duplicate, accesul administratorului și indicarea camioanelor fără inspecție. Nu modifică datele aplicației din `.data`.

## Publicare și limitele primei versiuni

Pentru Render, configurația este în `render.yaml`, iar pașii sunt în [RENDER.md](RENDER.md). Configurația cere serviciu Starter și disc persistent de 1 GB (resurse cu plată), HTTPS pe adresa oferită de Render, Node 24 și coduri de acces completate privat în Render. Crearea serviciului și costul trebuie confirmate în contul Render; existența fișierului nu dovedește publicarea. Serverul ascultă local pentru dezvoltare și pe `0.0.0.0` când este configurat în Render. Nu sunt configurate automat notificările SMS/email/push sau distribuirea aplicației în magazine.

Accesul folosește coduri comune pe rol, nu conturi individuale; numele șoferului este declarat de utilizator. Sesiunile durează 30 de zile. Pentru utilizare operațională cu mai mulți șoferi se recomandă conturi individuale, atribuirea vehiculelor, politică de păstrare a fotografiilor și administrarea sesiunilor. Rapoartele locale rămân pe dispozitiv după ieșirea din cont; folosește dispozitive de încredere. Panoul listează cele mai recente 500 de rapoarte; datele mai vechi rămân în baza de date. Interfața permite adăugarea vehiculelor; modificarea/eliminarea flotei și rapoartele PDF nu sunt încă implementate.

Repository-ul poate fi folosit direct în mediul izolat existent; nu este necesar un Git worktree suplimentar.
