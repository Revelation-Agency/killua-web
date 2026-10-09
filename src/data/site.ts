/**
 * Facts and copy for the Killua Energy marketing site and the /go/ ad pages.
 *
 * The A2P compliance pages (/solar/, /roofing/, /recruiting/, /maintenance/ and
 * their privacy, terms and sms pages) read src/data/company.ts and are not
 * touched by anything here. Keep it that way: those pages are what the texting
 * approval was filed against.
 *
 * Every claim below is either a fact Killua has on record (license, address,
 * phone, services, service area) or a general fact about California energy that
 * can be checked (PG&E's 4 to 9 PM peak, the Net Billing Tariff, the end of the
 * homeowner federal solar credit). No reviews, counts, years, offers or
 * warranty terms appear until Taj confirms them.
 */

export const site = {
  brand: 'Killua Energy',
  legalName: 'Killua Energy Inc.',
  license: 'CSLB #1096633',
  licenseNumber: '1096633',
  licenseUrl:
    'https://www.cslb.ca.gov/OnlineServices/CheckLicenseII/LicenseDetail.aspx?LicNum=1096633',
  street: '2224 N Fine Ave #105',
  cityLine: 'Fresno, CA 93727',
  mapUrl: 'https://maps.google.com/?q=2224+N+Fine+Ave+%23105,+Fresno,+CA+93727',
  phone: '(559) 691-4028',
  phoneHref: 'tel:+15596914028',
  email: 'info@killuaenergy.com',
  emailHref: 'mailto:info@killuaenergy.com',
} as const;

export const cities = [
  'Fresno',
  'Clovis',
  'Visalia',
  'Merced',
  'Lemoore',
  'Exeter',
  'Los Banos',
  'Manteca',
  'Bakersfield',
] as const;

/** Values the form sends as `service`. Lane 2 maps these to pipelines. */
export type ServiceKey =
  | 'solar_installation'
  | 'battery_storage'
  | 'solar_repair'
  | 'roof_replacement'
  | 'roof_repair'
  | 'roof_inspection'
  | 'ev_charger';

/** Which follow-up question the form asks for a service. */
export type FollowUp = 'bill' | 'roof_age' | 'problem' | 'ev';

/** Which A2P texting program covers a service, for the consent links. */
export type TextingBrand = 'solar' | 'roofing';

export interface ServiceMeta {
  key: ServiceKey;
  label: string;
  short: string;
  path: string;
  followUp: FollowUp;
  texting: TextingBrand;
}

export const services: readonly ServiceMeta[] = [
  {
    key: 'solar_installation',
    label: 'Solar installation',
    short: 'Panels designed from a year of your PG&E usage and the roof you have.',
    path: '/solar-installation/',
    followUp: 'bill',
    texting: 'solar',
  },
  {
    key: 'battery_storage',
    label: 'Battery storage',
    short: 'Store the noon sun for the 4 to 9 PM peak and for outages.',
    path: '/battery-storage/',
    followUp: 'bill',
    texting: 'solar',
  },
  {
    key: 'solar_repair',
    label: 'Solar repair',
    short: 'We fix and maintain systems other companies installed, including ones whose installer closed.',
    path: '/solar-repair/',
    followUp: 'problem',
    texting: 'solar',
  },
  {
    key: 'roof_replacement',
    label: 'Roof replacement',
    short: 'Comp shingle and tile roofs, with the solar taken off and put back if you have it.',
    path: '/roof-replacement/',
    followUp: 'roof_age',
    texting: 'roofing',
  },
  {
    key: 'roof_repair',
    label: 'Roof repair',
    short: 'Leaks, cracked tiles, lifted shingles and flashing, found and fixed.',
    path: '/roof-repair/',
    followUp: 'problem',
    texting: 'roofing',
  },
  {
    key: 'roof_inspection',
    label: 'Roof inspection',
    short: 'A written look at your roof before the rains or before you add solar.',
    path: '/roof-inspection/',
    followUp: 'roof_age',
    texting: 'roofing',
  },
  {
    key: 'ev_charger',
    label: 'EV charger',
    short: 'A Level 2 charger on its own circuit, checked against your electrical panel.',
    path: '/ev-chargers/',
    followUp: 'ev',
    texting: 'solar',
  },
];

