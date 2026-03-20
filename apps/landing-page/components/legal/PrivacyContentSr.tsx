export function PrivacyContentSr() {
  return (
    <div className="max-w-[760px] mx-auto px-4 sm:px-6 py-12 sm:py-16 pb-24">
      <h1 className="text-3xl sm:text-4xl font-display font-bold text-text mb-2 tracking-tight">
        Politika privatnosti
      </h1>
      <p className="text-sm text-text-3 mb-12">Poslednje ažuriranje: 17. mart 2026.</p>

      <div className="bg-primary/5 border border-primary/20 rounded-xl p-5 sm:p-6 mb-10">
        <p className="text-text-2 leading-relaxed m-0">
          SweatDrop je platforma za gamifikaciju teretana. Ova politika objašnjava koje podatke
          prikupljamo, zašto ih prikupljamo i kako ih koristimo. Čitaj je u celosti —
          posebno deo o podacima o zdravlju.
        </p>
      </div>

      <section className="legal-content space-y-6">
        <h2 className="text-xl font-semibold text-text mt-12 mb-4 pb-2 border-b border-border">1. Ko smo</h2>
        <p className="text-text-2 leading-relaxed">
          SweatDrop (u daljem tekstu: &quot;mi&quot;, &quot;nas&quot;, &quot;SweatDrop&quot;) je softverska platforma koja
          pruža usluge gamifikacije teretanama i njihovim članovima. Rukovalac podataka o ličnosti
          u smislu Zakona o zaštiti podataka o ličnosti Republike Srbije je:
        </p>
        <p className="text-text-2 leading-relaxed">
          <strong className="text-text">SweatDrop</strong><br />
          Beograd, Srbija<br />
          Email: <a href="mailto:support@sweat-drop.com" className="text-primary hover:underline">support@sweat-drop.com</a>
        </p>

        <h2 className="text-xl font-semibold text-text mt-12 mb-4 pb-2 border-b border-border">2. Koje podatke prikupljamo</h2>
        <h3 className="text-base font-semibold text-text-2 mt-7 mb-2">2.1 Podaci koje ti daješ</h3>
        <ul className="list-disc pl-6 text-text-2 space-y-2">
          <li><strong className="text-text">Nalog:</strong> Ime, prezime, email adresa, lozinka (kriptovana)</li>
          <li><strong className="text-text">Profil:</strong> Korisničko ime, profilna fotografija, naziv teretane</li>
          <li><strong className="text-text">Zdravstveni i fizički podaci (opciono):</strong> Pol, telesna masa, visina, datum rođenja, cilj treninga. Ove podatke unosiš dobrovoljno tokom podešavanja profila i koristiš ih za personalizovane preporuke. Možeš ih preskočiti ili obrisati u svakom trenutku.</li>
        </ul>
        <h3 className="text-base font-semibold text-text-2 mt-7 mb-2">2.2 Podaci koji se generišu korišćenjem aplikacije</h3>
        <ul className="list-disc pl-6 text-text-2 space-y-2">
          <li><strong className="text-text">Sesije treninga:</strong> Datum, vreme, trajanje, broj zarađenih kapi (drops), prosečan RPM, kalorije</li>
          <li><strong className="text-text">Check-in podaci:</strong> Datum i vreme čekiranja, teretana, GPS distanca od teretane (samo broj, ne precizna lokacija)</li>
          <li><strong className="text-text">GPS lokacija:</strong> Prikupljamo tvoju lokaciju <em>isključivo</em> u trenutku skeniranja QR koda na recepciji teretane, da bismo potvrdili da se fizički nalaziš u teretani. Lokaciju ne pratimo kontinuirano.</li>
          <li><strong className="text-text">Bluetooth (BLE) podaci:</strong> RPM i metrički podaci sa senzora na spravi. Podaci se obrađuju na uređaju i šalju samo agregirani rezultati.</li>
          <li><strong className="text-text">Gamifikacija:</strong> Drops balans, badge-evi, rang na lestvici, progres izazova, istorija nagrada</li>
        </ul>
        <h3 className="text-base font-semibold text-text-2 mt-7 mb-2">2.3 Tehnički podaci</h3>
        <ul className="list-disc pl-6 text-text-2 space-y-2">
          <li>Tip uređaja, operativni sistem, verzija aplikacije</li>
          <li>IP adresa (za bezbednost i prevenciju zloupotreba)</li>
          <li>Log fajlovi grešaka i performansi</li>
        </ul>

        <h2 className="text-xl font-semibold text-text mt-12 mb-4 pb-2 border-b border-border">3. Zašto prikupljamo podatke (pravni osnov)</h2>
        <h3 className="text-base font-semibold text-text-2 mt-7 mb-2">3.1 Izvršenje ugovora</h3>
        <p className="text-text-2 leading-relaxed">Za pružanje osnovnih usluga — kreiranje naloga, praćenje sesija, izračunavanje drops-a, prikazivanje lestvice i upravljanje nagradom u Store-u.</p>
        <h3 className="text-base font-semibold text-text-2 mt-7 mb-2">3.2 Legitimni interes</h3>
        <p className="text-text-2 leading-relaxed">Za sprečavanje prevara pri čekiranju (GPS verifikacija), bezbednost platforme, poboljšanje kvaliteta usluge na osnovu agregiranih podataka o korišćenju.</p>
        <h3 className="text-base font-semibold text-text-2 mt-7 mb-2">3.3 Pristanak</h3>
        <p className="text-text-2 leading-relaxed">Za podatke o zdravlju (telesna masa, visina, datum rođenja, cilj treninga). Pristanak davaš dobrovoljno tokom podešavanja profila i možeš ga povući u svakom trenutku brisanjem tih podataka iz profila.</p>
        <h3 className="text-base font-semibold text-text-2 mt-7 mb-2">3.4 Zakonska obaveza</h3>
        <p className="text-text-2 leading-relaxed">Čuvanje podataka u obimu koji zahteva važeće zakonodavstvo.</p>

        <h2 className="text-xl font-semibold text-text mt-12 mb-4 pb-2 border-b border-border">4. Ko vidi tvoje podatke</h2>
        <h3 className="text-base font-semibold text-text-2 mt-7 mb-2">4.1 Vlasnik teretane (Gym Owner)</h3>
        <p className="text-text-2 leading-relaxed">Vlasnik teretane u kojoj si aktivan vidi:</p>
        <ul className="list-disc pl-6 text-text-2 space-y-2">
          <li>Tvoje ime, avatar i aktivnost isključivo u <em>njegovoj</em> teretani</li>
          <li>Broj sesija, drops zarađen u njegovoj teretani, datum poslednje posete</li>
          <li>Tvoj fitness cilj (npr. &quot;kondicija&quot;) — bez telesne mase, visine i datuma rođenja</li>
          <li>Rang na lestvici njegove teretane</li>
        </ul>
        <p className="text-text-2 leading-relaxed">Vlasnik teretane <strong className="text-text">ne vidi</strong> tvoje aktivnosti u drugim teretanama, email adresu, telesnu masu, visinu niti datum rođenja.</p>
        <h3 className="text-base font-semibold text-text-2 mt-7 mb-2">4.2 Drugi korisnici aplikacije</h3>
        <p className="text-text-2 leading-relaxed">Na javnoj lestvici vidljivi su: korisničko ime, avatar, broj drops-a i rang. Možeš isključiti javni profil u podešavanjima.</p>
        <h3 className="text-base font-semibold text-text-2 mt-7 mb-2">4.3 SweatDrop tim</h3>
        <p className="text-text-2 leading-relaxed">Naš tim ima pristup podacima isključivo za pružanje podrške, rešavanje tehničkih problema i sprečavanje zloupotreba.</p>
        <h3 className="text-base font-semibold text-text-2 mt-7 mb-2">4.4 Treće strane</h3>
        <p className="text-text-2 leading-relaxed">Ne prodajemo tvoje podatke. Koristimo sledeće pouzdane pružaoce usluga:</p>
        <ul className="list-disc pl-6 text-text-2 space-y-2">
          <li><strong className="text-text">Supabase</strong> — baza podataka i autentifikacija, serveri u EU</li>
          <li><strong className="text-text">Expo / EAS</strong> — distribucija mobilne aplikacije</li>
          <li><strong className="text-text">Sentry</strong> (ako je aktivno) — anonimni izveštaji o greškama</li>
        </ul>
        <p className="text-text-2 leading-relaxed">Svi obrađivači podataka imaju sklopljene ugovore o obradi podataka u skladu sa važećim propisima.</p>
        <h3 className="text-base font-semibold text-text-2 mt-7 mb-2">4.5 Sweat Arenas — cross-gym vidljivost</h3>
        <p className="text-text-2 leading-relaxed">Prijavom na Sweat Arenu prihvataš da tvoj skor i korisničko ime budu vidljivi svim učesnicima arene, uključujući članove drugih teretana koje učestvuju.</p>
        <p className="text-text-2 leading-relaxed">Prikazuje se: korisničko ime, avatar, ukupni skor u areni. Ne prikazuje se: iz koje teretane dolaze tvoji poeni, telesna masa, visina, email niti bilo koji lični podaci.</p>
        <p className="text-text-2 leading-relaxed">Sponzor arene vidi isključivo agregirane podatke (broj učesnika, ukupna aktivnost) — nikad individualne podatke korisnika.</p>

        <h2 className="text-xl font-semibold text-text mt-12 mb-4 pb-2 border-b border-border">5. GPS lokacija — detalji</h2>
        <p className="text-text-2 leading-relaxed">GPS lokaciju koristimo <strong className="text-text">samo</strong> u trenutku skeniranja recepcijskog QR koda, da bismo potvrdili da se nalaziš unutar 200 metara od teretane. Ne pamtimo precizne koordinate — čuvamo samo izračunatu distancu u metrima i da li je verifikacija bila uspešna.</p>
        <p className="text-text-2 leading-relaxed">Ako odbiješ pristup lokaciji, check-in i dalje funkcioniše — samo se beleži da GPS verifikacija nije bila moguća. Kontinuirano praćenje lokacije <strong className="text-text">ne postoji</strong>.</p>

        <h2 className="text-xl font-semibold text-text mt-12 mb-4 pb-2 border-b border-border">6. Koliko dugo čuvamo podatke</h2>
        <ul className="list-disc pl-6 text-text-2 space-y-2">
          <li><strong className="text-text">Nalog i profil:</strong> Dok je nalog aktivan. Posle brisanja naloga — 30 dana retention period, potom trajno brisanje.</li>
          <li><strong className="text-text">Sesije treninga i check-ini:</strong> 3 godine od poslednje aktivnosti</li>
          <li><strong className="text-text">Zdravstveni podaci:</strong> Do brisanja od strane korisnika ili brisanja naloga</li>
          <li><strong className="text-text">Log fajlovi:</strong> 90 dana</li>
        </ul>

        <h2 className="text-xl font-semibold text-text mt-12 mb-4 pb-2 border-b border-border">7. Tvoja prava</h2>
        <p className="text-text-2 leading-relaxed">Prema Zakonu o zaštiti podataka o ličnosti, imaš pravo da:</p>
        <ul className="list-disc pl-6 text-text-2 space-y-2">
          <li><strong className="text-text">Pristupiš</strong> podacima koje čuvamo o tebi</li>
          <li><strong className="text-text">Ispraviš</strong> netačne podatke (direktno u aplikaciji ili putem emaila)</li>
          <li><strong className="text-text">Obrišeš</strong> nalog i sve podatke — u Settings → Obriši nalog</li>
          <li><strong className="text-text">Preneseš</strong> podatke (izvoz u JSON formatu — kontaktiraj nas)</li>
          <li><strong className="text-text">Prigovoriš</strong> obradi na osnovu legitimnog interesa</li>
          <li><strong className="text-text">Povučeš pristanak</strong> za zdravstvene podatke u svakom trenutku</li>
        </ul>
        <p className="text-text-2 leading-relaxed">Za bilo koji zahtev, piši nam na <a href="mailto:support@sweat-drop.com" className="text-primary hover:underline">support@sweat-drop.com</a>. Odgovaramo u roku od 30 dana.</p>

        <h2 className="text-xl font-semibold text-text mt-12 mb-4 pb-2 border-b border-border">8. Bezbednost podataka</h2>
        <p className="text-text-2 leading-relaxed">Svi podaci se prenose enkriptovano (TLS 1.3). Lozinke se nikad ne čuvaju u čitljivom obliku — koristimo bcrypt hashing. Baza podataka se nalazi na Supabase infrastrukturi u EU sa automatskim backup-ovima i enkripcijom u mirovanju.</p>

        <h2 className="text-xl font-semibold text-text mt-12 mb-4 pb-2 border-b border-border">9. Deca</h2>
        <p className="text-text-2 leading-relaxed">SweatDrop nije namenjen osobama mlađim od 13 godina. Tokom registracije zahtevamo minimum 13 godina starosti. Ako saznamo da smo prikupili podatke deteta mlađeg od 13 godina, odmah brišemo nalog.</p>

        <h2 className="text-xl font-semibold text-text mt-12 mb-4 pb-2 border-b border-border">10. Izmene politike</h2>
        <p className="text-text-2 leading-relaxed">O značajnim izmenama obaveštavamo putem email-a ili notifikacije u aplikaciji najmanje 14 dana pre stupanja na snagu. Datum poslednjeg ažuriranja uvek je vidljiv na vrhu ove stranice.</p>

        <h2 className="text-xl font-semibold text-text mt-12 mb-4 pb-2 border-b border-border">11. Kontakt</h2>
        <p className="text-text-2 leading-relaxed">Za sva pitanja o privatnosti:<br /><a href="mailto:support@sweat-drop.com" className="text-primary hover:underline">support@sweat-drop.com</a></p>
      </section>
    </div>
  );
}
