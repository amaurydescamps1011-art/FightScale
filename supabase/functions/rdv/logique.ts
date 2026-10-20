/* La prise de rendez-vous de monclubcombat.fr : toute la logique, et rien que
   la logique.

   Ce fichier ne touche ni a Deno, ni a Supabase, ni a Resend, ni a Google : il
   recoit une `Request`, un objet `Env` (les secrets qui changent le texte des
   reponses) et des `Deps` (la base, le courrier, l'agenda), et rend une
   `Response`. C'est `index.ts` qui branche les vrais services, et c'est
   `outils/tests/rdv.test.mjs` qui l'eprouve avec des services en memoire :
   Node 22 l'execute tel quel (`node --test outils/tests/rdv.test.mjs`).

   Les quatre routes (voir le contrat dans LISEZ-MOI.md) :
     GET  /disponibilites      -> les creneaux libres a venir, heure de Paris
     POST /reserver            -> enregistre, cree l'evenement Google, ecrit
     POST /annuler  (ou GET ?token=) -> annule, idempotent
     POST /rappels  (x-cron-secret)  -> envoie les rappels a moins d'une heure

   Les fuseaux horaires sont calcules a la main avec Intl.DateTimeFormat en
   Europe/Paris : aucune bibliotheque, et l'heure d'ete comme l'heure d'hiver
   sont eprouvees dans les tests. */

// ------------------------------------------------------------ les constantes

export const FUSEAU = 'Europe/Paris';
/** la duree d'un appel, en minutes */
export const DUREE_MIN = 15;
/** un creneau toutes les 30 min : xx:00 et xx:30 */
export const PAS_MIN = 30;
/** on ne propose rien a moins de 3 h */
export const DELAI_MIN_H = 3;
/** et rien au-dela de 14 jours */
export const HORIZON_JOURS = 14;
/** les plages ou Amaury prend des appels, heure de Paris ; un creneau doit
    tenir entierement dans la plage (un appel de 15 min a 12:30 finirait a
    12:45, hors plage : le dernier creneau du matin est donc 12:00) */
export const HORAIRES: ReadonlyArray<{ de: [number, number]; a: [number, number] }> = [
  { de: [9, 30], a: [12, 30] },
  { de: [14, 0], a: [18, 30] },
];
/** lundi a vendredi (0 = dimanche, comme Date#getUTCDay) */
export const JOURS_OUVRES: ReadonlyArray<number> = [1, 2, 3, 4, 5];

/** les limites anti-abus, sur 24 h glissantes */
export const LIMITE_PAR_EMAIL = 3;
export const LIMITE_PAR_IP = 10;
export const FENETRE_LIMITE_H = 24;

export const SITE_DEFAUT = 'https://monclubcombat.fr';
export const EXPEDITEUR = 'Mon Club Combat <rdv@monclubcombat.fr>';
export const NOTIFIE_DEFAUT = 'contact@monclubcombat.fr';

/** les origines qui ont le droit d'appeler la fonction depuis un navigateur ;
    `http://localhost:*` et `http://127.0.0.1:*` s'y ajoutent pour les tests */
export const ORIGINES_AUTORISEES: ReadonlyArray<string> = [
  'https://monclubcombat.fr',
  'https://www.monclubcombat.fr',
  'https://fight-scale.vercel.app',
];

// ------------------------------------------------------------ les textes
// Recopies de scratchpad/rdv-textes.json (plan de textes final) : on ne les
// reinvente pas ici. Les accolades sont remplies par `gabarit`.

export const TEXTES = {
  confirmation: {
    sujet: 'RDV confirmé · {date}',
    titre: 'Rendez-vous confirmé',
    intro: 'Merci {prenom}, nous avons hâte d’échanger avec vous. Au programme : votre salle, votre planning, votre secteur. Gardez votre planning de cours sous la main, c’est ce que nous regardons en premier.',
    bloc: 'Appel de 15 min · {date} · Format : {format}',
    bouton_meet: 'Rejoindre l’appel',
    telephone: 'Nous vous appelons au {tel}.',
    sans_lien: 'Nous vous envoyons le lien de visio avant l’appel.',
    rassure: 'Rien à commander pendant l’appel : nous vérifions, vous décidez après.',
    annuler: 'Un imprévu ? {lien_annulation} Pour le reporter, annulez puis réservez un nouveau créneau.',
    annuler_lien: 'Annuler le rendez-vous',
    pied: 'Mon Club Combat · monclubcombat.fr',
  },
  nouvelle_resa: {
    sujet: '📅 Nouvelle résa · {prenom} {nom} · {date}',
    titre: '{prenom} {nom} vient de réserver un appel.',
    corps: 'Qui : {prenom} {nom}\nQuand : {date} (heure de Paris)\nFormat : {format}\nClub : {club}\nVille : {ville}\nGérant : {situation}\nAdhérents : {discipline}\nAbonnement : {objectif}\nPrécisions : {projet}\nE-mail : {email}\nTéléphone : {telephone}\nSource : {source}',
    meet_absent: 'Lien Meet non créé : Google Agenda n’a pas répondu. Envoyez vous-même le lien de visio au gérant avant l’appel.',
  },
  rappel: {
    sujet: '⏰ Rappel : votre appel Mon Club Combat dans 1 h ({date})',
    titre: 'À tout à l’heure !',
    corps: 'Votre appel de 15 min avec Mon Club Combat commence dans 1 heure ({date}). Au programme : votre salle, votre planning, votre secteur. Gardez votre planning de cours sous la main.',
    bouton_meet: 'Rejoindre l’appel',
    telephone: 'Nous vous appelons au {tel}.',
  },
  annule_prospect: {
    sujet: 'RDV annulé · {date}',
    titre: 'Rendez-vous annulé',
    corps: 'Votre rendez-vous du {date} a bien été annulé. Un autre moment vous arrange ? Réservez un nouveau créneau, cela prend une minute.',
    bouton: 'Réserver un nouveau créneau',
  },
  annulation_amaury: {
    sujet: '❌ Annulation · {prenom} {nom} · {date}',
    titre: '{prenom} {nom} a annulé son appel.',
    corps: 'Le créneau du {date} est de nouveau libre.\nClub : {club}\nVille : {ville}\nE-mail : {email}\nTéléphone : {telephone}',
  },
  ics: {
    resume: 'Appel Mon Club Combat',
    description: 'Appel de 15 min avec Mon Club Combat : votre salle, votre planning, votre secteur. Un imprévu ? Annulez ici : {lien_annulation}',
  },
  /* le libelle du format, tel que l'ecran 3 le montre */
  format: { meet: 'Google Meet', telephone: 'Téléphone' },
  /* « Lien visio : {lien} », repris de l'ecran de succes, pour le mail d'Amaury */
  lien_visio: 'Lien visio : {lien}',
  /* ce qu'on ecrit a la place d'un champ vide dans le mail d'Amaury */
  vide: 'non renseigné',
} as const;