export const serviceByKey = Object.fromEntries(services.map((s) => [s.key, s])) as Record<
  ServiceKey,
  ServiceMeta
>;

export const nav = [
  {
    label: 'Solar',
    items: ['solar_installation', 'battery_storage', 'solar_repair'] as ServiceKey[],
  },
  {
    label: 'Roofing',
    items: ['roof_replacement', 'roof_repair', 'roof_inspection'] as ServiceKey[],
  },
] as const;

export const navLinks = [
  { label: 'EV chargers', href: '/ev-chargers/' },
  { label: 'About', href: '/about/' },
  { label: 'Contact', href: '/contact/' },
] as const;

/** The consent sentence shown beside the checkbox. Sent verbatim with the lead. */
export const consentSentence =
  'I agree to receive calls and text messages from Killua Energy at the number I gave, about my estimate, appointments and project, including messages sent by automated technology. Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for help. Consent is not a condition of purchase.';

export interface Faq {
  q: string;
  a: string;
}

export interface Block {
  title: string;
  body: string;
}

export interface ServicePage {
  key: ServiceKey;
  title: string;
  description: string;
  eyebrow: string;
  h1: string;
  lede: string;
  photo: string;
  photoAlt: string;
  includedTitle: string;
  included: Block[];
  explainTitle: string;
  explain: string[];
  faqs: Faq[];
  related: ServiceKey[];
  rays?: boolean;
}

export const taxCreditFaq: Faq = {
  q: 'Is there still a federal tax credit for home solar?',
  a: 'No. The 30% federal credit for homeowners who buy solar or batteries ended for systems installed after December 31, 2025. Some websites still advertise it. Our estimates leave it out.',
};

