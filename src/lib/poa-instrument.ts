export type PoaConsentFlags = {
  legalCapacity: boolean;
  witnessingRequired: boolean;
  landRegistryRegistration: boolean;
  irrevocability: boolean;
};

export const POA_CONSENT_ITEMS: Array<{
  key: keyof PoaConsentFlags;
  label: string;
}> = [
  {
    key: "legalCapacity",
    label: "I confirm I am of full legal capacity to execute this document",
  },
  {
    key: "witnessingRequired",
    label: "I acknowledge this PoA will require independent witnessing to be legally binding",
  },
  {
    key: "landRegistryRegistration",
    label: "I agree to register this document at the relevant Land Registry within 60 days",
  },
  {
    key: "irrevocability",
    label: "I acknowledge this Power of Attorney is irrevocable once executed",
  },
];

export const POA_INSTRUMENT_SECTIONS = [
  {
    title: "Appointment",
    body: "I hereby irrevocably appoint SafeBuyRealties as my true and lawful attorney-in-fact to act on my behalf in connection with the acquisition and perfection of title to the property described in this transaction.",
  },
  {
    title: "Scope of Authority",
    body: "SafeBuyRealties is authorised to conduct due diligence and verification; process and perfect title documentation; apply for Governor's Consent and Certificate of Occupancy where applicable; pay statutory fees; receive, execute, and deliver documents; and take any ancillary steps reasonably required to complete the purchase.",
  },
  {
    title: "Revocation",
    body: "This Power of Attorney is irrevocable until completion of the transaction and registration of title in my name, or until released in writing by SafeBuyRealties following completion of all obligations under the transaction.",
  },
  {
    title: "Indemnity",
    body: "I agree to indemnify and hold harmless SafeBuyRealties, its officers, and agents against claims, losses, and expenses arising from actions taken in good faith pursuant to this instrument, except where caused by gross negligence or wilful misconduct.",
  },
  {
    title: "Legal Framework (Nigeria)",
    body: "This instrument is executed in accordance with the laws of the Federal Republic of Nigeria, including the Evidence Act 2011 and the Electronic Transactions Act 2023. Independent witnessing may be required for legal binding effect, and registration at the relevant Land Registry within 60 days remains my responsibility.",
  },
] as const;