// ------------------------------------------------------------ les types

/** les secrets qui changent le comportement ; tous facultatifs */
export interface Env {
  /** l'adresse du site, pour les liens des e-mails (defaut SITE_DEFAUT) */
  SITE_URL?: string;
  /** qui recoit les notifications (defaut contact@monclubcombat.fr) */
  RDV_NOTIFIE?: string;
  /** le secret que pg_cron presente dans `x-cron-secret` */
  RDV_CRON_SECRET?: string;
  /** le sel du hash d'IP ; a defaut, RDV_CRON_SECRET sert de sel */
  RDV_SEL_IP?: string;
}

export type Format = 'meet' | 'telephone';
export type Statut = 'confirme' | 'annule' | 'honore' | 'absent';

/** une ligne de la table `rendez_vous` ; les dates sont des ISO 8601 UTC */
export interface Rdv {
  id: string;
  cree_le: string;
  debut: string;
  fin: string;
  prenom: string;
  nom: string;
  email: string;
  telephone: string | null;
  format: Format;
  club: string;
  ville: string;
  /* depuis le 20/10/2026, les trois questions de la page changent (Amaury) ;
     les colonnes gardent leur nom : discipline = nombre d'adherents,
     situation = gerant ou non, objectif = prix de l'abonnement */
  discipline: string;
  situation: string;
  objectif: string;
  projet: string | null;
  source: Record<string, string> | null;
  statut: Statut;
  token_annulation: string;
  evenement_google: string | null;
  lien_meet: string | null;
  rappel_envoye_le: string | null;
  annule_le: string | null;
  ip_hash: string | null;
}

/** ce que `Base.creer` recoit : la ligne complete, sans ce que la base pose */
export type NouveauRdv = Omit<Rdv, 'evenement_google' | 'lien_meet' | 'rappel_envoye_le' | 'annule_le'>;

/** la base de donnees, vue de la logique. `index.ts` la fait avec
    supabase-js et la cle service ; les tests, avec un tableau. */
export interface Base {
  /** les rendez-vous `confirme` dont le debut est dans [de, a[ */
  confirmesEntre(de: Date, a: Date): Promise<Array<Pick<Rdv, 'debut' | 'fin'>>>;
  /** insere ; leve `ErreurDoublon` si un `confirme` occupe deja ce debut */
  creer(rdv: NouveauRdv): Promise<Rdv>;
  parToken(token: string): Promise<Rdv | null>;
  /** passe `confirme` -> `annule` ; rend null si la ligne n'etait plus confirme */
  marqueAnnule(id: string, quand: Date): Promise<Rdv | null>;
  /** les `confirme` sans rappel dont le debut est dans ]de, a] */
  aRappeler(de: Date, a: Date): Promise<Rdv[]>;
  /** pose `rappel_envoye_le` si encore nul ; rend vrai si c'est cet appel qui l'a pose */
  marqueRappel(id: string, quand: Date): Promise<boolean>;
  /** remet `rappel_envoye_le` a nul (le mail n'est pas parti) */
  libereRappel(id: string): Promise<void>;
  /** combien de lignes creees depuis `depuis` portent cet e-mail / ce hash d'IP */
  compteRecents(email: string, ipHash: string | null, depuis: Date): Promise<{ parEmail: number; parIp: number }>;
  majGoogle(id: string, champs: { evenement_google: string | null; lien_meet: string | null }): Promise<void>;
}

/** levee par `Base.creer` quand la contrainte d'unicite refuse la ligne */
export class ErreurDoublon extends Error {
  constructor() { super('creneau deja pris'); this.name = 'ErreurDoublon'; }
}

export interface PieceJointe { nom: string; type: string; contenu: string }

export interface Courriel {
  /** sert aux tests et au serveur local pour nommer les fichiers */
  genre: 'confirmation' | 'nouvelle_resa' | 'rappel' | 'annule_prospect' | 'annulation_amaury';
  a: string[];
  repondre?: string;
  sujet: string;
  html: string;
  texte: string;
  pieces?: PieceJointe[];
}

export interface Courrier { envoie(c: Courriel): Promise<void> }

export interface EvenementAgenda {
  debut: Date;
  fin: Date;
  resume: string;
  description: string;
  /** l'e-mail du prospect, invite a l'evenement */
  invite: string;
  /** demander un lien Google Meet */
  meet: boolean;
}

export interface Google {
  /** les plages occupees de l'agenda entre `de` et `a` */
  occupes(de: Date, a: Date): Promise<Array<{ debut: Date; fin: Date }>>;
  creeEvenement(e: EvenementAgenda): Promise<{ id: string; lien_meet: string | null }>;
  supprimeEvenement(id: string): Promise<void>;
}

export type Niveau = 'info' | 'alerte' | 'erreur';

export interface Deps {
  base: Base;
  mail: Courrier;
  /** null quand les secrets Google manquent : tout marche quand meme */
  google: Google | null;
  /** l'horloge, remplacable dans les tests */
  maintenant?: () => Date;
  /** le journal ; ne recoit jamais de donnee personnelle */
  journal?: (niveau: Niveau, message: string, detail?: Record<string, unknown>) => void;
}

// ------------------------------------------------------------ l'heure de Paris

const PARTIES = new Intl.DateTimeFormat('en-US', {
  timeZone: FUSEAU, hourCycle: 'h23',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
});

export interface PartiesLocales {
  annee: number; mois: number; jour: number;
  heure: number; minute: number; seconde: number;
  /** 0 = dimanche ... 6 = samedi, du calendrier de Paris */
  jourSemaine: number;
}

/** l'heure murale de Paris pour un instant donne */
export function partiesParis(d: Date): PartiesLocales {
  const v: Record<string, number> = {};
  for (const p of PARTIES.formatToParts(d)) {
    if (p.type !== 'literal') v[p.type] = Number(p.value);
  }
  const jourSemaine = new Date(Date.UTC(v.year, v.month - 1, v.day)).getUTCDay();
  return { annee: v.year, mois: v.month, jour: v.day, heure: v.hour % 24,
           minute: v.minute, seconde: v.second, jourSemaine };
}

/** le decalage de Paris sur UTC a cet instant, en minutes (+60 l'hiver, +120 l'ete) */
export function decalageParis(d: Date): number {
  const p = partiesParis(d);
  const mur = Date.UTC(p.annee, p.mois - 1, p.jour, p.heure, p.minute, p.seconde);
  return Math.round((mur - d.getTime()) / 60000);
}