export const servicePages: Record<ServiceKey, ServicePage> = {
  solar_installation: {
    key: 'solar_installation',
    title: 'Solar Installation in Fresno and the Central Valley | Killua Energy',
    description:
      'Solar panels designed from a year of your PG&E usage and your roof. Licensed Fresno contractor, CSLB #1096633. Call (559) 691-4028.',
    eyebrow: 'Solar installation',
    h1: 'Solar sized to your PG&E bill, not to a sales quota',
    lede: 'We read a year of your PG&E usage, look at your roof, and design a system for the house you live in. Then we handle the permit, the install and the PG&E paperwork.',
    photo: 'solar-home',
    photoAlt: 'Single-story stucco home in Fresno with rows of black solar panels on the roof in afternoon sun',
    includedTitle: 'What the job covers',
    included: [
      {
        title: 'Design from your real usage',
        body: 'Twelve months of PG&E data tells us how much power the house uses and when. The panel count comes from that.',
      },
      {
        title: 'A roof check first',
        body: 'Panels last decades. If the roof under them needs work soon, you should know before anything gets bolted down.',
      },
      {
        title: 'Permit and inspection',
        body: 'We pull the permit with your city or county and meet the inspector on site.',
      },
      {
        title: 'PG&E interconnection',
        body: 'We file the application so PG&E gives the system permission to operate.',
      },
    ],
    explainTitle: 'Solar in 2026 is a different math problem',
    explain: [
      'Two things changed. In April 2023 California moved new solar customers to the Net Billing Tariff, often called NEM 3.0. PG&E now pays far less for the power your panels send back to the grid than it charges you for power you pull from it.',
      'Then the 30% federal credit for homeowners ended on December 31, 2025.',
      'Solar can still cut a Central Valley bill, because the sun here is strong and PG&E rates are high. The design has to change, though. Panels sized to cover the daytime load, often paired with a battery for the evening, beat a big array that mostly exports power for pennies.',
    ],
    faqs: [
      taxCreditFaq,
      {
        q: 'Do I need a battery with solar now?',
        a: 'Not always. Under NEM 3.0 a battery lets you use your own power during the 4 to 9 PM peak instead of selling it cheap at noon. We price it both ways so you can compare.',
      },
      {
        q: 'What if my roof is old?',
        a: 'Taking panels off later to re-roof costs money. If your roof is near the end of its life, we will tell you, and we can quote the roof and the solar together.',
      },
      {
        q: 'Which areas do you cover?',
        a: 'Fresno, Clovis, Visalia, Merced, Lemoore, Exeter, Los Banos, Manteca, Bakersfield and the towns between them.',
      },
    ],
    related: ['battery_storage', 'roof_inspection', 'solar_repair'],
    rays: true,
  },
  battery_storage: {
    key: 'battery_storage',
    title: 'Home Battery Storage in Fresno | Killua Energy',
    description:
      'Store your solar power for the 4 to 9 PM PG&E peak and for power shutoffs. Licensed Fresno contractor, CSLB #1096633.',
    eyebrow: 'Battery storage',
    h1: 'Keep the noon sun for the 4 to 9 PM peak',
    lede: 'A home battery charges from your panels during the day and runs the house through PG&E’s evening peak. Set up for backup, it can keep the essentials on when the grid goes down.',
    photo: 'battery-garage',
    photoAlt: 'Two wall-mounted home battery units and an inverter on a clean garage wall',
    includedTitle: 'What the job covers',
    included: [
      {
        title: 'Load check',
        body: 'We look at what you want running in an outage, such as the fridge, the lights, the Wi-Fi and the well pump, and size the battery to it.',
      },
      {
        title: 'Works with your solar',
        body: 'New system or one you already own. We check that the inverter and battery can work together before we quote.',
      },
      {
        title: 'Backup panel wiring',
        body: 'The circuits you choose get moved to a backup panel so they stay on when PG&E is off.',
      },
      {
        title: 'Permit, inspection, PG&E',
        body: 'Same as solar: we handle the permit and the inspection, then file the PG&E paperwork.',
      },
    ],
    explainTitle: 'Why batteries matter more after NEM 3.0',
    explain: [
      'On most PG&E time-of-use plans, power costs the most from 4 to 9 PM. That is exactly when solar output drops off.',
      'Under the Net Billing Tariff, power you send to the grid at noon earns little. Power you store at noon and use at 6 PM saves you the peak price instead.',
      'PG&E also turns off power to some areas during high fire-risk weather. A battery wired to a backup panel keeps the circuits you picked running until the lines come back.',
    ],
    faqs: [
      taxCreditFaq,
      {
        q: 'Can I add a battery to the solar I already have?',
        a: 'Usually, yes. It depends on your inverter and when the system was approved by PG&E. We check both before giving you a price.',
      },
      {
        q: 'Will a battery run my whole house?',
        a: 'It can, if it is sized for it. Most people choose the circuits that matter during an outage, which keeps the cost down.',
      },
    ],
    related: ['solar_installation', 'solar_repair', 'ev_charger'],
  },
  solar_repair: {
    key: 'solar_repair',
    title: 'Solar Repair and Maintenance in Fresno | Killua Energy',
    description:
      'Installer went out of business? We repair and maintain solar systems other companies installed. Licensed Fresno contractor, CSLB #1096633.',
    eyebrow: 'Solar repair',
    h1: 'Your installer went out of business. Your solar still needs care.',
    lede: 'We repair and maintain systems no matter who put them in: dead inverters, offline monitoring, damaged panels, and leaks around roof mounts.',
    photo: 'solar-repair',
    photoAlt: 'Technician’s gloved hands testing solar panel connectors with a meter on a rooftop',
    includedTitle: 'What we check and fix',
    included: [
      {
        title: 'Inverter faults',
        body: 'Error codes, a dead unit, or one that trips off on hot afternoons. We diagnose it and repair or replace it.',
      },
      {
        title: 'Monitoring that went dark',
        body: 'Often the system is fine and the app lost its connection. Sometimes it is not fine, and the app is how you would have known.',
      },
      {
        title: 'Damaged panels and wiring',
        body: 'Cracked glass, chewed wires, loose connectors and burned junction boxes.',
      },
      {
        title: 'Leaks around mounts',
        body: 'We work on roofs as well as panels, so a leak at a roof attachment gets fixed by the same company.',
      },
    ],
    explainTitle: 'Signs your system needs a look',
    explain: [
      'Your PG&E bill crept back up and nothing at home changed.',
      'The monitoring app shows zero, shows an error, or stopped updating months ago.',
      'You see a stain on a ceiling under the array, or hear birds or squirrels under the panels.',
      'The company that installed it no longer answers the phone.',
    ],
    faqs: [
      {
        q: 'Do you work on systems another company installed?',
        a: 'Yes, including systems whose installer closed or stopped answering. We start with a diagnostic visit and tell you what we find.',
      },
      {
        q: 'Is my old warranty still good?',
        a: 'Panel and inverter manufacturers often honor their own warranties even if the installer is gone. We will check what still applies to yours.',
      },
      {
        q: 'Do you offer ongoing maintenance?',
        a: 'Ask us on the call. We will tell you what we recommend for your system and what it costs.',
      },
    ],
    related: ['battery_storage', 'roof_repair', 'solar_installation'],
  },
  roof_replacement: {
    key: 'roof_replacement',
    title: 'Roof Replacement in Fresno and the Central Valley | Killua Energy',
    description:
      'Comp shingle and tile roof replacement. If you have solar, we take it off and put it back. Licensed Fresno contractor, CSLB #1096633.',
    eyebrow: 'Roof replacement',
    h1: 'A new roof, and the solar put back on top of it',
    lede: 'We replace comp shingle and tile roofs on Central Valley homes. If panels are already up there, the same company takes them off and puts them back.',
    photo: 'roof-install',
    photoAlt: 'Roofing crew laying new comp shingles on a single-story home',
    includedTitle: 'What the job covers',
    included: [
      {
        title: 'Tear-off and deck check',
        body: 'Old roofing comes off so we can see the wood underneath and replace any soft or rotted sheathing.',
      },
      {
        title: 'Underlayment and flashing',
        body: 'New underlayment, and new flashing at walls, vents and valleys, where most leaks start.',
      },
      {
        title: 'Shingle or tile',
        body: 'Comp shingle or concrete tile, matched to your house and budget.',
      },
      {
        title: 'Solar off and back on',
        body: 'If you have panels, one company handles both trades, so nobody blames the other for a leak.',
      },
    ],
    explainTitle: 'Thinking about solar too?',
    explain: [
      'Panels sit on a roof for decades. Putting them on a roof that needs replacing in a few years means paying to take them off and put them back later.',
      'If both are on your list, doing the roof first and the solar right after costs less than doing them years apart.',
    ],
    faqs: [
      {
        q: 'How do I know if I need a new roof or a repair?',
        a: 'Start with an inspection. We tell you what we see, with photos, and whether a repair buys you real time.',
      },
      {
        q: 'Do you work on tile roofs?',
        a: 'Yes. We work on concrete tile and comp shingle roofs.',
      },
      taxCreditFaq,
    ],
    related: ['roof_inspection', 'roof_repair', 'solar_installation'],
  },
  roof_repair: {
    key: 'roof_repair',
    title: 'Roof Repair in Fresno | Killua Energy',
    description:
      'Roof leaks, cracked tiles, lifted shingles and flashing repairs across the Central Valley. Licensed Fresno contractor, CSLB #1096633.',
    eyebrow: 'Roof repair',
    h1: 'Fix the leak before the rain finds it',
    lede: 'Cracked tiles, lifted shingles, worn flashing and leaks around vents or solar mounts. We find the cause and fix it.',
    photo: 'roof-repair',
    photoAlt: 'Gloved hands replacing a cracked concrete roof tile',
    includedTitle: 'Common repairs',
    included: [
      {
        title: 'Cracked or slipped tiles',
        body: 'Summer heat and foot traffic crack concrete tiles. We replace the broken ones and check the underlayment beneath.',
      },
      {
        title: 'Lifted or missing shingles',
        body: 'Wind lifts old shingles and opens a path for water. We replace and seal them.',
      },
      {
        title: 'Flashing and vents',
        body: 'Where the roof meets a wall, a chimney or a pipe is where most leaks start.',
      },
      {
        title: 'Leaks around solar mounts',
        body: 'We work on both the roof and the panels, so we can fix a leak at a solar attachment properly.',
      },
    ],
    explainTitle: 'Why fall is the time to call',
    explain: [
      'Rain in the Central Valley mostly falls between November and March. A small leak you never notice in August shows up as a ceiling stain in December.',
      'Repairs are quicker to schedule before the first storm than after it, when every roofer in town is busy.',
    ],
    faqs: [
      {
        q: 'Can you fix a leak under my solar panels?',
        a: 'Yes. We do roofing and solar, so we can lift what needs lifting, fix the leak and put it back.',
      },
      {
        q: 'Will you tell me if I need a new roof instead?',
        a: 'Yes. If a repair will not hold, we will say so, show you why, and quote both.',
      },
    ],
    related: ['roof_inspection', 'roof_replacement', 'solar_repair'],
  },
  roof_inspection: {
    key: 'roof_inspection',
    title: 'Roof Inspection in Fresno and the Central Valley | Killua Energy',
    description:
      'Roof inspections before the rains, before you sell, or before you add solar. Licensed Fresno contractor, CSLB #1096633.',
    eyebrow: 'Roof inspection',
    h1: 'Know what your roof needs before the rains',
    lede: 'We walk the roof, check the flashing and the attic side, and show you photos of what we find.',
    photo: 'roof-inspection',
    photoAlt: 'Roofer on a ladder checking the eave and gutter of a stucco home',
    includedTitle: 'What we look at',
    included: [
      {
        title: 'Surface',
        body: 'Cracked tiles, worn or lifted shingles, granule loss and soft spots.',
      },
      {
        title: 'Flashing and penetrations',
        body: 'Everywhere something meets or passes through the roof: walls, chimneys, vents, skylights, solar mounts.',
      },
      {
        title: 'Gutters and drainage',
        body: 'Where the water goes when it finally rains.',
      },
      {
        title: 'Photos and a plain answer',
        body: 'You get photos and our honest read: fine for now, needs a repair, or due for replacement.',
      },
    ],
    explainTitle: 'Good times to get one',
    explain: [
      'Before the first storm of the season, usually by November in the Valley.',
      'Before adding solar, so the panels go on a roof that will outlast them.',
      'Before buying or selling a home, or after a windstorm.',
    ],
    faqs: [
      {
        q: 'Do you inspect roofs that already have solar?',
        a: 'Yes. We check the roof around and under the array, and the mounts themselves.',
      },
      taxCreditFaq,
    ],
    related: ['roof_repair', 'roof_replacement', 'solar_installation'],
  },
  ev_charger: {
    key: 'ev_charger',
    title: 'EV Charger Installation in Fresno | Killua Energy',
    description:
      'Level 2 EV charger installation, checked against your electrical panel. Licensed Fresno contractor, CSLB #1096633.',
    eyebrow: 'EV chargers',
    h1: 'Charge the car overnight in your own garage',
    lede: 'We install Level 2 chargers on their own circuit, after checking that your electrical panel can carry the load.',
    photo: 'ev-charger',
    photoAlt: 'Wall-mounted EV charger plugged into an electric car in a tidy garage',
    includedTitle: 'What the job covers',
    included: [
      {
        title: 'Panel check',
        body: 'Many older Valley homes have 100 or 125 amp panels. We check yours before we promise anything.',
      },
      {
        title: 'Dedicated circuit',
        body: 'A new breaker and wire run to the charger location, in the garage or outside.',
      },
      {
        title: 'Any make of car',
        body: 'We install the charger you choose, or help you pick one that fits your car and your panel.',
      },
      {
        title: 'Garage or outside',
        body: 'Mounted in the garage or on the outside wall nearest where you park.',
      },
    ],
    explainTitle: 'Charging and your PG&E bill',
    explain: [
      'PG&E’s time-of-use plans make overnight power cheaper than the 4 to 9 PM peak. Most chargers let you schedule charging for the cheap hours.',
      'PG&E has offered EV rebates and special EV rate plans. Programs change often, so ask us what applies when we talk.',
    ],
    faqs: [
      {
        q: 'Is there still a federal tax credit for home EV chargers?',
        a: 'No. The federal credit for home chargers ended on June 30, 2026. Ask us about current PG&E programs instead.',
      },
      {
        q: 'Do I need a panel upgrade?',
        a: 'Sometimes. It depends on your panel size and what else runs on it. We check before quoting.',
      },
    ],
    related: ['solar_installation', 'battery_storage', 'roof_inspection'],
  },
};

