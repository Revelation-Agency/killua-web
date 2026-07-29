/**
 * Single source of truth for every company fact rendered on this site.
 *
 * Anything a carrier reviewer can read on a page comes from this file. Nothing
 * here may be a placeholder. If a value is unknown, the page section that would
 * have used it is removed instead of being stubbed out.
 */

export const company = {
  legalName: 'Killua Energy Inc.',
  shortName: 'Killua Energy',
  street: '2224 N Fine Ave #105',
  city: 'Fresno',
  state: 'CA',
  stateFull: 'California',
  zip: '93727',
  addressFull: '2224 N Fine Ave #105, Fresno, CA 93727',
  phone: '(559) 314-6376',
  phoneHref: 'tel:+15593146376',
  altPhone: '(559) 691-4028',
  altPhoneHref: 'tel:+15596914028',
  email: 'info@killuaenergy.com',
  emailHref: 'mailto:info@killuaenergy.com',
  marketingSite: 'killuaenergy.com',
  governingLaw: 'State of California',
  /**
   * Effective date printed at the top of every Privacy Policy and Terms page.
   * Change this one string to re-date all eight policy pages at once.
   */
  effectiveDate: 'July 29, 2026',
} as const;

export const serviceAreas = [
  {
    areaCode: '559',
    label: 'Fresno and the central San Joaquin Valley',
  },
  {
    areaCode: '209',
    label: 'Stockton, Modesto and the northern San Joaquin Valley',
  },
  {
    areaCode: '661',
    label: 'Bakersfield, the southern valley and the Antelope Valley',
  },
] as const;

export interface Brand {
  /** URL segment, e.g. "solar" renders to /solar/ */
  slug: string;
  /** Full public brand name */
  name: string;
  /** Bare division word used inside sentences, e.g. "solar" */
  word: string;
  /** One line under the h1 on the brand page */
  tagline: string;
  /** Sentence completing "Killua Solar provides ..." */
  provides: string;
  /** Full sentence describing the division, used on the home page card */
  summary: string;
  /** Who this brand sends text messages to. Mirrors the A2P use case exactly. */
  audience: string;
  /** Business audience paragraph on the brand overview page. */
  whoWeServe: string;
  /** Verbatim message purpose from the A2P submission. Reused in every consent string. */
  messagePurpose: string;
  /** Sentence-cased message purpose for the disclosure tables. */
  messageTypes: string;
  /** A2P campaign / program name shown in the program details table. */
  programName: string;
  /** Business phone on file for this brand's A2P brand registration. */
  phone: string;
  phoneHref: string;
  /** Bulleted services on the brand one-pager. */
  services: readonly string[];
  /** Privacy section 1: what contact information we collect. */
  contactInfoLine: string;
  /** Privacy section 1: what service or application details we collect. */
  serviceDetailsLine: string;
  /** Privacy section 2: the brand specific reason we use the information. */
  primaryUseLine: string;
  /** Privacy section 2: the brand specific delivery reason. */
  deliveryUseLine: string;
  /** Privacy section 5: how long we keep records and why. */
  retentionLine: string;
  /** Terms section 1: what is expressly not being offered on the site. */
  notAnOfferLine: string;
  /** How a person comes to give consent in the first place. */
  consentOrigin: string;
  /**
   * POST target for this brand's opt-in form.
   *
   * TODO(blaine): GHL form endpoint. Paste the GoHighLevel inbound webhook or
   * form-submit URL for this sub-account between the quotes. While the string is
   * empty the form runs in local mode: it validates every field, requires the
   * consent checkbox, shows the success panel, and logs the payload to the
   * console without making any network request.
   */
  optInEndpoint: string;
}