/** l'instant UTC qui correspond a une heure murale de Paris. Deux passes : on
    devine avec le decalage de l'instant « mur lu comme UTC », puis on verifie
    avec le decalage de l'instant trouve ; cela suffit tant qu'on ne vise pas
    l'heure fantome du changement d'heure (entre 2 h et 3 h du matin). */
export function instantParis(annee: number, mois: number, jour: number, heure: number, minute: number): Date {
  const mur = Date.UTC(annee, mois - 1, jour, heure, minute, 0);
  let t = mur - decalageParis(new Date(mur)) * 60000;
  t = mur - decalageParis(new Date(t)) * 60000;
  return new Date(t);
}

const JOURS_FR = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MOIS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet',
                 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const deux = (n: number) => String(n).padStart(2, '0');

/** « vendredi 25 septembre à 10:00 », heure de Paris */
export function dateFr(d: Date): string {
  const p = partiesParis(d);
  return `${JOURS_FR[p.jourSemaine]} ${p.jour} ${MOIS_FR[p.mois - 1]} à ${deux(p.heure)}:${deux(p.minute)}`;
}

// ------------------------------------------------------------ les creneaux

/** tous les creneaux ouverts entre maintenant + 3 h et maintenant + 14 jours,
    sans regarder la base ni l'agenda ; tries */
export function creneauxTheoriques(maintenant: Date): Date[] {
  const plancher = maintenant.getTime() + DELAI_MIN_H * 3600e3;
  const plafond = maintenant.getTime() + HORIZON_JOURS * 86400e3;
  const p = partiesParis(maintenant);
  const sortie: Date[] = [];
  for (let i = 0; i <= HORIZON_JOURS; i++) {
    /* le calendrier avance en UTC sur la date de Paris : c'est une simple
       addition de jours, sans heure, donc sans piege de changement d'heure */
    const j = new Date(Date.UTC(p.annee, p.mois - 1, p.jour + i));
    if (!JOURS_OUVRES.includes(j.getUTCDay())) continue;
    const [a, m, d] = [j.getUTCFullYear(), j.getUTCMonth() + 1, j.getUTCDate()];
    for (const plage of HORAIRES) {
      const finPlage = instantParis(a, m, d, plage.a[0], plage.a[1]).getTime();
      for (let min = plage.de[0] * 60 + plage.de[1]; ; min += PAS_MIN) {
        const debut = instantParis(a, m, d, Math.floor(min / 60), min % 60);
        if (debut.getTime() + DUREE_MIN * 60e3 > finPlage) break;
        if (debut.getTime() < plancher || debut.getTime() > plafond) continue;
        sortie.push(debut);
      }
    }
  }
  return sortie;
}

/** retire les creneaux qui chevauchent une plage occupee */
export function sansOccupes(creneaux: Date[], occupes: Array<{ debut: Date; fin: Date }>): Date[] {
  return creneaux.filter((c) => {
    const d = c.getTime(), f = d + DUREE_MIN * 60e3;
    return !occupes.some((o) => d < o.fin.getTime() && f > o.debut.getTime());
  });
}

async function creneauxLibres(deps: Deps, maintenant: Date): Promise<Date[]> {
  let creneaux = creneauxTheoriques(maintenant);
  const de = maintenant;
  const a = new Date(maintenant.getTime() + (HORIZON_JOURS + 1) * 86400e3);
  const pris = await deps.base.confirmesEntre(de, a);
  creneaux = sansOccupes(creneaux, pris.map((r) => ({ debut: new Date(r.debut), fin: new Date(r.fin) })));
  if (deps.google) {
    try {
      creneaux = sansOccupes(creneaux, await deps.google.occupes(de, a));
    } catch (e) {
      /* un agenda muet ne doit pas vider la page : on propose les creneaux
         calcules depuis la base, et on le note */
      deps.journal?.('alerte', 'google freebusy en echec', { message: messageDe(e) });
    }
  }
  return creneaux;
}

// ------------------------------------------------------------ l'iCalendar