/** /go/ ad landing pages. */
export interface GoPage {
  slug: string;
  channel: 'meta' | 'tiktok' | 'any';
  service: ServiceKey;
  title: string;
  h1: string;
  lede: string;
  points: Block[];
  faqs: Faq[];
  photo?: string;
  photoAlt?: string;
  short?: boolean;
}

export const goPages: GoPage[] = [
  {
    slug: 'solar-savings',
    channel: 'meta',
    service: 'solar_installation',
    title: 'See What Solar Would Do to Your PG&E Bill | Killua Energy',
    h1: 'See what solar would do to your PG&E bill',
    lede: 'Four quick questions. A Fresno installer calls you with numbers for your house, worked out for 2026.',
    points: [
      {
        title: 'Numbers without the old tax credit',
        body: 'The federal homeowner solar credit ended December 31, 2025. We leave it out of every estimate.',
      },
      {
        title: 'Sized for NEM 3.0',
        body: 'Under PG&E’s current solar billing plan, credit for power sent to the grid varies by the hour and sits far below what you pay for grid power. We size panels to the power your home uses, not the biggest system that fits.',
      },
      {
        title: 'Roof checked first',
        body: 'We do roofing too. If yours needs work before panels go on, you hear it from us before you sign.',
      },
    ],
    faqs: [
      taxCreditFaq,
      {
        q: 'What happens after I send this?',
        a: 'Someone from our Fresno office calls you, usually at the time you picked, to ask about your bill and set up a visit if it makes sense.',
      },
    ],
    photo: 'solar-home',
    photoAlt: 'Fresno stucco home with solar panels in afternoon sun',
  },
  {
    slug: 'solar-battery',
    channel: 'meta',
    service: 'battery_storage',
    title: 'Solar and Battery for the 4 to 9 PM Peak and Power Shutoffs | Killua Energy',
    h1: 'Keep the lights on through the 4 to 9 PM peak and the next shutoff',
    lede: 'Solar with a battery stores the noon sun for PG&E’s most expensive hours and for outages.',
    points: [
      {
        title: 'The peak is when the sun quits',
        body: 'On most PG&E time-of-use plans, 4 to 9 PM costs the most. A battery covers those hours with power you made at noon.',
      },
      {
        title: 'Backup when PG&E shuts off',
        body: 'Set up for backup, a battery keeps the circuits you choose, like the fridge, lights and Wi-Fi, running through outages and fire-weather shutoffs until it runs down.',
      },
      {
        title: 'Add to solar you already have',
        body: 'Existing systems can often take a battery. We check your inverter and your PG&E plan first.',
      },
    ],
    faqs: [
      taxCreditFaq,
      {
        q: 'What happens after I send this?',
        a: 'Someone from our Fresno office calls you to ask about your home and your bill, then sets up a visit if it makes sense.',
      },
    ],
    photo: 'battery-garage',
    photoAlt: 'Home battery units mounted on a garage wall',
  },
  {
    slug: 'solar-tt',
    channel: 'tiktok',
    service: 'solar_installation',
    title: 'Fresno Solar Estimate | Killua Energy',
    h1: 'Fresno sun. Smaller PG&E bill.',
    lede: 'Tap through four questions. We call with real numbers.',
    points: [
      {
        title: 'Local',
        body: 'Office on N Fine Ave in Fresno. CSLB #1096633.',
      },
      {
        title: 'Honest math',
        body: 'No federal tax credit in the numbers. It ended in 2025.',
      },
    ],
    faqs: [],
    short: true,
  },
  {
    slug: 'solar-repair',
    channel: 'meta',
    service: 'solar_repair',
    title: 'Solar Repair When Your Installer Is Gone | Killua Energy',
    h1: 'Installer disappeared? We fix and maintain your system.',
    lede: 'Dead inverter, blank monitoring app, or a bill that crept back up. We repair solar systems other companies installed.',
    points: [
      {
        title: 'Any installer’s system',
        body: 'We diagnose and repair systems no matter who put them in, including companies that closed.',
      },
      {
        title: 'Roof and panels, one company',
        body: 'A leak at a mount is a roofing problem and a solar problem. We handle both.',
      },
      {
        title: 'Warranty help',
        body: 'Manufacturers often still honor panel and inverter warranties when the installer is gone. We help you check.',
      },
    ],
    faqs: [
      {
        q: 'What does the first visit involve?',
        a: 'We test the system, check the inverter and monitoring, and look at the roof around the array. Then we tell you what we found and what fixing it costs.',
      },
    ],
    photo: 'solar-repair',
    photoAlt: 'Technician testing solar panel wiring on a roof',
  },
  {
    slug: 'ev-charger',
    channel: 'any',
    service: 'ev_charger',
    title: 'Home EV Charger Installation in Fresno | Killua Energy',
    h1: 'Charge your EV at home, overnight',
    lede: 'We check your electrical panel, run a dedicated circuit and install a Level 2 charger. On a PG&E time-of-use plan, overnight power costs less than the evening peak.',
    points: [
      {
        title: 'Panel checked first',
        body: 'Older Valley homes often have small panels. We check yours before quoting.',
      },
      {
        title: 'Any make of car',
        body: 'Bring the charger you want, or we help you choose one.',
      },
      {
        title: 'Overnight rates',
        body: 'Schedule charging for the hours your PG&E time-of-use plan prices lowest.',
      },
    ],
    faqs: [
      {
        q: 'Is there still a federal tax credit for home chargers?',
        a: 'No. It ended on June 30, 2026. Ask us about current PG&E programs.',
      },
    ],
    photo: 'ev-charger',
    photoAlt: 'EV charger plugged into a car in a garage',
  },
  {
    slug: 'roofing',
    channel: 'any',
    service: 'roof_inspection',
    title: 'Roof Check Before the Rains | Killua Energy',
    h1: 'Get your roof checked before the rains',
    lede: 'Inspection, repair or replacement for Central Valley homes, from a Fresno contractor that also does solar.',
    points: [
      {
        title: 'Photos, not guesses',
        body: 'You see what we see, and we tell you if a repair will hold or if it is time for a new roof.',
      },
      {
        title: 'Tile and comp shingle',
        body: 'We repair and replace both.',
      },
      {
        title: 'Solar on the roof? Fine.',
        body: 'We work on both, so panels come off and go back on without a second contractor.',
      },
    ],
    faqs: [
      {
        q: 'What if I need a repair, not an inspection?',
        a: 'Pick roof repair or replacement in the first question. We send the right person either way.',
      },
    ],
    photo: 'roof-inspection',
    photoAlt: 'Roofer inspecting the eave of a stucco home',
  },
];
