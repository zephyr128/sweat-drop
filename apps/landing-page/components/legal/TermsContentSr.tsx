export function TermsContentSr() {
  return (
    <div className="max-w-[760px] mx-auto px-4 sm:px-6 py-12 sm:py-16 pb-24">
      <h1 className="text-3xl sm:text-4xl font-display font-bold text-text mb-2 tracking-tight">
        Uslovi korišćenja
      </h1>
      <p className="text-sm text-text-3 mb-12">Poslednje ažuriranje: 17. mart 2026.</p>

      <div className="bg-primary/5 border border-primary/20 rounded-xl p-5 sm:p-6 mb-10">
        <p className="text-text-2 leading-relaxed m-0">
          Korišćenjem SweatDrop aplikacije ili web sajta prihvataš ove uslove.
          Molimo te da ih pažljivo pročitaš pre registracije.
        </p>
      </div>

      <section className="legal-content space-y-6">
        <h2 className="text-xl font-semibold text-text mt-12 mb-4 pb-2 border-b border-border">1. Ko smo i šta nudimo</h2>
        <p className="text-text-2 leading-relaxed">
          SweatDrop je platforma koja teretanama pruža alate za gamifikaciju — lestvice, izazove, sistem nagrada i praćenje aktivnosti članova. Korisnicima pruža mobilnu aplikaciju za praćenje treninga, zarađivanje drops-a i takmičenje sa drugima.
        </p>
        <p className="text-text-2 leading-relaxed">
          Ovi uslovi važe za sve korisnike platforme: krajnje korisnike (članove teretana), vlasnike teretana (gym owner-e) i administratore.
        </p>

        <h2 className="text-xl font-semibold text-text mt-12 mb-4 pb-2 border-b border-border">2. Registracija i nalog</h2>
        <ul className="list-disc pl-6 text-text-2 space-y-2">
          <li>Moraš imati najmanje 13 godina da bi koristio SweatDrop.</li>
          <li>Odgovoran si za tačnost podataka koje unosiš pri registraciji.</li>
          <li>Odgovoran si za bezbednost lozinke i svih aktivnosti na svom nalogu.</li>
          <li>Jedan nalog po osobi — nije dozvoljeno kreiranje više naloga radi zloupotrebe sistema.</li>
          <li>Obavesti nas odmah ako posumnjaš da je tvoj nalog kompromitovan.</li>
        </ul>

        <h2 className="text-xl font-semibold text-text mt-12 mb-4 pb-2 border-b border-border">3. Drops sistem i nagrade</h2>
        <h3 className="text-base font-semibold text-text-2 mt-7 mb-2">3.1 Šta su drops</h3>
        <p className="text-text-2 leading-relaxed">
          Drops su virtualni bodovi koje zarađuješ treningom i aktivnošću u teretani. Drops <strong className="text-text">nemaju novčanu vrednost</strong> i ne mogu se zameniti za novac, prenositi između korisnika niti iznositi iz platforme.
        </p>
        <h3 className="text-base font-semibold text-text-2 mt-7 mb-2">3.2 Nagrade</h3>
        <p className="text-text-2 leading-relaxed">
          Drops možeš da trošiš u Store-u teretane na nagrade koje definiše vlasnik teretane. SweatDrop nije odgovoran za dostupnost, kvalitet ili isporuku fizičkih nagrada — to je isključiva odgovornost vlasnika teretane.
        </p>
        <p className="text-text-2 leading-relaxed">
          Virtualne nagrade (badge-evi, rangovi) su trajne i ne mogu biti oduzete osim u slučaju dokazane zloupotrebe sistema.
        </p>
        <h3 className="text-base font-semibold text-text-2 mt-7 mb-2">3.3 Zabrana manipulacije</h3>
        <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-5 sm:p-6 my-6">
          <p className="text-text-2 leading-relaxed m-0">
            Zabranjeno je manipulisanje sistemom drops-a na bilo koji način — uključujući korišćenje tuđeg QR koda za check-in, ostavljanje sprave da radi bez aktivnog treninga u cilju zarađivanja drops-a, ili bilo koje drugo zaobilaženje sistema. Kršenje ovog pravila rezultuje trajnim ukidanjem naloga.
          </p>
        </div>

        <h2 className="text-xl font-semibold text-text mt-12 mb-4 pb-2 border-b border-border">4. Check-in i GPS</h2>
        <p className="text-text-2 leading-relaxed">
          Check-in na recepciji teretane zahteva da se fizički nalaziš u teretani ili u neposrednoj blizini (do 200 metara). Dajući pristanak za lokaciju, razumeš da SweatDrop proverava tvoju poziciju isključivo u trenutku skeniranja QR koda.
        </p>
        <p className="text-text-2 leading-relaxed">
          Check-in je moguć i bez GPS dozvole, ali se tada beleži kao neverifikovani check-in. Vlasnik teretane može da vidi GPS status check-ina.
        </p>

        <h2 className="text-xl font-semibold text-text mt-12 mb-4 pb-2 border-b border-border">5. Pravila ponašanja</h2>
        <p className="text-text-2 leading-relaxed">Korišćenjem SweatDrop-a prihvataš da nećeš:</p>
        <ul className="list-disc pl-6 text-text-2 space-y-2">
          <li>Zloupotrebljavati sistem drops-a ili nagrada</li>
          <li>Uznemiravati, vređati ili pretiti drugim korisnicima</li>
          <li>Postavljati uvredljiv, diskriminatoran ili nezakonit sadržaj (korisničko ime, avatar)</li>
          <li>Pokušavati da hakuješ, reverse-engineeruješ ili ometaš rad platforme</li>
          <li>Koristiti automatizovane alate (botove) za interakciju sa platformom</li>
          <li>Kreirati lažne naloge u cilju manipulacije lestvicama ili izazovima</li>
        </ul>

        <h2 className="text-xl font-semibold text-text mt-12 mb-4 pb-2 border-b border-border">6. Vlasnici teretana — posebni uslovi</h2>
        <h3 className="text-base font-semibold text-text-2 mt-7 mb-2">6.1 Obaveze vlasnika teretane</h3>
        <ul className="list-disc pl-6 text-text-2 space-y-2">
          <li>Odgovoran si za tačnost podataka o teretani (naziv, adresa, GPS koordinate).</li>
          <li>Odgovoran si za nagrade koje definišeš u Store-u — dostupnost, opis i isporuku.</li>
          <li>Dužan si da obavestiš članove da teretana koristi SweatDrop i da se podaci prikupljaju.</li>
          <li>Ne smeš koristiti podatke o članovima u svrhe van upravljanja teretanom.</li>
          <li>Odgovoran si za bezbednost pristupnih podataka administratora teretane.</li>
        </ul>
        <h3 className="text-base font-semibold text-text-2 mt-7 mb-2">6.2 Pilot program</h3>
        <p className="text-text-2 leading-relaxed">
          Tokom 90-dnevnog pilot programa koristiš PRO funkcionalnosti besplatno. SweatDrop obezbeđuje senzore i instalaciju. Po isteku pilota:
        </p>
        <ul className="list-disc pl-6 text-text-2 space-y-2">
          <li>Biraš plaćeni plan ili otkazuješ — bez penala.</li>
          <li>Ako otkazuješ, SweatDrop uklanja senzore u dogovorenom roku.</li>
          <li>Zadržavaš sve podatke o članovima — oni su tvoji.</li>
          <li>Sponzorski prihodi ostvareni tokom pilota su tvoji u potpunosti (100%).</li>
        </ul>
        <h3 className="text-base font-semibold text-text-2 mt-7 mb-2">6.3 Sweat Arenas i sponzorstvo</h3>
        <p className="text-text-2 leading-relaxed">
          Učešćem u Sweat Arenas prihvataš uslove revenue share-a koji su definisani u pozivnici (standardno 70% teretana, 30% SweatDrop). SweatDrop koordiniše odnos sa sponzorom i isplatu.
        </p>
        <h3 className="text-base font-semibold text-text-2 mt-7 mb-2">6.4 Sweat Arenas — pravila učešća</h3>
        <p className="text-text-2 leading-relaxed">Prijavom na arenu prihvataš:</p>
        <ul className="list-disc pl-6 text-text-2 space-y-2">
          <li>Opt-in uslov koji je definisan (besplatno, drops trošak, streak ili level)</li>
          <li>Drops plaćeni pri opt-inu se refunduju samo ako arena bude otkazana pre datuma početka</li>
          <li>Povlačenje teretane iz arene pre početka rezultuje automatskim refundom drops-a svim njenim učesnicima</li>
          <li>Revenue share između teretane i SweatDrop-a (70/30) važi za sve sponzorisane arene</li>
        </ul>

        <h2 className="text-xl font-semibold text-text mt-12 mb-4 pb-2 border-b border-border">7. Plaćanje i pretplate</h2>
        <p className="text-text-2 leading-relaxed">
          Nakon pilot perioda, pretplata se naplaćuje mesečno ili godišnje unapred. Otkazivanje je moguće u svakom trenutku — važi do kraja plaćenog perioda, bez povraćaja za neiskorišćeni deo meseca.
        </p>
        <p className="text-text-2 leading-relaxed">
          SweatDrop zadržava pravo izmene cena uz obaveštenje od 30 dana pre stupanja na snagu novih cena.
        </p>

        <h2 className="text-xl font-semibold text-text mt-12 mb-4 pb-2 border-b border-border">8. Intelektualna svojina</h2>
        <p className="text-text-2 leading-relaxed">
          SweatDrop platforma, logo, dizajn i softver su intelektualna svojina SweatDrop-a. Korišćenjem platforme ne stičeš nikakva prava na ove elemente.
        </p>
        <p className="text-text-2 leading-relaxed">
          Sadržaj koji unosiš (avatar, korisničko ime) ostaje tvoja svojina. Dajući nam dozvolu da ga prikazujemo u okviru platforme.
        </p>

        <h2 className="text-xl font-semibold text-text mt-12 mb-4 pb-2 border-b border-border">9. Dostupnost i promene servisa</h2>
        <p className="text-text-2 leading-relaxed">
          Trudimo se da platforma bude dostupna 24/7, ali ne garantujemo neprekidnu dostupnost. Planirano održavanje najavljujemo unapred kada je moguće.
        </p>
        <p className="text-text-2 leading-relaxed">
          Zadržavamo pravo da menjamo, unapređujemo ili ukidamo određene funkcionalnosti. O značajnim promenama obaveštavamo korisnike i vlasnike teretana unapred.
        </p>

        <h2 className="text-xl font-semibold text-text mt-12 mb-4 pb-2 border-b border-border">10. Ograničenje odgovornosti</h2>
        <p className="text-text-2 leading-relaxed">SweatDrop nije odgovoran za:</p>
        <ul className="list-disc pl-6 text-text-2 space-y-2">
          <li>Fizičke povrede nastale tokom treninga</li>
          <li>Nedostupnost ili kašnjenje fizičkih nagrada od strane vlasnika teretane</li>
          <li>Gubitak drops-a usled tehničkih problema (u slučaju greške vraćamo drops)</li>
          <li>Štetu nastalu neovlašćenim pristupom nalogu korisnika zbog nedovoljno bezbedne lozinke</li>
          <li>Sadržaj ili politike teretana koje koriste platformu</li>
        </ul>

        <h2 className="text-xl font-semibold text-text mt-12 mb-4 pb-2 border-b border-border">11. Raskid i suspenzija naloga</h2>
        <p className="text-text-2 leading-relaxed">
          Možeš obrisati nalog u svakom trenutku iz Settings → Obriši nalog. Po brisanju, podaci se brišu u roku od 30 dana.
        </p>
        <p className="text-text-2 leading-relaxed">SweatDrop može suspendovati ili ukinuti nalog bez prethodne najave u slučaju:</p>
        <ul className="list-disc pl-6 text-text-2 space-y-2">
          <li>Dokazane zloupotrebe drops sistema</li>
          <li>Kršenja pravila ponašanja</li>
          <li>Aktivnosti koje ugrožavaju bezbednost platforme ili drugih korisnika</li>
          <li>Neplaćanja pretplate (za vlasnike teretana) — uz obaveštenje i grace period od 7 dana</li>
        </ul>

        <h2 className="text-xl font-semibold text-text mt-12 mb-4 pb-2 border-b border-border">12. Merodavno pravo i sporovi</h2>
        <p className="text-text-2 leading-relaxed">
          Na ove uslove primenjuje se pravo Republike Srbije. Za sporove koji nastanu u vezi sa korišćenjem SweatDrop platforme nadležan je sud u Beogradu.
        </p>
        <p className="text-text-2 leading-relaxed">
          Pre pokretanja sudskog postupka, molimo te da nas kontaktiraš na{' '}
          <a href="mailto:support@sweat-drop.com" className="text-primary hover:underline">support@sweat-drop.com</a>
          {' '}— u većini slučajeva možemo rešiti problem direktno.
        </p>

        <h2 className="text-xl font-semibold text-text mt-12 mb-4 pb-2 border-b border-border">13. Izmene uslova</h2>
        <p className="text-text-2 leading-relaxed">
          O značajnim izmenama uslova obaveštavamo putem email-a ili notifikacije u aplikaciji najmanje 14 dana pre stupanja na snagu. Nastavkom korišćenja platforme posle tog roka smatramo se da si prihvatio nove uslove.
        </p>

        <h2 className="text-xl font-semibold text-text mt-12 mb-4 pb-2 border-b border-border">14. Kontakt</h2>
        <p className="text-text-2 leading-relaxed">
          Za pitanja u vezi sa uslovima korišćenja:<br />
          <a href="mailto:support@sweat-drop.com" className="text-primary hover:underline">support@sweat-drop.com</a>
        </p>
      </section>
    </div>
  );
}