function echappeIcs(t: string): string {
  return t.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** une valeur de parametre (CN=...) : RFC 5545 l'ecrit entre guillemets, sans
    guillemet, saut de ligne ni `; : ,` dedans (l'echappement TEXT par barre
    oblique inverse n'y vaut rien, Outlook refuse alors la piece jointe) */
function parametreIcs(t: string): string {
  return '"' + t.replace(/["\r\n;:,\\]+/g, ' ').replace(/\s+/g, ' ').trim() + '"';
}

const ENCODEUR = new TextEncoder();

/** plie une ligne a 75 octets, suite sur une ligne commencant par une espace */
export function plieIcs(ligne: string): string {
  if (ENCODEUR.encode(ligne).length <= 75) return ligne;
  const morceaux: string[] = [];
  let courant = '', max = 75;
  for (const ch of ligne) {
    if (ENCODEUR.encode(courant + ch).length > max) {
      morceaux.push(courant); courant = ch; max = 74;
    } else courant += ch;
  }
  morceaux.push(courant);
  return morceaux.join('\r\n ');
}

function dateIcs(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/** l'invitation jointe a la confirmation (METHOD:REQUEST, dates en UTC) */
export function ics(rdv: Rdv, env: Env, maintenant: Date): string {
  const lignes = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Mon Club Combat//Rendez-vous//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    'UID:' + rdv.id,
    'DTSTAMP:' + dateIcs(maintenant),
    'DTSTART:' + dateIcs(new Date(rdv.debut)),
    'DTEND:' + dateIcs(new Date(rdv.fin)),
    'SUMMARY:' + echappeIcs(TEXTES.ics.resume),
    'LOCATION:' + echappeIcs(rdv.lien_meet || TEXTES.format.telephone),
    'DESCRIPTION:' + echappeIcs(gabarit(TEXTES.ics.description, { lien_annulation: lienAnnulation(rdv, env) })),
    'ORGANIZER;CN="Mon Club Combat":mailto:rdv@monclubcombat.fr',
    `ATTENDEE;CN=${parametreIcs(rdv.prenom + ' ' + rdv.nom)};ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;RSVP=FALSE:mailto:${rdv.email}`,
    'STATUS:CONFIRMED',
    'SEQUENCE:0',
    'TRANSP:OPAQUE',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  if (rdv.lien_meet) lignes.splice(lignes.indexOf('STATUS:CONFIRMED'), 0, 'URL:' + rdv.lien_meet);
  return lignes.map(plieIcs).join('\r\n') + '\r\n';
}

// ------------------------------------------------------------ les e-mails

function gabarit(t: string, v: Record<string, string>): string {
  return t.replace(/\{(\w+)\}/g, (_, k) => (k in v ? v[k] : '{' + k + '}'));
}

export function htmlSur(t: string): string {
  return t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

function site(env: Env): string {
  return (env.SITE_URL || SITE_DEFAUT).replace(/\/+$/, '');
}

export function lienAnnulation(rdv: Pick<Rdv, 'token_annulation'>, env: Env): string {
  return site(env) + '/annuler?token=' + rdv.token_annulation;
}

function notifie(env: Env): string {
  return (env.RDV_NOTIFIE || NOTIFIE_DEFAUT).trim();
}

/* L'habit commun : une colonne, fond blanc, titre, texte 16 px, bouton rouge,
   pied « Mon Club Combat · monclubcombat.fr ». Du HTML de courrier, donc des
   styles en ligne et des tables, rien de plus. */
const ROUGE = '#DC1229';
const ENCRE = '#16160F';
const GRIS = '#6F6B66';
const POLICE = "Manrope, 'Segoe UI', Helvetica, Arial, sans-serif";

function para(html: string): string {
  return `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:${ENCRE}">${html}</p>`;
}
function bloc(html: string): string {
  return `<p style="margin:0 0 20px;padding:14px 16px;background:#F7F6F3;border-radius:12px;font-size:16px;line-height:1.5;color:${ENCRE};font-weight:700">${html}</p>`;
}
function bouton(libelle: string, lien: string): string {
  return `<p style="margin:0 0 24px"><a href="${htmlSur(lien)}" style="display:inline-block;background:${ROUGE};color:#FFFFFF;text-decoration:none;font-weight:700;font-size:16px;padding:13px 22px;border-radius:10px">${htmlSur(libelle)}</a></p>`;
}
function lien(libelle: string, href: string): string {
  return `<a href="${htmlSur(href)}" style="color:#BB0F22;font-weight:700">${htmlSur(libelle)}</a>`;
}
function tableau(lignes: Array<[string, string]>): string {
  const tr = lignes.map(([k, v]) =>
    `<tr><td style="padding:5px 14px 5px 0;color:${GRIS};vertical-align:top;white-space:nowrap">${htmlSur(k)}</td><td style="padding:5px 0;color:${ENCRE}">${v}</td></tr>`).join('');
  return `<table style="border-collapse:collapse;font-size:16px;line-height:1.5;margin:0 0 20px">${tr}</table>`;
}

/* Les lignes « Libelle : {champ} » du plan de textes, remplies champ par champ.
   On decoupe le GABARIT (de confiance), jamais le texte rendu : un saut de
   ligne glisse dans un champ par un visiteur ne peut donc pas fabriquer une
   ligne « E-mail : ... » de plus dans le mail d'Amaury. Seul `projet` garde
   ses sauts de ligne (<br> en HTML, retrait en texte brut). */
function lignesDe(corps: string, v: Record<string, string>): Array<[string, string]> {
  return corps.split('\n').map((l) => {
    const i = l.indexOf(' : ');
    return i < 0 ? ['', gabarit(l, v)] : [l.slice(0, i), gabarit(l.slice(i + 3), v)];
  });
}
function tableauHtml(lignes: Array<[string, string]>): string {
  return tableau(lignes.map(([k, val]) => [k, htmlSur(val).replace(/\n/g, '<br>')]));
}
function tableauTexte(lignes: Array<[string, string]>): string {
  return lignes.map(([k, val]) => (k ? k + ' : ' : '') + val.replace(/\n/g, '\n    ')).join('\n');
}

function cadre(titre: string, corps: string, env: Env): string {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${htmlSur(titre)}</title></head>`
    + `<body style="margin:0;padding:0;background:#FFFFFF">`
    + `<div style="max-width:560px;margin:0 auto;padding:32px 20px 28px;font-family:${POLICE};color:${ENCRE}">`
    + `<p style="margin:0 0 22px;font-size:13px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#EC162E">Mon Club Combat</p>`
    + `<h1 style="margin:0 0 18px;font-size:24px;line-height:1.25;font-weight:800;letter-spacing:-.01em">${htmlSur(titre)}</h1>`
    + corps
    + `<p style="margin:28px 0 0;padding-top:16px;border-top:1px solid #E8E5DF;font-size:13px;line-height:1.5;color:${GRIS}">`
    + `<a href="${htmlSur(site(env))}" style="color:${GRIS};text-decoration:none">${htmlSur(TEXTES.confirmation.pied)}</a></p>`
    + `</div></body></html>`;
}

function texteBrut(morceaux: Array<string | null | undefined>): string {
  return morceaux.filter((m): m is string => !!m).join('\n\n') + '\n\n' + TEXTES.confirmation.pied + '\n';
}

function libelleFormat(rdv: Pick<Rdv, 'format'>): string {
  return TEXTES.format[rdv.format];
}

function ou(v: string | null | undefined, sinon: string): string {
  return v && v.trim() ? v.trim() : sinon;
}

function sourceLisible(s: Record<string, string> | null): string {
  if (!s) return TEXTES.vide;
  const parts = ['utm_source', 'utm_campaign', 'utm_content'].map((k) => s[k]).filter(Boolean);
  return parts.length ? parts.join(' / ') : TEXTES.vide;
}

/** ce qu'on dit du lien : le bouton Meet, ou le telephone, ou « on vous l'enverra » */
function blocLien(rdv: Rdv, libelleBouton: string): { html: string; texte: string | null } {
  if (rdv.lien_meet) {
    return { html: bouton(libelleBouton, rdv.lien_meet), texte: libelleBouton + ' : ' + rdv.lien_meet };
  }
  if (rdv.format === 'telephone') {
    const t = gabarit(TEXTES.confirmation.telephone, { tel: ou(rdv.telephone, '') });
    return { html: para(htmlSur(t)), texte: t };
  }
  return { html: para(htmlSur(TEXTES.confirmation.sans_lien)), texte: TEXTES.confirmation.sans_lien };
}

export function mailConfirmation(rdv: Rdv, env: Env, maintenant: Date): Courriel {
  const T = TEXTES.confirmation;
  const date = dateFr(new Date(rdv.debut));
  const v = { date, prenom: rdv.prenom, format: libelleFormat(rdv), tel: ou(rdv.telephone, '') };
  const annul = lienAnnulation(rdv, env);
  const l = blocLien(rdv, T.bouton_meet);
  const html = cadre(T.titre,
    para(htmlSur(gabarit(T.intro, v)))
    + bloc(htmlSur(gabarit(T.bloc, v)))
    + l.html
    + para(htmlSur(T.rassure))
    + para(gabarit(htmlSur(T.annuler), { lien_annulation: lien(T.annuler_lien, annul) + '.' })),
    env);
  const texte = texteBrut([
    T.titre, gabarit(T.intro, v), gabarit(T.bloc, v), l.texte, T.rassure,
    gabarit(T.annuler, { lien_annulation: T.annuler_lien + ' : ' + annul + '\n' }).replace(/\n /g, '\n'),
  ]);
  return {
    genre: 'confirmation', a: [rdv.email], repondre: notifie(env),
    sujet: gabarit(T.sujet, v), html, texte,
    pieces: [{ nom: 'rendez-vous.ics', type: 'text/calendar; charset=utf-8; method=REQUEST', contenu: ics(rdv, env, maintenant) }],
  };
}

export function mailNouvelleResa(rdv: Rdv, env: Env, meetAbsent: boolean): Courriel {
  const T = TEXTES.nouvelle_resa;
  const v: Record<string, string> = {
    prenom: rdv.prenom, nom: rdv.nom, date: dateFr(new Date(rdv.debut)), format: libelleFormat(rdv),
    club: rdv.club, ville: rdv.ville, discipline: ou(rdv.discipline, TEXTES.vide),
    situation: ou(rdv.situation, TEXTES.vide), objectif: ou(rdv.objectif, TEXTES.vide),
    projet: ou(rdv.projet, TEXTES.vide), email: rdv.email, telephone: ou(rdv.telephone, TEXTES.vide),
    source: sourceLisible(rdv.source),
  };
  const lignes = lignesDe(T.corps, v);
  /* chaque valeur est echappee a part ; le lien Meet, lui, est un <a> cliquable */
  const paires = lignes.map(([k, val]) => [k, htmlSur(val).replace(/\n/g, '<br>')] as [string, string]);
  const extra: string[] = [];
  const extraTexte: string[] = [];
  if (rdv.lien_meet) {
    paires.push(['Lien visio', lien(rdv.lien_meet, rdv.lien_meet)]);
    extraTexte.push(gabarit(TEXTES.lien_visio, { lien: rdv.lien_meet }));
  }
  if (meetAbsent) {
    extra.push(`<p style="margin:0 0 16px;padding:12px 14px;border-left:4px solid ${ROUGE};font-size:16px;line-height:1.5;color:${ENCRE}"><b>${htmlSur(T.meet_absent)}</b></p>`);
    extraTexte.push(T.meet_absent);
  }
  const titre = gabarit(T.titre, v);
  return {
    genre: 'nouvelle_resa', a: [notifie(env)], repondre: rdv.email,
    sujet: gabarit(T.sujet, v),
    html: cadre(titre, tableau(paires) + extra.join(''), env),
    texte: texteBrut([titre, tableauTexte(lignes), ...extraTexte]),
  };
}

export function mailRappel(rdv: Rdv, env: Env): Courriel {
  const T = TEXTES.rappel;
  const v = { date: dateFr(new Date(rdv.debut)), tel: ou(rdv.telephone, '') };
  const l = blocLien(rdv, T.bouton_meet);
  return {
    genre: 'rappel', a: [rdv.email], repondre: notifie(env),
    sujet: gabarit(T.sujet, v),
    html: cadre(T.titre, para(htmlSur(gabarit(T.corps, v))) + l.html, env),
    texte: texteBrut([T.titre, gabarit(T.corps, v), l.texte]),
  };
}

export function mailAnnuleProspect(rdv: Rdv, env: Env): Courriel {
  const T = TEXTES.annule_prospect;
  const v = { date: dateFr(new Date(rdv.debut)) };
  const cible = site(env) + '/#appel';
  return {
    genre: 'annule_prospect', a: [rdv.email], repondre: notifie(env),
    sujet: gabarit(T.sujet, v),
    html: cadre(T.titre, para(htmlSur(gabarit(T.corps, v))) + bouton(T.bouton, cible), env),
    texte: texteBrut([T.titre, gabarit(T.corps, v), T.bouton + ' : ' + cible]),
  };
}

export function mailAnnulationAmaury(rdv: Rdv, env: Env): Courriel {
  const T = TEXTES.annulation_amaury;
  const v = { prenom: rdv.prenom, nom: rdv.nom, date: dateFr(new Date(rdv.debut)), club: rdv.club,
              ville: rdv.ville, email: rdv.email, telephone: ou(rdv.telephone, TEXTES.vide) };
  const [premiere, ...reste] = T.corps.split('\n');
  const lignes = lignesDe(reste.join('\n'), v);
  const titre = gabarit(T.titre, v);
  return {
    genre: 'annulation_amaury', a: [notifie(env)], repondre: rdv.email,
    sujet: gabarit(T.sujet, v),
    html: cadre(titre, para(htmlSur(gabarit(premiere, v))) + tableauHtml(lignes), env),
    texte: texteBrut([titre, gabarit(premiere, v) + '\n' + tableauTexte(lignes)]),
  };
}

// ------------------------------------------------------------ pour index.ts
// Les corps des requetes vers Resend et Google sont construits ici, pour etre
// testables ; `index.ts` ne fait que les envoyer avec `fetch`.

export function base64Utf8(t: string): string {
  const octets = ENCODEUR.encode(t);
  let bin = '';
  for (let i = 0; i < octets.length; i += 0x8000) {
    bin += String.fromCharCode(...octets.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

/** le JSON que l'API Resend attend (POST https://api.resend.com/emails) */
export function corpsResend(c: Courriel, expediteur = EXPEDITEUR): Record<string, unknown> {
  const corps: Record<string, unknown> = {
    from: expediteur, to: c.a, subject: c.sujet, html: c.html, text: c.texte,
  };
  if (c.repondre) corps.reply_to = c.repondre;
  if (c.pieces?.length) {
    corps.attachments = c.pieces.map((p) => ({ filename: p.nom, content: base64Utf8(p.contenu), content_type: p.type }));
  }
  return corps;
}

/** le JSON de `events.insert` (avec conferenceDataVersion=1 dans l'URL) */
export function corpsEvenementGoogle(e: EvenementAgenda, idRequete: string): Record<string, unknown> {
  const corps: Record<string, unknown> = {
    summary: e.resume,
    description: e.description,
    start: { dateTime: e.debut.toISOString(), timeZone: FUSEAU },
    end: { dateTime: e.fin.toISOString(), timeZone: FUSEAU },
    attendees: [{ email: e.invite }],
    reminders: { useDefault: true },
  };
  if (e.meet) {
    corps.conferenceData = { createRequest: { requestId: idRequete, conferenceSolutionKey: { type: 'hangoutsMeet' } } };
  }
  return corps;
}

/** le lien Meet dans la reponse de `events.insert`, ou null */
export function lienMeetDe(evenement: unknown): string | null {
  const e = evenement as { hangoutLink?: string; conferenceData?: { entryPoints?: Array<{ entryPointType?: string; uri?: string }> } };
  if (e?.hangoutLink) return e.hangoutLink;
  const video = e?.conferenceData?.entryPoints?.find((p) => p.entryPointType === 'video' && p.uri);
  return video?.uri || null;
}

/** les plages occupees dans la reponse de `freeBusy.query` */
export function occupesDe(reponse: unknown): Array<{ debut: Date; fin: Date }> {
  const r = reponse as { calendars?: Record<string, { busy?: Array<{ start: string; end: string }> }> };
  const sortie: Array<{ debut: Date; fin: Date }> = [];
  for (const cal of Object.values(r?.calendars || {})) {
    for (const b of cal.busy || []) sortie.push({ debut: new Date(b.start), fin: new Date(b.end) });
  }
  return sortie;
}

/** la description de l'evenement dans l'agenda d'Amaury (les sauts de ligne
    des precisions sont mis en retrait : ils ne font pas de fausses lignes) */
export function descriptionAgenda(rdv: Rdv): string {
  const l = [
    `${rdv.prenom} ${rdv.nom}`,
    `Club : ${rdv.club} (${rdv.ville})`,
    `Gérant : ${ou(rdv.situation, TEXTES.vide)}`,
    `Adhérents : ${ou(rdv.discipline, TEXTES.vide)}`,
    `Abonnement : ${ou(rdv.objectif, TEXTES.vide)}`,
    `Précisions : ${ou(rdv.projet, TEXTES.vide).replace(/\n/g, '\n    ')}`,
    `E-mail : ${rdv.email}`,
    `Téléphone : ${ou(rdv.telephone, TEXTES.vide)}`,
    `Format : ${libelleFormat(rdv)}`,
  ];
  return l.join('\n');
}

// ------------------------------------------------------------ le commun HTTP

export function origineAutorisee(origine: string | null): boolean {
  if (!origine) return false;
  if (ORIGINES_AUTORISEES.includes(origine)) return true;
  return /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/.test(origine);
}

export function enTetesCors(origine: string | null): Record<string, string> {
  const h: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
  if (origineAutorisee(origine)) h['Access-Control-Allow-Origin'] = origine as string;
  return h;
}

function json(corps: unknown, code: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(corps), {
    status: code,
    headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

/** la route, une fois retire tout ce qui precede `/rdv` (`/functions/v1/rdv/x` -> `/x`) */
export function cheminRdv(pathname: string): string {
  const i = pathname.search(/\/rdv(\/|$)/);
  const reste = i >= 0 ? pathname.slice(i + 4) : pathname;
  return (reste.replace(/\/+$/, '') || '/');
}

function messageDe(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  return m.slice(0, 300);
}

/** l'adresse du visiteur, telle que la passerelle la transmet.
    `cf-connecting-ip` d'abord : Cloudflare le pose lui-meme, un client ne
    peut pas le forger. Sinon la DERNIERE entree de `x-forwarded-for` : les
    passerelles AJOUTENT l'adresse qu'elles voient a la fin de l'en-tete sans
    toucher a ce que le client y a ecrit, donc la premiere entree est celle du
    client lui-meme (forgeable a volonte, ce qui annulerait la limite par
    adresse) et la derniere celle que la passerelle de confiance a vue. */
export function ipDe(req: Request): string | null {
  const cf = (req.headers.get('cf-connecting-ip') || '').trim();
  if (cf) return cf;
  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    const parts = xff.split(',').map((p) => p.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1];
  }
  return (req.headers.get('x-real-ip') || '').trim() || null;
}

/** le sel du hash d'adresse : RDV_SEL_IP, a defaut RDV_CRON_SECRET ; null sans l'un ni l'autre */
export function selIp(env: Env): string | null {
  return (env.RDV_SEL_IP || env.RDV_CRON_SECRET || '').trim() || null;
}

/** SHA-256 du sel et de l'adresse : la base ne garde jamais l'adresse elle-meme.
    Sans sel, on ne hache pas (null) : un SHA-256 d'une IPv4 nue se retrouve
    par force brute sur quatre milliards d'essais, ce ne serait pas une
    pseudonymisation. La limite par adresse est alors inactive, et le journal
    le dit. */
export async function hacheIp(ip: string, env: Env): Promise<string | null> {
  const sel = selIp(env);
  if (!sel) return null;
  const octets = ENCODEUR.encode(sel + '|' + ip.trim().toLowerCase());
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', octets));
  return Array.from(h, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** comparaison en temps constant, pour le secret du cron */
export function egalConstant(a: string, b: string): boolean {
  const x = ENCODEUR.encode(a), y = ENCODEUR.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/* Une adresse qu'on peut ecrire telle quelle dans `mailto:` du .ics, dans
   `to`/`reply_to` de Resend et dans `attendees` de Google : partie locale
   faite des caracteres « atext » de la RFC 5322 (donc ni guillemet, ni
   parenthese, ni `< > [ ] ; : , \`), un domaine en lettres, chiffres, tirets
   et points, et au moins deux lettres apres le dernier point. */
const EMAIL = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,}$/;

// ------------------------------------------------------------ la validation

const BORNES: Record<string, number> = {
  prenom: 80, nom: 80, email: 254, telephone: 40, club: 200, ville: 120,
  discipline: 120, situation: 160, objectif: 160, projet: 2000,
};
const OBLIGATOIRES = ['prenom', 'nom', 'email', 'club', 'ville', 'discipline', 'situation', 'objectif'] as const;

export interface Demande {
  debut: Date; prenom: string; nom: string; email: string; telephone: string | null;
  format: Format; club: string; ville: string; discipline: string; situation: string;
  objectif: string; projet: string | null; source: Record<string, string> | null;
}

type Refus = { erreur: 'champ_manquant'; champ: string } | { erreur: 'champ_trop_long'; champ: string }
  | { erreur: 'email_invalide' } | { erreur: 'format_invalide' } | { erreur: 'format_indisponible' };

/** un champ sur une ligne : les caracteres de controle (sauts de ligne,
    tabulations, NUL...) deviennent une espace, puis on rogne. Un `\n` glisse
    dans un prenom ne peut ainsi ni couper un sujet d'e-mail ni fabriquer une
    ligne de plus dans le mail d'Amaury. */
function texte(v: unknown): string {
  return typeof v === 'string' ? v.replace(/[\x00-\x1f\x7f]+/g, ' ').replace(/ {2,}/g, ' ').trim() : '';
}

/** le seul champ a plusieurs lignes (`projet`) : les fins de ligne sont
    ramenees a `\n`, les autres caracteres de controle a une espace, et pas
    plus d'une ligne vide d'affilee */
function texteMultiligne(v: unknown): string {
  if (typeof v !== 'string') return '';
  return v.replace(/\r\n?/g, '\n').replace(/[\x00-\x09\x0b\x0c\x0e-\x1f\x7f]+/g, ' ')
    .split('\n').map((l) => l.replace(/ {2,}/g, ' ').trim()).join('\n')
    .replace(/\n{3,}/g, '\n\n').trim();
}

/** lit et verifie le corps de POST /reserver ; rend la demande, ou le refus */
export function valide(corps: Record<string, unknown>, meetDisponible: boolean): Demande | Refus {
  const debut = typeof corps.debut === 'string' ? new Date(corps.debut) : null;
  if (!debut || isNaN(debut.getTime())) return { erreur: 'champ_manquant', champ: 'debut' };

  const champs: Record<string, string> = {};
  for (const nom of OBLIGATOIRES) {
    const v = texte(corps[nom]);
    if (!v) return { erreur: 'champ_manquant', champ: nom };
    if (v.length > BORNES[nom]) return { erreur: 'champ_trop_long', champ: nom };
    champs[nom] = v;
  }
  if (!EMAIL.test(champs.email)) return { erreur: 'email_invalide' };

  const format = texte(corps.format);
  if (!format) return { erreur: 'champ_manquant', champ: 'format' };
  if (format !== 'meet' && format !== 'telephone') return { erreur: 'format_invalide' };
  if (format === 'meet' && !meetDisponible) return { erreur: 'format_indisponible' };

  const telephone = texte(corps.telephone);
  if (format === 'telephone' && !telephone) return { erreur: 'champ_manquant', champ: 'telephone' };
  if (telephone.length > BORNES.telephone) return { erreur: 'champ_trop_long', champ: 'telephone' };

  const projet = texteMultiligne(corps.projet);
  if (projet.length > BORNES.projet) return { erreur: 'champ_trop_long', champ: 'projet' };

  let source: Record<string, string> | null = null;
  if (corps.source && typeof corps.source === 'object') {
    const s = corps.source as Record<string, unknown>;
    for (const k of ['utm_source', 'utm_campaign', 'utm_content']) {
      const v = texte(s[k]).slice(0, 120);
      if (v) (source ??= {})[k] = v;
    }
  }

  return {
    debut, prenom: champs.prenom, nom: champs.nom, email: champs.email.toLowerCase(),
    telephone: telephone || null, format, club: champs.club, ville: champs.ville,
    discipline: champs.discipline, situation: champs.situation, objectif: champs.objectif,
    projet: projet || null, source,
  };
}

// ------------------------------------------------------------ les routes

async function envoieSansCasser(deps: Deps, c: Courriel): Promise<boolean> {
  try {
    await deps.mail.envoie(c);
    return true;
  } catch (e) {
    /* un courrier rate ne defait pas une reservation : on le note, c'est tout */
    deps.journal?.('erreur', 'envoi e-mail en echec', { genre: c.genre, message: messageDe(e) });
    return false;
  }
}

async function disponibilites(deps: Deps, maintenant: Date, cors: Record<string, string>): Promise<Response> {
  const creneaux = await creneauxLibres(deps, maintenant);
  return json({
    creneaux: creneaux.map((c) => c.toISOString()),
    duree_min: DUREE_MIN,
    meet: !!deps.google,
    fuseau: FUSEAU,
  }, 200, cors);
}

async function reserver(req: Request, env: Env, deps: Deps, maintenant: Date, cors: Record<string, string>): Promise<Response> {
  const corps = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!corps || typeof corps !== 'object' || Array.isArray(corps)) {
    return json({ erreur: 'champ_manquant', champ: 'corps' }, 400, cors);
  }

  /* le champ piege : un humain ne le voit pas, un robot le remplit. On repond
     comme si tout allait bien, et il ne se passe rien. */
  if (texte(corps.site_web)) {
    const d = typeof corps.debut === 'string' && !isNaN(Date.parse(corps.debut)) ? new Date(corps.debut) : maintenant;
    deps.journal?.('info', 'pot de miel rempli');
    return json({ id: crypto.randomUUID(), debut: d.toISOString(),
                  fin: new Date(d.getTime() + DUREE_MIN * 60e3).toISOString(), lien_meet: null }, 201, cors);
  }

  const v = valide(corps, !!deps.google);
  if ('erreur' in v) return json(v, 400, cors);

  /* les limites : 3 par e-mail, 10 par adresse (hachee), sur 24 h */
  const ip = ipDe(req);
  const ipHash = ip ? await hacheIp(ip, env) : null;
  if (ip && !ipHash) deps.journal?.('alerte', 'sans RDV_SEL_IP ni RDV_CRON_SECRET : adresse non hachee, limite par adresse inactive');
  const depuis = new Date(maintenant.getTime() - FENETRE_LIMITE_H * 3600e3);
  const n = await deps.base.compteRecents(v.email, ipHash, depuis);
  if (n.parEmail >= LIMITE_PAR_EMAIL || (ipHash && n.parIp >= LIMITE_PAR_IP)) {
    deps.journal?.('alerte', 'limite atteinte', { parEmail: n.parEmail, parIp: n.parIp });
    return json({ erreur: 'trop_de_demandes' }, 429, cors);
  }

  /* le creneau doit etre dans la liste qu'on aurait proposee a cet instant */
  const libres = await creneauxLibres(deps, maintenant);
  if (!libres.some((c) => c.getTime() === v.debut.getTime())) {
    return json({ erreur: 'creneau_pris' }, 409, cors);
  }

  const fin = new Date(v.debut.getTime() + DUREE_MIN * 60e3);
  let rdv: Rdv;
  try {
    rdv = await deps.base.creer({
      id: crypto.randomUUID(), cree_le: maintenant.toISOString(),
      debut: v.debut.toISOString(), fin: fin.toISOString(),
      prenom: v.prenom, nom: v.nom, email: v.email, telephone: v.telephone, format: v.format,
      club: v.club, ville: v.ville, discipline: v.discipline, situation: v.situation,
      objectif: v.objectif, projet: v.projet, source: v.source,
      statut: 'confirme', token_annulation: crypto.randomUUID(), ip_hash: ipHash,
    });
  } catch (e) {
    /* deux visiteurs sur le meme creneau a la meme seconde : la contrainte
       d'unicite tranche, et le second repart choisir */
    if (e instanceof ErreurDoublon || (e as { name?: string })?.name === 'ErreurDoublon') {
      return json({ erreur: 'creneau_pris' }, 409, cors);
    }
    throw e;
  }

  /* l'agenda Google : un echec ne defait rien, la reservation est prise.
     Le mail au prospect dit qu'on lui enverra le lien ; celui d'Amaury le
     previent qu'il doit le faire a la main. */
  let meetAbsent = false;
  if (deps.google) {
    let ev: { id: string; lien_meet: string | null } | null = null;
    try {
      ev = await deps.google.creeEvenement({
        debut: v.debut, fin, resume: TEXTES.ics.resume,
        description: descriptionAgenda(rdv), invite: rdv.email, meet: v.format === 'meet',
      });
    } catch (e) {
      deps.journal?.('erreur', 'google evenement en echec', { id: rdv.id, message: messageDe(e) });
    }
    if (ev) {
      rdv = { ...rdv, evenement_google: ev.id, lien_meet: ev.lien_meet || null };
      /* l'evenement existe et son lien Meet marche : les deux e-mails le
         donnent, meme si la base refuse de le noter. On garde l'identifiant
         au journal pour retrouver l'evenement a la main (il ne sera pas
         supprime a l'annulation). */
      try {
        await deps.base.majGoogle(rdv.id, { evenement_google: rdv.evenement_google, lien_meet: rdv.lien_meet });
      } catch (e) {
        deps.journal?.('erreur', 'google maj en base en echec', { id: rdv.id, evenement: ev.id, message: messageDe(e) });
      }
    }
    if (v.format === 'meet' && !rdv.lien_meet) meetAbsent = true;
  }

  await envoieSansCasser(deps, mailConfirmation(rdv, env, maintenant));
  await envoieSansCasser(deps, mailNouvelleResa(rdv, env, meetAbsent));
  deps.journal?.('info', 'reservation', { id: rdv.id, debut: rdv.debut, format: rdv.format, meet: !!rdv.lien_meet });

  return json({ id: rdv.id, debut: rdv.debut, fin: rdv.fin, lien_meet: rdv.lien_meet }, 201, cors);
}

async function annuler(req: Request, env: Env, deps: Deps, maintenant: Date, cors: Record<string, string>): Promise<Response> {
  let token: unknown;
  if (req.method === 'GET') {
    token = new URL(req.url).searchParams.get('token');
  } else {
    const corps = await req.json().catch(() => null) as Record<string, unknown> | null;
    token = corps && typeof corps === 'object' ? corps.token : null;
  }
  if (typeof token !== 'string' || !UUID.test(token.trim())) return json({ erreur: 'inconnu' }, 404, cors);

  const rdv = await deps.base.parToken(token.trim().toLowerCase());
  if (!rdv) return json({ erreur: 'inconnu' }, 404, cors);
  /* deja annule (ou deja passe et pointe) : on repond oui, sans rien refaire */
  if (rdv.statut !== 'confirme') return json({ ok: true, deja: true, debut: rdv.debut }, 200, cors);

  const maj = await deps.base.marqueAnnule(rdv.id, maintenant);
  if (!maj) return json({ ok: true, deja: true, debut: rdv.debut }, 200, cors);

  if (deps.google && maj.evenement_google) {
    try {
      await deps.google.supprimeEvenement(maj.evenement_google);
    } catch (e) {
      deps.journal?.('erreur', 'google suppression en echec', { id: maj.id, message: messageDe(e) });
    }
  }
  await envoieSansCasser(deps, mailAnnuleProspect(maj, env));
  await envoieSansCasser(deps, mailAnnulationAmaury(maj, env));
  deps.journal?.('info', 'annulation', { id: maj.id, debut: maj.debut });

  return json({ ok: true, debut: maj.debut }, 200, cors);
}

async function rappels(req: Request, env: Env, deps: Deps, maintenant: Date, cors: Record<string, string>): Promise<Response> {
  const secret = env.RDV_CRON_SECRET || '';
  const fourni = req.headers.get('x-cron-secret') || '';
  if (!secret || !egalConstant(fourni, secret)) return json({ erreur: 'non_autorise' }, 401, cors);

  const dansUneHeure = new Date(maintenant.getTime() + 60 * 60e3);
  const liste = await deps.base.aRappeler(maintenant, dansUneHeure);
  let envoyes = 0;
  for (const rdv of liste) {
    const debut = new Date(rdv.debut).getTime();
    if (debut <= maintenant.getTime() || debut > dansUneHeure.getTime() || rdv.statut !== 'confirme') continue;
    /* on marque d'abord, on envoie ensuite : deux crons qui se chevauchent ne
       peuvent pas envoyer deux fois. Si l'envoi rate, on libere pour le
       prochain passage. */
    if (!await deps.base.marqueRappel(rdv.id, maintenant)) continue;
    const parti = await envoieSansCasser(deps, mailRappel(rdv, env));
    if (parti) envoyes++;
    else await deps.base.libereRappel(rdv.id).catch(() => undefined);
  }
  if (envoyes) deps.journal?.('info', 'rappels envoyes', { envoyes });
  return json({ envoyes }, 200, cors);
}

// ------------------------------------------------------------ l'entree

export async function traite(req: Request, env: Env, deps: Deps): Promise<Response> {
  const cors = enTetesCors(req.headers.get('origin'));
  const chemin = cheminRdv(new URL(req.url).pathname);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

  const maintenant = deps.maintenant ? deps.maintenant() : new Date();
  try {
    switch (chemin) {
      case '/disponibilites':
        if (req.method !== 'GET') return json({ erreur: 'methode' }, 405, cors);
        return await disponibilites(deps, maintenant, cors);
      case '/reserver':
        if (req.method !== 'POST') return json({ erreur: 'methode' }, 405, cors);
        return await reserver(req, env, deps, maintenant, cors);
      case '/annuler':
        if (req.method !== 'POST' && req.method !== 'GET') return json({ erreur: 'methode' }, 405, cors);
        return await annuler(req, env, deps, maintenant, cors);
      case '/rappels':
        if (req.method !== 'POST') return json({ erreur: 'methode' }, 405, cors);
        return await rappels(req, env, deps, maintenant, cors);
      default:
        return json({ erreur: 'route_inconnue' }, 404, cors);
    }
  } catch (e) {
    /* le detail va au journal (sans donnee personnelle), jamais au visiteur */
    deps.journal?.('erreur', 'serveur', { chemin, message: messageDe(e) });
    return json({ erreur: 'serveur' }, 500, cors);
  }
}