export const brands: readonly Brand[] = [
  {
    slug: 'solar',
    name: 'Killua Solar',
    word: 'solar',
    tagline: 'Residential and commercial solar energy systems.',
    provides:
      'designs, installs and services residential and commercial solar energy systems',
    summary:
      'Solar energy system design, installation and service for homes and commercial properties.',
    audience:
      'Homeowners and commercial property owners who request a quote',
    whoWeServe:
      'Homeowners and commercial property owners. We handle single family rooftops, multi unit properties, agricultural sites and commercial buildings. If you own the property, or you are authorized to make decisions about it, we can work with you.',
    messagePurpose:
      'solar consultation scheduling, quote follow-up, project status updates, appointment reminders, and customer care',
    messageTypes:
      'Solar consultation scheduling, quote follow-up, project status updates, appointment reminders, and customer care.',
    programName: 'Killua Solar Notifications',
    phone: '(559) 314-6376',
    phoneHref: 'tel:+15593146376',
    services: [
      'Residential rooftop and ground mount solar',
      'Commercial and agricultural solar arrays',
      'Battery storage and backup power',
      'System monitoring and production review',
      'Permitting, interconnection and inspection coordination',
    ],
    contactInfoLine:
      'Your name, mobile phone number, email address, and the service address of the property you are asking about.',
    serviceDetailsLine:
      'Information you give us about your property, your roof, your electrical service, your utility account and usage, and the scope of the project, including notes and measurements from calls and site visits.',
    primaryUseLine:
      'To prepare, send and follow up on solar consultations, quotes and proposals',
    deliveryUseLine:
      'To design, permit, install, inspect and service your solar energy system',
    retentionLine:
      'Project records, including design documents, permits, inspection results and warranty paperwork, are kept for as long as the equipment warranty runs and for as long as state licensing, tax and contractor record keeping rules require.',
    notAnOfferLine:
      'Nothing on this website is an offer, a contract, or a guarantee of price, availability, production, utility savings, or eligibility for any incentive, rebate or tax credit.',
    consentOrigin:
      'when you request a quote or consultation, or when you give consent in writing to a representative during a call or a site visit',
    optInEndpoint: '',
  },
  {
    slug: 'roofing',
    name: 'Killua Roofing',
    word: 'roofing',
    tagline: 'Residential and commercial roofing.',
    provides:
      'inspects, repairs and replaces residential and commercial roofing systems',
    summary:
      'Roof inspection, repair and replacement for homes and commercial properties.',
    audience:
      'Homeowners and commercial property owners who request an inspection or estimate',
    whoWeServe:
      'Homeowners and commercial property owners. We handle residential re-roofs and repairs, low slope and flat commercial systems, and condition inspections for owners, buyers, sellers, landlords and insurers.',
    messagePurpose:
      'roofing inspection scheduling, estimate follow-up, project status updates, appointment reminders, and customer care',
    messageTypes:
      'Roofing inspection scheduling, estimate follow-up, project status updates, appointment reminders, and customer care.',
    programName: 'Killua Roofing Notifications',
    phone: '(559) 691-4028',
    phoneHref: 'tel:+15596914028',
    services: [
      'Residential roof replacement and repair',
      'Commercial low slope and flat roofing',
      'Roof inspections and condition reports',
      'Leak detection and emergency repair',
      'Ventilation, flashing and gutter work',
    ],
    contactInfoLine:
      'Your name, mobile phone number, email address, and the service address of the property you are asking about.',
    serviceDetailsLine:
      'Information you give us about your property, the age and condition of the roof, the scope of the work, and any insurance or warranty claim involved, including notes, measurements and photographs from calls and site visits.',
    primaryUseLine:
      'To schedule inspections and to prepare, send and follow up on roofing estimates',
    deliveryUseLine:
      'To permit, perform, inspect and warranty the roofing work you hire us to do',
    retentionLine:
      'Project records, including estimates, photographs, permits, inspection results and warranty paperwork, are kept for as long as the workmanship and material warranties run and for as long as state licensing, tax and contractor record keeping rules require.',
    notAnOfferLine:
      'Nothing on this website is an offer, a contract, or a guarantee of price, availability, scheduling, insurance coverage, or claim approval.',
    consentOrigin:
      'when you request an inspection or estimate, or when you give consent in writing to a representative during a call or a site visit',
    optInEndpoint: '',
  },
  {
    slug: 'recruiting',
    name: 'Killua Recruiting',
    word: 'recruiting',
    tagline: 'Talent acquisition for the trades.',
    provides:
      'recruits, screens and hires skilled and entry level talent for the trades',
    summary:
      'Talent acquisition for the trades, from entry level field roles through licensed and supervisory positions.',
    audience: 'Job applicants who apply to a posted opening',
    whoWeServe:
      'People looking for work in the trades, and the Killua Energy divisions that hire them. We recruit for solar, roofing and service roles at every level, from apprentice and entry level field positions through licensed and supervisory work.',
    messagePurpose:
      'interview scheduling, application status updates, onboarding steps, appointment reminders, and candidate care',
    messageTypes:
      'Interview scheduling, application status updates, onboarding steps, appointment reminders, and candidate care.',
    programName: 'Killua Recruiting Notifications',
    phone: '(559) 691-4028',
    phoneHref: 'tel:+15596914028',
    services: [
      'Sourcing and screening for solar, roofing and service roles',
      'Interview scheduling and coordination',
      'Reference, license and certification verification',
      'Offer, onboarding and first week support',
      'Apprentice and entry level trade placement',
    ],
    contactInfoLine:
      'Your name, mobile phone number, email address, and your mailing address.',
    serviceDetailsLine:
      'Information you give us in an application or interview, including your work history, skills, certifications, licenses, driver record where a role requires driving, references, and your availability.',
    primaryUseLine:
      'To review your application and to schedule and coordinate interviews',
    deliveryUseLine:
      'To extend an offer and to walk you through onboarding if you are hired',
    retentionLine:
      'Application records are kept for as long as federal and California employment record keeping rules require, and longer if you are hired, in which case they become part of your employment file.',
    notAnOfferLine:
      'Nothing on this website is an offer of employment, a guarantee of an interview, a guarantee of pay or hours, or a promise that any particular opening is or will remain available.',
    consentOrigin:
      'when you apply to a posted opening, or when you give consent in writing to a recruiter during a call or an interview',
    optInEndpoint: '',
  },
  {
    slug: 'maintenance',
    name: 'Killua Maintenance',
    word: 'maintenance',
    tagline: 'Ongoing service and maintenance for solar and roofing systems.',
    provides:
      'provides ongoing service and maintenance for residential and commercial solar and roofing systems',
    summary:
      'Scheduled service, inspection and repair that keeps installed solar and roofing systems performing.',
    audience:
      'Existing customers and property owners under a service agreement',
    whoWeServe:
      'Residential and commercial property owners with an installed solar or roofing system, whether we installed it or another contractor did. Most of this work is performed under a service agreement or a warranty.',
    messagePurpose:
      'service visit scheduling, maintenance reminders, technician arrival notices, work order updates, and customer care',
    messageTypes:
      'Service visit scheduling, maintenance reminders, technician arrival notices, work order updates, and customer care.',
    programName: 'Killua Maintenance Notifications',
    phone: '(559) 691-4028',
    phoneHref: 'tel:+15596914028',
    services: [
      'Scheduled solar system inspection and cleaning',
      'Production monitoring and underperformance diagnosis',
      'Inverter, wiring and battery service',
      'Preventive roof maintenance and leak repair',
      'Work order dispatch under a service agreement',
    ],
    contactInfoLine:
      'Your name, mobile phone number, email address, and the service address covered by your agreement or work order.',
    serviceDetailsLine:
      'Information about the equipment at your property, its installation and service history, monitoring and production data where you have asked us to review it, and notes and photographs from service visits.',
    primaryUseLine:
      'To schedule service visits and to open, dispatch and close work orders',
    deliveryUseLine:
      'To perform maintenance and repairs and to honor your service agreement or warranty',
    retentionLine:
      'Service records, including work orders, technician notes, photographs and warranty paperwork, are kept for as long as the agreement or warranty runs and for as long as state licensing, tax and contractor record keeping rules require.',
    notAnOfferLine:
      'Nothing on this website is an offer, a contract, or a guarantee of price, response time, parts availability, or warranty coverage. Coverage is defined by your written service agreement or warranty.',
    consentOrigin:
      'when you request service or sign a service agreement, or when you give consent in writing to a representative during a call or a service visit',
    optInEndpoint: '',
  },
] as const;

