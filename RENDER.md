# Publicare pe Render, fără domeniu propriu

Configurația completă este în `render.yaml`. Render oferă o adresă HTTPS `*.onrender.com`; nu este necesar un domeniu propriu.

## Crearea serviciului

1. Creează un cont pe [Render](https://dashboard.render.com/) și conectează contul GitHub care are acces la repository-ul `catalinlutenco-art/1`.
2. Selectează **New → Blueprint**, apoi repository-ul `catalinlutenco-art/1`, ramura `main` și fișierul `render.yaml`.
3. Verifică resursele înainte de creare: un serviciu web **Starter**, regiunea Frankfurt și un disc persistent de **1 GB**, montat la `/var/data`. Serviciul și discul sunt cu plată. Prețurile curente sunt afișate de Render; această configurație nu creează singură resurse și nu autorizează plata. Nu selecta planul Free pentru această versiune: datele SQLite trebuie păstrate pe un disc persistent.
4. Introdu două coduri de acces private și diferite în câmpurile `DRIVER_ACCESS_CODE` și `ADMIN_ACCESS_CODE`. Fiecare trebuie să aibă minimum 8 caractere; recomandăm coduri lungi, aleatorii. Nu trimite codurile în chat și nu le pune în GitHub. Distribuie codul de șofer în privat, iar pe cel de administrator păstrează-l separat.
5. Confirmă crearea serviciului în Render după ce ai verificat costul. Așteaptă ca testele, pornirea și verificarea `/api/health` să reușească și serviciul să apară **Live**.
6. Copiază adresa publică HTTPS afișată pe pagina serviciului și deschide-o pe telefon. Prima încărcare și prima conectare necesită internet.

## Verificare după publicare

- Conectează-te cu codul de șofer și finalizează o inspecție cu cele 8 fotografii.
- Conectează-te cu codul de administrator și confirmă raportul, fotografiile și observațiile.
- După încărcarea inițială, verifică o inspecție offline; redeschide aplicația cu internet și confirmă trimiterea.
- Repornește serviciul din Render și confirmă că raportul există încă. Aceasta validează persistența discului în găzduirea reală.

Fișierele din mediul local `.data` nu sunt publicate: serviciul Render începe cu o bază goală pe propriul disc. Păstrează discul la redeploy și configurarea `DATA_DIR=/var/data`. Nu șterge discul sau serviciul fără un backup SQLite verificat. Cei 1 GB sunt un punct de pornire; monitorizează spațiul ocupat de fotografii și extinde-l la nevoie.

Actualizările automate sunt dezactivate (`autoDeploy: false`): după schimbări în GitHub folosește **Manual Deploy → Deploy latest commit**. Node este fixat la versiunea 24.19.0. Nu este necesar `npm install`: aplicația nu are dependențe externe; comanda de build rulează testele înainte de pornire.

Codurile sunt comune pe rol în această primă versiune. Pentru utilizare cu mai mulți șoferi, conturile individuale și o politică de retenție rămân îmbunătățiri separate. Modificarea codurilor nu revocă sesiunile deja emise; nu folosi schimbarea lor ca unic mecanism de retragere a accesului.
