export type Language = 'en' | 'sr';

export const languages: { code: Language; name: string }[] = [
  { code: 'en', name: 'English' },
  { code: 'sr', name: 'Srpski' },
];

export const translations = {
  en: {
    hero: {
      title: 'Your Members Are Leaving',
      titleHighlight: 'Here\'s How to Stop It',
      subtitle: '47% of gym members quit within 6 months. Sweat Drop turns every workout into a game—keeping members engaged, motivated, and coming back.',
      cta: 'Calculate Your ROI',
      ctaSecondary: 'See How It Works',
    },
    heroMinimal: {
      subtitle: 'The Digital Layer for Modern Gyms.',
      description: 'Transform your equipment into connected experiences. Increase retention. Drive revenue.',
      ctaPrimary: 'Request Demo',
      ctaSecondary: 'Apply for Pilot',
    },
    requestDemo: {
      title: 'Request Demo',
      submit: 'Submit Request',
      cancel: 'Cancel',
      close: 'Close',
      success: "We'll contact you within 24 hours.",
      fields: {
        fullName: 'Full Name',
        gymName: 'Gym Name',
        email: 'Email',
        phone: 'Phone',
        locations: 'Number of Locations',
        message: 'Message',
      },
      locations: {
        one: '1',
        twoToFive: '2-5',
        fivePlus: '5+',
      },
      errors: {
        required: 'This field is required',
        email: 'Please enter a valid email address',
      },
    },
    applyPilot: {
      title: 'Apply for Pilot',
      submit: 'Apply for Pilot',
      cancel: 'Cancel',
      close: 'Close',
      success: 'Application received. Our team will review and respond shortly.',
      fields: {
        fullName: 'Full Name',
        gymName: 'Gym Name',
        cityCountry: 'City / Country',
        activeMembers: 'Number of Active Members',
        cardioMachines: 'Cardio Machines Count',
        multipleLocations: 'Do you have multiple locations?',
        whyJoin: 'Why do you want to join the pilot?',
      },
      multipleLocations: {
        yes: 'Yes',
        no: 'No',
      },
      errors: {
        required: 'This field is required',
        number: 'Please enter a valid number',
      },
    },
    whatIsSweatDrop: {
      title: 'What is SweatDrop',
      description: 'IoT sensors and mobile app that transform your gym equipment into connected, gamified experiences.\n\nMembers earn rewards. You gain insights.',
    },
    smartCardioSensors: {
      title: 'Smart Cardio Sensors',
      subtitle: 'Non-invasive sensors that attach to existing equipment. No modifications required.',
      cardioEcosystem: {
        title: 'Smart Cardio Ecosystem',
        subtitle: 'Non-invasive, Zero-modification',
      },
      futureResistance: {
        title: 'The Future of Resistance',
        subtitle: 'Coming Soon',
        smartPin: {
          name: 'Smart Pin',
          description: 'Sensor that replaces standard weight pins, tracking reps and resistance.',
        },
        smartCarabiner: {
          name: 'Smart Carabiner',
          description: 'Intelligent carabiner for cable machines measuring tension and repetitions.',
        },
        universalMotion: {
          name: 'Universal Motion Sensor',
          description: 'Ultra-small sensor for dumbbells and barbells tracking biomechanics and movement path.',
        },
        joinBeta: 'JOIN BETA WAITLIST',
      },
    },
    appExperience: {
      title: 'Train. Earn. Compete.',
      features: {
        tracking: 'Automatic workout tracking',
        rewards: 'Sweat Drops rewards',
        leaderboards: 'Leaderboards',
        challenges: 'Challenges',
      },
    },
    whyItMatters: {
      title: 'Why It Matters',
      moreVisits: {
        title: 'More Visits',
        description: 'Members return more frequently when workouts are rewarding.',
      },
      moreRevenue: {
        title: 'More Revenue',
        description: 'Increased retention and engagement drive higher lifetime value.',
      },
      moreInsight: {
        title: 'More Insight',
        description: 'Real-time data on equipment usage and member behavior.',
      },
    },
    adminPanel: {
      title: 'Admin Panel',
      subtitle: 'Complete control over your gym\'s digital experience.',
      features: {
        dashboard: 'Real-time dashboard',
        analytics: 'Member analytics',
        rewards: 'Reward management',
        challenges: 'Challenge creation',
        branding: 'Custom branding for mobile app',
      },
    },
    futureVision: {
      title: 'This is just the beginning.',
      roadmap: [
        'AI-powered workout plans',
        'Personal trainer marketplace',
        'Advanced analytics suite',
      ],
    },
    pilotSection: {
      title: 'Start with a Smart Zone.',
      description: 'Test SweatDrop in a dedicated area of your gym. 90-day pilot program. Zero commitment.',
      cta: 'Request Demo',
    },
    problem: {
      badge: 'The Problem',
      title: 'The Hidden Cost of',
      titleHighlight: 'Member Churn',
      subtitle: 'Every member who leaves is money walking out the door. But there are deeper problems eating your revenue.',
      churn: {
        stat: 'Churn Rate',
        description: 'Members quit because they don\'t see progress. Without engagement, they have no reason to stay—and every reason to cancel.',
      },
      trainers: {
        stat: 'No Control',
        description: 'Freelance trainers work with clients, but you have zero visibility. When they leave, clients leave with them—and you lose everything.',
      },
      data: {
        stat: 'No Data',
        description: 'You don\'t know which equipment makes money and which collects dust. You\'re making decisions based on guesswork, not real data.',
      },
      monetization: {
        stat: 'Limited Revenue',
        description: 'Your only income stream is membership fees. Personal training is too expensive for most members, leaving money on the table.',
      },
      cost: {
        title: 'The Cost of Doing Nothing',
        description: 'While you wait, your competitors are winning. Every day without digitalization is another day of lost revenue, uncontrolled trainers, and blind decision-making. The question isn\'t whether you can afford to implement Smart-Gym—it\'s whether you can afford not to.',
      },
    },
    dropCounter: {
      label: 'Drops Earned Today',
      global: 'Global',
    },
    features: {
      title: 'Built for Performance',
      subtitle: 'Technology that keeps up with your intensity',
      realtime: {
        title: 'Real-time Sync',
        description: 'Every rep tracked instantly. No delays, no gaps. Pure performance data.',
      },
      leaderboards: {
        title: 'Global Leaderboards',
        description: 'Compete with the world. See where you rank among the elite.',
      },
      badges: {
        title: 'Badge System',
        description: 'Unlock achievements. Build your legacy. Show what you\'re made of.',
      },
    },
    hardware: {
      title: 'Plug-and-Play Sensors',
      subtitle: 'Universal sensors that work with your existing equipment. No modifications needed.',
      cardio: {
        title: 'Cardio Zone',
        status: 'Active',
        description: 'IoT rotation sensors for indoor cycling, magnetic pulse sync for treadmills, flywheel trackers for rowing machines. Mounts in minutes, tracks intensity and distance automatically.',
      },
      strength: {
        title: 'Strength Zone',
        status: 'Coming Soon',
        description: 'Smart modules (like carabiners or smart pins) that recognize weight and count reps. Non-invasive attachment, works with free weights and machines.',
      },
    },
    why: {
      title: 'Why Sweat Drop Works',
      subtitle: 'The Psychology of Gamification',
      description: 'Traditional fitness apps rely on willpower. Sweat Drop taps into something deeper: the human drive for achievement, recognition, and progress. Every drop earned is a micro-win. Every leaderboard position is validation. Every badge is proof. This isn\'t just tracking—it\'s transformation. For gym owners, this psychology translates directly to business results: engaged members visit more often, stay longer, and become brand advocates.',
    },
    coverage: {
      title: 'Sensor Coverage Matrix',
      subtitle: 'Complete equipment support roadmap',
      equipment: 'Equipment',
      technology: 'Technology',
      status: 'Status',
      active: 'Active',
      comingSoon: 'Coming Soon',
      rnd: 'R&D Phase',
    },
    smartcoach: {
      subtitle: 'AI-powered personal trainer that adapts workout plans to member goals',
      headline: 'The Future of Personalized Training',
      features: [
        { title: 'AI Analysis', desc: 'Analyzes member performance patterns' },
        { title: 'Adaptive Plans', desc: 'Adjusts to member progress automatically' },
        { title: 'Predictive Optimization', desc: 'Predicts optimal training moments' },
      ],
    },
    solution: {
      title: 'The Solution',
      titleHighlight: 'Plug-and-Play Digitalization',
      subtitle: 'Transform your existing gym into a Smart-Gym ecosystem. No new equipment needed—just universal sensors that integrate everything with a mobile app.',
      hook: 'Every Liter of Sweat = Digital Currency',
      description: 'Non-invasive sensors mount in minutes. No drilling, no damage, no modifications. As soon as a member approaches equipment, their phone recognizes it, activates tracking, and automatically logs results. Your gym becomes the first digitized fitness chain in the Balkans.',
    },
    monetization: {
      badge: 'Monetization',
      title: '4 Revenue Streams',
      titleHighlight: 'Beyond Membership Fees',
      subtitle: 'Stop relying solely on membership fees. Generate passive income, control trainers, increase retention, and earn from brand partnerships.',
      smartcoach: {
        title: 'SmartCoach',
        subtitle: 'Passive Income - Scalable Digital Sales',
        description: 'Most members can\'t afford personal trainers (€150+). Offer SmartCoach subscriptions for a fraction of that price (e.g., +€10/month). Members get digital plans, sensors track compliance. You sell one digital product to thousands simultaneously—zero labor costs.',
        revenue: 'Passive Revenue',
      },
      freelance: {
        title: 'Freelance Trainers',
        subtitle: 'Commission Income - Control & Revenue',
        description: 'Gain complete visibility into what freelance trainers do with clients. Trainers get tools, you get a percentage of every session and full control. Most importantly: data stays tied to your location. If a trainer leaves, you can immediately offer another trainer who takes over seamlessly.',
        revenue: 'Commission Revenue',
      },
      retention: {
        title: 'Retention & Loyalty',
        subtitle: 'Indirect Income - Lock-in Effect',
        description: 'Gamification turns every calorie and every rep into "Sweat Drops." Members use points to pay for supplements at the bar or get discounts on membership. This creates a powerful lock-in effect—members won\'t switch gyms because they\'d lose their accumulated progress and digital wallet.',
        revenue: 'Retention Revenue',
      },
      marketplace: {
        title: 'Brand Marketplace',
        subtitle: 'B2B Income - Brand Partnerships',
        description: 'Your gym is no longer limited to your own bar. Through the app, brands (Pansport, Proteini.si, Decathlon, etc.) offer exclusive discounts to members spending "Sweat Drops." Your profit: commission on every purchase or fixed fees from brands for access to your active member base.',
        revenue: 'B2B Revenue',
      },
      summary: {
        title: 'Multiple Revenue Streams, One Platform',
        description: 'Transform your gym from a single-revenue business into a multi-stream ecosystem. Generate income while you sleep, control what you couldn\'t see, and turn engagement into profit.',
      },
    },
    analytics: {
      title: 'Data-Driven Management',
      subtitle: 'Stop guessing. Start knowing. Make decisions based on real data, not staff estimates.',
      heatmap: {
        title: 'Heat-Map Reports',
        subtitle: 'See exactly which equipment makes money and which collects dust',
        description: 'Get precise visual reports showing equipment usage, revenue per machine, and member engagement patterns. No more relying on staff estimates about capacity. Know exactly which equipment drives value and which takes up space.',
      },
      usage: {
        title: 'Usage Analytics',
        description: 'Track real-time equipment usage. See peak hours, popular machines, and underutilized zones. Optimize your layout based on actual member behavior.',
      },
      optimization: {
        title: 'Smart Optimization',
        description: 'Use data to plan future equipment investments intelligently. Remove underperforming machines, add what members actually want, and maximize space efficiency.',
      },
      revenue: {
        title: 'Revenue Per Machine',
        description: 'Understand which equipment generates the most engagement and retention. Focus your resources on what actually drives member satisfaction and revenue.',
      },
    },
    businessValue: {
      title: 'Strategic Advantages',
      subtitle: 'Transform your gym into a data-driven, multi-revenue business',
      retention: {
        title: 'Increase Retention',
        description: 'Gamified workouts keep members engaged longer. Sweat Drops create a lock-in effect—members won\'t switch gyms because they\'d lose their accumulated progress and digital wallet.',
      },
      engagement: {
        title: 'Boost Engagement',
        description: 'Real-time tracking and instant gratification drive more frequent visits. Members see their progress immediately, creating the motivation that keeps them coming back.',
      },
      competitive: {
        title: 'Market Leadership',
        description: 'Become the first digitized fitness chain in the Balkans. While competitors compete on price, you compete on technology and innovation. Attract higher-paying clients who value efficiency and digital tracking.',
      },
      data: {
        title: 'Data-Driven Management',
        description: 'Get precise heat-map reports showing which equipment makes money and which collects dust. Make decisions based on real data, not guesswork. Optimize equipment layout and plan future investments intelligently.',
      },
    },
    pilot: {
      badge: 'Pilot Program',
      title: 'Start with One Smart Zone',
      subtitle: 'Test Smart-Gym in one zone for 90 days. No commitment. See real member interest and conversion rates.',
      duration: {
        title: '90-Day Test Period',
        description: 'One Smart Zone equipped for 90 days. Test real member interest, engagement, and conversion to SmartCoach subscriptions.',
      },
      commitment: {
        title: 'Zero Commitment',
        description: 'If results don\'t justify the investment, we remove everything. No long-term contracts, no hidden fees, no risk.',
      },
      testing: {
        title: 'Real Data Collection',
        description: 'Measure actual member interest, SmartCoach conversion rates, and engagement patterns. Make informed decisions based on real data, not projections.',
      },
      results: {
        title: 'Results-Driven Decision',
        description: 'After 90 days, you decide. If it works, expand. If it doesn\'t, we remove everything. Simple, transparent, risk-free.',
      },
      cta: {
        title: 'Ready to Test Smart-Gym?',
        description: 'Start with one zone. See real results. Make an informed decision. No commitment required.',
        button: 'Start 90-Day Pilot',
      },
    },
    cta: {
      title: 'Transform Your Gym. Start the Pilot.',
      subtitle: 'Test Smart-Gym in one zone for 90 days. No commitment. See real member interest and conversion rates.',
      button: 'Start Pilot Program',
      buttonSecondary: 'Schedule Demo',
    },
  },
  sr: {
    hero: {
      title: 'Tvoji Članovi Odlaze',
      titleHighlight: 'Evo Kako da Zaustaviš',
      subtitle: '47% članova teretane napusti u roku od 6 meseci. Sweat Drop pretvara svaki trening u igru—držeći članove angažovanim, motivisanim i vraćajući ih nazad.',
      cta: 'Izračunaj ROI',
      ctaSecondary: 'Vidi Kako Radi',
    },
    heroMinimal: {
      subtitle: 'IoT Platforma za Moderne Teretane.',
      description: 'Transformiši svoju opremu u povezana iskustva. Povećaj zadržavanje. Povećaj prihod.',
      ctaPrimary: 'Zatraži Demo',
      ctaSecondary: 'Prijavi se za Pilot',
    },
    whatIsSweatDrop: {
      title: 'Šta je SweatDrop',
      description: 'IoT senzori i mobilna aplikacija koja transformiše opremu tvoje teretane u povezana, gejmifikovana iskustva.\n\nČlanovi zarađuju nagrade. Ti dobijaš uvid.',
    },
    requestDemo: {
      title: 'Zatraži Demo',
      submit: 'Pošalji Zahtev',
      cancel: 'Otkaži',
      close: 'Zatvori',
      success: 'Kontaktiraćemo vas u roku od 24 sata.',
      fields: {
        fullName: 'Ime i Prezime',
        gymName: 'Naziv Teretane',
        email: 'Email',
        phone: 'Telefon',
        locations: 'Broj Lokacija',
        message: 'Poruka',
      },
      locations: {
        one: '1',
        twoToFive: '2-5',
        fivePlus: '5+',
      },
      errors: {
        required: 'Ovo polje je obavezno',
        email: 'Unesite validnu email adresu',
      },
    },
    applyPilot: {
      title: 'Prijavi se za Pilot',
      submit: 'Prijavi se za Pilot',
      cancel: 'Otkaži',
      close: 'Zatvori',
      success: 'Prijava primljena. Naš tim će pregledati i odgovoriti uskoro.',
      fields: {
        fullName: 'Ime i Prezime',
        gymName: 'Naziv Teretane',
        cityCountry: 'Grad / Država',
        activeMembers: 'Broj Aktivnih Članova',
        cardioMachines: 'Broj Kardio Mašina',
        multipleLocations: 'Da li imate više lokacija?',
        whyJoin: 'Zašto želite da se pridružite pilot programu?',
      },
      multipleLocations: {
        yes: 'Da',
        no: 'Ne',
      },
      errors: {
        required: 'Ovo polje je obavezno',
        number: 'Unesite validan broj',
      },
    },
    smartCardioSensors: {
      title: 'Pametni Kardio Senzori',
      subtitle: 'Neinvazivni senzori koji se montiraju na postojeću opremu. Nisu potrebne modifikacije.',
      cardioEcosystem: {
        title: 'Smart Cardio Ekosistem',
        subtitle: 'Neinvazivno, Bez modifikacija',
      },
      futureResistance: {
        title: 'Budućnost Otpora',
        subtitle: 'Uskoro',
        smartPin: {
          name: 'Smart Pin',
          description: 'Senzor koji zamenjuje standardne osigurače, prati ponavljanja i otpor.',
        },
        smartCarabiner: {
          name: 'Smart Carabiner',
          description: 'Inteligentni karabiner za sprave sa sajlama koji meri tenziju i ponavljanja.',
        },
        universalMotion: {
          name: 'Universal Motion Sensor',
          description: 'Ultra-mali senzor za bućice i šipke koji prati biomehaniku i putanju pokreta.',
        },
        joinBeta: 'PRIJAVI SE ZA BETA',
      },
    },
    appExperience: {
      title: 'Vežbaj. Zarađuj. Takmiči se.',
      features: {
        tracking: 'Automatsko praćenje treninga',
        rewards: 'Sweat Drops nagrade',
        leaderboards: 'Rang liste',
        challenges: 'Izazovi',
      },
    },
    whyItMatters: {
      title: 'Zašto je Važno',
      moreVisits: {
        title: 'Više Poseta',
        description: 'Članovi se vraćaju češće kada su treninzi nagrađeni.',
      },
      moreRevenue: {
        title: 'Više Prihoda',
        description: 'Povećano zadržavanje i angažovanje pokreću veću životnu vrednost članova.',
      },
      moreInsight: {
        title: 'Više Uvida',
        description: 'Podaci u realnom vremenu o korišćenju opreme i ponašanju članova.',
      },
    },
    adminPanel: {
      title: 'Admin Panel',
      subtitle: 'Potpuna kontrola nad digitalnim iskustvom tvoje teretane.',
      features: {
        dashboard: 'Dashboard u realnom vremenu',
        analytics: 'Analitika članova',
        rewards: 'Upravljanje nagradama',
        challenges: 'Kreiranje izazova',
        branding: 'Prilagođavanje brendinga (boje, logo, pozadina) za mobilnu aplikaciju',
      },
    },
    futureVision: {
      title: 'Ovo je tek početak.',
      roadmap: [
        'AI planovi treninga',
        'Marketplace ličnih trenera',
        'Napredna analitika',
      ],
    },
    pilotSection: {
      title: 'Počni sa Smart Zonom.',
      description: 'Testiraj SweatDrop u određenom delu tvoje teretane. 90-dnevni pilot program. Bez obaveza.',
      cta: 'Zatraži Demo',
    },
    problem: {
      badge: 'Problem',
      title: 'Skriveni Trošak',
      titleHighlight: 'Odlaska Članova',
      subtitle: 'Svaki član koji ode je novac koji izlazi kroz vrata. Ali postoje dublji problemi koji jedu tvoj prihod.',
      churn: {
        stat: 'Stopa Odlaska',
        description: 'Članovi odustaju jer ne vide napredak. Bez angažovanja, nemaju razlog da ostanu—i svaki razlog da otkažu.',
      },
      trainers: {
        stat: 'Bez Kontrole',
        description: 'Freelance treneri rade sa klijentima, ali ti nemaš nikakav uvid. Kada odu, klijenti idu sa njima—i ti gubiš sve.',
      },
      data: {
        stat: 'Bez Podataka',
        description: 'Ne znaš koja oprema donosi novac, a koja skuplja prašinu. Donosiš odluke na osnovu nagađanja, ne stvarnih podataka.',
      },
      monetization: {
        stat: 'Ograničen Prihod',
        description: 'Tvoj jedini izvor prihoda su članarine. Lični treninzi su preskupi za većinu članova, ostavljajući novac na stolu.',
      },
      cost: {
        title: 'Trošak Nečinjenja Ničega',
        description: 'Dok čekaš, tvoji konkurenti pobedjuju. Svaki dan bez digitalizacije je još jedan dan izgubljenog prihoda, nekontrolisanih trenera i slepih odluka. Pitanje nije da li možeš sebi da priuštiš implementaciju Smart-Gym-a—već da li možeš sebi da priuštiš da ne implementiraš.',
      },
    },
    dropCounter: {
      label: 'Kapi Zarađeno Danas',
      global: 'Globalno',
    },
    features: {
      title: 'Napravljeno za Performanse',
      subtitle: 'Tehnologija koja drži korak sa tvojim intenzitetom',
      realtime: {
        title: 'Sinhronizacija u Realnom Vremenu',
        description: 'Svako ponavljanje praćeno trenutno. Bez kašnjenja, bez praznina. Čisti podaci o performansama.',
      },
      leaderboards: {
        title: 'Globalne Rang Liste',
        description: 'Takmiči se sa svetom. Vidi gde se nalaziš među elitom.',
      },
      badges: {
        title: 'Sistem Badžova',
        description: 'Otključaj dostignuća. Izgradi svoju ostavštinu. Pokaži od čega si napravljen.',
      },
    },
    hardware: {
      title: 'Plug-and-Play Senzori',
      subtitle: 'Univerzalni senzori koji rade sa tvojom postojećom opremom. Nisu potrebne modifikacije.',
      cardio: {
        title: 'Kardio Zona',
        status: 'Aktivan',
        description: 'IoT rotacioni senzori za bicikle, magnetska sinhronizacija za trake, senzori za veslačke mašine. Montira se za nekoliko minuta, automatski prati intenzitet i pređeni put.',
      },
      strength: {
        title: 'Zona Snage',
        status: 'Uskoro',
        description: 'Pametni moduli (kao karabineri ili smart pinovi) koji prepoznaju težinu i broje ponavljanja. Neinvazivno pričvršćivanje, radi sa slobodnim tegovima i mašinama.',
      },
    },
    why: {
      title: 'Zašto Sweat Drop Radi',
      subtitle: 'Psihologija Gejmifikacije',
      description: 'Tradicionalne fitnes aplikacije se oslanjaju na volju. Sweat Drop koristi nešto dublje: ljudsku potrebu za dostignućem, priznanjem i napretkom. Svaka zarađena kap je mikro-pobeda. Svaka pozicija na rang listi je validacija. Svaki badž je dokaz. Ovo nije samo praćenje—ovo je transformacija.',
    },
    coverage: {
      title: 'Matrica Pokrivenosti Senzora',
      subtitle: 'Kompletan plan podrške opreme',
      equipment: 'Oprema',
      technology: 'Tehnologija',
      status: 'Status',
      active: 'Aktivan',
      comingSoon: 'Uskoro',
      rnd: 'Faza Istraživanja',
    },
    smartcoach: {
      subtitle: 'AI-powered lični trener koji prilagođava planove treninga ciljevima članova',
      headline: 'Budućnost Personalizovanog Treninga',
      features: [
        { title: 'AI Analiza', desc: 'Analizira obrasce performansi članova' },
        { title: 'Adaptivni Planovi', desc: 'Automatski se prilagođava napretku člana' },
        { title: 'Prediktivna Optimizacija', desc: 'Predviđa optimalne trenutke za trening' },
      ],
    },
    solution: {
      title: 'Rešenje',
      titleHighlight: 'Plug-and-Play Digitalizacija',
      subtitle: 'Transformiši svoju postojeću teretanu u Smart-Gym ekosistem. Nije potrebna nova oprema—samo univerzalni senzori koji integrišu sve sa mobilnom aplikacijom.',
      hook: 'Svaki Lit Znoja = Digitalna Valuta',
      description: 'Neinvazivni senzori se montiraju za nekoliko minuta. Bez bušenja, bez oštećenja, bez modifikacija. Čim član priđe spravi, telefon ga prepoznaje, aktivira praćenje i automatski upisuje rezultate. Tvoja teretana postaje prvi digitalizovani fitnes lanac na Balkanu.',
    },
    monetization: {
      badge: 'Monetizacija',
      title: '4 Izvora Prihoda',
      titleHighlight: 'Osim Članarina',
      subtitle: 'Prestani da se oslanjaš samo na članarine. Generiši pasivan prihod, kontroliši trenere, povećaj zadržavanje i zarađuj od partnerskih brendova.',
      smartcoach: {
        title: 'SmartCoach',
        subtitle: 'Pasivan Prihod - Skalabilna Digitalna Prodaja',
        description: 'Većina članova ne može da priušti ličnog trenera (€150+). Ponudi SmartCoach pretplate za delić te cene (npr. +€10/mesec). Članovi dobijaju digitalne planove, senzori prate da li ih sprovode. Prodaješ jedan digitalni proizvod hiljadama ljudi istovremeno—bez troškova radne snage.',
        revenue: 'Pasivan Prihod',
      },
      freelance: {
        title: 'Freelance Treneri',
        subtitle: 'Provizioni Prihod - Kontrola i Prihod',
        description: 'Dobij potpunu vidljivost u to šta freelance treneri rade sa klijentima. Treneri dobijaju alate, ti dobijaš procenat od svakog treninga i potpunu kontrolu. Najvažnije: podaci ostaju vezani za tvoju lokaciju. Ako trener ode, možeš odmah da ponudiš drugog trenera koji preuzima bez prekida.',
        revenue: 'Provizioni Prihod',
      },
      retention: {
        title: 'Zadržavanje i Lojalnost',
        subtitle: 'Indirektan Prihod - Lock-in Efekat',
        description: 'Gejmifikacija pretvara svaku kaloriju i svako ponavljanje u "Sweat Drops." Članovi koriste poene da plate suplemente na šanku ili dobiju popust na sledeću članarinu. Ovo stvara snažan lock-in efekat—članovi neće preći u drugu teretanu jer bi izgubili svoj akumulirani progres i digitalni novčanik.',
        revenue: 'Prihod od Zadržavanja',
      },
      marketplace: {
        title: 'Brand Marketplace',
        subtitle: 'B2B Prihod - Partnerski Brendovi',
        description: 'Tvoja teretana više nije ograničena samo na sopstveni šank. Kroz aplikaciju, brendovi (Pansport, Proteini.si, Decathlon, itd) nude ekskluzivne popuste članovima koji troše svoje "Sweat Drops." Tvoj profit: provizija od svake realizovane kupovine ili fiksna naknada od brendova za pristup tvojoj bazi aktivnih vežbača.',
        revenue: 'B2B Prihod',
      },
      summary: {
        title: 'Više Izvora Prihoda, Jedna Platforma',
        description: 'Transformiši svoju teretanu iz biznisa sa jednim izvorom prihoda u ekosistem sa više tokova. Generiši prihod dok spavaš, kontroliši ono što nisi mogao da vidiš, i pretvori angažovanost u profit.',
      },
    },
    analytics: {
      title: 'Menadžment Baziran na Podacima',
      subtitle: 'Prestani da nagađaš. Počni da znaš. Donosi odluke na osnovu stvarnih podataka, ne procena osoblja.',
      heatmap: {
        title: 'Heat-Map Izveštaji',
        subtitle: 'Vidi tačno koja oprema donosi novac, a koja skuplja prašinu',
        description: 'Dobij precizne vizuelne izveštaje koji pokazuju korišćenje opreme, prihod po mašini i obrasce angažovanja članova. Više se ne oslanjaj na procene osoblja o popunjenosti. Znaj tačno koja oprema pokreće vrednost, a koja zauzima prostor.',
      },
      usage: {
        title: 'Analitika Korišćenja',
        description: 'Prati korišćenje opreme u realnom vremenu. Vidi špiceve, popularne mašine i nedovoljno korišćene zone. Optimizuj raspored na osnovu stvarnog ponašanja članova.',
      },
      optimization: {
        title: 'Pametna Optimizacija',
        description: 'Koristi podatke da inteligentno planiraš buduće investicije u opremu. Ukloni mašine koje ne performiraju, dodaj ono što članovi stvarno žele, i maksimizuj efikasnost prostora.',
      },
      revenue: {
        title: 'Prihod po Mašini',
        description: 'Razumi koja oprema generiše najviše angažovanja i zadržavanja. Fokusiraj resurse na ono što stvarno pokreće zadovoljstvo članova i prihod.',
      },
    },
    businessValue: {
      title: 'Strateške Prednosti',
      subtitle: 'Transformiši svoju teretanu u biznis baziran na podacima sa više izvora prihoda',
      retention: {
        title: 'Povećaj Zadržavanje',
        description: 'Gejmifikovani treningovi drže članove angažovanim duže. Sweat Drops stvaraju lock-in efekat—članovi neće preći u drugu teretanu jer bi izgubili svoj akumulirani progres i digitalni novčanik.',
      },
      engagement: {
        title: 'Povećaj Angažovanost',
        description: 'Praćenje u realnom vremenu i trenutna gratifikacija pokreću češće posete. Članovi vide svoj napredak trenutno, stvarajući motivaciju koja ih vraća nazad.',
      },
      competitive: {
        title: 'Tržišno Liderstvo',
        description: 'Postani prvi digitalizovani fitnes lanac na Balkanu. Dok se konkurenti takmiče cenom, ti se takmičiš tehnologijom i inovacijama. Privuci klijente veće platežne moći koji vrednuju efikasnost i digitalno praćenje.',
      },
      data: {
        title: 'Menadžment Baziran na Podacima',
        description: 'Dobij precizne heat-map izveštaje koji pokazuju koja oprema donosi novac, a koja skuplja prašinu. Donosi odluke na osnovu stvarnih podataka, ne nagađanja. Optimizuj raspored opreme i planiraj buduće investicije inteligentno.',
      },
    },
    pilot: {
      badge: 'Pilot Program',
      title: 'Počni sa Jednom Smart Zonom',
      subtitle: 'Testiraj Smart-Gym u jednoj zoni 90 dana. Bez obaveza. Vidi stvarno interesovanje članova i stope konverzije.',
      duration: {
        title: '90-Dnevni Test Period',
        description: 'Jedna Smart Zona opremljena 90 dana. Testiraj stvarno interesovanje članova, angažovanost i konverziju u SmartCoach pretplate.',
      },
      commitment: {
        title: 'Nula Obaveza',
        description: 'Ako rezultati ne opravdaju investiciju, uklanjamo sve. Bez dugoročnih ugovora, bez skrivenih troškova, bez rizika.',
      },
      testing: {
        title: 'Prikupijanje Stvarnih Podataka',
        description: 'Meraj stvarno interesovanje članova, stope konverzije SmartCoach-a i obrasce angažovanja. Donosi informisane odluke na osnovu stvarnih podataka, ne projekcija.',
      },
      results: {
        title: 'Odluka Bazirana na Rezultatima',
        description: 'Nakon 90 dana, ti odlučuješ. Ako radi, proširi. Ako ne radi, uklanjamo sve. Jednostavno, transparentno, bez rizika.',
      },
      cta: {
        title: 'Spremni da Testiraš Smart-Gym?',
        description: 'Počni sa jednom zonom. Vidi stvarne rezultate. Donesi informisanu odluku. Nije potrebna obaveza.',
        button: 'Pokreni 90-Dnevni Pilot',
      },
    },
    cta: {
      title: 'Transformiši Svoju Teretanu. Pokreni Pilot.',
      subtitle: 'Testiraj Smart-Gym u jednoj zoni 90 dana. Bez obaveza. Vidi stvarno interesovanje članova i stope konverzije.',
      button: 'Pokreni Pilot Program',
      buttonSecondary: 'Zakaži Demo',
    },
  },
} as const;

export type TranslationKey = keyof typeof translations.en;