export function getBrand(slug: string): Brand {
  const brand = brands.find((candidate) => candidate.slug === slug);
  if (!brand) {
    throw new Error(`Unknown brand slug: ${slug}`);
  }
  return brand;
}

/** Frequency disclosure. Identical wording on every page that needs it. */
export const FREQUENCY_DISCLOSURE =
  'Message frequency varies. You will typically receive no more than 4 to 6 messages per month.';

/** Cost disclosure. Required on every page that describes the SMS program. */
export const COST_DISCLOSURE = 'Message and data rates may apply.';

/** Carrier liability disclosure. */
export const CARRIER_DISCLOSURE =
  'Carriers are not liable for delayed or undelivered messages.';

/**
 * Mandatory A2P 10DLC no-sharing clause. Must appear verbatim, with no edits,
 * in every Privacy Policy and every Terms of Service page on this site.
 */
export const NO_SHARING_CLAUSE =
  'No mobile information will be shared with third parties or affiliates for marketing or promotional purposes. All the above categories exclude text messaging originator opt-in data and consent; this information will not be shared with any third parties.';

/** Builds the verbatim consent checkbox sentence for a brand. */
export function consentText(brand: Brand): string {
  return `By checking this box, I give my express written consent to receive text messages from ${brand.name} at the mobile number provided, including messages sent by automated technology, about ${brand.messagePurpose}. Message frequency varies. Message and data rates may apply. Reply STOP to unsubscribe or HELP for help. Consent is not a condition of purchase. See our Privacy Policy and Terms of Service.`;
}
